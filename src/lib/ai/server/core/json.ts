/** SERVER ONLY. Tolerant extraction of a JSON value from model text. */

export type ParsedJson = { ok: true; value: unknown } | { ok: false; reason: string };

const MAX_JSON_CHARS = 400_000;

function stripFences(text: string): string {
  const fenced = text.match(/^```(?:json|JSON)?\s*\n([\s\S]*?)\n?```\s*$/);
  return fenced ? (fenced[1] ?? "") : text;
}

/** Find the first balanced {...} or [...] block, respecting strings and escapes. */
function extractBalanced(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseModelJson(raw: string): ParsedJson {
  if (raw.length > MAX_JSON_CHARS) return { ok: false, reason: "The response was too long to parse." };
  const text = stripFences(raw.replace(/^\uFEFF/, "").trim());
  if (!text) return { ok: false, reason: "The response was empty." };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    const block = extractBalanced(text);
    if (block) {
      try {
        return { ok: true, value: JSON.parse(block) as unknown };
      } catch {
        // fall through
      }
    }
    return { ok: false, reason: "The response was not valid JSON." };
  }
}
