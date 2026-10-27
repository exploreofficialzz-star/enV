import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";

export function SongCopyButton({ label, value, disabled = false }: { label: string; value: string | (() => string); disabled?: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    const text = typeof value === "function" ? value() : value;
    if (!text || disabled) return;
    const ok = await copyToClipboard(text);
    setStatus(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2400);
  }
  return <span className="inline-flex shrink-0 items-center gap-1">
    <button type="button" disabled={disabled} aria-label={`Copy ${label}`} title={`Copy ${label}`} onClick={() => void copy()} className="inline-grid size-8 place-items-center rounded-md border border-border text-muted hover:text-fg disabled:opacity-40">
      {status === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
    <span className="sr-only" role="status">{status === "copied" ? `${label} copied` : status === "failed" ? `Could not copy ${label}` : ""}</span>
  </span>;
}
