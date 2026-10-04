/**
 * SERVER ONLY. Developer tasks: explain a regex, SQL statement or JSON document.
 *
 * Inputs are treated as data. Nothing is executed: regexes are only compiled (never matched),
 * SQL is never run, and JSON is only parsed. Credential-shaped strings are redacted before sending.
 */
import { z } from "zod";
import { AI_LIMITS, JSON_GOALS, SQL_DIALECTS } from "../../contracts.ts";
import { cleanOutputText, cleanText, redactSecrets, UNTRUSTED_GUARD, wrapUntrusted } from "../security/sanitize.ts";
import { defineTask } from "./define.ts";

const LANGUAGE = z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/, "Use a language code such as en or pt-BR.");
const cleanList = (items: string[], max: number, chars: number) => items.map((item) => cleanOutputText(item, chars)).filter(Boolean).slice(0, max);

function compiles(pattern: string, flags: string): boolean {
  try {
    new RegExp(pattern, flags);
    return true;
  } catch {
    return false;
  }
}

const RegexInput = z
  .object({
    pattern: z.string().min(1).max(AI_LIMITS.regexMax),
    flags: z.string().regex(/^[dgimsuvy]{0,8}$/, "Unknown regex flag.").default(""),
    sampleText: z.string().max(AI_LIMITS.regexSampleMax).optional(),
    language: LANGUAGE.default("en"),
  })
  .refine((value) => compiles(value.pattern, value.flags), { message: "That is not a valid JavaScript regular expression." });

const RegexOutput = z.object({
  summary: z.string().min(1).max(600),
  parts: z.array(z.object({ token: z.string().min(1).max(80), meaning: z.string().min(1).max(300) })).max(14),
  pitfalls: z.array(z.string().min(1).max(300)).max(6),
  suggestedTests: z.array(z.object({ input: z.string().max(120), shouldMatch: z.boolean() })).max(6),
});

export const regexExplainTask = defineTask({
  kind: "structured",
  id: "developer.regex.explain",
  version: "2026-09-30.1",
  description: "Explain a JavaScript regular expression in plain language.",
  privacy: "standard",
  rateUnits: 1,
  timeoutMs: 30_000,
  attemptTimeoutMs: 15_000,
  maxOutputTokens: 1200,
  temperature: 0.2,
  cacheTtlSeconds: 900,
  input: RegexInput,
  output: RegexOutput,
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "parts", "pitfalls", "suggestedTests"],
    properties: {
      summary: { type: "string", minLength: 1, maxLength: 600 },
      parts: {
        type: "array",
        maxItems: 14,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["token", "meaning"],
          properties: { token: { type: "string", minLength: 1, maxLength: 80 }, meaning: { type: "string", minLength: 1, maxLength: 300 } },
        },
      },
      pitfalls: { type: "array", maxItems: 6, items: { type: "string", minLength: 1, maxLength: 300 } },
      suggestedTests: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["input", "shouldMatch"],
          properties: { input: { type: "string", maxLength: 120 }, shouldMatch: { type: "boolean" } },
        },
      },
    },
  },
  prompt(input, { boundary }) {
    const pattern = redactSecrets(cleanText(input.pattern)).text;
    const sample = input.sampleText ? redactSecrets(cleanText(input.sampleText)).text : "";
    const system = [
      "You explain JavaScript regular expressions to developers.",
      UNTRUSTED_GUARD,
      `Write in the language with code "${input.language}".`,
      "Explain what the pattern matches, token by token, and list common pitfalls such as catastrophic backtracking or missing anchors.",
      "suggestedTests are examples you believe match or do not match. They are not verified, so keep them short and realistic.",
      "Never claim to have run the pattern. Reply with only a JSON object that matches the provided schema.",
    ].join("\n");
    const blocks = [`Explain this regular expression (flags: "${input.flags}").\n${wrapUntrusted("PATTERN", pattern, boundary)}`];
    if (sample) blocks.push(`Sample text the author is testing against:\n${wrapUntrusted("SAMPLE", sample, boundary)}`);
    return { system, user: [{ type: "text", text: blocks.join("\n\n") }], language: input.language, fingerprint: JSON.stringify([pattern, input.flags, sample, input.language]) };
  },
  finalize(output) {
    return {
      ok: true,
      value: {
        summary: cleanOutputText(output.summary, 600),
        parts: output.parts.map((p) => ({ token: cleanOutputText(p.token, 80), meaning: cleanOutputText(p.meaning, 300) })),
        pitfalls: cleanList(output.pitfalls, 6, 300),
        suggestedTests: output.suggestedTests.map((t) => ({ input: cleanOutputText(t.input, 120), shouldMatch: t.shouldMatch })),
      },
    };
  },
});

const SqlInput = z.object({
  sql: z.string().trim().min(1).max(AI_LIMITS.sqlMax),
  dialect: z.enum(SQL_DIALECTS).default("generic"),
  language: LANGUAGE.default("en"),
});

const SqlOutput = z.object({
  summary: z.string().min(1).max(600),
  steps: z.array(z.object({ clause: z.string().min(1).max(120), explanation: z.string().min(1).max(400) })).min(1).max(15),
  warnings: z.array(z.string().min(1).max(300)).max(6),
  performanceNotes: z.array(z.string().min(1).max(300)).max(6),
});

export const sqlExplainTask = defineTask({
  kind: "structured",
  id: "developer.sql.explain",
  version: "2026-09-30.1",
  description: "Explain a SQL statement clause by clause.",
  privacy: "standard",
  rateUnits: 1,
  timeoutMs: 30_000,
  attemptTimeoutMs: 15_000,
  maxOutputTokens: 1500,
  temperature: 0.2,
  cacheTtlSeconds: 900,
  input: SqlInput,
  output: SqlOutput,
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "steps", "warnings", "performanceNotes"],
    properties: {
      summary: { type: "string", minLength: 1, maxLength: 600 },
      steps: {
        type: "array",
        minItems: 1,
        maxItems: 15,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["clause", "explanation"],
          properties: { clause: { type: "string", minLength: 1, maxLength: 120 }, explanation: { type: "string", minLength: 1, maxLength: 400 } },
        },
      },
      warnings: { type: "array", maxItems: 6, items: { type: "string", minLength: 1, maxLength: 300 } },
      performanceNotes: { type: "array", maxItems: 6, items: { type: "string", minLength: 1, maxLength: 300 } },
    },
  },
  prompt(input, { boundary }) {
    const sql = redactSecrets(cleanText(input.sql)).text;
    const system = [
      "You explain SQL statements to developers.",
      UNTRUSTED_GUARD,
      `Write in the language with code "${input.language}". SQL dialect: ${input.dialect}.`,
      "Explain the statement clause by clause in execution-relevant order. Never run or rewrite the statement.",
      "Put destructive or risky behaviour in warnings (for example DELETE/UPDATE without WHERE, DROP, TRUNCATE, SELECT *, implicit casts).",
      "Reply with only a JSON object that matches the provided schema.",
    ].join("\n");
    return { system, user: [{ type: "text", text: `Explain this SQL.\n${wrapUntrusted("SQL", sql, boundary)}` }], language: input.language, fingerprint: JSON.stringify([sql, input.dialect, input.language]) };
  },
  finalize(output) {
    return {
      ok: true,
      value: {
        summary: cleanOutputText(output.summary, 600),
        steps: output.steps.map((s) => ({ clause: cleanOutputText(s.clause, 120), explanation: cleanOutputText(s.explanation, 400) })),
        warnings: cleanList(output.warnings, 6, 300),
        performanceNotes: cleanList(output.performanceNotes, 6, 300),
      },
    };
  },
});

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

const JsonInput = z
  .object({
    json: z.string().trim().min(1).max(AI_LIMITS.jsonMax),
    goal: z.enum(JSON_GOALS).default("describe"),
    language: LANGUAGE.default("en"),
  })
  .refine((value) => isJson(value.json), { message: "That is not valid JSON. Fix it with the JSON validator first." });

const JsonOutput = z.object({
  summary: z.string().min(1).max(600),
  structure: z.array(z.object({ path: z.string().min(1).max(120), type: z.string().min(1).max(40), note: z.string().max(300) })).min(1).max(20),
  issues: z.array(z.string().min(1).max(300)).max(8),
});

export const jsonExplainTask = defineTask({
  kind: "structured",
  id: "developer.json.explain",
  version: "2026-09-30.1",
  description: "Describe the structure of a JSON document and point out likely issues.",
  privacy: "sensitive",
  rateUnits: 2,
  timeoutMs: 30_000,
  attemptTimeoutMs: 15_000,
  maxOutputTokens: 1500,
  temperature: 0.2,
  input: JsonInput,
  output: JsonOutput,
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "structure", "issues"],
    properties: {
      summary: { type: "string", minLength: 1, maxLength: 600 },
      structure: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "type", "note"],
          properties: { path: { type: "string", minLength: 1, maxLength: 120 }, type: { type: "string", minLength: 1, maxLength: 40 }, note: { type: "string", maxLength: 300 } },
        },
      },
      issues: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 300 } },
    },
  },
  prompt(input, { boundary }) {
    // Payloads often carry tokens or personal data, so credential-shaped values are redacted first.
    const json = redactSecrets(cleanText(input.json)).text;
    const goal = input.goal === "find-issues" ? "Focus on likely data-quality or schema problems." : "Focus on describing the structure.";
    const system = [
      "You describe JSON documents for developers.",
      UNTRUSTED_GUARD,
      `Write in the language with code "${input.language}". ${goal}`,
      "Use JSONPath-like paths such as $.items[*].id. Do not repeat secret-looking values; values shown as [REDACTED] were removed on purpose.",
      "Reply with only a JSON object that matches the provided schema.",
    ].join("\n");
    return { system, user: [{ type: "text", text: `Describe this JSON.\n${wrapUntrusted("JSON", json, boundary)}` }], language: input.language, fingerprint: JSON.stringify([json, input.goal, input.language]) };
  },
  finalize(output) {
    return {
      ok: true,
      value: {
        summary: cleanOutputText(output.summary, 600),
        structure: output.structure.map((s) => ({ path: cleanOutputText(s.path, 120), type: cleanOutputText(s.type, 40), note: cleanOutputText(s.note, 300) })),
        issues: cleanList(output.issues, 8, 300),
      },
    };
  },
});
