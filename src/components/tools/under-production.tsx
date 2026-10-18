import * as Dialog from "@radix-ui/react-dialog";
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
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-5 shadow-2xl outline-none sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
              <Clock3 aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Under production</p>
              <Dialog.Title className="mt-1 text-lg font-semibold tracking-tight text-fg">
                {toolName} is under production
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close production notice"
                className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-4 text-sm leading-6 text-muted">
            This tool is still being developed and is not available yet. You can keep browsing enV while we work on it.
          </Dialog.Description>
          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                Back to browsing
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Fallback modal for a direct URL or a stale external link to a restricted tool. */
export function UnderProductionPage({ toolName }: { toolName: string }) {
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content
          onEscapeKeyDown={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-2xl outline-none"
        >
          <div className="flex size-12 items-center justify-center rounded-xl bg-surface-2 text-muted">
            <Clock3 aria-hidden="true" className="size-5" />
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Under production</p>
          <Dialog.Title asChild>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-fg">{toolName} is under production</h1>
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-6 text-muted">
            This tool is still being developed and is not available yet. Please return to the tool catalog to continue browsing.
          </Dialog.Description>
          <div className="mt-5 flex justify-end">
            <Link
              to="/tools"
              search={{ q: "" }}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Back to tools
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
