/** Loads the working image (upload, drop, paste or hand-off from the previous tool) with friendly errors. */
import { useCallback, useEffect, useRef, useState } from "react";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { ErrorBanner } from "@/components/tools/error-banner";
import { ImageToolError, errorMessage, loadSource, releaseSource, type SourceImage } from "@/lib/image/canvas";
import { formatBytes } from "@/lib/image/geometry";
import { takeHandoff } from "@/lib/image/handoff";
import { Btn } from "./ui";

export function useSource(toolId: string) {
  const [source, setSource] = useState<SourceImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameFrom, setCameFrom] = useState<string | null>(null);
  const current = useRef<SourceImage | null>(null);
  const load = useCallback(async (file: Blob, name?: string, from?: string) => {
    setLoading(true); setError(null);
    try {
      const next = await loadSource(file, name);
      releaseSource(current.current); current.current = next; setSource(next); setCameFrom(from ?? null);
    } catch (e) { setError(e instanceof ImageToolError ? e.message : errorMessage(e, "That image couldn't be opened.")); }
    finally { setLoading(false); }
  }, []);
  const clear = useCallback(() => { releaseSource(current.current); current.current = null; setSource(null); setCameFrom(null); setError(null); }, []);
  useEffect(() => { const h = takeHandoff(); if (h && h.from !== toolId) void load(h.blob, h.name, h.from); return () => releaseSource(current.current); }, [toolId, load]);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); void load(f); } };
    window.addEventListener("paste", onPaste); return () => window.removeEventListener("paste", onPaste);
  }, [load]);
  return { source, error, setError, loading, load, clear, cameFrom };
}

export function SourceGate({ toolId, state, label = "Drop an image here or browse", hint = "JPG, PNG, WebP, GIF, BMP, AVIF, SVG (HEIC where your browser supports it). You can also paste from the clipboard. Nothing is uploaded.", children }: { toolId: string; state: ReturnType<typeof useSource>; label?: string; hint?: string; children: (s: SourceImage) => React.ReactNode }) {
  void toolId;
  const { source, error, loading, load, clear, cameFrom } = state;
  if (!source) {
    return (
      <div className="space-y-3">
        <FileDropzone accept="image/*,.heic,.heif,.avif" label={loading ? "Opening image…" : label} hint={hint} onFiles={(f) => void load(f[0])} />
        <ErrorBanner message={error} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
        <p className="min-w-0 truncate text-sm text-fg"><span className="font-medium">{source.name}</span> <span className="text-muted">· {source.width} × {source.height} · {formatBytes(source.size)}{cameFrom ? ` · sent from ${cameFrom}` : ""}</span></p>
        <Btn onClick={clear}>Choose another image</Btn>
      </div>
      <ErrorBanner message={error} />
      {children(source)}
    </div>
  );
}
