import { useMemo, useState } from "react";
import { Archive, Check, FileArchive, FilePlus2, FolderOpen, LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { BlobReader, ZipReader, ZipWriter, type FileEntry } from "@zip.js/zip.js";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { formatArchiveBytes, MAX_ARCHIVE_ENTRIES, MAX_BROWSER_BUFFER_BYTES, MAX_EXTRACT_BYTES, sanitizeArchivePath, shouldStoreWithoutCompression } from "@/lib/zip/archive-utils";

type SaveFileHandle = { createWritable(): Promise<WritableStream<Uint8Array>> };
type DirectoryHandle = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }>;
};
type ArchiveWindow = Window & {
  showSaveFilePicker?: (options?: unknown) => Promise<SaveFileHandle>;
  showDirectoryPicker?: (options?: { mode?: "readwrite" }) => Promise<DirectoryHandle>;
};

const archiveWindow = () => window as ArchiveWindow;

function blobFromChunks(chunks: Uint8Array[], type = "application/octet-stream"): Blob {
  const parts: BlobPart[] = chunks.map((chunk) => {
    const buffer = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(buffer).set(chunk);
    return buffer;
  });
  return new Blob(parts, { type });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function createNonOverwritingFile(parent: DirectoryHandle, requested: string) {
  const dot = requested.lastIndexOf(".");
  const base = dot > 0 ? requested.slice(0, dot) : requested;
  const extension = dot > 0 ? requested.slice(dot) : "";
  for (let suffix = 1; suffix <= 10_000; suffix += 1) {
    const candidate = suffix === 1 ? requested : `${base} (${suffix})${extension}`;
    try {
      await parent.getFileHandle(candidate);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        return parent.getFileHandle(candidate, { create: true });
      }
      if (error instanceof DOMException && error.name === "TypeMismatchError") continue;
      throw error;
    }
  }
  throw new Error("A safe file name could not be created in the selected folder.");
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "The operation was cancelled.";
  return error instanceof Error ? error.message : "The archive could not be processed. Check the file and try again.";
}

export function ZipArchiveEngine() {
  const [mode, setMode] = useState<"compress" | "extract">("compress");
  const [files, setFiles] = useState<File[]>([]);
  const [archive, setArchive] = useState<File | null>(null);
  const [archiveName, setArchiveName] = useState("enV-archive");
  const [compression, setCompression] = useState<"balanced" | "maximum">("balanced");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const canUseSavePicker = typeof window !== "undefined" && typeof archiveWindow().showSaveFilePicker === "function";
  const canUseDirectoryPicker = typeof window !== "undefined" && typeof archiveWindow().showDirectoryPicker === "function";

  function setTab(next: "compress" | "extract") {
    if (busy) return;
    setMode(next);
    setError("");
    setStatus("");
    setProgress(0);
  }

  async function createArchive() {
    if (!files.length || busy) return;
    setError("");
    setStatus("");
    setProgress(0);
    setBusy(true);
    let output: WritableStream<Uint8Array> | null = null;
    let hasDiskHandle = false;
    const bufferedChunks: Uint8Array[] = [];
    try {
      if (canUseSavePicker) {
        const handle = await archiveWindow().showSaveFilePicker!({
          suggestedName: `${archiveName.trim() || "enV-archive"}.zip`,
          types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
        });
        output = await handle.createWritable();
        hasDiskHandle = true;
      } else {
        if (totalBytes > MAX_BROWSER_BUFFER_BYTES) {
          throw new Error("This browser cannot save very large files directly. Use the native enV app or a browser with direct file saving for files over 256 MB.");
        }
        output = new WritableStream<Uint8Array>({
          write(chunk) { bufferedChunks.push(chunk.slice()); },
        });
      }

      const writer = new ZipWriter(output, {
        level: compression === "maximum" ? 9 : 6,
        useWebWorkers: true,
        keepOrder: true,
      });
      let completedBytes = 0;
      const paths = new Set<string>();
      for (const file of files) {
        const proposedPath = sanitizeArchivePath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
        if (!proposedPath) throw new Error(`“${file.name}” has an unsafe file name and was not added.`);
        if (paths.has(proposedPath)) throw new Error(`Two selected files have the same archive path: ${proposedPath}`);
        paths.add(proposedPath);
        const stored = shouldStoreWithoutCompression(file.name);
        await writer.add(proposedPath, file.stream(), {
          level: stored ? 0 : compression === "maximum" ? 9 : 6,
          compressionMethod: stored ? 0 : 8,
          uncompressedSize: file.size,
          lastModDate: new Date(file.lastModified),
          onprogress: (current: number) => {
            const fraction = totalBytes ? (completedBytes + current) / totalBytes : 1;
            setProgress(Math.min(99, Math.round(fraction * 100)));
            setStatus(`Adding ${file.name}`);
          },
        });
        completedBytes += file.size;
        setProgress(Math.min(99, Math.round((completedBytes / Math.max(1, totalBytes)) * 100)));
      }
      await writer.close();
      setProgress(100);
      setStatus("Your ZIP archive is ready.");
      if (!hasDiskHandle) downloadBlob(blobFromChunks(bufferedChunks, "application/zip"), `${archiveName.trim() || "enV-archive"}.zip`);
      setFiles([]);
    } catch (cause) {
      try { await output?.abort?.(cause); } catch { /* The browser may already have closed the stream. */ }
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function extractArchive() {
    if (!archive || busy) return;
    setError("");
    setStatus("");
    setProgress(0);
    setBusy(true);
    let reader: ZipReader<BlobReader> | null = null;
    try {
      const directoryPicker = archiveWindow().showDirectoryPicker;
      const destination = directoryPicker ? await directoryPicker.call(window, { mode: "readwrite" }) : null;
      reader = new ZipReader(new BlobReader(archive), { useWebWorkers: true });
      const entries = await reader.getEntries();
      if (!entries.length) throw new Error("This ZIP archive does not contain any files.");
      if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error("This archive contains too many entries to extract safely.");

      const planned = entries.map((entry) => {
        const path = sanitizeArchivePath(entry.filename);
        if (!path && !entry.directory) throw new Error(`Unsafe archive path rejected: ${entry.filename}`);
        return { entry, path };
      }).filter((item): item is { entry: FileEntry; path: string } => Boolean(item.path) && !item.entry.directory);

      const totalUncompressed = planned.reduce((sum, item) => sum + (item.entry.uncompressedSize || 0), 0);
      if (totalUncompressed > MAX_EXTRACT_BYTES) throw new Error("The archive expands beyond the 100 GB safety limit.");
      for (const item of planned) {
        const unpacked = item.entry.uncompressedSize || 0;
        const packed = item.entry.compressedSize || 0;
        if (unpacked >= 1024 ** 3 && packed > 0 && unpacked / packed > 1000) {
          throw new Error("This archive has an extreme compression ratio and was blocked as a possible ZIP bomb.");
        }
      }

      if (!destination && (planned.length !== 1 || totalUncompressed > MAX_BROWSER_BUFFER_BYTES)) {
        throw new Error("This browser cannot choose an extraction folder. Use enV on Android or iOS, or open enV in Chrome or Edge to extract multiple or large files.");
      }

      let completedBytes = 0;
      let actualExpandedBytes = 0;
      for (const [index, item] of planned.entries()) {
        if (!destination) {
          const chunks: Uint8Array[] = [];
          const writable = new WritableStream<Uint8Array>({
            write(chunk) {
              actualExpandedBytes += chunk.byteLength;
              if (actualExpandedBytes > MAX_BROWSER_BUFFER_BYTES) throw new Error("This archive expands beyond the browser's safe download limit.");
              chunks.push(chunk.slice());
            },
          });
          await item.entry.getData(writable, {
            checkCrc32: true,
            onprogress: (current: number) => {
              const fraction = totalUncompressed ? (completedBytes + current) / totalUncompressed : 1;
              setProgress(Math.min(99, Math.round(fraction * 100)));
            },
          });
          downloadBlob(blobFromChunks(chunks), item.path.split("/").pop() || "extracted-file");
        } else {
          const parts = item.path.split("/");
          let parent = destination;
          for (const folder of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(folder, { create: true });
          const fileHandle = await createNonOverwritingFile(parent, parts[parts.length - 1]);
          const writable = await fileHandle.createWritable();
          const meter = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              actualExpandedBytes += chunk.byteLength;
              if (actualExpandedBytes > MAX_EXTRACT_BYTES) throw new Error("The archive expands beyond the 100 GB safety limit.");
              controller.enqueue(chunk);
            },
          });
          try {
            await Promise.all([
              meter.readable.pipeTo(writable),
              item.entry.getData(meter.writable, {
              checkCrc32: true,
              onprogress: (current: number) => {
                const fraction = totalUncompressed ? (completedBytes + current) / totalUncompressed : 1;
                setProgress(Math.min(99, Math.round(fraction * 100)));
                setStatus(`Extracting ${item.path}`);
              },
            }),
            ]);
          } catch (cause) {
            try { await meter.writable.abort(cause); } catch { /* The extraction stream may already be closed. */ }
            try { await writable.abort(cause); } catch { /* The destination may already be closed. */ }
            throw cause;
          }
        }
        completedBytes += item.entry.uncompressedSize || 0;
        setProgress(Math.min(99, Math.round((completedBytes / Math.max(1, totalUncompressed)) * 100)));
        setStatus(`Extracted ${index + 1} of ${planned.length}`);
      }
      setProgress(100);
      setStatus("Extraction completed. Your files were saved locally.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      try { await reader?.close(); } catch { /* Ignore reader cleanup errors after the result is known. */ }
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface-2">
          <Archive className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">Zip any file</h2>
          <p className="text-sm text-muted">Compress and extract files on this device.</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted">
          <ShieldCheck className="size-3.5" aria-hidden="true" /> Local
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-2 p-1" role="tablist" aria-label="Archive action">
        <button type="button" role="tab" aria-selected={mode === "compress"} onClick={() => setTab("compress")} className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${mode === "compress" ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
          <span className="inline-flex items-center justify-center gap-2"><FileArchive className="size-4" /> Compress</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === "extract"} onClick={() => setTab("extract")} className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${mode === "extract" ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
          <span className="inline-flex items-center justify-center gap-2"><FolderOpen className="size-4" /> Extract</span>
        </button>
      </div>

      {mode === "compress" ? (
        <div className="space-y-4">
          <FileDropzone multiple label="Drop files here or choose files" hint="Choose one file or select as many as you need. They stay on this device." onFiles={(next) => { setFiles((current) => [...current, ...next]); setError(""); setStatus(""); }} />
          {files.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="text-sm font-medium text-fg">{files.length} {files.length === 1 ? "file" : "files"} · {formatArchiveBytes(totalBytes)}</div>
                <button type="button" onClick={() => setFiles([])} disabled={busy} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg disabled:opacity-50"><Trash2 className="size-3.5" /> Clear</button>
              </div>
              <ul className="max-h-56 divide-y divide-border overflow-y-auto">
                {files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <FilePlus2 className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-fg">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted">{formatArchiveBytes(file.size)}</span>
                  <button type="button" aria-label={`Remove ${file.name}`} disabled={busy} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-1 text-muted hover:text-fg disabled:opacity-50"><Trash2 className="size-3.5" /></button>
                </li>)}
              </ul>
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-fg" htmlFor="zip-archive-name">Archive name</label>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
              <input id="zip-archive-name" value={archiveName} onChange={(event) => setArchiveName(event.target.value)} disabled={busy} className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none" maxLength={80} />
              <span className="text-xs text-muted">.zip</span>
            </div>
          </div>
          <div className="space-y-2">
            <span className="block text-sm font-medium text-fg">Compression</span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => setCompression("balanced")} className={`rounded-xl border px-3 py-3 text-left ${compression === "balanced" ? "border-fg bg-surface-2 text-fg" : "border-border bg-surface text-muted"}`}>
                <span className="block text-sm font-medium">Balanced</span><span className="mt-1 block text-xs">Good size and speed</span>
              </button>
              <button type="button" disabled={busy} onClick={() => setCompression("maximum")} className={`rounded-xl border px-3 py-3 text-left ${compression === "maximum" ? "border-fg bg-surface-2 text-fg" : "border-border bg-surface text-muted"}`}>
                <span className="block text-sm font-medium">Maximum</span><span className="mt-1 block text-xs">More CPU time, smaller when possible</span>
              </button>
            </div>
          </div>
          <button type="button" onClick={() => void createArchive()} disabled={!files.length || busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-fg px-4 py-3 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Archive className="size-4" />}
            {busy ? "Creating archive…" : "Create ZIP archive"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <FileDropzone accept=".zip,application/zip,application/x-zip-compressed" label={archive ? archive.name : "Choose a ZIP archive"} hint="Select an archive saved on your device." onFiles={(next) => { setArchive(next[0] ?? null); setError(""); setStatus(""); }} />
          {archive ? <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm"><span className="min-w-0 truncate text-fg">{archive.name}</span><span className="ml-3 shrink-0 text-xs text-muted">{formatArchiveBytes(archive.size)}</span><button type="button" aria-label="Remove archive" onClick={() => setArchive(null)} className="ml-2 rounded p-1 text-muted hover:text-fg"><Trash2 className="size-3.5" /></button></div> : null}
          <button type="button" onClick={() => void extractArchive()} disabled={!archive || busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-fg px-4 py-3 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
            {busy ? "Extracting…" : "Extract files"}
          </button>
          {!canUseDirectoryPicker ? <p className="text-xs leading-5 text-muted">This browser can extract a single small file directly. For folders, multiple files or large archives, use enV on Android or iOS, or open enV in Chrome or Edge.</p> : null}
        </div>
      )}

      {busy || progress > 0 ? <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3" aria-live="polite">
        <div className="flex items-center justify-between text-xs"><span className="text-muted">{status || "Processing locally…"}</span><span className="font-medium text-fg tabular-nums">{progress}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-fg transition-[width]" style={{ width: `${progress}%` }} /></div>
      </div> : null}
      {status && !busy ? <p className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm text-fg" role="status"><Check className="size-4 shrink-0" /> {status}</p> : null}
      {error ? <p className="rounded-xl border border-border px-3 py-3 text-sm text-fg" role="alert">{error}</p> : null}

      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-fg"><ShieldCheck className="size-4" /> Private and on-device</div>
        <p className="mt-1.5 text-xs leading-5 text-muted">Files are read and processed locally. enV does not upload them. ZIP64 supports very large archives; available storage, browser support and device speed still set practical limits.</p>
        <p className="mt-2 text-xs leading-5 text-muted">Already-compressed photos, music and videos are stored without wasting time recompressing them. Text and many documents can shrink much more. A 20 GB file can sometimes become 2 GB, but no compressor can guarantee that result for every file.</p>
      </div>
    </section>
  );
}
