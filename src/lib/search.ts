import type { ToolMeta } from "@/types/tool";

const SYNONYMS: Record<string, string[]> = {
  photo: ["image", "picture", "pic"],
  picture: ["image", "photo"],
  pic: ["image", "photo"],
  img: ["image"],
  compress: ["minify", "shrink", "optimize", "size"],
  resize: ["scale", "dimensions", "size"],
  json: ["javascript object"],
  pwd: ["password"],
  pass: ["password"],
  bmi: ["body mass", "weight"],
  percent: ["percentage", "%"],
  qr: ["qrcode", "barcode"],
  uuid: ["guid"],
  hash: ["checksum", "digest", "sha", "md5"],
  color: ["colour", "hex", "rgb"],
  mockup: ["fake", "demo", "chat", "screenshot"],
  invoice: ["bill", "receipt"],
  pdf: ["document"],
  encode: ["encoding", "base64"],
  decode: ["decoding"],
};

function tokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9%+]+/)
    .filter((t) => t.length > 1 || t === "%");
}

function expand(ts: string[]): string[] {
  const out = new Set(ts);
  for (const t of ts) {
    const syn = SYNONYMS[t];
    if (syn) syn.forEach((s) => out.add(s));
  }
  return [...out];
}

function haystack(tool: ToolMeta): string {
  return [
    tool.name,
    tool.description,
    tool.category,
    tool.subcategory ?? "",
    ...tool.keywords,
    ...tool.tags,
    tool.id,
  ]
    .join(" ")
    .toLowerCase();
}

export function scoreTool(tool: ToolMeta, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return tool.popularity;
  const name = tool.name.toLowerCase();
  if (name === q || tool.id === q) return 2000 + tool.popularity;
  if (name.startsWith(q)) return 1400 + tool.popularity;
  if (tool.id.includes(q) || name.includes(q)) return 1000 + tool.popularity;

  const ts = expand(tokens(q));
  const hay = haystack(tool);
  let hits = 0;
  for (const t of ts) {
    if (name.includes(t)) hits += 8;
    else if (tool.keywords.some((k) => k.toLowerCase().includes(t))) hits += 5;
    else if (hay.includes(t)) hits += 2;
  }
  if (hits === 0) return 0;
  return hits * 40 + tool.popularity;
}

export function searchTools(tools: ToolMeta[], query: string, limit = 40): ToolMeta[] {
  const q = query.trim();
  const pool = tools;
  if (!q) {
    return [...pool].sort((a, b) => b.popularity - a.popularity).slice(0, limit);
  }
  return pool
    .map((t) => ({ t, s: scoreTool(t, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.t);
}
