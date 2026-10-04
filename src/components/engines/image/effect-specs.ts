/**
 * Declarative specs for the "adjust / filter / frame" Image tools. Each spec lists the controls that tool exposes and a
 * `run` function. `run` receives the working canvas and the preview `scale` (1 at export), so pixel-sized settings stay
 * identical between the live preview and the final export.
 */
import { cloneCanvas, ctxOf, makeCanvas, readPixels, writePixels } from "@/lib/image/canvas";
import type { ExportFormat } from "@/lib/image/export";
import { largestInscribedRect, rotatedBounds } from "@/lib/image/geometry";
import { applyInvert, applyTone, computeHistogram, featherAlpha, gaussianBlur, hexToRgb, pixelate, unsharpMask } from "@/lib/image/pixels";

export type Val = number | string | boolean;
export type Values = Record<string, Val>;
export interface Ctl {
  id: string; label: string; kind: "range" | "seg" | "select" | "toggle" | "color"; def: Val;
  min?: number; max?: number; step?: number; unit?: string; options?: { value: string; label: string }[];
  group?: string; hint?: string; show?: (v: Values) => boolean; transparent?: boolean;
}
export interface Preset { id: string; label: string; values: Values }
export interface EffectSpec {
  title: string; intro: string; suffix: string; controls: Ctl[]; presets?: Preset[]; groups?: { id: string; open?: boolean }[];
  run: (src: HTMLCanvasElement, v: Values, scale: number) => HTMLCanvasElement; defaultFormat?: ExportFormat; auto?: (src: HTMLCanvasElement) => Values; autoLabel?: string; tips?: string;
}

const n = (v: Val) => Number(v);
const s = (v: Val) => String(v);
const b = (v: Val) => Boolean(v);
const range = (id: string, label: string, min: number, max: number, def: number, extra: Partial<Ctl> = {}): Ctl => ({ id, label, kind: "range", min, max, def, step: 1, ...extra });
const seg = (id: string, label: string, def: string, options: [string, string][], extra: Partial<Ctl> = {}): Ctl => ({ id, label, kind: "seg", def, options: options.map(([value, l]) => ({ value, label: l })), ...extra });
const color = (id: string, label: string, def: string, extra: Partial<Ctl> = {}): Ctl => ({ id, label, kind: "color", def, ...extra });
const toggle = (id: string, label: string, def: boolean, extra: Partial<Ctl> = {}): Ctl => ({ id, label, kind: "toggle", def, ...extra });

export const defaultsOf = (spec: EffectSpec): Values => Object.fromEntries(spec.controls.map((c) => [c.id, c.def]));

/** Length in working-canvas pixels from a px (full-res) or % (of canvas width) setting. */
const len = (value: number, unit: string, canvasWidth: number, scale: number) => (unit === "%" ? (value / 100) * canvasWidth : value * scale);

/* ----------------------------- path helpers ----------------------------- */

export function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radii: [number, number, number, number], smooth = 0) {
  const lim = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, lim))) as [number, number, number, number];
  const k = 0.5523 + 0.38 * smooth;
  const ext = (r: number) => Math.min(lim * 2 - 1e-6, r * (1 + 0.35 * smooth)) ;
  ctx.beginPath();
  const corner = (cx: number, cy: number, ax: number, ay: number, bx: number, by: number, r: number) => {
    if (r <= 0) { ctx.lineTo(cx, cy); return; }
    const e = Math.min(ext(r), Math.min(w, h));
    ctx.lineTo(cx + ax * e, cy + ay * e);
    ctx.bezierCurveTo(cx + ax * e * (1 - k), cy + ay * e * (1 - k), cx + bx * e * (1 - k), cy + by * e * (1 - k), cx + bx * e, cy + by * e);
  };
  ctx.moveTo(x + Math.min(ext(tl), w / 2), y);
  corner(x + w, y, -1, 0, 0, 1, tr);
  corner(x + w, y + h, 0, -1, -1, 0, br);
  corner(x, y + h, 1, 0, 0, -1, bl);
  corner(x, y, 0, 1, 1, 0, tl);
  ctx.closePath();
}

function polygonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, sides: number, rotation: number, inner = 1) {
  ctx.beginPath();
  const pts = sides * (inner < 1 ? 2 : 1);
  for (let i = 0; i < pts; i++) {
    const a = rotation + (i / pts) * Math.PI * 2;
    const rr = inner < 1 && i % 2 ? inner : 1;
    const px = cx + Math.cos(a) * rx * rr, py = cy + Math.sin(a) * ry * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

/* --------------------------------- specs --------------------------------- */

const withPixels = (src: HTMLCanvasElement, fn: (d: Uint8ClampedArray, w: number, h: number) => void) => {
  const c = cloneCanvas(src); const img = readPixels(c); fn(img.data, c.width, c.height); writePixels(c, img); return c;
};

const levels: EffectSpec = {
  title: "Brightness & contrast", suffix: "adjusted", intro: "Adjust light and colour with live preview. Every slider can be reset on its own.",
  groups: [{ id: "Light", open: true }, { id: "Colour", open: true }, { id: "Levels (advanced)", open: false }],
  controls: [
    range("exposure", "Exposure", -3, 3, 0, { step: 0.05, group: "Light", unit: "EV" }), range("brightness", "Brightness", -100, 100, 0, { group: "Light" }), range("contrast", "Contrast", -100, 100, 0, { group: "Light" }),
    range("highlights", "Highlights", -100, 100, 0, { group: "Light" }), range("shadows", "Shadows", -100, 100, 0, { group: "Light" }), range("whites", "Whites", -100, 100, 0, { group: "Light" }), range("blacks", "Blacks", -100, 100, 0, { group: "Light" }),
    range("saturation", "Saturation", -100, 100, 0, { group: "Colour" }), range("vibrance", "Vibrance", -100, 100, 0, { group: "Colour", hint: "Boosts muted colours more than vivid ones." }),
    range("temperature", "Temperature", -100, 100, 0, { group: "Colour", hint: "Negative = cooler (blue), positive = warmer (amber)." }), range("tint", "Tint", -100, 100, 0, { group: "Colour", hint: "Negative = green, positive = magenta." }), range("hue", "Hue shift", -180, 180, 0, { group: "Colour", unit: "°" }),
    range("inBlack", "Input black", 0, 254, 0, { group: "Levels (advanced)" }), range("inWhite", "Input white", 1, 255, 255, { group: "Levels (advanced)" }), range("gamma", "Midtones (gamma)", 0.2, 3, 1, { step: 0.01, group: "Levels (advanced)" }),
    range("outBlack", "Output black", 0, 254, 0, { group: "Levels (advanced)" }), range("outWhite", "Output white", 1, 255, 255, { group: "Levels (advanced)" }),
  ],
  presets: [
    { id: "punchy", label: "Punchy", values: { contrast: 25, vibrance: 30, saturation: 8, shadows: 10 } }, { id: "soft", label: "Soft & faded", values: { contrast: -20, blacks: 35, saturation: -10, brightness: 6 } },
    { id: "warm", label: "Warm", values: { temperature: 35, tint: 6, vibrance: 12 } }, { id: "cool", label: "Cool", values: { temperature: -35, vibrance: 8 } }, { id: "lowlight", label: "Brighten shadows", values: { shadows: 55, exposure: 0.25, highlights: -15 } },
  ],
  autoLabel: "Auto adjust",
  auto: (src) => {
    const probe = cloneCanvas(src); const d = readPixels(probe).data; const h = computeHistogram(d); const total = h.pixels || 1;
    const percentile = (p: number) => { let acc = 0; for (let i = 0; i < 256; i++) { acc += h.luma[i]; if (acc >= total * p) return i; } return 255; };
    const lo = percentile(0.005), hi = Math.max(lo + 8, percentile(0.995));
    let mean = 0; for (let i = 0; i < 256; i++) mean += (i * h.luma[i]) / total;
    const mid = Math.min(1, Math.max(0.05, (mean - lo) / Math.max(1, hi - lo)));
    const gamma = Math.min(1.8, Math.max(0.6, Math.log(0.46) / Math.log(mid)));
    return { inBlack: Math.min(lo, 60), inWhite: Math.max(hi, 195), gamma: Number(gamma.toFixed(2)) };
  },
  run: (src, v) => withPixels(src, (d) => applyTone(d, { exposure: n(v.exposure), brightness: n(v.brightness), contrast: n(v.contrast), highlights: n(v.highlights), shadows: n(v.shadows), whites: n(v.whites), blacks: n(v.blacks), saturation: n(v.saturation), vibrance: n(v.vibrance), temperature: n(v.temperature), tint: n(v.tint), hue: n(v.hue) },
    { inBlack: n(v.inBlack), inWhite: n(v.inWhite), gamma: n(v.gamma), outBlack: n(v.outBlack), outWhite: n(v.outWhite) })),
};

const MIX: Record<string, [number, number, number]> = { luminosity: [21.26, 71.52, 7.22], average: [33.33, 33.33, 33.33], red: [100, 0, 0], green: [0, 100, 0], blue: [0, 0, 100], infrared: [-40, 190, -50], contrast: [60, 90, -50] };

const grayscale: EffectSpec = {
  title: "Grayscale", suffix: "grayscale", intro: "Choose how colours turn into grey, mix the channels yourself, then tone and tint the result.",
  controls: [
    seg("preset", "Conversion", "luminosity", [["luminosity", "Natural"], ["average", "Average"], ["red", "Red filter"], ["green", "Green filter"], ["blue", "Blue filter"], ["infrared", "Infrared look"], ["custom", "Custom mix"]]),
    range("wr", "Red contribution", -100, 300, 21, { unit: "%", show: (v) => v.preset === "custom", hint: "Channel contributions normally add up to 100%." }), range("wg", "Green contribution", -100, 300, 72, { unit: "%", show: (v) => v.preset === "custom" }), range("wb", "Blue contribution", -100, 300, 7, { unit: "%", show: (v) => v.preset === "custom" }),
    range("amount", "Amount", 0, 100, 100, { unit: "%", hint: "Below 100% keeps some of the original colour." }), range("brightness", "Brightness", -100, 100, 0), range("contrast", "Contrast", -100, 100, 0),
    toggle("tone", "Tone with a colour", false), color("tint", "Tone colour", "#704214", { show: (v) => b(v.tone) }), range("tintAmount", "Tone strength", 0, 100, 60, { unit: "%", show: (v) => b(v.tone) }),
  ],
  presets: [{ id: "sepia", label: "Sepia", values: { preset: "luminosity", tone: true, tint: "#704214", tintAmount: 85, contrast: 8 } }, { id: "bw-contrast", label: "High-contrast B&W", values: { preset: "red", contrast: 35, brightness: -4 } }, { id: "cool", label: "Cool tone", values: { preset: "luminosity", tone: true, tint: "#2a4d7a", tintAmount: 45 } }],
  run: (src, v) => withPixels(src, (d) => {
    const [pr, pg, pb] = v.preset === "custom" ? [n(v.wr), n(v.wg), n(v.wb)] : MIX[s(v.preset)] ?? MIX.luminosity;
    const k = n(v.amount) / 100;
    const tint = b(v.tone) ? hexToRgb(s(v.tint)) : null; const tk = n(v.tintAmount) / 100;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.max(0, Math.min(255, (d[i] * pr + d[i + 1] * pg + d[i + 2] * pb) / 100));
      d[i] += (y - d[i]) * k; d[i + 1] += (y - d[i + 1]) * k; d[i + 2] += (y - d[i + 2]) * k;
    }
    if (n(v.brightness) || n(v.contrast)) applyTone(d, { brightness: n(v.brightness), contrast: n(v.contrast) });
    if (tint && tk > 0) for (let i = 0; i < d.length; i += 4) {
      const g = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const lo = g < 0.5; const t = lo ? g * 2 : (g - 0.5) * 2;
      const tr = lo ? tint.r * t : tint.r + (255 - tint.r) * t, tg = lo ? tint.g * t : tint.g + (255 - tint.g) * t, tb = lo ? tint.b * t : tint.b + (255 - tint.b) * t;
      d[i] += (tr - d[i]) * tk; d[i + 1] += (tg - d[i + 1]) * tk; d[i + 2] += (tb - d[i + 2]) * tk;
    }
  }),
};

const invert: EffectSpec = {
  title: "Invert colours", suffix: "inverted", intro: "Flip colours completely or partly, and choose which channels to invert.",
  controls: [range("amount", "Amount", 0, 100, 100, { unit: "%", hint: "50% gives flat grey; use it to blend toward the negative." }), toggle("r", "Invert red", true), toggle("g", "Invert green", true), toggle("b", "Invert blue", true)],
  presets: [{ id: "red-only", label: "Red channel only", values: { r: true, g: false, b: false } }, { id: "no-blue", label: "Keep blue", values: { r: true, g: true, b: false } }],
  run: (src, v) => withPixels(src, (d) => applyInvert(d, n(v.amount), { r: b(v.r), g: b(v.g), b: b(v.b) })),
};

const blur: EffectSpec = {
  title: "Blur", suffix: "blur", intro: "Gaussian blur with a strength you control. Transparent edges stay clean.",
  controls: [seg("unit", "Strength measured in", "px", [["px", "Pixels"], ["%", "% of width"]]), range("radius", "Strength", 0, 100, 8, { step: 0.5, hint: "Pixels are measured on the original image, so the preview matches the export." })],
  presets: [{ id: "soft", label: "Soft", values: { unit: "px", radius: 3 } }, { id: "medium", label: "Medium", values: { unit: "px", radius: 12 } }, { id: "heavy", label: "Heavy", values: { unit: "px", radius: 40 } }],
  run: (src, v, scale) => withPixels(src, (d, w, h) => gaussianBlur(d, w, h, len(n(v.radius), s(v.unit), w, scale))),
};

const sharpen: EffectSpec = {
  title: "Sharpen", suffix: "sharpened", intro: "Unsharp-mask sharpening. Zoom to 100% (1:1) to judge it — sharpening is only visible at full size.",
  controls: [range("amount", "Amount", 0, 400, 100, { unit: "%" }), range("radius", "Radius", 0.3, 10, 1.2, { step: 0.1, unit: "px", hint: "How wide the sharpened edge is." }), range("threshold", "Threshold", 0, 50, 2, { hint: "Leaves smooth areas (noise, skin) untouched." })],
  presets: [{ id: "subtle", label: "Subtle", values: { amount: 60, radius: 0.8, threshold: 2 } }, { id: "standard", label: "Standard", values: { amount: 100, radius: 1.2, threshold: 2 } }, { id: "strong", label: "Strong", values: { amount: 200, radius: 1.6, threshold: 4 } }, { id: "web", label: "After downsizing", values: { amount: 80, radius: 0.6, threshold: 0 } }],
  run: (src, v, scale) => withPixels(src, (d, w, h) => unsharpMask(d, w, h, { amount: n(v.amount), radius: Math.max(0.25, n(v.radius) * scale), threshold: n(v.threshold) })),
};

const pixelation: EffectSpec = {
  title: "Pixelate", suffix: "pixelated", intro: "Turn the image into blocks. Larger blocks hide more detail.",
  controls: [seg("unit", "Block size in", "%", [["%", "% of width"], ["px", "Pixels"]]), range("size", "Block size", 1, 100, 3, { step: 0.5, hint: "Pixels are measured on the original image." })],
  presets: [{ id: "light", label: "Light", values: { unit: "%", size: 1.5 } }, { id: "mosaic", label: "Mosaic", values: { unit: "%", size: 4 } }, { id: "retro", label: "Retro 8-bit", values: { unit: "%", size: 8 } }],
  run: (src, v, scale) => withPixels(src, (d, w, h) => pixelate(d, w, h, Math.max(1, len(n(v.size), s(v.unit), w, scale)))),
};

function frame(src: HTMLCanvasElement, v: Values, scale: number) {
  const same = b(v.same);
  const t = len(n(v.top), "px", src.width, scale), r = len(same ? n(v.top) : n(v.right), "px", src.width, scale), bt = len(same ? n(v.top) : n(v.bottom), "px", src.width, scale), l = len(same ? n(v.top) : n(v.left), "px", src.width, scale);
  const w = Math.round(src.width + l + r), h = Math.round(src.height + t + bt);
  const out = makeCanvas(w, h); const ctx = ctxOf(out);
  const outerR = Math.min(len(n(v.outerRadius), "px", src.width, scale), Math.min(w, h) / 2);
  if (s(v.color) !== "transparent") { ctx.fillStyle = s(v.color); roundedPath(ctx, 0, 0, w, h, [outerR, outerR, outerR, outerR]); ctx.fill(); }
  const ir = len(n(v.imageRadius), "px", src.width, scale);
  ctx.save(); roundedPath(ctx, l, t, src.width, src.height, [ir, ir, ir, ir]); ctx.clip(); ctx.drawImage(src, l, t); ctx.restore();
  const lw = len(n(v.lineWidth), "px", src.width, scale);
  if (lw > 0) { ctx.strokeStyle = s(v.lineColor); ctx.lineWidth = lw; const g = len(n(v.lineGap), "px", src.width, scale); roundedPath(ctx, l - g - lw / 2, t - g - lw / 2, src.width + 2 * g + lw, src.height + 2 * g + lw, [ir, ir, ir, ir]); ctx.stroke(); }
  return out;
}
const borderControls = (advanced: boolean): Ctl[] => [
  range("top", "Thickness", 0, 400, 24, { unit: "px", hint: "On the original image; applied to all sides unless you turn that off." }), color("color", "Border colour", "#ffffff", { transparent: true }),
  toggle("same", "Same thickness on all sides", true), range("right", "Right", 0, 400, 24, { unit: "px", show: (v) => !b(v.same) }), range("bottom", "Bottom", 0, 400, 24, { unit: "px", show: (v) => !b(v.same) }), range("left", "Left", 0, 400, 24, { unit: "px", show: (v) => !b(v.same) }),
  range("outerRadius", "Outer corner radius", 0, 400, 0, { unit: "px", group: advanced ? undefined : "More" }), range("imageRadius", "Photo corner radius", 0, 400, 0, { unit: "px", group: advanced ? undefined : "More" }),
  range("lineWidth", "Inner line width", 0, 40, 0, { unit: "px", group: advanced ? undefined : "More" }), color("lineColor", "Inner line colour", "#000000", { group: advanced ? undefined : "More", show: (v) => n(v.lineWidth) > 0 }), range("lineGap", "Gap to photo", 0, 200, 0, { unit: "px", group: advanced ? undefined : "More", show: (v) => n(v.lineWidth) > 0 }),
];
const borderPresets: Preset[] = [
  { id: "thin", label: "Thin white", values: { top: 12, same: true, color: "#ffffff", lineWidth: 0 } }, { id: "polaroid", label: "Polaroid", values: { same: false, top: 28, right: 28, left: 28, bottom: 110, color: "#fafafa", lineWidth: 0 } },
  { id: "mat", label: "Gallery mat", values: { same: true, top: 80, color: "#f4f1ea", lineWidth: 2, lineColor: "#c9c2b2", lineGap: 14 } }, { id: "black", label: "Black frame", values: { same: true, top: 30, color: "#111111", lineWidth: 0 } },
];
const border: EffectSpec = { title: "Add border", suffix: "border", intro: "Add a solid border around the image — thickness, colour and corners.", controls: borderControls(false), presets: borderPresets, groups: [{ id: "More", open: false }], defaultFormat: "png", run: frame };
const borderGenerator: EffectSpec = { title: "Border generator", suffix: "frame", intro: "Design a frame: per-side thickness, rounded outer corners, rounded photo, and an inner line for mat-style borders.", controls: borderControls(true), presets: borderPresets, defaultFormat: "png", run: frame };

const rounded: EffectSpec = {
  title: "Rounded corners", suffix: "rounded", intro: "Round any combination of corners, with optional smooth ('squircle') curvature. Saved as PNG/WebP to keep the transparent corners.", defaultFormat: "png",
  controls: [seg("unit", "Radius in", "px", [["px", "Pixels"], ["%", "% of shorter side"]]), range("radius", "Radius", 0, 500, 48, { step: 1 }), range("smooth", "Corner smoothing", 0, 100, 0, { unit: "%", hint: "0% = circular arcs; higher = softer, iOS-style continuous corners." }),
    toggle("tl", "Top-left", true), toggle("tr", "Top-right", true), toggle("br", "Bottom-right", true), toggle("bl", "Bottom-left", true), color("bg", "Corner background", "transparent", { transparent: true })],
  presets: [{ id: "subtle", label: "Subtle", values: { unit: "%", radius: 6 } }, { id: "card", label: "Card", values: { unit: "%", radius: 12 } }, { id: "pill", label: "Pill / circle", values: { unit: "%", radius: 50 } }],
  run: (src, v, scale) => {
    const out = makeCanvas(src.width, src.height); const ctx = ctxOf(out);
    if (s(v.bg) !== "transparent") { ctx.fillStyle = s(v.bg); ctx.fillRect(0, 0, out.width, out.height); }
    const r = s(v.unit) === "%" ? (n(v.radius) / 100) * Math.min(src.width, src.height) : n(v.radius) * scale;
    ctx.save(); roundedPath(ctx, 0, 0, src.width, src.height, [b(v.tl) ? r : 0, b(v.tr) ? r : 0, b(v.br) ? r : 0, b(v.bl) ? r : 0], n(v.smooth) / 100); ctx.clip(); ctx.drawImage(src, 0, 0); ctx.restore();
    return out;
  },
};

const shadow: EffectSpec = {
  title: "Drop shadow", suffix: "shadow", intro: "Add a soft shadow. With a transparent PNG the shadow follows the shape of the subject.", defaultFormat: "png",
  controls: [range("distance", "Distance", 0, 200, 24, { unit: "px" }), range("angle", "Direction", 0, 360, 135, { unit: "°", hint: "135° = down and to the right." }), range("blur", "Softness", 0, 200, 36, { unit: "px" }), range("opacity", "Opacity", 0, 100, 45, { unit: "%" }), color("color", "Shadow colour", "#000000"),
    seg("shape", "Shadow shape", "alpha", [["alpha", "Follow the image"], ["rect", "Rectangle"]]), range("spread", "Spread", -50, 100, 0, { unit: "px", show: (v) => v.shape === "rect" }), range("radius", "Corner radius", 0, 300, 0, { unit: "px", show: (v) => v.shape === "rect" }), color("bg", "Background", "transparent", { transparent: true })],
  presets: [{ id: "soft", label: "Soft", values: { distance: 12, blur: 40, opacity: 30, angle: 90 } }, { id: "hard", label: "Hard offset", values: { distance: 18, blur: 0, opacity: 55, angle: 135 } }, { id: "float", label: "Floating", values: { distance: 40, blur: 70, opacity: 40, angle: 90 } }],
  run: (src, v, scale) => {
    const dist = n(v.distance) * scale, blur = n(v.blur) * scale, a = (n(v.angle) * Math.PI) / 180;
    const ox = Math.cos(a) * dist, oy = Math.sin(a) * dist, spread = n(v.spread) * scale;
    const pad = Math.ceil(blur * 1.6 + Math.abs(ox) + Math.abs(oy) + Math.max(0, spread)) + 2;
    const out = makeCanvas(src.width + pad * 2, src.height + pad * 2); const ctx = ctxOf(out);
    if (s(v.bg) !== "transparent") { ctx.fillStyle = s(v.bg); ctx.fillRect(0, 0, out.width, out.height); }
    const rgb = hexToRgb(s(v.color)) ?? { r: 0, g: 0, b: 0 };
    ctx.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},${n(v.opacity) / 100})`; ctx.shadowBlur = blur; ctx.shadowOffsetX = ox + 100000; ctx.shadowOffsetY = oy;
    if (v.shape === "rect") {
      const r = n(v.radius) * scale; ctx.fillStyle = "#000"; roundedPath(ctx, pad - spread - 100000, pad - spread, src.width + spread * 2, src.height + spread * 2, [r, r, r, r]); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.save(); roundedPath(ctx, pad, pad, src.width, src.height, [r, r, r, r]); ctx.clip(); ctx.drawImage(src, pad, pad); ctx.restore();
    } else { ctx.drawImage(src, pad - 100000, pad); ctx.shadowColor = "transparent"; ctx.drawImage(src, pad, pad); }
    return out;
  },
};

const rotate: EffectSpec = {
  title: "Rotate", suffix: "rotated", intro: "Rotate in 90° steps or any angle. Use a small angle to straighten a tilted horizon, and crop away the empty corners.",
  controls: [range("angle", "Angle", -180, 180, 0, { step: 0.1, unit: "°" }), seg("mode", "Corners", "expand", [["expand", "Expand canvas"], ["crop", "Crop to straightened area"]]), color("fill", "Fill colour", "transparent", { transparent: true, show: (v) => v.mode === "expand" })],
  presets: [{ id: "cw", label: "90° clockwise", values: { angle: 90, mode: "expand" } }, { id: "ccw", label: "90° anticlockwise", values: { angle: -90, mode: "expand" } }, { id: "half", label: "180°", values: { angle: 180, mode: "expand" } }, { id: "level", label: "Level (0°)", values: { angle: 0 } }],
  run: (src, v) => {
    const deg = n(v.angle);
    if (Math.abs(deg) < 1e-6) return cloneCanvas(src);
    const bounds = rotatedBounds(src.width, src.height, deg);
    const out = makeCanvas(bounds.width, bounds.height); const ctx = ctxOf(out);
    if (s(v.fill) !== "transparent" && v.mode === "expand") { ctx.fillStyle = s(v.fill); ctx.fillRect(0, 0, out.width, out.height); }
    ctx.imageSmoothingQuality = "high"; ctx.translate(out.width / 2, out.height / 2); ctx.rotate((deg * Math.PI) / 180); ctx.drawImage(src, -src.width / 2, -src.height / 2);
    if (v.mode === "crop") {
      const r = largestInscribedRect(src.width, src.height, deg);
      const c = makeCanvas(r.width, r.height); ctxOf(c).drawImage(out, (out.width - r.width) / 2, (out.height - r.height) / 2, r.width, r.height, 0, 0, r.width, r.height); return c;
    }
    return out;
  },
};

const flip: EffectSpec = {
  title: "Flip & mirror", suffix: "flipped", intro: "Flip horizontally or vertically, or mirror one half of the image onto the other for a symmetrical result.",
  controls: [toggle("h", "Flip horizontally", true), toggle("v", "Flip vertically", false), seg("mirror", "Mirror half onto the other", "none", [["none", "Off"], ["left", "Left → right"], ["right", "Right → left"], ["top", "Top → bottom"], ["bottom", "Bottom → top"]])],
  presets: [{ id: "h", label: "Horizontal", values: { h: true, v: false, mirror: "none" } }, { id: "v", label: "Vertical", values: { h: false, v: true, mirror: "none" } }, { id: "both", label: "Both (= 180°)", values: { h: true, v: true, mirror: "none" } }],
  run: (src, v) => {
    const out = makeCanvas(src.width, src.height); const ctx = ctxOf(out);
    ctx.save(); ctx.translate(b(v.h) ? src.width : 0, b(v.v) ? src.height : 0); ctx.scale(b(v.h) ? -1 : 1, b(v.v) ? -1 : 1); ctx.drawImage(src, 0, 0); ctx.restore();
    const m = s(v.mirror); if (m === "none") return out;
    const half = makeCanvas(out.width, out.height); const hc = ctxOf(half); hc.drawImage(out, 0, 0);
    const w = out.width, h = out.height;
    if (m === "left" || m === "right") { const hw = Math.floor(w / 2); ctx.save(); if (m === "left") { ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(half, 0, 0, hw, h, 0, 0, hw, h); } else { ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(half, w - hw, 0, hw, h, w - hw, 0, hw, h); } ctx.restore(); }
    else { const hh = Math.floor(h / 2); ctx.save(); if (m === "top") { ctx.translate(0, h); ctx.scale(1, -1); ctx.drawImage(half, 0, 0, w, hh, 0, 0, w, hh); } else { ctx.translate(0, h); ctx.scale(1, -1); ctx.drawImage(half, 0, h - hh, w, hh, 0, h - hh, w, hh); } ctx.restore(); }
    return out;
  },
};

const shapeMask: EffectSpec = {
  title: "Shape mask", suffix: "masked", defaultFormat: "png", intro: "Cut the image into a shape, soften the edge, or export the mask itself (white shape on black) for use in other apps.",
  controls: [seg("shape", "Shape", "circle", [["circle", "Circle"], ["ellipse", "Ellipse"], ["rounded", "Rounded"], ["squircle", "Squircle"], ["diamond", "Diamond"], ["hexagon", "Hexagon"], ["star", "Star"]]), range("size", "Shape size", 20, 100, 100, { unit: "%" }),
    range("feather", "Edge softness", 0, 100, 0, { unit: "px" }), seg("output", "Output", "image", [["image", "Masked image"], ["mask", "Mask (white on black)"], ["alpha", "Mask (white, transparent)"]]), color("bg", "Background", "transparent", { transparent: true, show: (v) => v.output === "image" })],
  presets: [{ id: "avatar", label: "Avatar circle", values: { shape: "circle", size: 100, feather: 0 } }, { id: "soft", label: "Soft vignette", values: { shape: "ellipse", size: 90, feather: 40 } }],
  run: (src, v, scale) => {
    const w = src.width, h = src.height; const m = makeCanvas(w, h); const mc = ctxOf(m);
    const sz = n(v.size) / 100; const sq = Math.min(w, h) * sz; const kind = s(v.shape);
    const cx = w / 2, cy = h / 2, rx = kind === "ellipse" ? (w * sz) / 2 : sq / 2, ry = kind === "ellipse" ? (h * sz) / 2 : sq / 2;
    mc.fillStyle = "#fff";
    if (kind === "circle" || kind === "ellipse") { mc.beginPath(); mc.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); }
    else if (kind === "rounded") roundedPath(mc, cx - rx, cy - ry, rx * 2, ry * 2, [rx * 0.28, rx * 0.28, rx * 0.28, rx * 0.28]);
    else if (kind === "squircle") roundedPath(mc, cx - rx, cy - ry, rx * 2, ry * 2, [rx * 0.5, rx * 0.5, rx * 0.5, rx * 0.5], 1);
    else if (kind === "diamond") polygonPath(mc, cx, cy, rx, ry, 4, 0);
    else if (kind === "hexagon") polygonPath(mc, cx, cy, rx, ry, 6, 0);
    else polygonPath(mc, cx, cy, rx, ry, 5, -Math.PI / 2, 0.42);
    mc.fill();
    const f = n(v.feather) * scale;
    if (f > 0) { const mp = readPixels(m); featherAlpha(mp.data, w, h, f / 2); writePixels(m, mp); }
    const out = makeCanvas(w, h); const oc = ctxOf(out);
    if (v.output === "mask") { oc.fillStyle = "#000"; oc.fillRect(0, 0, w, h); oc.drawImage(m, 0, 0); return out; }
    if (v.output === "alpha") { oc.drawImage(m, 0, 0); return out; }
    if (s(v.bg) !== "transparent") { oc.fillStyle = s(v.bg); oc.fillRect(0, 0, w, h); }
    const body = makeCanvas(w, h); const bc = ctxOf(body); bc.drawImage(src, 0, 0); bc.globalCompositeOperation = "destination-in"; bc.drawImage(m, 0, 0);
    oc.drawImage(body, 0, 0); return out;
  },
};

/** op (lower-case) → spec. Ops that share a spec still open as separate tools with their own title. */
export const EFFECT_SPECS: Record<string, EffectSpec> = {
  levels, grayscale, invert, blur, "image-blur": blur, sharpen, "image-image-pixelation-tool": pixelation, border, "image-image-border-generator": borderGenerator,
  rounded, "image-image-rounded-corner-generator": { ...rounded, title: "Rounded corner generator" }, "image-image-shadow-generator": shadow, rotate, flip,
  "image-image-circle-mask-generator": { ...shapeMask, title: "Circle & shape mask generator" },
};
