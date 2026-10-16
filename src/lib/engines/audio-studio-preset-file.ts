import { EQ_PROFILES, VOCAL_PRESETS, type AmpCharacter, type EqProfileId, type VocalPresetId } from "./vocal-presets.ts";

export const AUDIO_STUDIO_PRESET_FORMAT = "env-audio-studio-preset" as const;
export const AUDIO_STUDIO_PRESET_VERSION = 1 as const;
export const MAX_AUDIO_STUDIO_PRESET_BYTES = 256 * 1024;

/** Portable control-only preset. No audio, video, device IDs, or recording data is included. */
export interface PortableAudioStudioSettings {
  presetId: VocalPresetId;
  micGain: number;
  backingGain: number;
  eqBandsDb: number[];
  eqProfile: EqProfileId | "custom";
  highPassHz: number | null;
  lowPassHz: number | null;
  compressorThresholdDb: number;
  compressorRatio: number;
  outputGainDb: number;
  reverbAmount: number;
  delayAmount: number;
  effectAmount: number;
  ampCharacter: AmpCharacter;
  ampDrive: number;
  ampBassDb: number;
  ampMidDb: number;
  ampTrebleDb: number;
}

export interface AudioStudioPresetFile {
  format: typeof AUDIO_STUDIO_PRESET_FORMAT;
  version: typeof AUDIO_STUDIO_PRESET_VERSION;
  name: string;
  exportedAt: string;
  settings: PortableAudioStudioSettings;
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numeric));
}

function optionalCutoff(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return bounded(value, max, min, max);
}

export function normalizePortableAudioSettings(value: unknown): PortableAudioStudioSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!VOCAL_PRESETS.some((preset) => preset.id === raw.presetId)) return null;
  if (!Array.isArray(raw.eqBandsDb) || raw.eqBandsDb.length !== 10) return null;
  const bands = raw.eqBandsDb.map((gain) => bounded(gain, 0, -9, 9));
  const ampCharacter = ["clean", "tube", "crunch", "fuzz"].includes(String(raw.ampCharacter))
    ? raw.ampCharacter as AmpCharacter
    : "clean";
  const validProfile = raw.eqProfile === "custom" || Object.prototype.hasOwnProperty.call(EQ_PROFILES, String(raw.eqProfile));
  const eqProfile: EqProfileId | "custom" = validProfile ? raw.eqProfile as EqProfileId | "custom" : "custom";
  return {
    presetId: raw.presetId as VocalPresetId,
    micGain: bounded(raw.micGain, 100, 0, 150),
    backingGain: bounded(raw.backingGain, 70, 0, 120),
    eqBandsDb: bands,
    eqProfile,
    highPassHz: optionalCutoff(raw.highPassHz, 20, 1_000),
    lowPassHz: optionalCutoff(raw.lowPassHz, 1_000, 20_000),
    compressorThresholdDb: bounded(raw.compressorThresholdDb, -20, -36, -8),
    compressorRatio: bounded(raw.compressorRatio, 3, 1, 8),
    outputGainDb: bounded(raw.outputGainDb, 0, -12, 6),
    reverbAmount: bounded(raw.reverbAmount, 100, 0, 150),
    delayAmount: bounded(raw.delayAmount, 100, 0, 150),
    effectAmount: bounded(raw.effectAmount, Math.max(bounded(raw.reverbAmount, 100, 0, 150), bounded(raw.delayAmount, 100, 0, 150)), 0, 150),
    ampCharacter,
    ampDrive: bounded(raw.ampDrive, 25, 0, 100),
    ampBassDb: bounded(raw.ampBassDb, 0, -6, 6),
    ampMidDb: bounded(raw.ampMidDb, 0, -6, 6),
    ampTrebleDb: bounded(raw.ampTrebleDb, 0, -6, 6),
  };
}

export function createAudioStudioPresetFile(name: string, settings: unknown, exportedAt = new Date().toISOString()): AudioStudioPresetFile | null {
  const cleanName = name.trim().slice(0, 48);
  const normalized = normalizePortableAudioSettings(settings);
  if (!cleanName || !normalized) return null;
  return { format: AUDIO_STUDIO_PRESET_FORMAT, version: AUDIO_STUDIO_PRESET_VERSION, name: cleanName, exportedAt, settings: normalized };
}

export function parseAudioStudioPresetFile(rawText: string): AudioStudioPresetFile | null {
  if (rawText.length === 0 || new TextEncoder().encode(rawText).byteLength > MAX_AUDIO_STUDIO_PRESET_BYTES) return null;
  try {
    const raw: unknown = JSON.parse(rawText);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const envelope = raw as Record<string, unknown>;
    if (envelope.format !== AUDIO_STUDIO_PRESET_FORMAT || envelope.version !== AUDIO_STUDIO_PRESET_VERSION || typeof envelope.name !== "string") return null;
    const exportedAt = typeof envelope.exportedAt === "string" && envelope.exportedAt.length <= 64 ? envelope.exportedAt : new Date(0).toISOString();
    return createAudioStudioPresetFile(envelope.name, envelope.settings, exportedAt);
  } catch {
    return null;
  }
}
