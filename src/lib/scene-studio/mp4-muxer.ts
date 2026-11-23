/**
 * Minimal MP4 (ISO base media file format) writer: one H.264 video track and an optional AAC audio
 * track, assembled in memory. Pure TypeScript, no third-party code, no DOM types.
 *
 * Deliberate limits:
 * - No B-frames. The encoder runs without them, so decode order equals presentation order and no
 *   `ctts` box is needed. A chunk whose timestamp is not later than the previous one is rejected
 *   with an error instead of being mis-timed.
 * - Video samples are AVCC: NAL units, each prefixed by a 4-byte big-endian length. SPS and PPS
 *   live in avcC, not in the samples. This is what WebCodecs produces with `avc: { format: "avc" }`.
 * - Each track starts at timestamp 0. (`stts` cannot start later without an edit list.)
 * - Output is deterministic. Creation and modification times are written as 0 instead of the wall
 *   clock, so identical input always gives byte-identical files.
 */

export interface VideoTrackConfig {
  codec: "avc";
  width: number;
  height: number;
  /** AVCDecoderConfigurationRecord (what WebCodecs calls `description`). A whole `avcC` box is accepted too. */
  avcC: Uint8Array;
}
export interface AudioTrackConfig {
  codec: "aac";
  sampleRate: number;
  channels: number;
  /** AudioSpecificConfig bytes (what WebCodecs calls `description` for AAC). */
  audioSpecificConfig: Uint8Array;
}
export interface ChunkInfo {
  data: Uint8Array;
  timestampUs: number;
  durationUs: number;
  isKey: boolean;
}
export interface Mp4MuxerOptions {
  video: VideoTrackConfig;
  audio?: AudioTrackConfig;
  /** Put the moov box before the media data so playback can start while downloading. Default true. */
  fastStart?: boolean;
  /**
   * Force 64-bit chunk offsets (co64) and a 64-bit mdat size even for small files. Files over 4 GB
   * switch to them automatically; this flag exists so that path can be verified with a tiny file.
   */
  wide?: boolean;
}

const MICROS = 1_000_000;
/** mvhd and tkhd durations are in milliseconds. */
const MOVIE_TIMESCALE = 1000;
/** Gives exact whole-tick frame durations for 24, 25, 30, 50 and 60 fps. */
const VIDEO_TIMESCALE = 90_000;
/** Samples of one track are grouped into chunks this long, then the chunks of all tracks are interleaved by time. */
const CHUNK_US = 500_000;
const MAX_U32 = 0xffff_ffff;

interface Sample {
  data: Uint8Array;
  timestampUs: number;
  durationUs: number;
  isKey: boolean;
}
interface Track {
  kind: "video" | "audio";
  timescale: number;
  /** The avc1 or mp4a sample entry box. */
  sampleEntry: Uint8Array;
  width: number;
  height: number;
  samples: Sample[];
}
interface ChunkPlan {
  track: number;
  first: number;
  count: number;
  startUs: number;
  bytes: number;
}

// ---- byte helpers ----------------------------------------------------------------------------

function concat(parts: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Big-endian unsigned integers of 1, 2 or 4 bytes. Out-of-range values throw rather than wrap. */
function ints(width: 1 | 2 | 4, values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * width);
  const view = new DataView(out.buffer);
  const max = 2 ** (8 * width) - 1;
  values.forEach((v, i) => {
    if (!Number.isInteger(v) || v < 0 || v > max) {
      throw new Error(`Internal error: ${v} does not fit in ${width} byte(s). The video may be too long for MP4 to describe.`);
    }
    if (width === 1) view.setUint8(i, v);
    else if (width === 2) view.setUint16(i * 2, v);
    else view.setUint32(i * 4, v);
  });
  return out;
}
const u8 = (...v: number[]) => ints(1, v);
const u16 = (...v: number[]) => ints(2, v);
const u32 = (...v: number[]) => ints(4, v);
const u64 = (n: number) => u32(Math.floor(n / 2 ** 32), n % 2 ** 32);
const zeros = (n: number) => new Uint8Array(n);
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const viewOf = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

function box(type: string, ...children: Uint8Array[]): Uint8Array {
  const body = concat(children);
  return concat([u32(body.length + 8), ascii(type), body]);
}
/** A box that starts with a version byte and 24 flag bits. */
function fullBox(type: string, version: number, flags: number, ...children: Uint8Array[]): Uint8Array {
  return box(type, u32(((version << 24) | flags) >>> 0), ...children);
}
/** MPEG-4 descriptor: a tag, then a length written 7 bits per byte (high bit set on all but the last). */
function descriptor(tag: number, ...children: Uint8Array[]): Uint8Array {
  const body = concat(children);
  const length = [body.length & 0x7f];
  for (let n = body.length >> 7; n > 0; n >>= 7) length.unshift((n & 0x7f) | 0x80);
  return concat([u8(tag, ...length), body]);
}

const UNITY_MATRIX = u32(0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000);

// ---- input validation ------------------------------------------------------------------------

const isDimension = (n: number) => Number.isInteger(n) && n >= 1 && n <= 0xffff;

function avcRecord(avcC: Uint8Array): Uint8Array {
  if (!(avcC instanceof Uint8Array)) throw new Error("The H.264 configuration (avcC) must be a Uint8Array.");
  const isBox = avcC.length > 8 && viewOf(avcC).getUint32(0) === avcC.length && String.fromCharCode(...avcC.subarray(4, 8)) === "avcC";
  const record = isBox ? avcC.subarray(8) : avcC;
  if (record.length < 7 || record[0] !== 1) {
    throw new Error("The H.264 configuration (avcC) is not valid: it must start with version 1 and include the SPS and PPS.");
  }
  if ((record[4] & 3) !== 3) {
    throw new Error("The H.264 stream does not use 4-byte NAL unit lengths. Configure the encoder for AVCC output.");
  }
  return record;
}

/** True when the sample is a chain of 4-byte-length-prefixed NAL units that ends exactly at its last byte. */
function isAvcc(data: Uint8Array): boolean {
  const view = viewOf(data);
  let at = 0;
  while (at + 4 <= data.length) at += 4 + view.getUint32(at);
  return at === data.length;
}

function videoTrack(v: VideoTrackConfig): Track {
  if (!v || v.codec !== "avc") throw new Error('Only H.264 video is supported: set the video codec to "avc".');
  if (!isDimension(v.width) || !isDimension(v.height)) {
    throw new Error(`The video size ${v.width} x ${v.height} is not valid. Width and height must be whole numbers from 1 to 65535.`);
  }
  const sampleEntry = box(
    "avc1",
    zeros(6),
    u16(1), // data reference index
    zeros(16), // pre_defined, reserved, pre_defined
    u16(v.width, v.height),
    u32(0x00480000, 0x00480000), // 72 dpi
    u32(0),
    u16(1), // frames per sample
    zeros(32), // compressor name
    u16(0x0018, 0xffff), // depth 24, pre_defined -1
    box("avcC", avcRecord(v.avcC)),
  );
  return { kind: "video", timescale: VIDEO_TIMESCALE, sampleEntry, width: v.width, height: v.height, samples: [] };
}

function audioTrack(a: AudioTrackConfig): Track {
  if (a.codec !== "aac") throw new Error('Only AAC audio is supported: set the audio codec to "aac".');
  if (!Number.isInteger(a.sampleRate) || a.sampleRate < 8000 || a.sampleRate > 96000) {
    throw new Error(`The audio sample rate ${a.sampleRate} Hz is not valid. Use a whole number from 8000 to 96000.`);
  }
  if (!Number.isInteger(a.channels) || a.channels < 1 || a.channels > 8) {
    throw new Error(`The audio channel count ${a.channels} is not valid. Use a whole number from 1 to 8.`);
  }
  if (!(a.audioSpecificConfig instanceof Uint8Array) || a.audioSpecificConfig.length < 2) {
    throw new Error("The AAC configuration (AudioSpecificConfig) is missing or too short.");
  }
  const esDescriptor = descriptor(
    0x03,
    u16(0), // ES_ID
    u8(0), // no stream dependence, URL or OCR
    descriptor(
      0x04,
      u8(0x40), // MPEG-4 audio
      u8(0x15), // stream type 5 (audio), reserved bit set
      zeros(3), // buffer size: 0 = unknown
      u32(0, 0), // max and average bitrate: 0 = unknown
      descriptor(0x05, a.audioSpecificConfig),
    ),
    descriptor(0x06, u8(2)), // SLConfig: MP4 file
  );
  const sampleEntry = box(
    "mp4a",
    zeros(6),
    u16(1), // data reference index
    zeros(8),
    u16(a.channels, 16, 0, 0), // channels, sample size, pre_defined, reserved
    // 16.16 fixed point holds up to 65535 Hz; higher rates are read from the AudioSpecificConfig and the track timescale.
    u32(a.sampleRate > 0xffff ? 0 : a.sampleRate * 65536),
    fullBox("esds", 0, 0, esDescriptor),
  );
  return { kind: "audio", timescale: a.sampleRate, sampleEntry, width: 0, height: 0, samples: [] };
}

// ---- sample tables ---------------------------------------------------------------------------

/** Decode time deltas (run-length encoded as [count, delta, ...]) and total length in track ticks. */
function timing(track: Track): { runs: number[]; ticks: number } {
  const { samples, timescale, kind } = track;
  const toTicks = (us: number) => Math.round((us * timescale) / MICROS);
  // Rounding absolute times (not durations) keeps every sample on its true time with no drift.
  const dts = samples.map((s) => toTicks(s.timestampUs));
  const deltas: number[] = [];
  for (let i = 1; i < dts.length; i++) deltas.push(dts[i] - dts[i - 1]);
  const last = samples[samples.length - 1];
  const lastDelta = last.durationUs > 0 ? Math.max(1, toTicks(last.durationUs)) : deltas[deltas.length - 1];
  if (lastDelta === undefined) throw new Error(`The only ${kind} sample has no duration, so its length cannot be known.`);
  deltas.push(lastDelta);
  const tooClose = deltas.findIndex((d) => d < 1);
  if (tooClose >= 0) throw new Error(`${kind} samples ${tooClose + 1} and ${tooClose + 2} are less than one clock tick apart.`);
  const runs: number[] = [];
  let ticks = 0;
  for (const d of deltas) {
    ticks += d;
    if (runs.length > 0 && runs[runs.length - 1] === d) runs[runs.length - 2]++;
    else runs.push(1, d);
  }
  return { runs, ticks };
}

/** Group each track's samples into ~0.5 s chunks and order all chunks by start time (video first on ties). */
function planChunks(tracks: Track[]): ChunkPlan[] {
  const plan: ChunkPlan[] = [];
  tracks.forEach((t, track) => {
    let first = 0;
    let bytes = 0;
    for (let i = 0; i < t.samples.length; i++) {
      bytes += t.samples[i].data.length;
      const next = t.samples[i + 1];
      if (!next || next.timestampUs - t.samples[first].timestampUs >= CHUNK_US) {
        plan.push({ track, first, count: i + 1 - first, startUs: t.samples[first].timestampUs, bytes });
        first = i + 1;
        bytes = 0;
      }
    }
  });
  return plan.sort((a, b) => a.startUs - b.startUs || a.track - b.track);
}

interface TrackLayout {
  track: Track;
  runs: number[];
  ticks: number;
  samplesPerChunk: number[];
  /** Offset of each chunk from the first byte of mdat payload. */
  chunkOffsets: number[];
}

function trak(id: number, l: TrackLayout, dataStart: number, wide: boolean): Uint8Array {
  const { track } = l;
  const isVideo = track.kind === "video";
  const movieDuration = Math.round((l.ticks * MOVIE_TIMESCALE) / track.timescale);

  const stsc: number[] = []; // [first chunk (1-based), samples per chunk, sample description index]
  l.samplesPerChunk.forEach((n, i) => {
    if (stsc.length === 0 || stsc[stsc.length - 2] !== n) stsc.push(i + 1, n, 1);
  });
  const absolute = l.chunkOffsets.map((o) => dataStart + o);
  const keyNumbers = track.samples.flatMap((s, i) => (s.isKey ? [i + 1] : []));

  const stbl = box(
    "stbl",
    fullBox("stsd", 0, 0, u32(1), track.sampleEntry),
    fullBox("stts", 0, 0, u32(l.runs.length / 2), u32(...l.runs)),
    ...(isVideo ? [fullBox("stss", 0, 0, u32(keyNumbers.length), u32(...keyNumbers))] : []),
    fullBox("stsc", 0, 0, u32(stsc.length / 3), u32(...stsc)),
    fullBox("stsz", 0, 0, u32(0, track.samples.length), u32(...track.samples.map((s) => s.data.length))),
    wide
      ? fullBox("co64", 0, 0, u32(absolute.length), ...absolute.map(u64))
      : fullBox("stco", 0, 0, u32(absolute.length), u32(...absolute)),
  );

  return box(
    "trak",
    fullBox(
      "tkhd",
      0,
      3, // enabled, in movie
      u32(0, 0, id, 0, movieDuration),
      zeros(8),
      u16(0, 0, isVideo ? 0 : 0x0100, 0), // layer, alternate group, volume, reserved
      UNITY_MATRIX,
      u32(track.width * 65536, track.height * 65536),
    ),
    box(
      "mdia",
      fullBox("mdhd", 0, 0, u32(0, 0, track.timescale, l.ticks), u16(0x55c4, 0)), // language "und"
      fullBox("hdlr", 0, 0, u32(0), ascii(isVideo ? "vide" : "soun"), zeros(12), ascii(isVideo ? "VideoHandler\0" : "SoundHandler\0")),
      box(
        "minf",
        isVideo ? fullBox("vmhd", 0, 1, zeros(8)) : fullBox("smhd", 0, 0, zeros(4)),
        box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1))), // media data is in this file
        stbl,
      ),
    ),
  );
}

function moov(layouts: TrackLayout[], dataStart: number, wide: boolean): Uint8Array {
  const duration = Math.max(...layouts.map((l) => Math.round((l.ticks * MOVIE_TIMESCALE) / l.track.timescale)));
  return box(
    "moov",
    fullBox(
      "mvhd",
      0,
      0,
      u32(0, 0, MOVIE_TIMESCALE, duration, 0x00010000), // times, timescale, duration, rate 1.0
      u16(0x0100, 0), // volume 1.0, reserved
      zeros(8),
      UNITY_MATRIX,
      zeros(24),
      u32(layouts.length + 1), // next track id
    ),
    ...layouts.map((l, i) => trak(i + 1, l, dataStart, wide)),
  );
}

// ---- muxer -----------------------------------------------------------------------------------

export class Mp4Muxer {
  private readonly video: Track;
  private readonly audio: Track | null;
  private readonly fastStart: boolean;
  private readonly wide: boolean;
  private finished = false;

  constructor(opts: Mp4MuxerOptions) {
    this.video = videoTrack(opts.video);
    this.audio = opts.audio ? audioTrack(opts.audio) : null;
    this.fastStart = opts.fastStart !== false;
    this.wide = opts.wide === true;
  }

  addVideoChunk(c: ChunkInfo): void {
    this.add(this.video, c);
  }

  addAudioChunk(c: ChunkInfo): void {
    if (!this.audio) throw new Error("This file was set up without an audio track, so audio cannot be added.");
    this.add(this.audio, c);
  }

  private add(track: Track, c: ChunkInfo): void {
    const isVideo = track.kind === "video";
    const label = `${isVideo ? "Video frame" : "Audio frame"} ${track.samples.length + 1}`;
    if (this.finished) throw new Error("This file is already finished. Create a new Mp4Muxer to start another one.");
    if (!(c.data instanceof Uint8Array) || c.data.length === 0) throw new Error(`${label} has no data.`);
    if (!Number.isFinite(c.timestampUs) || c.timestampUs < 0) throw new Error(`${label} has an invalid time (${c.timestampUs} microseconds).`);
    if (!Number.isFinite(c.durationUs) || c.durationUs < 0) throw new Error(`${label} has an invalid duration (${c.durationUs} microseconds).`);
    const previous = track.samples[track.samples.length - 1];
    if (!previous) {
      if (c.timestampUs !== 0) throw new Error(`${label} must be at time 0, but it is at ${c.timestampUs} microseconds.`);
      if (isVideo && !c.isKey) throw new Error("The first video frame must be a key frame, or the video cannot be played from the start.");
    } else if (c.timestampUs <= previous.timestampUs) {
      throw new Error(
        `${label} is at ${c.timestampUs} microseconds, which is not later than the one before it (${previous.timestampUs}). ` +
          "Frames must be added in playing order, each at a later time." +
          (isVideo ? " Frames stored out of order (B-frames) are not supported." : ""),
      );
    }
    if (isVideo && !isAvcc(c.data)) {
      throw new Error(`${label} is not AVCC H.264 (NAL units each starting with a 4-byte length). Annex B start codes are not accepted.`);
    }
    track.samples.push({ data: c.data, timestampUs: c.timestampUs, durationUs: c.durationUs, isKey: c.isKey });
  }

  /** Builds the file. The muxer keeps references to the chunk buffers until now, so do not reuse them. */
  finish(): Uint8Array {
    if (this.finished) throw new Error("This file is already finished. Create a new Mp4Muxer to start another one.");
    if (this.video.samples.length === 0) throw new Error("There are no video frames to write.");
    if (this.audio && this.audio.samples.length === 0) throw new Error("The audio track was set up but no audio frames were added.");
    this.finished = true;

    const tracks = this.audio ? [this.video, this.audio] : [this.video];
    const plan = planChunks(tracks);
    const layouts: TrackLayout[] = tracks.map((track) => ({ track, ...timing(track), samplesPerChunk: [], chunkOffsets: [] }));
    let payload = 0;
    for (const c of plan) {
      layouts[c.track].samplesPerChunk.push(c.count);
      layouts[c.track].chunkOffsets.push(payload);
      payload += c.bytes;
    }

    const ftyp = box("ftyp", ascii("isom"), u32(512), ascii("isom"), ascii("iso2"), ascii("avc1"), ascii("mp41"));
    // The size of moov depends only on whether offsets are 32 or 64 bit, never on their values, so it can be measured first.
    const place = (wide: boolean) => {
      const moovLength = moov(layouts, 0, wide).length;
      const mdatHeader = wide ? 16 : 8;
      return { dataStart: ftyp.length + (this.fastStart ? moovLength : 0) + mdatHeader, mdatHeader };
    };
    let wide = this.wide;
    let at = place(wide);
    if (!wide && at.dataStart + payload > MAX_U32) {
      wide = true;
      at = place(wide);
    }
    const moovBox = moov(layouts, at.dataStart, wide);
    // A 64-bit mdat is a size field of 1 followed by the real size after the type.
    const mdatHeader = wide ? concat([u32(1), ascii("mdat"), u64(payload + 16)]) : concat([u32(payload + 8), ascii("mdat")]);

    const out = new Uint8Array(ftyp.length + moovBox.length + mdatHeader.length + payload);
    let pos = 0;
    const put = (b: Uint8Array) => {
      out.set(b, pos);
      pos += b.length;
    };
    put(ftyp);
    if (this.fastStart) put(moovBox);
    put(mdatHeader);
    for (const c of plan) {
      const samples = tracks[c.track].samples;
      for (let i = c.first; i < c.first + c.count; i++) put(samples[i].data);
    }
    if (!this.fastStart) put(moovBox);
    return out;
  }
}
