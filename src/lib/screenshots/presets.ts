/**
 * Versioned frame / platform presets. Geometry lives here as data so a platform
 * refresh is a data edit, not a renderer rewrite (requirements 53, 54, 123).
 *
 * Truthfulness: every device body is a deliberately GENERIC shape ("iPhone-style",
 * "MacBook-style"). None claims to be an exact current model, and no vendor art
 * or proprietary icon set is embedded. Browser chrome is an approximation of the
 * publicly visible layout; it is presentation chrome only and never implies that
 * a page was loaded.
 */
import type { Insets, Orientation, Point, Rect, ScreenshotFamily, Size } from "./types.ts";

export type FrameKind = "phone" | "tablet" | "laptop" | "desktop" | "watch" | "browser" | "none";
export type CameraKind = "none" | "pill" | "notch" | "punch-hole" | "dot";
export type BrowserStyle = "chromium" | "safari" | "firefox" | "edge" | "search";
export type Exactness = "generic";

export interface BrowserColors { frame: string; tabStrip: string; activeTab: string; toolbar: string; address: string; text: string; subtext: string; border: string; icon: string }
export interface BrowserChrome {
  style: BrowserStyle;
  tabStrip: number; toolbar: number;
  addressHeight: number; addressRadius: number; addressAlign: "left" | "center"; addressWidthRatio: number;
  tabWidth: number; tabRadius: number; windowRadius: number;
  defaultControls: "mac" | "windows";
  colors: { light: BrowserColors; dark: BrowserColors };
}

export interface BaseSpec { kind: "laptop-base" | "monitor-stand"; height: number; overhang: number; neckWidth?: number; footWidth?: number; footHeight?: number; lipWidth?: number; lipHeight?: number }
export interface WatchBand { height: number; widthRatio: number; color: string }

export interface FramePreset {
  id: string;
  family: ScreenshotFamily;
  label: string;
  kind: FrameKind;
  exactness: Exactness;
  version: number;
  /** Date this generic geometry was authored. It is an approximation, not a verified platform measurement. */
  authoredOn: string;
  note: string;
  outer: Size;               // natural orientation, design units
  natural: Orientation;
  orientations: Orientation[];
  bezel: Insets;             // natural orientation
  outerRadius: number;
  screenRadius: number;
  camera: CameraKind;
  statusBarHeight: number;   // 0 = none
  safeArea: Insets;          // natural orientation, inside the screen
  colors: { body: string; bezel: string; edge: string; accent: string };
  base?: BaseSpec;
  band?: WatchBand;
  crown?: boolean;
  chrome?: BrowserChrome;
}

const AUTHORED = "2026-09-30";
const ins = (t: number, r = t, b = t, l = r): Insets => ({ top: t, right: r, bottom: b, left: l });
const NO_INSETS = ins(0);

const chromiumLight: BrowserColors = { frame: "#dee1e6", tabStrip: "#dee1e6", activeTab: "#ffffff", toolbar: "#ffffff", address: "#f1f3f4", text: "#202124", subtext: "#5f6368", border: "#dadce0", icon: "#5f6368" };
const chromiumDark: BrowserColors = { frame: "#202124", tabStrip: "#202124", activeTab: "#35363a", toolbar: "#35363a", address: "#202124", text: "#e8eaed", subtext: "#9aa0a6", border: "#3c4043", icon: "#9aa0a6" };
const edgeLight: BrowserColors = { frame: "#e6ebf1", tabStrip: "#e6ebf1", activeTab: "#ffffff", toolbar: "#ffffff", address: "#f0f2f5", text: "#1b1b1b", subtext: "#616161", border: "#d6dbe1", icon: "#4a4a4a" };
const edgeDark: BrowserColors = { frame: "#202020", tabStrip: "#202020", activeTab: "#2b2b2b", toolbar: "#2b2b2b", address: "#3a3a3a", text: "#f2f2f2", subtext: "#a0a0a0", border: "#3d3d3d", icon: "#c8c8c8" };
const safariLight: BrowserColors = { frame: "#f2f2f3", tabStrip: "#e6e6e8", activeTab: "#fbfbfb", toolbar: "#f2f2f3", address: "#e6e6e8", text: "#1d1d1f", subtext: "#6e6e73", border: "#d2d2d7", icon: "#5a5a5f" };
const safariDark: BrowserColors = { frame: "#2c2c2e", tabStrip: "#242426", activeTab: "#3a3a3c", toolbar: "#2c2c2e", address: "#3a3a3c", text: "#f5f5f7", subtext: "#a1a1a6", border: "#48484a", icon: "#c7c7cc" };
const firefoxLight: BrowserColors = { frame: "#f0f0f4", tabStrip: "#f0f0f4", activeTab: "#ffffff", toolbar: "#f9f9fb", address: "#f0f0f4", text: "#15141a", subtext: "#5b5b66", border: "#cfcfd8", icon: "#5b5b66" };
const firefoxDark: BrowserColors = { frame: "#1c1b22", tabStrip: "#1c1b22", activeTab: "#42414d", toolbar: "#2b2a33", address: "#1c1b22", text: "#fbfbfe", subtext: "#bfbfc9", border: "#52525e", icon: "#fbfbfe" };

function browser(id: string, family: ScreenshotFamily, label: string, chrome: BrowserChrome, note: string): FramePreset {
  return {
    id, family, label, kind: "browser", exactness: "generic", version: 1, authoredOn: AUTHORED, note,
    outer: { width: 1200, height: 760 }, natural: "landscape", orientations: ["landscape"],
    bezel: NO_INSETS, outerRadius: chrome.windowRadius, screenRadius: 0, camera: "none", statusBarHeight: 0, safeArea: NO_INSETS,
    colors: { body: chrome.colors.light.frame, bezel: chrome.colors.light.frame, edge: chrome.colors.light.border, accent: chrome.colors.light.icon }, chrome,
  };
}

export const FRAME_PRESETS: FramePreset[] = [
  {
    id: "iphone-generic", family: "iphone", label: "iPhone-style phone", kind: "phone", exactness: "generic", version: 1, authoredOn: AUTHORED,
    note: "Generic modern smartphone with a pill-shaped camera cut-out. Not a specific iPhone model.",
    outer: { width: 420, height: 884 }, natural: "portrait", orientations: ["portrait", "landscape"], bezel: ins(14), outerRadius: 68, screenRadius: 54,
    camera: "pill", statusBarHeight: 54, safeArea: { top: 54, right: 0, bottom: 34, left: 0 },
    colors: { body: "#1d1d1f", bezel: "#000000", edge: "#3a3a3c", accent: "#5e5e62" },
  },
  {
    id: "android-generic", family: "android", label: "Android-style phone", kind: "phone", exactness: "generic", version: 1, authoredOn: AUTHORED,
    note: "Generic Android-style phone with a punch-hole camera. Not a specific device.",
    outer: { width: 412, height: 880 }, natural: "portrait", orientations: ["portrait", "landscape"], bezel: ins(10), outerRadius: 54, screenRadius: 44,
    camera: "punch-hole", statusBarHeight: 36, safeArea: { top: 36, right: 0, bottom: 24, left: 0 },
    colors: { body: "#151517", bezel: "#000000", edge: "#2f3033", accent: "#4a4b50" },
  },
  {
    id: "ipad-generic", family: "ipad", label: "iPad-style tablet", kind: "tablet", exactness: "generic", version: 1, authoredOn: AUTHORED,
    note: "Generic 3:4 tablet with even bezels. Not a specific iPad model.",
    outer: { width: 798, height: 1048 }, natural: "portrait", orientations: ["portrait", "landscape"], bezel: ins(24), outerRadius: 56, screenRadius: 34,
    camera: "dot", statusBarHeight: 0, safeArea: { top: 24, right: 0, bottom: 20, left: 0 },
    colors: { body: "#c9cbd0", bezel: "#0a0a0b", edge: "#a5a8ae", accent: "#6f7278" },
  },
  {
    id: "tablet-generic", family: "tablet", label: "Android-style tablet", kind: "tablet", exactness: "generic", version: 1, authoredOn: AUTHORED,
    note: "Generic 16:10 tablet. Not a specific device.",
    outer: { width: 772, height: 1204 }, natural: "portrait", orientations: ["portrait", "landscape"], bezel: ins(26), outerRadius: 36, screenRadius: 14,
    camera: "dot", statusBarHeight: 0, safeArea: { top: 24, right: 0, bottom: 24, left: 0 },
    colors: { body: "#2b2c30", bezel: "#050506", edge: "#45464b", accent: "#5a5b61" },
  },
  {
    id: "macbook-generic", family: "macbook", label: "MacBook-style laptop", kind: "laptop", exactness: "generic", version: 1, authoredOn: AUTHORED,
    note: "Generic aluminium-style laptop with a camera notch. Not a specific MacBook model.",
    outer: { width: 1180, height: 760 }, natural: "landscape", orientations: ["landscape"], bezel: { top: 24, right: 22, bottom: 26, left: 22 }, outerRadius: 26, screenRadius: 8,
    camera: "notch", statusBarHeight: 0, safeArea: NO_INSETS,
    colors: { body: "#b4b8bf", bezel: "#050506", edge: "#9ea2a9", accent: "#7d8188" },
    base: { kind: "laptop-base", height: 18, overhang: 0, lipWidth: 180, lipHeight: 6 },
  },
  {
    id: "laptop-generic", family: "laptop", label: "Laptop", kind: "laptop", exactness: "generic", version: 1, authoredOn: AUTHORED,
    note: "Generic laptop with a wider keyboard deck. Not a specific model.",
    outer: { width: 1200, height: 760 }, natural: "landscape", orientations: ["landscape"], bezel: { top: 22, right: 20, bottom: 26, left: 20 }, outerRadius: 22, screenRadius: 6,
    camera: "dot", statusBarHeight: 0, safeArea: NO_INSETS,
    colors: { body: "#2b2d31", bezel: "#040405", edge: "#44464b", accent: "#5a5c62" },
    base: { kind: "laptop-base", height: 26, overhang: 60, lipWidth: 200, lipHeight: 7 },
  },
  {
    id: "desktop-generic", family: "desktop", label: "Desktop monitor", kind: "desktop", exactness: "generic", version: 1, authoredOn: AUTHORED,
    note: "Generic 16:9 monitor on a stand. Not a specific display.",
    outer: { width: 1232, height: 731 }, natural: "landscape", orientations: ["landscape"], bezel: { top: 16, right: 16, bottom: 40, left: 16 }, outerRadius: 18, screenRadius: 2,
    camera: "none", statusBarHeight: 0, safeArea: NO_INSETS,
    colors: { body: "#d9dbde", bezel: "#0f0f11", edge: "#bfc2c7", accent: "#8b8f96" },
    base: { kind: "monitor-stand", height: 96, overhang: 0, neckWidth: 84, footWidth: 300, footHeight: 14 },
  },
  {
    id: "watch-generic", family: "apple-watch", label: "Smartwatch", kind: "watch", exactness: "generic", version: 1, authoredOn: AUTHORED,
    note: "Generic rounded-square smartwatch with crown and strap. Not a specific model.",
    outer: { width: 356, height: 426 }, natural: "portrait", orientations: ["portrait"], bezel: ins(22), outerRadius: 92, screenRadius: 72,
    camera: "none", statusBarHeight: 0, safeArea: NO_INSETS,
    colors: { body: "#2a2a2c", bezel: "#000000", edge: "#48484a", accent: "#636366" },
    crown: true, band: { height: 90, widthRatio: 0.78, color: "#2c2c2e" },
  },
  browser("chrome-window", "chrome", "Chromium-style window", {
    style: "chromium", tabStrip: 40, toolbar: 44, addressHeight: 30, addressRadius: 15, addressAlign: "left", addressWidthRatio: 1, tabWidth: 210, tabRadius: 9, windowRadius: 10, defaultControls: "mac",
    colors: { light: chromiumLight, dark: chromiumDark },
  }, "Approximate Chromium-style tab strip and toolbar drawn from public layout conventions."),
  browser("edge-window", "edge", "Edge-style window", {
    style: "edge", tabStrip: 40, toolbar: 44, addressHeight: 32, addressRadius: 16, addressAlign: "left", addressWidthRatio: 1, tabWidth: 220, tabRadius: 8, windowRadius: 8, defaultControls: "windows",
    colors: { light: edgeLight, dark: edgeDark },
  }, "Approximate Chromium-family window with Windows-style controls by default."),
  browser("safari-window", "safari", "Safari-style window", {
    style: "safari", tabStrip: 34, toolbar: 52, addressHeight: 32, addressRadius: 9, addressAlign: "center", addressWidthRatio: 0.42, tabWidth: 0, tabRadius: 0, windowRadius: 12, defaultControls: "mac",
    colors: { light: safariLight, dark: safariDark },
  }, "Approximate compact toolbar with a centred address field and optional tab bar."),
  browser("firefox-window", "firefox", "Firefox-style window", {
    style: "firefox", tabStrip: 42, toolbar: 44, addressHeight: 34, addressRadius: 8, addressAlign: "left", addressWidthRatio: 1, tabWidth: 200, tabRadius: 8, windowRadius: 10, defaultControls: "mac",
    colors: { light: firefoxLight, dark: firefoxDark },
  }, "Approximate floating-tab layout with a rounded address field."),
  browser("search-window", "google-search", "Search results window", {
    style: "search", tabStrip: 40, toolbar: 44, addressHeight: 30, addressRadius: 15, addressAlign: "left", addressWidthRatio: 1, tabWidth: 210, tabRadius: 9, windowRadius: 10, defaultControls: "mac",
    colors: { light: chromiumLight, dark: chromiumDark },
  }, "Generic browser window for a search-results screenshot. No search-engine logo or artwork is drawn; supply your own real screenshot for an exact look."),
];

const BY_ID = new Map(FRAME_PRESETS.map((p) => [p.id, p]));
export function getPreset(id: string): FramePreset {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`Unknown frame preset: ${id}`);
  return p;
}

const FAMILY_PRESETS: Record<ScreenshotFamily, string[]> = {
  iphone: ["iphone-generic"], android: ["android-generic"], ipad: ["ipad-generic"], tablet: ["tablet-generic"],
  macbook: ["macbook-generic"], laptop: ["laptop-generic"], desktop: ["desktop-generic"], "apple-watch": ["watch-generic"],
  chrome: ["chrome-window"], safari: ["safari-window"], firefox: ["firefox-window"], edge: ["edge-window"], "google-search": ["search-window"],
  "app-store": ["iphone-generic", "ipad-generic"], "google-play": ["android-generic", "tablet-generic"],
  generic: ["iphone-generic", "android-generic", "ipad-generic", "tablet-generic", "macbook-generic", "laptop-generic", "desktop-generic", "watch-generic", "chrome-window", "safari-window", "firefox-window", "edge-window"],
};
export function presetsForFamily(family: ScreenshotFamily): FramePreset[] { return FAMILY_PRESETS[family].map(getPreset); }
export function defaultPresetId(family: ScreenshotFamily): string { return FAMILY_PRESETS[family][0]; }

export interface ChromeOptions { showChrome: boolean; showTabs: boolean }
export function chromeHeight(chrome: BrowserChrome, opts: ChromeOptions): number {
  if (!opts.showChrome) return 0;
  return chrome.toolbar + (opts.showTabs ? chrome.tabStrip : 0);
}

const rotateInsetsCw = (i: Insets): Insets => ({ top: i.left, right: i.top, bottom: i.right, left: i.bottom });

export interface DeviceGeometry {
  outer: Size;            // lid / body size
  screen: Rect;           // screen (content) rect in device-local coordinates, origin = outer top-left
  bounds: Size;           // total drawing bounds including base, stand, band, crown
  origin: Point;          // where the outer rect's top-left sits inside bounds
  chromeHeight: number;
  statusBarHeight: number;
  safeArea: Insets;
}

/**
 * Device geometry for an orientation. Browser windows may pass `contentSize` so the
 * window is sized around the screenshot (a real window can be any size, so nothing
 * is cropped or letterboxed and no proportions are distorted).
 */
export function deviceGeometry(preset: FramePreset, orientation: Orientation, opts: ChromeOptions & { contentSize?: Size } = { showChrome: true, showTabs: true }): DeviceGeometry {
  const o: Orientation = preset.orientations.includes(orientation) ? orientation : preset.natural;
  const rotate = o !== preset.natural;
  let outer: Size = rotate ? { width: preset.outer.height, height: preset.outer.width } : { ...preset.outer };
  let bezel = rotate ? rotateInsetsCw(preset.bezel) : preset.bezel;
  const safeArea = rotate ? rotateInsetsCw(preset.safeArea) : preset.safeArea;
  let chromeH = 0;
  if (preset.kind === "browser" && preset.chrome) {
    chromeH = chromeHeight(preset.chrome, opts);
    if (opts.contentSize) outer = { width: Math.round(opts.contentSize.width), height: Math.round(opts.contentSize.height) + chromeH };
    bezel = { top: chromeH, right: 0, bottom: 0, left: 0 };
  }
  const screen: Rect = { x: bezel.left, y: bezel.top, width: outer.width - bezel.left - bezel.right, height: outer.height - bezel.top - bezel.bottom };
  const extra = { top: 0, right: 0, bottom: 0, left: 0 };
  if (preset.base) {
    if (preset.base.kind === "laptop-base") { extra.bottom = preset.base.height; extra.left = extra.right = preset.base.overhang; }
    else extra.bottom = preset.base.height;
  }
  if (preset.band && o === preset.natural) { extra.top = preset.band.height; extra.bottom = preset.band.height; }
  if (preset.crown && o === preset.natural) extra.right = 12;
  return {
    outer, screen, origin: { x: extra.left, y: extra.top },
    bounds: { width: outer.width + extra.left + extra.right, height: outer.height + extra.top + extra.bottom },
    chromeHeight: chromeH, statusBarHeight: preset.statusBarHeight, safeArea,
  };
}
