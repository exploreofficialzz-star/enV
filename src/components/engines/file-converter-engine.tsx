import { useMemo, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadBlob } from "@/lib/utils";

const IMAGE_OPS = new Set(["jpg-to-png", "png-to-jpg", "png-to-webp", "webp-to-png", "jpg-to-webp", "webp-to-jpg", "svg-to-png", "png-to-svg"]);
const ACCEPT: Record<string, string> = {
  "jpg-to-png": "image/jpeg,.jpg,.jpeg", "png-to-jpg": "image/png", "png-to-webp": "image/png", "webp-to-png": "image/webp",
  "jpg-to-webp": "image/jpeg,.jpg,.jpeg", "webp-to-jpg": "image/webp", "svg-to-png": "image/svg+xml,.svg", "png-to-svg": "image/png",
  "csv-to-json": ".csv,text/csv", "json-to-csv": ".json,application/json", "csv-to-tsv": ".csv,text/csv", "tsv-to-csv": ".tsv,text/tab-separated-values",
  "xml-to-json": ".xml,text/xml,application/xml", "json-to-xml": ".json,application/json", "yaml-to-json": ".yaml,.yml,text/yaml", "json-to-yaml": ".json,application/json",
  "txt-to-csv": ".txt,text/plain", "csv-to-txt": ".csv,text/csv", "markdown-to-html": ".md,.markdown,text/markdown", "html-to-markdown": ".html,.htm,text/html",
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The selected file could not be read."));
    reader.onerror = () => reject(reader.error ?? new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The selected PNG could not be decoded on this device."));
      image.src = url;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
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

export function FileConverterEngine({ op }: { op: string }) {
  const [file, setFile] = useState<File | null>(null); const [output, setOutput] = useState<{blob: Blob; name: string} | null>(null); const [error, setError] = useState<string | null>(null); const [preview, setPreview] = useState("");
  const image = IMAGE_OPS.has(op); const accept = ACCEPT[op] ?? "*/*";
  const label = useMemo(() => op.replaceAll("-", " ").replace(/\b\w/g, x => x.toUpperCase()), [op]);
  async function run() {
    if (!file) { setError("Choose a file first."); return; } setError(null); setOutput(null);
    try {
      if (image) {
        if (op === "png-to-svg") {
          const { width, height } = await readImageDimensions(file);
          const dataUrl = await readAsDataUrl(file);
          if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error("The PNG could not be encoded for SVG output.");
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${dataUrl}" width="100%" height="100%"/></svg>`;
          const blob = new Blob([svg], { type: "image/svg+xml" });
          setOutput({ blob, name: file.name.replace(/\.[^.]+$/, ".svg") });
          setPreview(svg.slice(0, 500));
          return;
        }
        const src = URL.createObjectURL(file);
        try {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("The selected image could not be decoded on this device."));
            img.src = src;
          });
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Your browser cannot create a canvas.");
          if (op.includes("jpg")) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
          ctx.drawImage(img, 0, 0);
          const mime = op.endsWith("png") ? "image/png" : op.endsWith("webp") ? "image/webp" : "image/jpeg";
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.92));
          if (!blob) throw new Error("Could not encode the converted image.");
          const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
          setOutput({ blob, name: file.name.replace(/\.[^.]+$/, `.${ext}`) });
          return;
        } finally {
          URL.revokeObjectURL(src);
        }
      }
      const text=await file.text(); let result=""; let ext="txt";
      if(op==="csv-to-json") { result=csvToJson(text); ext="json"; } else if(op==="json-to-csv") { result=rowsToCsv(jsonToRows(text)); ext="csv"; } else if(op==="csv-to-tsv") { result=rowsToCsv(parseCsv(text),"\t"); ext="tsv"; } else if(op==="tsv-to-csv") { result=rowsToCsv(parseCsv(text,"\t")); ext="csv"; } else if(op==="xml-to-json") { const doc=new DOMParser().parseFromString(text,"application/xml"); if(doc.querySelector("parsererror")) throw new Error("Invalid XML."); result=JSON.stringify({[doc.documentElement.tagName]:xmlToObject(doc.documentElement)},null,2); ext="json"; } else if(op==="json-to-xml") { result='<?xml version="1.0" encoding="UTF-8"?>\n'+objectToXml(JSON.parse(text)); ext="xml"; } else if(op==="yaml-to-json") { result=JSON.stringify(simpleYamlParse(text),null,2); ext="json"; } else if(op==="json-to-yaml") { result=jsonToYaml(JSON.parse(text))+"\n"; ext="yaml"; } else if(op==="txt-to-csv") { result=rowsToCsv(text.split(/\r?\n/).filter(Boolean).map(x=>[x])); ext="csv"; } else if(op==="csv-to-txt") { result=parseCsv(text).map(r=>r.join(" ")).join("\n")+"\n"; ext="txt"; } else if(op==="markdown-to-html") { result='<!doctype html>\n<html><head><meta charset="utf-8"><title>Converted document</title></head><body>\n'+markdownToHtml(text)+'\n</body></html>\n'; ext="html"; } else if(op==="html-to-markdown") { result=htmlToMarkdown(text)+"\n"; ext="md"; } else throw new Error("Unsupported conversion.");
      const blob=new Blob([result],{type: ext==="json"?"application/json":"text/plain;charset=utf-8"}); setOutput({blob,name:file.name.replace(/\.[^.]+$/, `.${ext}`)}); setPreview(result.slice(0,4000));
    } catch(e) { setError(e instanceof Error?e.message:"Conversion failed."); }
  }
  return <div className="space-y-5">
    <div className="rounded-xl border border-border bg-surface-2/50 p-4"><div className="flex items-center gap-2 font-medium"><FileUp className="size-4" /> {label}</div><p className="mt-1 text-sm text-subtle">Processed entirely in your browser. Your file is not uploaded to enV.</p><input className="mt-4 block w-full text-sm" type="file" accept={accept} onChange={e=>{setFile(e.target.files?.[0]??null);setOutput(null);setPreview("");setError(null);}} /></div>
    <ErrorBanner message={error} />
    <div className="flex gap-2"><Button onClick={run} disabled={!file}>Convert</Button>{output?<Button variant="outline" onClick={()=>downloadBlob(output.blob,output.name)}><Download className="mr-2 size-4"/>Download {output.name}</Button>:null}</div>
    {preview?<pre className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-4 text-xs whitespace-pre-wrap">{preview}</pre>:null}
  </div>;
}
