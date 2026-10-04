/**
 * Shared, dependency-free types for the Screenshot category. Everything in
 * src/lib/screenshots is pure TypeScript (no DOM, no React) except render.ts,
 * so it can be unit-tested with `node --experimental-strip-types --test`.
 */
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Insets { top: number; right: number; bottom: number; left: number }
export type Orientation = "portrait" | "landscape";

/** Minimal RGBA raster (compatible with the DOM ImageData shape). */
export interface Raster { width: number; height: number; data: Uint8ClampedArray }

export type Rgba = [number, number, number, number];

export type ScreenshotFamily =
  | "iphone" | "android" | "ipad" | "tablet" | "macbook" | "laptop" | "desktop" | "apple-watch"
  | "chrome" | "safari" | "firefox" | "edge" | "google-search" | "app-store" | "google-play" | "generic";

export type ScreenshotWorkflow = "frame" | "mockup" | "beautifier" | "presentation" | "collage" | "annotation" | "redaction" | "lockscreen";
