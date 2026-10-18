import { Clock3, X } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function UnderProductionDialog({
  open,
  toolName,
  onClose,
}: {
  open: boolean;
  toolName: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="under-production-title"
        aria-describedby="under-production-description"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
        role="dialog"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
            <Clock3 aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Under production</p>
            <h2 id="under-production-title" className="mt-1 text-lg font-semibold tracking-tight text-fg">
              {toolName} is under production
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close production notice"
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <p id="under-production-description" className="mt-4 text-sm leading-6 text-muted">
          This tool is still being developed and is not available yet. You can keep browsing enV while we work on it.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Back to browsing
          </button>
        </div>
      </section>
    </div>
  );
}

/** Fallback overlay for a direct URL or a stale external link to a restricted tool. */
export function UnderProductionPage({ toolName }: { toolName: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <section
        aria-labelledby="under-production-direct-title"
        aria-describedby="under-production-direct-description"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
        role="dialog"
      >
        <div className="flex size-12 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <Clock3 aria-hidden="true" className="size-5" />
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Under production</p>
        <h1 id="under-production-direct-title" className="mt-1 text-xl font-semibold tracking-tight text-fg">
          {toolName} is under production
        </h1>
        <p id="under-production-direct-description" className="mt-3 text-sm leading-6 text-muted">
          This tool is still being developed and is not available yet. Please return to the tool catalog to continue browsing.
        </p>
        <div className="mt-5 flex justify-end">
          <Link to="/tools" className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            Back to tools
          </Link>
        </div>
      </section>
    </div>
  );
}
