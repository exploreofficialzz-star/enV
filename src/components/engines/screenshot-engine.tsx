import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { frameSpec, parseScreenshotToolId, validateImageFile, type ScreenshotFamily, type ScreenshotWorkflow } from "@/components/engines/screenshot-engine-utils";
import { downloadBlob } from "@/lib/utils";

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The image could not be decoded.")); };
    img.src = url;
  });
}

function familyTitle(family: ScreenshotFamily) {
  return family.split("-").map(x => x[0].toUpperCase() + x.slice(1)).join(" ");
}

function drawFrame(ctx: CanvasRenderingContext2D, img: HTMLImageElement, family: ScreenshotFamily, label: boolean) {
  const s = frameSpec(family); const pad = s.bezel; const top = family === "chrome" || family === "safari" || family === "firefox" || family === "edge" || family === "google-search" ? 48 : pad;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#e8eaed"; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#171717"; ctx.beginPath(); ctx.roundRect(0, 0, s.width, s.height, s.radius); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.roundRect(pad, top, s.width - pad * 2, s.height - top - pad, Math.max(8, s.radius - pad)); ctx.clip();
  const scale = Math.min((s.width - pad * 2) / img.width, (s.height - top - pad) / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, (s.width - w) / 2, top + (s.height - top - pad - h) / 2, w, h); ctx.restore();
  if (top > pad) { ctx.fillStyle = "#252525"; ctx.fillRect(0, 0, s.width, top); for (let i=0;i<3;i++){ctx.fillStyle="#aaa";ctx.beginPath();ctx.arc(18+i*16,24,5,0,Math.PI*2);ctx.fill();} }
  if (label) { ctx.fillStyle = "#ffffff"; ctx.font = "600 16px system-ui"; ctx.fillText(`${familyTitle(family)} • Demo`, pad, s.height - 6); }
}

function drawBeautified(ctx: CanvasRenderingContext2D, img: HTMLImageElement, family: ScreenshotFamily) {
  const s = frameSpec(family); const pad = 56; ctx.canvas.width = s.width + pad * 2; ctx.canvas.height = s.height + pad * 2;
  ctx.fillStyle = "#f3f4f6"; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
  ctx.fillStyle = "rgba(0,0,0,.16)"; ctx.beginPath(); ctx.roundRect(pad+8,pad+12,s.width,s.height,s.radius); ctx.fill();
  ctx.save(); ctx.translate(pad,pad); drawFrame(ctx,img,family,false); ctx.restore();
}

export function ScreenshotEngine({ toolId }: { toolId: string }) {
  const parsed = parseScreenshotToolId(toolId); const { family, workflow } = parsed;
  const canvasRef = useRef<HTMLCanvasElement>(null); const [images, setImages] = useState<HTMLImageElement[]>([]);
  const [error, setError] = useState(""); const [status, setStatus] = useState("");
  const [annotation, setAnnotation] = useState("Highlight"); const [color, setColor] = useState("#ff3b30"); const [x, setX] = useState(20); const [y, setY] = useState(20); const [size, setSize] = useState(160);
  const spec = frameSpec(family);

  useEffect(() => { setImages([]); setError(""); setStatus(""); }, [toolId]);

  function onFiles(list: FileList | null) {
    setError(""); setStatus("");
    const files = Array.from(list ?? []); const max = workflow === "collage" ? 4 : 1;
    if (!files.length) return; if (files.length > max) { setError(`Choose at most ${max} image${max === 1 ? "" : "s"}.`); return; }
    Promise.all(files.map(async f => { validateImageFile(f); return readImage(f); })).then(setImages).catch(e => setError(e instanceof Error ? e.message : "Unable to load image."));
  }

  function render() {
    setError(""); setStatus(""); if (!images.length) { setError("Choose an image first."); return; }
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) { setError("Canvas rendering is unavailable in this browser."); return; }
    const img = images[0];
    if (workflow === "collage") {
      const gap = 24, count = images.length; canvas.width = count * spec.width + (count + 1) * gap; canvas.height = spec.height + gap * 2; ctx.fillStyle="#f3f4f6";ctx.fillRect(0,0,canvas.width,canvas.height);
      images.forEach((im,i)=>{ctx.save();ctx.translate(gap+i*(spec.width+gap),gap);drawFrame(ctx,im,family,false);ctx.restore();});
    } else if (workflow === "beautifier") {
      canvas.width = spec.width + 112; canvas.height = spec.height + 112; drawBeautified(ctx,img,family);
    } else {
      canvas.width = spec.width; canvas.height = spec.height; drawFrame(ctx,img,family,workflow !== "frame");
      if (workflow === "annotation") { ctx.strokeStyle=color;ctx.lineWidth=6;ctx.strokeRect(x,y,size,size);ctx.fillStyle=color;ctx.font="700 24px system-ui";ctx.fillText(annotation,x,y-10<24?24:y-10); }
      if (workflow === "redaction") { ctx.fillStyle="#000";ctx.fillRect(x,y,size,Math.max(48,size/2)); }
    }
    setStatus("Rendered successfully. The output below is a real PNG generated in your browser.");
  }

  async function save() { const c=canvasRef.current; if(!c){setError("Render an output first.");return;} const blob=await new Promise<Blob|null>(r=>c.toBlob(r,"image/png")); if(blob) downloadBlob(blob,`env-${toolId}.png`); }
  async function copy() { const c=canvasRef.current; if(!c){setError("Render an output first.");return;} try { const blob=await new Promise<Blob|null>(r=>c.toBlob(r,"image/png")); if(!blob || !navigator.clipboard || !("ClipboardItem" in window)) throw new Error("Image clipboard is not supported here; use Download instead."); await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]); setStatus("PNG copied to the clipboard."); } catch(e) { setError(e instanceof Error?e.message:"Could not copy image."); } }
  function reset(){ setImages([]);setError("");setStatus("");setAnnotation("Highlight");setX(20);setY(20);setSize(160); const c=canvasRef.current; if(c){c.width=1;c.height=1;c.getContext("2d")?.clearRect(0,0,1,1);} }

  return <div className="space-y-5">
    <div className="rounded-md bg-warn/15 px-3 py-2 text-xs">Client-side screenshot tool. Images stay in the browser and are not uploaded to a server.</div>
    <label className="block text-sm font-medium">Screenshot{workflow === "collage" ? "s (up to 4)" : ""}<input type="file" accept="image/*" multiple={workflow === "collage"} className="mt-2 block w-full text-sm" onChange={e=>onFiles(e.target.files)} /></label>
    {(workflow === "annotation" || workflow === "redaction") && <div className="grid gap-3 sm:grid-cols-4"><label className="text-sm">X<input type="number" value={x} onChange={e=>setX(Number(e.target.value))} className="mt-1 w-full rounded-md border bg-bg px-2 py-1" /></label><label className="text-sm">Y<input type="number" value={y} onChange={e=>setY(Number(e.target.value))} className="mt-1 w-full rounded-md border bg-bg px-2 py-1" /></label><label className="text-sm">Size<input type="number" min={20} value={size} onChange={e=>setSize(Math.max(20,Number(e.target.value)))} className="mt-1 w-full rounded-md border bg-bg px-2 py-1" /></label>{workflow === "annotation" ? <><label className="text-sm">Label<input value={annotation} onChange={e=>setAnnotation(e.target.value)} className="mt-1 w-full rounded-md border bg-bg px-2 py-1" /></label><label className="text-sm">Color<input type="color" value={color} onChange={e=>setColor(e.target.value)} className="mt-1 h-9 w-full" /></label></> : null}</div>}
    <div className="flex flex-wrap gap-2"><Button type="button" onClick={render}>Render {familyTitle(family)} {workflow}</Button><Button type="button" variant="outline" onClick={copy}>Copy PNG</Button><Button type="button" variant="outline" onClick={save}>Download PNG</Button><Button type="button" variant="ghost" onClick={reset}>Reset</Button></div>
    <ErrorBanner message={error} />{status ? <p className="text-xs text-muted">{status}</p> : null}
    <div className="overflow-auto rounded-xl border bg-surface-2 p-4"><canvas ref={canvasRef} className="mx-auto max-h-[70vh] max-w-full" /></div>
  </div>;
}
