import { useRef, useState } from "react";
import { strToU8, zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { downloadBlob, formatFileSize, slugify } from "@/lib/utils";
import {
  MUSIC_AUDIO_EXTENSIONS,
  isSafeMusicOrigin,
  parseMusicCollectionLines,
  protectedMusicPlatform,
  validateDirectMusicUrl,
  type MusicCollectionEntry,
} from "@/lib/media/music-downloader-policy";

type CollectionType = "track" | "album" | "playlist";
type DownloadResult = { name: string; bytes: Uint8Array; extension: string; source: string };
const MAX_TRACK_BYTES = 50 * 1024 * 1024;
const MAX_COLLECTION_BYTES = 200 * 1024 * 1024;

function safeName(value: string, fallback: string): string {
  const name = value.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim();
  return (name || fallback).slice(0, 90);
}

function extensionFromName(value: string): string {
  const name = value.split(/[?#]/, 1)[0] ?? value;
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return MUSIC_AUDIO_EXTENSIONS.has(extension) ? extension : "";
}

function archivePath(name: string, used: Set<string>, fallback: string): string {
  const clean = safeName(name, fallback);
  const ext = extensionFromName(clean);
  const base = ext ? clean.slice(0, -(ext.length + 1)) : clean;
  const path = ext ? base + "." + ext : clean;
  let candidate = path;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = ext ? base + " (" + counter + ")." + ext : clean + " (" + counter + ")";
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

async function readBounded(response: Response, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > limit) throw new Error("This track exceeds the " + formatFileSize(limit) + " per-track limit.");
  if (!response.body) {
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > limit) throw new Error("This track exceeds the " + formatFileSize(limit) + " per-track limit.");
    return body;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("Download cancelled.", "AbortError");
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error("This track exceeds the " + formatFileSize(limit) + " per-track limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function fetchTrack(entry: MusicCollectionEntry, signal: AbortSignal): Promise<DownloadResult> {
  const valid = validateDirectMusicUrl(entry.url);
  if (!valid.ok) throw new Error("Line " + entry.line + ": " + valid.reason);
  const response = await fetch(valid.url, { method: "GET", credentials: "omit", redirect: "follow", signal });
  if (!response.ok) throw new Error("Line " + entry.line + ": source returned HTTP " + response.status + ".");
  if (response.url) {
    const safeFinal = isSafeMusicOrigin(response.url);
    if (!safeFinal.ok) throw new Error("Line " + entry.line + ": the source redirected to a blocked or protected host.");
  }
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mime === "text/html" || mime === "application/xhtml+xml" || mime.startsWith("video/")) {
    throw new Error("Line " + entry.line + ": the source returned a web page or video, not a direct audio file.");
  }
  if (mime && !mime.startsWith("audio/") && mime !== "application/octet-stream" && mime !== "binary/octet-stream") {
    throw new Error('Line ' + entry.line + ': unsupported content type "' + mime + '".');
  }
  const bytes = await readBounded(response, MAX_TRACK_BYTES, signal);
  if (!bytes.byteLength) throw new Error("Line " + entry.line + ": the audio file was empty.");
  const fileName = entry.title || new URL(valid.url).pathname.split("/").pop() || ("track-" + entry.line);
  const extension = extensionFromName(fileName) || valid.extension;
  const name = fileName.toLowerCase().endsWith("." + extension) ? fileName : fileName + "." + extension;
  return { name: safeName(name, "track-" + entry.line + "." + extension), bytes, extension, source: valid.url };
}

function buildArchive(title: string, tracks: Array<{ name: string; bytes: Uint8Array }>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  const playlist = ["#EXTM3U"];
  tracks.forEach((track, index) => {
    const path = archivePath(track.name, used, "track-" + (index + 1) + ".mp3");
    files[path] = track.bytes;
    playlist.push("#EXTINF:-1," + path.replace(/\.[^.]+$/, ""), path);
  });
  files["enV-playlist.m3u"] = strToU8(playlist.join("\n") + "\n");
  files["README.txt"] = strToU8(
    title + "\n\nCreated with enV Music Downloader.\nThe archive contains the selected audio files and an M3U playlist. Keep copyright notices and license terms supplied by the original source.\n",
  );
  return zipSync(files, { level: 0 });
}

export function MusicDownloaderEngine() {
  const [mode, setMode] = useState<"online" | "offline">("online");
  const [collectionType, setCollectionType] = useState<CollectionType>("playlist");
  const [collectionName, setCollectionName] = useState("My music");
  const [urlText, setUrlText] = useState("");
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [platform, setPlatform] = useState<{ label: string; url: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const manifestInputRef = useRef<HTMLInputElement | null>(null);

  async function importManifest(file?: File) {
    if (!file) return;
    setError("");
    try {
      setUrlText(await file.text());
      setMode("online");
      setResult("Loaded " + file.name + ". Review the list before starting the download.");
    } catch {
      setError("The selected playlist manifest could not be read.");
    }
  }

  async function runOnline() {
    setError("");
    setResult("");
    setPlatform(null);
    if (!rightsConfirmed) {
      setError("Confirm that you own the tracks or have permission to download them.");
      return;
    }
    const parsed = parseMusicCollectionLines(urlText);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    if (collectionType === "track" && parsed.entries.length !== 1) {
      setError("For a single-track download, provide exactly one URL. Choose Album or Playlist for a batch.");
      return;
    }
    const blocked = parsed.entries.find((entry) => protectedMusicPlatform(entry.url));
    if (blocked) {
      const info = protectedMusicPlatform(blocked.url);
      if (info) setPlatform(info);
      setError((info?.label ?? "This service") + " link detected. Protected streaming pages cannot be converted into portable audio files.");
      return;
    }
    for (const entry of parsed.entries) {
      const validated = validateDirectMusicUrl(entry.url);
      if (!validated.ok) {
        setError("Line " + entry.line + ": " + validated.reason);
        return;
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    let totalBytes = 0;
    const tracks: DownloadResult[] = [];
    const failed: string[] = [];
    try {
      for (let index = 0; index < parsed.entries.length; index += 1) {
        const entry = parsed.entries[index];
        setProgress("Downloading " + (index + 1) + " of " + parsed.entries.length + ": " + (entry.title || ("track " + (index + 1))));
        try {
          const track = await fetchTrack(entry, controller.signal);
          if (totalBytes + track.bytes.byteLength > MAX_COLLECTION_BYTES) {
            throw new Error("The collection exceeds " + formatFileSize(MAX_COLLECTION_BYTES) + ". Split it into smaller batches.");
          }
          totalBytes += track.bytes.byteLength;
          tracks.push(track);
        } catch (cause) {
          if ((cause as Error)?.name === "AbortError") throw cause;
          const failureMessage = cause instanceof TypeError
            ? "The source blocked browser access (CORS) or could not be reached. Use a direct download URL that permits browser access."
            : (cause instanceof Error ? cause.message : "Download failed.");
          failed.push((entry.title || entry.url) + ": " + failureMessage);
        }
      }
      if (!tracks.length) throw new Error(failed[0] || "No tracks could be downloaded.");
      const title = safeName(collectionName, "My music");
      if (collectionType === "track" && tracks.length === 1) {
        const singleTrackBytes = new Uint8Array(tracks[0].bytes.byteLength);
        singleTrackBytes.set(tracks[0].bytes);
        downloadBlob(new Blob([singleTrackBytes.buffer], { type: tracks[0].extension === "mp3" ? "audio/mpeg" : "audio/" + tracks[0].extension }), tracks[0].name);
      } else {
        const archive = buildArchive(title, tracks);
        downloadBlob(new Blob([new Uint8Array(archive).buffer], { type: "application/zip" }), (slugify(title) || "music") + "-" + collectionType + ".zip");
      }
      setResult("Saved " + tracks.length + " of " + parsed.entries.length + " track(s) (" + formatFileSize(totalBytes) + ")." + (failed.length ? " " + failed.length + " track(s) failed; details are shown below." : ""));
      setProgress(failed.length ? failed.join("\n") : "Complete. The browser saved the requested audio file or collection archive.");
    } catch (cause) {
      if ((cause as Error)?.name === "AbortError") setProgress("Download cancelled.");
      else setError(cause instanceof Error ? cause.message : "The download failed.");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function runOffline() {
    setError("");
    setResult("");
    if (!localFiles.length) {
      setError("Choose audio files from this device first.");
      return;
    }
    if (collectionType === "track" && localFiles.length !== 1) {
      setError("For a single-track save, select exactly one file. Choose Album or Playlist for a batch.");
      return;
    }
    if (localFiles.length > 50) {
      setError("A collection can contain at most 50 tracks at a time.");
      return;
    }
    const rejected = localFiles.find((file) => !extensionFromName(file.name) || (file.type && !file.type.startsWith("audio/") && file.type !== "application/octet-stream"));
    if (rejected) {
      setError(rejected.name + " is not a supported audio file.");
      return;
    }
    const total = localFiles.reduce((sum, file) => sum + file.size, 0);
    if (localFiles.some((file) => file.size > MAX_TRACK_BYTES) || total > MAX_COLLECTION_BYTES) {
      setError("Choose audio files under " + formatFileSize(MAX_TRACK_BYTES) + " each and under " + formatFileSize(MAX_COLLECTION_BYTES) + " in total.");
      return;
    }
    setBusy(true);
    setProgress("Preparing your locally stored audio files…");
    try {
      const tracks: DownloadResult[] = [];
      for (let index = 0; index < localFiles.length; index += 1) {
        const file = localFiles[index];
        setProgress("Preparing " + (index + 1) + " of " + localFiles.length + ": " + file.name);
        tracks.push({ name: safeName(file.name, "track-" + (index + 1)), bytes: new Uint8Array(await file.arrayBuffer()), extension: extensionFromName(file.name), source: "local" });
      }
      const title = safeName(collectionName, "My music");
      if (collectionType === "track" && tracks.length === 1) {
        downloadBlob(localFiles[0], tracks[0].name);
      } else {
        const archive = buildArchive(title, tracks);
        downloadBlob(new Blob([new Uint8Array(archive).buffer], { type: "application/zip" }), (slugify(title) || "music") + "-" + collectionType + ".zip");
      }
      setResult("Prepared " + tracks.length + " local track(s) (" + formatFileSize(total) + "). No tracks were uploaded.");
      setProgress("Complete. Your local file or collection archive is ready.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The offline collection could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-surface-2 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
            <span aria-hidden="true" className="text-xl">♫</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Music Downloader</h2>
            <p className="mt-1 text-sm text-muted">Download authorized audio files online, or package music already on your device for offline use.</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Music source mode">
          <button type="button" role="tab" aria-selected={mode === "online"} onClick={() => { setMode("online"); setError(""); }} className={"min-h-10 rounded-lg border px-3 text-sm font-medium " + (mode === "online" ? "border-accent bg-background text-fg" : "border-border text-muted hover:bg-background")}>Online downloads</button>
          <button type="button" role="tab" aria-selected={mode === "offline"} onClick={() => { setMode("offline"); setError(""); }} className={"min-h-10 rounded-lg border px-3 text-sm font-medium " + (mode === "offline" ? "border-accent bg-background text-fg" : "border-border text-muted hover:bg-background")}>Offline collection</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-medium">Collection type
          <select value={collectionType} onChange={(event) => setCollectionType(event.target.value as CollectionType)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-normal">
            <option value="track">Single track</option><option value="album">Album</option><option value="playlist">Playlist</option>
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium">Collection or album name
          <input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} maxLength={100} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-normal" placeholder="My music" />
        </label>
      </div>

      {mode === "online" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="music-download-urls" className="text-sm font-medium">Direct audio-file URLs</label>
            <button type="button" onClick={() => manifestInputRef.current?.click()} className="text-sm font-medium text-accent hover:underline">Import playlist manifest</button>
            <input ref={manifestInputRef} type="file" accept=".txt,.m3u,.m3u8,.json,application/json,text/plain" className="hidden" onChange={(event) => void importManifest(event.target.files?.[0])} />
          </div>
          <textarea id="music-download-urls" value={urlText} onChange={(event) => setUrlText(event.target.value)} rows={6} spellCheck={false} className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 font-mono text-sm" placeholder={"https://downloads.example.com/track-01.mp3\nTrack two | https://cdn.example.com/track-02.m4a"} />
          <p className="text-xs leading-relaxed text-muted">Use one direct HTTPS audio-file URL per line, or “Track title | URL”. JSON, TXT and M3U URL lists are accepted. Sources must permit downloads and serve the audio file directly. Web downloads also require the host to allow browser cross-origin access (CORS).</p>
          <label className="flex min-h-11 items-start gap-2 rounded-xl border border-border p-3 text-sm">
            <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-1" />
            <span>I own these tracks or have permission to download and keep them.</span>
          </label>
          <div className="rounded-xl border border-border p-3 text-sm">
            <p className="font-medium">Streaming-service links</p>
            <p className="mt-1 text-muted">Spotify, Apple Music, YouTube Music, Audiomack, Boomplay, Deezer, Amazon Music, TIDAL, SoundCloud, Pandora, Mixcloud, Anghami, Qobuz, Napster, JioSaavn and iHeartRadio pages are not direct audio files. Use each service’s official offline/download option for protected catalog tracks, or supply a direct audio-file link provided by the rights holder.</p>
            {platform ? <a href={platform.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-9 items-center font-medium text-accent hover:underline">Open {platform.label}</a> : null}
          </div>
          <Button type="button" onClick={() => void runOnline()} disabled={busy} className="w-full sm:w-auto">{busy ? "Downloading…" : (collectionType === "track" ? "Download track" : "Download " + collectionType)}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <label htmlFor="music-offline-files" className="block text-sm font-medium">Audio files on this device</label>
          <input id="music-offline-files" type="file" multiple accept={Array.from(MUSIC_AUDIO_EXTENSIONS, (ext) => "." + ext).join(",")} onChange={(event) => setLocalFiles(Array.from(event.target.files ?? []))} className="block w-full rounded-xl border border-border bg-background p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:font-medium" />
          <p className="text-sm text-muted">{localFiles.length ? localFiles.length + " file(s) selected · " + formatFileSize(localFiles.reduce((sum, file) => sum + file.size, 0)) : "Select tracks already stored on your device. File contents stay in this browser and are not uploaded."}</p>
          <Button type="button" onClick={() => void runOffline()} disabled={busy || !localFiles.length} className="w-full sm:w-auto">{busy ? "Preparing…" : (collectionType === "track" ? "Save track" : "Create " + collectionType + " archive")}</Button>
        </div>
      )}

      {busy ? <div className="space-y-2" role="status" aria-live="polite"><div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full w-1/3 animate-pulse rounded-full bg-accent" /></div><p className="text-sm text-muted">{progress}</p><Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>Cancel</Button></div> : null}
      {error ? <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {result ? <p role="status" className="rounded-xl border border-border bg-surface-2 p-3 text-sm">{result}</p> : null}
      {!busy && progress ? <p className="whitespace-pre-wrap break-words text-sm text-muted">{progress}</p> : null}
      <p className="text-xs leading-relaxed text-muted">Limits: 50 tracks per batch, 50 MB per track and 200 MB per collection. Direct sources must permit access and browser downloads (including CORS access on the Web). This tool does not sign in to streaming services, extract their protected streams, or bypass DRM.</p>
    </div>
  );
}
