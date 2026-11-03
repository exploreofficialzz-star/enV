import type { CategoryId, ToolMeta } from "@/types/tool";

/** Categories that are currently available and must remain directly accessible. */
export const PRODUCTION_EXEMPT_CATEGORIES = new Set<CategoryId>([
  "accessibility",
  "audio",
  "business",
  "calculators",
  "datetime",
  "developer",
  "design",
  "ecommerce",
  "qr",
  "video",
]);

/** Individually implemented tools may be available without opening their entire category. */
export const PRODUCTION_EXEMPT_TOOL_IDS = new Set(["a-book", "zip-any-file"]);

/** Every other tool outside the category allowlist remains behind the production notice. */
export function isToolUnderProduction(tool: Pick<ToolMeta, "id" | "category">): boolean {
  return !PRODUCTION_EXEMPT_TOOL_IDS.has(tool.id) && !PRODUCTION_EXEMPT_CATEGORIES.has(tool.category);
}
