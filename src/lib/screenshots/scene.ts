/**
 * Scene model + layout engine (pure). One composition primitive powers every Screenshot
 * workflow: a scene holds 1..n items (a screenshot inside an optional device/browser
 * frame), a canvas, a background, shadow, optional headline, and annotation objects.
 * `computeLayout` turns a scene into concrete geometry; render.ts only draws it.
 */
import type { Orientation, Point, Rect, ScreenshotFamily, ScreenshotWorkflow, Size } from "./types.ts";
import { deviceGeometry, getPreset, type DeviceGeometry, type FramePreset } from "./presets.ts";
import { getBackdrop, type BackgroundSpec } from "./backgrounds.ts";
import { DEFAULT_SHADOW, shadowExtent, type ShadowSettings } from "./shadow.ts";
import { clamp, fitRect, rotatePoint, rotatedSize } from "./geometry.ts";
import { getCanvasPreset } from "./store-presets.ts";
import { sanitizeDisplayText, wrapText } from "./text-layout.ts";
import type { AnnotationObject } from "./annotations.ts";

export const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const NO_FRAME = "none";
export type FitMode = "auto" | "cover" | "contain";

export interface BrowserOptions { showChrome: boolean; showTabs: boolean; appearance: "light" | "dark"; controls: "mac" | "windows" | "none"; address: string; tabTitle: string }
export interface SceneItem {
  id: string; name: string; imageId: string | null;
  presetId: string;                  // FramePreset id, or "none" for a plain screenshot
  orientation: Orientation; fit: FitMode; letterbox: string; showCamera: boolean;
  crop: Rect | null;                 // in source pixels; null = whole image
  x: number; y: number;              // offset of the item centre (design px) from the layout anchor
  scale: number; rotation: number;
  visible: boolean; locked: boolean;
  browser: BrowserOptions;
}
export interface HeadlineSettings { enabled: boolean; title: string; subtitle: string; position: "top" | "bottom"; align: "left" | "center" | "right"; titleSize: number; subtitleSize: number; titleWeight: 400 | 600 | 700; color: string; subtitleColor: string; maxWidth: number; gap: number }
export interface LockNotification { id: string; app: string; title: string; body: string }
export interface LockSettings { showTime: boolean; time: string; date: string; appearance: "light" | "dark"; notifications: LockNotification[] }
export interface CanvasSettings { mode: "auto" | "preset" | "custom"; presetId: string; width: number; height: number }
export interface StyleSettings { radius: number; borderEnabled: boolean; borderWidth: number; borderColor: string; borderOpacity: number }
export type CollageLayout = "row" | "column" | "grid" | "overlap";
export interface CollageSettings { layout: CollageLayout; gap: number; columns: number }

export interface Scene {
  version: 1; toolId: string; family: ScreenshotFamily; workflow: ScreenshotWorkflow;
  items: SceneItem[]; canvas: CanvasSettings; padding: { linked: boolean; x: number; y: number };
  background: BackgroundSpec; shadow: ShadowSettings; style: StyleSettings; headline: HeadlineSettings;
  annotations: AnnotationObject[]; collage: CollageSettings; lock: LockSettings; snap: boolean;
}

export const DEFAULT_BROWSER: BrowserOptions = { showChrome: true, showTabs: true, appearance: "light", controls: "mac", address: "", tabTitle: "" };
export const DEFAULT_HEADLINE: HeadlineSettings = { enabled: false, title: "", subtitle: "", position: "top", align: "center", titleSize: 72, subtitleSize: 36, titleWeight: 700, color: "#111113", subtitleColor: "#5c636c", maxWidth: 0.86, gap: 16 };
export const DEFAULT_STYLE: StyleSettings = { radius: 24, borderEnabled: false, borderWidth: 2, borderColor: "#000000", borderOpacity: 0.12 };
export const DEFAULT_LOCK: LockSettings = { showTime: true, time: "", date: "", appearance: "light", notifications: [] };

/** Browser-window options seeded from the preset (e.g. Edge-style windows default to Windows controls). */
export function browserDefaultsFor(presetId: string): BrowserOptions {
  if (presetId === NO_FRAME) return { ...DEFAULT_BROWSER };
  return { ...DEFAULT_BROWSER, controls: getPreset(presetId).chrome?.defaultControls ?? "mac" };
}

/** The orientation whose screen proportions are closest to the screenshot, so nothing is letterboxed needlessly. */
export function bestOrientation(presetId: string, src: Size): Orientation {
  if (presetId === NO_FRAME) return "portrait";
  const p = getPreset(presetId);
  if (p.orientations.length < 2 || src.width <= 0 || src.height <= 0) return p.natural;
  const sa = src.width / src.height, score = (o: Orientation) => { const g = deviceGeometry(p, o); return Math.abs(Math.log(sa / (g.screen.width / g.screen.height))); };
  return score("portrait") <= score("landscape") ? "portrait" : "landscape";
}

export function createItem(id: string, presetId: string, over: Partial<SceneItem> = {}): SceneItem {
  return { id, name: "Screenshot", imageId: null, presetId, orientation: "portrait", fit: "auto", letterbox: "#000000", showCamera: true, crop: null, x: 0, y: 0, scale: 1, rotation: 0, visible: true, locked: false, browser: browserDefaultsFor(presetId), ...over };
}

export function createScene(init: { toolId: string; family: ScreenshotFamily; workflow: ScreenshotWorkflow; presetId: string; canvas?: Partial<CanvasSettings>; background?: BackgroundSpec; shadow?: Partial<ShadowSettings>; padding?: number; headline?: Partial<HeadlineSettings>; style?: Partial<StyleSettings>; collage?: Partial<CollageSettings> }): Scene {
  const pad = init.padding ?? 0;
  return {
    version: 1, toolId: init.toolId, family: init.family, workflow: init.workflow, items: [],
    canvas: { mode: "auto", presetId: "portrait", width: 1080, height: 1350, ...init.canvas },
    padding: { linked: true, x: pad, y: pad },
    background: init.background ?? { kind: "transparent" },
    shadow: { ...DEFAULT_SHADOW, enabled: false, ...init.shadow },
    style: { ...DEFAULT_STYLE, ...init.style }, headline: { ...DEFAULT_HEADLINE, ...init.headline },
    annotations: [], collage: { layout: "row", gap: 48, columns: 2, ...init.collage }, lock: { ...DEFAULT_LOCK }, snap: true,
  };
}

export interface FitInfo { mode: "cover" | "contain"; source: Rect; dest: Rect; mismatch: boolean; screenAspect: number; sourceAspect: number }
export interface ItemLayout {
  id: string; hasImage: boolean; visible: boolean;
  center: Point; scale: number; rotation: number;
  preset: FramePreset | null; geom: DeviceGeometry;   // frameless items get a synthetic geometry
  content: Size; fit: FitInfo | null; radius: number;
  bounds: Rect;                                       // axis-aligned bounds in canvas space
}
export interface HeadlineLayout { lines: { text: string; font: string; size: number; color: string; x: number; y: number; baseline: "top" }[]; align: "left" | "center" | "right"; block: Rect }
export interface SceneLayout { width: number; height: number; items: ItemLayout[]; area: Rect; safeArea: Rect; headline: HeadlineLayout | null; warnings: string[]; hasTransparency: boolean }
export type Measure = (font: string, text: string) => number;

function itemCrop(item: SceneItem, src: Size | undefined): Rect | null {
  if (!src) return null;
  if (!item.crop) return { x: 0, y: 0, width: src.width, height: src.height };
  const x = clamp(Math.round(item.crop.x), 0, src.width - 1), y = clamp(Math.round(item.crop.y), 0, src.height - 1);
  return { x, y, width: clamp(Math.round(item.crop.width), 1, src.width - x), height: clamp(Math.round(item.crop.height), 1, src.height - y) };
}
export const effectiveCrop = itemCrop;

function naturalGeometry(item: SceneItem, content: Size): { preset: FramePreset | null; geom: DeviceGeometry } {
  if (item.presetId === NO_FRAME) {
    const w = Math.max(1, content.width), h = Math.max(1, content.height);
    return { preset: null, geom: { outer: { width: w, height: h }, screen: { x: 0, y: 0, width: w, height: h }, bounds: { width: w, height: h }, origin: { x: 0, y: 0 }, chromeHeight: 0, statusBarHeight: 0, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } } };
  }
  const preset = getPreset(item.presetId);
  if (preset.kind === "browser") {
    const cw = clamp(content.width || 1200, 400, 1440), ch = Math.max(1, Math.round((cw * (content.height || 800)) / Math.max(1, content.width || 1200)));
    return { preset, geom: deviceGeometry(preset, "landscape", { showChrome: item.browser.showChrome, showTabs: item.browser.showTabs, contentSize: { width: cw, height: ch } }) };
  }
  return { preset, geom: deviceGeometry(preset, item.orientation) };
}

export function itemRadius(preset: FramePreset | null, style: StyleSettings): number {
  return preset ? preset.outerRadius : style.radius;
}

/** Resolve the canvas size for fixed modes. */
export function fixedCanvasSize(c: CanvasSettings): Size {
  if (c.mode === "preset") { const p = getCanvasPreset(c.presetId); if (p) return { width: p.width, height: p.height }; const g = GENERIC_CANVAS[c.presetId]; if (g) return g; }
  return { width: Math.max(16, Math.round(c.width)), height: Math.max(16, Math.round(c.height)) };
}
const GENERIC_CANVAS: Record<string, Size> = { square: { width: 1080, height: 1080 }, portrait: { width: 1080, height: 1350 }, tall: { width: 1080, height: 1920 }, landscape: { width: 1920, height: 1080 }, desktop: { width: 1440, height: 900 } };

export function computeHeadline(scene: Scene, canvasW: number, measure: Measure): { layout: HeadlineLayout; height: number } | null {
  const h = scene.headline, title = sanitizeDisplayText(h.title, 300).trim(), sub = sanitizeDisplayText(h.subtitle, 500).trim();
  if (!h.enabled || (!title && !sub)) return null;
  const maxW = Math.max(80, canvasW * clamp(h.maxWidth, 0.3, 1)), x0 = h.align === "left" ? (canvasW - maxW) / 2 : h.align === "right" ? (canvasW + maxW) / 2 : canvasW / 2;
  const tFont = `${h.titleWeight} ${h.titleSize}px ${FONT_STACK}`, sFont = `400 ${h.subtitleSize}px ${FONT_STACK}`;
  const tLines = title ? wrapText(title, maxW, (t) => measure(tFont, t), 4) : [], sLines = sub ? wrapText(sub, maxW, (t) => measure(sFont, t), 4) : [];
  const lines: HeadlineLayout["lines"] = []; let y = 0;
  for (const t of tLines) { lines.push({ text: t, font: tFont, size: h.titleSize, color: h.color, x: x0, y, baseline: "top" }); y += h.titleSize * 1.15; }
  if (tLines.length && sLines.length) y += h.gap;
  for (const t of sLines) { lines.push({ text: t, font: sFont, size: h.subtitleSize, color: h.subtitleColor, x: x0, y, baseline: "top" }); y += h.subtitleSize * 1.3; }
  return { layout: { lines, align: h.align, block: { x: (canvasW - maxW) / 2, y: 0, width: maxW, height: y } }, height: y };
}

export function computeLayout(scene: Scene, sizes: Record<string, Size>, measure: Measure): SceneLayout {
  const warnings: string[] = [];
  const isAbsolute = scene.workflow === "collage" || scene.canvas.mode === "auto";
  const padX = Math.max(0, scene.padding.x), padY = Math.max(0, scene.padding.linked ? scene.padding.x : scene.padding.y);
  const raw = scene.items.map((item) => {
    const src = item.imageId ? sizes[item.imageId] : undefined, crop = itemCrop(item, src);
    const content: Size = crop ? { width: crop.width, height: crop.height } : { width: 0, height: 0 };
    const { preset, geom } = naturalGeometry(item, content);
    return { item, crop, content, preset, geom, hasImage: !!crop };
  });
  const laid = raw.filter((r) => r.item.visible && r.hasImage);

  const shadow = shadowExtent(scene.shadow);
  const gapAround = { top: Math.max(padY, shadow.top), bottom: Math.max(padY, shadow.bottom), left: Math.max(padX, shadow.left), right: Math.max(padX, shadow.right) };
  let width: number, height: number, area: Rect, headline: ReturnType<typeof computeHeadline> = null;

  if (scene.canvas.mode === "auto" && scene.workflow !== "collage") {
    // Canvas hugs the item(s); headline (if any) adds a band above/below.
    const boxes = laid.map((r) => { const b = rotatedSize(r.geom.bounds.width * r.item.scale, r.geom.bounds.height * r.item.scale, r.item.rotation); return { r, b, cx: r.item.x, cy: r.item.y }; });
    const x0 = Math.min(0, ...boxes.map((o) => o.cx - o.b.width / 2)), x1 = Math.max(0, ...boxes.map((o) => o.cx + o.b.width / 2));
    const y0 = Math.min(0, ...boxes.map((o) => o.cy - o.b.height / 2)), y1 = Math.max(0, ...boxes.map((o) => o.cy + o.b.height / 2));
    const contentW = boxes.length ? x1 - x0 : 0, contentH = boxes.length ? y1 - y0 : 0;
    width = Math.max(1, Math.round(contentW + gapAround.left + gapAround.right));
    headline = computeHeadline(scene, width, measure);
    const hh = headline ? headline.height + Math.max(24, padY / 2) : 0;
    height = Math.max(1, Math.round(contentH + gapAround.top + gapAround.bottom + hh));
    area = { x: gapAround.left - x0 + 0, y: gapAround.top + (scene.headline.position === "top" ? hh : 0) - y0, width: 0, height: 0 };
    // `area` here is the ORIGIN (canvas position of layout anchor 0,0); size is unused in auto mode.
  } else {
    const size = fixedCanvasSize(scene.canvas); width = size.width; height = size.height;
    headline = scene.workflow === "collage" ? null : computeHeadline(scene, width, measure);
    const hh = headline ? headline.height + Math.max(24, padY / 2) : 0;
    const top = padY + (scene.headline.position === "top" ? hh : 0), bottom = padY + (scene.headline.position === "bottom" ? hh : 0);
    area = { x: padX, y: top, width: Math.max(8, width - padX * 2), height: Math.max(8, height - top - bottom) };
  }

  const items: ItemLayout[] = raw.map((r) => {
    const { item, crop, content, preset, geom, hasImage } = r;
    const rad = itemRadius(preset, scene.style);
    let scale = item.scale, center: Point;
    if (scene.canvas.mode === "auto" && scene.workflow !== "collage") {
      center = { x: area.x + item.x, y: area.y + item.y };
    } else if (scene.workflow === "collage") {
      center = { x: width / 2 + item.x, y: height / 2 + item.y };
    } else {
      const rb = rotatedSize(geom.bounds.width, geom.bounds.height, item.rotation);
      const fit = Math.min(area.width / rb.width, area.height / rb.height);
      scale = isAbsolute ? item.scale : fit * item.scale;
      center = { x: area.x + area.width / 2 + item.x, y: area.y + area.height / 2 + item.y };
    }
    const screenSize = { width: geom.screen.width, height: geom.screen.height };
    let fitInfo: FitInfo | null = null;
    if (hasImage && crop) {
      const sa = screenSize.width / Math.max(1, screenSize.height), ca = content.width / Math.max(1, content.height), mismatch = Math.abs(ca / sa - 1) > 0.04;
      const mode = item.fit === "auto" ? (mismatch ? "contain" : "cover") : item.fit;
      const f = fitRect(content, { x: 0, y: 0, ...screenSize }, mode);
      fitInfo = { mode, source: f.source, dest: f.dest, mismatch, screenAspect: sa, sourceAspect: ca };
    }
    const rb = rotatedSize(geom.bounds.width * scale, geom.bounds.height * scale, item.rotation);
    return { id: item.id, hasImage, visible: item.visible, center, scale, rotation: item.rotation, preset, geom, content, fit: fitInfo, radius: rad, bounds: { x: center.x - rb.width / 2, y: center.y - rb.height / 2, width: rb.width, height: rb.height } };
  });

  for (const it of items) {
    if (!it.hasImage || !it.visible) continue;
    const b = it.bounds, out = b.x < -0.5 || b.y < -0.5 || b.x + b.width > width + 0.5 || b.y + b.height > height + 0.5;
    if (out) warnings.push(`"${scene.items.find((i) => i.id === it.id)?.name ?? "Item"}" extends beyond the canvas and will be clipped.`);
    if (it.fit?.mismatch && it.preset && it.preset.kind !== "browser") warnings.push(`${scene.items.length > 1 ? `"${scene.items.find((i) => i.id === it.id)?.name ?? "Item"}": p` : "P"}roportions (${it.fit.sourceAspect.toFixed(2)}) differ from this frame's screen (${it.fit.screenAspect.toFixed(2)}); it is ${it.fit.mode === "contain" ? "letterboxed" : "cropped"}. Change Fit to choose otherwise.`);
  }
  const hasTransparency = !isOpaqueBg(scene.background);
  const safeArea: Rect = { x: padX, y: padY, width: Math.max(0, width - padX * 2), height: Math.max(0, height - padY * 2) };
  return { width, height, items, area: scene.canvas.mode === "auto" && scene.workflow !== "collage" ? safeArea : area, safeArea, headline: headline ? headlineWithOffset(headline.layout, scene, height, padY, headline.height) : null, warnings, hasTransparency };
}

function isOpaqueBg(bg: BackgroundSpec): boolean {
  if (bg.kind === "solid") return /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(bg.color.trim());
  if (bg.kind === "linear" || bg.kind === "radial") return bg.stops.length > 0 && bg.stops.every((s) => /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(s.color.trim()));
  if (bg.kind === "image") return bg.fit === "cover";
  return false;
}

function headlineWithOffset(h: HeadlineLayout, scene: Scene, canvasH: number, padY: number, blockH: number): HeadlineLayout {
  const y0 = scene.headline.position === "top" ? Math.max(padY, 24) : canvasH - Math.max(padY, 24) - blockH;
  return { ...h, block: { ...h.block, y: y0 }, lines: h.lines.map((l) => ({ ...l, y: l.y + y0 })) };
}

/** Canvas point -> item-local (design px, origin = outer top-left of the bounds). */
export function canvasToItem(l: ItemLayout, p: Point): Point {
  const q = rotatePoint(p, l.center, -l.rotation);
  return { x: (q.x - l.center.x) / l.scale + l.geom.bounds.width / 2, y: (q.y - l.center.y) / l.scale + l.geom.bounds.height / 2 };
}
export function itemToCanvas(l: ItemLayout, p: Point): Point {
  const q = { x: l.center.x + (p.x - l.geom.bounds.width / 2) * l.scale, y: l.center.y + (p.y - l.geom.bounds.height / 2) * l.scale };
  return rotatePoint(q, l.center, l.rotation);
}
export function pickItem(layout: SceneLayout, p: Point): ItemLayout | null {
  for (let i = layout.items.length - 1; i >= 0; i--) {
    const l = layout.items[i]; if (!l.hasImage || !l.visible) continue;
    const q = canvasToItem(l, p); if (q.x >= 0 && q.y >= 0 && q.x <= l.geom.bounds.width && q.y <= l.geom.bounds.height) return l;
  }
  return null;
}

/** Default exports stay under this many pixels. iOS Safari silently renders blank canvases above ~16.7 MP, so "native resolution" must never ask for more. */
export const NATIVE_EXPORT_MAX_PIXELS = 16_000_000;

/**
 * The export scale at which the screenshot keeps its native resolution, capped so the
 * resulting file never exceeds NATIVE_EXPORT_MAX_PIXELS (a small screenshot letterboxed
 * inside a large canvas could otherwise ask for an unexportable size).
 */
export function nativeExportScale(layout: SceneLayout, maxPixels = NATIVE_EXPORT_MAX_PIXELS): number {
  let k = 1;
  for (const l of layout.items) {
    if (!l.hasImage || !l.visible || !l.fit) continue;
    const drawnW = l.fit.dest.width * l.scale;                // design px the screenshot occupies on the canvas
    const srcW = l.fit.source.width;
    if (drawnW > 0) k = Math.max(k, srcW / drawnW);
  }
  const cap = Math.sqrt(maxPixels / Math.max(1, layout.width * layout.height));
  return Math.round(clamp(Math.min(k, cap), 0.25, 8) * 100) / 100;
}

/** Automatic arrangement for collages. Everything remains manually adjustable afterwards. */
export function arrangeItems(scene: Scene, sizes: Record<string, Size>, layoutMode: CollageLayout): Scene {
  const size = fixedCanvasSize(scene.canvas), gap = Math.max(0, scene.collage.gap), pad = Math.max(0, scene.padding.x);
  const usable = scene.items.filter((i) => i.imageId && sizes[i.imageId]);
  if (!usable.length) return scene;
  const nat = usable.map((item) => {
    const crop = itemCrop(item, sizes[item.imageId as string]) as Rect;
    const { geom } = naturalGeometry({ ...item, scale: 1, rotation: 0 }, { width: crop.width, height: crop.height });
    return { item, w: geom.bounds.width, h: geom.bounds.height };
  });
  const availW = Math.max(16, size.width - pad * 2), availH = Math.max(16, size.height - pad * 2), n = nat.length;
  const place = new Map<string, { x: number; y: number; scale: number }>();
  const put = (o: (typeof nat)[number], cx: number, cy: number, s: number) => place.set(o.item.id, { x: cx - size.width / 2, y: cy - size.height / 2, scale: Math.round(s * 1000) / 1000 });
  if (layoutMode === "row" || layoutMode === "overlap") {
    const overlap = layoutMode === "overlap" ? 0.22 : 0, sumW = nat.reduce((s, o) => s + o.w, 0) - overlap * nat.slice(1).reduce((s, o) => s + o.w, 0), gaps = layoutMode === "overlap" ? 0 : gap * (n - 1);
    const s = Math.min((availW - gaps) / sumW, availH / Math.max(...nat.map((o) => o.h)));
    let x = size.width / 2 - (sumW * s + gaps) / 2;
    nat.forEach((o, i) => { const w = o.w * s; put(o, x + w / 2, size.height / 2, s); x += w + gap * (layoutMode === "overlap" ? 0 : 1) - (i < n - 1 ? overlap * nat[i + 1].w * s : 0); });
  } else if (layoutMode === "column") {
    const sumH = nat.reduce((s, o) => s + o.h, 0), gaps = gap * (n - 1), s = Math.min((availH - gaps) / sumH, availW / Math.max(...nat.map((o) => o.w)));
    let y = size.height / 2 - (sumH * s + gaps) / 2;
    for (const o of nat) { const h = o.h * s; put(o, size.width / 2, y + h / 2, s); y += h + gap; }
  } else {
    const cols = clamp(Math.round(scene.collage.columns) || Math.ceil(Math.sqrt(n)), 1, n), rows = Math.ceil(n / cols);
    const cw = (availW - gap * (cols - 1)) / cols, ch = (availH - gap * (rows - 1)) / rows;
    nat.forEach((o, i) => { const r = Math.floor(i / cols), c = i % cols, rowCount = r === rows - 1 ? n - r * cols : cols, offset = ((cols - rowCount) * (cw + gap)) / 2; put(o, pad + offset + c * (cw + gap) + cw / 2, pad + r * (ch + gap) + ch / 2, Math.min(cw / o.w, ch / o.h)); });
  }
  return { ...scene, collage: { ...scene.collage, layout: layoutMode }, items: scene.items.map((i) => { const p = place.get(i.id); return p ? { ...i, x: p.x, y: p.y, scale: p.scale, rotation: 0 } : i; }) };
}

export const SCENE_DEFAULT_BACKDROP = (id: string): BackgroundSpec => getBackdrop(id)?.spec ?? { kind: "solid", color: "#f5f5f7" };
