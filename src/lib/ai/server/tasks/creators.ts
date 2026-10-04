/** SERVER ONLY. Creator tasks: captions and titles. */
import { z } from "zod";
import { AI_LIMITS, CAPTION_PLATFORMS, TITLE_PLATFORMS, TONES } from "../../contracts.ts";
import type { CaptionResult, TitleResult } from "../../contracts.ts";
import { cleanOutputText, UNTRUSTED_GUARD, wrapUntrusted } from "../security/sanitize.ts";
import { defineTask } from "./define.ts";

const LANGUAGE = z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/, "Use a language code such as en or pt-BR.");

const PLATFORM_CAPTION_LIMIT: Record<(typeof CAPTION_PLATFORMS)[number], number> = {
  generic: 600,
  instagram: 2200,
  tiktok: 2200,
  x: 280,
  youtube: 5000,
  linkedin: 3000,
  facebook: 2000,
};

function normalizeHashtag(tag: string): string {
  return tag.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
}

const CaptionInput = z.object({
  topic: z.string().trim().min(3).max(AI_LIMITS.topicMax),
  platform: z.enum(CAPTION_PLATFORMS).default("generic"),
  tone: z.enum(TONES).default("friendly"),
  language: LANGUAGE.default("en"),
  variants: z.number().int().min(1).max(5).default(3),
  includeHashtags: z.boolean().default(true),
  maxCharacters: z.number().int().min(40).max(2200).optional(),
  audience: z.string().trim().max(AI_LIMITS.audienceMax).optional(),
});

const CaptionOutput = z.object({
  variants: z
    .array(z.object({ caption: z.string().min(1).max(2200), hashtags: z.array(z.string().min(1).max(40)).max(8) }))
    .min(1)
    .max(5),
});

export const captionTask = defineTask({
  kind: "structured",
  id: "creator.caption.generate",
  version: "2026-09-30.1",
  description: "Generate social media caption variants for a topic.",
  privacy: "standard",
  rateUnits: 1,
  timeoutMs: 30_000,
  attemptTimeoutMs: 15_000,
  maxOutputTokens: 900,
  temperature: 0.8,
  input: CaptionInput,
  output: CaptionOutput,
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    required: ["variants"],
    properties: {
      variants: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["caption", "hashtags"],
          properties: {
            caption: { type: "string", minLength: 1, maxLength: 2200 },
            hashtags: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 40 } },
          },
        },
      },
    },
  },
  prompt(input, { boundary }) {
    const limit = Math.min(PLATFORM_CAPTION_LIMIT[input.platform], input.maxCharacters ?? 600);
    const system = [
      "You write social media captions for creators.",
      UNTRUSTED_GUARD,
      `Write in the language with code "${input.language}". Platform: ${input.platform}. Tone: ${input.tone}.`,
      `Return exactly ${input.variants} clearly different variants. Each caption must be at most ${limit} characters.`,
      input.includeHashtags ? "Give 3 to 6 relevant hashtags per variant in the hashtags array, without the # symbol." : "Return an empty hashtags array for every variant.",
      "Only use facts present in the topic. Do not make medical, legal or financial promises.",
      "Reply with only a JSON object that matches the provided schema.",
    ].join("\n");
    const blocks = [`Write captions for this topic.\n${wrapUntrusted("TOPIC", input.topic, boundary)}`];
    if (input.audience) blocks.push(`Target audience:\n${wrapUntrusted("AUDIENCE", input.audience, boundary)}`);
    return {
      system,
      user: [{ type: "text", text: blocks.join("\n\n") }],
      language: input.language,
      fingerprint: JSON.stringify([input.topic, input.platform, input.tone, input.language, input.variants, input.includeHashtags, limit, input.audience ?? ""]),
    };
  },
  finalize(output, input) {
    const limit = Math.min(PLATFORM_CAPTION_LIMIT[input.platform], input.maxCharacters ?? 600);
    const seen = new Set<string>();
    const variants: CaptionResult["variants"] = [];
    let dropped = 0;
    for (const variant of output.variants) {
      const caption = cleanOutputText(variant.caption, 2200);
      const key = caption.toLowerCase();
      if (!caption || seen.has(key)) continue;
      if (caption.length > limit) {
        dropped += 1;
        continue;
      }
      seen.add(key);
      const tags = input.includeHashtags
        ? [...new Set(variant.hashtags.map(normalizeHashtag).filter(Boolean))].slice(0, 6)
        : [];
      variants.push({ caption, hashtags: tags });
      if (variants.length >= input.variants) break;
    }
    if (variants.length === 0) return { ok: false, reason: `Every caption was empty, duplicated or longer than ${limit} characters.` };
    return { ok: true, value: { variants }, warnings: dropped > 0 ? [`${dropped} caption(s) were removed for exceeding ${limit} characters.`] : [] };
  },
});

const TitleInput = z.object({
  topic: z.string().trim().min(3).max(AI_LIMITS.topicMax),
  platform: z.enum(TITLE_PLATFORMS).default("generic"),
  tone: z.enum(TONES).default("friendly"),
  language: LANGUAGE.default("en"),
  variants: z.number().int().min(1).max(8).default(5),
  maxCharacters: z.number().int().min(20).max(150).default(100),
});

const TitleOutput = z.object({ titles: z.array(z.string().min(1).max(200)).min(1).max(8) });

export const titleTask = defineTask({
  kind: "structured",
  id: "creator.title.generate",
  version: "2026-09-30.1",
  description: "Generate title ideas for a video, post or article.",
  privacy: "standard",
  rateUnits: 1,
  timeoutMs: 30_000,
  attemptTimeoutMs: 15_000,
  maxOutputTokens: 600,
  temperature: 0.8,
  input: TitleInput,
  output: TitleOutput,
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    required: ["titles"],
    properties: { titles: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 1, maxLength: 200 } } },
  },
  prompt(input, { boundary }) {
    const system = [
      "You write titles for creators.",
      UNTRUSTED_GUARD,
      `Write in the language with code "${input.language}". Format: ${input.platform}. Tone: ${input.tone}.`,
      `Return exactly ${input.variants} clearly different titles, each at most ${input.maxCharacters} characters.`,
      "Be specific and honest. No clickbait that misstates the topic.",
      "Reply with only a JSON object that matches the provided schema.",
    ].join("\n");
    return {
      system,
      user: [{ type: "text", text: `Write titles for this topic.\n${wrapUntrusted("TOPIC", input.topic, boundary)}` }],
      language: input.language,
      fingerprint: JSON.stringify([input.topic, input.platform, input.tone, input.language, input.variants, input.maxCharacters]),
    };
  },
  finalize(output, input) {
    const seen = new Set<string>();
    const titles: TitleResult["titles"] = [];
    let dropped = 0;
    for (const raw of output.titles) {
      const title = cleanOutputText(raw, 200).replace(/\s+/g, " ");
      const key = title.toLowerCase();
      if (!title || seen.has(key)) continue;
      if (title.length > input.maxCharacters) {
        dropped += 1;
        continue;
      }
      seen.add(key);
      titles.push(title);
      if (titles.length >= input.variants) break;
    }
    if (titles.length === 0) return { ok: false, reason: `Every title was empty, duplicated or longer than ${input.maxCharacters} characters.` };
    return { ok: true, value: { titles }, warnings: dropped > 0 ? [`${dropped} title(s) were removed for exceeding ${input.maxCharacters} characters.`] : [] };
  },
});
