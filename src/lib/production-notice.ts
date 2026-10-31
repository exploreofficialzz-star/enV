import type { CategoryId, ToolMeta } from "@/types/tool";

/** Categories that are currently available and must remain directly accessible. */
export const PRODUCTION_EXEMPT_CATEGORIES = new Set<CategoryId>([
  "accessibility",
  "audio",
  "business",
  "calculators",
  "datetime",
  "developer",
  "video",
]);

/** All catalog tools outside the explicitly exempt categories open the production notice. */
export function isToolUnderProduction(tool: Pick<ToolMeta, "category">): boolean {
  return !PRODUCTION_EXEMPT_CATEGORIES.has(tool.category);
}
