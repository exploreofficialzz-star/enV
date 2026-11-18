import type { ToolMeta, ToolStatus } from "@/types/tool";

const SYNONYMS: Record<string, string[]> = {
  photo: ["image", "picture", "pic"], picture: ["image", "photo"], pic: ["image", "photo"], img: ["image"],
  compress: ["minify", "shrink", "optimize", "size"], resize: ["scale", "dimensions", "size"],
  json: ["javascript object"], pwd: ["password"], pass: ["password"], bmi: ["body mass", "weight"],
  percent: ["percentage", "%"], qr: ["qrcode", "barcode"], uuid: ["guid"], hash: ["checksum", "digest", "sha", "md5"],
  color: ["colour", "hex", "rgb"], mockup: ["fake", "demo", "chat", "screenshot"], invoice: ["bill", "receipt"],
  pdf: ["document"], encode: ["encoding", "base64"], decode: ["decoding"], a11y: ["accessibility"],
  contrast: ["color contrast", "wcag"], alt: ["alt-text", "image description"], focus: ["focus ring", "focus state"],
  aria: ["accessible name", "accessibility tree"], tab: ["keyboard navigation", "tab order"],
  animation: ["motion", "reduced motion"], readability: ["plain language", "text spacing"],
};

export type SearchFilters = {
  category?: string;
  statuses?: ToolStatus[];
  clientSide?: boolean;
  requiresBackend?: boolean;
};

export type SearchMatchExplanation = {
  score: number;
  matchedFields: string[];
  matchedTerms: string[];
};

export type SearchToolResults = {
  tools: ToolMeta[];
  matchCount: number;
  explanations: Record<string, SearchMatchExplanation>;
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "").replace(/[^a-z0-9%+]+/g, " ").trim();
}
function tokens(value: string): string[] { return normalize(value).split(/\s+/).filter((token) => token.length > 1 || token === "%"); }
function expand(queryTokens: string[]): string[] {
  const out = new Set(queryTokens);
  for (const token of queryTokens) for (const synonym of SYNONYMS[token] ?? []) out.add(normalize(synonym));
  return [...out];
}
function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j];
      row[j] = left[i - 1] === right[j - 1] ? diagonal : 1 + Math.min(row[j], row[j - 1], diagonal);
      diagonal = above;
    }
  }
  return row[right.length];
}
function fuzzyMatch(term: string, value: string): boolean {
  if (value.includes(term)) return true;
  if (term.length < 4) return false;
  return value.split(/\s+/).some((word) => editDistance(term, word) <= (term.length >= 7 ? 2 : 1));
}
function fields(tool: ToolMeta): Record<string, string> {
  return {
    name: normalize(tool.name), id: normalize(tool.id), alias: normalize(tool.slug),
    task: normalize(tool.description), category: normalize(tool.category), subcategory: normalize(tool.subcategory ?? ""),
    capability: normalize(tool.keywords.join(" ")), tags: normalize(tool.tags.join(" ")),
  };
}
function filterTool(tool: ToolMeta, filters?: SearchFilters): boolean {
  if (!filters) return true;
  if (filters.category && tool.category !== filters.category) return false;
  if (filters.statuses && !filters.statuses.includes(tool.status)) return false;
  if (filters.clientSide !== undefined && tool.clientSide !== filters.clientSide) return false;
  if (filters.requiresBackend !== undefined && tool.requiresBackend !== filters.requiresBackend) return false;
  return true;
}

export function explainToolMatch(tool: ToolMeta, query: string): SearchMatchExplanation {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return { score: tool.popularity, matchedFields: [], matchedTerms: [] };
  const queryTerms = tokens(normalizedQuery);
  const expandedTerms = expand(queryTerms);
  const values = fields(tool);
  const weights: Record<string, number> = { id: 1200, name: 1000, alias: 900, task: 360, capability: 300, category: 220, subcategory: 240, tags: 180 };
  const matchedFields = new Set<string>();
  const matchedTerms = new Set<string>();
  let score = 0;
  if (values.id === normalizedQuery || values.name === normalizedQuery) { score += 5000; matchedFields.add(values.id === normalizedQuery ? "id" : "name"); matchedTerms.add(normalizedQuery); }
  else if (values.name.startsWith(normalizedQuery)) { score += 2600; matchedFields.add("name"); matchedTerms.add(normalizedQuery); }
  else if (values.id.includes(normalizedQuery) || values.name.includes(normalizedQuery)) { score += 1800; matchedFields.add(values.id.includes(normalizedQuery) ? "id" : "name"); matchedTerms.add(normalizedQuery); }
  for (const term of expandedTerms) {
    for (const [field, value] of Object.entries(values)) {
      if (!value || !fuzzyMatch(term, value)) continue;
      const exact = value.includes(term);
      score += weights[field] * (exact ? 1 : 0.45);
      matchedFields.add(field); matchedTerms.add(term);
    }
  }
  return { score, matchedFields: [...matchedFields].sort(), matchedTerms: [...matchedTerms].sort() };
}

export function scoreTool(tool: ToolMeta, query: string): number { return explainToolMatch(tool, query).score || 0; }

export function searchToolResults(tools: ToolMeta[], query: string, limit = 40, filters?: SearchFilters): SearchToolResults {
  const eligible = tools.filter((tool) => filterTool(tool, filters));
  const q = normalize(query);
  if (!q) {
    const ordered = [...eligible].sort((a, b) => b.popularity - a.popularity || a.id.localeCompare(b.id));
    return { tools: ordered.slice(0, limit), matchCount: eligible.length, explanations: Object.fromEntries(ordered.slice(0, limit).map((tool) => [tool.id, explainToolMatch(tool, "")])) };
  }
  const ranked = eligible.map((tool) => ({ tool, explanation: explainToolMatch(tool, q) }))
    .filter((item) => item.explanation.score > 0)
    .sort((a, b) => b.explanation.score - a.explanation.score || a.tool.id.localeCompare(b.tool.id));
  return {
    tools: ranked.slice(0, limit).map((item) => item.tool),
    matchCount: ranked.length,
    explanations: Object.fromEntries(ranked.slice(0, limit).map((item) => [item.tool.id, item.explanation])),
  };
}

export function searchTools(tools: ToolMeta[], query: string, limit = 40, filters?: SearchFilters): ToolMeta[] {
  return searchToolResults(tools, query, limit, filters).tools;
}
