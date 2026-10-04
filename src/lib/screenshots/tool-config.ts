/**
 * Explicit typed configuration for every Screenshot-category tool. There is no
 * string-fragment dispatcher: a tool id resolves to a (family, workflow) pair, the
 * family selects frame presets / canvas presets, and the workflow selects panels
 * and defaults. All 115 catalog tools resolve here; unknown ids resolve to null.
 */
import type { ScreenshotFamily, ScreenshotWorkflow } from "./types.ts";
import { defaultPresetId, getPreset, presetsForFamily } from "./presets.ts";
import { NO_FRAME, SCENE_DEFAULT_BACKDROP, createScene, type Scene } from "./scene.ts";
import { DEFAULT_SHADOW } from "./shadow.ts";
import { getCanvasPreset } from "./store-presets.ts";

export type RealFamily = Exclude<ScreenshotFamily, "generic">;
export const FAMILIES: RealFamily[] = ["iphone", "android", "ipad", "tablet", "macbook", "laptop", "desktop", "apple-watch", "chrome", "safari", "firefox", "edge", "google-search", "app-store", "google-play"];
export const CORE_WORKFLOWS = ["frame", "mockup", "beautifier", "presentation", "collage", "annotation", "redaction"] as const;
export type CoreWorkflow = (typeof CORE_WORKFLOWS)[number];

export type PanelId = "crop" | "frame" | "layout" | "background" | "shadow" | "style" | "headline" | "annotate" | "redact" | "collage" | "lock" | "inspect";

export interface FamilyInfo { label: string; frameNoun: string; subject: string; group: "phone" | "tablet" | "computer" | "watch" | "browser" | "store"; note: string }
export const FAMILY_INFO: Record<ScreenshotFamily, FamilyInfo> = {
  iphone: { label: "iPhone", frameNoun: "an iPhone-style phone frame", subject: "an iPhone screenshot", group: "phone", note: "The frame is a generic modern-phone shape styled after iPhone proportions; it is not an exact model." },
  android: { label: "Android", frameNoun: "an Android-style phone frame", subject: "an Android screenshot", group: "phone", note: "The frame is a generic Android-style phone; it is not a specific device." },
  ipad: { label: "iPad", frameNoun: "an iPad-style tablet frame", subject: "an iPad screenshot", group: "tablet", note: "The frame is a generic 4:3 tablet shape; it is not an exact iPad model." },
  tablet: { label: "Tablet", frameNoun: "a generic tablet frame", subject: "a tablet screenshot", group: "tablet", note: "The frame is a generic 16:10 Android-style tablet." },
  macbook: { label: "MacBook", frameNoun: "a MacBook-style laptop frame", subject: "a MacBook screenshot", group: "computer", note: "The frame is a generic laptop with a camera notch; it is not an exact MacBook model." },
  laptop: { label: "Laptop", frameNoun: "a generic laptop frame", subject: "a laptop screenshot", group: "computer", note: "The frame is a generic laptop." },
  desktop: { label: "Desktop", frameNoun: "a desktop monitor frame", subject: "a desktop screenshot", group: "computer", note: "The frame is a generic 16:9 monitor on a stand." },
  "apple-watch": { label: "Apple Watch", frameNoun: "a smartwatch frame", subject: "an Apple Watch screenshot", group: "watch", note: "The frame is a generic rounded-square smartwatch; it is not an exact Apple Watch model." },
  chrome: { label: "Chrome", frameNoun: "a Chrome-style browser window", subject: "a Chrome browser screenshot", group: "browser", note: "The window is an approximation of a Chromium-style tab strip and toolbar. It never loads the address you type." },
  safari: { label: "Safari", frameNoun: "a Safari-style browser window", subject: "a Safari browser screenshot", group: "browser", note: "The window is an approximation of a compact toolbar with a centred address field. It never loads the address you type." },
  firefox: { label: "Firefox", frameNoun: "a Firefox-style browser window", subject: "a Firefox browser screenshot", group: "browser", note: "The window is an approximation of a floating-tab layout. It never loads the address you type." },
  edge: { label: "Edge", frameNoun: "an Edge-style browser window", subject: "an Edge browser screenshot", group: "browser", note: "The window is an approximation of a Chromium-family layout with Windows-style controls. It never loads the address you type." },
  "google-search": { label: "Google Search", frameNoun: "a browser window for a search-results screenshot", subject: "a Google Search results screenshot", group: "browser", note: "The window is a generic browser frame. No search-engine logo or artwork is drawn; use your own real screenshot for an exact result." },
  "app-store": { label: "App Store", frameNoun: "an App Store-ready iPhone or iPad frame", subject: "an App Store listing screenshot", group: "store", note: "Builds store-listing screenshots (device, headline, backdrop) at App Store Connect sizes. It does not reproduce the App Store app." },
  "google-play": { label: "Google Play", frameNoun: "a Google Play-ready phone or tablet frame", subject: "a Google Play listing screenshot", group: "store", note: "Builds store-listing screenshots (device, headline, backdrop) at Google Play sizes. It does not reproduce the Play Store app." },
  generic: { label: "Screenshot", frameNoun: "a device or browser frame", subject: "a screenshot", group: "phone", note: "Choose any generic frame or none." },
};

export interface WorkflowInfo { label: string; noun: string; panels: PanelId[]; view: "result" | "edit"; multi: boolean }
export const WORKFLOW_INFO: Record<ScreenshotWorkflow, WorkflowInfo> = {
  frame: { label: "Frame", noun: "Screenshot Frame", panels: ["crop", "frame", "inspect"], view: "result", multi: false },
  mockup: { label: "Mockup", noun: "Screenshot Mockup", panels: ["crop", "frame", "layout", "background", "shadow", "inspect"], view: "result", multi: false },
  beautifier: { label: "Beautifier", noun: "Screenshot Beautifier", panels: ["crop", "frame", "style", "layout", "background", "shadow", "inspect"], view: "result", multi: false },
  presentation: { label: "Presentation", noun: "Device Presentation", panels: ["crop", "frame", "layout", "headline", "background", "shadow", "inspect"], view: "result", multi: false },
  collage: { label: "Collage", noun: "Device Collage", panels: ["collage", "frame", "background", "shadow"], view: "result", multi: true },
  annotation: { label: "Annotation", noun: "Screenshot Annotation", panels: ["crop", "annotate", "frame", "inspect"], view: "edit", multi: false },
  redaction: { label: "Redaction", noun: "Screenshot Redaction", panels: ["crop", "redact", "frame", "inspect"], view: "edit", multi: false },
  lockscreen: { label: "Lock screen", noun: "Lock Screen Mockup", panels: ["frame", "lock", "layout", "background", "shadow"], view: "result", multi: false },
};

const SUFFIX: Record<CoreWorkflow, string> = { frame: "screenshot-frame", mockup: "screenshot-mockup", beautifier: "screenshot-beautifier", presentation: "device-presentation", collage: "device-collage", annotation: "screenshot-annotation", redaction: "screenshot-redaction" };
export const coreToolId = (family: RealFamily, workflow: CoreWorkflow) => `${family}-${SUFFIX[workflow]}`;

/** The 10 tools that already existed (with different id shapes) keep their ids and route through the same studio. */
export const LEGACY_TOOLS: Record<string, { family: ScreenshotFamily; workflow: ScreenshotWorkflow; presetId?: string }> = {
  "iphone-frame": { family: "iphone", workflow: "frame" }, "android-frame": { family: "android", workflow: "frame" }, "ipad-frame": { family: "ipad", workflow: "frame" },
  "macbook-frame": { family: "macbook", workflow: "frame" }, "watch-frame": { family: "apple-watch", workflow: "frame" },
  "browser-chrome-frame": { family: "chrome", workflow: "frame" }, "browser-safari-frame": { family: "safari", workflow: "frame" }, "browser-firefox-frame": { family: "firefox", workflow: "frame" },
  "lock-screen-mockup": { family: "generic", workflow: "lockscreen", presetId: "iphone-generic" },
  "screenshot-beautifier": { family: "generic", workflow: "beautifier", presetId: NO_FRAME },
};

export interface ScreenshotToolConfig { toolId: string; family: ScreenshotFamily; workflow: ScreenshotWorkflow; legacy: boolean; title: string; framePresetIds: string[]; defaultFrameId: string; info: FamilyInfo; workflowInfo: WorkflowInfo }

export function allScreenshotToolIds(): string[] {
  const ids: string[] = [];
  for (const f of FAMILIES) for (const w of CORE_WORKFLOWS) ids.push(coreToolId(f, w));
  return [...ids, ...Object.keys(LEGACY_TOOLS)];
}

const CORE_INDEX = new Map<string, { family: RealFamily; workflow: CoreWorkflow }>();
for (const f of FAMILIES) for (const w of CORE_WORKFLOWS) CORE_INDEX.set(coreToolId(f, w), { family: f, workflow: w });

export function resolveScreenshotTool(toolId: string): ScreenshotToolConfig | null {
  const legacy = LEGACY_TOOLS[toolId], core = CORE_INDEX.get(toolId);
  if (!legacy && !core) return null;
  const family = (legacy?.family ?? core?.family) as ScreenshotFamily, workflow = (legacy?.workflow ?? core?.workflow) as ScreenshotWorkflow;
  const presets = family === "generic" && workflow === "lockscreen" ? ["iphone-generic", "android-generic"] : presetsForFamily(family).map((p) => p.id);
  const defaultFrameId = legacy?.presetId ?? defaultFrameFor(family, workflow);
  const info = FAMILY_INFO[family], wi = WORKFLOW_INFO[workflow];
  return { toolId, family, workflow, legacy: !!legacy, title: legacy ? toolId : `${info.label} ${wi.noun}`, framePresetIds: presets, defaultFrameId, info, workflowInfo: wi };
}

export function getScreenshotTool(toolId: string): ScreenshotToolConfig {
  const c = resolveScreenshotTool(toolId);
  if (!c) throw new Error(`Unknown screenshot tool: ${toolId}`);
  return c;
}

function defaultFrameFor(family: ScreenshotFamily, workflow: ScreenshotWorkflow): string {
  if (workflow === "annotation" || workflow === "redaction") return NO_FRAME;
  return defaultPresetId(family);
}

/** Canvas preset used by fixed-canvas workflows (mockup / presentation / collage). */
export function defaultCanvasPresetId(family: ScreenshotFamily, frameId: string): string {
  if (family === "app-store") return "as-iphone-6-9-a";
  if (family === "google-play") return "gp-phone-1080x1920";
  if (frameId === NO_FRAME) return "landscape";
  const kind = getPreset(frameId).kind;
  return kind === "phone" || kind === "tablet" ? "portrait" : kind === "watch" ? "square" : "landscape";
}

const CLEAN_SHADOW = { ...DEFAULT_SHADOW, enabled: true };

/** Human description used by the catalog generator: accurate, no exactness claims. */
export function describeTool(cfg: ScreenshotToolConfig): string {
  const noun = cfg.info.frameNoun, subject = cfg.info.subject, tail = " Runs locally in your browser; nothing is uploaded.";
  switch (cfg.workflow) {
    case "frame": return cfg.legacy ? `Wrap ${subject} in ${noun} in one step and save it as PNG, JPEG, WebP or PDF.${tail}` : `Place ${subject} in ${noun}, with exact-pixel placement and PNG, JPEG, WebP or PDF export.${tail}`;
    case "mockup": return `Set ${subject} in ${noun} on a backdrop canvas with shadow, scale, rotation and placement controls.${tail}`;
    case "beautifier": return `Polish ${subject} with padding, rounded corners, shadow and a clean background${cfg.family === "generic" ? "" : `, with an optional ${noun.replace(/^an? /, "")}`}.${tail}`;
    case "presentation": return `Compose a presentation image from ${subject}: ${noun} with headline and subtitle on a backdrop, at custom${FAMILY_INFO[cfg.family].group === "store" ? " or store-listing" : ""} sizes.${tail}`;
    case "collage": return `Arrange several screenshots in ${noun.replace(/^an? /, "")}s with auto-layout and manual repositioning for ${subject.replace(/^an? /, "")} sets.${tail}`;
    case "annotation": return `Annotate ${subject} with arrows, shapes, text, step markers, callouts and spotlights that stay editable until export.${tail}`;
    case "redaction": return `Hide sensitive parts of ${subject} with solid fill, blur or pixelation; export permanently flattens every redaction.${tail}`;
    case "lockscreen": return `Place a wallpaper or screenshot in a phone frame with an editable lock-screen clock and notifications.${tail}`;
  }
}

/** Initial scene for a tool. Automatic first: each workflow opens with a strong result, every value stays adjustable. */
export function buildInitialScene(cfg: ScreenshotToolConfig, now: Date = new Date()): Scene {
  const { family, workflow, defaultFrameId: frame } = cfg;
  const base = { toolId: cfg.toolId, family, workflow, presetId: frame };
  const fixedCanvas = { mode: "preset" as const, presetId: defaultCanvasPresetId(family, frame) };
  const cp = getCanvasPreset(fixedCanvas.presetId);
  const canvas = { ...fixedCanvas, width: cp?.width ?? 1080, height: cp?.height ?? 1350 };
  switch (workflow) {
    case "frame": return createScene({ ...base });
    case "mockup": return createScene({ ...base, canvas, background: SCENE_DEFAULT_BACKDROP("clean-light"), shadow: CLEAN_SHADOW, padding: 96 });
    case "beautifier": return createScene({ ...base, background: SCENE_DEFAULT_BACKDROP("soft-blue"), shadow: CLEAN_SHADOW, padding: 72, style: { radius: 24 } });
    case "presentation": return createScene({ ...base, canvas, background: SCENE_DEFAULT_BACKDROP("clean-light"), shadow: CLEAN_SHADOW, padding: 72, headline: { enabled: true } });
    case "collage": return createScene({ ...base, canvas: { mode: "custom", presetId: "landscape", width: 1920, height: 1080 }, background: SCENE_DEFAULT_BACKDROP("clean-light"), shadow: CLEAN_SHADOW, padding: 72 });
    case "annotation": case "redaction": return createScene({ ...base });
    case "lockscreen": {
      const s = createScene({ ...base, canvas: { mode: "preset", presetId: "tall", width: 1080, height: 1920 }, background: SCENE_DEFAULT_BACKDROP("clean-light"), shadow: CLEAN_SHADOW, padding: 96 });
      const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(now).replace(/\s?(AM|PM)$/i, "");
      const date = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);
      return { ...s, lock: { ...s.lock, time, date } };
    }
  }
}
