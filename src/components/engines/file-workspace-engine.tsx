import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { Archive, Check, Copy, FileSearch, FolderOpen, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";

type DirectoryLike = {
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
};
type FileSystemPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<DirectoryLike>;
};
type CompareRow = { path: string; status: "added" | "removed" | "changed" | "same" | "unverified" };

const MAX_BROWSER_HASH_BYTES = 64 * 1024 * 1024;
const MAX_TEXT_SEARCH_BYTES = 8 * 1024 * 1024;
const MAX_WORKSPACE_FILES = 100_000;

function relativePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "no-extension";
}

function fileGroup(file: File): string {
  const ext = extension(file.name);
  if (["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "heic", "bmp"].includes(ext)) return "Images";
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a", "opus"].includes(ext)) return "Audio";
  if (["mp4", "mov", "mkv", "webm", "avi", "m4v"].includes(ext)) return "Video";
  if (["pdf", "doc", "docx", "odt", "rtf", "txt", "md", "csv", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "Documents";
  if (["zip", "7z", "rar", "tar", "gz", "bz2", "xz", "zst"].includes(ext)) return "Archives";
  if (["js", "ts", "tsx", "jsx", "html", "css", "json", "xml", "yaml", "yml", "toml", "py", "kt", "swift", "java", "c", "cpp", "h", "sh", "sql"].includes(ext)) return "Code";
  return "Other";
}

function safeSegment(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 92 || '<>:"/|?*'.includes(character) ? "_" : character;
  }).join("").replace(/[. ]+$/g, "").trim() || "file";
}
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function createZip(entries: Array<{ path: string; file: File }>): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter("application/zip"), {
    level: 6,
    useWebWorkers: true,
    keepOrder: true,
  });
  const used = new Set<string>();
  for (const item of entries) {
    let path = item.path.split("/").map(safeSegment).join("/");
    if (!path || used.has(path.toLowerCase())) {
      const slash = path.lastIndexOf("/");
      const parent = slash >= 0 ? path.slice(0, slash + 1) : "";
      const leaf = slash >= 0 ? path.slice(slash + 1) : path;
      const dot = leaf.lastIndexOf(".");
      const base = dot > 0 ? leaf.slice(0, dot) : leaf;
      const ext = dot > 0 ? leaf.slice(dot) : "";
      let n = 2;
      while (used.has((parent + base + " (" + n + ")" + ext).toLowerCase())) n += 1;
      path = parent + base + " (" + n + ")" + ext;
    }
    used.add(path.toLowerCase());
    await writer.add(path, item.file.stream(), {
      level: 6,
      uncompressedSize: item.file.size,
      lastModDate: new Date(item.file.lastModified),
    });
  }
  return await writer.close();
}

async function sha256(file: File): Promise<string> {
  if (file.size > MAX_BROWSER_HASH_BYTES) {
    throw new Error(file.name + " exceeds the browser's 64 MB per-file verification limit. Use the enV Android or iOS app for streaming large-file checks.");
  }
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function walkDirectory(directory: DirectoryLike, prefix = "", state = { count: 0 }): Promise<File[]> {
  const found: File[] = [];
  for await (const [name, entry] of directory.entries()) {
    const path = prefix ? prefix + "/" + name : name;
    if ("getFile" in entry) {
      state.count += 1;
      if (state.count > MAX_WORKSPACE_FILES) {
        throw new Error("This folder contains more than 100,000 files. Select a smaller folder.");
      }
      const file = await entry.getFile();
      Object.defineProperty(file, "webkitRelativePath", { value: path, configurable: true });
      found.push(file);
    } else {
      found.push(...await walkDirectory(entry as unknown as DirectoryLike, path, state));
    }
  }
  return found;
}

function inputFiles(event: React.ChangeEvent<HTMLInputElement>): File[] {
  return Array.from(event.target.files ?? []);
}

export function FileWorkspaceEngine({ toolId }: { toolId: string }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [files, setFiles] = useState<File[]>([]);
  const [rightFiles, setRightFiles] = useState<File[]>([]);
  const [query, setQuery] = useState("");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [startNumber, setStartNumber] = useState("1");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<string[]>([]);
  const [compareRows, setCompareRows] = useState<CompareRow[]>([]);
  const folderInput = useRef<HTMLInputElement>(null);
  const rightFolderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const rightFileInput = useRef<HTMLInputElement>(null);

  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const title = ({
    "file-organizer": "File Organizer",
    "batch-file-renamer": "Batch File Renamer",
    "duplicate-file-finder": "Duplicate File Finder",
    "folder-size-analyzer": "Folder Size Analyzer",
    "file-search": "File Search",
    "file-compare": "File & Folder Compare",
  } as Record<string, string>)[toolId] ?? "File Workspace";

  const description = ({
    "file-organizer": "Sort selected files into clear folders by file type and download an organized copy. Your originals are never moved or deleted.",
    "batch-file-renamer": "Preview a batch rename, resolve name collisions, and export renamed copies in one ZIP archive.",
    "duplicate-file-finder": "Find identical files using SHA-256 content checks, not filenames or file size alone.",
    "folder-size-analyzer": "Review selected folder contents by total size, file type, and largest files.",
    "file-search": "Find files by name or search inside supported text files without a terminal.",
    "file-compare": "Compare two file selections to identify added, missing, changed, and verified identical files.",
  } as Record<string, string>)[toolId] ?? "Work with files locally on this device.";

  function resetResult() {
    setStatus("");
    setError("");
    setReport([]);
    setCompareRows([]);
  }

  function chooseFiles() {
    resetResult();
    fileInput.current?.click();
  }

  async function chooseFolder(side: "left" | "right" = "left") {
    resetResult();
    const picker = (window as FileSystemPickerWindow).showDirectoryPicker;
    if (picker) {
      try {
        setBusy(true);
        const directory = await picker({ mode: "read" });
        const found = await walkDirectory(directory);
        if (side === "right") setRightFiles(found); else setFiles(found);
        setStatus(found.length + " files indexed locally.");
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "The selected folder could not be read.");
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    const input = side === "right" ? rightFolderInput.current : folderInput.current;
    if (input) {
      input.setAttribute("webkitdirectory", "");
      input.click();
    }
  }

  function receiveFiles(event: ChangeEvent<HTMLInputElement>, side: "left" | "right" = "left") {
    const selected = inputFiles(event);
    resetResult();
    if (selected.length > MAX_WORKSPACE_FILES) {
      setError("This selection contains more than 100,000 files. Select a smaller set.");
      event.target.value = "";
      return;
    }
    if (side === "right") setRightFiles(selected);
    else setFiles(selected);
    if (selected.length) setStatus(selected.length + " files selected.");
    event.target.value = "";
  }

  async function organizeFiles() {
    if (!files.length || busy) return;
    setBusy(true);
    resetResult();
    try {
      const entries = files.map((file) => ({
        path: fileGroup(file) + "/" + safeSegment(file.name),
        file,
      }));
      const archive = await createZip(entries);
      downloadBlob(archive, "enV-organized-files.zip");
      setStatus("Organized archive created. Original files were not changed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected files could not be organized.");
    } finally {
      setBusy(false);
    }
  }

  const renamed = useMemo(() => {
    const initial = Math.max(1, Number.parseInt(startNumber, 10) || 1);
    return files.map((file, index) => {
      const name = file.name;
      const dot = name.lastIndexOf(".");
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      const replaced = find ? base.split(find).join(replace) : base;
      const next = prefix + replaced + suffix;
      const number = String(initial + index).padStart(3, "0");
      return { file, name: safeSegment(number + "-" + next + ext) };
    });
  }, [files, prefix, suffix, find, replace, startNumber]);

  const renameCollision = useMemo(() => {
    const names = renamed.map((item) => item.name.toLowerCase());
    return new Set(names).size !== names.length;
  }, [renamed]);

  async function exportRenamedFiles() {
    if (!files.length || busy || renameCollision) return;
    setBusy(true);
    resetResult();
    try {
      const archive = await createZip(renamed.map((item) => ({ path: item.name, file: item.file })));
      downloadBlob(archive, "enV-renamed-files.zip");
      setStatus("Renamed copies exported. Original files remain unchanged.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The renamed files could not be exported.");
    } finally {
      setBusy(false);
    }
  }

  async function findDuplicates() {
    if (files.length < 2 || busy) return;
    setBusy(true);
    resetResult();
    try {
      const bySize = new Map<number, File[]>();
      for (const file of files) bySize.set(file.size, [...(bySize.get(file.size) ?? []), file]);
      const candidates = [...bySize.values()].filter((group) => group.length > 1).flat();
      const byDigest = new Map<string, File[]>();
      for (let index = 0; index < candidates.length; index += 1) {
        const file = candidates[index];
        const digest = await sha256(file);
        byDigest.set(digest, [...(byDigest.get(digest) ?? []), file]);
        setStatus("Checking file " + (index + 1) + " of " + candidates.length + "…");
      }
      const groups = [...byDigest.entries()].filter(([, group]) => group.length > 1);
      const rows = groups.flatMap(([digest, group], index) => [
        "Duplicate group " + (index + 1) + " · SHA-256 " + digest,
        ...group.map((file) => "  " + relativePath(file) + " · " + file.size + " bytes"),
      ]);
      setReport(rows.length ? rows : ["No identical files were found in the selected set."]);
      setStatus(groups.length + " verified duplicate group(s) found.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Duplicate verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function analyzeFolder() {
    if (!files.length) return;
    const byType = new Map<string, { count: number; bytes: number }>();
    for (const file of files) {
      const key = fileGroup(file) + " (." + extension(file.name) + ")";
      const current = byType.get(key) ?? { count: 0, bytes: 0 };
      byType.set(key, { count: current.count + 1, bytes: current.bytes + file.size });
    }
    const largest = files.slice().sort((a, b) => b.size - a.size).slice(0, 10);
    const rows = [
      "Files scanned: " + files.length,
      "Total size: " + totalBytes.toLocaleString() + " bytes",
      "",
      "Storage by type:",
      ...[...byType.entries()].sort((a, b) => b[1].bytes - a[1].bytes).map(([type, value]) => type + " · " + value.count + " files · " + value.bytes.toLocaleString() + " bytes"),
      "",
      "Largest files:",
      ...largest.map((file) => relativePath(file) + " · " + file.size.toLocaleString() + " bytes"),
    ];
    setReport(rows);
    setStatus("Folder inventory ready. Files were only read, not changed.");
  }

  async function searchFiles() {
    if (!files.length || !query.trim()) return;
    setBusy(true);
    resetResult();
    const needle = query.trim().toLocaleLowerCase();
    const rows: string[] = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const path = relativePath(file);
        if (path.toLocaleLowerCase().includes(needle)) rows.push(path + " · filename match");
        const textLike = /\.(txt|md|csv|tsv|json|xml|ya?ml|html?|css|js|ts|sql|log|ini|toml|sh)$/i.test(file.name) || file.type.startsWith("text/");
        if (textLike && file.size <= MAX_TEXT_SEARCH_BYTES) {
          const text = (await file.text()).split(/\r?\n/);
          text.forEach((line, lineIndex) => {
            if (line.toLocaleLowerCase().includes(needle)) rows.push(path + ":" + (lineIndex + 1) + " · " + line.trim().slice(0, 240));
          });
        }
        setStatus("Searching " + (index + 1) + " of " + files.length + " files…");
      }
      setReport(rows.length ? rows : ["No filename or text matches were found."]);
      setStatus("Search complete. Very large text files above 8 MB were skipped for browser safety.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "File search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function compareFolders() {
    if (!files.length || !rightFiles.length || busy) return;
    setBusy(true);
    resetResult();
    try {
      const left = new Map(files.map((file) => [relativePath(file), file]));
      const right = new Map(rightFiles.map((file) => [relativePath(file), file]));
      const rows: CompareRow[] = [];
      for (const [path, file] of left) {
        const other = right.get(path);
        if (!other) {
          rows.push({ path: relativePath(file), status: "removed" });
        } else if (file.size !== other.size) {
          rows.push({ path: relativePath(file), status: "changed" });
        } else if (file.size > MAX_BROWSER_HASH_BYTES) {
          rows.push({ path: relativePath(file), status: "unverified" });
        } else {
          const [a, b] = await Promise.all([sha256(file), sha256(other)]);
          rows.push({ path: relativePath(file), status: a === b ? "same" : "changed" });
        }
      }
      for (const [path, file] of right) {
        if (!left.has(path)) rows.push({ path: relativePath(file), status: "added" });
      }
      setCompareRows(rows.sort((a, b) => a.path.localeCompare(b.path)));
      const counts = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      }, {});
      setStatus(Object.entries(counts).map(([key, count]) => key + ": " + count).join(" · "));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected folders could not be compared.");
    } finally {
      setBusy(false);
    }
  }

  const isCompare = toolId === "file-compare";
  const isRenamer = toolId === "batch-file-renamer";
  const isOrganizer = toolId === "file-organizer";
  const isDuplicates = toolId === "duplicate-file-finder";
  const isFolderSize = toolId === "folder-size-analyzer";
  const isSearch = toolId === "file-search";

  return (
    <section data-file-workspace-ready={hydrated ? "true" : "false"} className="mx-auto w-full max-w-3xl space-y-4">
      <header className="flex items-start gap-3 rounded-xl border border-border bg-surface-2/50 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface">
          {isOrganizer ? <FolderOpen className="size-5" /> : isDuplicates ? <ShieldCheck className="size-5" /> : isSearch ? <Search className="size-5" /> : isCompare ? <FileSearch className="size-5" /> : <Archive className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-subtle">{description}</p>
          <p className="mt-2 text-xs text-subtle">Local processing · No terminal commands · Your selected files are not uploaded</p>
        </div>
      </header>

      <input ref={fileInput} type="file" multiple className="hidden" onChange={(event) => receiveFiles(event, "left")} />
      <input ref={rightFileInput} type="file" multiple className="hidden" onChange={(event) => receiveFiles(event, "right")} />
      <input ref={folderInput} type="file" multiple className="hidden" onChange={(event) => receiveFiles(event, "left")} />
      <input ref={rightFolderInput} type="file" multiple className="hidden" onChange={(event) => receiveFiles(event, "right")} />
      {isCompare ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-medium">First folder or file set</p>
            <Button className="mt-3 w-full" variant="outline" onClick={() => void chooseFolder("left")}>Choose first folder</Button>
            <Button className="mt-2 w-full" size="sm" variant="ghost" onClick={chooseFiles}>Or choose files</Button>
            <p className="mt-2 text-xs text-subtle">{files.length} selected</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-medium">Second folder or file set</p>
            <Button className="mt-3 w-full" variant="outline" onClick={() => void chooseFolder("right")}>Choose second folder</Button>
            <Button className="mt-2 w-full" size="sm" variant="ghost" onClick={() => { resetResult(); rightFileInput.current?.click(); }}>Or choose files</Button>
            <p className="mt-2 text-xs text-subtle">{rightFiles.length} selected</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Select files</p>
              <p className="text-xs text-subtle">{files.length} selected · {totalBytes.toLocaleString()} bytes</p>
            </div>
            <div className="flex gap-2">
              {(isFolderSize || isOrganizer || isSearch) ? <Button variant="outline" size="sm" onClick={() => void chooseFolder()} disabled={busy}> <FolderOpen className="mr-1 size-4" /> Choose folder</Button> : null}
              <Button variant="outline" size="sm" onClick={chooseFiles}>Choose files</Button>
            </div>
          </div>
          {files.length ? (
            <ul className="mt-3 max-h-36 divide-y divide-border overflow-y-auto text-sm">
              {files.slice(0, 100).map((file, index) => <li key={index} className="flex justify-between gap-3 py-2"><span className="min-w-0 truncate">{relativePath(file)}</span><span className="shrink-0 text-xs text-subtle">{file.size.toLocaleString()} B</span></li>)}
              {files.length > 100 ? <li className="py-2 text-xs text-subtle">And {files.length - 100} more files</li> : null}
            </ul>
          ) : null}
        </div>
      )}

      {isRenamer ? (
        <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">Prefix<input className="w-full rounded-lg border border-border bg-surface px-3 py-2" value={prefix} onChange={(e) => setPrefix(e.target.value)} /></label>
          <label className="space-y-1 text-sm">Suffix<input className="w-full rounded-lg border border-border bg-surface px-3 py-2" value={suffix} onChange={(e) => setSuffix(e.target.value)} /></label>
          <label className="space-y-1 text-sm">Find in filename<input className="w-full rounded-lg border border-border bg-surface px-3 py-2" value={find} onChange={(e) => setFind(e.target.value)} /></label>
          <label className="space-y-1 text-sm">Replace with<input className="w-full rounded-lg border border-border bg-surface px-3 py-2" value={replace} onChange={(e) => setReplace(e.target.value)} /></label>
          <label className="space-y-1 text-sm">Starting number<input inputMode="numeric" className="w-full rounded-lg border border-border bg-surface px-3 py-2" value={startNumber} onChange={(e) => setStartNumber(e.target.value)} /></label>
          <div className="text-xs text-subtle sm:self-end">Original files remain unchanged. Export a ZIP of renamed copies.</div>
          {renamed.length ? <div className="sm:col-span-2"><p className="text-sm font-medium">Before and after</p><ul className="mt-2 max-h-44 overflow-y-auto rounded-lg bg-surface-2 p-3 text-xs">{renamed.slice(0, 80).map((item, index) => <li key={index} className="grid grid-cols-2 gap-3 py-1"><span className="truncate">{item.file.name}</span><span className="truncate font-medium">{item.name}</span></li>)}</ul></div> : null}
          {renameCollision ? <p className="text-sm text-destructive sm:col-span-2">Two or more files would have the same output name. Adjust the rules before exporting.</p> : null}
        </div>
      ) : null}

      {isSearch ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row">
          <input className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names or text inside files" />
          <Button onClick={() => void searchFiles()} disabled={!files.length || !query.trim() || busy}><Search className="mr-1 size-4" /> Search</Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {isOrganizer ? <Button onClick={() => void organizeFiles()} disabled={!files.length || busy}><FolderOpen className="mr-1 size-4" /> Organize copies into ZIP</Button> : null}
        {isRenamer ? <Button onClick={() => void exportRenamedFiles()} disabled={!files.length || busy || renameCollision}><Archive className="mr-1 size-4" /> Export renamed ZIP</Button> : null}
        {isDuplicates ? <Button onClick={() => void findDuplicates()} disabled={files.length < 2 || busy}><ShieldCheck className="mr-1 size-4" /> Find identical files</Button> : null}
        {isFolderSize ? <Button onClick={() => void analyzeFolder()} disabled={!files.length || busy}>Analyze storage</Button> : null}
        {isCompare ? <Button onClick={() => void compareFolders()} disabled={!files.length || !rightFiles.length || busy}>Compare sets</Button> : null}
        {files.length || rightFiles.length ? <Button variant="ghost" onClick={() => { setFiles([]); setRightFiles([]); resetResult(); }}>Clear selection</Button> : null}
      </div>

      {busy ? <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm" role="status">Processing locally…</div> : null}
      {status && !busy ? <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm" role="status"><Check className="mr-1 inline size-4" />{status}</div> : null}
      <ErrorBanner message={error} />

      {compareRows.length ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border px-3 py-2 text-sm font-medium">Comparison results</div>
          {compareRows.map((row, index) => <div key={index} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-xs last:border-b-0"><span className="min-w-0 truncate">{row.path}</span><span className="shrink-0 font-medium uppercase">{row.status}</span></div>)}
        </div>
      ) : null}
      {report.length ? (
        <div className="rounded-xl border border-border p-3">
          <div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium">Results</p><Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(report.join("\n"))}><Copy className="mr-1 size-3" /> Copy</Button></div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-subtle">{report.join("\n")}</pre>
        </div>
      ) : null}
    </section>
  );
}