import { useEffect, useRef, useState } from "react";
import { Download, FileVideo, Link2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/utils";
import { downloadUrlMedia, type UrlMediaProvider } from "@/lib/media/url-media";
import { parseVideoLink } from "@/lib/media/video-link-recording";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "mov", "webm", "ogv", "mkv", "avi", "3gp"]);

type VideoOutput = { url: string; blob: Blob; name: string; source: "link" | "file" };

function providerFor(raw: string): UrlMediaProvider {
  const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  const matches: Array<[UrlMediaProvider, string[]]> = [
    ["youtube", ["youtube.com", "youtu.be", "youtube-nocookie.com"]],
    ["tiktok", ["tiktok.com"]],
    ["facebook", ["facebook.com", "fb.watch", "fb.com"]],
    ["instagram", ["instagram.com"]],
    ["x", ["x.com", "twitter.com"]],
  ];
  const found = matches.find((entry) => entry[1].some((domain) => host === domain || host.endsWith("." + domain)));
  return found ? found[0] : "generic";
}

function safeFileName(raw: string, fallback: string) {
  const name = raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim().slice(0, 100);
  return name || fallback;
}

function extensionFromMime(mime: string) {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("ogg")) return "ogv";
  return "mp4";
}

/** Retrieves real media files; no platform page is embedded or screen-recorded. */
export function VideoLinkRecorderEngine() {
  const [link, setLink] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ bytes: number; total?: number } | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [output, setOutput] = useState<VideoOutput | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const outputUrlRef = useRef<string | null>(null);

  function clearOutput() {
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    outputUrlRef.current = null;
    setOutput(null);
  }

  function publishOutput(blob: Blob, name: string, source: VideoOutput["source"]) {
    clearOutput();
    const url = URL.createObjectURL(blob);
    outputUrlRef.current = url;
    setOutput({ url, blob, name, source });
    setStatus("Your video is ready.");
  }

  useEffect(() => () => {
    controllerRef.current?.abort();
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
  }, []);

  async function processLink() {
    setError("");
    setStatus("");
    setProgress(null);
    if (!link.trim()) { setError("Paste a video link first."); return; }
    if (!rightsConfirmed) { setError("Confirm that you own this video or have permission to save and use it."); return; }

    const parsed = parseVideoLink(link);
    if (!parsed.ok) { setError(parsed.reason); return; }

    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setStatus("Retrieving the original video…");
    try {
      const blob = await downloadUrlMedia(
        { url: parsed.url, provider: providerFor(parsed.url), format: "mp4", audioOnly: false, maxBytes: MAX_VIDEO_BYTES },
        controller.signal,
        (_value, detail) => { if (detail) setProgress(detail); },
      );
      if (!blob.size) throw new Error("The media service returned an empty video.");
      const mime = blob.type || "video/mp4";
      const bareMime = mime.split(";")[0].trim();
      if (!mime.startsWith("video/") && bareMime !== "application/octet-stream" && bareMime !== "binary/octet-stream") {
        throw new Error("The media service response was not a video file.");
      }
      const extension = extensionFromMime(mime);
      const host = new URL(parsed.url).hostname.replace(/^www\./, "").replace(/[^a-z0-9.-]/gi, "");
      publishOutput(blob, safeFileName("enV-" + host + "." + extension, "enV-video.mp4"), "link");
      setProgress({ bytes: blob.size, total: blob.size });
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "The video could not be retrieved. Check the link and try again.");
      }
      setStatus("");
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setBusy(false);
    }
  }

  function useUploadedFile(selected: File | undefined) {
    setError("");
    setStatus("");
    setProgress(null);
    if (!selected) return;
    const extension = selected.name.split(".").pop()?.toLowerCase() ?? "";
    if (!selected.type.startsWith("video/") && !VIDEO_EXTENSIONS.has(extension)) {
      setError("Choose a video file such as MP4, MOV, WebM or MKV.");
      return;
    }
    if (!selected.size || selected.size > MAX_VIDEO_BYTES) {
      setError("Choose a video file smaller than 500 MB.");
      return;
    }
    setRightsConfirmed(true);
    publishOutput(selected, safeFileName(selected.name, "enV-video." + (extension || "mp4")), "file");
  }

  function saveVideo() {
    if (output) downloadBlob(output.blob, output.name);
  }

  function cancel() {
    controllerRef.current?.abort();
    setBusy(false);
    setStatus("");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface-2 p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
            <FileVideo aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Video Link Screen Recording</h2>
            <p className="text-sm text-muted">Paste a supported video link or choose a video file. enV prepares the video automatically.</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="video-link-input" className="text-sm font-medium">Video link</label>
        <input
          id="video-link-input"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={link}
          disabled={busy}
          placeholder="Paste a public video link"
          onChange={(event) => { setLink(event.target.value); setError(""); setStatus(""); }}
          onKeyDown={(event) => { if (event.key === "Enter") void processLink(); }}
          className="flex h-12 w-full rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        />
        <label className="flex min-h-10 items-start gap-2 rounded-xl border border-border px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={rightsConfirmed}
            disabled={busy}
            onChange={(event) => setRightsConfirmed(event.target.checked)}
          />
          <span>I own this video or have permission to save and use it.</span>
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={() => void processLink()} disabled={busy || !link.trim() || !rightsConfirmed} className="sm:flex-1">
            <Link2 /> {busy ? "Processing video…" : "Process video"}
          </Button>
          {busy ? <Button type="button" variant="outline" onClick={cancel}>Cancel</Button> : null}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted">OR</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2 rounded-2xl border border-border p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><UploadCloud className="size-4" /> Choose a video from this device</div>
        <input
          type="file"
          accept="video/*,.mp4,.m4v,.mov,.webm,.ogv,.mkv,.avi,.3gp"
          disabled={busy}
          onChange={(event) => useUploadedFile(event.target.files?.[0])}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        <p className="text-xs text-muted">Your selected file stays on this device. It is not uploaded.</p>
      </div>

      {busy ? (
        <div role="status" aria-live="polite" className="space-y-2 rounded-xl border border-border bg-surface-2 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>{status || "Processing…"}</span>
            <span className="text-muted">{progress ? (progress.bytes / 1048576).toFixed(1) + " MB" + (progress.total ? " / " + (progress.total / 1048576).toFixed(1) + " MB" : "") : ""}</span>
          </div>
          {progress?.total ? <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full bg-accent" style={{ width: Math.min(100, (progress.bytes / progress.total) * 100) + "%" }} /></div> : <div className="h-2 animate-pulse rounded-full bg-surface" />}
        </div>
      ) : null}

      {output ? (
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Your video</h3>
            <span className="text-xs text-muted">{(output.blob.size / 1048576).toFixed(1)} MB</span>
          </div>
          <video key={output.url} src={output.url} controls playsInline preload="metadata" className="max-h-[65vh] w-full rounded-xl bg-black" />
          <p className="break-all text-xs text-muted">{output.name}{output.source === "file" ? " · Original file" : " · Retrieved video"}</p>
          <Button type="button" onClick={saveVideo} className="w-full"><Download /> Save video</Button>
        </div>
      ) : null}

      {status && !busy && !output ? <p role="status" className="text-sm text-muted">{status}</p> : null}
      {error ? <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
    </div>
  );
}
