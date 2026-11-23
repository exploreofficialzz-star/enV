import type { ParamValue, Scene, SceneIssue } from "./types.ts";

/**
 * Builder registry — the single source of truth for which `type` values a scene may use.
 * The chatbot prompt, the validator warnings, the preview and the export all read from here, and
 * Kotlin/Swift mirror the type names. Adding a builder means adding one entry; nothing else lists types.
 */
export type ParamSpec =
  | { name: string; kind: "number"; min: number; max: number; default: number; description: string }
  | { name: string; kind: "boolean"; default: boolean; description: string }
  | { name: string; kind: "choice"; choices: readonly string[]; default: string; description: string }
  | { name: string; kind: "color"; default: string; description: string };

export type BuilderCategory = "shape" | "prop" | "character" | "effect" | "environment" | "text" | "helper";

export interface BuilderSpec {
  type: string;
  category: BuilderCategory;
  description: string;
  /** Top-level object fields this builder reads, besides id/type/position/rotation/scale. */
  uses: readonly ("size" | "color" | "material" | "asset" | "text" | "style" | "clip")[];
  params: readonly ParamSpec[];
  /** Animation clip names the builder understands without any file. */
  clips?: readonly string[];
}

const n = (name: string, min: number, max: number, def: number, description: string): ParamSpec => ({ name, kind: "number", min, max, default: def, description });
const choice = (name: string, choices: readonly string[], def: string, description: string): ParamSpec => ({ name, kind: "choice", choices, default: def, description });

/** Procedural clips the built-in (code-built) character plays. Rigged GLB characters bring their own. */
export const BUILT_IN_CLIPS = ["Idle", "Walk", "Run", "Wave", "Talk", "Swim", "Fall", "Sit"] as const;

const shape = (type: string, description: string): BuilderSpec => ({ type, category: "shape", description, uses: ["size", "color", "material"], params: [] });
const emitter = (type: string, description: string, extra: ParamSpec[] = []): BuilderSpec => ({
  type,
  category: "effect",
  description,
  uses: ["color"],
  params: [n("intensity", 0, 1, 0.5, "How much is emitted, 0 to 1"), n("area", 0.5, 100, 10, "Width of the emitting area in metres"), ...extra],
});

export const BUILDERS: readonly BuilderSpec[] = [
  shape("box", "A box. size is [width, height, depth] in metres."),
  shape("sphere", "A sphere. size is the diameter on each axis."),
  shape("cylinder", "A cylinder standing along Y. size is [diameter, height, diameter]."),
  shape("cone", "A cone pointing up. size is [diameter, height, diameter]."),
  shape("capsule", "A pill shape standing along Y."),
  shape("plane", "A flat sheet that faces forward (+Z) like a wall. Rotate [-90, 0, 0] to lay it down as a floor that faces up. size is [width, height, 1]."),
  { type: "torus", category: "shape", description: "A ring (donut shape).", uses: ["size", "color", "material"], params: [n("tube", 0.02, 1, 0.2, "Thickness of the ring as a fraction of its size")] },
  {
    type: "pipe",
    category: "shape",
    description: "A hollow tube you can look into (drain pipe, tunnel, sewer). Lies along the Z axis.",
    uses: ["color", "material"],
    params: [n("radius", 0.1, 20, 1, "Inner radius in metres"), n("length", 0.5, 200, 10, "Length in metres"), n("wall", 0.01, 2, 0.1, "Wall thickness in metres")],
  },
  { type: "tree", category: "prop", description: "A tree built from simple shapes, or a library model when asset is set.", uses: ["asset", "color"], params: [choice("variant", ["oak", "pine", "palm"], "oak", "Tree kind"), n("height", 1, 30, 5, "Height in metres")] },
  { type: "bush", category: "prop", description: "A rounded bush.", uses: ["size", "color"], params: [] },
  { type: "rock", category: "prop", description: "A rough rock.", uses: ["size", "color"], params: [n("roughness", 0, 1, 0.5, "How jagged the rock is")] },
  { type: "house", category: "prop", description: "A simple house or building block.", uses: ["size", "color"], params: [n("floors", 1, 10, 1, "Number of floors"), choice("roof", ["flat", "gable"], "gable", "Roof shape")] },
  { type: "road", category: "prop", description: "A road lying along Z with lane markings.", uses: ["color"], params: [n("length", 1, 500, 50, "Length in metres"), n("width", 1, 30, 6, "Width in metres"), n("lanes", 0, 6, 2, "Number of lanes")] },
  { type: "streetlamp", category: "prop", description: "A street lamp that casts warm light.", uses: ["color"], params: [n("height", 2, 12, 5, "Pole height in metres"), n("lightIntensity", 0, 10, 2, "Brightness of the light it casts")] },
  { type: "car", category: "prop", description: "A simple car.", uses: ["color"], params: [choice("body", ["sedan", "suv", "truck"], "sedan", "Car body")] },
  { type: "crate", category: "prop", description: "A wooden crate.", uses: ["size"], params: [] },
  {
    type: "character",
    category: "character",
    description: "A person. Without an asset it is built from simple shapes and plays the built-in clips; with a rigged library or uploaded model it plays that model's own clips.",
    uses: ["asset", "style", "color", "clip"],
    params: [n("height", 0.5, 3, 1.75, "Height in metres")],
    clips: BUILT_IN_CLIPS,
  },
  { type: "asset", category: "character", description: "Any model from the library or an uploaded .glb file. Needs the asset field.", uses: ["asset", "clip"], params: [n("fitHeight", 0, 100, 0, "If above 0, scale the model to this height in metres")] },
  { type: "water", category: "environment", description: "A moving water surface for floods, seas and pools. Its size is [width, anything, depth] in metres (default 20 by 20); the middle number is ignored.", uses: ["size", "color", "material"], params: [n("waveHeight", 0, 2, 0.1, "Height of the waves in metres"), n("waveSpeed", 0, 5, 1, "How fast the waves move"), n("flow", 0, 5, 0, "Sideways current speed")] },
  emitter("rain", "Falling rain. position is the centre of the top of the rain.", [n("height", 1, 50, 10, "How far the rain falls in metres")]),
  emitter("snow", "Falling snow.", [n("height", 1, 50, 10, "How far the snow falls in metres")]),
  emitter("smoke", "Rising smoke.", [n("height", 0.5, 30, 5, "How high the smoke rises in metres")]),
  emitter("fire", "A flickering fire.", [n("height", 0.2, 10, 1.5, "Flame height in metres")]),
  emitter("sparks", "Flying sparks."),
  emitter("dust", "Floating dust specks."),
  emitter("splash", "Water splashing up from the surface.", [n("height", 0.1, 5, 1, "Splash height in metres")]),
  {
    type: "text",
    category: "text",
    description: "Text standing in the 3D world. For titles on screen use a 2D layer instead.",
    uses: ["text", "color"],
    params: [n("depth", 0, 1, 0.1, "Extrusion depth in metres"), choice("font", ["sans", "serif", "display", "mono"], "sans", "Typeface"), n("height", 0.1, 20, 1, "Letter height in metres")],
  },
  { type: "billboard", category: "text", description: "An image on a flat sheet that always faces the camera.", uses: ["asset", "size"], params: [] },
  { type: "group", category: "helper", description: "An empty point used to move several objects together (set it as their parent).", uses: [], params: [] },
];

export const BUILDER_TYPES: readonly string[] = BUILDERS.map((b) => b.type);
const byType = new Map(BUILDERS.map((b) => [b.type, b]));
export const getBuilder = (type: string): BuilderSpec | undefined => byType.get(type);

/** Type to fall back to when a scene names a type that does not exist: the cheapest honest placeholder. */
export const FALLBACK_TYPE = "box";

/** Clamp a parameter into its spec range; unknown or wrongly typed values give the default. */
export function resolveParam(spec: ParamSpec, value: ParamValue | undefined): ParamValue {
  if (value === undefined) return spec.default;
  switch (spec.kind) {
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? Math.min(spec.max, Math.max(spec.min, value)) : spec.default;
    case "boolean":
      return typeof value === "boolean" ? value : spec.default;
    case "choice":
      return typeof value === "string" && spec.choices.includes(value) ? value : spec.default;
    case "color":
      return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : spec.default;
  }
}

/** Every parameter of a builder with defaults filled in and values clamped. */
export function resolveParams(type: string, given: Record<string, ParamValue>): Record<string, ParamValue> {
  const spec = byType.get(type) ?? byType.get(FALLBACK_TYPE)!;
  const out: Record<string, ParamValue> = {};
  for (const p of spec.params) out[p.name] = resolveParam(p, given[p.name]);
  return out;
}

export interface LibraryLookup {
  /** "bundled" assets can load; "planned" ones are listed but not yet shipped. Missing ids are unknown. */
  statusOf(assetName: string): "bundled" | "planned" | "unknown";
}

/**
 * Registry-aware warnings for a validated scene: unknown types, unknown or out-of-range parameters,
 * clips that a built-in character cannot play, and library assets that are not (yet) bundled.
 * Warnings never block: the build falls back to a placeholder and says so.
 */
export function checkAgainstRegistry(scene: Scene, library?: LibraryLookup): SceneIssue[] {
  const issues: SceneIssue[] = [];
  const warn = (code: string, path: string, message: string, fix: string) => issues.push({ severity: "warning", code, path, message, fix });
  scene.objects.forEach((o, i) => {
    const path = `$.objects[${i}]`;
    const spec = byType.get(o.type);
    if (!spec) {
      warn("unknown-type", `${path}.type`, `The type "${o.type}" is not built in, so a plain box stands in for "${o.id}".`, `Use one of the supported types: ${BUILDER_TYPES.join(", ")}.`);
      return;
    }
    for (const [name, value] of Object.entries(o.params)) {
      const p = spec.params.find((x) => x.name === name);
      if (!p) {
        warn("unknown-param", `${path}.params.${name}`, `"${name}" is not a setting of "${o.type}", so it was ignored.`, `Settings for "${o.type}": ${spec.params.length ? spec.params.map((x) => x.name).join(", ") : "none"}.`);
      } else if (resolveParam(p, value) !== value) {
        warn("param-adjusted", `${path}.params.${name}`, `"${name}" was ${JSON.stringify(value)}, which is outside what "${o.type}" accepts, so ${JSON.stringify(resolveParam(p, value))} is used.`, p.kind === "number" ? `Use a value from ${p.min} to ${p.max}.` : `Use one of: ${p.kind === "choice" ? p.choices.join(", ") : "a valid value"}.`);
      }
    }
    if (o.clip !== undefined && spec.clips && !o.asset && !spec.clips.includes(o.clip)) {
      warn("unknown-clip", `${path}.clip`, `The built-in "${o.type}" has no clip called "${o.clip}".`, `Use one of: ${spec.clips.join(", ")}, or give the object a rigged model in "asset".`);
    }
    if (o.type === "asset" && !o.asset) warn("missing-asset", `${path}.asset`, `Object "${o.id}" has type "asset" but no "asset" name, so it shows as a placeholder.`, `Set "asset" to a library model or an uploaded file name.`);
    if (o.asset && library && o.asset.startsWith("library/")) {
      const st = library.statusOf(o.asset);
      if (st === "unknown") warn("unknown-library-asset", `${path}.asset`, `"${o.asset}" is not in the asset library, so a placeholder is shown.`, `Pick a name from the library list in the AI instructions.`);
      else if (st === "planned") warn("library-asset-not-bundled", `${path}.asset`, `"${o.asset}" is planned but not bundled yet, so a placeholder is shown.`, `Use a bundled asset, or upload your own model.`);
    }
  });
  return issues;
}
