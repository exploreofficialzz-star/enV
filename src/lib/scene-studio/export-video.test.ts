import test from "node:test";
import assert from "node:assert/strict";
import { avcCodecString, bitrateFor, checkExportSupport, exportMp4, makeWebCodecsAdapters } from "./export-video.ts";
import type { AudioEncoderAdapter, ChunkInfo, FrameSource, VideoEncoderAdapter } from "./export-video.ts";
import { decodeErrors, hasFfmpeg, makeAac, makeH264, probe } from "./test-media.ts";
import type { AacClip, H264Clip } from "./test-media.ts";

const skip = !hasFfmpeg;

// ---- small pure helpers ----------------------------------------------------------------------

test("bitrateFor grows with quality and size, and stays inside its limits", () => {
  const low = bitrateFor("low", 1280, 720, 30);
  const medium = bitrateFor("medium", 1280, 720, 30);
  const high = bitrateFor("high", 1280, 720, 30);
  assert.ok(low < medium && medium < high, `${low} ${medium} ${high}`);
  assert.ok(bitrateFor("medium", 1920, 1080, 30) > medium);
  assert.equal(bitrateFor("low", 64, 64, 1), 500_000);
  assert.equal(bitrateFor("high", 4096, 4096, 60), 40_000_000);
  assert.ok(Number.isInteger(medium));
});

test("avcCodecString picks the smallest H.264 level that fits", () => {
  assert.equal(avcCodecString(1280, 720, 30), "avc1.64001f"); // level 3.1
  assert.equal(avcCodecString(1920, 1080, 30), "avc1.640028"); // level 4.0
  assert.equal(avcCodecString(1920, 1080, 60), "avc1.64002a"); // level 4.2
  assert.equal(avcCodecString(3840, 2160, 30), "avc1.640033"); // level 5.1
  assert.equal(avcCodecString(4096, 2304, 60), "avc1.640034"); // level 5.2
  assert.match(avcCodecString(320, 240, 24), /^avc1\.6400[0-9a-f]{2}$/);
});

test("checkExportSupport explains each problem in plain words", () => {
  const good = { hasVideoEncoder: true, hasAudioEncoder: true, h264Supported: true as boolean | null, width: 1280, height: 720, frameCount: 90 };
  assert.deepEqual(checkExportSupport(good), { ok: true });
  assert.equal(checkExportSupport({ ...good, h264Supported: null }).ok, true);

  const noEncoder = checkExportSupport({ ...good, hasVideoEncoder: false });
  assert.equal(noEncoder.ok, false);
  assert.match(noEncoder.reason!, /cannot make videos/);

  const noH264 = checkExportSupport({ ...good, h264Supported: false });
  assert.equal(noH264.ok, false);
  assert.match(noH264.reason!, /H\.264/);

  assert.match(checkExportSupport({ ...good, width: 1281 }).reason!, /even numbers/);
  assert.match(checkExportSupport({ ...good, height: 719 }).reason!, /even numbers/);
  assert.match(checkExportSupport({ ...good, width: 4096, height: 4096 }).reason!, /larger than/);
  assert.match(checkExportSupport({ ...good, frameCount: 0 }).reason!, /no frames/);

  const silent = checkExportSupport({ ...good, hasAudioEncoder: false });
  assert.equal(silent.ok, true);
  assert.match(silent.reason!, /silent/);

  for (const r of [noEncoder, noH264]) assert.ok(!/undefined|null|Error:/.test(r.reason!));
});

// ---- the frame loop, with fake encoders ------------------------------------------------------

interface FakeVideo extends VideoEncoderAdapter {
  log: string[];
  encodedKeys: boolean[];
  encodedIndexes: number[];
  configured: { width: number; height: number; fps: number; bitrate: number; codec: string } | null;
  closed: number;
}

/** Emits one tiny chunk per encoded frame. `emit` decides what each chunk contains. */
function fakeVideo(opts: { avcC?: Uint8Array | null; emit?: (frame: unknown, index: number, key: boolean) => ChunkInfo; failAt?: number } = {}): FakeVideo {
  let cb: ((c: ChunkInfo, meta: { avcC?: Uint8Array }) => void) | null = null;
  const avcC = opts.avcC === undefined ? Uint8Array.of(1, 0x64, 0, 0x1f, 0xff, 0xe0, 0) : opts.avcC;
  const fake: FakeVideo = {
    log: [],
    encodedKeys: [],
    encodedIndexes: [],
    configured: null,
    closed: 0,
    onChunk(c) {
      cb = c;
    },
    async configure(cfg) {
      fake.configured = cfg;
      fake.log.push("configure");
    },
    async encode(frame, index, key) {
      if (opts.failAt === index) throw new Error("the encoder ran out of memory");
      fake.log.push(`encode ${index}`);
      fake.encodedKeys.push(key);
      fake.encodedIndexes.push(index);
      const chunk = opts.emit ? opts.emit(frame, index, key) : { data: Uint8Array.of(0, 0, 0, 1, 0x65), timestampUs: Math.round(index * 1e6 / 10), durationUs: 100_000, isKey: key };
      cb?.(chunk, { avcC: index === 0 && avcC ? avcC : undefined });
    },
    async flush() {
      fake.log.push("flush");
    },
    close() {
      fake.closed++;
    },
  };
  return fake;
}

function source(frameCount: number, extra: Partial<FrameSource> = {}): FrameSource & { rendered: number[] } {
  const rendered: number[] = [];
  return {
    width: 320,
    height: 240,
    fps: 10,
    frameCount,
    rendered,
    async renderFrame(frame) {
      rendered.push(frame);
      return { frame };
    },
    ...extra,
  };
}

test("exportMp4 renders every frame once, in order, and tells the encoder which are key frames", async () => {
  const video = fakeVideo({
    // AVCC: a 4-byte length (4) followed by a 4-byte NAL unit
    emit: (_f, index, key) => ({ data: Uint8Array.of(0, 0, 0, 4, key ? 0x65 : 0x41, 0x88, 0x84, 0), timestampUs: index * 100_000, durationUs: 100_000, isKey: key }),
  });
  const src = source(25);
  const progress: [number, number][] = [];
  const bytes = await exportMp4({ source: src, audio: null, quality: "medium", video, keyFrameEverySeconds: 1, onProgress: (d, t) => progress.push([d, t]) });
  assert.deepEqual(src.rendered, Array.from({ length: 25 }, (_, i) => i));
  assert.deepEqual(video.encodedIndexes, src.rendered);
  assert.deepEqual(
    video.encodedKeys.map((k, i) => (k ? i : -1)).filter((i) => i >= 0),
    [0, 10, 20],
  );
  assert.deepEqual(progress[0], [1, 25]);
  assert.deepEqual(progress[24], [25, 25]);
  assert.equal(progress.length, 25);
  assert.equal(video.closed, 1);
  assert.equal(video.configured!.codec, avcCodecString(320, 240, 10));
  assert.equal(video.configured!.bitrate, bitrateFor("medium", 320, 240, 10));
  // flush happens after the last frame
  assert.deepEqual(video.log.slice(0, 2), ["configure", "encode 0"]);
  assert.equal(video.log[video.log.length - 1], "flush");
  assert.ok(bytes.length > 100);
  assert.equal(Buffer.from(bytes.subarray(4, 8)).toString("latin1"), "ftyp");
});

test("exportMp4 frame timing comes from the frame number, never from the clock", async () => {
  const a = fakeVideo();
  const b = fakeVideo();
  const t0 = Date.now();
  await exportMp4({ source: source(5), audio: null, quality: "low", video: a });
  while (Date.now() - t0 < 15) {
    // let some wall-clock time pass between the two runs
  }
  await exportMp4({ source: source(5), audio: null, quality: "low", video: b });
  assert.deepEqual(a.log, b.log);
});

test("exportMp4 is byte-for-byte repeatable", async () => {
  const run = () => exportMp4({ source: source(12), audio: null, quality: "high", video: fakeVideo() });
  assert.deepEqual(await run(), await run());
});

test("exportMp4 stops at the first frame after a cancel and still closes the encoder", async () => {
  const controller = new AbortController();
  const video = fakeVideo();
  const src = source(100, {
    async renderFrame(frame) {
      src.rendered.push(frame);
      if (frame === 3) controller.abort();
      return {};
    },
  });
  await assert.rejects(exportMp4({ source: src, audio: null, quality: "low", video, signal: controller.signal }), (e: Error) => e.name === "AbortError" && /cancelled/.test(e.message));
  assert.deepEqual(src.rendered, [0, 1, 2, 3]);
  assert.equal(video.closed, 1);
});

test("exportMp4 refuses to start when already cancelled", async () => {
  const controller = new AbortController();
  controller.abort();
  const video = fakeVideo();
  await assert.rejects(exportMp4({ source: source(5), audio: null, quality: "low", video, signal: controller.signal }), (e: Error) => e.name === "AbortError");
  assert.equal(video.log.length, 0);
  assert.equal(video.closed, 1);
});

test("exportMp4 turns an encoder failure into a plain sentence and closes everything", async () => {
  const video = fakeVideo({ failAt: 2 });
  await assert.rejects(exportMp4({ source: source(10), audio: null, quality: "low", video }), (e: Error) => /^Making the video failed: the encoder ran out of memory$/.test(e.message));
  assert.equal(video.closed, 1);
});

test("exportMp4 explains bad input in plain words", async () => {
  await assert.rejects(exportMp4({ source: source(0), audio: null, quality: "low", video: fakeVideo() }), /no frames/);
  await assert.rejects(exportMp4({ source: source(5, { fps: 0 }), audio: null, quality: "low", video: fakeVideo() }), /frame rate/);
  await assert.rejects(exportMp4({ source: source(5, { width: 321 }), audio: null, quality: "low", video: fakeVideo() }), /even numbers/);
  await assert.rejects(exportMp4({ source: source(2.5), audio: null, quality: "low", video: fakeVideo() }), /no frames/);
});

test("exportMp4 says so when the encoder never reports its settings", async () => {
  const video = fakeVideo({ avcC: null });
  await assert.rejects(exportMp4({ source: source(3), audio: null, quality: "low", video }), /did not report its settings/);
  assert.equal(video.closed, 1);
});

test("exportMp4 hands the audio encoder whole 1024-sample blocks covering exactly the video's length", async () => {
  const blocks: { length: number; ts: number; sum: number }[] = [];
  let configured: { sampleRate: number; channels: number; bitrate: number } | null = null;
  let closed = 0;
  let flushed = false;
  let cb: ((c: ChunkInfo, m: { audioSpecificConfig?: Uint8Array }) => void) | null = null;
  const audioEncoder: AudioEncoderAdapter = {
    onChunk(c) {
      cb = c;
    },
    async configure(c) {
      configured = c;
    },
    async encode(samples, ts) {
      blocks.push({ length: samples.length, ts, sum: samples.reduce((a, b) => a + b, 0) });
      cb?.({ data: Uint8Array.of(1, 2, 3), timestampUs: ts, durationUs: 23220, isKey: true }, { audioSpecificConfig: blocks.length === 1 ? Uint8Array.of(0x12, 0x08) : undefined });
    },
    async flush() {
      flushed = true;
    },
    close() {
      closed++;
    },
  };
  const rate = 8000;
  // 1.5 s of video; audio is 3 s of ones (too long) -> cut
  const long = new Float32Array(rate * 3).fill(1);
  await exportMp4({ source: source(15), audio: { sampleRate: rate, samples: long }, quality: "low", video: fakeVideo(), audioEncoder });
  const total = Math.ceil(1.5 * rate); // 12000
  assert.equal(blocks.length, Math.ceil(total / 1024));
  assert.ok(blocks.every((b) => b.length === 1024));
  assert.equal(blocks.reduce((a, b) => a + b.sum, 0), total); // exactly 1.5 s of ones, nothing beyond
  assert.equal(blocks[1].ts, Math.round((1024 / rate) * 1e6));
  assert.deepEqual(configured, { sampleRate: rate, channels: 1, bitrate: 128_000 });
  assert.ok(flushed);
  assert.equal(closed, 1);

  // audio is shorter than the video -> padded with silence up to the same number of blocks
  blocks.length = 0;
  const short = new Float32Array(rate).fill(1); // 1 s
  await exportMp4({ source: source(15), audio: { sampleRate: rate, samples: short }, quality: "low", video: fakeVideo(), audioEncoder });
  assert.equal(blocks.length, Math.ceil(total / 1024));
  assert.equal(blocks.reduce((a, b) => a + b.sum, 0), rate);
});

test("exportMp4 ignores an audio encoder when there is no sound to add", async () => {
  let touched = false;
  const audioEncoder: AudioEncoderAdapter = {
    onChunk() {},
    async configure() {
      touched = true;
    },
    async encode() {
      touched = true;
    },
    async flush() {
      touched = true;
    },
    close() {},
  };
  await exportMp4({ source: source(4), audio: { sampleRate: 8000, samples: new Float32Array(0) }, quality: "low", video: fakeVideo(), audioEncoder });
  await exportMp4({ source: source(4), audio: null, quality: "low", video: fakeVideo(), audioEncoder });
  assert.equal(touched, false);
});

// ---- end to end: real H.264 and AAC through the real muxer, checked by ffprobe / ffmpeg -------

function realVideo(clip: H264Clip): VideoEncoderAdapter {
  let cb: ((c: ChunkInfo, meta: { avcC?: Uint8Array }) => void) | null = null;
  const us = Math.round(1e6 / clip.fps);
  return {
    onChunk(c) {
      cb = c;
    },
    async configure() {},
    async encode(_frame, index, forceKey) {
      const s = clip.samples[index];
      assert.equal(forceKey, s.isKey, `key frame request for frame ${index} disagrees with the real stream`);
      cb?.({ data: s.data, isKey: s.isKey, timestampUs: Math.round((index * 1e6) / clip.fps), durationUs: us }, { avcC: index === 0 ? clip.avcC : undefined });
    },
    async flush() {},
    close() {},
  };
}

function realAudio(clip: AacClip): AudioEncoderAdapter {
  let cb: ((c: ChunkInfo, meta: { audioSpecificConfig?: Uint8Array }) => void) | null = null;
  let next = 0;
  const us = (1024 / clip.sampleRate) * 1e6;
  const emit = (k: number) => cb?.({ data: clip.frames[k], isKey: true, timestampUs: Math.round(k * us), durationUs: Math.round(us) }, { audioSpecificConfig: k === 0 ? clip.audioSpecificConfig : undefined });
  return {
    onChunk(c) {
      cb = c;
    },
    async configure() {},
    async encode() {
      if (next < clip.frames.length) emit(next++);
    },
    async flush() {
      while (next < clip.frames.length) emit(next++);
    },
    close() {},
  };
}

test("end to end: 2 s of real H.264 + AAC becomes an MP4 that ffprobe and ffmpeg accept", { skip }, async () => {
  const fps = 15;
  const clip = makeH264(2, fps, 320, 240, fps); // a key frame every second
  const aac = makeAac(2, 44100, 1);
  const src = source(clip.samples.length, { fps });
  const bytes = await exportMp4({
    source: src,
    audio: { sampleRate: 44100, samples: new Float32Array(44100 * 2) },
    quality: "medium",
    video: realVideo(clip),
    audioEncoder: realAudio(aac),
    keyFrameEverySeconds: 1,
  });
  const info = probe(bytes);
  const v = info.streams.find((s) => s.codec_type === "video")!;
  const a = info.streams.find((s) => s.codec_type === "audio")!;
  assert.equal(v.codec_name, "h264");
  assert.equal(v.nb_frames, "30");
  assert.equal(v.width, 320);
  assert.equal(a.codec_name, "aac");
  assert.equal(a.channels, 1);
  assert.equal(a.sample_rate, "44100");
  assert.ok(Math.abs(Number(info.format.duration) - 2) < 0.1, `duration ${info.format.duration}`);
  assert.equal(decodeErrors(bytes), "");
});

test("end to end: a silent video (no audio encoder) is a valid single-stream MP4 and repeats exactly", { skip }, async () => {
  const fps = 10;
  const clip = makeH264(1, fps, 160, 120, fps);
  const run = () => exportMp4({ source: source(clip.samples.length, { fps, width: 160, height: 120 }), audio: null, quality: "low", video: realVideo(clip), keyFrameEverySeconds: 1 });
  const one = await run();
  const two = await run();
  assert.deepEqual(one, two);
  const info = probe(one);
  assert.deepEqual(
    info.streams.map((s) => s.codec_type),
    ["video"],
  );
  assert.equal(info.streams[0].nb_frames, "10");
  assert.equal(decodeErrors(one), "");
});

// ---- the WebCodecs wrappers, against fakes of the browser classes ----------------------------

test("makeWebCodecsAdapters returns null without VideoEncoder and video-only without AudioEncoder", () => {
  assert.equal(makeWebCodecsAdapters({}), null);
  assert.equal(makeWebCodecsAdapters({ VideoEncoder: class {} }), null); // no VideoFrame
  const adapters = makeWebCodecsAdapters({ VideoEncoder: class {}, VideoFrame: class {} });
  assert.ok(adapters);
  assert.equal(adapters.audio, undefined);
});

class FakeEncoderBase {
  static supported = true;
  static async isConfigSupported() {
    return { supported: FakeEncoderBase.supported };
  }
  state = "unconfigured";
  encodeQueueSize = 0;
  handlers: { output: (chunk: any, meta?: any) => void; error: (e: Error) => void };
  configuredWith: any = null;
  seen: any[] = [];
  constructor(handlers: { output: (chunk: any, meta?: any) => void; error: (e: Error) => void }) {
    this.handlers = handlers;
  }
  configure(config: any) {
    this.state = "configured";
    this.configuredWith = config;
  }
  async flush() {}
  close() {
    this.state = "closed";
  }
  addEventListener() {}
}

test("makeWebCodecsAdapters passes frames and settings through and maps chunks back", async () => {
  const closedFrames: any[] = [];
  let encoder!: FakeVideoEncoder;
  class FakeVideoEncoder extends FakeEncoderBase {
    static supported = true;
    static override async isConfigSupported() {
      return { supported: FakeVideoEncoder.supported };
    }
    constructor(h: any) {
      super(h);
      encoder = this;
    }
    encode(frame: any, options: any) {
      this.seen.push({ frame, options });
      const description = Uint8Array.of(1, 100, 0, 31).buffer;
      this.handlers.output(
        {
          byteLength: 3,
          copyTo: (to: Uint8Array) => to.set([9, 8, 7]),
          timestamp: frame.init.timestamp,
          duration: frame.init.duration,
          type: options.keyFrame ? "key" : "delta",
        },
        this.seen.length === 1 ? { decoderConfig: { description } } : {},
      );
    }
  }
  class FakeVideoFrame {
    image: unknown;
    init: any;
    constructor(image: unknown, init: any) {
      this.image = image;
      this.init = init;
    }
    close() {
      closedFrames.push(this);
    }
  }
  const adapters = makeWebCodecsAdapters({ VideoEncoder: FakeVideoEncoder, VideoFrame: FakeVideoFrame })!;
  const got: { c: ChunkInfo; avcC?: Uint8Array }[] = [];
  adapters.video.onChunk((c, meta) => got.push({ c, avcC: meta.avcC }));
  await adapters.video.configure({ width: 320, height: 240, fps: 10, bitrate: 1_000_000, codec: "avc1.64001f" });
  assert.equal(encoder.configuredWith.codec, "avc1.64001f");
  assert.equal(encoder.configuredWith.avc.format, "avc");
  assert.equal(encoder.configuredWith.framerate, 10);
  const canvas = { fake: "canvas" };
  await adapters.video.encode(canvas, 0, true);
  await adapters.video.encode(canvas, 3, false);
  assert.equal(closedFrames.length, 2); // every VideoFrame is closed
  assert.equal(encoder.seen[0].frame.image, canvas);
  assert.equal(got[0].c.isKey, true);
  assert.equal(got[1].c.isKey, false);
  assert.deepEqual([...got[0].c.data], [9, 8, 7]);
  assert.equal(got[1].c.timestampUs, 300_000); // frame 3 at 10 fps
  assert.equal(got[1].c.durationUs, 100_000);
  assert.deepEqual([...got[0].avcC!], [1, 100, 0, 31]);
  assert.equal(got[1].avcC, undefined);
  await adapters.video.flush();
  adapters.video.close();
  assert.equal(encoder.state, "closed");
  adapters.video.close(); // closing twice is harmless
});

test("makeWebCodecsAdapters reports an unsupported device and an encoder error in plain words", async () => {
  let failWith: ((e: Error) => void) | null = null;
  class Unsupported extends FakeEncoderBase {
    static override async isConfigSupported() {
      return { supported: false };
    }
  }
  const noSupport = makeWebCodecsAdapters({ VideoEncoder: Unsupported, VideoFrame: class {} })!;
  await assert.rejects(noSupport.video.configure({ width: 320, height: 240, fps: 10, bitrate: 1, codec: "avc1.64001f" }), /cannot create MP4/);

  class Failing extends FakeEncoderBase {
    constructor(h: any) {
      super(h);
      failWith = h.error;
    }
    encode() {}
  }
  class Frame {
    constructor(_i: unknown, _o: unknown) {}
    close() {}
  }
  const failing = makeWebCodecsAdapters({ VideoEncoder: Failing, VideoFrame: Frame })!;
  await failing.video.configure({ width: 320, height: 240, fps: 10, bitrate: 1, codec: "avc1.64001f" });
  failWith!(new Error("hardware encoder lost"));
  await assert.rejects(failing.video.encode({}, 0, true), /hardware encoder lost/);
});

test("makeWebCodecsAdapters audio wrapper sends mono f32-planar blocks and maps the AAC config", async () => {
  const closedData: any[] = [];
  class FakeAudioEncoder extends FakeEncoderBase {
    encode(data: any) {
      this.seen.push(data);
      this.handlers.output(
        { byteLength: 2, copyTo: (to: Uint8Array) => to.set([5, 6]), timestamp: data.init.timestamp, duration: 23220, type: "key" },
        this.seen.length === 1 ? { decoderConfig: { description: Uint8Array.of(0x12, 0x08) } } : {},
      );
    }
  }
  class FakeAudioData {
    init: any;
    constructor(init: any) {
      this.init = init;
    }
    close() {
      closedData.push(this);
    }
  }
  const adapters = makeWebCodecsAdapters({ VideoEncoder: class {}, VideoFrame: class {}, AudioEncoder: FakeAudioEncoder, AudioData: FakeAudioData })!;
  assert.ok(adapters.audio);
  const got: { c: ChunkInfo; asc?: Uint8Array }[] = [];
  adapters.audio.onChunk((c, meta) => got.push({ c, asc: meta.audioSpecificConfig }));
  await adapters.audio.configure({ sampleRate: 44100, channels: 1, bitrate: 128_000 });
  const block = new Float32Array(1024);
  await adapters.audio.encode(block, 0);
  await adapters.audio.encode(block, 23220);
  assert.equal(closedData.length, 2);
  assert.equal(closedData[0].init.format, "f32-planar");
  assert.equal(closedData[0].init.numberOfChannels, 1);
  assert.equal(closedData[0].init.numberOfFrames, 1024);
  assert.equal(closedData[0].init.sampleRate, 44100);
  assert.deepEqual([...got[0].asc!], [0x12, 0x08]);
  assert.equal(got[1].asc, undefined);
  assert.equal(got[1].c.timestampUs, 23220);
  assert.equal(got[0].c.isKey, true);
});
