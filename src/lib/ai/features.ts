/**
 * Client-safe AI feature registry: which tool offers which AI task, and how its form looks.
 *
 * This is configuration, not behaviour. A tool appears here only when its AI action genuinely
 * helps (and the deterministic tool keeps working without it). Tool ids are checked against the
 * catalog by `npm run check:ai`. Nothing here names a provider or model.
 */
import type { AiTaskId } from "./contracts.ts";
import { AI_LIMITS, ALT_STYLES, CAPTION_PLATFORMS, IMAGE_MIME_TYPES, JSON_GOALS, SQL_DIALECTS, TITLE_PLATFORMS, TONES } from "./contracts.ts";

export type AiFieldKind = "textarea" | "text" | "select" | "number" | "checkbox" | "image" | "audio";
export type AiResultKind = "captions" | "titles" | "regex" | "sql" | "json" | "alt-text" | "transcript";

export interface AiFieldSpec {
  name: string;
  label: string;
  kind: AiFieldKind;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  help?: string;
  monospace?: boolean;
  /** Send the text exactly as typed (regex patterns are whitespace-sensitive). */
  preserveWhitespace?: boolean;
  options?: readonly { value: string; label: string }[];
  defaultValue?: string | number | boolean;
  accept?: string;
}

export interface AiFeature {
  toolId: string;
  taskId: AiTaskId;
  title: string;
  description: string;
  actionLabel: string;
  resultKind: AiResultKind;
  fields: readonly AiFieldSpec[];
  /** Values the tool fixes itself (for example the platform of a platform-specific tool). */
  fixedInput?: Readonly<Record<string, unknown>>;
  /** The person must tick a box before the input leaves their device. */
  requiresConsent: boolean;
  consentLabel?: string;
}

/** A prepared upload: already resized/encoded in the browser. */
export interface FileValue {
  base64: string;
  mimeType: string;
  bytes: number;
  filename?: string;
}

export function isFileValue(value: unknown): value is FileValue {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.base64 === "string" && typeof v.mimeType === "string" && typeof v.bytes === "number";
}

const titleCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).replace(/-/g, " ");
const options = (values: readonly string[]) => values.map((value) => ({ value, label: titleCase(value) }));
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
] as const;

const TOPIC: AiFieldSpec = { name: "topic", label: "What is it about?", kind: "textarea", required: true, maxLength: AI_LIMITS.topicMax, placeholder: "Describe the post, video or product in a sentence or two." };
const TONE: AiFieldSpec = { name: "tone", label: "Tone", kind: "select", options: options(TONES), defaultValue: "friendly" };
const LANGUAGE: AiFieldSpec = { name: "language", label: "Language", kind: "select", options: LANGUAGES, defaultValue: "en" };

function captionFeature(toolId: string, platform: (typeof CAPTION_PLATFORMS)[number], where: string): AiFeature {
  return {
    toolId,
    taskId: "creator.caption.generate",
    title: "Write captions with AI",
    description: `Get caption ideas for ${where}. The generator above keeps working without AI.`,
    actionLabel: "Generate captions",
    resultKind: "captions",
    requiresConsent: false,
    fixedInput: { platform },
    fields: [TOPIC, TONE, LANGUAGE, { name: "variants", label: "How many options?", kind: "number", min: 1, max: 5, defaultValue: 3 }, { name: "includeHashtags", label: "Include hashtags", kind: "checkbox", defaultValue: true }],
  };
}

function titleFeature(toolId: string, platform: (typeof TITLE_PLATFORMS)[number], where: string): AiFeature {
  return {
    toolId,
    taskId: "creator.title.generate",
    title: "Get title ideas with AI",
    description: `Get title ideas for ${where}. The generator above keeps working without AI.`,
    actionLabel: "Suggest titles",
    resultKind: "titles",
    requiresConsent: false,
    fixedInput: { platform },
    fields: [TOPIC, TONE, LANGUAGE, { name: "variants", label: "How many options?", kind: "number", min: 1, max: 8, defaultValue: 5 }],
  };
}

export const AI_FEATURES: readonly AiFeature[] = [
  captionFeature("instagram-caption-generator", "instagram", "Instagram"),
  captionFeature("tiktok-caption-generator", "tiktok", "TikTok"),
  captionFeature("x-caption-generator", "x", "X"),
  captionFeature("youtube-caption-generator", "youtube", "YouTube"),
  captionFeature("linkedin-caption-generator", "linkedin", "LinkedIn"),
  captionFeature("facebook-caption-generator", "facebook", "Facebook"),
  captionFeature("caption-generator", "generic", "social posts"),
  titleFeature("youtube-title-generator", "youtube", "YouTube videos"),
  titleFeature("tiktok-title-generator", "tiktok", "TikTok videos"),
  titleFeature("instagram-title-generator", "instagram", "Instagram posts"),
  titleFeature("podcast-title-generator", "podcast", "podcast episodes"),
  titleFeature("title-generator", "generic", "videos, posts and articles"),
  {
    toolId: "regex-tester",
    taskId: "developer.regex.explain",
    title: "Explain this regex with AI",
    description: "Get a plain-language explanation and common pitfalls. The explanation is AI-written and may be wrong, so confirm it with the tester above.",
    actionLabel: "Explain pattern",
    resultKind: "regex",
    requiresConsent: false,
    fields: [
      { name: "pattern", label: "Pattern", kind: "text", required: true, maxLength: AI_LIMITS.regexMax, monospace: true, preserveWhitespace: true, placeholder: "^[\\w.+-]+@[\\w-]+\\.[\\w.]+$" },
      { name: "flags", label: "Flags", kind: "text", maxLength: 8, monospace: true, placeholder: "gi" },
      { name: "sampleText", label: "Sample text (optional)", kind: "textarea", maxLength: AI_LIMITS.regexSampleMax, preserveWhitespace: true },
    ],
  },
  {
    toolId: "sql-formatter",
    taskId: "developer.sql.explain",
    title: "Explain this SQL with AI",
    description: "Get a clause-by-clause explanation and risk warnings. The statement is never executed.",
    actionLabel: "Explain SQL",
    resultKind: "sql",
    requiresConsent: false,
    fields: [
      { name: "sql", label: "SQL statement", kind: "textarea", required: true, maxLength: AI_LIMITS.sqlMax, monospace: true },
      { name: "dialect", label: "Dialect", kind: "select", options: options(SQL_DIALECTS), defaultValue: "generic" },
    ],
  },
  {
    toolId: "json-validator",
    taskId: "developer.json.explain",
    title: "Describe this JSON with AI",
    description: "Get a summary of the structure and likely issues. Secret-looking values are masked before sending, but avoid pasting real personal data.",
    actionLabel: "Describe JSON",
    resultKind: "json",
    requiresConsent: true,
    consentLabel: "I understand this JSON is sent to an external AI service.",
    fields: [
      { name: "json", label: "JSON", kind: "textarea", required: true, maxLength: AI_LIMITS.jsonMax, monospace: true },
      { name: "goal", label: "Focus", kind: "select", options: options(JSON_GOALS), defaultValue: "describe" },
    ],
  },
  {
    toolId: "alt-text-generator",
    taskId: "image.alt.generate",
    title: "Write alt text from an image with AI",
    description: "Upload an image and get alt text plus a longer description. Large images are shrunk in your browser first. Review the result before publishing.",
    actionLabel: "Write alt text",
    resultKind: "alt-text",
    requiresConsent: true,
    consentLabel: "I understand this image is sent to an external AI service.",
    fields: [
      { name: "image", label: "Image", kind: "image", required: true, accept: IMAGE_MIME_TYPES.join(","), help: "JPEG, PNG or WebP." },
      { name: "context", label: "Page context (optional)", kind: "text", maxLength: AI_LIMITS.contextMax, placeholder: "Where will this image appear?" },
      { name: "style", label: "Style", kind: "select", options: options(ALT_STYLES), defaultValue: "concise" },
      LANGUAGE,
    ],
  },
  {
    toolId: "video-audio-extractor",
    taskId: "video.transcript.generate",
    title: "Transcribe audio with AI",
    description: "Upload a short audio clip (up to about 2.8 MB) to get a transcript with timestamps. Longer recordings are not supported yet. Extract and compress the audio first.",
    actionLabel: "Transcribe",
    resultKind: "transcript",
    requiresConsent: true,
    consentLabel: "I understand this recording is sent to an external AI service.",
    fields: [
      { name: "audio", label: "Audio file", kind: "audio", required: true, accept: "audio/*,.mp3,.m4a,.wav,.webm,.ogg,.flac", help: "MP3, M4A, WAV, WebM, OGG or FLAC, up to 2.8 MB." },
      { name: "language", label: "Language code (optional)", kind: "text", maxLength: 3, placeholder: "auto-detect", help: "Two letters, for example en or fr." },
    ],
  },
];

export function getAiFeature(toolId: string): AiFeature | undefined {
  return AI_FEATURES.find((feature) => feature.toolId === toolId);
}

export function defaultValuesFor(feature: AiFeature): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of feature.fields) if (field.defaultValue !== undefined) values[field.name] = field.defaultValue;
  return values;
}

/** First problem a person can fix, or null. The server validates again; this only saves a round trip. */
export function validateFeatureValues(feature: AiFeature, values: Record<string, unknown>): string | null {
  for (const field of feature.fields) {
    const value = values[field.name];
    if (field.kind === "image" || field.kind === "audio") {
      if (field.required && !isFileValue(value)) return `Choose a file for "${field.label}".`;
      continue;
    }
    if (field.kind === "checkbox") continue;
    const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
    if (field.required && text.trim().length === 0) return `${field.label} is required.`;
    if (field.maxLength !== undefined && text.length > field.maxLength) return `${field.label} is too long (maximum ${field.maxLength} characters).`;
    if (field.kind === "number" && text !== "") {
      const n = Number(text);
      if (!Number.isFinite(n) || (field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) {
        return `${field.label} must be between ${field.min ?? 0} and ${field.max ?? 99}.`;
      }
    }
  }
  return null;
}

/** Turn form values into the task input the API expects. */
export function buildFeatureInput(feature: AiFeature, values: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = { ...(feature.fixedInput ?? {}) };
  for (const field of feature.fields) {
    const value = values[field.name];
    switch (field.kind) {
      case "image":
        if (isFileValue(value)) {
          input.imageBase64 = value.base64;
          input.mimeType = value.mimeType;
        }
        break;
      case "audio":
        if (isFileValue(value)) {
          input.audioBase64 = value.base64;
          input.mimeType = value.mimeType;
          if (value.filename) input.filename = value.filename;
        }
        break;
      case "number": {
        const n = typeof value === "number" ? value : Number(value);
        if (value !== "" && value !== undefined && value !== null && Number.isFinite(n)) input[field.name] = n;
        break;
      }
      case "checkbox":
        input[field.name] = Boolean(value);
        break;
      default: {
        if (typeof value !== "string") break;
        const text = field.preserveWhitespace ? value : value.trim();
        if (text.trim().length > 0) input[field.name] = text;
      }
    }
  }
  return input;
}
