import { Clock3 } from "lucide-react";
import type { ToolMeta } from "@/types/tool";

export function ComingSoonBadge() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle shadow-[var(--shadow-border)]">
      <Clock3 className="size-3" />
      Coming soon
    </span>
  );
}

function requiredCapability(tool: ToolMeta) {
  if (tool.requiresBackend) return "A verified server-side processor or external service.";
  if (tool.requiresAuth) return "A verified authenticated service integration.";
  if (tool.engine.type === "document") return "A document-processing engine that can produce the promised output.";
  if (tool.engine.type === "audio" || tool.engine.type === "pdf" || tool.engine.type === "video") return "The tool-specific processing operation plus its required runtime.";
  if (tool.engine.type === "custom") return "A dedicated engine implementation wired to this tool ID.";
  return "A verified engine implementation for the catalog operation.";
}

export function ComingSoonPanel({ tool }: { tool: ToolMeta }) {
  const requirement = requiredCapability(tool);
  return (
    <div className="rounded-xl bg-surface-2 p-5">
      <ComingSoonBadge />
      <h2 className="mt-4 text-lg font-semibold">This enV tool is being built</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        {tool.name} is already part of the enV catalog, but its full processing engine has not been connected yet. The URL is reserved so the tool can be upgraded without changing its address.
      </p>
      <div className="mt-4 rounded-lg border border-border bg-background/40 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">Required before activation</p>
        <p className="mt-1 text-sm text-muted">{requirement}</p>
      </div>
      <p className="mt-3 text-xs text-subtle">
        enV keeps this tool Coming Soon until the underlying operation is implemented and verified; the catalog entry is not treated as functional merely because its page exists.
      </p>
    </div>
  );
}
