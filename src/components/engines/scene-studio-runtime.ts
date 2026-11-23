/**
 * Browser-only glue for the Scene Studio screen: paints a complete frame (3D picture + layers + captions) and turns
 * a scene into an MP4. The preview and the export use the same `FramePainter`, so what you see is what you export.
 *
 * Everything with real logic lives in src/lib/scene-studio and is tested there; this file needs WebGL, canvas,
 * WebCodecs and Web Audio, so it is not run by the Node tests.
 */
import { captionGroups } from "@/lib/scene-studio/captions";
import type { CaptionGroup, SpokenLine } from "@/lib/scene-studio/captions";
import { composeFrame } from "@/lib/scene-studio/compose2d";
import type { Drawable } from "@/lib/scene-studio/compose2d";
import { SceneRenderer, webglAvailable } from "@/lib/scene-studio/babylon-renderer";
import { checkExportSupport, avcCodecString, bitrateFor, exportMp4, makeWebCodecsAdapters } from "@/lib/scene-studio/export-video";
import type { FrameSource } from "@/lib/scene-studio/export-video";
import { createFrameSampler } from "@/lib/scene-studio/frame-state";
import type { ObjectPlan } from "@/lib/scene-studio/object-plan";
import type { Quality, Scene } from "@/lib/scene-studio/types";
import { buildSpeechTimeline, hasSound, mixAudio, SilentVoiceEngine } from "@/lib/scene-studio/voice";
import type { MixSource, VoiceEngine } from "@/lib/scene-studio/voice";

export interface PainterOptions {
  scene: Scene;
  plans: readonly ObjectPlan[];
  /** Files the person added, by name. */
  files: ReadonlyMap<string, Uint8Array>;
  /** Size in pixels of the picture this painter makes. Use the scene's own size for a video. */
  width: number;
  height: number;
  quality: Quality;
  /** Dialogue with its (estimated or spoken) timing. */
  lines: readonly SpokenLine[];
}

const filesAsBytes = (files: ReadonlyMap<string, Uint8Array>) => ({ get: async (name: string) => files.get(name) ?? null });

/** Draws any frame of a scene, in any order, into its own canvas. */
export class FramePainter {
  readonly canvas: HTMLCanvasElement;
  /** Plain-words things the person should know that came up while building the picture. */
  readonly notes: string[] = [];
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sampler: ReturnType<typeof createFrameSampler>;
  private readonly groups: CaptionGroup[];
  private readonly images = new Map<string, Drawable>();
  private renderer: SceneRenderer | null = null;
  private readonly options: PainterOptions;

  private constructor(options: PainterOptions) {
    this.options = options;
    this.canvas = document.createElement("canvas");
    this.canvas.width = options.width;
    this.canvas.height = options.height;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot draw pictures on a canvas.");
    this.ctx = ctx;
    this.sampler = createFrameSampler(options.scene);
    this.groups = captionGroups(options.lines, options.scene.captions.wordsPerGroup);
  }

  static async create(options: PainterOptions): Promise<FramePainter> {
    const painter = new FramePainter(options);
    try {
      await painter.setup();
    } catch (error) {
      painter.dispose();
      throw error;
    }
    return painter;
  }

  private async setup(): Promise<void> {
    const { scene, plans, files, width, height, quality } = this.options;
    // pictures used by 2D layers
    for (const layer of scene.layers) {
      if (layer.type !== "image" || !layer.asset || this.images.has(layer.asset)) continue;
      const bytes = files.get(layer.asset);
      if (!bytes) continue;
      try {
        this.images.set(layer.asset, await createImageBitmap(new Blob([bytes as BlobPart])));
      } catch {
        this.notes.push(`The picture "${layer.asset}" could not be opened, so its layer is left empty.`);
      }
    }
    if (scene.objects.length === 0) return;
    if (!webglAvailable()) {
      this.notes.push("This browser cannot draw 3D (WebGL is switched off or missing), so only the flat layers and captions are shown.");
      return;
    }
    this.renderer = await SceneRenderer.create({ scene, plans, assets: filesAsBytes(files), width, height, quality, transparent: scene.layers.some((l) => l.plane === "back") });
    this.notes.push(...this.renderer.notes);
    await this.renderer.prepare(this.sampler(0));
  }

  /** Paints frame number `frame` (scene time = frame / fps) onto `canvas`. */
  paint(frame: number): void {
    const { scene, width } = this.options;
    const state = this.sampler(frame);
    const ctx = this.ctx;
    ctx.setTransform(width / scene.settings.width, 0, 0, width / scene.settings.width, 0, 0);
    ctx.clearRect(0, 0, scene.settings.width, scene.settings.height);
    let anchors: Record<string, { x: number; y: number }> | undefined;
    if (this.renderer) {
      this.renderer.renderFrame(state);
      if (scene.captions.enabled && scene.captions.placement === "belowSpeaker") anchors = this.renderer.anchorsFor(state);
    }
    composeFrame({
      ctx,
      scene,
      layers: state.layers,
      picture3d: this.renderer ? this.renderer.canvas : null,
      transparent3d: this.renderer !== null && scene.layers.some((l) => l.plane === "back"),
      time: state.time,
      captionGroups: this.groups,
      assets: { images: this.images },
      speakerAnchors: anchors,
    });
  }

  dispose(): void {
    this.renderer?.dispose();
    this.renderer = null;
    for (const image of this.images.values()) (image as ImageBitmap).close?.();
    this.images.clear();
  }
}

// ---- sound -----------------------------------------------------------------------------------

const SOUND_RATE = 44100;

async function decodeAudioFile(bytes: Uint8Array): Promise<Float32Array | null> {
  try {
    const context = new OfflineAudioContext(1, 1, SOUND_RATE);
    const buffer = await context.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / buffer.numberOfChannels;
    }
    return mono;
  } catch {
    return null;
  }
}

// ---- export ----------------------------------------------------------------------------------

export interface VideoExportOptions {
  scene: Scene;
  plans: readonly ObjectPlan[];
  files: ReadonlyMap<string, Uint8Array>;
  lines: readonly SpokenLine[];
  /** A speech engine that runs on this device. Omit for the built-in silent one (captions still work). */
  voice?: VoiceEngine;
  onStage(label: string): void;
  onProgress(done: number, total: number): void;
  signal: AbortSignal;
}

export interface VideoExportResult {
  bytes: Uint8Array;
  /** Notes for the person, in plain words. */
  notes: string[];
  /** True when the video has no sound track. */
  silent: boolean;
}

type EncoderGlobals = {
  VideoEncoder?: { isConfigSupported(config: unknown): Promise<{ supported?: boolean }> };
  AudioEncoder?: unknown;
};

export async function exportSceneVideo(options: VideoExportOptions): Promise<VideoExportResult> {
  const { scene, plans, files, signal } = options;
  const { width, height, fps, duration } = scene.settings;
  const frames = Math.round(fps * duration);
  const notes: string[] = [];
  const g = globalThis as unknown as EncoderGlobals;

  options.onStage("Checking that this device can make the video");
  let h264: boolean | null = null;
  try {
    if (g.VideoEncoder) {
      const result = await g.VideoEncoder.isConfigSupported({ codec: avcCodecString(width, height, fps), width, height, bitrate: bitrateFor(scene.export.quality, width, height, fps), framerate: fps, avc: { format: "avc" } });
      h264 = result.supported === true;
    }
  } catch {
    h264 = null;
  }
  const support = checkExportSupport({ hasVideoEncoder: !!g.VideoEncoder, hasAudioEncoder: !!g.AudioEncoder, h264Supported: h264, width, height, frameCount: frames });
  if (!support.ok) throw new Error(support.reason);
  if (support.reason) notes.push(support.reason);
  const adapters = makeWebCodecsAdapters(globalThis as unknown as Parameters<typeof makeWebCodecsAdapters>[0]);
  if (!adapters) throw new Error("This browser cannot make videos. Try Chrome, Edge or Safari 16.4 or newer.");
  if (scene.export.format === "webm") notes.push("WebM is not available yet, so an MP4 video was made instead.");

  options.onStage("Preparing the voice and sound");
  const timeline = await buildSpeechTimeline(options.lines, scene.voices, options.voice ?? SilentVoiceEngine, SOUND_RATE, signal);
  notes.push(...timeline.notes);
  const sources: MixSource[] = timeline.clips.map((c) => ({ samples: c.audio.samples, sampleRate: c.audio.sampleRate, start: c.start, volume: 1, loop: false }));
  for (const track of scene.audio) {
    const bytes = files.get(track.asset);
    const samples = bytes ? await decodeAudioFile(bytes) : null;
    if (samples) sources.push({ samples, sampleRate: SOUND_RATE, start: track.start, volume: track.volume, loop: track.loop });
    else notes.push(`The sound "${track.asset}" could not be used (${bytes ? "this browser cannot read it" : "it was not added"}), so it is left out.`);
  }
  const mixed = mixAudio(sources, SOUND_RATE, duration);
  const sound = hasSound(mixed);
  if (!sound) notes.push("The video has no sound: the scene has no sound files and no voice is installed.");

  options.onStage("Getting the scene ready");
  const painter = await FramePainter.create({ scene, plans, files, width, height, quality: scene.export.quality, lines: timeline.lines });
  notes.push(...painter.notes);
  try {
    painter.paint(0);
    const source: FrameSource = {
      width,
      height,
      fps,
      frameCount: frames,
      renderFrame: async (frame) => {
        painter.paint(frame);
        return painter.canvas;
      },
    };
    options.onStage("Making the video");
    const bytes = await exportMp4({
      source,
      audio: sound ? { sampleRate: SOUND_RATE, samples: mixed } : null,
      quality: scene.export.quality,
      video: adapters.video,
      audioEncoder: sound ? adapters.audio : undefined,
      onProgress: options.onProgress,
      signal,
    });
    return { bytes, notes, silent: !sound || !adapters.audio };
  } finally {
    painter.dispose();
  }
}
