import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { recordToolExecutionResult } from "@/lib/analytics/client";
import { docxToText } from "@/lib/documents/local-document";
import { extractPdfTextLocally } from "@/lib/a-book/pdf-reader";

const MAX_FILE_TO_TXT_BYTES = 200 * 1024 * 1024;
const MAX_FILE_TO_TXT_OUTPUT_BYTES = 32 * 1024 * 1024;


const IMAGE_OPS = new Set(["jpg-to-png", "png-to-jpg", "png-to-webp", "webp-to-png", "jpg-to-webp", "webp-to-jpg", "svg-to-png", "png-to-svg"]);
const ACCEPT: Record<string, string> = {
  "jpg-to-png": "image/jpeg,.jpg,.jpeg", "png-to-jpg": "image/png", "png-to-webp": "image/png", "webp-to-png": "image/webp",
  "jpg-to-webp": "image/jpeg,.jpg,.jpeg", "webp-to-jpg": "image/webp", "svg-to-png": "image/svg+xml,.svg", "png-to-svg": "image/png",
  "csv-to-json": ".csv,text/csv", "json-to-csv": ".json,application/json", "csv-to-tsv": ".csv,text/csv", "tsv-to-csv": ".tsv,text/tab-separated-values",
  "xml-to-json": ".xml,text/xml,application/xml", "json-to-xml": ".json,application/json", "yaml-to-json": ".yaml,.yml,text/yaml", "json-to-yaml": ".json,application/json",
  "txt-to-csv": ".txt,text/plain", "csv-to-txt": ".csv,text/csv", "markdown-to-html": ".md,.markdown,text/markdown", "html-to-markdown": ".html,.htm,text/html",
  "file-to-txt": ".txt,.md,.markdown,.csv,.tsv,.json,.xml,.yaml,.yml,.html,.htm,.css,.js,.ts,.sql,.log,.ini,.toml,.sh,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (ch === delimiter && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}
function csvEscape(v: unknown) { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }
function rowsToCsv(rows: string[][], delimiter = ",") { return rows.map(r => r.map(csvEscape).join(delimiter)).join("\r\n") + "\r\n"; }
function csvToJson(text: string, delimiter = ",") { const rows = parseCsv(text, delimiter); if (!rows.length) return "[]"; const headers = rows[0].map((h, i) => h.trim() || `column_${i + 1}`); return JSON.stringify(rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))), null, 2); }
function jsonToRows(text: string): string[][] { const data = JSON.parse(text); const arr = Array.isArray(data) ? data : [data]; const keys = [...new Set(arr.flatMap(x => x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x) : []))]; return [keys, ...arr.map(x => keys.map(k => x?.[k] == null ? "" : typeof x[k] === "object" ? JSON.stringify(x[k]) : String(x[k])))]; }
function xmlToObject(el: Element): any { const children = [...el.children]; if (!children.length) return el.textContent ?? ""; const out: Record<string, any> = {}; for (const child of children) { const value = xmlToObject(child); if (out[child.tagName] === undefined) out[child.tagName] = value; else out[child.tagName] = Array.isArray(out[child.tagName]) ? [...out[child.tagName], value] : [out[child.tagName], value]; } return out; }
function objectToXml(value: any, tag = "root"): string { const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); if (Array.isArray(value)) return value.map(v => objectToXml(v, tag)).join(""); if (value && typeof value === "object") return `<${tag}>${Object.entries(value).map(([k,v]) => objectToXml(v, k.replace(/[^A-Za-z0-9_.-]/g, "_"))).join("")}</${tag}>`; return `<${tag}>${esc(String(value ?? ""))}</${tag}>`; }
function simpleYamlParse(text: string): any { const root: any = {}; for (const raw of text.split(/\r?\n/)) { const line = raw.replace(/\s+#.*$/, "").trim(); if (!line || line.startsWith("#") || !line.includes(":")) continue; const [k, ...rest] = line.split(":"); const v = rest.join(":").trim(); root[k.trim()] = v === "true" ? true : v === "false" ? false : v === "null" ? null : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v.replace(/^['"]|['"]$/g, ""); } return root; }
function jsonToYaml(value: any, indent = ""): string { if (Array.isArray(value)) return value.map(v => `${indent}- ${typeof v === "object" ? "\n" + jsonToYaml(v, indent + "  ") : String(v)}`).join("\n"); if (value && typeof value === "object") return Object.entries(value).map(([k,v]) => `${indent}${k}: ${v && typeof v === "object" ? "\n" + jsonToYaml(v, indent + "  ") : typeof v === "string" ? JSON.stringify(v) : String(v)}`).join("\n"); return String(value); }
function markdownToHtml(text: string) { const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); return text.split(/\r?\n/).map(line => { if (!line.trim()) return ""; if (/^### /.test(line)) return `<h3>${esc(line.slice(4))}</h3>`; if (/^## /.test(line)) return `<h2>${esc(line.slice(3))}</h2>`; if (/^# /.test(line)) return `<h1>${esc(line.slice(2))}</h1>`; if (/^- /.test(line)) return `<li>${esc(line.slice(2))}</li>`; return `<p>${esc(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`; }).join("\n"); }
function htmlToMarkdown(text: string) { return text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n").replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n").replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n").replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**").replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n").replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n").replace(/<br\s*\/?>(?:)/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim(); }

export function FileConverterEngine({ op, toolId }: { op: string; toolId?: string }) {
  const [file, setFile] = useState<File | null>(null); const [output, setOutput] = useState<{blob: Blob; name: string} | null>(null); const [error, setError] = useState<string | null>(null); const [preview, setPreview] = useState(""); const [busy, setBusy] = useState(false);
  const image = IMAGE_OPS.has(op); const accept = ACCEPT[op] ?? "*/*";
  async function run() {
    const startedAt = Date.now();
    if (busy) return;
    if (!file) { setError("Choose a file first."); return; }
    if (op === "file-to-txt" && file.size > MAX_FILE_TO_TXT_BYTES) {
      setError("The selected file exceeds the 200 MB local text-extraction limit.");
      return;
    }
    setError(null); setOutput(null); setBusy(true);
    try {
      if (image) {
        if (op === "png-to-svg") { const data = await file.arrayBuffer(); const b64 = btoa(String.fromCharCode(...new Uint8Array(data))); const img = await createImageBitmap(file); const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}" viewBox="0 0 ${img.width} ${img.height}"><image href="data:image/png;base64,${b64}" width="100%" height="100%"/></svg>`; const blob = new Blob([svg], {type:"image/svg+xml"}); setOutput({blob,name:file.name.replace(/\.[^.]+$/, ".svg")}); setPreview(svg.slice(0,500)); if (toolId) recordToolExecutionResult(toolId, "success", Date.now() - startedAt, "file_conversion"); return; }
        const src = URL.createObjectURL(file); const img = new Image(); await new Promise((res, rej) => { img.onload=()=>res(null); img.onerror=rej; img.src=src; }); const canvas=document.createElement("canvas"); canvas.width=img.naturalWidth; canvas.height=img.naturalHeight; const ctx=canvas.getContext("2d"); if(!ctx) throw new Error("Your browser cannot create a canvas."); if(op.includes("jpg")) { ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height); } ctx.drawImage(img,0,0); const mime=op.endsWith("png")?"image/png":op.endsWith("webp")?"image/webp":"image/jpeg"; const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,mime,0.92)); URL.revokeObjectURL(src); if(!blob) throw new Error("Could not encode the converted image."); const ext=mime==="image/png"?"png":mime==="image/webp"?"webp":"jpg"; setOutput({blob,name:file.name.replace(/\.[^.]+$/, `.${ext}`)}); if (toolId) recordToolExecutionResult(toolId, "success", Date.now() - startedAt, "file_conversion"); return;
      }
      if (op === "file-to-txt") {
        const name = file.name.toLowerCase();
        let result = "";
        if (name.endsWith(".pdf")) {
          const extracted = await extractPdfTextLocally(file);
          result = extracted.text;
          if (!result.trim()) throw new Error("No selectable text was found. This may be a scanned PDF; OCR is not included in this conversion.");
        } else if (name.endsWith(".docx")) {
          result = docxToText(new Uint8Array(await file.arrayBuffer()));
        } else if (/\.(html?|xhtml)$/i.test(name)) {
          const markup = await file.text();
          const document = new DOMParser().parseFromString(markup, "text/html");
          document.querySelectorAll("script,style,noscript,template").forEach((node) => node.remove());
          result = (document.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim() + "\n";
        } else {
          const supported = /\.(txt|md|markdown|csv|tsv|json|xml|ya?ml|css|js|mjs|cjs|ts|tsx|jsx|sql|log|ini|toml|sh|properties|conf|cfg|srt|vtt|ics)$/i.test(name);
          if (!supported && !file.type.startsWith("text/")) throw new Error("Choose a supported text, Markdown, CSV, JSON, XML, YAML, HTML, DOCX or selectable-text PDF file.");
          result = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()).replace(/^\uFEFF/, "");
          if (!result.trim()) throw new Error("The selected file contains no readable text.");
          result += result.endsWith("\n") ? "" : "\n";
        }
        const blob = new Blob([result], { type: "text/plain;charset=utf-8" });
        if (blob.size > MAX_FILE_TO_TXT_OUTPUT_BYTES) throw new Error("The extracted text exceeds the 32 MB local output limit.");
        setOutput({ blob, name: file.name.replace(/\.[^.]+$/, "") + ".txt" });
        setPreview(result.slice(0, 4000));
        if (toolId) recordToolExecutionResult(toolId, "success", Date.now() - startedAt, "file_conversion");
        return;
      }
      const text=await file.text(); let result=""; let ext="txt";
      if(op==="csv-to-json") { result=csvToJson(text); ext="json"; } else if(op==="json-to-csv") { result=rowsToCsv(jsonToRows(text)); ext="csv"; } else if(op==="csv-to-tsv") { result=rowsToCsv(parseCsv(text),"\t"); ext="tsv"; } else if(op==="tsv-to-csv") { result=rowsToCsv(parseCsv(text,"\t")); ext="csv"; } else if(op==="xml-to-json") { const doc=new DOMParser().parseFromString(text,"application/xml"); if(doc.querySelector("parsererror")) throw new Error("Invalid XML."); result=JSON.stringify({[doc.documentElement.tagName]:xmlToObject(doc.documentElement)},null,2); ext="json"; } else if(op==="json-to-xml") { result='<?xml version="1.0" encoding="UTF-8"?>\n'+objectToXml(JSON.parse(text)); ext="xml"; } else if(op==="yaml-to-json") { result=JSON.stringify(simpleYamlParse(text),null,2); ext="json"; } else if(op==="json-to-yaml") { result=jsonToYaml(JSON.parse(text))+"\n"; ext="yaml"; } else if(op==="txt-to-csv") { result=rowsToCsv(text.split(/\r?\n/).filter(Boolean).map(x=>[x])); ext="csv"; } else if(op==="csv-to-txt") { result=parseCsv(text).map(r=>r.join(" ")).join("\n")+"\n"; ext="txt"; } else if(op==="markdown-to-html") { result='<!doctype html>\n<html><head><meta charset="utf-8"><title>Converted document</title></head><body>\n'+markdownToHtml(text)+'\n</body></html>\n'; ext="html"; } else if(op==="html-to-markdown") { result=htmlToMarkdown(text)+"\n"; ext="md"; } else throw new Error("Unsupported conversion.");
      const blob=new Blob([result],{type: ext==="json"?"application/json":"text/plain;charset=utf-8"}); setOutput({blob,name:file.name.replace(/\.[^.]+$/, `.${ext}`)}); setPreview(result.slice(0,4000));
      if (toolId) recordToolExecutionResult(toolId, "success", Date.now() - startedAt, "file_conversion");
    } catch(e) {
      setError(e instanceof Error?e.message:"Conversion failed.");
      if (toolId) recordToolExecutionResult(toolId, "failure", Date.now() - startedAt, "file_conversion", "FILE_CONVERSION_FAILED");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <FileDropzone accept={accept} disabled={busy} label="Drop a file or browse" onFiles={(next) => { setFile(next[0] ?? null); setOutput(null); setPreview(""); setError(null); }} />
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-3">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-fg">{file.name}</p><p className="text-xs text-muted">{file.size.toLocaleString()} bytes</p></div>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setFile(null); setOutput(null); setPreview(""); setError(null); }}>Remove</Button>
        </div>
      ) : null}
      <ErrorBanner message={error} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={run} disabled={!file || busy}>{busy ? "Converting…" : "Convert"}</Button>
        {output ? <Button variant="outline" onClick={() => download(output.blob, output.name)}><Download className="mr-2 size-4" />Download {output.name}</Button> : null}
      </div>
      {preview ? <pre className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-4 text-xs whitespace-pre-wrap">{preview}</pre> : null}
    </div>
  );
}
