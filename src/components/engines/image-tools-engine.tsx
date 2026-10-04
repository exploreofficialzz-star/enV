import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("Could not decode the image.")); img.src = url; });
    return img;
  } finally { URL.revokeObjectURL(url); }
}

export function ImageToolsEngine({ op }: { op: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [scale, setScale] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string[]>([]);

  async function run() {
    setError(null); setInfo([]);
    try {
      if (op === "image-comparison") {
        if (files.length !== 2) throw new Error("Choose exactly two images to compare.");
        const [a, b] = await Promise.all(files.map(loadImage));
        const width = Math.max(a.naturalWidth, b.naturalWidth), height = Math.max(a.naturalHeight, b.naturalHeight);
        const ca = document.createElement("canvas"), cb = document.createElement("canvas"), diff = document.createElement("canvas");
        for (const c of [ca, cb, diff]) { c.width = width; c.height = height; }
        ca.getContext("2d")!.drawImage(a, 0, 0); cb.getContext("2d")!.drawImage(b, 0, 0);
        const da = ca.getContext("2d")!.getImageData(0, 0, width, height), db = cb.getContext("2d")!.getImageData(0, 0, width, height), out = diff.getContext("2d")!.createImageData(width, height);
        let changed = 0;
        for (let i = 0; i < da.data.length; i += 4) {
          const different = da.data[i] !== db.data[i] || da.data[i+1] !== db.data[i+1] || da.data[i+2] !== db.data[i+2] || da.data[i+3] !== db.data[i+3];
          if (different) { changed++; out.data[i]=255; out.data[i+1]=0; out.data[i+2]=0; out.data[i+3]=255; }
          else { const g = Math.round((da.data[i]+da.data[i+1]+da.data[i+2])/3); out.data[i]=g; out.data[i+1]=g; out.data[i+2]=g; out.data[i+3]=255; }
        }
        diff.getContext("2d")!.putImageData(out, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => diff.toBlob(b => b ? resolve(b) : reject(new Error("Could not create diff image.")), "image/png"));
        downloadBlob(blob, "env-image-diff.png");
        setInfo([`Canvas: ${width} × ${height}`, `Different pixels: ${changed.toLocaleString()}`, `Difference rate: ${(changed / (width * height) * 100).toFixed(2)}%`]);
        return;
      }
      if (files.length !== 1) throw new Error("Choose exactly one image.");
      const img = await loadImage(files[0]);
      const factor = Number(scale); if (!Number.isFinite(factor) || factor <= 0 || factor > 4) throw new Error("Scale must be between 0.1 and 4.");
      if (op === "image-screenshot") {
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.naturalWidth * factor)); canvas.height = Math.max(1, Math.round(img.naturalHeight * factor));
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not create screenshot.")), "image/png"));
        downloadBlob(blob, "env-image-screenshot.png"); setInfo([`Output: ${canvas.width} × ${canvas.height}`, "PNG screenshot generated locally."]); return;
      }
      const canvas = document.createElement("canvas"); canvas.width = Math.round(img.naturalWidth * factor); canvas.height = Math.round(img.naturalHeight * factor);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>enV Image Print Layout</title><style>@page{margin:10mm}body{margin:0;display:flex;justify-content:center;align-items:flex-start}img{max-width:100%;height:auto;display:block}</style></head><body><img src="${dataUrl}" alt="Printable image"></body></html>`;
      downloadBlob(new Blob([html], { type: "text/html" }), "env-image-print-layout.html"); setInfo([`Image: ${canvas.width} × ${canvas.height}`, "Printable HTML generated locally."]); return;
    } catch (e) { setError(e instanceof Error ? e.message : "Image operation failed."); }
  }

  const multiple = op === "image-comparison";
  return <div className="space-y-5"><div className="rounded-xl border border-border bg-surface-2/50 p-4"><div className="font-medium">{op === "image-comparison" ? "Image Comparison" : op === "image-screenshot" ? "Image Screenshot" : "Image Print Layout"}</div><p className="mt-1 text-sm text-subtle">Browser-local image processing. Files stay on your device.</p><input className="mt-4 block w-full text-sm" type="file" accept="image/*" multiple={multiple} onChange={e=>{setFiles(Array.from(e.target.files??[]));setError(null);setInfo([]);}} /></div>{op !== "image-comparison" && <label className="block text-sm">Scale <input className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3" type="number" min="0.1" max="4" step="0.1" value={scale} onChange={e=>setScale(e.target.value)} /></label>}<ErrorBanner message={error}/><Button onClick={run}>Run tool</Button>{info.length ? <div className="rounded-lg bg-surface-2 p-4 text-sm">{info.map(x=><div key={x}>{x}</div>)}</div> : null}</div>;
}
