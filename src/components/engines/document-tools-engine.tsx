import { useState } from "react";
import { apiUrl } from "@/lib/api/base";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { downloadBlob } from "@/lib/utils";
import { runLocalDocument, type LocalDocumentResult } from "@/lib/documents/local-document";

const LOCAL = new Set(["pdf-merger", "pdf-metadata-viewer", "pdf-metadata-tool", "pdf-page-extractor", "pdf-splitter", "pdf-rotator", "docx-text-extractor", "text-to-docx", "txt-to-docx", "markdown-to-docx"]);
const ACCEPT = ".pdf,.docx,.pptx,.xlsx,.xls,.png,.jpg,.jpeg,.txt,.md,.markdown";
const label = (id: string) => id.replace(/-/g, " ").replace(/\\b\\w/g, c => c.toUpperCase());

export function DocumentToolsEngine({ op }: { op: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [out, setOut] = useState("");
  const [output, setOutput] = useState<LocalDocumentResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const multiple = /merger|comparison|splitter/.test(op);
  const needsPages = /page-|splitter/.test(op); const [pages, setPages] = useState("1");
  const needsWatermark = /watermark/.test(op); const [watermarkText, setWatermarkText] = useState("enV");

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setOut("");
    setOutput(null);
    try {
      if (!files.length) throw new Error("Choose the document or file required by this tool.");
      let result: LocalDocumentResult;
      if (LOCAL.has(op)) {
        result = await runLocalDocument(op, files, { pages });
      } else {
        const form = new FormData();
        for (const file of files) form.append("files", file, file.name);
        form.append("operation", op);
        form.append("params", JSON.stringify({ pages, text: watermarkText }));
        form.append("outputName", `${op}-output`);
        const response = await fetch(apiUrl("/api/backend/documents"), {
          method: "POST",
          body: form,
          credentials: "include",
        });
        if (!response.ok) {
          let message = `Document service returned HTTP ${response.status}.`;
          try {
            const payload = await response.json() as { error?: unknown };
            if (typeof payload.error === "string" && payload.error.trim()) message = payload.error;
          } catch {
            // Keep the status-specific message when an upstream response is not JSON.
          }
          throw new Error(message);
        }
        const blob = await response.blob();
        const disposition = response.headers.get("content-disposition") ?? "";
        const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? `${op}-output`;
        result = { blob, name: filename };
      }
      setOutput(result);
      setOut(`${label(op)} completed · ${(result.blob.size / 1024).toFixed(1)} KB`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Document operation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!LOCAL.has(op) ? <p className="text-sm text-muted">This operation sends the selected files to the enV document processor.</p> : null}
      <FileDropzone accept={ACCEPT} multiple={multiple} disabled={busy} label={multiple ? "Drop documents or browse" : "Drop a document or browse"} onFiles={(next) => { setFiles(next); setOut(""); setOutput(null); setErr(null); }} />
      {files.length ? <div className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"><span className="font-medium">{files.length} selected</span><span className="ml-2 text-xs text-muted">{files.slice(0, 3).map((file) => file.name).join(" · ")}{files.length > 3 ? ` · +${files.length - 3} more` : ""}</span></div> : null}
      {needsPages ? <label className="block space-y-1 text-sm"><span className="font-medium">Pages / range</span><input className="w-full rounded-lg border border-border bg-background px-3 py-2" value={pages} onChange={(event) => setPages(event.target.value)} placeholder="1,3-5" /></label> : null}
      {needsWatermark ? <label className="block space-y-1 text-sm"><span className="font-medium">Watermark text</span><input className="w-full rounded-lg border border-border bg-background px-3 py-2" value={watermarkText} onChange={(event) => setWatermarkText(event.target.value)} /></label> : null}
      <ErrorBanner message={err} />
      {out ? <p className="text-sm text-muted" role="status">{out}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={run} disabled={busy || !files.length}>{busy ? "Processing…" : `Run ${label(op)}`}</Button>
        <Button variant="outline" onClick={() => downloadBlob(output?.blob ?? new Blob(), output?.name ?? `${op}-output`)} disabled={!output}>Download {output?.name ?? "result"}</Button>
        <Button variant="outline" onClick={()=>{setFiles([]);setOut("");setErr(null);setOutput(null);}}>Reset</Button>
      </div>
      {output?.preview ? <pre className="max-h-72 overflow-auto rounded-lg bg-muted/30 p-4 text-xs whitespace-pre-wrap">{output.preview}</pre> : null}
    </div>
  );
}
