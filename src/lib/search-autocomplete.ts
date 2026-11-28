import { SEARCH_ALIASES } from "@/data/search-aliases";
import { normalizeText, searchToolResults, SYNONYMS, type SearchOptions, type SearchResults } from "@/lib/search";
import type { ToolMeta } from "@/types/tool";

const MIN_PREFIX_LENGTH = 2;
const MAX_PREFIX_LENGTH = 12;
const MAX_NAME_CANDIDATES_PER_TERM = 160;
const MAX_FIELD_CANDIDATES_PER_TERM = 240;
const SUGGESTION_CACHE_SIZE = 100;
const SEARCH_CACHE_SIZE = 32;

const SUGGESTION_STOP_WORDS = new Set([
  "a", "an", "the", "to", "of", "for", "my", "me", "i", "do", "how", "can", "you", "what", "is", "are",
  "make", "create", "generate", "convert", "change", "turn", "find", "show", "please", "want", "need",
  "online", "free", "tool", "tools", "with", "from", "into", "in", "on", "and", "or", "it", "this", "that",
  "using", "use", "best", "app", "something", "some", "get", "be",
]);

type SuggestionDoc = {
  tool: ToolMeta;
  normalizedName: string;
  nameTokens: Set<string>;
  fieldTokens: Set<string>;
  aliasPhrases: Set<string>;
};

type SuggestionIndex = {
  docs: SuggestionDoc[];
  namePrefixes: Map<string, number[]>;
  fieldPrefixes: Map<string, number[]>;
  queryCache: Map<string, ToolMeta[]>;
};

const suggestionIndexes = new WeakMap<ToolMeta[], SuggestionIndex>();
const searchResultCaches = new WeakMap<ToolMeta[], Map<string, SearchResults>>();

function normalizedTokens(values: string[]): string[] {
  return values.flatMap((value) => normalizeText(value).split(" "))
    .filter((token) => token.length >= MIN_PREFIX_LENGTH);
}

function addPrefixPostings(
  target: Map<string, number[]>,
  tokens: Set<string>,
  docIndex: number,
): void {
  const prefixes = new Set<string>();
  for (const token of tokens) {
    const maxLength = Math.min(token.length, MAX_PREFIX_LENGTH);
    for (let length = MIN_PREFIX_LENGTH; length <= maxLength; length += 1) {
      prefixes.add(token.slice(0, length));
    }
  }

  for (const prefix of prefixes) {
    let posting = target.get(prefix);
    if (!posting) {
      posting = [];
      target.set(prefix, posting);
    }
    posting.push(docIndex);
  }
}

function buildSuggestionIndex(tools: ToolMeta[]): SuggestionIndex {
  const existing = suggestionIndexes.get(tools);
  if (existing) return existing;

  // Suggestions are pre-ranked in a stable order so each prefix lookup can stop early.
  const orderedTools = tools.slice().sort((a, b) =>
    Number(a.status === "planned") - Number(b.status === "planned")
    || (b.popularity ?? 0) - (a.popularity ?? 0)
    || normalizeText(a.name).localeCompare(normalizeText(b.name))
    || a.id.localeCompare(b.id),
  );

  const docs: SuggestionDoc[] = orderedTools.map((tool) => {
    const aliases = SEARCH_ALIASES[tool.id]?.phrases ?? [];
    const nameTokens = new Set(normalizedTokens([tool.name]));
    const fieldTokens = new Set(normalizedTokens([
      tool.id,
      tool.category,
      tool.subcategory ?? "",
      ...(tool.keywords ?? []),
      ...(tool.tags ?? []),
      ...aliases,
    ]));
    return {
      tool,
      normalizedName: normalizeText(tool.name),
      nameTokens,
      fieldTokens,
      aliasPhrases: new Set(aliases.map(normalizeText)),
    };
  });

  const namePrefixes = new Map<string, number[]>();
  const fieldPrefixes = new Map<string, number[]>();
  docs.forEach((doc, index) => {
    addPrefixPostings(namePrefixes, doc.nameTokens, index);
    addPrefixPostings(fieldPrefixes, doc.fieldTokens, index);
  });

  const created: SuggestionIndex = { docs, namePrefixes, fieldPrefixes, queryCache: new Map() };
  suggestionIndexes.set(tools, created);
  return created;
}

/**
 * Prepares the small autocomplete index during browser idle time.
 * The index contains names, IDs, categories, tags, keywords and reviewed aliases only.
 * It deliberately excludes long descriptions and never calls the full ranking algorithm.
 */
export function prepareToolSuggestions(tools: ToolMeta[]): void {
  buildSuggestionIndex(tools);
}

function suggestionTerms(query: string): string[] {
  const all = normalizeText(query).split(" ").filter((token) => token.length >= MIN_PREFIX_LENGTH);
  if (!all.length) return [];
  const useful = all.filter((token) => !SUGGESTION_STOP_WORDS.has(token));
  return useful.length ? useful : all;
}

function termVariants(term: string): string[] {
  const related = (SYNONYMS[term] ?? []).flatMap((value) => normalizeText(value).split(" "));
  return [...new Set([term, ...related].filter((value) => value.length >= MIN_PREFIX_LENGTH))];
}

function hasPrefix(tokens: Set<string>, variants: string[]): boolean {
  for (const token of tokens) {
    if (variants.some((variant) => token.startsWith(variant))) return true;
  }
  return false;
}

function readCandidates(
  index: Map<string, number[]>,
  variant: string,
  maxCandidates: number,
  docs: SuggestionDoc[],
  matches: Set<number>,
): void {
  const key = variant.slice(0, MAX_PREFIX_LENGTH);
  const posting = index.get(key);
  if (!posting) return;

  let added = 0;
  for (const docIndex of posting) {
    const doc = docs[docIndex];
    if (!hasPrefix(doc.nameTokens, [variant]) && !hasPrefix(doc.fieldTokens, [variant])) continue;
    matches.add(docIndex);
    added += 1;
    if (added >= maxCandidates) break;
  }
}

function rememberSuggestions(cache: Map<string, ToolMeta[]>, key: string, value: ToolMeta[]): ToolMeta[] {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > SUGGESTION_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return value;
}

/**
 * Fast local autocomplete. It looks up only prefix-index postings (bounded per term),
 * then ranks that small candidate set. Full fuzzy search is reserved for submitted queries.
 */
export function suggestTools(tools: ToolMeta[], query: string, limit = 8): ToolMeta[] {
  const normalized = normalizeText(query);
  const cacheKey = normalized + "\u0000" + Math.max(0, limit);
  const index = buildSuggestionIndex(tools);
  const cached = index.queryCache.get(cacheKey);
  if (cached) {
    index.queryCache.delete(cacheKey);
    index.queryCache.set(cacheKey, cached);
    return cached;
  }

  const terms = suggestionTerms(query);
  if (!terms.length || limit <= 0) return rememberSuggestions(index.queryCache, cacheKey, []);

  const termVariants = terms.map(termVariants);
  const candidateIndexes = new Set<number>();
  for (const variants of termVariants) {
    for (const variant of variants) {
      readCandidates(index.namePrefixes, variant, MAX_NAME_CANDIDATES_PER_TERM, index.docs, candidateIndexes);
      readCandidates(index.fieldPrefixes, variant, MAX_FIELD_CANDIDATES_PER_TERM, index.docs, candidateIndexes);
    }
  }

  const minimumMatchedTerms = terms.length === 1 ? 1 : terms.length === 2 ? 2 : Math.max(2, terms.length - 1);
  const ranked: Array<{ doc: SuggestionDoc; score: number }> = [];

  for (const docIndex of candidateIndexes) {
    const doc = index.docs[docIndex];
    let matchedTerms = 0;
    let matchedNameTerms = 0;

    for (let termIndex = 0; termIndex < terms.length; termIndex += 1) {
      const variants = termVariants[termIndex];
      const nameMatch = hasPrefix(doc.nameTokens, variants);
      const fieldMatch = hasPrefix(doc.fieldTokens, variants);
      if (nameMatch || fieldMatch) matchedTerms += 1;
      if (nameMatch) matchedNameTerms += 1;
    }

    if (matchedTerms < minimumMatchedTerms) continue;

    const exactName = doc.normalizedName === normalized;
    const namePhrasePrefix = doc.normalizedName.startsWith(normalized);
    const namePhraseContains = normalized.length >= 3 && doc.normalizedName.includes(normalized);
    const aliasPrefix = [...doc.aliasPhrases].some((phrase) => phrase.startsWith(normalized));
    const popularity = Math.max(0, Math.min(doc.tool.popularity ?? 0, 10000));
    const score =
      (exactName ? 500 : 0)
      + (namePhrasePrefix ? 140 : 0)
      + (namePhraseContains ? 35 : 0)
      + (aliasPrefix ? 80 : 0)
      + matchedNameTerms * 24
      + matchedTerms * 10
      + Math.min(5, Math.log10(1 + popularity))
      - (doc.tool.status === "planned" ? 100 : 0);

    ranked.push({ doc, score });
  }

  ranked.sort((a, b) =>
    b.score - a.score
    || a.doc.normalizedName.localeCompare(b.doc.normalizedName)
    || a.doc.tool.id.localeCompare(b.doc.tool.id),
  );

  return rememberSuggestions(
    index.queryCache,
    cacheKey,
    ranked.slice(0, limit).map(({ doc }) => doc.tool),
  );
}

/**
 * In-memory LRU for submitted full-search results. It is scoped to the immutable catalogue
 * array, stores no search history on disk, and bypasses caching for caller-supplied filters.
 */
export function searchToolResultsCached(
  tools: ToolMeta[],
  query: string,
  limit = 40,
  options: SearchOptions = {},
): SearchResults {
  if (options.filter) return searchToolResults(tools, query, limit, options);

  const includePlanned = options.includePlanned ?? true;
  const key = normalizeText(query) + "\u0000" + Math.max(0, limit) + "\u0000" + Number(includePlanned);
  let cache = searchResultCaches.get(tools);
  if (!cache) {
    cache = new Map<string, SearchResults>();
    searchResultCaches.set(tools, cache);
  }

  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  const results = searchToolResults(tools, query, limit, options);
  cache.set(key, results);
  while (cache.size > SEARCH_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return results;
}
