import Ajv2020 from "ajv/dist/2020.js";
import sceneSchema from "../../../apps/shared/scene-studio-v1.schema.json" with { type: "json" };

export type Vector3 = [number, number, number];
export type SceneTransformProperty = "position" | "rotation" | "scale";

export interface SceneObject {
  id: string;
  type: string;
  name: string;
  style: string;
  asset: string;
  text: string;
  color: string;
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  fontSize: number;
  [key: string]: unknown;
}

export interface SceneKeyframe {
  time: number;
  value: Vector3;
}

export interface SceneAnimation {
  target: string;
  property: SceneTransformProperty;
  easing: "linear" | "easeIn" | "easeOut" | "easeInOut";
  keyframes: SceneKeyframe[];
}

export interface SceneDocument {
  version: "1.0";
  settings: {
    width: number;
    height: number;
    fps: number;
    duration: number;
    background: string;
    seed: number;
    quality: "low" | "balanced" | "high";
  };
  camera: { position: Vector3; lookAt: Vector3; fieldOfView: number };
  lights: Array<{ type: string; intensity: number; color: string; position: Vector3 }>;
  objects: SceneObject[];
  animations: SceneAnimation[];
  speakers: Record<string, { voiceId: string; color: string; [key: string]: unknown }>;
  dialogue: Array<{ speaker: string; text: string; start: number; duration: number }>;
  captions: { style: string; placement: string; highlightColor: string; safeMargin: number };
  export: { format: "mp4" | "webm"; quality: "low" | "balanced" | "high" };
  [key: string]: unknown;
}

export interface SceneIssue {
  path: string;
  problem: string;
  fixHint: string;
}

export interface SceneValidationSuccess {
  ok: true;
  scene: SceneDocument;
  warnings: string[];
}

export interface SceneValidationFailure {
  ok: false;
  error: SceneIssue;
}

export type SceneValidationResult = SceneValidationSuccess | SceneValidationFailure;

export const MAX_SCENE_JSON_BYTES = 1_000_000;
const ajv = new Ajv2020({ allErrors: true, strict: false, useDefaults: "empty" });
const validateAgainstSchema = ajv.compile(sceneSchema as object);

function pathFromPointer(pointer: string): string {
  if (!pointer) return "$";
  return "$" + pointer.split("/").slice(1).map((segment) => {
    const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    return /^\d+$/.test(key) ? `[${key}]` : `.${key}`;
  }).join("");
}

function hintForKeyword(keyword: string, message: string): string {
  if (keyword === "required") return "Add the missing field shown in the error, then try Preview again.";
  if (keyword === "enum" || keyword === "const") return "Use one of the listed values and keep the field name unchanged.";
  if (keyword === "type") return "Use the expected JSON value type (for example, a number, string, array, or object).";
  if (["minimum", "maximum", "exclusiveMinimum"].includes(keyword)) return "Choose a value within the allowed range in the Scene Studio instructions.";
  if (["minItems", "maxItems"].includes(keyword)) return "Check the number of values; a 3D position, rotation, or scale needs exactly three numbers.";
  if (keyword === "pattern") return "Use a six-digit hex color such as #f4b942.";
  if (message.includes("duplicate")) return "Give each object a different id.";
  return "Ask your chatbot to fix this field using the path and rule above, then paste its JSON reply here.";
}

function dereference(schema: Record<string, unknown>): Record<string, unknown> {
  const ref = schema.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/$defs/")) return schema;
  const name = ref.slice("#/$defs/".length);
  const definitions = (sceneSchema as { $defs?: Record<string, unknown> }).$defs;
  const target = definitions?.[name];
  if (!target || typeof target !== "object") return schema;
  const { $ref: _ignored, ...siblings } = schema;
  return { ...(target as Record<string, unknown>), ...siblings };
}

function collectUnknownFieldWarnings(value: unknown, schema: Record<string, unknown>, path = "$", warnings: string[] = []): string[] {
  const resolved = dereference(schema);
  if (Array.isArray(value)) {
    const itemSchema = resolved.items;
    if (itemSchema && typeof itemSchema === "object") {
      value.forEach((item, index) => collectUnknownFieldWarnings(item, itemSchema as Record<string, unknown>, `${path}[${index}]`, warnings));
    }
    return warnings;
  }
  if (!value || typeof value !== "object") return warnings;

  const record = value as Record<string, unknown>;
  const properties = (resolved.properties && typeof resolved.properties === "object")
    ? resolved.properties as Record<string, Record<string, unknown>>
    : {};
  const additionalProperties = resolved.additionalProperties;
  for (const [key, child] of Object.entries(record)) {
    const childSchema = properties[key];
    if (childSchema) collectUnknownFieldWarnings(child, childSchema, `${path}.${key}`, warnings);
    else if (additionalProperties && typeof additionalProperties === "object") {
      collectUnknownFieldWarnings(child, additionalProperties as Record<string, unknown>, `${path}.${key}`, warnings);
    } else {
      warnings.push(`Ignored unknown field ${path}.${key}; remove it or check the Scene Studio instructions.`);
    }
  }
  return warnings;
}

function fail(path: string, problem: string, fixHint: string): SceneValidationFailure {
  return { ok: false, error: { path, problem, fixHint } };
}

/** Validate a declarative scene; never executes text or code from the input. */
export function validateScene(input: unknown): SceneValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fail("$", "The scene must be a JSON object.", "Paste a complete scene JSON object beginning with { and ending with }.");
  }

  let candidate: unknown;
  try {
    candidate = structuredClone(input);
  } catch {
    return fail("$", "The scene could not be copied safely.", "Paste plain JSON values only; do not include functions, circular data, or executable code.");
  }

  if (!validateAgainstSchema(candidate)) {
    const issue = validateAgainstSchema.errors?.[0];
    if (!issue) return fail("$", "The scene did not match the supported format.", "Ask your chatbot to return only valid Scene Studio JSON.");
    const missingProperty = issue.keyword === "required"
      ? (issue.params as { missingProperty?: string }).missingProperty
      : undefined;
    const parentPath = pathFromPointer(issue.instancePath);
    const path = missingProperty
      ? (/^[A-Za-z_$][\w$]*$/.test(missingProperty) ? `${parentPath}.${missingProperty}` : `${parentPath}[${JSON.stringify(missingProperty)}]`)
      : parentPath;
    const problem = issue.message ?? `The value does not meet the ${issue.keyword} rule.`;
    return fail(path, problem, hintForKeyword(issue.keyword, problem));
  }

  const scene = candidate as SceneDocument;
  const objectIndex = new Map<string, number>();
  for (const [index, object] of scene.objects.entries()) {
    if (objectIndex.has(object.id)) {
      return fail(`$.objects[${index}].id`, `The id “${object.id}” is used by more than one object.`, "Give each object a unique id, then update any animation target that refers to it.");
    }
    objectIndex.set(object.id, index);
    if (object.scale.some((component) => component <= 0)) {
      return fail(`$.objects[${index}].scale`, "Scale values must be greater than zero.", "Replace zero or negative scale values with a small positive number such as 1.");
    }
    if (/^(?:https?:)?\/\//i.test(object.asset) || object.asset.split(/[\\/]/).includes("..")) {
      return fail(`$.objects[${index}].asset`, "Scene assets must come from the project bundle or built-in library, not a web address or parent-folder path.", "Use a bundled file name or library asset name instead; Scene Studio never downloads URLs from scene JSON.");
    }
  }

  for (const [index, animation] of scene.animations.entries()) {
    if (!objectIndex.has(animation.target)) {
      return fail(`$.animations[${index}].target`, `No object has the id “${animation.target}”.`, "Set target to an existing object id from the objects list.");
    }
    let previousTime = -1;
    for (const [keyframeIndex, keyframe] of animation.keyframes.entries()) {
      if (keyframe.time > scene.settings.duration) {
        return fail(`$.animations[${index}].keyframes[${keyframeIndex}].time`, "This keyframe is after the scene ends.", "Move the keyframe to a time at or before settings.duration.");
      }
      if (keyframe.time <= previousTime) {
        return fail(`$.animations[${index}].keyframes[${keyframeIndex}].time`, "Keyframes must be in strictly increasing time order.", "Sort the keyframes by time and remove any duplicate times.");
      }
      previousTime = keyframe.time;
    }
  }

  return {
    ok: true,
    scene,
    warnings: collectUnknownFieldWarnings(scene, sceneSchema as Record<string, unknown>).slice(0, 30),
  };
}

export function parseSceneJson(source: string): SceneValidationResult {
  if (new TextEncoder().encode(source).byteLength > MAX_SCENE_JSON_BYTES) {
    return fail("$", "This scene JSON is too large to preview.", "Keep the pasted scene under 1 MB and put model or image files in the project bundle.");
  }
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    return fail("$", "This is not valid JSON yet.", "Ask your chatbot to return only complete Scene Studio JSON, without Markdown fences or comments.");
  }
  return validateScene(input);
}

export function frameTime(frameIndex: number, fps: number): number {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || !Number.isFinite(fps) || fps <= 0) return 0;
  return frameIndex / fps;
}

function applyEasing(progress: number, easing: SceneAnimation["easing"]): number {
  if (easing === "easeIn") return progress * progress;
  if (easing === "easeOut") return 1 - (1 - progress) * (1 - progress);
  if (easing === "easeInOut") return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  return progress;
}

export function valueAtTime(animation: SceneAnimation, time: number): Vector3 {
  const frames = animation.keyframes;
  if (frames.length === 1 || time <= frames[0].time) return [...frames[0].value] as Vector3;
  const last = frames[frames.length - 1];
  if (time >= last.time) return [...last.value] as Vector3;
  const rightIndex = frames.findIndex((frame) => frame.time >= time);
  const left = frames[rightIndex - 1];
  const right = frames[rightIndex];
  const fraction = applyEasing((time - left.time) / (right.time - left.time), animation.easing);
  return left.value.map((value, index) => value + (right.value[index] - value) * fraction) as Vector3;
}
