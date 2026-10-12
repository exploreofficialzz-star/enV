import { tools as allTools } from "@/data/catalog";
import { CATEGORY_MAP } from "@/data/categories";
import type { CategoryId, ToolMeta } from "@/types/tool";
import { makeAccessibilityStudioTools, studioToolForLegacy } from "@/lib/accessibility-studios";

const byId = new Map(allTools.map((t) => [t.id, t]));
const accessibilityStudios = makeAccessibilityStudioTools(allTools);
const byPath = new Map<string, ToolMeta>([
  ...allTools.map((t) => [`${t.category}/${t.slug}`, t] as const),
  ...accessibilityStudios.map((t) => [`${t.category}/${t.slug}`, t] as const),
]);
const searchableTools = [...allTools.filter((tool) => tool.category !== "accessibility"), ...accessibilityStudios];

export function getAllTools(): ToolMeta[] {
  return allTools;
}

/** Public discovery hides generated accessibility action variants, without deleting their routes or source records. */
export function getSearchableTools(): ToolMeta[] {
  return searchableTools;
}

export function getActiveTools(): ToolMeta[] {
  return getSearchableTools().filter((t) => t.status === "active" || t.status === "beta");
}

export function getToolById(id: string): ToolMeta | undefined {
  const tool = byId.get(id);
  return tool?.category === "accessibility" ? studioToolForLegacy(tool, allTools) : tool;
}

export function getToolByPath(category: string, slug: string): ToolMeta | undefined {
  return byPath.get(`${category}/${slug}`);
}

function alphabeticalKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getToolsByCategory(category: CategoryId): ToolMeta[] {
  return (category === "accessibility" ? accessibilityStudios : allTools.filter((t) => t.category === category))
    .slice()
    .sort((a, b) =>
      alphabeticalKey(a.name).localeCompare(alphabeticalKey(b.name)) ||
      a.id.localeCompare(b.id),
    );
}

export function getFeaturedTools(limit = 8): ToolMeta[] {
  return getSearchableTools().filter((t) => t.status === "active" || t.status === "beta")
    .filter((t) => t.featured)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

export function getPopularTools(limit = 12): ToolMeta[] {
  return getSearchableTools().filter((t) => t.status === "active" || t.status === "beta")
    .slice()
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

export function getNewTools(limit = 8): ToolMeta[] {
  return getActiveTools()
    .filter((t) => t.isNew)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

export function getRelatedTools(tool: ToolMeta, limit = 6): ToolMeta[] {
  if (tool.category === "accessibility") {
    return accessibilityStudios.filter((item) => item.id !== tool.id).slice(0, limit);
  }
  const related = tool.related
    .map((id) => byId.get(id))
    .filter((t): t is ToolMeta => Boolean(t && t.status !== "planned"));
  if (related.length >= limit) return related.slice(0, limit);
  const seen = new Set([tool.id, ...related.map((t) => t.id)]);
  const rest = getToolsByCategory(tool.category).filter(
    (t) => !seen.has(t.id) && t.status !== "planned",
  );
  return [...related, ...rest].slice(0, limit);
}

export function activeCount(): number {
  return allTools.filter((t) => t.status === "active" || t.status === "beta").length;
}

export function plannedCount(): number {
  return allTools.filter((t) => t.status === "planned").length;
}

export function totalToolCount(): number {
  return allTools.length;
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORY_MAP[id]?.name ?? id;
}

export function toolPath(tool: ToolMeta): string {
  return `/tools/${tool.category}/${tool.slug}`;
}
