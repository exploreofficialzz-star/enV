import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { toolPath } from "@/lib/registry";
import type { ToolMeta } from "@/types/tool";
import { cn } from "@/lib/utils";
import { ComingSoonBadge } from "@/components/tools/coming-soon";
import { ToolAppIcon } from "@/components/tools/tool-app-icon";
import { UnderProductionDialog } from "@/components/tools/under-production";
import { isToolUnderProduction } from "@/lib/production-notice";
import { useState } from "react";

export function ToolCard({
  tool,
  className,
}: {
  tool: ToolMeta;
  className?: string;
}) {
  const planned = tool.status === "planned";
  const underProduction = isToolUnderProduction(tool);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const cardClassName = cn(
    "group flex flex-col rounded-xl bg-surface p-4 text-left shadow-[var(--shadow-border)] transition-[transform,box-shadow] duration-150 ease-[var(--ease-out)] hover:-translate-y-0.5",
    planned && "opacity-70",
    className,
  );
  const cardContent = (
    <>
      <ToolAppIcon tool={tool} className="size-9" />
      <span className="mt-3 text-sm font-semibold tracking-tight text-fg group-hover:text-accent">
        {tool.name}
      </span>
      <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{tool.description}</span>
      {underProduction ? (
        <span className="mt-3 inline-flex w-fit rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          Under production
        </span>
      ) : planned ? (
        <span className="mt-3"><ComingSoonBadge /></span>
      ) : tool.clientSide ? (
        <span className="mt-3 text-[11.1px] font-medium uppercase tracking-wide text-subtle">
          In-browser
        </span>
      ) : null}
      <span className="mt-auto flex justify-end pt-3">
        <ArrowRight className="size-4 text-black transition-transform group-hover:translate-x-0.5 dark:text-white" aria-hidden="true" />
      </span>
    </>
  );

  return (
    <>
      {underProduction ? (
        <button type="button" className={cardClassName} onClick={() => setNoticeOpen(true)} aria-haspopup="dialog">
          {cardContent}
        </button>
      ) : (
        <Link to={toolPath(tool)} className={cardClassName}>
          {cardContent}
        </Link>
      )}
      <UnderProductionDialog open={noticeOpen} toolName={tool.name} onClose={() => setNoticeOpen(false)} />
    </>
  );
}
