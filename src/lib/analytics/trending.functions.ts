import { createServerFn } from "@tanstack/react-start";
import { getActiveTools } from "@/lib/registry";
import { isToolUnderProduction } from "@/lib/production-notice";
import { getPublicTrendingTools } from "./analytics.server";

function shuffledToolIds(toolIds: string[]): string[] {
  const shuffled = [...toolIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

/**
 * Keep the public analytics endpoint strictly evidence-based. The Home loader
 * supplies a temporary local-catalogue discovery set only when no ranked data
 * exists; the client replaces it as soon as real aggregate IDs become available.
 */
export const loadHomeTrendingTools = createServerFn({ method: "GET" }).handler(async () => {
  const feed = await getPublicTrendingTools();
  if (feed.toolIds.length > 0) return feed;

  const discoveryIds = getActiveTools()
    .filter((tool) => !isToolUnderProduction(tool))
    .map((tool) => tool.id);
  return {
    ...feed,
    mode: "discovery" as const,
    toolIds: shuffledToolIds(discoveryIds).slice(0, 12),
  };
});
