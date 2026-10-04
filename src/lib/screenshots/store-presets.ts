/**
 * Canvas / store export presets with source URLs and verification dates
 * (requirement 54). Only sizes that were checked against a published
 * specification are listed as store sizes; everything else is a plain generic
 * canvas. Store rules change, so `lastVerified` is data, not a guarantee.
 */
import type { ScreenshotFamily } from "./types.ts";

export type StoreId = "app-store" | "google-play";
export interface CanvasPreset {
  id: string; label: string; width: number; height: number;
  group: "generic" | StoreId;
  /** Store uploads must not contain transparency. */
  alphaAllowed: boolean;
  sourceUrl?: string; lastVerified?: string;
  verification?: "official-page" | "secondary-sources";
  note?: string;
}

const APPLE = "https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/";
const PLAY = "https://support.google.com/googleplay/android-developer/answer/9866151";
const VERIFIED = "2026-09-30";

const apple = (id: string, label: string, width: number, height: number, verification: "official-page" | "secondary-sources"): CanvasPreset => ({
  id, label, width, height, group: "app-store", alphaAllowed: false, sourceUrl: APPLE, lastVerified: VERIFIED, verification,
});

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: "square", label: "Square 1080 × 1080", width: 1080, height: 1080, group: "generic", alphaAllowed: true },
  { id: "portrait", label: "Portrait 1080 × 1350", width: 1080, height: 1350, group: "generic", alphaAllowed: true },
  { id: "tall", label: "Tall 1080 × 1920", width: 1080, height: 1920, group: "generic", alphaAllowed: true },
  { id: "landscape", label: "Landscape 1920 × 1080", width: 1920, height: 1080, group: "generic", alphaAllowed: true },
  { id: "desktop", label: "Desktop 1440 × 900", width: 1440, height: 900, group: "generic", alphaAllowed: true },
  apple("as-iphone-6-9-a", "App Store iPhone 6.9″ · 1320 × 2868", 1320, 2868, "official-page"),
  apple("as-iphone-6-9-b", "App Store iPhone 6.9″ · 1290 × 2796", 1290, 2796, "official-page"),
  apple("as-iphone-6-9-c", "App Store iPhone 6.9″ · 1260 × 2736", 1260, 2736, "official-page"),
  apple("as-iphone-6-5-a", "App Store iPhone 6.5″ · 1284 × 2778", 1284, 2778, "official-page"),
  apple("as-iphone-6-5-b", "App Store iPhone 6.5″ · 1242 × 2688", 1242, 2688, "official-page"),
  apple("as-iphone-6-3-a", "App Store iPhone 6.3″ · 1206 × 2622", 1206, 2622, "official-page"),
  apple("as-iphone-6-3-b", "App Store iPhone 6.3″ · 1179 × 2556", 1179, 2556, "official-page"),
  apple("as-ipad-13-a", "App Store iPad 13″ · 2064 × 2752", 2064, 2752, "secondary-sources"),
  apple("as-ipad-13-b", "App Store iPad 13″ · 2048 × 2732", 2048, 2732, "secondary-sources"),
  { id: "gp-phone-1080x1920", label: "Google Play phone · 1080 × 1920", width: 1080, height: 1920, group: "google-play", alphaAllowed: false, sourceUrl: PLAY, lastVerified: VERIFIED, verification: "secondary-sources", note: "Play accepts a size range, not a fixed size; 1080 × 1920 is a common artboard." },
  { id: "gp-feature-1024x500", label: "Google Play feature graphic · 1024 × 500", width: 1024, height: 500, group: "google-play", alphaAllowed: false, sourceUrl: PLAY, lastVerified: VERIFIED, verification: "secondary-sources" },
];

export function canvasPresetsForFamily(family: ScreenshotFamily): CanvasPreset[] {
  return CANVAS_PRESETS.filter((p) => p.group === "generic" || p.group === family);
}
export function getCanvasPreset(id: string): CanvasPreset | undefined { return CANVAS_PRESETS.find((p) => p.id === id); }

/**
 * Non-blocking warnings for a store-bound canvas. Apple requires an exact size and
 * no transparency; Google Play accepts 320–3840 px per side with a long side of at
 * most twice the short side, and no transparency.
 */
export function storeConstraintWarnings(group: "generic" | StoreId, width: number, height: number, hasAlpha: boolean): string[] {
  const out: string[] = [];
  if (group === "generic") return out;
  if (hasAlpha) out.push("Store uploads cannot contain transparency; transparent areas will be flattened onto a solid colour.");
  if (group === "google-play") {
    const short = Math.min(width, height), long = Math.max(width, height);
    if (short < 320 || long > 3840) out.push("Google Play screenshots must be between 320 and 3840 px per side.");
    if (long > short * 2) out.push("Google Play requires the long side to be at most twice the short side.");
  }
  return out;
}
