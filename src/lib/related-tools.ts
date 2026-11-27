import type { ToolMeta } from "@/types/tool";

/**
 * Safe related-tool list for display (requirements §3.7).
 *
 * The catalogue's `related` arrays contain self-references, IDs that no longer exist, links to
 * planned placeholders, and legacy accessibility/developer IDs that now resolve to a Studio. This
 * helper never shows those. It maps a legacy ID to its canonical record, drops anything that is not a
 * usable, discoverable destination, removes duplicates and caps the list.
 *
 * It does not invent relevance: it only filters and canonicalizes what the catalogue declared.
 */
export function relatedToolsFor(
  tool: ToolMeta,
  resolve: (id: string) => ToolMeta | undefined,
  isDiscoverable: (tool: ToolMeta) => boolean,
  limit = 6,
): ToolMeta[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const cap = Math.floor(limit);
  const seen = new Set<string>([tool.id]);
  const out: ToolMeta[] = [];
  const own = resolve(tool.id);
  if (own) seen.add(own.id);
  for (const id of tool.related ?? []) {
    const target = resolve(id);
    if (!target || seen.has(target.id)) continue;
    if (target.status === "planned" || !isDiscoverable(target)) continue;
    seen.add(target.id);
    out.push(target);
    if (out.length >= cap) break;
  }
  return out;
}

export type RelatedSearchSource = Pick<ToolMeta, "id" | "name" | "category" | "subcategory" | "keywords" | "tags">;
export type RelatedSearchCandidate = Pick<ToolMeta, "id" | "name" | "category" | "subcategory" | "status">;
export type RelatedSearchTerm = { value: string; weight: number };

const RELATED_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "by", "for", "from", "in", "into", "is", "it", "of", "on", "or", "the", "to", "with",
  "app", "apps", "best", "create", "created", "creating", "free", "generate", "generated", "generating", "generator", "online",
  "simple", "studio", "tool", "tools", "utility", "utilities", "use", "using", "web", "env", "calculator", "converter",
]);

function relatedTokens(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
}

/** Build a bounded task signature from actual catalogue fields, not popularity or array position. */
export function relatedSearchTerms(tool: RelatedSearchSource): RelatedSearchTerm[] {
  const weights = new Map<string, number>();
  const add = (value: string, weight: number) => {
    for (const token of relatedTokens(value)) {
      if (token.length < 2 || RELATED_STOP_WORDS.has(token)) continue;
      weights.set(token, Math.max(weights.get(token) ?? 0, weight));
    }
  };
  add(tool.name, 2.0);
  add(tool.subcategory ?? "", 1.35);
  for (const keyword of tool.keywords ?? []) add(keyword, 1.15);
  for (const tag of tool.tags ?? []) add(tag, 0.8);
  return [...weights]
    .map(([value, weight], order) => ({ value, weight, order }))
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .slice(0, 8)
    .map(({ value, weight }) => ({ value, weight }));
}

export function relatedSortKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const compareRelatedText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

/**
 * Ranks candidate tools by agreement across single-term searches of the source tool's
 * name, subcategory, keywords and tags. The injected search callback is the platform's
 * canonical search implementation, keeping Web, Android and iOS ranking aligned.
 */
export function relatedToolsBySearch<T extends RelatedSearchCandidate>(
  source: RelatedSearchSource,
  search: (query: string, limit: number) => T[],
  limit = 6,
  excludedIds: ReadonlySet<string> = new Set<string>(),
  allowCandidate: (candidate: T) => boolean = () => true,
): T[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const cap = Math.floor(limit);
  const scores = new Map<string, { tool: T; matches: number; score: number }>();
  for (const term of relatedSearchTerms(source)) {
    const matches = search(term.value, 48);
    matches.forEach((candidate, index) => {
      if (
        candidate.id === source.id
        || excludedIds.has(candidate.id)
        || candidate.status === "planned"
        || !allowCandidate(candidate)
      ) return;
      const current = scores.get(candidate.id) ?? { tool: candidate, matches: 0, score: 0 };
      current.matches += 1;
      current.score += term.weight / (12 + index);
      scores.set(candidate.id, current);
    });
  }
  const sourceSubcategory = relatedSortKey(source.subcategory ?? "");
  return [...scores.values()]
    .sort((a, b) => {
      if (a.matches !== b.matches) return b.matches - a.matches;
      if (a.score !== b.score) return b.score - a.score;
      const aSubcategory = Boolean(sourceSubcategory && relatedSortKey(a.tool.subcategory ?? "") === sourceSubcategory);
      const bSubcategory = Boolean(sourceSubcategory && relatedSortKey(b.tool.subcategory ?? "") === sourceSubcategory);
      if (aSubcategory !== bSubcategory) return aSubcategory ? -1 : 1;
      const aCategory = a.tool.category === source.category;
      const bCategory = b.tool.category === source.category;
      if (aCategory !== bCategory) return aCategory ? -1 : 1;
      return compareRelatedText(relatedSortKey(a.tool.name), relatedSortKey(b.tool.name))
        || compareRelatedText(a.tool.id, b.tool.id);
    })
    .slice(0, cap)
    .map((entry) => entry.tool);
}
