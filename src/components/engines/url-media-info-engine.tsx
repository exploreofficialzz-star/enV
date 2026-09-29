import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { ResultPanel } from "@/components/engines/result-panel";
import { inspectUrlMedia, type UrlMediaInfo, type UrlMediaProvider } from "@/lib/media/url-media";

const labels: Record<UrlMediaProvider | "generic", string> = {
  generic: "Supported video URL", youtube: "YouTube", tiktok: "TikTok", facebook: "Facebook", instagram: "Instagram", x: "X / Twitter",
};

export function UrlMediaInfoEngine({ provider }: { provider: UrlMediaProvider | "generic" }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<UrlMediaInfo | null>(null);

  async function run() {
    setError(null); setInfo(null);
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) { setError("Enter a valid public HTTP(S) URL."); return; }
    setBusy(true);
    try { setInfo(await inspectUrlMedia(trimmed, provider === "generic" ? undefined : provider)); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to inspect this URL."); }
    finally { setBusy(false); }
  }

  const duration = info?.duration == null ? "—" : `${Math.floor(info.duration / 60)}m ${Math.round(info.duration % 60)}s`;
  return <div className="space-y-5">
    <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm">
      <div className="font-medium">{labels[provider]} media inspector</div>
      <p className="mt-1 text-muted">Inspect public media metadata before downloading. No media file is downloaded during inspection.</p>
    </div>
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="url-media-info-url">Media URL</label>
      <input id="url-media-info-url" className="w-full rounded-md border border-border bg-background px-3 py-2" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." autoComplete="off" />
    </div>
    <Button type="button" onClick={() => void run()} disabled={busy}>{busy ? "Inspecting…" : "Inspect URL"}</Button>
    {error ? <ErrorBanner message={error} /> : null}
    {info ? <div className="space-y-4">
      <ResultPanel items={[
        { label: "Title", value: info.title || "Untitled", primary: true },
        { label: "Provider", value: labels[info.provider] },
        { label: "Uploader", value: info.uploader || "—" },
        { label: "Duration", value: duration },
        { label: "Resolution", value: info.width && info.height ? `${info.width} × ${info.height}` : "—" },
        { label: "FPS", value: info.fps ? String(info.fps) : "—" },
        { label: "Video codec", value: info.videoCodec || "—" },
        { label: "Audio codec", value: info.audioCodec || "—" },
        { label: "Live", value: info.live ? "Yes" : "No" },
      ]} />
      {info.thumbnail ? <div className="overflow-hidden rounded-xl border border-border"><img src={info.thumbnail} alt="Media thumbnail" className="max-h-80 w-full object-contain bg-surface-2" loading="lazy" referrerPolicy="no-referrer" /></div> : null}
      <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="p-3">Format</th><th className="p-3">Ext</th><th className="p-3">Resolution</th><th className="p-3">FPS</th><th className="p-3">Codecs</th></tr></thead><tbody>{info.formats.slice(0, 40).map((format) => <tr key={`${format.formatId}-${format.ext}`} className="border-b border-border last:border-0"><td className="p-3">{format.formatId}</td><td className="p-3">{format.ext}</td><td className="p-3">{format.resolution || "—"}</td><td className="p-3">{format.fps || "—"}</td><td className="p-3">{format.videoCodec || format.audioCodec || "—"}</td></tr>)}</tbody></table></div>
    </div> : null}
  </div>;
}
