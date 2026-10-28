import { Zip, ZipPassThrough, strToU8 } from "fflate";
import {
  inspectAudioHeader,
  inspectSongZip,
  type ZipEntryHeader,
} from "../media/song-metadata-analyzer.ts";
import {
  SANDBOX_LIMITS,
  sandboxFolderPath,
  sandboxSlug,
  sandboxStem,
  sandboxManifest,
  sandboxMasterTags,
  sandboxCaption,
  sandboxTrainerLyrics,
  sandboxReady,
  type SandboxAudio,
  type SandboxTrack,
  type SandboxWorkspace,
} from "./music-sandbox.ts";
import { sandboxAudio } from "./music-sandbox-storage.ts";

export const SANDBOX_AUDIO_PATTERN = /\.(mp3|wav|flac|m4a|ogg|aac|aiff|aif|opus)$/i;
export interface SandboxEntry {
  path: string;
  size: number;
  read: (signal: AbortSignal) => Promise<Blob>;
}
export interface SandboxImportGroup {
  base: string;
  path: string;
  name: string;
  audio?: SandboxEntry;
  tags?: SandboxEntry;
  lyrics?: SandboxEntry;
}
export function groupSandboxEntries(entries: SandboxEntry[]): {
  groups: SandboxImportGroup[];
  skipped: string[];
} {
  const groups = new Map<string, SandboxImportGroup>(),
    skipped: string[] = [];
  for (const entry of entries) {
    if (/(^|\/)(README\.txt|manifest\.csv|workspace\.json)$/i.test(entry.path)) continue;
    if (
      !SANDBOX_AUDIO_PATTERN.test(entry.path) &&
      !/\.(tags\.json|lyrics\.txt|txt)$/i.test(entry.path)
    ) {
      skipped.push(entry.path);
      continue;
    }
    const base = sandboxStem(entry.path),
      name = base.split("/").pop()!;
    const group = groups.get(base) || {
      base,
      path: base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "",
      name,
    };
    const kind = SANDBOX_AUDIO_PATTERN.test(entry.path)
      ? "audio"
      : /\.tags\.json$/i.test(entry.path)
        ? "tags"
        : "lyrics";
    if (group[kind])
      throw new Error(`Multiple ${kind} files match ${base}. Give each song a unique name.`);
    group[kind] = entry;
    groups.set(base, group);
  }
  return { groups: [...groups.values()], skipped };
}
async function extractEntry(
  bytes: Uint8Array,
  entry: ZipEntryHeader,
  signal: AbortSignal,
): Promise<Blob> {
  signal.throwIfAborted();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    p = entry.localHeaderOffset;
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
  const data = bytes.slice(start, start + entry.compressedSize);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../workers/music-sandbox-zip.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Import cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error(`Reading ${entry.name} timed out. Try a smaller package.`));
    }, 15000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      finish();
      reject(new Error("This ZIP could not be read. Try importing its unpacked files."));
    };
    worker.onmessage = (
      event: MessageEvent<{ data?: Uint8Array<ArrayBuffer>; error?: string }>,
    ) => {
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(new Blob([event.data.data!]));
    };
    worker.postMessage(
      { data, size: entry.uncompressedSize, crc: entry.crc32, method: entry.method },
      [data.buffer],
    );
  });
}
export async function sandboxFileEntries(file: File, signal: AbortSignal): Promise<SandboxEntry[]> {
  signal.throwIfAborted();
  if (!/\.zip$/i.test(file.name)) {
    if (file.size > SANDBOX_LIMITS.fileBytes)
      throw new Error(`${file.name} exceeds 40 MB. Import a smaller file.`);
    return [
      {
        path: file.webkitRelativePath || file.name,
        size: file.size,
        read: async (s) => {
          s.throwIfAborted();
          return file;
        },
      },
    ];
  }
  if (file.size > SANDBOX_LIMITS.packageBytes)
    throw new Error("ZIP packages must be 80 MB or smaller. Split this package into smaller ZIPs.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  const inspected = inspectSongZip(bytes, {
    maxZipBytes: SANDBOX_LIMITS.packageBytes,
    maxExpandedBytes: SANDBOX_LIMITS.expandedBytes,
    maxTrackBytes: SANDBOX_LIMITS.fileBytes,
    maxEntries: SANDBOX_LIMITS.zipEntries,
  });
  return inspected.entries
    .filter(
      (e) =>
        !e.isDirectory &&
        !e.name
          .replaceAll("\\", "/")
          .split("/")
          .some((p) => p.startsWith(".") || p === "__MACOSX"),
    )
    .map((entry) => ({
      path: entry.name.replaceAll("\\", "/"),
      size: entry.uncompressedSize,
      read: (s) => extractEntry(bytes, entry, s),
    }));
}
export async function inspectSandboxAudio(
  blob: Blob,
  filename: string,
  signal: AbortSignal,
): Promise<{ audio: SandboxAudio; duration: number | null }> {
  signal.throwIfAborted();
  // No full-file decode, neural models or signal/semantic guesses in the preparation path.
  const bytes = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer());
  const header = inspectAudioHeader(bytes);
  let duration = header.durationSeconds;
  // RIFF's data length is available without reading the actual PCM payload.
  if (!duration && header.container === "WAVE") {
    const v = new DataView(bytes.buffer);
    let rate = 0;
    for (let p = 12; p + 8 <= bytes.length;) {
      const id = String.fromCharCode(...bytes.subarray(p, p + 4)),
        size = v.getUint32(p + 4, true);
      if (id === "fmt " && size >= 16 && p + 24 <= bytes.length) rate = v.getUint32(p + 16, true);
      if (id === "data" && rate && p + 8 + size <= blob.size) {
        duration = size / rate;
        break;
      }
      p += 8 + size + (size % 2);
    }
  }
  if (!duration)
    duration = await new Promise<number | null>((resolve, reject) => {
      const media = document.createElement("audio"),
        url = URL.createObjectURL(blob);
      let done = false;
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        media.onloadedmetadata = null;
        media.onerror = null;
        media.removeAttribute("src");
        media.load();
        URL.revokeObjectURL(url);
      };
      const finish = (value: number | null) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(value);
      };
      const abort = () => {
        if (done) return;
        done = true;
        cleanup();
        reject(new DOMException("Import cancelled", "AbortError"));
      };
      const timer = setTimeout(() => finish(null), 7000);
      signal.addEventListener("abort", abort, { once: true });
      media.preload = "metadata";
      media.onloadedmetadata = () =>
        finish(Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null);
      media.onerror = () => finish(null);
      media.src = url;
    });
  signal.throwIfAborted();
  return {
    audio: {
      filename,
      extension: filename.split(".").pop()!.toLowerCase(),
      size: blob.size,
      format: header.codec || header.container || filename.split(".").pop()!.toUpperCase(),
      sampleRate: header.sourceSampleRateHz,
      channels: header.channels,
      bitDepth: header.bitDepth,
    },
    duration: duration ? Math.round(duration * 1000) / 1000 : null,
  };
}
export async function exportSandboxZip(
  workspace: SandboxWorkspace,
  tracks: SandboxTrack[],
  training: boolean,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<Blob> {
  const selected = training ? tracks.filter((t) => t.audio && sandboxReady(t)) : tracks;
  if (!selected.length)
    throw new Error(
      training
        ? "No reviewed, cleared audio records are ready for training."
        : "There are no records to export.",
    );
  if (selected.some((t) => !/^[a-z0-9][a-z0-9_-]{0,119}$/.test(t.tags.id)))
    throw new Error(
      "Fix invalid record IDs before exporting. IDs use lowercase letters, numbers, underscores and hyphens.",
    );
  const size =
    selected.reduce(
      (sum, t) =>
        sum +
        (t.audio?.size || 0) +
        strToU8(t.lyrics).length +
        strToU8(JSON.stringify(sandboxMasterTags(t))).length,
      0,
    ) + strToU8(JSON.stringify({ ...workspace, tracks: selected })).length;
  // Leave ZIP overhead headroom so every export fits the 80 MB re-import limit.
  const limit = SANDBOX_LIMITS.exportBytes;
  if (size > limit)
    throw new Error(
      `Select a smaller group of songs for this export (up to ${limit / 1024 / 1024} MB).`,
    );
  const chunks: BlobPart[] = [],
    dataset: Record<string, unknown>[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, data) => {
    if (error) failure = error;
    else chunks.push(data as Uint8Array<ArrayBuffer>);
  });
  const add = async (name: string, blob: Blob) => {
    signal.throwIfAborted();
    const entry = new ZipPassThrough(name);
    zip.add(entry);
    const chunkSize = 1024 * 1024;
    if (!blob.size) entry.push(new Uint8Array(), true);
    for (let p = 0; p < blob.size; p += chunkSize) {
      signal.throwIfAborted();
      entry.push(
        new Uint8Array(await blob.slice(p, p + chunkSize).arrayBuffer()),
        p + chunkSize >= blob.size,
      );
      if (failure) throw failure;
    }
  };
  const addText = (name: string, text: string) => add(name, new Blob([strToU8(text)]));
  try {
    for (let i = 0; i < selected.length; i++) {
      const t = selected[i]!;
      progress(`Preparing ${i + 1} of ${selected.length} · ${t.title}`);
      const path = sandboxFolderPath(
        workspace.folders.find((f) => f.key === t.folderId),
        workspace.folders,
      )
        .split("/")
        .filter(Boolean)
        .map(sandboxSlug)
        .join("/");
      const base = `${path ? path + "/" : ""}${t.tags.id}`;
      if (t.audio) {
        const blob = await sandboxAudio(t.key);
        if (!blob)
          throw new Error(`Audio is missing for ${t.tags.id}. Restore it before exporting.`);
        await add(`${base}.${t.audio.extension}`, blob);
      }
      await addText(`${base}.lyrics.txt`, training ? sandboxTrainerLyrics(t.lyrics) : t.lyrics);
      if (training) {
        const caption = sandboxCaption(t);
        if (caption.length > 500)
          throw new Error(
            `${t.tags.id} has a caption longer than 500 characters. Shorten its descriptive tags.`,
          );
        await addText(`${base}.caption.txt`, caption);
        const annotation = {
          caption,
          bpm: t.tags.tempo_bpm,
          keyscale: t.tags.key,
          timesignature: t.tags.time_signature,
          vocal_language: t.instrumental ? "instrumental" : "unknown",
          duration: t.tags.duration_seconds,
        };
        await addText(`${base}.json`, JSON.stringify(annotation, null, 2));
        dataset.push({
          audio: `${base}.${t.audio!.extension}`,
          lyrics: `${base}.lyrics.txt`,
          ...annotation,
        });
      } else await addText(`${base}.tags.json`, JSON.stringify(sandboxMasterTags(t), null, 2));
    }
    await addText("manifest.csv", sandboxManifest(selected, workspace.folders));
    if (training) {
      await addText("dataset.jsonl", dataset.map((row) => JSON.stringify(row)).join("\n"));
      await addText(
        "README.txt",
        "Preparation export for ACE-Step-style workflows. Verify annotation field names and dataset schema against the exact trainer/version you install before training. This is not a validated native trainer dataset. Captions omit identity, rights and source fields; technical controls are separate. Only cleared, reviewed audio records are included. Language-specific section labels remain in master backups. Mixed/unsupported vocal languages use unknown; captions retain language names.\n",
      );
    } else {
      await addText(
        "workspace.json",
        JSON.stringify(
          {
            schema: "env.music-sandbox.v1",
            exportedAt: new Date().toISOString(),
            folders: workspace.folders,
            tracks: selected,
            settings: workspace.settings,
          },
          null,
          2,
        ),
      );
      await addText(
        "README.txt",
        "AI Music Data Sandbox master backup. Matching audio, .lyrics.txt and .tags.json share one ID. Import a ZIP or its extracted files back into the sandbox; imported records require a fresh human review. workspace.json preserves workspace notes, settings and record history for reference. Keep backups outside browser storage.\n",
      );
    }
    zip.end();
    if (failure) throw failure;
    return new Blob(chunks, { type: "application/zip" });
  } catch (e) {
    zip.terminate();
    throw e;
  }
}
