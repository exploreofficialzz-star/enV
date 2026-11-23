/**
 * Everything the Scene Studio screen decides that is not drawing: turning pasted text into "is this usable, what is
 * wrong, what will stand in for what", sizes for the preview, which frame to show at a moment, names for downloads.
 * Pure and tested here, so the React screen only has to show it.
 */
import { frameCount } from "./animation.ts";
import { estimateSpokenLines } from "./captions.ts";
import type { SpokenLine } from "./captions.ts";
import { needsTransparent3D } from "./compose2d.ts";
import { planObjects } from "./object-plan.ts";
import type { ObjectPlan } from "./object-plan.ts";
import { checkUploads } from "./project.ts";
import { checkAgainstRegistry } from "./registry.ts";
import type { LibraryLookup } from "./registry.ts";
import { EXAMPLE_2D, EXAMPLE_3D } from "./prompt.ts";
import type { Scene, SceneIssue } from "./types.ts";
import { parseScene } from "./validate.ts";
import { checkSpeech } from "./voice.ts";

export interface AnalysisEnv {
  library?: LibraryLookup;
  /** Names of the files the person has added to the project. */
  uploads: ReadonlySet<string>;
}

export interface SceneAnalysis {
  /** The scene can be previewed and exported. */
  ok: boolean;
  scene: Scene | null;
  /** Errors first, then warnings, each in the order they were found. */
  issues: SceneIssue[];
  errors: number;
  warnings: number;
  /** What will be built for each object (empty when the scene is not usable). */
  plans: ObjectPlan[];
  /** Plain-words reasons something is shown as a stand-in. */
  notes: string[];
  /** Dialogue with estimated timing. */
  spokenLines: SpokenLine[];
  has3d: boolean;
  frameCount: number;
  /** Something is drawn behind the 3D picture, so the 3D picture must be see-through. */
  seeThrough3d: boolean;
}

const EMPTY: Omit<SceneAnalysis, "issues" | "errors" | "warnings" | "ok"> = { scene: null, plans: [], notes: [], spokenLines: [], has3d: false, frameCount: 0, seeThrough3d: false };

export function analyseScene(text: string, env: AnalysisEnv): SceneAnalysis {
  const parsed = parseScene(text);
  const issues: SceneIssue[] = [...parsed.issues];
  if (!parsed.ok || !parsed.scene) {
    const errors = issues.filter((i) => i.severity === "error").length;
    return { ...EMPTY, ok: false, issues: sorted(issues), errors, warnings: issues.length - errors };
  }
  const scene = parsed.scene;
  issues.push(...checkAgainstRegistry(scene, env.library));
  issues.push(...checkUploads(scene, env.uploads));
  const spokenLines = estimateSpokenLines(scene.dialogue, scene.voices);
  issues.push(...checkSpeech(scene, spokenLines));
  const plans = planObjects(scene, { library: env.library, uploads: env.uploads });
  const ordered = sorted(issues);
  const errors = ordered.filter((i) => i.severity === "error").length;
  return {
    ok: errors === 0,
    scene,
    issues: ordered,
    errors,
    warnings: ordered.length - errors,
    plans,
    notes: plans.flatMap((p) => p.notes),
    spokenLines,
    has3d: scene.objects.length > 0,
    frameCount: frameCount(scene.settings),
    seeThrough3d: needsTransparent3D(scene),
  };
}

const sorted = (issues: SceneIssue[]): SceneIssue[] => [...issues.filter((i) => i.severity === "error"), ...issues.filter((i) => i.severity !== "error")];

/** The two ready-made examples the person can load to see how a scene looks. */
export const EXAMPLE_SCENES = {
  "3d": JSON.stringify(EXAMPLE_3D, null, 2),
  "2d": JSON.stringify(EXAMPLE_2D, null, 2),
} as const;

/** Preview picture size: as wide as the space allows (never larger than the real video), keeping the scene's shape. */
export function previewSize(sceneWidth: number, sceneHeight: number, availableWidth: number): { width: number; height: number; scale: number } {
  const scale = Math.min(1, Math.max(0.05, availableWidth / sceneWidth));
  return { width: Math.max(2, Math.round(sceneWidth * scale)), height: Math.max(2, Math.round(sceneHeight * scale)), scale };
}

/** Which frame to show `elapsedSeconds` after playback started; playback loops. */
export function frameAtElapsed(elapsedSeconds: number, fps: number, frames: number): number {
  if (!(frames > 0) || !(fps > 0) || !Number.isFinite(elapsedSeconds)) return 0;
  return Math.floor(Math.max(0, elapsedSeconds) * fps) % frames;
}

/** `m:ss.s` for the time display. */
export function timeLabel(seconds: number): string {
  const s = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

/** A safe download name: letters, numbers and dashes only. */
export function downloadName(name: string | undefined, extension: string): string {
  const base = (name ?? "").normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).toLowerCase();
  return `${base || "scene"}.${extension}`;
}

export function fileSizeLabel(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/** Word count of issues for the summary line ("2 problems and 3 notes"). */
export function issueSummary(errors: number, warnings: number): string {
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (errors === 0 && warnings === 0) return "No problems";
  if (errors === 0) return part(warnings, "note", "notes");
  if (warnings === 0) return part(errors, "problem", "problems");
  return `${part(errors, "problem", "problems")} and ${part(warnings, "note", "notes")}`;
}

/** Notes about stand-ins that no issue already explains (an issue and a note about the same file would say it twice). */
export function extraNotes(a: Pick<SceneAnalysis, "notes" | "issues">): string[] {
  return a.notes.filter((note) => {
    const quoted = /"([^"]+)"/.exec(note)?.[1];
    return !quoted || !a.issues.some((i) => i.message.includes(`"${quoted}"`));
  });
}
