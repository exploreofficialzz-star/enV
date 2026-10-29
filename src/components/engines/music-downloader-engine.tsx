import { useRef, useState } from "react";
import { strToU8, zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { downloadBlob, formatFileSize, slugify } from "@/lib/utils";
import { extractMusicMetadata, type MusicMetadata } from "@/lib/media/music-metadata";
import { downloadUrlMedia, inspectUrlMedia, type UrlMediaInfo, type UrlMediaPlaylistEntry } from "@/lib/media/url-media";
import { downloadMusicWithSingleRetry } from "@/lib/media/music-download-retry";
import {
  MUSIC_AUDIO_EXTENSIONS,
  isLikelyMusicCollectionUrl,
  parseMusicCollectionLines,
} from "@/lib/media/music-downloader-policy";

type DownloadResult = { name: string; bytes: Uint8Array; extension: string; source: string; metadata: MusicMetadata };
type PreviewTrack = {
  url: string;
  source: string;
  metadata?: Pick<UrlMediaInfo, "title" | "uploader" | "album" | "releaseYear" | "duration"> | UrlMediaPlaylistEntry;
  title: string;
};
type MusicPreview = { title: string; tracks: PreviewTrack[]; truncated: boolean; warnings: string[] };
const PREVIEW_PAGE_SIZE = 10;
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

function trackFileName(metadata: MusicMetadata, fallback: string, extension: string): string {
  const title = safeName(metadata.title || fallback.replace(/\.[a-z0-9]{1,8}$/i, ""), "track");
  const artist = safeName(metadata.artist || "", "");
  const base = artist && artist.toLocaleLowerCase() !== title.toLocaleLowerCase() ? artist + " - " + title : title;
  const normalized = safeName(base, "track");
  return normalized.toLocaleLowerCase().endsWith("." + extension) ? normalized : normalized + "." + extension;
}

function inferredCollectionTitle(tracks: DownloadResult[]): string {
  const albums = Array.from(new Set(tracks.map((track) => track.metadata.album?.trim()).filter((album): album is string => Boolean(album))));
  if (albums.length === 1) return safeName(albums[0], "My music");
  const artists = Array.from(new Set(tracks.map((track) => track.metadata.albumArtist || track.metadata.artist).map((artist) => artist?.trim()).filter((artist): artist is string => Boolean(artist))));
  if (artists.length === 1) return safeName(artists[0] + " - Collection", "My music");
  return "My music";
}

function mimeForExtension(extension: string): string {
  const types: Record<string, string> = {
    mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav",
    flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/opus",
    aiff: "audio/aiff", aif: "audio/aiff", wma: "audio/x-ms-wma", webm: "audio/webm",
  };
  return types[extension] || "application/octet-stream";
}

function buildArchive(title: string, tracks: DownloadResult[], failures: string[] = []): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  const playlist = ["#EXTM3U"];
  const metadataTracks: Array<Record<string, unknown>> = [];
  tracks.forEach((track, index) => {
    const path = archivePath(track.name, used, "track-" + (index + 1) + "." + track.extension);
    files[path] = track.bytes;
    const label = [track.metadata.artist, track.metadata.title].filter(Boolean).join(" - ") || path.replace(/\.[^.]+$/, "");
    const duration = track.metadata.durationSeconds && track.metadata.durationSeconds > 0 ? String(Math.round(track.metadata.durationSeconds)) : "-1";
    playlist.push("#EXTINF:" + duration + "," + label, path);
    const { artwork, ...tags } = track.metadata;
    let artworkPath: string | undefined;
    if (artwork?.bytes.length) {
      const artworkExtension = artwork.mimeType.toLowerCase().includes("png") ? "png" : "jpg";
      artworkPath = "cover-art/" + String(index + 1).padStart(2, "0") + "-" + (slugify(track.metadata.title || path) || "track") + "." + artworkExtension;
      files[artworkPath] = artwork.bytes;
    }
    metadataTracks.push({ file: path, source: track.source, ...tags, artworkFile: artworkPath });
  });
  if (failures.length) files["failed-downloads.txt"] = strToU8("These tracks were not included in this partial ZIP:\n\n" + failures.join("\n") + "\n");
  files["enV-playlist.m3u"] = strToU8(playlist.join("\n") + "\n");
  files["track-metadata.json"] = strToU8(JSON.stringify({ collection: title, tracks: metadataTracks }, null, 2) + "\n");
  files["README.txt"] = strToU8(
    title + "\n\nCreated with enV Music Downloader.\nThe archive contains the selected audio files, an M3U playlist and the metadata detected in each file. Audio bytes are preserved unchanged. Keep copyright notices and license terms supplied by the original source.\n",
  );
  return zipSync(files, { level: 0 });
}

function isDirectAudioLink(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && Boolean(extensionFromName(url.pathname));
  } catch {
    return false;
  }
}

function extensionFromMime(mime: string): string {
  const normalized = mime.toLowerCase().split(";")[0].trim();
  const byMime: Record<string, string> = {
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a",
    "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav",
    "audio/flac": "flac", "audio/ogg": "ogg", "audio/opus": "opus",
    "audio/aiff": "aiff", "audio/x-ms-wma": "wma",
  };
  return byMime[normalized] || "";
}

function mergeMetadata(
  bytes: Uint8Array,
  fallbackName: string,
  upstream?: Pick<UrlMediaInfo, "title" | "uploader" | "album" | "releaseYear" | "duration"> | UrlMediaPlaylistEntry,
  explicitTitle?: string,
): MusicMetadata {
  const extracted = extractMusicMetadata(bytes, fallbackName);
  const source: Partial<Pick<UrlMediaInfo, "title" | "uploader" | "album" | "releaseYear" | "duration">> = upstream ?? {};
  const year = typeof source.releaseYear === "string"
    ? source.releaseYear.match(/\b(?:19|20)\d{2}\b/)?.[0]
    : undefined;
  return {
    ...extracted,
    title: explicitTitle || source.title || extracted.title,
    artist: extracted.artist || source.uploader,
    album: extracted.album || source.album,
    year: extracted.year || year,
    durationSeconds: extracted.durationSeconds || source.duration,
  };
}

async function downloadMusicTrack(
  url: string,
  sourceReference: string,
  upstream: Pick<UrlMediaInfo, "title" | "uploader" | "album" | "releaseYear" | "duration"> | UrlMediaPlaylistEntry | undefined,
  explicitTitle: string,
  signal: AbortSignal,
  onProgress: (message: string) => void,
): Promise<DownloadResult> {
  const directLink = isDirectAudioLink(url);
  onProgress("Downloading " + (explicitTitle || upstream?.title || "track") + "…");
  const blob = await downloadUrlMedia({
    url,
    audioOnly: !directLink,
    format: directLink ? "best" : "mp3",
    maxBytes: MAX_TRACK_BYTES,
  }, signal);
  if (!blob.size) throw new Error("The source returned an empty audio file.");
  if (blob.size > MAX_TRACK_BYTES) throw new Error("A track exceeds " + formatFileSize(MAX_TRACK_BYTES) + ".");
  const extension = (directLink ? extensionFromName(new URL(url).pathname) : "") || extensionFromMime(blob.type) || "mp3";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const fallback = explicitTitle || upstream?.title || (directLink ? new URL(url).pathname.split("/").pop() || "track" : "track");
  const metadata = mergeMetadata(bytes, fallback + "." + extension, upstream, explicitTitle);
  return {
    name: trackFileName(metadata, fallback, extension),
    bytes,
    extension,
    source: sourceReference,
    metadata,
  };
}

export function MusicDownloaderEngine() {
  const [mode, setMode] = useState<"online" | "offline">("online");
  const [urlText, setUrlText] = useState("");
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [preview, setPreview] = useState<MusicPreview | null>(null);
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [trackStates, setTrackStates] = useState<Record<number, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  // Preserve verified tracks across partial failures and ZIP retries within one preview.
  const completedRef = useRef<Map<number, DownloadResult>>(new Map());
  const failedRef = useRef<Map<number, string>>(new Map());
  const manifestInputRef = useRef<HTMLInputElement | null>(null);
  const localFileInputRef = useRef<HTMLInputElement | null>(null);

  async function importManifest(file?: File) {
    if (!file) return;
    setError("");
    try {
      setUrlText(await file.text());
      completedRef.current.clear();
      failedRef.current.clear();
      setPreview(null);
      setTrackStates({});
      setMode("online");
      setRightsConfirmed(false);
      setResult("Link list loaded.");
    } catch {
      setError("Could not read that link list.");
    }
  }

  async function previewOnline() {
    setError("");
    setResult("");
    setProgress("");
    setPreview(null);
    completedRef.current.clear();
    failedRef.current.clear();
    setShowAllTracks(false);
    setTrackStates({});
    if (!rightsConfirmed) {
      setError("Confirm that you have permission to download these tracks and that the source permits file downloads.");
      return;
    }
    const parsed = parseMusicCollectionLines(urlText);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    const items: PreviewTrack[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>();
    let title = "";
    let truncated = false;
    try {
      for (let index = 0; index < parsed.entries.length; index += 1) {
        const entry = parsed.entries[index];
        setProgress("Finding songs · link " + (index + 1) + " of " + parsed.entries.length + "…");
        try {
          if (isDirectAudioLink(entry.url)) {
            if (!seen.has(entry.url)) {
              items.push({ url: entry.url, source: entry.url, title: entry.title || new URL(entry.url).pathname.split("/").pop() || "Track" });
              seen.add(entry.url);
            }
            continue;
          }

          let info: UrlMediaInfo;
          try {
            info = await inspectUrlMedia(entry.url, undefined, controller.signal, { includePlaylist: isLikelyMusicCollectionUrl(entry.url) });
          } catch (cause) {
            if ((cause as Error)?.name === "AbortError") throw cause;
            if (isLikelyMusicCollectionUrl(entry.url)) throw cause;
            // A failed single-song metadata lookup need not block a later authorized download.
            warnings.push((entry.title || entry.url) + ": metadata could not be previewed; download availability is unverified.");
            info = { provider: "generic", title: entry.title || "Track", formats: [], isPlaylist: false, webpageUrl: entry.url };
          }
          const collection = isLikelyMusicCollectionUrl(entry.url) || Boolean(info.isPlaylist);
          const entries = collection ? info.entries?.filter((item) => item.webpageUrl?.startsWith("https://")) || [] : [];
          if (collection && !entries.length) {
            throw new Error("The collection did not provide any valid individual track links.");
          }
          if (entries.length && !title) title = info.album || info.title || "";
          truncated = truncated || Boolean(info.truncated);
          const resolved: PreviewTrack[] = entries.length ? entries.map((item) => ({
            url: item.webpageUrl,
            source: entry.url,
            metadata: { ...item, album: item.album || info.album || info.title },
            title: item.title,
          })) : [{
            url: entry.url,
            source: entry.url,
            metadata: info,
            title: entry.title || info.title || "Track",
          }];
          for (const item of resolved) {
            if (seen.has(item.url)) continue;
            if (items.length >= 50) { truncated = true; break; }
            seen.add(item.url);
            items.push(item);
          }
        } catch (cause) {
          if ((cause as Error)?.name === "AbortError") throw cause;
          warnings.push((entry.title || entry.url) + ": " + (cause instanceof Error ? cause.message : "Could not inspect this link."));
        }
      }
      if (!items.length) throw new Error(warnings[0] || "No tracks could be previewed from these links.");
      setPreview({ title: title || (items.length === 1 ? items[0].title : "My music"), tracks: items, truncated, warnings });
      setResult("Found " + items.length + " track(s). Review the list before downloading.");
      setProgress("");
    } catch (cause) {
      if ((cause as Error)?.name === "AbortError") setProgress("Preview cancelled.");
      else setError(cause instanceof Error ? cause.message : "Unable to preview songs.");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function downloadPreview(trackIndex?: number, failedOnly = false) {
    if (!preview || busy) return;
    setError("");
    setResult("");
    setProgress("");
    if (!rightsConfirmed) {
      setError("Confirm you have permission to download these tracks.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    const completed = completedRef.current;
    const previousFailures = failedRef.current;
    let totalBytes = [...completed.values()].reduce((sum, track) => sum + track.bytes.byteLength, 0);
    // The initial batch, a resumed batch and a failed-only retry all share the
    // same verified tracks. A retry must never produce a ZIP of only the retried songs.
    const indices = trackIndex === undefined
      ? preview.tracks.map((_, i) => i).filter((i) =>
          !completed.has(i) && (!failedOnly || trackStates[i] === "Unavailable"))
      : [trackIndex];
    try {
      for (const [position, index] of indices.entries()) {
        const item = preview.tracks[index];
        if (!item) continue;
        setTrackStates((previous) => ({ ...previous, [index]: "Downloading…" }));
        setProgress("Downloading " + (position + 1) + " of " + indices.length + ": " + item.title);
        try {
          const track = await downloadMusicWithSingleRetry(
            () => downloadMusicTrack(item.url, item.source, item.metadata, item.title, controller.signal, setProgress),
            controller.signal,
            () => { setTrackStates((previous) => ({ ...previous, [index]: "Retrying…" })); setProgress("Temporary source failure. Retrying " + item.title + " once…"); },
          );
          const oldBytes = completed.get(index)?.bytes.byteLength || 0;
          if (totalBytes - oldBytes + track.bytes.byteLength > MAX_COLLECTION_BYTES) {
            throw new Error("Batch size exceeds " + formatFileSize(MAX_COLLECTION_BYTES) + ".");
          }
          totalBytes = totalBytes - oldBytes + track.bytes.byteLength;
          completed.set(index, track);
          previousFailures.delete(index);
          setTrackStates((previous) => ({ ...previous, [index]: "Ready" }));
          if (trackIndex !== undefined) {
            downloadBlob(new Blob([new Uint8Array(track.bytes).buffer], { type: mimeForExtension(track.extension) }), track.name);
          }
        } catch (cause) {
          if ((cause as Error)?.name === "AbortError") throw cause;
          const message = cause instanceof Error ? cause.message : "Download failed.";
          setTrackStates((previous) => ({ ...previous, [index]: "Unavailable" }));
          previousFailures.set(index, item.title + ": " + message);
        }
      }
      const savedInOrder = preview.tracks.flatMap((_, index) => {
        const track = completed.get(index);
        return track ? [track] : [];
      });
      const failures = trackIndex === undefined
        ? preview.tracks.flatMap((item, index) =>
            completed.has(index) ? [] : [previousFailures.get(index) || item.title + ": Download not completed."])
        : previousFailures.has(trackIndex) ? [previousFailures.get(trackIndex)!] : [];
      const successfulCount = trackIndex === undefined
        ? savedInOrder.length : completed.has(trackIndex) && !previousFailures.has(trackIndex) ? 1 : 0;
      if (trackIndex === undefined && savedInOrder.length) {
        const title = safeName(preview.title || inferredCollectionTitle(savedInOrder), "My music");
        const archive = buildArchive(title, savedInOrder, failures);
        downloadBlob(new Blob([new Uint8Array(archive).buffer], { type: "application/zip" }), (slugify(title) || "music") + ".zip");
      }
      if (successfulCount) {
        setResult((trackIndex === undefined ? "ZIP prepared with " + successfulCount : "Downloaded 1") +
          " track(s) · " + formatFileSize(trackIndex === undefined ? totalBytes : completed.get(trackIndex)?.bytes.byteLength || 0) +
          (failures.length ? ". " + failures.length + " unavailable track(s) were skipped." : "."));
      }
      if (failures.length) {
        setError(failures.slice(0, 5).join("\n") + (failures.length > 5 ? "\n…and " + (failures.length - 5) + " more." : ""));
      }
      if (!successfulCount && !failures.length) setError("No audio was downloaded.");
      setProgress("");
    } catch (cause) {
      if ((cause as Error)?.name === "AbortError") setProgress("Download cancelled. Completed tracks remain available for a resumed ZIP.");
      else setError(cause instanceof Error ? cause.message : "Unable to download the selected music.");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function runOffline() {
    setError("");
    setResult("");
    setProgress("");
    if (!localFiles.length) {
      setError("Choose audio files first.");
      return;
    }
    if (localFiles.length > 50) {
      setError("Choose at most 50 tracks at a time.");
      return;
    }
    const rejected = localFiles.find((file) => !extensionFromName(file.name) || (file.type && !file.type.startsWith("audio/") && file.type !== "application/octet-stream"));
    if (rejected) {
      setError(rejected.name + " is not a supported audio file.");
      return;
    }
    const total = localFiles.reduce((sum, file) => sum + file.size, 0);
    if (localFiles.some((file) => file.size > MAX_TRACK_BYTES) || total > MAX_COLLECTION_BYTES) {
      setError("Each track must be under " + formatFileSize(MAX_TRACK_BYTES) + " and the collection under " + formatFileSize(MAX_COLLECTION_BYTES) + ".");
      return;
    }
    setBusy(true);
    setProgress("Preparing your music…");
    try {
      const tracks: DownloadResult[] = [];
      for (let index = 0; index < localFiles.length; index += 1) {
        const file = localFiles[index];
        setProgress("Preparing " + (index + 1) + " of " + localFiles.length + "…");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const extension = extensionFromName(file.name);
        const metadata = extractMusicMetadata(bytes, file.name);
        tracks.push({ name: trackFileName(metadata, file.name, extension), bytes, extension, source: "device", metadata });
      }
      if (tracks.length === 1) {
        downloadBlob(localFiles[0], tracks[0].name);
      } else {
        const title = inferredCollectionTitle(tracks);
        const archive = buildArchive(title, tracks);
        downloadBlob(new Blob([new Uint8Array(archive).buffer], { type: "application/zip" }), (slugify(title) || "music") + ".zip");
      }
      setResult("Prepared " + tracks.length + " track(s) · " + formatFileSize(total) + ".");
      setProgress("Ready. Your selected music stays on this device; collection exports include detected metadata.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare this collection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface-2 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
            <span aria-hidden="true" className="text-xl">♫</span>
          </div>
          <h2 className="text-base font-semibold">Music Downloader</h2>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Music source">
          <button type="button" role="tab" aria-selected={mode === "online"} onClick={() => { setMode("online"); setError(""); }} className={"min-h-10 rounded-lg border px-3 text-sm font-medium " + (mode === "online" ? "border-accent bg-background text-fg" : "border-border text-muted hover:bg-background")}>Online</button>
          <button type="button" role="tab" aria-selected={mode === "offline"} onClick={() => { setMode("offline"); setError(""); }} className={"min-h-10 rounded-lg border px-3 text-sm font-medium " + (mode === "offline" ? "border-accent bg-background text-fg" : "border-border text-muted hover:bg-background")}>Offline</button>
        </div>
      </div>

      {mode === "online" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="music-download-urls" className="text-sm font-medium">Music links</label>
            <button type="button" onClick={() => manifestInputRef.current?.click()} className="text-sm font-medium text-accent hover:underline">Import list</button>
            <input ref={manifestInputRef} type="file" accept=".txt,.m3u,.m3u8,.json,application/json,text/plain" className="hidden" onChange={(event) => void importManifest(event.target.files?.[0])} />
          </div>
          <textarea id="music-download-urls" value={urlText} onChange={(event) => { setUrlText(event.target.value); setRightsConfirmed(false); setPreview(null); completedRef.current.clear(); failedRef.current.clear(); setTrackStates({}); }} rows={5} spellCheck={false} className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 font-mono text-sm" placeholder={"Paste a song, album, or playlist link\nYou can add more links on separate lines"} />
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm">
            <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />
            <span>I have permission to download this music and the source allows downloads.</span>
          </label>
          <Button type="button" onClick={() => void previewOnline()} disabled={busy} className="w-full">{busy ? "Inspecting music…" : "Preview songs"}</Button>
          {preview ? (
            <section className="space-y-3 rounded-2xl border border-border bg-surface-2 p-3 sm:p-4" aria-label="Track preview">
              <div>
                <h3 className="text-base font-semibold break-words">{preview.title}</h3>
                <p className="text-sm text-muted">{preview.tracks.length} track(s) found{preview.truncated ? " · first 50 shown" : ""}. Track names are metadata only; availability is verified when downloading.</p>
              </div>
              <div className="space-y-2">
                {(showAllTracks ? preview.tracks : preview.tracks.slice(0, PREVIEW_PAGE_SIZE)).map((track, index) => (
                  <div key={track.url + index} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-2.5">
                    <span className="w-6 shrink-0 text-center text-xs text-muted">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={track.title}>{track.title}</p>
                      <p className="truncate text-xs text-muted">{track.metadata?.uploader || "Track"}{trackStates[index] ? " · " + trackStates[index] : ""}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => void downloadPreview(index)} disabled={busy} aria-label={"Download " + track.title}>Download</Button>
                  </div>
                ))}
              </div>
              {preview.tracks.length > PREVIEW_PAGE_SIZE ? (
                <button type="button" className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background" onClick={() => setShowAllTracks((value) => !value)}>
                  {showAllTracks ? "Show less" : "See more (" + (preview.tracks.length - PREVIEW_PAGE_SIZE) + " tracks)"}
                </button>
              ) : null}
              {preview.warnings.length ? <p role="status" className="whitespace-pre-wrap text-xs text-muted">{preview.warnings.length} link(s) could not be fully inspected. {preview.warnings.slice(0, 2).join(" ")}</p> : null}
              <Button type="button" onClick={() => void downloadPreview(preview.tracks.length === 1 ? 0 : undefined)} disabled={busy} className="w-full">{busy ? "Downloading…" : preview.tracks.length === 1 ? "Download song" : "Download ZIP (" + preview.tracks.length + " tracks)"}</Button>
              {Object.values(trackStates).some((state) => state === "Unavailable") ? (
                <Button type="button" variant="outline" onClick={() => void downloadPreview(preview.tracks.length === 1 ? 0 : undefined, preview.tracks.length > 1)} disabled={busy} className="w-full">
                  {preview.tracks.length === 1 ? "Retry song download" : "Retry unavailable tracks and rebuild ZIP (" + Object.values(trackStates).filter((state) => state === "Unavailable").length + ")"}
                </Button>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-border p-3 sm:p-4">
          <input ref={localFileInputRef} id="music-offline-files" type="file" multiple accept={Array.from(MUSIC_AUDIO_EXTENSIONS, (ext) => "." + ext).join(",")} onChange={(event) => { setLocalFiles(Array.from(event.target.files ?? [])); setError(""); setResult(""); }} className="hidden" />
          <button type="button" onClick={() => localFileInputRef.current?.click()} className="flex min-h-20 w-full items-center gap-3 rounded-xl border border-dashed border-border bg-surface-2 px-4 py-3 text-left hover:bg-background">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-xl">♫</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{localFiles.length ? "Change music files" : "Choose music files"}</span>
              <span className="mt-1 block text-xs text-muted">MP3, M4A, FLAC, WAV and more</span>
            </span>
          </button>
          {localFiles.length ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted">{localFiles.length} track(s) · {formatFileSize(localFiles.reduce((sum, file) => sum + file.size, 0))}</p>
              <div className="space-y-1">
                {localFiles.slice(0, 4).map((file) => (
                  <div key={file.name + file.size} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted">{formatFileSize(file.size)}</span>
                  </div>
                ))}
                {localFiles.length > 4 ? <p className="text-xs text-muted">+{localFiles.length - 4} more</p> : null}
              </div>
            </div>
          ) : null}
          <Button type="button" onClick={() => void runOffline()} disabled={busy || !localFiles.length} className="w-full">{busy ? "Preparing…" : "Save offline collection"}</Button>
        </div>
      )}

      {busy ? <div className="space-y-2" role="status" aria-live="polite"><div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full w-1/3 animate-pulse rounded-full bg-accent" /></div><p className="text-sm text-muted">{progress}</p><Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>Cancel</Button></div> : null}
      {error ? <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {result ? <p role="status" className="rounded-xl border border-border bg-surface-2 p-3 text-sm">{result}</p> : null}
      {!busy && progress ? <p className="whitespace-pre-wrap break-words text-sm text-muted">{progress}</p> : null}
    </div>
  );
}
