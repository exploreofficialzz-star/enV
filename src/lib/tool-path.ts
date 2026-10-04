import type { ToolMeta } from "@/types/tool";

export type ToolRouteTarget = Pick<ToolMeta, "category" | "slug">;

export function toolPath(tool: ToolRouteTarget): string {
  return `/tools/${tool.category}/${tool.slug}`;
}
