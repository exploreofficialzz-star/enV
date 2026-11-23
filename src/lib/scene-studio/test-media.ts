/**
 * Test-only helpers: make real H.264 / AAC with ffmpeg, and check files with ffprobe.
 * Tests that use these skip themselves when ffmpeg is not installed.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const works = (cmd: string) => spawnSync(cmd, ["-version"]).status === 0;
export const hasFfmpeg = works("ffmpeg") && works("ffprobe");

function inTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "scene-studio-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function ffmpeg(args: string[]) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args]);
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.toString()}`);
}

/** Split an Annex B byte stream (00 00 01 / 00 00 00 01 start codes) into NAL units without start codes. */
function splitAnnexB(bytes: Uint8Array): Uint8Array[] {
  const starts: number[] = [];
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1) {
      starts.push(i + 3);
      i += 2;
    }
  }
  return starts.map((s, k) => {
    let end = k + 1 < starts.length ? starts[k + 1] - 3 : bytes.length;
    while (end > s && bytes[end - 1] === 0) end--; // trailing zero of a 4-byte start code
    return bytes.subarray(s, end);
  });
}

const be32 = (n: number) => Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const cat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

export interface H264Clip {
  width: number;
  height: number;
  fps: number;
  /** AVCDecoderConfigurationRecord built from the stream's SPS and PPS. */
  avcC: Uint8Array;
  /** One entry per frame, in AVCC form (4-byte NAL lengths, no SPS/PPS inside). */
  samples: { data: Uint8Array; isKey: boolean }[];
}

/** Real x264 output: no B-frames, one slice per frame, a key frame every `gop` frames. */
export function makeH264(seconds: number, fps: number, width: number, height: number, gop = 30): H264Clip {
  return inTempDir((dir) => {
    const file = join(dir, "v.h264");
    ffmpeg(["-f", "lavfi", "-i", `testsrc=size=${width}x${height}:rate=${fps}`, "-t", String(seconds), "-c:v", "libx264", "-bf", "0", "-g", String(gop), "-pix_fmt", "yuv420p", "-x264-params", "slices=1:aud=0", "-f", "h264", file]);
    const nals = splitAnnexB(readFileSync(file));
    const type = (n: Uint8Array) => n[0] & 31;
    const sps = nals.find((n) => type(n) === 7)!;
    const pps = nals.find((n) => type(n) === 8)!;
    const avcC = cat([Uint8Array.of(1, sps[1], sps[2], sps[3], 0xff, 0xe1, sps.length >> 8, sps.length & 255), sps, Uint8Array.of(1, pps.length >> 8, pps.length & 255), pps]);
    const samples: H264Clip["samples"] = [];
    let pending: Uint8Array[] = [];
    for (const n of nals) {
      if (type(n) === 7 || type(n) === 8) continue;
      pending.push(cat([be32(n.length), n]));
      if (type(n) === 1 || type(n) === 5) {
        samples.push({ data: cat(pending), isKey: type(n) === 5 });
        pending = [];
      }
    }
    return { width, height, fps, avcC, samples };
  });
}

export interface AacClip {
  sampleRate: number;
  channels: number;
  audioSpecificConfig: Uint8Array;
  /** Raw AAC frames (ADTS headers removed), 1024 samples each. */
  frames: Uint8Array[];
}

export function makeAac(seconds: number, sampleRate: number, channels: number): AacClip {
  return inTempDir((dir) => {
    const file = join(dir, "a.aac");
    ffmpeg(["-f", "lavfi", "-i", `sine=frequency=440:sample_rate=${sampleRate}`, "-ac", String(channels), "-t", String(seconds), "-c:a", "aac", "-f", "adts", file]);
    const data = readFileSync(file);
    const frames: Uint8Array[] = [];
    let objectType = 2;
    let freqIndex = 0;
    let channelConfig = channels;
    for (let at = 0; at + 7 <= data.length; ) {
      if (data[at] !== 0xff || (data[at + 1] & 0xf0) !== 0xf0) throw new Error("Unexpected ADTS data");
      const hasCrc = (data[at + 1] & 1) === 0;
      const length = ((data[at + 3] & 3) << 11) | (data[at + 4] << 3) | (data[at + 5] >> 5);
      objectType = ((data[at + 2] >> 6) & 3) + 1;
      freqIndex = (data[at + 2] >> 2) & 15;
      channelConfig = ((data[at + 2] & 1) << 2) | (data[at + 3] >> 6);
      frames.push(data.subarray(at + (hasCrc ? 9 : 7), at + length));
      at += length;
    }
    const asc = (objectType << 11) | (freqIndex << 7) | (channelConfig << 3);
    return { sampleRate, channels, audioSpecificConfig: Uint8Array.of(asc >> 8, asc & 255), frames };
  });
}

export interface ProbeStream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  nb_frames?: string;
  duration?: string;
  sample_rate?: string;
  channels?: number;
}
export interface ProbeResult {
  streams: ProbeStream[];
  format: { duration: string; format_name: string };
}

export function probe(bytes: Uint8Array): ProbeResult {
  return inTempDir((dir) => {
    const file = join(dir, "x.mp4");
    writeFileSync(file, bytes);
    const r = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file]);
    if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr.toString()}`);
    return JSON.parse(r.stdout.toString());
  });
}

/** Decodes every stream fully; any decoder complaint is returned in `errors`. */
export function decodeErrors(bytes: Uint8Array): string {
  return inTempDir((dir) => {
    const file = join(dir, "x.mp4");
    writeFileSync(file, bytes);
    const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"]);
    return r.stderr.toString().trim() + (r.status === 0 ? "" : ` (exit ${r.status})`);
  });
}
