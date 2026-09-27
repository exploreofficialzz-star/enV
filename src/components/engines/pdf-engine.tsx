import { useMemo, useState } from "react";
import { PDFDocument, degrees, rgb, StandardFonts } from "pdf-lib";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/tools/copy-button";
import { ErrorBanner } from "@/components/tools/error-banner";

const PDF_OPS = new Set([
  "merge","split","rotate","images-to-pdf","extract","meta","compress","reorder",
  "number","watermark","metadata","compare","print-layout","protect","unlock","flatten",
]);

function download(bytes: Uint8Array, name: string, type = "application/pdf") {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function baseName(name: string) { return name.replace(/\.[^.]+$/, ""); }
async function loadPdf(file: File) { return PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false }); }
function parsePages(value: string, max: number) {
  const out = new Set<number>();
  for (const part of value.split(",").map(x => x.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/); if (!m) throw new Error(`Invalid page range: ${part}`);
    const a = Number(m[1]), b = Number(m[2] ?? m[1]); if (a < 1 || b < a || b > max) throw new Error(`Pages must be between 1 and ${max}.`);
    for (let i=a;i<=b;i++) out.add(i-1);
  }
  return [...out].sort((a,b)=>a-b);
}

export function PdfEngine({ op }: { op: string }) {
  const [files, setFiles] = useState<File[]>([]); const [pages, setPages] = useState("1");
  const [angle, setAngle] = useState("90"); const [text, setText] = useState("enV");
  const [password, setPassword] = useState(""); const [title, setTitle] = useState(""); const [author, setAuthor] = useState("");
  const [output, setOutput] = useState<Uint8Array | null>(null); const [outputName, setOutputName] = useState("env-pdf.pdf");
  const [info, setInfo] = useState<string[]>([]); const [error, setError] = useState<string | null>(null);
  const label = useMemo(() => op.replaceAll("-", " ").replace(/\b\w/g, x => x.toUpperCase()), [op]);

  async function run() {
    setError(null); setOutput(null); setInfo([]);
    try {
      if (!files.length && op !== "print-layout") throw new Error("Choose at least one PDF file.");
      if (!["images-to-pdf","print-layout"].includes(op) && files.some(f => f.type && f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))) throw new Error("This tool expects PDF files.");
      if (op === "merge") {
        const out = await PDFDocument.create();
        for (const file of files) { const src = await loadPdf(file); const copied = await out.copyPages(src, src.getPageIndices()); copied.forEach(p => out.addPage(p)); }
        const bytes = await out.save({ useObjectStreams: true }); setOutput(bytes); setOutputName("env-merged.pdf"); setInfo([`${files.length} files merged`, `${out.getPageCount()} pages`]); return;
      }
      if (op === "images-to-pdf") {
        const out = await PDFDocument.create();
        for (const file of files) {
          const bytes = await file.arrayBuffer(); const lower = file.name.toLowerCase();
          let image; if (lower.endsWith(".png") || file.type === "image/png") image = await out.embedPng(bytes); else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || file.type === "image/jpeg") image = await out.embedJpg(bytes); else throw new Error("Images to PDF currently supports PNG and JPEG files.");
          const scale = Math.min(595 / image.width, 842 / image.height, 1); const page = out.addPage([image.width*scale, image.height*scale]); page.drawImage(image,{x:0,y:0,width:image.width*scale,height:image.height*scale});
        }
        const bytes = await out.save({ useObjectStreams: true }); setOutput(bytes); setOutputName("env-images.pdf"); setInfo([`${files.length} images`, `${out.getPageCount()} pages`]); return;
      }
      const src = await loadPdf(files[0]);
      if (op === "meta") { setInfo([`Pages: ${src.getPageCount()}`, `Title: ${src.getTitle() || "—"}`, `Author: ${src.getAuthor() || "—"}`, `Subject: ${src.getSubject() || "—"}`, `Creator: ${src.getCreator() || "—"}`, `Producer: ${src.getProducer() || "—"}`]); return; }
      if (op === "compare") {
        if (files.length < 2) throw new Error("Choose two PDFs to compare."); const b = await loadPdf(files[1]);
        const aPages=src.getPageCount(), bPages=b.getPageCount(); setInfo([`First PDF: ${aPages} pages`, `Second PDF: ${bPages} pages`, `Page count difference: ${Math.abs(aPages-bPages)}`, aPages===bPages?"Page counts match.":"Page counts differ."]); return;
      }
      if (op === "compress") { const bytes=await src.save({useObjectStreams:true, addDefaultPage:false}); setOutput(bytes); setOutputName(`${baseName(files[0].name)}-compressed.pdf`); setInfo([`Original: ${(files[0].size/1024).toFixed(1)} KB`, `Output: ${(bytes.byteLength/1024).toFixed(1)} KB`, `Note: structural optimization is lossless; image-heavy PDFs may not shrink much.`]); return; }
      if (op === "split" || op === "extract" || op === "reorder") {
        const selected = parsePages(pages, src.getPageCount()); const order = op === "reorder" ? selected : selected;
        if (!order.length) throw new Error("Choose at least one page."); const out=await PDFDocument.create(); const copied=await out.copyPages(src, order); copied.forEach(p=>out.addPage(p)); const bytes=await out.save({useObjectStreams:true}); setOutput(bytes); setOutputName(`${baseName(files[0].name)}-${op}.pdf`); setInfo([`${order.length} pages exported`]); return;
      }
      if (op === "rotate") {
        const out=await PDFDocument.create(); const copied=await out.copyPages(src, src.getPageIndices()); copied.forEach((p,i)=>{ const original=src.getPages()[i]; p.setRotation(degrees(original.getRotation().angle + Number(angle))); out.addPage(p); }); const bytes=await out.save({useObjectStreams:true}); setOutput(bytes); setOutputName(`${baseName(files[0].name)}-rotated.pdf`); return;
      }
      if (op === "number" || op === "watermark") {
        const out=await PDFDocument.load(await files[0].arrayBuffer()); const font=await out.embedFont(StandardFonts.Helvetica); out.getPages().forEach((p,i)=>{const {width,height}=p.getSize(); if(op==="number") p.drawText(String(i+1),{x:width-40,y:18,size:9,font,color:rgb(.35,.35,.35)}); else p.drawText(text,{x:width/2-20,y:height/2,size:30,font,color:rgb(.6,.6,.6),opacity:.3,rotate:degrees(-35)});}); const bytes=await out.save({useObjectStreams:true}); setOutput(bytes); setOutputName(`${baseName(files[0].name)}-${op}.pdf`); return;
      }
      if (op === "metadata") { src.setTitle(title); src.setAuthor(author); const bytes=await src.save({useObjectStreams:true}); setOutput(bytes); setOutputName(`${baseName(files[0].name)}-metadata.pdf`); return; }
      if (op === "protect") { if(!password) throw new Error("Enter a password."); const bytes=await src.save({useObjectStreams:true}); setOutput(bytes); setOutputName(`${baseName(files[0].name)}-protected.pdf`); setInfo(["PDF bytes were rewritten, but true AES password encryption requires a dedicated encryption backend."]); return; }
      if (op === "unlock") { const bytes=await src.save({useObjectStreams:true}); setOutput(bytes); setOutputName(`${baseName(files[0].name)}-unlocked.pdf`); setInfo(["If the PDF is password-encrypted, the browser cannot bypass unknown passwords."]); return; }
      if (op === "flatten") { const bytes=await src.save({useObjectStreams:true}); setOutput(bytes); setOutputName(`${baseName(files[0].name)}-flattened.pdf`); setInfo(["PDF was rewritten losslessly. Interactive form flattening is not performed by this browser-only version."]); return; }
      if (op === "print-layout") { const out=await PDFDocument.create(); const p=out.addPage([595,842]); const font=await out.embedFont(StandardFonts.Helvetica); p.drawText("enV Print Layout",{x:40,y:790,size:18,font}); p.drawText("Use this page as a clean A4 print template.",{x:40,y:760,size:11,font}); const bytes=await out.save(); setOutput(bytes); setOutputName("env-print-layout.pdf"); return; }
      throw new Error("This PDF operation is not available yet.");
    } catch(e) { setError(e instanceof Error ? e.message : "PDF operation failed."); }
  }

  const accept = op === "images-to-pdf" ? "image/png,image/jpeg,.png,.jpg,.jpeg" : "application/pdf,.pdf";
  return <div className="space-y-5">
    <div className="rounded-xl border border-border bg-surface-2/50 p-4">
      <div className="font-medium">{label}</div><p className="mt-1 text-sm text-subtle">Browser-local PDF processing. Files are not uploaded to enV.</p>
      <input className="mt-4 block w-full text-sm" type="file" multiple={op === "merge" || op === "images-to-pdf"} accept={accept} onChange={e=>{setFiles(Array.from(e.target.files??[]));setOutput(null);setError(null);setInfo([]);}} />
    </div>
    {(["split","extract","reorder"].includes(op)) && <label className="block text-sm">Pages <input className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3" value={pages} onChange={e=>setPages(e.target.value)} placeholder="1,3-5" /></label>}
    {op === "rotate" && <label className="block text-sm">Rotation <select className="mt-1 h-10 rounded-md border border-border bg-surface px-3" value={angle} onChange={e=>setAngle(e.target.value)}><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>}
    {op === "watermark" && <label className="block text-sm">Watermark text <input className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3" value={text} onChange={e=>setText(e.target.value)} /></label>}
    {op === "metadata" && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Title<input className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3" value={title} onChange={e=>setTitle(e.target.value)} /></label><label className="text-sm">Author<input className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3" value={author} onChange={e=>setAuthor(e.target.value)} /></label></div>}
    {op === "protect" && <label className="block text-sm">Password<input type="password" className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3" value={password} onChange={e=>setPassword(e.target.value)} /></label>}
    <ErrorBanner message={error} />
    <div className="flex flex-wrap gap-2"><Button onClick={run}>Run {label}</Button>{output && <Button variant="outline" onClick={()=>download(output,outputName)}>{outputName}</Button>}</div>
    {info.length>0 && <div className="rounded-lg bg-surface-2 p-4 text-sm">{info.map(x=><div key={x}>{x}</div>)}</div>}
    {output && <div className="flex gap-2 text-xs text-muted"><CopyButton text={outputName} /> <span className="self-center">Output ready for download.</span></div>}
  </div>;
}

// The route uses this helper to choose the PDF engine before rendering it.
// eslint-disable-next-line react-refresh/only-export-components
export function isPdfOp(op:string){return PDF_OPS.has(op)}
