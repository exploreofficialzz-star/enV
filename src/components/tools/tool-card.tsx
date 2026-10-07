import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { toolIcon } from "@/lib/icons";
import { toolPath } from "@/lib/registry";
import type { ToolMeta } from "@/types/tool";
import { cn } from "@/lib/utils";
import { ComingSoonBadge } from "@/components/tools/coming-soon";

export function ToolCard({
  tool,
  className,
}: {
  tool: ToolMeta;
  className?: string;
}) {
  const Icon = toolIcon(tool.icon);
  const planned = tool.status === "planned";
  return (
    <Link
      to={toolPath(tool)}
      className={cn(
        "group flex flex-col rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] transition-[transform,box-shadow] duration-150 ease-[var(--ease-out)] hover:-translate-y-0.5",
        planned && "opacity-70",
        className,
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-md bg-accent-soft text-black dark:text-white">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <ArrowRight className="mt-1 size-4 shrink-0 text-black dark:text-white transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
      <span className="mt-3 text-sm font-semibold tracking-tight text-fg group-hover:text-accent">
        {tool.name}
      </span>
      <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{tool.description}</span>
      {planned ? (
        <span className="mt-3"><ComingSoonBadge /></span>
      ) : tool.clientSide ? (
        <span className="mt-3 text-[10px] font-medium uppercase tracking-wide text-subtle">
          In-browser
        </span>
      ) : null}
    </Link>
  );
}
