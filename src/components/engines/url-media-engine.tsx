import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { ResultPanel } from "@/components/engines/result-panel";
import { downloadBlob } from "@/lib/utils";
import { downloadUrlMedia, getUrlMediaConfig, inspectUrlMedia, type UrlMediaInfo, type UrlMediaProvider } from "@/lib/media/url-media";

const labels: Record<UrlMediaProvider | "generic", string> = {
  generic: "Supported video URL",
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X / Twitter",
};

const hosts: Record<Exclude<UrlMediaProvider, "generic">, string[]> = {
  youtube: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
  tiktok: ["tiktok.com"],
  facebook: ["facebook.com", "fb.watch"],
  instagram: ["instagram.com"],
  x: ["x.com", "twitter.com"],
};

function detectProvider(value: string): UrlMediaProvider | null {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    for (const [provider, names] of Object.entries(hosts) as [UrlMediaProvider, string[]][]) {
      if (names.some((name) => host === name || host.endsWith(`.${name}`))) return provider;
    }
  } catch { return null; }
  return "generic";
}

function extensionFor(format: string, audioOnly: boolean) {
  if (audioOnly) return format === "m4a" ? "m4a" : "mp3";
  return format === "webm" ? "webm" : "mp4";
}

export function UrlMediaEngine({ provider }: { provider: UrlMediaProvider | "generic" }) {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState(provider === "generic" ? "mp4" : "mp4");
  const [audioOnly, setAudioOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [transfer, setTransfer] = useState<{ bytes: number; total?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<{ size: number; type: string } | null>(null);
  const [preview, setPreview] = useState<UrlMediaInfo | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);
  const config = useMemo(() => getUrlMediaConfig(), []);

  function validateUrl() {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) { setError("Enter a valid public HTTP(S) URL."); return null; }
    const detected = detectProvider(trimmed);
    if (!detected) { setError("Enter a valid HTTP(S) media URL."); return null; }
    if (provider !== "generic" && detected !== provider) { setError(`This tool expects ${labels[provider]} URLs, but this URL appears to be ${labels[detected]}.`); return null; }
    return { trimmed, detected };
  }

  async function previewUrl() {
    setError(null); setPreview(null);
    const valid = validateUrl();
    if (!valid) return;
    if (!config.configured) { setError("The URL media service is not configured. Set VITE_URL_MEDIA_PROCESSOR_URL to enable inspection."); return; }
    const nextController = new AbortController();
    setController(nextController);
    setPreviewBusy(true);
    try {
      setPreview(await inspectUrlMedia(valid.trimmed, valid.detected, nextController.signal));
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError(err instanceof Error ? err.message : "Unable to inspect this URL.");
    } finally { setPreviewBusy(false); setController(null); }
  }

  async function run() {
    setError(null); setOutput(null); setProgress(0); setTransfer(null);
    const valid = validateUrl();
    if (!valid) return;
    if (!config.configured) { setError("The URL media service is not configured. Set VITE_URL_MEDIA_PROCESSOR_URL to enable downloads."); return; }
    const effectiveFormat = audioOnly ? (format === "webm" || format === "mp4" ? "mp3" : format) : format;
    const nextController = new AbortController();
    setController(nextController);
    setBusy(true);
    try {
      const blob = await downloadUrlMedia(
        { url: valid.trimmed, provider: valid.detected, format: effectiveFormat as "mp4" | "webm" | "mp3" | "m4a" | "best", audioOnly },
        nextController.signal,
        (value, detail) => { setProgress(value); if (detail) setTransfer(detail); },
      );
      const ext = extensionFor(effectiveFormat, audioOnly);
      const safeProvider = valid.detected === "x" ? "x-twitter" : valid.detected;
      downloadBlob(blob, `env-${safeProvider}-download.${ext}`);
      setOutput({ size: blob.size, type: blob.type || "application/octet-stream" });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError(err instanceof Error ? err.message : "Download failed.");
    } finally { setBusy(false); setController(null); }
  }

  return <div className="space-y-5">
    <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm">
      <div className="font-medium">{labels[provider]} downloader</div>
      <p className="mt-1 text-muted">Paste a public URL. The download is processed by the configured enV media service.</p>
    </div>
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="url-media-url">Media URL</label>
      <input id="url-media-url" className="w-full rounded-md border border-border bg-background px-3 py-2" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." autoComplete="off" />
    </div>
    <div className="flex flex-wrap items-end gap-4">
      <label className="space-y-2 text-sm"><span className="block font-medium">Format</span><select className="rounded-md border border-border bg-background px-3 py-2" value={format} onChange={(e) => setFormat(e.target.value)} disabled={audioOnly || busy}><option value="mp4">MP4</option><option value="webm">WebM</option></select></label>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={audioOnly} onChange={(e) => setAudioOnly(e.target.checked)} disabled={busy || provider === "generic"} /> Audio only (MP3){provider === "generic" ? " · unavailable for direct files" : ""}</label>
      {url.trim() && detectProvider(url.trim()) ? <span className="pb-2 text-xs text-muted">Detected: <strong className="text-fg">{labels[detectProvider(url.trim())!]}</strong></span> : null}
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={() => void run()} disabled={busy || previewBusy}>{busy ? (transfer?.total ? `Downloading ${Math.round(progress)}%` : "Downloading…") : "Download"}</Button>
      <Button type="button" variant="outline" onClick={() => void previewUrl()} disabled={busy || previewBusy}>{previewBusy ? "Inspecting…" : "Preview first"}</Button>
      {controller && (busy || previewBusy) ? <Button type="button" variant="secondary" onClick={() => controller.abort()}>Cancel</Button> : null}
    </div>
    {busy && transfer ? <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3 text-sm" aria-live="polite">
      <div className="flex items-center justify-between gap-3"><span>{transfer.total ? `${Math.round(progress)}% downloaded` : "Downloading media"}</span><span className="text-muted">{(transfer.bytes / 1024 / 1024).toFixed(2)} MB{transfer.total ? ` / ${(transfer.total / 1024 / 1024).toFixed(2)} MB` : ""}</span></div>
      {transfer.total ? <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full bg-accent" style={{ width: `${progress}%` }} /></div> : <div className="h-2 rounded-full bg-surface motion-safe:animate-pulse" aria-hidden="true" />}
    </div> : null}
    {preview ? <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex gap-4">
        {preview.thumbnail ? <img src={preview.thumbnail} alt="Media preview" className="h-20 w-32 rounded-md object-cover" loading="lazy" referrerPolicy="no-referrer" /> : null}
        <div className="min-w-0">
          <div className="font-medium">{preview.title || "Untitled media"}</div>
          <div className="mt-1 text-sm text-muted">{labels[preview.provider]}{preview.uploader ? ` · ${preview.uploader}` : ""}</div>
          <div className="mt-1 text-xs text-muted">{preview.width && preview.height ? `${preview.width} × ${preview.height}` : "Resolution unavailable"}{preview.duration != null ? ` · ${Math.floor(preview.duration / 60)}m ${Math.round(preview.duration % 60)}s` : ""}</div>
        </div>
      </div>
    </div> : null}
    {error ? <ErrorBanner message={error} /> : null}
    {output ? <ResultPanel items={[{ label: "Download ready", value: `${(output.size / 1024 / 1024).toFixed(2)} MB · ${output.type}`, primary: true, hint: "The file was downloaded through the browser." }]} /> : null}
  </div>;
}
