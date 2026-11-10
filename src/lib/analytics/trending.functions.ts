import { createServerFn } from "@tanstack/react-start";
import { getPublicTrendingDiscoveryTools } from "./analytics.server";

/**
 * Include the same shared daily discovery order in the initial Home response.
 * The Home client refreshes it from the cached public endpoint after hydration,
 * allowing qualifying analytics rankings to replace discovery mode automatically.
 */
export const loadHomeTrendingDiscovery = createServerFn({ method: "GET" }).handler(async () => {
  return getPublicTrendingDiscoveryTools();
});
