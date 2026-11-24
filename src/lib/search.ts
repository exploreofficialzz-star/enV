import type { ToolMeta } from "@/types/tool";
import { SEARCH_ALIASES } from "@/data/search-aliases";

/**
 * enV internal search (requirements §3).
 *
 * Deterministic, dependency-free lexical retrieval with:
 *  - normalization (case, diacritics, punctuation, hyphen/underscore splitting)
 *  - light stemming so "merge"/"merger", "resize"/"resizer", "image"/"images" meet
 *  - reviewed synonym and task-language expansion (directional, never invented per tool)
 *  - bounded typo tolerance and prefix completion, used only when the exact word is unknown
 *  - field-weighted, idf-weighted scoring with a coverage requirement for multi-word queries
 *  - exact name/ID matches ranked above weak description matches
 *  - popularity as a small capped tiebreak that cannot outrank a better field match
 *  - eligibility filtering and planned-tool tiering before final ranking
 *  - deterministic tie-breaking and a grounded "why this matched" explanation
 *
 * No network, no AI service and no randomness are involved, so this path is always available and
 * identical inputs always give identical ordering. Semantic/AI retrieval, if added later, must be an
 * additional candidate source on top of this, never a replacement.
 *
 * Search only ranks tool metadata. It does not assert that any tool works.
 */

export type SearchField = "name" | "alias" | "id" | "keyword" | "tag" | "subcategory" | "category" | "description";
export type MatchKind = "exact" | "stem" | "synonym" | "fuzzy" | "prefix" | "phrase";

export type MatchReason = { field: SearchField; term: string; matched: string; kind: MatchKind };
export type SearchMatch = { tool: ToolMeta; score: number; reasons: MatchReason[]; explanation: string };
export type QueryInterpretation = {
  normalized: string;
  intent: "empty" | "name" | "task";
  terms: Array<{ term: string; synonyms: string[]; corrections: string[]; completions: string[] }>;
  ignoredWords: string[];
};
export type SearchResults = { tools: ToolMeta[]; matches: SearchMatch[]; matchCount: number; interpretation: QueryInterpretation };
export type SearchOptions = {
  /** Planned tools are labelled "Coming soon" by the UI. They are kept by default but always rank after active/beta tools. */
  includePlanned?: boolean;
  /** Eligibility filter (platform, access, processing, lifecycle). Applied before ranking. */
  filter?: (tool: ToolMeta) => boolean;
};

const FIELD_WEIGHT: Record<SearchField, number> = {
  name: 10, id: 7, keyword: 6, alias: 5, tag: 4, subcategory: 4, category: 3, description: 2,
};

/** Reviewed, directional mappings. Keys are surface tokens the user may type. */
export const SYNONYMS: Record<string, string[]> = {
  photo: ["image", "picture", "pic"],
  picture: ["image", "photo"],
  pic: ["image", "photo"],
  img: ["image"],
  compress: ["minify", "shrink", "optimize", "size"],
  smaller: ["compress", "shrink", "reduce"],
  shrink: ["compress", "reduce"],
  reduce: ["compress", "shrink"],
  resize: ["scale", "dimensions", "size"],
  json: ["javascript object"],
  pwd: ["password"],
  pass: ["password"],
  bmi: ["body mass", "weight"],
  percent: ["percentage", "%"],
  qr: ["qrcode", "barcode"],
  regexp: ["regex"],
  regular: ["regex"],
  uuid: ["guid"],
  hash: ["checksum", "digest", "sha", "md5"],
  color: ["colour", "hex", "rgb"],
  colour: ["color"],
  mockup: ["fake", "demo", "chat", "screenshot"],
  invoice: ["bill", "receipt"],
  pdf: ["document"],
  encode: ["encoding", "base64"],
  decode: ["decoding"],
  a11y: ["accessibility"],
  contrast: ["color contrast", "wcag"],
  alt: ["alt-text", "image description"],
  focus: ["focus ring", "focus state"],
  aria: ["accessible name", "accessibility tree"],
  tab: ["keyboard navigation", "tab order"],
  animation: ["motion", "reduced motion"],
  readability: ["plain language", "text spacing"],
  merge: ["combine", "join"],
  combine: ["merge", "join"],
  join: ["merge", "combine"],
  split: ["separate", "divide"],
  change: ["convert"],
  transform: ["convert"],
  create: ["generate"],
  scan: ["read", "reader"],
  scanner: ["reader", "scan"],
  calc: ["calculator"],
  jpeg: ["jpg"],
  jpg: ["jpeg"],
  tiff: ["tif"],
  tif: ["tiff"],
};

const STOP_WORDS = new Set([
  "a", "an", "the", "to", "of", "for", "my", "me", "i", "do", "how", "can", "you", "what", "is", "are", "make",
  "online", "free", "tool", "tools", "with", "from", "into", "in", "on", "and", "or", "it", "this", "that", "using",
  "use", "want", "need", "please", "best", "app", "something", "some", "get", "be",
]);

// ---------------------------------------------------------------------------------------------
// Normalization and stemming
// ---------------------------------------------------------------------------------------------

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9%+#\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Format spellings that mean the same file type, for conversion-direction comparison only. */
const formatNorm = (value: string) => value.replace(/\bjpeg\b/g, "jpg").replace(/\btif\b/g, "tiff");

/** Stemmed, format-normalized phrase so "image to pdf" matches "Images to PDF". */
const stemPhrase = (value: string) => tokenize(formatNorm(normalizeText(value))).map(stem).join(" ");

function tokenize(value: string): string[] {
  return normalizeText(value).split(" ").filter((token) => token.length > 1 || token === "%");
}

function stripPlural(token: string): string {
  if (token.length <= 3) return token;
  if (/(ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("ies") && token.length > 4) return token.slice(0, -3) + "y";
  if (token.endsWith("s") && !token.endsWith("ss") && !token.endsWith("us") && !token.endsWith("is")) return token.slice(0, -1);
  return token;
}

// "ion" and "or" (not "ation"/"ator") so calculate/calculation/calculator and generate/generation/generator share one stem.
const SUFFIXES = ["ion", "ing", "ers", "er", "or", "ed", "e"];

/** Light, consistent stemmer. Stems need not be words; query and corpus use the same function. */
export function stem(token: string): string {
  if (token.length <= 3 || /\d/.test(token)) return token;
  let out = stripPlural(token);
  for (const suffix of SUFFIXES) {
    if (out.endsWith(suffix) && out.length - suffix.length >= 4) { out = out.slice(0, -suffix.length); break; }
  }
  return out;
}

function boundedDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) rows.push(new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let best = max + 1;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2][j - 2] + 1);
      rows[i][j] = value;
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
  }
  return rows[a.length][b.length];
}

// ---------------------------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------------------------

type StemInfo = { weight: number; field: SearchField; surface: string };
type ToolDoc = {
  tool: ToolMeta;
  stems: Map<string, StemInfo>;
  surfaces: Set<string>;
  normalizedName: string;
  normalizedId: string;
  nameTokenCount: number;
  nameStems: Set<string>;
  aliasPhrases: Set<string>;
  stemmedName: string;
};
type PoolIndex = { docs: ToolDoc[]; postings: Map<string, number[]>; vocabulary: Map<string, number>; surfaceVocabulary: Map<string, string>; size: number };

const docCache = new WeakMap<ToolMeta, ToolDoc>();
const poolCache = new WeakMap<ToolMeta[], PoolIndex>();

function buildDoc(tool: ToolMeta): ToolDoc {
  const cached = docCache.get(tool);
  if (cached) return cached;
  const stems = new Map<string, StemInfo>();
  const surfaces = new Set<string>();
  const nameStems = new Set<string>();
  const add = (text: string, field: SearchField) => {
    for (const surface of tokenize(text)) {
      surfaces.add(surface);
      const key = stem(surface);
      const weight = FIELD_WEIGHT[field];
      if (field === "name") nameStems.add(key);
      const existing = stems.get(key);
      if (!existing || existing.weight < weight) stems.set(key, { weight, field, surface });
    }
  };
  add(tool.name, "name");
  const aliasPhrases = new Set<string>();
  for (const phrase of SEARCH_ALIASES[tool.id]?.phrases ?? []) { aliasPhrases.add(normalizeText(phrase)); add(phrase, "alias"); }
  add(tool.id, "id");
  for (const keyword of tool.keywords ?? []) add(keyword, "keyword");
  for (const tag of tool.tags ?? []) add(tag, "tag");
  add(tool.subcategory ?? "", "subcategory");
  add(tool.category, "category");
  add(tool.description ?? "", "description");
  const doc: ToolDoc = {
    tool,
    stems,
    surfaces,
    normalizedName: normalizeText(tool.name),
    normalizedId: tool.id.toLowerCase(),
    nameTokenCount: tokenize(tool.name).length,
    nameStems,
    aliasPhrases,
    stemmedName: stemPhrase(tool.name),
  };
  docCache.set(tool, doc);
  return doc;
}

function buildPool(tools: ToolMeta[]): PoolIndex {
  const cached = poolCache.get(tools);
  if (cached && cached.size === tools.length) return cached;
  const docs = tools.map(buildDoc);
  const postings = new Map<string, number[]>();
  const vocabulary = new Map<string, number>();
  docs.forEach((doc, index) => {
    for (const key of doc.stems.keys()) {
      const list = postings.get(key);
      if (list) list.push(index); else postings.set(key, [index]);
    }
  });
  for (const [key, list] of postings) vocabulary.set(key, list.length);
  const surfaceVocabulary = new Map<string, string>();
  for (const doc of docs) for (const surface of doc.surfaces) if (!surfaceVocabulary.has(surface)) surfaceVocabulary.set(surface, stem(surface));
  const pool = { docs, postings, vocabulary, surfaceVocabulary, size: tools.length };
  poolCache.set(tools, pool);
  return pool;
}

const idf = (pool: PoolIndex, df: number) => Math.log(1 + pool.size / (1 + df));

// ---------------------------------------------------------------------------------------------
// Query interpretation
// ---------------------------------------------------------------------------------------------

type Variant = { stems: string[]; weight: number; kind: MatchKind; label: string };
type Term = { surface: string; stem: string; variants: Variant[]; idfValue: number };

function maxEdits(length: number): number {
  return length >= 9 ? 2 : length >= 4 ? 1 : 0;
}

function interpret(pool: PoolIndex, query: string) {
  const normalized = normalizeText(query);
  const all = normalized.split(" ").filter((token) => token.length > 1 || token === "%");
  const content = all.filter((token) => !STOP_WORDS.has(token));
  const surfaces = content.length ? content : all;
  const ignoredWords = all.filter((token) => !surfaces.includes(token));
  const terms: Term[] = [];
  const info: QueryInterpretation["terms"] = [];
  surfaces.forEach((surface, index) => {
    const key = stem(surface);
    const variants: Variant[] = [];
    const df = pool.vocabulary.get(key) ?? 0;
    variants.push({ stems: [key], weight: 1, kind: "exact", label: surface });
    const synonyms: string[] = [];
    for (const synonym of SYNONYMS[surface] ?? []) {
      const synonymStems = tokenize(synonym).map(stem);
      if (synonymStems.length) { variants.push({ stems: synonymStems, weight: 0.7, kind: "synonym", label: synonym }); synonyms.push(synonym); }
    }
    const corrections: string[] = [];
    const completions: string[] = [];
    if (df === 0 && key.length >= 3) {
      const limit = maxEdits(key.length);
      if (limit > 0) {
        // Compare the typed word with indexed words (surface form) and with indexed stems, so a
        // dropped letter such as "mrge" still reaches "merge"/"merger" even though their stems differ.
        const best = new Map<string, { distance: number; df: number }>();
        const consider = (candidateStem: string, distance: number) => {
          if (distance > limit) return;
          const df = pool.vocabulary.get(candidateStem) ?? 0;
          const existing = best.get(candidateStem);
          if (!existing || distance < existing.distance) best.set(candidateStem, { distance, df });
        };
        for (const [candidateSurface, candidateStem] of pool.surfaceVocabulary) {
          if (Math.abs(candidateSurface.length - surface.length) > limit && Math.abs(candidateStem.length - key.length) > limit) continue;
          if (candidateSurface[0] !== surface[0] && candidateStem[0] !== key[0]) continue;
          consider(candidateStem, Math.min(boundedDistance(surface, candidateSurface, limit), boundedDistance(key, candidateStem, limit)));
        }
        const near = [...best.entries()]
          .map(([candidate, value]) => ({ candidate, distance: value.distance, df: value.df }))
          .sort((a, b) => a.distance - b.distance || b.df - a.df || a.candidate.localeCompare(b.candidate));
        for (const item of near.slice(0, 3)) {
          variants.push({ stems: [item.candidate], weight: item.distance === 1 ? 0.55 : 0.4, kind: "fuzzy", label: item.candidate });
          corrections.push(item.candidate);
        }
      }
      // Prefix completion is for short, still-being-typed queries only; on longer task phrases it invents matches.
      if (index === surfaces.length - 1 && surfaces.length <= 2) {
        const prefixes: Array<{ candidate: string; df: number }> = [];
        for (const [candidate, candidateDf] of pool.vocabulary) if (candidate.length > key.length && candidate.startsWith(key)) prefixes.push({ candidate, df: candidateDf });
        prefixes.sort((a, b) => b.df - a.df || a.candidate.localeCompare(b.candidate));
        for (const item of prefixes.slice(0, 8)) {
          variants.push({ stems: [item.candidate], weight: 0.65, kind: "prefix", label: item.candidate });
          completions.push(item.candidate);
        }
      }
    }
    const idfSource = df > 0 ? df : variants.slice(1).map((variant) => pool.vocabulary.get(variant.stems[0]) ?? 0).find((value) => value > 0) ?? 0;
    terms.push({ surface, stem: key, variants, idfValue: idf(pool, idfSource) });
    info.push({ term: surface, synonyms, corrections, completions });
  });
  const phrase = surfaces.join(" ");
  const fullPhrase = all.join(" ");
  const intent: QueryInterpretation["intent"] = !normalized ? "empty" : ignoredWords.length > 0 || all.length >= 4 ? "task" : "name";
  return { normalized, phrase, fullPhrase, terms, interpretation: { normalized, intent, terms: info, ignoredWords } satisfies QueryInterpretation };
}

// ---------------------------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------------------------

const popularityBonus = (popularity: number) => 3 * Math.min(1, Math.log10(1 + Math.max(0, Math.min(popularity, 10000))) / 4);

function variantStrength(doc: ToolDoc, variant: Variant): { weight: number; field: SearchField; matched: string } | null {
  let weight = Infinity;
  let field: SearchField = "description";
  let matched = "";
  for (const key of variant.stems) {
    const info = doc.stems.get(key);
    if (!info) return null;
    if (info.weight < weight) { weight = info.weight; field = info.field; matched = info.surface; }
  }
  return { weight, field, matched };
}

function scoreDoc(pool: PoolIndex, doc: ToolDoc, terms: Term[], phrase: string, fullPhrase: string, wantReasons: boolean): { score: number; reasons: MatchReason[] } | null {
  let base = 0;
  let matchedIdf = 0;
  const totalIdf = terms.reduce((sum, term) => sum + term.idfValue, 0) || 1;
  let strongMatch = false;
  let namedTerms = 0;
  const reasons: MatchReason[] = [];
  for (const term of terms) {
    let best = 0;
    let bestReason: MatchReason | null = null;
    let bestStrong = false;
    let bestField: SearchField = "description";
    for (const variant of term.variants) {
      const strength = variantStrength(doc, variant);
      if (!strength) continue;
      const surfaceBonus = variant.kind === "exact" && doc.surfaces.has(term.surface) ? 1 : variant.kind === "exact" ? 0.92 : 1;
      const df = pool.vocabulary.get(variant.stems[0]) ?? 0;
      const value = variant.weight * surfaceBonus * strength.weight * (variant.kind === "exact" ? term.idfValue : idf(pool, df));
      if (value > best) {
        best = value;
        bestStrong = strength.weight >= FIELD_WEIGHT.tag;
        bestField = strength.field;
        if (wantReasons) {
          const kind: MatchKind = variant.kind === "exact" && !doc.surfaces.has(term.surface) ? "stem" : variant.kind;
          bestReason = { field: strength.field, term: term.surface, matched: strength.matched, kind };
        }
      }
    }
    if (best > 0) {
      base += best;
      matchedIdf += term.idfValue;
      if (bestStrong) strongMatch = true;
      if (bestReason) reasons.push(bestReason);
      // Ranking boosts name/ID matches regardless of whether explanations were requested.
      if (bestField === "name" || bestField === "id") namedTerms += 1;
    }
  }
  if (base === 0) return null;
  const coverage = matchedIdf / totalIdf;
  // Multi-word queries must be substantially covered. Two-word queries need both words (or the
  // overwhelmingly rarer one), so a single generic word cannot drag in unrelated tools.
  if (terms.length >= 2 && (coverage < (terms.length === 2 ? 0.75 : 0.6) || !strongMatch)) return null;

  let score = base * (0.4 + 0.6 * coverage);
  if (terms.length > 0 && namedTerms === terms.length) score += 30;
  const nameHasPhrase = phrase.length > 0 && (` ${doc.normalizedName} `).includes(` ${phrase} `);
  if (nameHasPhrase) { score += 40; if (wantReasons) reasons.push({ field: "name", term: phrase, matched: phrase, kind: "phrase" }); }
  if (doc.normalizedName.startsWith(phrase) && phrase) score += 20;
  if (doc.aliasPhrases.has(fullPhrase) || doc.aliasPhrases.has(phrase)) { score += 250; if (wantReasons) reasons.push({ field: "alias", term: fullPhrase, matched: fullPhrase, kind: "phrase" }); }
  const conversion = fullPhrase.replace(/^(convert|change|turn|transform|save)\s+/, "").match(/^(\S+) to (\S+)$/);
  if (conversion) {
    const padded = ` ${doc.stemmedName} `;
    if (padded.includes(` ${stemPhrase(conversion[0])} `)) score += 60;
    else if (padded.includes(` ${stemPhrase(`${conversion[2]} to ${conversion[1]}`)} `)) score -= 15;
  }
  if (doc.normalizedName === fullPhrase || doc.normalizedName === phrase || doc.normalizedId === fullPhrase.replace(/ /g, "-") || doc.normalizedId === phrase.replace(/ /g, "-")) score += 400;
  score -= 0.6 * Math.min(4, Math.max(0, doc.nameTokenCount - namedTerms));
  score += popularityBonus(doc.tool.popularity ?? 0);
  return { score: Math.round(score * 1e6) / 1e6, reasons };
}

function explain(reasons: MatchReason[]): string {
  if (!reasons.length) return "Popular tool";
  const label: Record<SearchField, string> = { name: "name", alias: "common phrasing", id: "tool ID", keyword: "keyword", tag: "tag", subcategory: "subcategory", category: "category", description: "description" };
  const parts = reasons.slice(0, 3).map((reason) => {
    if (reason.kind === "phrase") return reason.field === "alias" ? `common phrasing “${reason.term}”` : `name contains “${reason.term}”`;
    const how = reason.kind === "synonym" ? ` (related to “${reason.term}”)` : reason.kind === "fuzzy" ? ` (closest match to “${reason.term}”)` : reason.kind === "prefix" ? ` (starts with “${reason.term}”)` : "";
    return `${label[reason.field]} “${reason.matched}”${how}`;
  });
  return "Matched " + parts.join("; ");
}

const nameKey = (value: string) => normalizeText(value);

export function searchToolResults(tools: ToolMeta[], query: string, limit = 40, options: SearchOptions = {}): SearchResults {
  const includePlanned = options.includePlanned ?? true;
  const eligible = (tool: ToolMeta) => (includePlanned || tool.status !== "planned") && (options.filter ? options.filter(tool) : true);
  const pool = buildPool(tools);
  const { normalized, phrase, fullPhrase, terms, interpretation } = interpret(pool, query);

  type Ranked = { doc: ToolDoc; score: number };
  const ranked: Ranked[] = [];
  if (!normalized) {
    // Popularity ordering is the empty-search experience only. A non-empty query
    // that consists entirely of ignored filler words must not silently turn into
    // generic recommendations with fabricated relevance explanations.
    for (const doc of pool.docs) if (eligible(doc.tool)) ranked.push({ doc, score: doc.tool.popularity ?? 0 });
  } else if (terms.length > 0) {
    const candidates = new Set<number>();
    for (const term of terms) for (const variant of term.variants) for (const key of variant.stems) for (const index of pool.postings.get(key) ?? []) candidates.add(index);
    for (const index of candidates) {
      const doc = pool.docs[index];
      if (!eligible(doc.tool)) continue;
      const result = scoreDoc(pool, doc, terms, phrase, fullPhrase, false);
      if (result) ranked.push({ doc, score: result.score });
    }
  }
  const tier = (doc: ToolDoc) => (doc.tool.status === "planned" ? 1 : 0);
  ranked.sort((a, b) => tier(a.doc) - tier(b.doc) || b.score - a.score || nameKey(a.doc.tool.name).localeCompare(nameKey(b.doc.tool.name)) || a.doc.tool.id.localeCompare(b.doc.tool.id));

  const top = ranked.slice(0, Math.max(0, limit));
  const matches: SearchMatch[] = top.map(({ doc, score }) => {
    const reasons = normalized && terms.length ? scoreDoc(pool, doc, terms, phrase, fullPhrase, true)?.reasons ?? [] : [];
    return { tool: doc.tool, score, reasons, explanation: explain(reasons) };
  });
  return { tools: matches.map((match) => match.tool), matches, matchCount: ranked.length, interpretation };
}

export function searchTools(tools: ToolMeta[], query: string, limit = 40, options: SearchOptions = {}): ToolMeta[] {
  return searchToolResults(tools, query, limit, options).tools;
}

/** Score one tool in isolation (no corpus statistics). Kept for callers that only need relevance > 0. */
export function scoreTool(tool: ToolMeta, query: string): number {
  const result = searchToolResults([tool], query, 1);
  return result.matches[0]?.score ?? 0;
}
