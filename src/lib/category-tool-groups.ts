import type { ToolMeta } from "@/types/tool";

export type CategoryToolGroup = {
  id: string;
  label: string;
  tools: ToolMeta[];
};

/**
 * Group a category's currently visible tools only when its subcategory metadata
 * demonstrates at least two substantial workflows. Small or missing labels are
 * kept in a single "Other tools" group, while unsupported taxonomy falls back
 * to the category's existing flat grid.
 */
export function groupToolsBySubcategory(
  tools: readonly ToolMeta[],
): CategoryToolGroup[] | null {
  const grouped = new Map<string, { label: string; tools: ToolMeta[] }>();

  for (const tool of tools) {
    const label = tool.subcategory?.trim();
    if (!label) continue;

    const key = label.toLocaleLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.tools.push(tool);
    } else {
      grouped.set(key, { label, tools: [tool] });
    }
  }

  const meaningful = [...grouped.entries()].filter(([, group]) => group.tools.length >= 2);
  if (meaningful.length < 2) return null;

  const meaningfulKeys = new Set(meaningful.map(([key]) => key));
  const result: CategoryToolGroup[] = meaningful.map(([key, group]) => ({
    id: "subcategory-" + key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    label: group.label,
    tools: group.tools,
  }));

  const otherTools = tools.filter((tool) => {
    const key = tool.subcategory?.trim().toLocaleLowerCase();
    return !key || !meaningfulKeys.has(key);
  });

  if (otherTools.length) {
    result.push({ id: "other-tools", label: "Other tools", tools: otherTools });
  }

  return result;
}
