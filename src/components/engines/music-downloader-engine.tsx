import { useRef, useState } from "react";
import { strToU8, zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { downloadBlob, formatFileSize, slugify } from "@/lib/utils";
import { extractMusicMetadata, type MusicMetadata } from "@/lib/media/music-metadata";
import {
  MUSIC_AUDIO_EXTENSIONS,
  isSafeMusicOrigin,
  parseMusicCollectionLines,
  protectedMusicPlatform,
  validateDirectMusicUrl,
  type MusicCollectionEntry,
} from "@/lib/media/music-downloader-policy";

type DownloadResult = { name: string; bytes: Uint8Array; extension: string; source: string; metadata: MusicMetadata };
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
  const sourceName = entry.title || new URL(valid.url).pathname.split("/").pop() || ("track-" + entry.line);
  const extension = extensionFromName(sourceName) || valid.extension;
  const metadata = extractMusicMetadata(bytes, sourceName);
  return {
    name: trackFileName(metadata, sourceName, extension),
    bytes,
    extension,
    source: valid.url,
    metadata,
  };
}

function buildArchive(title: string, tracks: DownloadResult[]): Uint8Array {
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
  files["enV-playlist.m3u"] = strToU8(playlist.join("\n") + "\n");
  files["track-metadata.json"] = strToU8(JSON.stringify({ collection: title, tracks: metadataTracks }, null, 2) + "\n");
  files["README.txt"] = strToU8(
    title + "\n\nCreated with enV Music Downloader.\nThe archive contains the selected audio files, an M3U playlist and the metadata detected in each file. Audio bytes are preserved unchanged. Keep copyright notices and license terms supplied by the original source.\n",
  );
  return zipSync(files, { level: 0 });
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
  const [platform, setPlatform] = useState<{ label: string; url: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const manifestInputRef = useRef<HTMLInputElement | null>(null);
  const localFileInputRef = useRef<HTMLInputElement | null>(null);

  async function importManifest(file?: File) {
    if (!file) return;
    setError("");
    try {
      setUrlText(await file.text());
      setMode("online");
      setRightsConfirmed(false);
      setResult("Link list loaded.");
    } catch {
      setError("Could not read that link list.");
    }
  }

  async function runOnline() {
    setError("");
    setResult("");
    setPlatform(null);
    if (!rightsConfirmed) {
      setError("Please confirm you have permission to download these files.");
      return;
    }
    const parsed = parseMusicCollectionLines(urlText);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    const blocked = parsed.entries.find((entry) => protectedMusicPlatform(entry.url));
    if (blocked) {
      const info = protectedMusicPlatform(blocked.url);
      if (info) setPlatform(info);
      setError((info?.label ?? "This service") + " does not provide a direct audio-file link here. Use its official download option, or paste an authorized audio-file URL.");
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
        setProgress("Downloading " + (index + 1) + " of " + parsed.entries.length + "…");
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
            ? "This host blocked browser access or could not be reached. Try a direct audio link that permits browser downloads."
            : (cause instanceof Error ? cause.message : "Download failed.");
          failed.push((entry.title || entry.url) + ": " + failureMessage);
        }
      }
      if (!tracks.length) throw new Error(failed[0] || "No tracks could be downloaded.");
      if (tracks.length === 1) {
        const track = tracks[0];
        const singleTrackBytes = new Uint8Array(track.bytes.byteLength);
        singleTrackBytes.set(track.bytes);
        downloadBlob(new Blob([singleTrackBytes.buffer], { type: mimeForExtension(track.extension) }), track.name);
      } else {
        const title = inferredCollectionTitle(tracks);
        const archive = buildArchive(title, tracks);
        downloadBlob(new Blob([new Uint8Array(archive).buffer], { type: "application/zip" }), (slugify(title) || "music") + ".zip");
      }
      setResult("Saved " + tracks.length + " track(s) · " + formatFileSize(totalBytes) + ".");
      setProgress(failed.length ? failed.join("\n") : "Complete. Track names and available embedded metadata have been read from the audio files.");
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
        tracks.push({
          name: trackFileName(metadata, file.name, extension),
          bytes,
          extension,
          source: "device",
          metadata,
        });
      }
      if (tracks.length === 1) {
        const track = tracks[0];
        const copy = new Uint8Array(track.bytes.byteLength);
        copy.set(track.bytes);
        downloadBlob(new Blob([copy.buffer], { type: mimeForExtension(track.extension) }), track.name);
      } else {
        const title = inferredCollectionTitle(tracks);
        const archive = buildArchive(title, tracks);
        downloadBlob(new Blob([new Uint8Array(archive).buffer], { type: "application/zip" }), (slugify(title) || "music") + ".zip");
      }
      setResult("Prepared " + tracks.length + " track(s) · " + formatFileSize(total) + ".");
      setProgress("Ready. Your music stays on this device; detected metadata is included with collection exports.");
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
          <textarea id="music-download-urls" value={urlText} onChange={(event) => { setUrlText(event.target.value); setRightsConfirmed(false); }} rows={5} spellCheck={false} className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 font-mono text-sm" placeholder={"Paste music links here, one per line\nTrack title | https://…/track.mp3"} />
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm">
            <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />
            <span>I have permission to download these files.</span>
          </label>
          <Button type="button" onClick={() => void runOnline()} disabled={busy} className="w-full">{busy ? "Downloading…" : "Download music"}</Button>
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
      {error ? <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><p>{error}</p>{platform ? <a href={platform.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-8 items-center font-medium underline">Open {platform.label}</a> : null}</div> : null}
      {result ? <p role="status" className="rounded-xl border border-border bg-surface-2 p-3 text-sm">{result}</p> : null}
      {!busy && progress ? <p className="whitespace-pre-wrap break-words text-sm text-muted">{progress}</p> : null}
    </div>
  );
}
