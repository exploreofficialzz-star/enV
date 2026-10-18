import type { CSSProperties } from "react";
import { toolIcon } from "@/lib/icons";
import type { ToolMeta } from "@/types/tool";
import { cn } from "@/lib/utils";

/** Shared, app-store-style icon tile used anywhere an individual enV tool is represented. */
export function ToolAppIcon({
  tool,
  className,
}: {
  tool: Pick<ToolMeta, "id" | "icon" | "iconBackground" | "iconAccent">;
  className?: string;
}) {
  const Icon = toolIcon(tool.icon);
  const style = {
    "--tool-icon-background": tool.iconBackground ?? "#0F766E",
    "--tool-icon-accent": tool.iconAccent ?? "#2DD4BF",
  } as CSSProperties;

  return (
    <span className={cn("tool-app-icon", className)} style={style} aria-hidden="true">
      <span className="tool-app-icon__flare" />
      <span className="tool-app-icon__glint" />
      <Icon className="tool-app-icon__glyph" strokeWidth={1.85} />
      <span className="tool-app-icon__spark" />
    </span>
  );
}
