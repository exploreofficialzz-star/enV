/**
 * Canvas renderer (DOM). Draws a computed SceneLayout. Everything here is a static,
 * deterministic composition: user text is drawn with fillText only (never parsed as
 * HTML/SVG) and browser-frame address text is display-only; nothing is ever fetched.
 */
import type { Rect, Size } from "./types.ts";
import { assertSafeDimensions } from "../image/limits.ts";
import type { AnnotationObject } from "./annotations.ts";
import { arrowHeadPoints, isDestructive } from "./annotations.ts";
import { linearGradientLine, normalizeStops, parseColor, safeColor, withOpacity, type BackgroundSpec } from "./backgrounds.ts";
import { FONT_STACK, type ItemLayout, type Measure, type Scene, type SceneItem, type SceneLayout } from "./scene.ts";
import { shadowColor, type ShadowSettings } from "./shadow.ts";
import { boxBlur, clipRect, pixelate, solidFill } from "./pixel-ops.ts";
import { ellipsize, sanitizeDisplayText, wrapText } from "./text-layout.ts";
import type { BrowserChrome, FramePreset } from "./presets.ts";
import { distance, angleDeg } from "./geometry.ts";

type Ctx = CanvasRenderingContext2D;
export type Drawable = CanvasImageSource;
export interface RenderResources {
  contents: Record<string, { canvas: Drawable; scale: number }>;
  bgImage?: { source: Drawable; width: number; height: number } | null;
}
export interface RenderOptions { scale: number; flatten?: string | null; showGuides?: boolean }

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Browsers differ in how they treat canvases that are too large: some throw, some (iOS Safari) hand back a
 * context whose drawing silently does nothing. Writing and reading back the last pixel proves the canvas is
 * really usable, so an oversized export fails with a clear message instead of producing a blank image.
 */
export function assertCanvasUsable(ctx: Ctx, width: number, height: number, label: string) {
  let ok = false;
  try { ctx.save(); ctx.globalCompositeOperation = "copy"; ctx.fillStyle = "#010203"; ctx.fillRect(width - 1, height - 1, 1, 1); ok = ctx.getImageData(width - 1, height - 1, 1, 1).data[3] === 255; ctx.clearRect(width - 1, height - 1, 1, 1); ctx.restore(); } catch { ok = false; }
  if (!ok) throw new Error(`${label} is ${width} × ${height} px (${((width * height) / 1e6).toFixed(1)} MP), which this browser cannot render. Choose a smaller export size or crop the screenshot.`);
}

export function makeMeasure(): Measure {
  let ctx: Ctx | null = null;
  return (font, text) => {
    if (!ctx) ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return text.length * 8;
    ctx.font = font; return ctx.measureText(text).width;
  };
}

export function roundedRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r], cap = Math.min(w, h) / 2, c = (v: number) => Math.max(0, Math.min(v, cap));
  ctx.moveTo(x + c(tl), y); ctx.lineTo(x + w - c(tr), y); ctx.arcTo(x + w, y, x + w, y + c(tr), c(tr));
  ctx.lineTo(x + w, y + h - c(br)); ctx.arcTo(x + w, y + h, x + w - c(br), y + h, c(br));
  ctx.lineTo(x + c(bl), y + h); ctx.arcTo(x, y + h, x, y + h - c(bl), c(bl));
  ctx.lineTo(x, y + c(tl)); ctx.arcTo(x, y, x + c(tl), y, c(tl)); ctx.closePath();
}
const fillRounded = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number | [number, number, number, number], fill: string) => { ctx.beginPath(); roundedRectPath(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); };

/* ------------------------------------------------------------------ background */
export function drawBackground(ctx: Ctx, bg: BackgroundSpec, w: number, h: number, res: RenderResources) {
  switch (bg.kind) {
    case "transparent": return;
    case "solid": ctx.fillStyle = safeColor(bg.color, "#ffffff"); ctx.fillRect(0, 0, w, h); return;
    case "linear": { const l = linearGradientLine(bg.angle, w, h), g = ctx.createLinearGradient(l.x0, l.y0, l.x1, l.y1); for (const s of normalizeStops(bg.stops)) g.addColorStop(s.offset, safeColor(s.color, "#ffffff")); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); return; }
    case "radial": { const cx = bg.cx * w, cy = bg.cy * h, g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, bg.radius * Math.max(w, h))); for (const s of normalizeStops(bg.stops)) g.addColorStop(s.offset, safeColor(s.color, "#ffffff")); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); return; }
    case "image": {
      ctx.fillStyle = safeColor(bg.color, "#ffffff"); ctx.fillRect(0, 0, w, h);
      const img = res.bgImage; if (!img) return;
      const sr = img.width / img.height, br = w / h, cover = bg.fit === "cover";
      const dw = (sr > br) === cover ? h * sr : w, dh = (sr > br) === cover ? h : w / sr;
      ctx.imageSmoothingQuality = "high"; ctx.drawImage(img.source, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
  }
}

/* ------------------------------------------------------------------ annotations */
function applyLine(ctx: Ctx, o: AnnotationObject) {
  ctx.lineWidth = Math.max(0.5, o.strokeWidth); ctx.strokeStyle = safeColor(o.stroke, "#ff3b30"); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const w = ctx.lineWidth; ctx.setLineDash(o.lineStyle === "dashed" ? [w * 3, w * 2] : o.lineStyle === "dotted" ? [w * 0.1, w * 2] : []);
}
const hasFill = (c: string) => c !== "transparent" && (parseColor(c)?.[3] ?? 0) > 0;

function drawTextBox(ctx: Ctx, o: AnnotationObject, box: Rect) {
  const font = `${o.fontWeight} ${o.fontSize}px ${FONT_STACK}`; ctx.font = font; ctx.fillStyle = safeColor(o.textColor, "#111111"); ctx.textBaseline = "top"; ctx.textAlign = o.align;
  const lines = wrapText(o.text, Math.max(8, box.width - o.padding * 2), (t) => ctx.measureText(t).width);
  const x = o.align === "left" ? box.x + o.padding : o.align === "right" ? box.x + box.width - o.padding : box.x + box.width / 2;
  const lh = o.fontSize * o.lineHeight, total = lines.length * lh, y0 = o.kind === "step" ? box.y + (box.height - total) / 2 + (lh - o.fontSize) / 2 : box.y + o.padding;
  lines.forEach((ln, i) => ctx.fillText(ln, x, y0 + i * lh));
}

/** Draw one non-destructive annotation in source-pixel units (the caller has applied the scale). */
export function drawAnnotation(ctx: Ctx, o: AnnotationObject) {
  ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, o.opacity));
  const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
  if (o.rotation && !["arrow", "line", "measure", "pen", "highlighter"].includes(o.kind)) { ctx.translate(cx, cy); ctx.rotate(rad(o.rotation)); ctx.translate(-cx, -cy); }
  switch (o.kind) {
    case "arrow": case "line": {
      applyLine(ctx, o); const a = { x: o.x, y: o.y }, b = { x: o.x2, y: o.y2 }, size = Math.max(14, o.strokeWidth * 4);
      let end = b; if (o.kind === "arrow" && o.arrowHead === "triangle") { const d = distance(a, b) || 1, t = Math.min(size * 0.7, d) / d; end = { x: b.x + (a.x - b.x) * t, y: b.y + (a.y - b.y) * t }; }
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      if (o.kind === "arrow" && o.arrowHead !== "none") {
        const [tip, l, r] = arrowHeadPoints(a, b, size); ctx.setLineDash([]);
        if (o.arrowHead === "triangle") { ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.closePath(); ctx.fillStyle = safeColor(o.stroke, "#ff3b30"); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(r.x, r.y); ctx.stroke(); }
      }
      break;
    }
    case "measure": {
      applyLine(ctx, o); const a = { x: o.x, y: o.y }, b = { x: o.x2, y: o.y2 }, ang = Math.atan2(b.y - a.y, b.x - a.x), t = 8;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      for (const p of [a, b]) { ctx.beginPath(); ctx.moveTo(p.x - Math.sin(ang) * t, p.y + Math.cos(ang) * t); ctx.lineTo(p.x + Math.sin(ang) * t, p.y - Math.cos(ang) * t); ctx.stroke(); }
      const d = Math.round(distance(a, b)), an = Math.round(angleDeg(a, b)), label = an % 90 === 0 ? `${d} px` : `${d} px · ${an}°`;
      ctx.font = `600 ${o.fontSize > 20 ? 18 : o.fontSize}px ${FONT_STACK}`; const tw = ctx.measureText(label).width, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      fillRounded(ctx, mx - tw / 2 - 6, my - 26, tw + 12, 22, 6, safeColor(o.stroke, "#0a84ff")); ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, mx, my - 15);
      break;
    }
    case "rect": {
      ctx.beginPath(); roundedRectPath(ctx, o.x, o.y, o.width, o.height, o.radius);
      if (hasFill(o.fill)) { ctx.fillStyle = safeColor(o.fill, "#ffffff"); ctx.fill(); } if (o.strokeWidth > 0) { applyLine(ctx, o); ctx.stroke(); }
      break;
    }
    case "ellipse": {
      ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.5, o.width / 2), Math.max(0.5, o.height / 2), 0, 0, Math.PI * 2);
      if (hasFill(o.fill)) { ctx.fillStyle = safeColor(o.fill, "#ffffff"); ctx.fill(); } if (o.strokeWidth > 0) { applyLine(ctx, o); ctx.stroke(); }
      break;
    }
    case "pen": case "highlighter": {
      const p = o.points; if (p.length < 2) break; applyLine(ctx, o); if (o.kind === "highlighter") { ctx.globalCompositeOperation = "multiply"; ctx.lineCap = "butt"; ctx.lineJoin = "round"; }
      ctx.beginPath(); ctx.moveTo(p[0], p[1]);
      if (p.length === 2) { ctx.lineTo(p[0] + 0.01, p[1]); }
      for (let i = 2; i + 1 < p.length; i += 2) { const mx = (p[i - 2] + p[i]) / 2, my = (p[i - 1] + p[i + 1]) / 2; ctx.quadraticCurveTo(p[i - 2], p[i - 1], mx, my); }
      if (p.length >= 4) ctx.lineTo(p[p.length - 2], p[p.length - 1]); ctx.stroke();
      break;
    }
    case "text": {
      const box = { x: o.x, y: o.y, width: o.width, height: o.height };
      if (hasFill(o.fill)) fillRounded(ctx, box.x, box.y, box.width, box.height, o.radius, safeColor(o.fill, "#ffffff"));
      if (o.strokeWidth > 0) { ctx.beginPath(); roundedRectPath(ctx, box.x, box.y, box.width, box.height, o.radius); applyLine(ctx, o); ctx.stroke(); }
      drawTextBox(ctx, o, box); break;
    }
    case "step": {
      ctx.beginPath(); ctx.ellipse(cx, cy, o.width / 2, o.height / 2, 0, 0, Math.PI * 2); ctx.fillStyle = safeColor(o.fill, "#ff3b30"); ctx.fill();
      if (o.strokeWidth > 0) { applyLine(ctx, o); ctx.stroke(); }
      ctx.font = `${o.fontWeight} ${o.fontSize}px ${FONT_STACK}`; ctx.fillStyle = safeColor(o.textColor, "#ffffff"); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(o.step), cx, cy + o.fontSize * 0.04); break;
    }
    case "callout": {
      const fill = safeColor(o.fill, "#ffffff"), edge = { x: o.x + o.width / 2, y: o.y + o.height / 2 };
      // tail: a triangle from the nearest box edge toward (x2, y2)
      const dx = o.x2 - edge.x, dy = o.y2 - edge.y, horizontal = Math.abs(dx) / Math.max(1, o.width) > Math.abs(dy) / Math.max(1, o.height);
      const base = horizontal ? { x: dx > 0 ? o.x + o.width : o.x, y: edge.y } : { x: edge.x, y: dy > 0 ? o.y + o.height : o.y }, half = Math.min(18, (horizontal ? o.height : o.width) / 3);
      ctx.beginPath(); if (horizontal) { ctx.moveTo(base.x, base.y - half); ctx.lineTo(o.x2, o.y2); ctx.lineTo(base.x, base.y + half); } else { ctx.moveTo(base.x - half, base.y); ctx.lineTo(o.x2, o.y2); ctx.lineTo(base.x + half, base.y); }
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (o.strokeWidth > 0) { applyLine(ctx, o); ctx.stroke(); }
      fillRounded(ctx, o.x, o.y, o.width, o.height, o.radius, fill);
      if (o.strokeWidth > 0) { ctx.beginPath(); roundedRectPath(ctx, o.x, o.y, o.width, o.height, o.radius); applyLine(ctx, o); ctx.stroke(); }
      drawTextBox(ctx, o, { x: o.x, y: o.y, width: o.width, height: o.height }); break;
    }
    default: break;
  }
  ctx.restore();
}

function applyRasterObject(ctx: Ctx, canvas: HTMLCanvasElement, o: AnnotationObject, k: number) {
  const r = clipRect({ x: o.x * k, y: o.y * k, width: o.width * k, height: o.height * k }, canvas);
  if (!r.width || !r.height) return;
  const img = ctx.getImageData(r.x, r.y, r.width, r.height), local = { width: r.width, height: r.height, data: img.data }, full = { x: 0, y: 0, width: r.width, height: r.height };
  if (o.kind === "redact") { const c = parseColor(o.fill) ?? [0, 0, 0, 255]; solidFill(local, full, [c[0], c[1], c[2], 255]); }
  else if (o.kind === "blur") boxBlur(local, full, Math.max(1, o.strength * k));
  else if (o.kind === "pixelate") pixelate(local, full, Math.max(2, o.strength * k));
  ctx.putImageData(img, r.x, r.y);
}

/**
 * Compose the full source image plus annotation objects at `k` canvas px per source px.
 * The original bitmap is never modified. Objects are applied in z-order, so a blur placed
 * above an arrow really hides it. Destructive kinds are flattened by pixel-ops here, which
 * is exactly what the exporter uses: exported rasters do not retain covered content.
 */
export function renderContent(source: Drawable, size: Size, objects: AnnotationObject[], k: number): HTMLCanvasElement {
  const w = Math.max(1, Math.ceil(size.width * k)), h = Math.max(1, Math.ceil(size.height * k));
  assertSafeDimensions(w, h, "Screenshot");
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const list = objects.filter((o) => o.visible), destructive = list.some(isDestructive);
  const ctx = canvas.getContext("2d", destructive ? { willReadFrequently: true } : undefined) as Ctx | null; if (!ctx) throw new Error("Canvas 2D rendering is unavailable in this browser.");
  assertCanvasUsable(ctx, w, h, "This screenshot");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(source, 0, 0, w, h);
  const spot = list.filter((o) => o.kind === "spotlight"); let spotDone = false;
  for (const o of list) {
    if (isDestructive(o)) { applyRasterObject(ctx, canvas, o, k); continue; }
    ctx.save(); ctx.scale(k, k);
    if (o.kind === "spotlight") {
      if (!spotDone) { spotDone = true; ctx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(0.95, spot[0].strength))})`; ctx.beginPath(); ctx.rect(0, 0, size.width, size.height); for (const s of spot) roundedRectPath(ctx, s.x, s.y, s.width, s.height, s.radius); ctx.fill("evenodd"); }
    } else drawAnnotation(ctx, o);
    ctx.restore();
  }
  return canvas;
}

/* ------------------------------------------------------------------ browser chrome */
function stroke(ctx: Ctx, color: string, w = 1.6) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.setLineDash([]); }
const ICON = {
  back(ctx: Ctx, x: number, y: number, c: string) { stroke(ctx, c); ctx.beginPath(); ctx.moveTo(x + 4, y - 7); ctx.lineTo(x - 3, y); ctx.lineTo(x + 4, y + 7); ctx.moveTo(x - 3, y); ctx.lineTo(x + 9, y); ctx.stroke(); },
  forward(ctx: Ctx, x: number, y: number, c: string) { stroke(ctx, c); ctx.beginPath(); ctx.moveTo(x - 4, y - 7); ctx.lineTo(x + 3, y); ctx.lineTo(x - 4, y + 7); ctx.moveTo(x + 3, y); ctx.lineTo(x - 9, y); ctx.stroke(); },
  reload(ctx: Ctx, x: number, y: number, c: string) { stroke(ctx, c); ctx.beginPath(); ctx.arc(x, y, 7, -0.6, Math.PI * 1.55); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 4, y - 9); ctx.lineTo(x + 8, y - 4); ctx.lineTo(x + 2, y - 3); ctx.stroke(); },
  lock(ctx: Ctx, x: number, y: number, c: string) { stroke(ctx, c, 1.4); ctx.beginPath(); roundedRectPath(ctx, x - 5, y - 1, 10, 8, 2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y - 1, 3.4, Math.PI, 0); ctx.stroke(); },
  dots(ctx: Ctx, x: number, y: number, c: string) { ctx.fillStyle = c; for (const dy of [-6, 0, 6]) { ctx.beginPath(); ctx.arc(x, y + dy, 1.7, 0, Math.PI * 2); ctx.fill(); } },
  menu(ctx: Ctx, x: number, y: number, c: string) { stroke(ctx, c); ctx.beginPath(); for (const dy of [-5, 0, 5]) { ctx.moveTo(x - 7, y + dy); ctx.lineTo(x + 7, y + dy); } ctx.stroke(); },
  plus(ctx: Ctx, x: number, y: number, c: string) { stroke(ctx, c); ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke(); },
  close(ctx: Ctx, x: number, y: number, c: string, s = 5) { stroke(ctx, c, 1.4); ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); },
  share(ctx: Ctx, x: number, y: number, c: string) { stroke(ctx, c); ctx.beginPath(); ctx.moveTo(x - 5, y - 1); ctx.lineTo(x - 5, y + 7); ctx.lineTo(x + 5, y + 7); ctx.lineTo(x + 5, y - 1); ctx.moveTo(x, y + 3); ctx.lineTo(x, y - 8); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x, y - 8); ctx.lineTo(x + 4, y - 4); ctx.stroke(); },
  tabs(ctx: Ctx, x: number, y: number, c: string) { stroke(ctx, c, 1.4); ctx.beginPath(); roundedRectPath(ctx, x - 6, y - 3, 10, 9, 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 3, y - 6); ctx.lineTo(x + 6, y - 6); ctx.lineTo(x + 6, y + 3); ctx.stroke(); },
  sidebar(ctx: Ctx, x: number, y: number, c: string) { stroke(ctx, c, 1.4); ctx.beginPath(); roundedRectPath(ctx, x - 8, y - 6, 16, 12, 3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 2, y - 6); ctx.lineTo(x - 2, y + 6); ctx.stroke(); },
};

function drawWindowControls(ctx: Ctx, kind: "mac" | "windows", x: number, y: number, W: number, c: BrowserChromeColors) {
  if (kind === "mac") { ["#ff5f57", "#febc2e", "#28c840"].forEach((col, i) => { ctx.beginPath(); ctx.arc(x + 6 + i * 20, y, 6, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }); return; }
  const xr = W - 46 * 3; stroke(ctx, c.icon, 1.2);
  ctx.beginPath(); ctx.moveTo(xr + 18, y); ctx.lineTo(xr + 28, y); ctx.stroke();
  ctx.beginPath(); ctx.rect(xr + 46 + 18, y - 5, 10, 10); ctx.stroke();
  ICON.close(ctx, xr + 92 + 23, y, c.icon, 5);
}
type BrowserChromeColors = BrowserChrome["colors"]["light"];

function drawBrowserChrome(ctx: Ctx, preset: FramePreset, item: SceneItem, width: number, chromeH: number, measure: (t: string) => number) {
  const ch = preset.chrome as BrowserChrome, o = item.browser, c = ch.colors[o.appearance];
  if (!o.showChrome || chromeH <= 0) return;
  const controls = o.controls === "none" ? null : o.controls, address = sanitizeDisplayText(o.address, 160).replace(/[\r\n]+/g, " ").trim(), title = sanitizeDisplayText(o.tabTitle, 80).replace(/[\r\n]+/g, " ").trim();
  ctx.font = `12.5px ${FONT_STACK}`; ctx.textBaseline = "middle";
  const drawAddress = (x: number, y: number, w: number, center: boolean) => {
    fillRounded(ctx, x, y, w, ch.addressHeight, ch.addressRadius, c.address);
    if (ch.style === "firefox") { ctx.beginPath(); roundedRectPath(ctx, x + 0.5, y + 0.5, w - 1, ch.addressHeight - 1, ch.addressRadius); stroke(ctx, c.border, 1); ctx.stroke(); }
    ctx.font = `13px ${FONT_STACK}`; const my = y + ch.addressHeight / 2, txt = address ? ellipsize(address, w - 60, measure) : "";
    if (center) { const tw = txt ? measure(txt) : 0, lx = x + w / 2 - tw / 2 - 12; ICON.lock(ctx, lx, my - 1, c.subtext); if (txt) { ctx.fillStyle = c.text; ctx.textAlign = "left"; ctx.fillText(txt, lx + 12, my); } }
    else { ICON.lock(ctx, x + 18, my - 1, c.subtext); if (txt) { ctx.fillStyle = c.text; ctx.textAlign = "left"; ctx.fillText(txt, x + 34, my); } }
  };
  const tabTitle = (x: number, y: number, w: number, hasClose: boolean) => { if (!title) return; ctx.font = `12px ${FONT_STACK}`; ctx.fillStyle = c.text; ctx.textAlign = "left"; ctx.fillText(ellipsize(title, w - (hasClose ? 46 : 28), measure), x + 14, y); };

  if (ch.style === "safari") {
    const tb = ch.toolbar; ctx.fillStyle = c.toolbar; ctx.fillRect(0, 0, width, tb); const my = tb / 2;
    if (controls) drawWindowControls(ctx, controls, 16, my, width, c);
    const nav = controls === "windows" ? 20 : 90; ICON.sidebar(ctx, nav + 12, my, c.icon); ICON.back(ctx, nav + 52, my, c.icon); ICON.forward(ctx, nav + 84, my, c.icon);
    const aw = Math.max(200, Math.min(width - 420, width * ch.addressWidthRatio)); drawAddress((width - aw) / 2, (tb - ch.addressHeight) / 2, aw, true);
    ICON.share(ctx, width - 108, my, c.icon); ICON.plus(ctx, width - 68, my, c.icon); ICON.tabs(ctx, width - 30, my, c.icon);
    if (controls === "windows") drawWindowControls(ctx, "windows", 0, my, width, c);
    if (o.showTabs) { ctx.fillStyle = c.tabStrip; ctx.fillRect(0, tb, width, ch.tabStrip); const tw = Math.min(320, width * 0.4); fillRounded(ctx, (width - tw) / 2, tb + 4, tw, ch.tabStrip - 8, 7, c.activeTab); if (title) { ctx.font = `12px ${FONT_STACK}`; ctx.fillStyle = c.text; ctx.textAlign = "center"; ctx.fillText(ellipsize(title, tw - 30, measure), width / 2, tb + ch.tabStrip / 2); } }
  } else {
    const ts = o.showTabs ? ch.tabStrip : 0, tb = ch.toolbar;
    if (ts) {
      ctx.fillStyle = c.tabStrip; ctx.fillRect(0, 0, width, ts); const my = ts / 2 + (ch.style === "firefox" ? 0 : 3);
      if (controls) drawWindowControls(ctx, controls, 16, ts / 2, width, c);
      const tx = controls === "mac" ? 86 : 12, ty = ch.style === "firefox" ? 6 : 6, th = ts - ty - (ch.style === "firefox" ? 4 : 0), tw = Math.min(ch.tabWidth, width - tx - 140);
      if (ch.style === "firefox") fillRounded(ctx, tx, ty, tw, th, ch.tabRadius, c.activeTab); else fillRounded(ctx, tx, ty, tw, th + 2, [ch.tabRadius, ch.tabRadius, 0, 0], c.activeTab);
      tabTitle(tx, my - (ch.style === "firefox" ? 0 : 1), tw, true); ICON.close(ctx, tx + tw - 16, my - (ch.style === "firefox" ? 0 : 1), c.subtext, 4); ICON.plus(ctx, tx + tw + 22, my - 1, c.icon);
      if (controls === "windows") drawWindowControls(ctx, "windows", 0, ts / 2, width, c);
    }
    ctx.fillStyle = c.toolbar; ctx.fillRect(0, ts, width, tb); const my = ts + tb / 2;
    if (!ts && controls) drawWindowControls(ctx, controls, 16, my, width, c);
    const nav = !ts && controls === "mac" ? 84 : 12; ICON.back(ctx, nav + 14, my, c.icon); ICON.forward(ctx, nav + 46, my, c.icon); ICON.reload(ctx, nav + 78, my, c.icon);
    const ax = nav + 100, right = ch.style === "firefox" ? 44 : 40; drawAddress(ax, ts + (tb - ch.addressHeight) / 2, Math.max(120, width - ax - right - (!ts && controls === "windows" ? 140 : 0)), false);
    if (ch.style === "firefox") ICON.menu(ctx, width - 26 - (!ts && controls === "windows" ? 140 : 0), my, c.icon); else ICON.dots(ctx, width - 22 - (!ts && controls === "windows" ? 140 : 0), my, c.icon);
    if (!ts && controls === "windows") drawWindowControls(ctx, "windows", 0, my, width, c);
  }
  ctx.fillStyle = c.border; ctx.fillRect(0, chromeH - 1, width, 1);
}

/* ------------------------------------------------------------------ device drawing */
function silhouette(ctx: Ctx, l: ItemLayout, grow: number) {
  const g = l.geom, p = l.preset, o = g.origin, ow = g.outer.width, oh = g.outer.height;
  ctx.beginPath(); roundedRectPath(ctx, o.x - grow, o.y - grow, ow + grow * 2, oh + grow * 2, l.radius + grow);
  if (p?.base?.kind === "laptop-base") roundedRectPath(ctx, 0 - grow, o.y + oh - 1, g.bounds.width + grow * 2, p.base.height + 1 + grow, [0, 0, 12, 12]);
  if (p?.base?.kind === "monitor-stand") { const b = p.base, nw = b.neckWidth ?? 80, fw = b.footWidth ?? 280, fh = b.footHeight ?? 14; roundedRectPath(ctx, g.bounds.width / 2 - nw / 2, o.y + oh - 2, nw, b.height - fh + 2, 2); roundedRectPath(ctx, g.bounds.width / 2 - fw / 2, o.y + oh + b.height - fh, fw, fh, fh / 2); }
  if (p?.band) { roundedRectPath(ctx, g.bounds.width / 2 - (ow * p.band.widthRatio) / 2 - 0, 0, ow * p.band.widthRatio, o.y + 6, 14); roundedRectPath(ctx, g.bounds.width / 2 - (ow * p.band.widthRatio) / 2, o.y + oh - 6, ow * p.band.widthRatio, p.band.height + 6, 14); }
}

function drawShadow(ctx: Ctx, s: ShadowSettings, l: ItemLayout, layout: SceneLayout, k: number) {
  const m = ctx.getTransform(), sk = k * l.scale, off = Math.ceil(layout.width * k + s.blur * sk * 3 + 500);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(-off, 0); ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.shadowColor = shadowColor(s); ctx.shadowBlur = s.blur * sk; ctx.shadowOffsetX = s.offsetX * sk + off; ctx.shadowOffsetY = s.offsetY * sk;
  silhouette(ctx, l, Math.max(0, s.spread)); ctx.fillStyle = "#000000"; ctx.fill(); ctx.restore();
}

function cameraShape(ctx: Ctx, preset: FramePreset, item: SceneItem, screen: Rect, landscape: boolean) {
  if (!item.showCamera) return;
  const cx = screen.x + screen.width / 2, cy = screen.y + screen.height / 2;
  switch (preset.camera) {
    case "pill": { const cw = Math.min(screen.width * 0.28, 124), chh = 34; if (landscape) fillRounded(ctx, screen.x + 12, cy - cw / 2, chh, cw, chh / 2, "#000"); else fillRounded(ctx, cx - cw / 2, screen.y + 12, cw, chh, chh / 2, "#000"); break; }
    case "punch-hole": ctx.beginPath(); if (landscape) ctx.arc(screen.x + 22, cy, 9, 0, Math.PI * 2); else ctx.arc(cx, screen.y + 22, 9, 0, Math.PI * 2); ctx.fillStyle = "#000"; ctx.fill(); break;
    case "notch": { ctx.beginPath(); roundedRectPath(ctx, cx - 84, screen.y - 1, 168, 24, [0, 0, 11, 11]); ctx.fillStyle = "#000"; ctx.fill(); ctx.beginPath(); ctx.arc(cx, screen.y + 9, 3.2, 0, Math.PI * 2); ctx.fillStyle = "#15151a"; ctx.fill(); break; }
    case "dot": { const bx = landscape ? screen.x / 2 : cx, by = landscape ? cy : screen.y / 2; if ((landscape ? screen.x : screen.y) >= 8) { ctx.beginPath(); ctx.arc(bx, by, 3.4, 0, Math.PI * 2); ctx.fillStyle = "#1a1a1e"; ctx.fill(); } break; }
    default: break;
  }
}

function drawLock(ctx: Ctx, lock: Scene["lock"], s: Rect) {
  const light = lock.appearance === "light", fg = light ? "#ffffff" : "#111113", sub = light ? "rgba(255,255,255,0.85)" : "rgba(17,17,19,0.7)";
  ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "top"; if (light) { ctx.shadowColor = "rgba(0,0,0,0.28)"; ctx.shadowBlur = s.width * 0.02; }
  const cx = s.x + s.width / 2; let y = s.y + s.height * 0.1;
  if (lock.showTime) {
    const date = sanitizeDisplayText(lock.date, 60), time = sanitizeDisplayText(lock.time, 12);
    if (date) { ctx.font = `600 ${s.width * 0.046}px ${FONT_STACK}`; ctx.fillStyle = sub; ctx.fillText(date, cx, y); y += s.width * 0.07; }
    if (time) { ctx.font = `600 ${s.width * 0.21}px ${FONT_STACK}`; ctx.fillStyle = fg; ctx.fillText(time, cx, y); }
  }
  ctx.restore();
  const cards = lock.notifications.filter((n) => n.app || n.title || n.body).slice(0, 4), ch = s.width * 0.19, gap = s.width * 0.025; let cy = s.y + s.height * 0.62;
  const measureText = (t: string) => ctx.measureText(t).width;
  for (const n of cards) {
    const x = s.x + s.width * 0.05, w = s.width * 0.9; fillRounded(ctx, x, cy, w, ch, s.width * 0.05, light ? "rgba(245,245,247,0.82)" : "rgba(38,38,42,0.82)");
    const pad = s.width * 0.04, tx = x + pad, tw = w - pad * 2; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.font = `600 ${s.width * 0.03}px ${FONT_STACK}`; ctx.fillStyle = light ? "rgba(60,60,67,0.7)" : "rgba(235,235,245,0.7)"; ctx.fillText(ellipsize(sanitizeDisplayText(n.app, 40).toUpperCase(), tw, measureText), tx, cy + pad * 0.7);
    ctx.font = `700 ${s.width * 0.038}px ${FONT_STACK}`; ctx.fillStyle = light ? "#111113" : "#f5f5f7"; ctx.fillText(ellipsize(sanitizeDisplayText(n.title, 80), tw, measureText), tx, cy + pad * 0.7 + s.width * 0.04);
    ctx.font = `400 ${s.width * 0.034}px ${FONT_STACK}`; ctx.fillStyle = light ? "#3a3a3c" : "#d1d1d6"; ctx.fillText(ellipsize(sanitizeDisplayText(n.body, 160), tw, measureText), tx, cy + pad * 0.7 + s.width * 0.082);
    cy += ch + gap;
  }
}

function drawItem(ctx: Ctx, scene: Scene, layout: SceneLayout, l: ItemLayout, item: SceneItem, res: RenderResources, k: number, measure: Measure) {
  const g = l.geom, p = l.preset, o = g.origin;
  ctx.save(); ctx.translate(l.center.x, l.center.y); ctx.rotate(rad(l.rotation)); ctx.scale(l.scale, l.scale); ctx.translate(-g.bounds.width / 2, -g.bounds.height / 2);
  const sh = scene.shadow; if (sh.enabled && sh.style === "outer") drawShadow(ctx, sh, l, layout, k);
  const screen: Rect = { x: o.x + g.screen.x, y: o.y + g.screen.y, width: g.screen.width, height: g.screen.height };
  const screenRadius = p ? (p.kind === "browser" ? 0 : p.screenRadius) : l.radius;
  const landscape = !!p && item.orientation !== p.natural && (p.kind === "phone" || p.kind === "tablet");
  const drawScreenContent = () => {
    ctx.save(); ctx.beginPath();
    if (p?.kind === "browser") roundedRectPath(ctx, screen.x, screen.y, screen.width, screen.height, [0, 0, l.radius, l.radius]); else roundedRectPath(ctx, screen.x, screen.y, screen.width, screen.height, screenRadius);
    ctx.clip();
    const c = res.contents[item.id], f = l.fit;
    if (f && c) {
      if (f.mode === "contain") { ctx.fillStyle = safeColor(item.letterbox, "#000000"); ctx.fillRect(screen.x, screen.y, screen.width, screen.height); }
      const crop = item.crop ?? { x: 0, y: 0, width: 0, height: 0 }, kk = c.scale;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(c.canvas, (crop.x + f.source.x) * kk, (crop.y + f.source.y) * kk, f.source.width * kk, f.source.height * kk, screen.x + f.dest.x, screen.y + f.dest.y, f.dest.width, f.dest.height);
    }
    if (scene.workflow === "lockscreen") drawLock(ctx, scene.lock, screen);
    if (sh.enabled && sh.style === "inner") { ctx.save(); const m = ctx.getTransform(), sk = k * l.scale; void m; ctx.shadowColor = shadowColor(sh); ctx.shadowBlur = sh.blur * sk; ctx.shadowOffsetX = sh.offsetX * sk; ctx.shadowOffsetY = sh.offsetY * sk; ctx.beginPath(); ctx.rect(screen.x - 4000, screen.y - 4000, screen.width + 8000, screen.height + 8000); roundedRectPath(ctx, screen.x, screen.y, screen.width, screen.height, screenRadius); ctx.fillStyle = "#000"; ctx.fill("evenodd"); ctx.restore(); }
    ctx.restore();
  };

  if (!p) { // plain screenshot
    drawScreenContent();
    if (scene.style.borderEnabled && scene.style.borderWidth > 0) { const bw = scene.style.borderWidth; ctx.beginPath(); roundedRectPath(ctx, bw / 2, bw / 2, g.outer.width - bw, g.outer.height - bw, Math.max(0, l.radius - bw / 2)); ctx.lineWidth = bw; ctx.strokeStyle = withOpacity(scene.style.borderColor, scene.style.borderOpacity); ctx.stroke(); }
  } else if (p.kind === "browser") {
    ctx.save(); ctx.beginPath(); roundedRectPath(ctx, o.x, o.y, g.outer.width, g.outer.height, l.radius); ctx.clip();
    ctx.fillStyle = p.chrome!.colors[item.browser.appearance].frame; ctx.fillRect(o.x, o.y, g.outer.width, g.outer.height);
    ctx.save(); ctx.translate(o.x, o.y); drawBrowserChrome(ctx, p, item, g.outer.width, g.chromeHeight, (t) => measure(`13px ${FONT_STACK}`, t)); ctx.restore();
    ctx.restore(); drawScreenContent();
    ctx.beginPath(); roundedRectPath(ctx, o.x + 0.5, o.y + 0.5, g.outer.width - 1, g.outer.height - 1, l.radius); ctx.lineWidth = 1; ctx.strokeStyle = withOpacity(p.chrome!.colors[item.browser.appearance].border, 1); ctx.stroke();
  } else {
    const col = p.colors;
    if (p.band && item.orientation === p.natural) { const bw = g.outer.width * p.band.widthRatio, bx = g.bounds.width / 2 - bw / 2; fillRounded(ctx, bx, 0, bw, o.y + 8, 14, p.band.color); fillRounded(ctx, bx, o.y + g.outer.height - 8, bw, p.band.height + 8, 14, p.band.color); }
    if (p.base?.kind === "laptop-base") { const b = p.base; ctx.beginPath(); roundedRectPath(ctx, 0, o.y + g.outer.height - 1, g.bounds.width, b.height + 1, [0, 0, 12, 12]); ctx.fillStyle = col.edge; ctx.fill(); fillRounded(ctx, g.bounds.width / 2 - (b.lipWidth ?? 180) / 2, o.y + g.outer.height - 1, b.lipWidth ?? 180, b.lipHeight ?? 6, [0, 0, 6, 6], col.accent); }
    if (p.base?.kind === "monitor-stand") { const b = p.base, nw = b.neckWidth ?? 80, fw = b.footWidth ?? 280, fh = b.footHeight ?? 14; fillRounded(ctx, g.bounds.width / 2 - nw / 2, o.y + g.outer.height - 2, nw, b.height - fh + 2, 2, col.edge); fillRounded(ctx, g.bounds.width / 2 - fw / 2, o.y + g.outer.height + b.height - fh, fw, fh, fh / 2, col.accent); }
    if (p.crown && item.orientation === p.natural) fillRounded(ctx, o.x + g.outer.width - 3, o.y + g.outer.height * 0.32, 12, g.outer.height * 0.16, 4, col.accent);
    fillRounded(ctx, o.x, o.y, g.outer.width, g.outer.height, l.radius, col.body);
    const edge = p.kind === "laptop" || p.kind === "desktop" ? 2 : 3; fillRounded(ctx, o.x + edge, o.y + edge, g.outer.width - edge * 2, g.outer.height - edge * 2, Math.max(2, l.radius - edge), col.bezel);
    drawScreenContent(); cameraShape(ctx, p, item, screen, landscape);
    ctx.beginPath(); roundedRectPath(ctx, o.x + 0.5, o.y + 0.5, g.outer.width - 1, g.outer.height - 1, l.radius); ctx.lineWidth = 1; ctx.strokeStyle = col.edge; ctx.stroke();
  }
  ctx.restore();
}

export function renderScene(ctx: Ctx, scene: Scene, layout: SceneLayout, res: RenderResources, opts: RenderOptions, measure: Measure = makeMeasure()) {
  const k = opts.scale, W = Math.round(layout.width * k), H = Math.round(layout.height * k);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.scale(k, k);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  drawBackground(ctx, scene.background, layout.width, layout.height, res);
  if (layout.headline) { ctx.save(); ctx.textBaseline = "top"; ctx.textAlign = layout.headline.align; for (const ln of layout.headline.lines) { ctx.font = ln.font; ctx.fillStyle = safeColor(ln.color, "#111113"); ctx.fillText(ln.text, ln.x, ln.y); } ctx.restore(); }
  for (const l of layout.items) { const item = scene.items.find((i) => i.id === l.id); if (item && l.hasImage && l.visible) drawItem(ctx, scene, layout, l, item, res, k, measure); }
  if (opts.showGuides) { ctx.save(); ctx.setLineDash([8 / k * 1, 6 / k]); ctx.lineWidth = 1.5 / k; ctx.strokeStyle = "rgba(10,132,255,0.9)"; const s = layout.safeArea; ctx.strokeRect(s.x, s.y, s.width, s.height); ctx.restore(); }
  ctx.restore();
  if (opts.flatten) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = safeColor(opts.flatten, "#ffffff"); ctx.fillRect(0, 0, W, H); ctx.restore(); }
}
