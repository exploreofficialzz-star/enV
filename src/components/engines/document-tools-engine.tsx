import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { downloadBlob } from "@/lib/utils";
import { runLocalDocument } from "@/lib/documents/local-document";

const LOCAL = new Set(["pdf-merger", "pdf-metadata-viewer", "pdf-metadata-tool", "pdf-page-extractor", "pdf-splitter", "pdf-rotator", "docx-text-extractor", "text-to-docx", "txt-to-docx", "markdown-to-docx"]);
const ACCEPT = ".pdf,.docx,.pptx,.xlsx,.xls,.png,.jpg,.jpeg,.txt,.md,.markdown";
const label = (id: string) => id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

export function DocumentToolsEngine({ op }: { op: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [out, setOut] = useState<{ blob: Blob; name: string; preview?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState("1");
  const multiple = /merger|comparison|splitter/.test(op);
  const needsPages = op.includes("page-") || op.endsWith("splitter");

  const run = async () => {
    setBusy(true);
    setErr(null);
    setOut(null);
    try {
      if (!LOCAL.has(op)) throw new Error("This document operation still requires the enV document backend.");
      setOut(await runLocalDocument(op, files, pages));
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Document operation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!LOCAL.has(op) ? <p className="text-sm text-muted">This operation sends the selected files to the enV document processor.</p> : null}
      <FileDropzone accept={ACCEPT} multiple={multiple} disabled={busy} label={multiple ? "Drop documents or browse" : "Drop a document or browse"} onFiles={(next) => { setFiles(next); setOut(null); setErr(null); }} />
      {files.length ? <div className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"><span className="font-medium">{files.length} selected</span><span className="ml-2 text-xs text-muted">{files.slice(0, 3).map((file) => file.name).join(" · ")}{files.length > 3 ? ` · +${files.length - 3} more` : ""}</span></div> : null}
      {needsPages ? (
        <label className="block space-y-1.5 text-sm" htmlFor="document-pages">
          <span className="font-medium">Pages / range</span>
          <input id="document-pages" type="text" inputMode="numeric" autoComplete="off" value={pages} onChange={(event) => setPages(event.target.value)} placeholder="1,3-5" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={busy} />
          <span className="block text-xs text-muted">Choose pages such as 1,3-5. Page numbers start at 1.</span>
        </label>
      ) : null}
      <ErrorBanner message={err} />
      <div className="flex flex-wrap gap-2"><Button onClick={run} disabled={busy || !files.length}>{busy ? "Processing…" : `Run ${label(op)}`}</Button>{out && <Button variant="outline" onClick={() => downloadBlob(out.blob, out.name)}>Download {out.name}</Button>}</div>
      {out?.preview ? <pre className="max-h-72 overflow-auto rounded-lg bg-muted/30 p-4 text-xs whitespace-pre-wrap">{out.preview}</pre> : null}
    </div>
  );
}
