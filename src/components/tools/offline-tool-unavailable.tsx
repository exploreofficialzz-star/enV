import { CloudOff } from "lucide-react";

export function OfflineToolUnavailable({ toolName, message }: { toolName: string; message?: string }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CloudOff className="size-5 text-muted" aria-hidden="true" />
        {toolName} is not installed for offline use
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">
        {message || "Open this tool while connected to the internet. enV will automatically prepare its offline package for this device."}
      </p>
    </section>
  );
}
