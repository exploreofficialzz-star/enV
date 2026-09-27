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

export function ComingSoonPanel({ tool }: { tool: ToolMeta }) {
  return (
    <div className="rounded-xl bg-surface-2 p-5">
      <ComingSoonBadge />
      <h2 className="mt-4 text-lg font-semibold">This enV tool is being built</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        {tool.name} is already part of the enV catalog, but its full processing engine has not been connected yet. The URL is reserved so the tool can be upgraded without changing its address.
      </p>
      <p className="mt-3 text-xs text-subtle">
        Processing architecture: {tool.requiresBackend ? "server or hybrid processing" : "to be finalized during implementation"}.
      </p>
    </div>
  );
}
