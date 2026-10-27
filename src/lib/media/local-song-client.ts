import { z } from "zod";

const candidate = z.object({
  label: z.string().max(100),
  score: z.number().min(-1).max(1),
  source: z.enum(["clap_similarity", "reviewed_linear_head"]),
});
const tags = z.record(z.string().max(100), z.array(candidate).max(30));
const clip = z.object({
  start_seconds: z.number().nonnegative(),
  end_seconds: z.number().positive(),
  label: z.string().max(100),
  label_source: z.enum(["signal_change", "fixed_window"]),
  tags,
});
const learning = z.object({
  reviewed_tracks: z.number().int().nonnegative(),
  model_version: z.string().nullable(),
  evaluation: z.record(z.string(), z.unknown()).nullable(),
});
export const localSongResultSchema = z.object({
  schema_version: z.literal("env.local-song.v1"),
  filename: z.string().max(255),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  metadata: z.record(z.string(), z.unknown()),
  signal: z
    .object({
      duration_seconds: z.number().positive().max(900),
      tempo_bpm: z.number().nullable(),
      key: z.string().nullable(),
      sections: z.array(clip).max(90),
    })
    .passthrough(),
  candidates: tags,
  learned_tags: tags,
  windows: z.array(clip).max(90),
  lyrics: z
    .object({
      status: z.string(),
      language: z.string().nullable(),
      language_score: z.number().nullable(),
      segments: z
        .array(
          z.object({
            start_seconds: z.number(),
            end_seconds: z.number(),
            text: z.string().max(4000),
          }),
        )
        .max(1500),
    })
    .passthrough(),
  llm: z
    .object({
      model: z.string(),
      model_revision: z.string().nullable(),
      selected_tags: z.record(z.string(), z.array(z.string().max(100)).max(3)),
      status: z.literal("unreviewed"),
      method: z.string(),
    })
    .nullable(),
  model: z.object({ encoder: z.string().nullable(), learning, score_meaning: z.string() }),
  processing: z.object({
    location: z.literal("local_companion"),
    hosted_inference: z.literal(false),
    audio_retention_seconds: z.number(),
    tagging_coverage: z.string(),
  }),
  artifacts: z
    .array(
      z.object({
        name: z.string().max(300),
        kind: z.enum(["section", "stem"]),
        bytes: z.number().nonnegative(),
      }),
    )
    .max(100),
  warnings: z.array(z.string().max(2000)).max(50),
  reviewed: z.literal(false),
});
export type LocalSongResult = z.infer<typeof localSongResultSchema>;
export type LocalConnection = { url: string; token: string };
export const localHealthSchema = z.object({
  schema_version: z.literal("env.local-song.v1"),
  location: z.literal("local_companion"),
  ffmpeg: z.boolean(),
  tagger_installed: z.boolean(),
  tagger_loaded: z.boolean(),
  transcription_configured: z.boolean(),
  stems_configured: z.boolean(),
  learning,
});
export const localJobSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{32}$/),
  state: z.enum(["queued", "running", "completed", "partial", "failed", "cancelled"]),
  stage: z.string(),
  progress: z.number().min(0).max(100),
  error: z.string().nullable(),
  result: localSongResultSchema.nullable(),
});

export function localCompanionUrl(value: string): string {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("Use a local address such as http://127.0.0.1:8765.");
  return parsed.origin;
}

export async function localRequest(
  connection: LocalConnection,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(localCompanionUrl(connection.url) + path, {
    ...init,
    redirect: "error",
    cache: "no-store",
    credentials: "omit",
    headers: {
      ...Object.fromEntries(new Headers(init.headers)),
      Authorization: `Bearer ${connection.token}`,
    },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail.slice(0, 300)
        : `Local service returned ${response.status}.`,
    );
  }
  return response;
}
