/**
 * Deterministic video export: render frame N at scene time N / fps, encode it, wrap everything in an MP4.
 *
 * All browser pieces are injected (`VideoEncoderAdapter`, `AudioEncoderAdapter`, `FrameSource`) so the loop can
 * be tested in Node. `makeWebCodecsAdapters` at the bottom is the only code that touches real browser APIs.
 */
import { Mp4Muxer } from "./mp4-muxer.ts";
import type { ChunkInfo } from "./mp4-muxer.ts";

export type { ChunkInfo } from "./mp4-muxer.ts";

export type ExportQuality = "low" | "medium" | "high";

export interface FrameSource {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  /** Draw frame `frame` (scene time = frame / fps) and return what the encoder adapter accepts (a canvas in the browser). */
  renderFrame(frame: number): Promise<unknown>;
}

export interface VideoEncoderAdapter {
  configure(cfg: { width: number; height: number; fps: number; bitrate: number; codec: string }): Promise<void>;
  /** Encode one frame whose presentation time is frameIndex / fps. Must resolve only when the encoder can take more work. */
  encode(frame: unknown, frameIndex: number, forceKey: boolean): Promise<void>;
  flush(): Promise<void>;
  close(): void;
  /** `meta.avcC` arrives with the first chunk (WebCodecs decoderConfig.description). */
  onChunk(cb: (c: ChunkInfo, meta: { avcC?: Uint8Array }) => void): void;
}

export interface AudioEncoderAdapter {
  configure(cfg: { sampleRate: number; channels: number; bitrate: number }): Promise<void>;
  encode(samples: Float32Array, timestampUs: number): Promise<void>;
  flush(): Promise<void>;
  close(): void;
  /** `meta.audioSpecificConfig` arrives with the first chunk (WebCodecs decoderConfig.description). */
  onChunk(cb: (c: ChunkInfo, meta: { audioSpecificConfig?: Uint8Array }) => void): void;
}

export interface ExportRequest {
  source: FrameSource;
  /** Mono audio covering the video. Ignored when no `audioEncoder` is given. */
  audio: { sampleRate: number; samples: Float32Array } | null;
  quality: ExportQuality;
  video: VideoEncoderAdapter;
  audioEncoder?: AudioEncoderAdapter;
  onProgress?(done: number, total: number): void;
  signal?: AbortSignal;
  /** Seconds between key frames. Default 2. */
  keyFrameEverySeconds?: number;
}

const BITS_PER_PIXEL: Record<ExportQuality, number> = { low: 0.06, medium: 0.1, high: 0.16 };
const AAC_FRAME = 1024;
const AUDIO_BITRATE = 128_000;

/** Bits per second for a quality level: bits-per-pixel-per-frame × pixels × fps, kept between 0.5 and 40 Mbps. */
export function bitrateFor(quality: ExportQuality, width: number, height: number, fps: number): number {
  const raw = Math.round(BITS_PER_PIXEL[quality] * width * height * fps);
  return Math.min(40_000_000, Math.max(500_000, raw));
}

/** H.264 High profile with the smallest level whose frame-size and macroblock-rate limits fit the video. */
export function avcCodecString(width: number, height: number, fps: number): string {
  const frameMbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const rate = frameMbs * fps;
  const levels: [number, number, number][] = [
    [0x1f, 3600, 108_000],
    [0x28, 8192, 245_760],
    [0x2a, 8704, 522_240],
    [0x33, 36_864, 983_040],
    [0x34, 36_864, 2_073_600],
  ];
  const level = levels.find(([, maxFrame, maxRate]) => frameMbs <= maxFrame && rate <= maxRate) ?? levels[levels.length - 1];
  return `avc1.6400${level[0].toString(16).padStart(2, "0")}`;
}

export interface SupportEnv {
  hasVideoEncoder: boolean;
  hasAudioEncoder: boolean;
  /** Result of VideoEncoder.isConfigSupported for H.264, or null when it has not been checked. */
  h264Supported: boolean | null;
  width: number;
  height: number;
  frameCount: number;
}

/** Plain-words answer to "can this device make the video?". When ok is true, `reason` may carry a gentle note. */
export function checkExportSupport(env: SupportEnv): { ok: boolean; reason?: string } {
  if (!env.hasVideoEncoder) return { ok: false, reason: "This browser cannot make videos. Try Chrome, Edge or Safari 16.4 or newer." };
  if (env.h264Supported === false) return { ok: false, reason: "This device cannot create MP4 (H.264) videos. Try another browser or device." };
  if (env.width % 2 !== 0 || env.height % 2 !== 0) return { ok: false, reason: "The video width and height must be even numbers. Change them in the scene settings." };
  if (env.width * env.height > 4096 * 2304) return { ok: false, reason: "The video is larger than this device can make. Lower the width and height in the scene settings." };
  if (env.frameCount < 1) return { ok: false, reason: "The scene has no frames. Make its duration longer." };
  if (!env.hasAudioEncoder) return { ok: true, reason: "This browser cannot add sound to videos, so the video will be silent." };
  return { ok: true };
}

function abortError(): Error {
  const e = new Error("The video was cancelled.");
  e.name = "AbortError";
  return e;
}

/**
 * Renders frames 0..frameCount-1 strictly in order, one at a time, and returns the finished MP4.
 * Encoders are always closed, even when something fails or the request is cancelled.
 */
export async function exportMp4(req: ExportRequest): Promise<Uint8Array> {
  const { source, video, audioEncoder, signal } = req;
  const { width, height, fps, frameCount } = source;
  if (!Number.isInteger(frameCount) || frameCount < 1) throw new Error("The scene has no frames to make into a video.");
  if (!(fps > 0)) throw new Error("The frame rate must be above zero.");
  if (width % 2 !== 0 || height % 2 !== 0) throw new Error("The video width and height must be even numbers.");

  const videoChunks: ChunkInfo[] = [];
  const audioChunks: ChunkInfo[] = [];
  let avcC: Uint8Array | undefined;
  let audioSpecificConfig: Uint8Array | undefined;
  video.onChunk((c, meta) => {
    if (meta.avcC && !avcC) avcC = meta.avcC;
    videoChunks.push(c);
  });
  audioEncoder?.onChunk((c, meta) => {
    if (meta.audioSpecificConfig && !audioSpecificConfig) audioSpecificConfig = meta.audioSpecificConfig;
    audioChunks.push(c);
  });

  const frameUs = 1_000_000 / fps;
  const keyEvery = Math.max(1, Math.round((req.keyFrameEverySeconds ?? 2) * fps));
  const checkAbort = () => {
    if (signal?.aborted) throw abortError();
  };

  try {
    checkAbort();
    await video.configure({ width, height, fps, bitrate: bitrateFor(req.quality, width, height, fps), codec: avcCodecString(width, height, fps) });
    const withAudio = !!(audioEncoder && req.audio && req.audio.samples.length > 0);
    if (audioEncoder && withAudio) await audioEncoder.configure({ sampleRate: req.audio!.sampleRate, channels: 1, bitrate: AUDIO_BITRATE });

    for (let frame = 0; frame < frameCount; frame++) {
      checkAbort();
      const image = await source.renderFrame(frame);
      checkAbort();
      await video.encode(image, frame, frame % keyEvery === 0);
      req.onProgress?.(frame + 1, frameCount);
    }

    if (audioEncoder && withAudio) {
      // Cover exactly the video's length: cut longer audio, pad shorter audio with silence.
      const { sampleRate, samples } = req.audio!;
      const total = Math.ceil((frameCount / fps) * sampleRate);
      for (let at = 0; at < total; at += AAC_FRAME) {
        checkAbort();
        const block = new Float32Array(AAC_FRAME);
        block.set(samples.subarray(at, Math.min(at + AAC_FRAME, total, samples.length)));
        await audioEncoder.encode(block, Math.round((at / sampleRate) * 1_000_000));
      }
      await audioEncoder.flush();
    }
    await video.flush();
    checkAbort();

    if (!avcC) throw new Error("The video encoder did not report its settings, so the file cannot be written.");
    const useAudio = audioChunks.length > 0 && !!audioSpecificConfig && !!req.audio;
    const muxer = new Mp4Muxer({
      video: { codec: "avc", width, height, avcC },
      audio: useAudio ? { codec: "aac", sampleRate: req.audio!.sampleRate, channels: 1, audioSpecificConfig: audioSpecificConfig! } : undefined,
    });
    for (const c of videoChunks) muxer.addVideoChunk({ ...c, durationUs: c.durationUs > 0 ? c.durationUs : Math.round(frameUs) });
    if (useAudio) {
      const origin = audioChunks[0].timestampUs; // the muxer wants each track to start at 0
      for (const c of audioChunks) muxer.addAudioChunk({ ...c, timestampUs: c.timestampUs - origin });
    }
    return muxer.finish();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(/^(The |This |Making)/.test(message) ? message : `Making the video failed: ${message}`);
  } finally {
    for (const closable of [video, audioEncoder]) {
      try {
        closable?.close();
      } catch {
        // closing an encoder that already failed is not worth reporting
      }
    }
  }
}

// ---- real browser adapters (cannot run in Node; kept small) ----------------------------------

interface BrowserGlobals {
  VideoEncoder?: any;
  VideoFrame?: any;
  AudioEncoder?: any;
  AudioData?: any;
}

/** Thin wrappers over WebCodecs. Returns null when the browser has no VideoEncoder. UNVERIFIED outside a real browser. */
export function makeWebCodecsAdapters(g: BrowserGlobals): { video: VideoEncoderAdapter; audio?: AudioEncoderAdapter } | null {
  if (!g.VideoEncoder || !g.VideoFrame) return null;

  const waitForRoom = async (enc: any, limit: number) => {
    while (enc.encodeQueueSize > limit) await new Promise<void>((resolve) => enc.addEventListener("dequeue", () => resolve(), { once: true }));
  };

  let venc: any;
  let vfail: Error | null = null;
  let vcb: ((c: ChunkInfo, meta: { avcC?: Uint8Array }) => void) | null = null;
  let vfps = 30;
  const video: VideoEncoderAdapter = {
    onChunk(cb) {
      vcb = cb;
    },
    async configure(cfg) {
      vfps = cfg.fps;
      const config = { codec: cfg.codec, width: cfg.width, height: cfg.height, bitrate: cfg.bitrate, framerate: cfg.fps, avc: { format: "avc" }, latencyMode: "quality" };
      const support = await g.VideoEncoder.isConfigSupported(config);
      if (!support.supported) throw new Error("This device cannot create MP4 (H.264) videos of this size. Try a smaller video size.");
      venc = new g.VideoEncoder({
        output: (chunk: any, meta: any) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          const description = meta?.decoderConfig?.description;
          vcb?.({ data, timestampUs: chunk.timestamp, durationUs: chunk.duration ?? Math.round(1_000_000 / vfps), isKey: chunk.type === "key" }, { avcC: description ? new Uint8Array(description as ArrayBuffer) : undefined });
        },
        error: (e: Error) => {
          vfail = e;
        },
      });
      venc.configure(config);
    },
    async encode(frame, index, forceKey) {
      if (vfail) throw vfail;
      const vf = new g.VideoFrame(frame as any, { timestamp: Math.round((index * 1_000_000) / vfps), duration: Math.round(1_000_000 / vfps) });
      try {
        venc.encode(vf, { keyFrame: forceKey });
      } finally {
        vf.close();
      }
      await waitForRoom(venc, 4);
    },
    async flush() {
      await venc.flush();
      if (vfail) throw vfail;
    },
    close() {
      if (venc && venc.state !== "closed") venc.close();
    },
  };

  if (!g.AudioEncoder || !g.AudioData) return { video };

  let aenc: any;
  let afail: Error | null = null;
  let acb: ((c: ChunkInfo, meta: { audioSpecificConfig?: Uint8Array }) => void) | null = null;
  let arate = 44100;
  const audio: AudioEncoderAdapter = {
    onChunk(cb) {
      acb = cb;
    },
    async configure(cfg) {
      arate = cfg.sampleRate;
      const config = { codec: "mp4a.40.2", sampleRate: cfg.sampleRate, numberOfChannels: cfg.channels, bitrate: cfg.bitrate };
      const support = await g.AudioEncoder.isConfigSupported(config);
      if (!support.supported) throw new Error("This device cannot add AAC sound to videos.");
      aenc = new g.AudioEncoder({
        output: (chunk: any, meta: any) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          const description = meta?.decoderConfig?.description;
          acb?.({ data, timestampUs: chunk.timestamp, durationUs: chunk.duration ?? Math.round((AAC_FRAME / arate) * 1_000_000), isKey: true }, { audioSpecificConfig: description ? new Uint8Array(description as ArrayBuffer) : undefined });
        },
        error: (e: Error) => {
          afail = e;
        },
      });
      aenc.configure(config);
    },
    async encode(samples, timestampUs) {
      if (afail) throw afail;
      const data = new g.AudioData({ format: "f32-planar", sampleRate: arate, numberOfFrames: samples.length, numberOfChannels: 1, timestamp: timestampUs, data: samples });
      try {
        aenc.encode(data);
      } finally {
        data.close();
      }
      await waitForRoom(aenc, 8);
    },
    async flush() {
      await aenc.flush();
      if (afail) throw afail;
    },
    close() {
      if (aenc && aenc.state !== "closed") aenc.close();
    },
  };
  return { video, audio };
}
