import type { SearchTool } from "@/types/tool";

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

type SearchRecord = {
  tool: SearchTool;
  index: number;
  id: string;
  name: string;
  keywords: string[];
  haystack: string;
};

type RankedTool = { tool: SearchTool; index: number; score: number };

export type ToolSearchResults = {
  tools: SearchTool[];
  matchCount: number;
};

const indexCache = new WeakMap<readonly SearchTool[], SearchRecord[]>();

function tokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9%+]+/)
    .filter((token) => token.length > 1 || token === "%");
}

function expand(queryTokens: string[]): string[] {
  const expanded = new Set(queryTokens);
  for (const token of queryTokens) {
    for (const synonym of SYNONYMS[token] ?? []) expanded.add(synonym);
  }
  return [...expanded];
}

function buildRecord(tool: SearchTool, index: number): SearchRecord {
  const name = tool.name.toLowerCase();
  const keywords = tool.keywords.map((keyword) => keyword.toLowerCase());
  const haystack = [
    name,
    tool.description,
    tool.category,
    tool.subcategory ?? "",
    ...keywords,
    ...tool.tags,
    tool.id,
  ]
    .join(" ")
    .toLowerCase();
  return { tool, index, id: tool.id.toLowerCase(), name, keywords, haystack };
}

function getIndex(tools: readonly SearchTool[]): SearchRecord[] {
  const cached = indexCache.get(tools);
  if (cached) return cached;
  const index = tools.map(buildRecord);
  indexCache.set(tools, index);
  return index;
}

function scoreRecord(record: SearchRecord, query: string, queryTokens: string[]): number {
  if (!query) return record.tool.popularity;
  if (record.name === query || record.id === query) return 2000 + record.tool.popularity;
  if (record.name.startsWith(query)) return 1400 + record.tool.popularity;
  if (record.id.includes(query) || record.name.includes(query))
    return 1000 + record.tool.popularity;

  let hits = 0;
  for (const token of queryTokens) {
    if (record.name.includes(token)) hits += 8;
    else if (record.keywords.some((keyword) => keyword.includes(token))) hits += 5;
    else if (record.haystack.includes(token)) hits += 2;
  }
  return hits === 0 ? 0 : hits * 40 + record.tool.popularity;
}

function isWorse(left: RankedTool, right: RankedTool): boolean {
  return left.score < right.score || (left.score === right.score && left.index > right.index);
}

function isBetter(left: RankedTool, right: RankedTool): boolean {
  return left.score > right.score || (left.score === right.score && left.index < right.index);
}

function siftUpWorst(heap: RankedTool[], index: number): void {
  let child = index;
  while (child > 0) {
    const parent = Math.floor((child - 1) / 2);
    if (!isWorse(heap[child], heap[parent])) break;
    [heap[parent], heap[child]] = [heap[child], heap[parent]];
    child = parent;
  }
}

function siftDownWorst(heap: RankedTool[], index: number): void {
  let parent = index;
  while (true) {
    const left = parent * 2 + 1;
    const right = left + 1;
    let worst = parent;
    if (left < heap.length && isWorse(heap[left], heap[worst])) worst = left;
    if (right < heap.length && isWorse(heap[right], heap[worst])) worst = right;
    if (worst === parent) return;
    [heap[parent], heap[worst]] = [heap[worst], heap[parent]];
    parent = worst;
  }
}

export function scoreTool(tool: SearchTool, query: string): number {
  const normalized = query.trim().toLowerCase();
  return scoreRecord(buildRecord(tool, 0), normalized, expand(tokens(normalized)));
}

export function searchToolResults(
  tools: readonly SearchTool[],
  query: string,
  limit = 40,
): ToolSearchResults {
  const normalized = query.trim().toLowerCase();
  const queryTokens = expand(tokens(normalized));
  const capacity = Math.max(0, Math.floor(limit));
  const heap: RankedTool[] = [];
  let matchCount = 0;

  for (const record of getIndex(tools)) {
    const score = scoreRecord(record, normalized, queryTokens);
    if (normalized && score <= 0) continue;
    matchCount += 1;
    if (capacity === 0) continue;

    const ranked = { tool: record.tool, index: record.index, score };
    if (heap.length < capacity) {
      heap.push(ranked);
      siftUpWorst(heap, heap.length - 1);
    } else if (isBetter(ranked, heap[0])) {
      heap[0] = ranked;
      siftDownWorst(heap, 0);
    }
  }

  heap.sort((a, b) => b.score - a.score || a.index - b.index);
  return { tools: heap.map((item) => item.tool), matchCount };
}

export function searchTools(tools: readonly SearchTool[], query: string, limit = 40): SearchTool[] {
  return searchToolResults(tools, query, limit).tools;
}
