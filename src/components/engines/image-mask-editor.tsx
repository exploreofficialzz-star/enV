import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { ImageAsset } from "@/lib/image/types";

export type MaskShape = "rectangle" | "ellipse" | "brush";
export type MaskAction = "transparent" | "redact" | "background-blur";
export interface MaskRegion {
  shape: MaskShape;
  points: { x: number; y: number }[];
  width: number;
}

export function applyMaskRegions(base: ImageAsset, regions: MaskRegion[], action: MaskAction, redactionStyle: "black" | "white" | "blur" | "pixelate") {
  const canvas = document.createElement("canvas");
  canvas.width = base.metadata.width;
  canvas.height = base.metadata.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D rendering is unavailable.");
  ctx.drawImage(base.bitmap, 0, 0, canvas.width, canvas.height);

  if (action === "background-blur") {
    const blurred = document.createElement("canvas"); blurred.width = canvas.width; blurred.height = canvas.height;
    const bctx = blurred.getContext("2d"); if (!bctx) throw new Error("Canvas 2D rendering is unavailable.");
    bctx.filter = `blur(${Math.max(8, Math.min(36, Math.min(canvas.width, canvas.height) / 24))}px)`;
    bctx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(blurred, 0, 0);
    for (const region of regions) {
      if (!region.points.length) continue;
      ctx.save(); if (region.shape !== "brush") { ctx.beginPath(); addPath(ctx, region); ctx.clip(); }
      if (region.shape === "brush") {
        const protectedLayer = document.createElement("canvas"); protectedLayer.width = canvas.width; protectedLayer.height = canvas.height;
        const pl = protectedLayer.getContext("2d"); if (pl) { pl.drawImage(base.bitmap, 0, 0, canvas.width, canvas.height); pl.globalCompositeOperation = "destination-in"; pl.beginPath(); addPath(pl, region); pl.strokeStyle = "#fff"; pl.stroke(); ctx.drawImage(protectedLayer, 0, 0); }
      } else ctx.drawImage(base.bitmap, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    return canvas;
  }

  for (const region of regions) {
    if (!region.points.length) continue;
    if (action === "transparent") {
      ctx.save(); ctx.globalCompositeOperation = "destination-out"; ctx.beginPath(); addPath(ctx, region); if (region.shape === "brush") ctx.stroke(); else ctx.fill(); ctx.restore();
      continue;
    }
    if (redactionStyle === "black" || redactionStyle === "white") {
      ctx.save(); ctx.fillStyle = redactionStyle === "black" ? "#000" : "#fff"; ctx.beginPath(); addPath(ctx, region); if (region.shape === "brush") ctx.stroke(); else ctx.fill(); ctx.restore();
      continue;
    }
    const bounds = boundsOf(region);
    const temp = document.createElement("canvas"); temp.width = Math.max(1, Math.ceil(bounds.width)); temp.height = Math.max(1, Math.ceil(bounds.height));
    const t = temp.getContext("2d"); if (!t) continue;
    t.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, temp.width, temp.height);
    if (redactionStyle === "blur") {
      const blurred = document.createElement("canvas"); blurred.width = temp.width; blurred.height = temp.height;
      const bctx = blurred.getContext("2d"); if (!bctx) continue;
      bctx.filter = `blur(${Math.max(8, Math.min(36, Math.min(temp.width, temp.height) / 10))}px)`; bctx.drawImage(temp, 0, 0);
      t.clearRect(0,0,temp.width,temp.height); t.drawImage(blurred,0,0);
    } else {
      const block = Math.max(5, Math.round(Math.min(temp.width, temp.height) / 12));
      const data = t.getImageData(0, 0, temp.width, temp.height);
      for (let y = 0; y < temp.height; y += block) for (let x = 0; x < temp.width; x += block) {
        const p = (y * temp.width + x) * 4; t.fillStyle = `rgba(${data.data[p]},${data.data[p + 1]},${data.data[p + 2]},${data.data[p + 3] / 255})`; t.fillRect(x, y, Math.min(block, temp.width - x), Math.min(block, temp.height - y));
      }
    }
    const mask = document.createElement("canvas"); mask.width = temp.width; mask.height = temp.height;
    const m = mask.getContext("2d"); if (!m) continue; m.fillStyle = "#fff"; m.beginPath(); addPath(m, translateRegion(region, -bounds.x, -bounds.y)); if (region.shape === "brush") m.stroke(); else m.fill();
    t.globalCompositeOperation = "destination-in"; t.drawImage(mask, 0, 0); t.globalCompositeOperation = "source-over";
    ctx.drawImage(temp, bounds.x, bounds.y);
  }
  return canvas;
}

function addPath(ctx: CanvasRenderingContext2D, region: MaskRegion) {
  const points = region.points; if (!points.length) return;
  if (region.shape === "brush") { ctx.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y); ctx.lineWidth = region.width; ctx.lineCap = "round"; ctx.lineJoin = "round"; return; }
  const x0 = Math.min(points[0].x, points[points.length - 1].x), y0 = Math.min(points[0].y, points[points.length - 1].y);
  const width = Math.abs(points[points.length - 1].x - points[0].x), height = Math.abs(points[points.length - 1].y - points[0].y);
  if (region.shape === "ellipse") ctx.ellipse(x0 + width / 2, y0 + height / 2, Math.max(1, width / 2), Math.max(1, height / 2), 0, 0, Math.PI * 2);
  else ctx.rect(x0, y0, Math.max(1, width), Math.max(1, height));
}

function translateRegion(region: MaskRegion, dx: number, dy: number): MaskRegion {
  return { ...region, points: region.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

function definePath(ctx: CanvasRenderingContext2D, region: MaskRegion) {
  ctx.beginPath(); addPath(ctx, region);
}

function boundsOf(region: MaskRegion) {
  const xs = region.points.map((p) => p.x), ys = region.points.map((p) => p.y);
  const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys));
  const width = Math.max(1, Math.min(99999, Math.max(...xs) - x)), height = Math.max(1, Math.min(99999, Math.max(...ys) - y));
  return { x, y, width, height };
}

export function ImageMaskEditor({ asset, action, onRegionsChange }: { asset: ImageAsset; action: MaskAction; onRegionsChange?: (regions: MaskRegion[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shape, setShape] = useState<MaskShape>("rectangle");
  const [brushSize, setBrushSize] = useState(36);
  const [redactionStyle, setRedactionStyle] = useState<"black" | "white" | "blur" | "pixelate">("black");
  const [regions, setRegions] = useState<MaskRegion[]>([]);
  const [drawing, setDrawing] = useState(false);
  const current = useRef<MaskRegion | null>(null);

  useEffect(() => {
    onRegionsChange?.(regions);
  }, [regions, onRegionsChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = asset.metadata.width;
    canvas.height = asset.metadata.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(asset.bitmap, 0, 0, canvas.width, canvas.height);
    ctx.save();
    regions.forEach((region) => {
      ctx.globalAlpha = action === "transparent" ? 0.55 : 0.7;
      ctx.fillStyle = action === "transparent" ? "#2563eb" : "#111827";
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      definePath(ctx, region);
      if (region.shape === "brush") ctx.stroke(); else ctx.fill();
    });
    if (current.current) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = "#2563eb"; ctx.strokeStyle = "#fff"; definePath(ctx, current.current); if (current.current.shape === "brush") ctx.stroke(); else ctx.fill();
    }
    ctx.restore();
  }, [asset, action, regions]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width); const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  };

  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
    <div className="overflow-hidden rounded-xl border border-border bg-[#111] p-2">
      <canvas ref={canvasRef} className="mx-auto block h-auto max-h-[62vh] max-w-full touch-none rounded" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const p = point(event); current.current = { shape, points: [p], width: brushSize }; setDrawing(true); }} onPointerMove={(event) => { if (!drawing || !current.current) return; const p = point(event); if (current.current.shape === "brush") current.current.points.push(p); else current.current.points = [current.current.points[0], p]; const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d"); if (!ctx) return; ctx.clearRect(0,0,c.width,c.height); ctx.drawImage(asset.bitmap,0,0,c.width,c.height); ctx.save(); ctx.globalAlpha=.55;ctx.fillStyle=action==="transparent"?"#2563eb":"#111827";ctx.strokeStyle="#fff";ctx.setLineDash([10,6]);definePath(ctx,current.current);if(shape==="brush")ctx.stroke();else ctx.fill();ctx.restore(); }} onPointerUp={() => { if (!drawing || !current.current) return; setRegions((items) => [...items, current.current!]); current.current = null; setDrawing(false); }} />
    </div>
    <aside className="rounded-xl border border-border bg-surface-2/60 p-4 space-y-4">
      <div><p className="text-sm font-medium">Mask tool</p><p className="mt-1 text-xs text-muted">Paint regions directly on the source. The original file is preserved until export.</p></div>
      <label className="block space-y-1.5 text-sm"><span>Shape</span><Select value={shape} onChange={(e) => setShape(e.target.value as MaskShape)}><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="brush">Freehand brush</option></Select></label>
      {shape === "brush" ? <label className="block space-y-1.5 text-sm"><span>Brush size: {brushSize}px</span><input className="w-full" type="range" min="4" max="240" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} /></label> : null}
      {action === "redact" ? <label className="block space-y-1.5 text-sm"><span>Redaction style</span><Select value={redactionStyle} onChange={(e) => setRedactionStyle(e.target.value as typeof redactionStyle)}><option value="black">Black fill</option><option value="white">White fill</option><option value="blur">Blur</option><option value="pixelate">Pixelate</option></Select></label> : <div className="rounded-lg bg-surface p-3 text-xs text-muted">Selected regions will become transparent in the exported raster.</div>}
      <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setRegions([])}>Clear mask</Button><Button type="button" variant="outline" size="sm" onClick={() => setRegions((items) => items.slice(0, -1))} disabled={!regions.length}>Undo region</Button></div>
      <p className="text-xs text-muted">{regions.length} region{regions.length === 1 ? "" : "s"} selected.</p>
    </aside>
  </div>;
}
