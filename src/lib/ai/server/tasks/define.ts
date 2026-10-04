/**
 * SERVER ONLY. The task definition contract.
 *
 * A task owns: its input schema, prompt, output schema, limits and post-processing. It does NOT
 * know about providers, models, keys or fallbacks; the core routes it. `defineTask` closes over the
 * typed input/output so the core can work with `unknown` and still get full validation.
 */
import type { AdapterResult, AiContentPart, Capability, JsonSchema, PrivacyLevel, QualityTier } from "../../types.ts";
import { parseModelJson } from "../core/json.ts";
import { looksLikePromptLeak } from "../security/sanitize.ts";

/** Minimal structural view of a zod schema (works with zod 3 and 4). */
export interface SafeParser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } };
}

export interface PromptContext {
  /** Per-request unguessable delimiter for untrusted content. */
  boundary: string;
}

export interface BuiltPrompt {
  system: string;
  user: AiContentPart[];
  language?: string;
  /** Stable text that identifies the semantic input (hashed for cache/dedupe). */
  fingerprint: string;
  /** Decoded size of any binary input, so routing can respect model upload limits. */
  inputBytes?: number;
}

export type AcceptResult = { ok: true; value: unknown; warnings: string[] } | { ok: false; reason: string };
export type Finalized = { ok: true; value: unknown; warnings?: string[] } | { ok: false; reason: string };

export interface PreparedTask extends BuiltPrompt {
  /** Validate and post-process a provider result into the public result. */
  accept(result: AdapterResult, boundary: string): AcceptResult;
}

export type PlanResult = { ok: true; prepared: PreparedTask } | { ok: false; message: string };

export interface TaskMeta {
  id: string;
  version: string;
  description: string;
  capability: Capability;
  structured: boolean;
  privacy: PrivacyLevel;
  remoteProcessingAllowed: boolean;
  minQuality: QualityTier;
  prefer: "cost" | "quality" | "speed";
  rateUnits: number;
  timeoutMs: number;
  attemptTimeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
  cacheTtlSeconds: number | null;
  jsonSchema?: JsonSchema;
  schemaName?: string;
}

export interface RegisteredTask extends TaskMeta {
  plan(rawInput: unknown, context: PromptContext): PlanResult;
}

interface BaseSpec<I> {
  id: string;
  version: string;
  description: string;
  privacy: PrivacyLevel;
  remoteProcessingAllowed?: boolean;
  minQuality?: QualityTier;
  prefer?: "cost" | "quality" | "speed";
  rateUnits: number;
  timeoutMs: number;
  attemptTimeoutMs?: number;
  maxOutputTokens: number;
  temperature?: number;
  cacheTtlSeconds?: number;
  input: SafeParser<I>;
  prompt(input: I, context: PromptContext): BuiltPrompt;
}

export interface StructuredSpec<I, O> extends BaseSpec<I> {
  kind: "structured";
  /** Use "VISION_ANALYSIS" when the prompt includes an image. */
  capability?: "STRUCTURED_TEXT" | "VISION_ANALYSIS";
  output: SafeParser<O>;
  jsonSchema: JsonSchema;
  finalize(output: O, input: I): Finalized;
}

export interface TranscriptSpec<I> extends BaseSpec<I> {
  kind: "transcript";
  finalize(result: AdapterResult, input: I): Finalized;
}

function describeIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[], max = 3): string {
  return issues
    .slice(0, max)
    .map((issue) => {
      const path = issue.path.map(String).join(".");
      return (path ? `${path}: ` : "") + issue.message.slice(0, 120);
    })
    .join("; ");
}

function schemaName(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

export function defineTask<I, O = never>(spec: StructuredSpec<I, O> | TranscriptSpec<I>): RegisteredTask {
  const capability: Capability = spec.kind === "transcript" ? "SPEECH_TO_TEXT" : (spec.capability ?? "STRUCTURED_TEXT");
  const meta: TaskMeta = {
    id: spec.id,
    version: spec.version,
    description: spec.description,
    capability,
    structured: spec.kind === "structured",
    privacy: spec.privacy,
    remoteProcessingAllowed: spec.remoteProcessingAllowed ?? true,
    minQuality: spec.minQuality ?? "fast",
    prefer: spec.prefer ?? "cost",
    rateUnits: spec.rateUnits,
    timeoutMs: spec.timeoutMs,
    attemptTimeoutMs: spec.attemptTimeoutMs ?? spec.timeoutMs,
    maxOutputTokens: spec.maxOutputTokens,
    temperature: spec.temperature ?? 0.4,
    cacheTtlSeconds: spec.cacheTtlSeconds ?? null,
    jsonSchema: spec.kind === "structured" ? spec.jsonSchema : undefined,
    schemaName: spec.kind === "structured" ? schemaName(spec.id) : undefined,
  };

  return {
    ...meta,
    plan(rawInput, context) {
      const parsed = spec.input.safeParse(rawInput);
      if (!parsed.success) return { ok: false, message: describeIssues(parsed.error.issues) || "Invalid input." };
      const input = parsed.data;
      const built = spec.prompt(input, context);

      const accept = (result: AdapterResult, boundary: string): AcceptResult => {
        if (spec.kind === "transcript") {
          const done = spec.finalize(result, input);
          return done.ok ? { ok: true, value: done.value, warnings: done.warnings ?? [] } : done;
        }
        if (looksLikePromptLeak(result.text, boundary)) return { ok: false, reason: "The response repeated internal instructions." };
        const json = parseModelJson(result.text);
        if (!json.ok) return { ok: false, reason: json.reason };
        const checked = spec.output.safeParse(json.value);
        if (!checked.success) return { ok: false, reason: `The JSON did not match the required shape (${describeIssues(checked.error.issues)}).` };
        const done = spec.finalize(checked.data, input);
        return done.ok ? { ok: true, value: done.value, warnings: done.warnings ?? [] } : done;
      };

      return { ok: true, prepared: { ...built, accept } };
    },
  };
}
