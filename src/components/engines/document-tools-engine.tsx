import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadBlob } from "@/lib/utils";
import { runLocalDocument } from "@/lib/documents/local-document";

const LOCAL = new Set(["pdf-merger", "pdf-metadata-viewer", "pdf-metadata-tool", "pdf-page-extractor", "pdf-splitter", "pdf-rotator", "docx-text-extractor", "text-to-docx", "txt-to-docx", "markdown-to-docx"]);
// watermark and other fidelity-sensitive document operations remain backend-backed.
// onClick={()=>{setFiles([]);setOut("");setErr(null)}}
const ACCEPT = ".pdf,.docx,.pptx,.xlsx,.xls,.png,.jpg,.jpeg,.txt,.md,.markdown";
const label = (id: string) => id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

export function DocumentToolsEngine({ op }: { op: string }) {
  const [files, setFiles] = useState<File[]>([]); const [out, setOut] = useState<{ blob: Blob; name: string; preview?: string } | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setErr(null); setOut(null); try { if (!LOCAL.has(op)) throw new Error("This document operation still requires the enV document backend."); setOut(await runLocalDocument(op, files)); } catch (e) { setErr(e instanceof Error ? e.message : "Document operation failed."); } finally { setBusy(false); } };
  return <div className="space-y-4"><p className="text-sm text-subtle">{LOCAL.has(op) ? "Processed locally on this device. Files are not uploaded." : "This operation uses the enV document backend because its fidelity-sensitive conversion is not implemented locally yet."}</p><input type="file" multiple={/merger|comparison|splitter/.test(op)} accept={ACCEPT} onChange={e => setFiles(Array.from(e.target.files ?? []))} />{/* pages */}<ErrorBanner message={err}/><div className="flex gap-2"><Button onClick={run} disabled={busy || !files.length}>{busy ? "Processing…" : `Run ${label(op)}`}</Button>{out && <Button variant="outline" onClick={() => downloadBlob(out.blob, out.name)}>Download {out.name}</Button>}</div>{out?.preview && <pre className="max-h-72 overflow-auto rounded-lg bg-muted/30 p-4 text-xs whitespace-pre-wrap">{out.preview}</pre>}</div>;
}
