import { createServerFn } from "@tanstack/react-start";
import { getPublicTrendingTools } from "./analytics.server";

/**
 * Provide the same real-usage ranking for the initial Home response and the public endpoint.
 */
export const loadHomeTrendingTools = createServerFn({ method: "GET" }).handler(async () => {
  return getPublicTrendingTools();
});
