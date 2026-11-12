import { createServerFn } from "@tanstack/react-start";
import { getActiveTools } from "@/lib/registry";
import { isToolUnderProduction } from "@/lib/production-notice";
import { getPublicTrendingTools } from "./analytics.server";
import type { ToolMeta } from "@/types/tool";

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function randomCrossCategoryTools(tools: ToolMeta[], limit: number): ToolMeta[] {
  const byCategory = new Map<string, ToolMeta[]>();
  for (const tool of tools) {
    if (isToolUnderProduction(tool)) continue;
    const categoryTools = byCategory.get(tool.category) ?? [];
    categoryTools.push(tool);
    byCategory.set(tool.category, categoryTools);
  }

  const groups = shuffled([...byCategory.values()].map((group) => shuffled(group)));
  const selection: ToolMeta[] = [];
  while (selection.length < limit) {
    let addedInRound = false;
    for (const group of groups) {
      const next = group.shift();
      if (!next) continue;
      selection.push(next);
      addedInRound = true;
      if (selection.length === limit) break;
    }
    if (!addedInRound) break;
  }
  return selection;
}

/**
 * Keep the public analytics endpoint strictly evidence-based. The Home loader
 * supplies a temporary local-catalogue discovery set only when no ranked data
 * exists; the client replaces it as soon as real aggregate IDs become available.
 */
export const loadHomeTrendingTools = createServerFn({ method: "GET" }).handler(async () => {
  const feed = await getPublicTrendingTools();
  if (feed.toolIds.length > 0) return feed;

  const discoveryIds = randomCrossCategoryTools(getActiveTools(), 12).map((tool) => tool.id);
  return {
    ...feed,
    mode: "discovery" as const,
    toolIds: discoveryIds,
  };
});
