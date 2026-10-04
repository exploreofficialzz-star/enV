import { CATEGORY_MAP } from "@/data/categories";
import type { CategoryId, ToolMeta, ToolSummary } from "@/types/tool";
export { toolPath } from "@/lib/tool-path";

function alphabeticalKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getAllTools(tools: readonly ToolSummary[]): readonly ToolSummary[] {
  return tools;
}

export function getActiveTools(tools: readonly ToolSummary[]): ToolSummary[] {
  return tools.filter((tool) => tool.status === "active" || tool.status === "beta");
}

export function getToolById(tools: readonly ToolSummary[], id: string): ToolSummary | undefined {
  return tools.find((tool) => tool.id === id);
}

export function getToolByPath(
  tools: readonly ToolSummary[],
  category: string,
  slug: string,
): ToolSummary | undefined {
  return tools.find((tool) => tool.category === category && tool.slug === slug);
}

export function getToolsByCategory(
  tools: readonly ToolSummary[],
  category: CategoryId,
): ToolSummary[] {
  return tools
    .filter((tool) => tool.category === category)
    .sort(
      (a, b) =>
        alphabeticalKey(a.name).localeCompare(alphabeticalKey(b.name)) || a.id.localeCompare(b.id),
    );
}

export function getFeaturedTools(tools: readonly ToolSummary[], limit = 8): ToolSummary[] {
  return getActiveTools(tools)
    .filter((tool) => tool.featured)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

export function getPopularTools(tools: readonly ToolSummary[], limit = 12): ToolSummary[] {
  return getActiveTools(tools)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

export function getNewTools(tools: readonly ToolSummary[], limit = 8): ToolSummary[] {
  return getActiveTools(tools)
    .filter((tool) => tool.isNew)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

export function getRelatedTools(
  tool: ToolMeta,
  tools: readonly ToolSummary[],
  limit = 6,
): ToolSummary[] {
  const byId = new Map(tools.map((item) => [item.id, item]));
  const related = tool.related
    .map((id) => byId.get(id))
    .filter((item): item is ToolSummary => Boolean(item && item.status !== "planned"));
  if (related.length >= limit) return related.slice(0, limit);
  const seen = new Set([tool.id, ...related.map((item) => item.id)]);
  const rest = getToolsByCategory(tools, tool.category).filter(
    (item) => !seen.has(item.id) && item.status !== "planned",
  );
  return [...related, ...rest].slice(0, limit);
}

export function activeCount(tools: readonly ToolSummary[]): number {
  return tools.filter((tool) => tool.status === "active" || tool.status === "beta").length;
}

export function plannedCount(tools: readonly ToolSummary[]): number {
  return tools.filter((tool) => tool.status === "planned").length;
}

export function totalToolCount(tools: readonly ToolSummary[]): number {
  return tools.length;
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORY_MAP[id]?.name ?? id;
}
