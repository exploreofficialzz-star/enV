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
