/**
 * Client-safe contracts for AI tasks: task ids, input limits and result shapes.
 *
 * The server validates every request against these limits; the browser uses the same numbers for
 * form constraints. No prompts, secrets, providers or models appear here.
 */
export const AI_TASK_IDS = [
  "creator.caption.generate",
  "creator.title.generate",
  "developer.regex.explain",
  "developer.sql.explain",
  "developer.json.explain",
  "image.alt.generate",
  "video.transcript.generate",
] as const;
export type AiTaskId = (typeof AI_TASK_IDS)[number];

export const CAPTION_PLATFORMS = ["generic", "instagram", "tiktok", "x", "youtube", "linkedin", "facebook"] as const;
export const TITLE_PLATFORMS = ["generic", "youtube", "tiktok", "instagram", "blog", "podcast"] as const;
export const TONES = ["friendly", "professional", "playful", "bold", "inspirational", "witty"] as const;
export const SQL_DIALECTS = ["generic", "postgresql", "mysql", "sqlite", "sqlserver"] as const;
export const JSON_GOALS = ["describe", "find-issues"] as const;
export const ALT_STYLES = ["concise", "descriptive"] as const;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AUDIO_MIME_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/flac"] as const;

/** Whole request bodies must stay under Vercel's 4.5 MB function limit; the server cap is 4,000,000 bytes. */
export const AI_LIMITS = {
  topicMax: 600,
  audienceMax: 120,
  contextMax: 300,
  regexMax: 1000,
  regexSampleMax: 2000,
  sqlMax: 6000,
  jsonMax: 20_000,
  imageBytesMax: 2_400_000,
  imageBase64Max: 3_300_000,
  audioBytesMax: 2_800_000,
  audioBase64Max: 3_800_000,
} as const;

export interface CaptionResult {
  variants: { caption: string; hashtags: string[] }[];
}
export interface TitleResult {
  titles: string[];
}
export interface RegexExplainResult {
  summary: string;
  parts: { token: string; meaning: string }[];
  pitfalls: string[];
  /** AI-suggested examples. They are NOT verified against the pattern. */
  suggestedTests: { input: string; shouldMatch: boolean }[];
}
export interface SqlExplainResult {
  summary: string;
  steps: { clause: string; explanation: string }[];
  warnings: string[];
  performanceNotes: string[];
}
export interface JsonExplainResult {
  summary: string;
  structure: { path: string; type: string; note: string }[];
  issues: string[];
}
export interface AltTextResult {
  altText: string;
  longDescription: string;
  containsText: boolean;
  textInImage: string;
}
export interface TranscriptResult {
  text: string;
  language: string | null;
  durationSeconds: number | null;
  segments: { start: number; end: number; text: string }[];
}

export interface AiTaskResultMap {
  "creator.caption.generate": CaptionResult;
  "creator.title.generate": TitleResult;
  "developer.regex.explain": RegexExplainResult;
  "developer.sql.explain": SqlExplainResult;
  "developer.json.explain": JsonExplainResult;
  "image.alt.generate": AltTextResult;
  "video.transcript.generate": TranscriptResult;
}
