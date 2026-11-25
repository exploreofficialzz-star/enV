import type { ToolMeta } from "@/types/tool";
import type { SearchMatch } from "@/lib/search";

/**
 * Discovery filters, sorting and URL state (requirements §3.3).
 *
 * Only filters the data can truthfully support are offered:
 *  - platform / execution path come from the native execution matrix (classification, not test evidence)
 *  - processing and sign-in use catalogue-DECLARED flags and are labelled as declared
 * Deliberately not offered until evidence exists: "AI-assisted", "offline verified", "measured
 * popularity" and "recently verified" sorting. Nothing is inferred from names, tags or categories.
 */

export type PlatformId = "web" | "android" | "ios";
export type ExecutionPath = "native-device" | "native-with-enV-service" | "web-only-browser-handoff" | "web";
export type Availability = (toolId: string, platform: PlatformId) => ExecutionPath | null;

export const SORT_MODES = ["best-match", "name", "newest"] as const;
export type SortMode = (typeof SORT_MODES)[number];

export type DiscoveryFilters = {
  category?: string;
  platform?: PlatformId;
  /** "native" = runs inside the app; "handoff" = opens the canonical Web route in the system browser. */
  execution?: "native" | "handoff";
  processing?: "declared-client-side" | "declared-backend";
  signIn?: "required" | "not-required";
  status?: "active" | "beta" | "planned";
};

const PLATFORMS: readonly string[] = ["web", "android", "ios"];
const EXECUTIONS: readonly string[] = ["native", "handoff"];
const PROCESSING: readonly string[] = ["declared-client-side", "declared-backend"];
const SIGN_IN: readonly string[] = ["required", "not-required"];
const STATUSES: readonly string[] = ["active", "beta", "planned"];
const CATEGORY_PATTERN = /^[a-z0-9-]{1,40}$/;

/** Build an eligibility predicate. Applied BEFORE ranking so filters never reorder, only remove. */
export function buildEligibility(filters: DiscoveryFilters, availability: Availability): (tool: ToolMeta) => boolean {
  return (tool) => {
    if (filters.category && tool.category !== filters.category) return false;
    if (filters.status && tool.status !== filters.status) return false;
    if (filters.processing === "declared-client-side" && !(tool.clientSide && !tool.requiresBackend)) return false;
    if (filters.processing === "declared-backend" && !tool.requiresBackend) return false;
    if (filters.signIn === "required" && !tool.requiresAuth) return false;
    if (filters.signIn === "not-required" && tool.requiresAuth) return false;
    if (filters.platform) {
      const path = availability(tool.id, filters.platform);
      if (path === null) return false;
      if (filters.execution === "native" && (path === "web-only-browser-handoff" || path === "web")) return false;
      if (filters.execution === "handoff" && path !== "web-only-browser-handoff") return false;
    } else if (filters.execution) {
      return false;
    }
    return true;
  };
}

/** Parse untrusted URL parameters. Unknown or malformed values are dropped, never passed through. */
export function decodeDiscoveryState(params: Record<string, unknown>): { q: string; filters: DiscoveryFilters; sort: SortMode } {
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const filters: DiscoveryFilters = {};
  const category = one("category");
  if (CATEGORY_PATTERN.test(category)) filters.category = category;
  if (PLATFORMS.includes(one("platform"))) filters.platform = one("platform") as PlatformId;
  if (
    EXECUTIONS.includes(one("execution"))
    && (filters.platform === "android" || filters.platform === "ios")
  ) filters.execution = one("execution") as DiscoveryFilters["execution"];
  if (PROCESSING.includes(one("processing"))) filters.processing = one("processing") as DiscoveryFilters["processing"];
  if (SIGN_IN.includes(one("signIn"))) filters.signIn = one("signIn") as DiscoveryFilters["signIn"];
  if (STATUSES.includes(one("status"))) filters.status = one("status") as DiscoveryFilters["status"];
  const sort = (SORT_MODES as readonly string[]).includes(one("sort")) ? (one("sort") as SortMode) : "best-match";
  return { q: one("q").slice(0, 200), filters, sort };
}

/** Serialize to the smallest URL; defaults are omitted so refresh/back/forward round-trip exactly. */
export function encodeDiscoveryState(state: { q?: string; filters?: DiscoveryFilters; sort?: SortMode }): Record<string, string> {
  const out: Record<string, string> = {};
  if (state.q?.trim()) out.q = state.q.trim().slice(0, 200);
  const filters = { ...(state.filters ?? {}) };
  if (filters.platform !== "android" && filters.platform !== "ios") delete filters.execution;
  for (const [key, value] of Object.entries(filters)) if (value) out[key] = value;
  if (state.sort && state.sort !== "best-match") out.sort = state.sort;
  return out;
}

/**
 * Filtered/sorted discovery pages are interaction states, not landing pages. Only the unfiltered,
 * unsorted category route is indexable, which avoids crawlable query×filter combinations.
 */
export function isIndexableDiscoveryState(state: { q?: string; filters?: DiscoveryFilters; sort?: SortMode }): boolean {
  return !state.q?.trim() && Object.keys(state.filters ?? {}).length === 0 && (state.sort ?? "best-match") === "best-match";
}

const nameKey = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

/** Stable re-sort of search matches. "best-match" keeps the ranker's order untouched. */
export function sortMatches<T extends Pick<SearchMatch, "tool">>(matches: T[], mode: SortMode): T[] {
  if (mode === "best-match") return matches.slice();
  const byName = (a: T, b: T) => nameKey(a.tool.name).localeCompare(nameKey(b.tool.name)) || a.tool.id.localeCompare(b.tool.id);
  if (mode === "name") return matches.slice().sort(byName);
  return matches.slice().sort((a, b) => Number(!!b.tool.isNew) - Number(!!a.tool.isNew) || byName(a, b));
}
