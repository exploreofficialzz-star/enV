import type { ImageAsset } from "./types.ts";

function dimensions(asset: ImageAsset) { return asset.metadata; }

function fit(ctx: CanvasRenderingContext2D, asset: ImageAsset, x: number, y: number, w: number, h: number) {
  const { width, height } = dimensions(asset);
  const scale = Math.min(w / width, h / height);
  const dw = width * scale, dh = height * scale;
  ctx.drawImage(asset.bitmap, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function composeImages(assets: ImageAsset[], mode: "merge" | "strip" | "grid" | "contact-sheet", gap = 16) {
  if (assets.length < 2) throw new Error("At least two images are required.");
  const cellW = Math.max(...assets.map((a) => a.metadata.width));
  const cellH = Math.max(...assets.map((a) => a.metadata.height));
  const columns = mode === "strip" ? assets.length : mode === "merge" ? 1 : Math.ceil(Math.sqrt(assets.length));
  const rows = Math.ceil(assets.length / columns);
  const width = columns * cellW + Math.max(0, columns - 1) * gap;
  const height = rows * cellH + Math.max(0, rows - 1) * gap;
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas 2D rendering is unavailable.");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
  assets.forEach((asset, index) => {
    const x = (index % columns) * (cellW + gap);
    const y = Math.floor(index / columns) * (cellH + gap);
    fit(ctx, asset, x, y, cellW, cellH);
  });
  return canvas;
}

export function beforeAfterCanvas(before: ImageAsset, after: HTMLCanvasElement, split = 0.5) {
  const width = Math.max(before.metadata.width, after.width);
  const height = Math.max(before.metadata.height, after.height);
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas 2D rendering is unavailable.");
  ctx.drawImage(before.bitmap, 0, 0, width, height);
  const x = Math.round(width * Math.max(0, Math.min(1, split)));
  ctx.save(); ctx.beginPath(); ctx.rect(x, 0, width - x, height); ctx.clip(); ctx.drawImage(after, 0, 0, width, height); ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(x - 1, 0, 2, height);
  return canvas;
}
