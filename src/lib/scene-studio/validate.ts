import {
  CAMERA_PROPERTIES,
  CAMERA_TARGET,
  CAMERA_TYPES,
  CAPTION_PLACEMENTS,
  CAPTION_STYLES,
  EASINGS,
  ENVIRONMENT_PRESETS,
  EXPORT_FORMATS,
  FONTS,
  ID_PATTERN,
  LAYER_PLANES,
  LAYER_PROPERTIES,
  LAYER_TYPES,
  LIGHT_TYPES,
  LIMITS,
  OBJECT_PROPERTIES,
  QUALITIES,
  ROTATION_ORDERS,
  SCENE_FORMAT_VERSION,
  TONE_MAPPINGS,
} from "./constants.ts";
import type {
  AnimationTrack,
  AudioTrack,
  CaptionSettings,
  DialogueLine,
  Easing,
  ExportSettings,
  Keyframe,
  MaterialSettings,
  ParamValue,
  Scene,
  SceneCamera,
  SceneEnvironment,
  SceneIssue,
  SceneLayer,
  SceneLight,
  SceneObject,
  ScenePost,
  SceneSettings,
  SceneShot,
  TrackValue,
  ValidateOptions,
  ValidationResult,
  Vec2,
  Vec3,
  Vec4,
  VoiceSetting,
} from "./types.ts";

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const has = (o: Rec, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

class Ctx {
  issues: SceneIssue[] = [];
  opts: ValidateOptions;
  /** Objects, layers and shots share one id space so an animation target is never ambiguous. */
  ids = new Map<string, "object" | "layer" | "shot">();
  constructor(opts: ValidateOptions) {
    this.opts = opts;
  }
  /** Validate an id and reserve it. Returns false (after reporting) when it cannot be used. */
  claimId(id: string, kind: "object" | "layer" | "shot", path: string): boolean {
    if (!ID_PATTERN.test(id)) {
      this.error("bad-id", path, `The id "${id}" must start with a letter and use only letters, digits, "_" or "-".`, `Rename it, for example "hero_1".`);
      return false;
    }
    if (id === CAMERA_TARGET) {
      this.error("reserved-id", path, `"camera" is reserved for the scene camera.`, `Pick a different id.`);
      return false;
    }
    if (this.ids.has(id)) {
      this.error("duplicate-id", path, `Another ${this.ids.get(id)} already uses the id "${id}".`, `Give each object, layer and shot its own id.`);
      return false;
    }
    this.ids.set(id, kind);
    return true;
  }
  error(code: string, path: string, message: string, fix: string) {
    this.issues.push({ severity: "error", code, path, message, fix });
  }
  warn(code: string, path: string, message: string, fix: string) {
    this.issues.push({ severity: "warning", code, path, message, fix });
  }
  get failed() {
    return this.issues.some((i) => i.severity === "error");
  }
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "a list";
  if (typeof v === "string") return `the text "${v.length > 24 ? `${v.slice(0, 24)}…` : v}"`;
  return `${typeof v === "object" ? "an object" : `the ${typeof v} ${String(v)}`}`;
}

/** Warn about fields this version does not know, then ignore them. */
function checkKnown(ctx: Ctx, o: Rec, path: string, known: readonly string[]) {
  for (const key of Object.keys(o)) {
    if (!known.includes(key)) {
      ctx.warn("unknown-field", `${path}.${key}`, `"${key}" is not a field Scene Studio understands, so it was ignored.`, `Remove "${key}" or check its spelling.`);
    }
  }
}

function num(ctx: Ctx, o: Rec, key: string, path: string, def: number, min: number, max: number, integer = false): number {
  if (!has(o, key) || o[key] === undefined) return def;
  const v = o[key];
  const p = `${path}.${key}`;
  if (!isNum(v)) {
    ctx.error("wrong-type", p, `"${key}" must be a number but ${describe(v)} was given.`, `Set "${key}" to a number between ${min} and ${max}.`);
    return def;
  }
  if (integer && !Number.isInteger(v)) {
    ctx.error("not-integer", p, `"${key}" must be a whole number but ${v} was given.`, `Use a whole number between ${min} and ${max}.`);
    return def;
  }
  if (v < min || v > max) {
    ctx.error("out-of-range", p, `"${key}" is ${v}, outside the allowed range ${min} to ${max}.`, `Use a value between ${min} and ${max}.`);
    return def;
  }
  return v;
}

function bool(ctx: Ctx, o: Rec, key: string, path: string, def: boolean): boolean {
  if (!has(o, key) || o[key] === undefined) return def;
  if (typeof o[key] !== "boolean") {
    ctx.error("wrong-type", `${path}.${key}`, `"${key}" must be true or false but ${describe(o[key])} was given.`, `Use true or false.`);
    return def;
  }
  return o[key] as boolean;
}

function str(ctx: Ctx, o: Rec, key: string, path: string, max: number): string | undefined {
  if (!has(o, key) || o[key] === undefined) return undefined;
  const v = o[key];
  if (typeof v !== "string") {
    ctx.error("wrong-type", `${path}.${key}`, `"${key}" must be text but ${describe(v)} was given.`, `Wrap the value in quotes.`);
    return undefined;
  }
  if (v.length > max) {
    ctx.error("too-long", `${path}.${key}`, `"${key}" is ${v.length} characters; the limit is ${max}.`, `Shorten it to ${max} characters or fewer.`);
    return undefined;
  }
  return v;
}

function oneOf<T extends string>(ctx: Ctx, o: Rec, key: string, path: string, allowed: readonly T[], def: T): T {
  if (!has(o, key) || o[key] === undefined) return def;
  const v = o[key];
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    ctx.error("bad-choice", `${path}.${key}`, `"${key}" is ${describe(v)}, which is not an option.`, `Use one of: ${allowed.map((a) => `"${a}"`).join(", ")}.`);
    return def;
  }
  return v as T;
}

/** "#abc" and "#aabbcc" are accepted and normalised to lower-case 6-digit hex. */
function normalizeColor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? [...h].map((c) => c + c).join("") : h}`;
}

function color(ctx: Ctx, o: Rec, key: string, path: string, def: string): string;
function color(ctx: Ctx, o: Rec, key: string, path: string, def: undefined): string | undefined;
function color(ctx: Ctx, o: Rec, key: string, path: string, def: string | undefined): string | undefined {
  if (!has(o, key) || o[key] === undefined) return def;
  const c = normalizeColor(o[key]);
  if (!c) {
    ctx.error("bad-color", `${path}.${key}`, `"${key}" must be a hex colour like "#ffd400" but ${describe(o[key])} was given.`, `Write the colour as # followed by 6 hex digits, for example "#f4b942".`);
    return def;
  }
  return c;
}

function vec3Raw(ctx: Ctx, v: unknown, path: string, name: string): Vec3 | null {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum)) {
    ctx.error("bad-vector", path, `"${name}" must be a list of exactly 3 numbers [x, y, z] but ${describe(v)} was given.`, `Write ${name} as [x, y, z], for example [0, 1, 0].`);
    return null;
  }
  if (v.some((n: number) => Math.abs(n) > LIMITS.maxCoordinate)) {
    ctx.error("out-of-range", path, `"${name}" has a value beyond ±${LIMITS.maxCoordinate}.`, `Keep every value within ±${LIMITS.maxCoordinate}.`);
    return null;
  }
  return [v[0], v[1], v[2]];
}

function vec2Raw(ctx: Ctx, v: unknown, path: string, name: string): Vec2 | null {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(isNum)) {
    ctx.error("bad-vector", path, `"${name}" must be a list of exactly 2 numbers [x, y] but ${describe(v)} was given.`, `Write ${name} as [x, y], for example [540, 960].`);
    return null;
  }
  if (v.some((n: number) => Math.abs(n) > LIMITS.maxCoordinate)) {
    ctx.error("out-of-range", path, `"${name}" has a value beyond ±${LIMITS.maxCoordinate}.`, `Keep every value within ±${LIMITS.maxCoordinate}.`);
    return null;
  }
  return [v[0], v[1]];
}

function vec2(ctx: Ctx, o: Rec, key: string, path: string, def: Vec2): Vec2 {
  if (!has(o, key) || o[key] === undefined) return [...def] as Vec2;
  return vec2Raw(ctx, o[key], `${path}.${key}`, key) ?? ([...def] as Vec2);
}

/** A single number is shorthand for a uniform 2D scale. */
function scale2Value(ctx: Ctx, v: unknown, path: string, name: string): Vec2 | null {
  if (isNum(v)) {
    if (Math.abs(v) > LIMITS.maxCoordinate) {
      ctx.error("out-of-range", path, `"${name}" is beyond ±${LIMITS.maxCoordinate}.`, `Use a smaller scale.`);
      return null;
    }
    return [v, v];
  }
  return vec2Raw(ctx, v, path, name);
}

/** Quaternions are normalised on the way in, so every platform starts from a unit rotation. */
function quatRaw(ctx: Ctx, v: unknown, path: string, name: string): Vec4 | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every(isNum)) {
    ctx.error("bad-vector", path, `"${name}" must be a list of exactly 4 numbers [x, y, z, w] but ${describe(v)} was given.`, `Write it as [x, y, z, w], for example [0, 0, 0, 1] for no rotation.`);
    return null;
  }
  const len = Math.hypot(v[0], v[1], v[2], v[3]);
  if (len < 1e-9) {
    ctx.error("bad-quaternion", path, `"${name}" is all zeros, which is not a rotation.`, `Use [0, 0, 0, 1] for no rotation.`);
    return null;
  }
  return [v[0] / len, v[1] / len, v[2] / len, v[3] / len];
}

function vec3(ctx: Ctx, o: Rec, key: string, path: string, def: Vec3): Vec3 {
  if (!has(o, key) || o[key] === undefined) return [...def] as Vec3;
  return vec3Raw(ctx, o[key], `${path}.${key}`, key) ?? ([...def] as Vec3);
}

/** A single number is shorthand for a uniform vector. */
function scaleValue(ctx: Ctx, v: unknown, path: string, name: string): Vec3 | null {
  if (isNum(v)) {
    if (Math.abs(v) > LIMITS.maxCoordinate) {
      ctx.error("out-of-range", path, `"${name}" is beyond ±${LIMITS.maxCoordinate}.`, `Use a smaller scale.`);
      return null;
    }
    return [v, v, v];
  }
  return vec3Raw(ctx, v, path, name);
}

/** Assets are library names or uploaded file names only; remote URLs are never fetched. */
function checkAssetRef(ctx: Ctx, value: string, path: string): boolean {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) || value.startsWith("//")) {
    ctx.error("remote-asset", path, `"${value}" is a web address. Scene Studio never downloads from the internet.`, `Use a library asset name such as "library/tree_oak", or the name of a file the user uploads.`);
    return false;
  }
  if (value.includes("\\") || value.startsWith("/") || value.split("/").some((p) => p === "..") || value.includes("\0")) {
    ctx.error("unsafe-asset-path", path, `"${value}" is not a safe asset name.`, `Use a plain name such as "library/tree_oak" or "my-model.glb" with no "..", leading "/" or backslashes.`);
    return false;
  }
  return true;
}

function readSettings(ctx: Ctx, input: unknown): SceneSettings {
  const o = isRec(input) ? input : {};
  if (input !== undefined && !isRec(input)) ctx.error("wrong-type", "$.settings", `"settings" must be an object but ${describe(input)} was given.`, `Write settings as { "width": 1080, "height": 1920, "fps": 30, "duration": 8 }.`);
  checkKnown(ctx, o, "$.settings", ["width", "height", "fps", "duration", "background", "seed"]);
  const s: SceneSettings = {
    width: num(ctx, o, "width", "$.settings", 1080, LIMITS.minDimension, LIMITS.maxDimension, true),
    height: num(ctx, o, "height", "$.settings", 1920, LIMITS.minDimension, LIMITS.maxDimension, true),
    fps: num(ctx, o, "fps", "$.settings", 30, 1, LIMITS.maxFps, true),
    duration: num(ctx, o, "duration", "$.settings", 8, 0.1, LIMITS.maxDurationSeconds),
    background: color(ctx, o, "background", "$.settings", "#101826"),
    seed: num(ctx, o, "seed", "$.settings", 1, 0, 4_294_967_295, true),
  };
  const frames = Math.round(s.fps * s.duration);
  if (frames > LIMITS.maxFrames) {
    ctx.error("too-many-frames", "$.settings.duration", `${s.duration}s at ${s.fps} fps is ${frames} frames; the limit is ${LIMITS.maxFrames}.`, `Shorten "duration" or lower "fps" so that fps × duration is at most ${LIMITS.maxFrames}.`);
  }
  return s;
}

function readCameraAt(ctx: Ctx, input: unknown, path: string, extraKeys: readonly string[] = []): SceneCamera {
  const o = isRec(input) ? input : {};
  if (input !== undefined && !isRec(input)) ctx.error("wrong-type", path, `"camera" must be an object but ${describe(input)} was given.`, `Write camera as { "position": [0, 2, 8], "lookAt": [0, 1, 0] }.`);
  checkKnown(ctx, o, path, ["type", "position", "lookAt", "fov", "shake", ...extraKeys]);
  let shake = { amount: 0, speed: 4 };
  if (has(o, "shake") && o.shake !== undefined) {
    const sk = o.shake;
    if (!isRec(sk)) ctx.error("wrong-type", `${path}.shake`, `"shake" must be an object but ${describe(sk)} was given.`, `Write shake as { "amount": 0.3, "speed": 4 }.`);
    else {
      checkKnown(ctx, sk, `${path}.shake`, ["amount", "speed"]);
      shake = { amount: num(ctx, sk, "amount", `${path}.shake`, 0, 0, 1), speed: num(ctx, sk, "speed", `${path}.shake`, 4, 0.1, 20) };
    }
  }
  const cam: SceneCamera = {
    type: oneOf(ctx, o, "type", path, CAMERA_TYPES, "perspective"),
    position: vec3(ctx, o, "position", path, [0, 2, 8]),
    lookAt: vec3(ctx, o, "lookAt", path, [0, 1, 0]),
    fov: num(ctx, o, "fov", path, 45, 10, 120),
    shake,
  };
  if (cam.position.every((n, i) => n === cam.lookAt[i])) {
    ctx.error("camera-degenerate", path, `The camera position and lookAt are the same point, so it has no direction.`, `Move "position" away from "lookAt".`);
  }
  return cam;
}

function readCamera(ctx: Ctx, input: unknown): SceneCamera {
  return readCameraAt(ctx, input, "$.camera");
}

/** Shots are cameras with a start time. From `start` until the next shot they replace the base camera (a hard cut). */
function readShots(ctx: Ctx, input: unknown, duration: number): SceneShot[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    ctx.error("wrong-type", "$.shots", `"shots" must be a list but ${describe(input)} was given.`, `Write shots as [{ "id": "wide", "start": 0, "position": [0, 2, 8] }].`);
    return [];
  }
  if (input.length > LIMITS.maxShots) {
    ctx.error("too-many", "$.shots", `There are ${input.length} shots; the limit is ${LIMITS.maxShots}.`, `Remove shots until ${LIMITS.maxShots} or fewer remain.`);
    return [];
  }
  const out: SceneShot[] = [];
  input.forEach((item, i) => {
    const path = `$.shots[${i}]`;
    if (!isRec(item)) {
      ctx.error("wrong-type", path, `Each shot must be an object but ${describe(item)} was given.`, `Write a shot as { "id": "wide", "start": 0, "position": [0, 2, 8], "lookAt": [0, 1, 0] }.`);
      return;
    }
    const cam = readCameraAt(ctx, item, path, ["id", "start"]);
    const id = str(ctx, item, "id", path, LIMITS.maxIdLength);
    if (id === undefined) {
      if (!has(item, "id")) ctx.error("missing-field", `${path}.id`, `This shot has no "id".`, `Give every shot an id such as "closeup" so it can be animated.`);
      return;
    }
    if (!ctx.claimId(id, "shot", `${path}.id`)) return;
    const start = num(ctx, item, "start", path, 0, 0, LIMITS.maxDurationSeconds);
    if (start >= duration) ctx.warn("shot-after-end", `${path}.start`, `Shot "${id}" starts at ${start}s, after the scene ends at ${duration}s, so it will never be seen.`, `Start it earlier or lengthen "settings.duration".`);
    out.push({ ...cam, id, start });
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}

function readEnvironment(ctx: Ctx, input: unknown): SceneEnvironment {
  const o = isRec(input) ? input : {};
  if (input !== undefined && !isRec(input)) ctx.error("wrong-type", "$.environment", `"environment" must be an object but ${describe(input)} was given.`, `Write environment as { "preset": "night", "fog": { "density": 0.05 } }.`);
  checkKnown(ctx, o, "$.environment", ["preset", "intensity", "hdri", "skybox", "fog"]);
  let fog = { color: "#8a9bb0", density: 0 };
  if (has(o, "fog") && o.fog !== undefined) {
    if (!isRec(o.fog)) ctx.error("wrong-type", "$.environment.fog", `"fog" must be an object but ${describe(o.fog)} was given.`, `Write fog as { "color": "#8a9bb0", "density": 0.05 }.`);
    else {
      checkKnown(ctx, o.fog, "$.environment.fog", ["color", "density"]);
      fog = { color: color(ctx, o.fog, "color", "$.environment.fog", "#8a9bb0"), density: num(ctx, o.fog, "density", "$.environment.fog", 0, 0, 1) };
    }
  }
  const env: SceneEnvironment = {
    preset: oneOf(ctx, o, "preset", "$.environment", ENVIRONMENT_PRESETS, "studio"),
    intensity: num(ctx, o, "intensity", "$.environment", 1, 0, 5),
    skybox: bool(ctx, o, "skybox", "$.environment", false),
    fog,
  };
  const hdri = str(ctx, o, "hdri", "$.environment", 200);
  if (hdri !== undefined && checkAssetRef(ctx, hdri, "$.environment.hdri")) env.hdri = hdri;
  return env;
}

function readPost(ctx: Ctx, input: unknown): ScenePost {
  const o = isRec(input) ? input : {};
  if (input !== undefined && !isRec(input)) ctx.error("wrong-type", "$.post", `"post" must be an object but ${describe(input)} was given.`, `Write post as { "bloom": 0.6, "vignette": 0.3 }.`);
  checkKnown(ctx, o, "$.post", ["bloom", "bloomThreshold", "vignette", "grain", "depthOfField", "focusDistance", "toneMapping", "exposure", "contrast", "saturation"]);
  return {
    bloom: num(ctx, o, "bloom", "$.post", 0, 0, 3),
    bloomThreshold: num(ctx, o, "bloomThreshold", "$.post", 0.8, 0, 1),
    vignette: num(ctx, o, "vignette", "$.post", 0, 0, 1),
    grain: num(ctx, o, "grain", "$.post", 0, 0, 1),
    depthOfField: num(ctx, o, "depthOfField", "$.post", 0, 0, 1),
    focusDistance: num(ctx, o, "focusDistance", "$.post", 8, 0.1, 1000),
    toneMapping: oneOf(ctx, o, "toneMapping", "$.post", TONE_MAPPINGS, "aces"),
    exposure: num(ctx, o, "exposure", "$.post", 1, 0.1, 4),
    contrast: num(ctx, o, "contrast", "$.post", 1, 0.5, 2),
    saturation: num(ctx, o, "saturation", "$.post", 1, 0, 2),
  };
}

function readLights(ctx: Ctx, input: unknown): SceneLight[] {
  if (input === undefined) return [{ type: "sun", intensity: 1, color: "#ffffff", position: [0, 5, 0], direction: [-0.4, -1, -0.3] }];
  if (!Array.isArray(input)) {
    ctx.error("wrong-type", "$.lights", `"lights" must be a list but ${describe(input)} was given.`, `Write lights as [{ "type": "sun", "intensity": 1.2 }].`);
    return [];
  }
  if (input.length > LIMITS.maxLights) {
    ctx.error("too-many", "$.lights", `There are ${input.length} lights; the limit is ${LIMITS.maxLights}.`, `Remove lights until ${LIMITS.maxLights} or fewer remain.`);
    return [];
  }
  const out: SceneLight[] = [];
  input.forEach((item, i) => {
    const path = `$.lights[${i}]`;
    if (!isRec(item)) {
      ctx.error("wrong-type", path, `Each light must be an object but ${describe(item)} was given.`, `Write a light as { "type": "sun", "intensity": 1.2 }.`);
      return;
    }
    checkKnown(ctx, item, path, ["type", "intensity", "color", "position", "direction"]);
    out.push({
      type: oneOf(ctx, item, "type", path, LIGHT_TYPES, "sun"),
      intensity: num(ctx, item, "intensity", path, 1, 0, 20),
      color: color(ctx, item, "color", path, "#ffffff"),
      position: vec3(ctx, item, "position", path, [0, 5, 0]),
      direction: vec3(ctx, item, "direction", path, [-0.4, -1, -0.3]),
    });
  });
  return out;
}

function readParams(ctx: Ctx, input: unknown, path: string): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  if (input === undefined) return out;
  if (!isRec(input)) {
    ctx.error("wrong-type", path, `"params" must be an object but ${describe(input)} was given.`, `Write params as { "height": 1.7 }.`);
    return out;
  }
  const keys = Object.keys(input);
  if (keys.length > LIMITS.maxParams) {
    ctx.error("too-many", path, `"params" has ${keys.length} entries; the limit is ${LIMITS.maxParams}.`, `Keep at most ${LIMITS.maxParams} parameters.`);
    return out;
  }
  for (const k of keys) {
    if (UNSAFE_KEYS.has(k)) continue;
    const v = input[k];
    if (typeof v === "string" && v.length <= LIMITS.maxTextLength || typeof v === "boolean" || isNum(v)) out[k] = v as ParamValue;
    else ctx.error("wrong-type", `${path}.${k}`, `Parameter "${k}" must be a number, text or true/false.`, `Use a simple value for "${k}".`);
  }
  return out;
}

function readMaterial(ctx: Ctx, input: unknown, path: string): MaterialSettings | undefined {
  if (input === undefined) return undefined;
  if (!isRec(input)) {
    ctx.error("wrong-type", path, `"material" must be an object but ${describe(input)} was given.`, `Write material as { "metallic": 0, "roughness": 0.6 }.`);
    return undefined;
  }
  checkKnown(ctx, input, path, ["metallic", "roughness", "emissive", "emissiveIntensity", "texture", "doubleSided"]);
  const m: MaterialSettings = {
    metallic: num(ctx, input, "metallic", path, 0, 0, 1),
    roughness: num(ctx, input, "roughness", path, 0.6, 0, 1),
    emissiveIntensity: num(ctx, input, "emissiveIntensity", path, 1, 0, 20),
    doubleSided: bool(ctx, input, "doubleSided", path, false),
  };
  const emissive = color(ctx, input, "emissive", path, undefined);
  if (emissive !== undefined) m.emissive = emissive;
  const texture = str(ctx, input, "texture", path, 200);
  if (texture !== undefined && checkAssetRef(ctx, texture, `${path}.texture`)) m.texture = texture;
  return m;
}

function readObjects(ctx: Ctx, input: unknown): SceneObject[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    ctx.error("wrong-type", "$.objects", `"objects" must be a list but ${describe(input)} was given.`, `Write objects as [{ "id": "hero", "type": "character" }].`);
    return [];
  }
  if (input.length > LIMITS.maxObjects) {
    ctx.error("too-many", "$.objects", `There are ${input.length} objects; the limit is ${LIMITS.maxObjects}.`, `Remove objects until ${LIMITS.maxObjects} or fewer remain.`);
    return [];
  }
  const out: SceneObject[] = [];
  const sourceIndex = new Map<string, number>();
  input.forEach((item, i) => {
    const path = `$.objects[${i}]`;
    if (!isRec(item)) {
      ctx.error("wrong-type", path, `Each object must be an object but ${describe(item)} was given.`, `Write an object as { "id": "hero", "type": "character" }.`);
      return;
    }
    checkKnown(ctx, item, path, ["id", "type", "asset", "style", "color", "text", "size", "params", "position", "rotation", "rotationOrder", "quaternion", "scale", "visible", "opacity", "parent", "material", "clip", "clipSpeed"]);
    const id = str(ctx, item, "id", path, LIMITS.maxIdLength);
    if (id === undefined) {
      if (!has(item, "id")) ctx.error("missing-field", `${path}.id`, `This object has no "id".`, `Give every object a unique "id" such as "hero".`);
      return;
    }
    if (!ctx.claimId(id, "object", `${path}.id`)) return;
    const type = str(ctx, item, "type", path, 64);
    if (type === undefined || type.trim() === "") {
      if (!has(item, "type") || type === "") ctx.error("missing-field", `${path}.type`, `Object "${id}" has no "type".`, `Add a type such as "box", "character" or "text".`);
      return;
    }
    if (ctx.opts.knownTypes && !ctx.opts.knownTypes.includes(type)) {
      ctx.warn("unknown-type", `${path}.type`, `The type "${type}" is not built in. A library asset with a matching name, or a plain placeholder, will be used instead.`, `Use one of the supported types: ${ctx.opts.knownTypes.join(", ")}.`);
    }
    let asset = str(ctx, item, "asset", path, 200);
    if (asset !== undefined && !checkAssetRef(ctx, asset, `${path}.asset`)) asset = undefined;
    let size: Vec3 | undefined;
    if (has(item, "size") && item.size !== undefined) size = scaleValue(ctx, item.size, `${path}.size`, "size") ?? undefined;
    let scale: Vec3 = [1, 1, 1];
    if (has(item, "scale") && item.scale !== undefined) scale = scaleValue(ctx, item.scale, `${path}.scale`, "scale") ?? scale;
    const obj: SceneObject = {
      id,
      type,
      params: readParams(ctx, item.params, `${path}.params`),
      position: vec3(ctx, item, "position", path, [0, 0, 0]),
      rotation: vec3(ctx, item, "rotation", path, [0, 0, 0]),
      rotationOrder: oneOf(ctx, item, "rotationOrder", path, ROTATION_ORDERS, "XYZ"),
      clipSpeed: num(ctx, item, "clipSpeed", path, 1, 0, 10),
      scale,
      visible: bool(ctx, item, "visible", path, true),
      opacity: num(ctx, item, "opacity", path, 1, 0, 1),
    };
    if (asset !== undefined) obj.asset = asset;
    const style = str(ctx, item, "style", path, 32);
    if (style !== undefined) obj.style = style;
    const col = color(ctx, item, "color", path, undefined);
    if (col !== undefined) obj.color = col;
    const text = str(ctx, item, "text", path, LIMITS.maxTextLength);
    if (text !== undefined) obj.text = text;
    if (size) obj.size = size;
    const parent = str(ctx, item, "parent", path, LIMITS.maxIdLength);
    if (parent !== undefined) obj.parent = parent;
    if (has(item, "quaternion") && item.quaternion !== undefined) {
      const q = quatRaw(ctx, item.quaternion, `${path}.quaternion`, "quaternion");
      if (q) {
        obj.quaternion = q;
        if (obj.rotation.some((n) => n !== 0)) ctx.warn("rotation-and-quaternion", `${path}.rotation`, `Object "${id}" has both "rotation" and "quaternion". The quaternion is used and "rotation" is ignored.`, `Keep only one of them.`);
        obj.rotation = [0, 0, 0]; // ignored when a quaternion is present; zeroed so a saved scene reloads without warnings
      }
    }
    const clip = str(ctx, item, "clip", path, 64);
    if (clip !== undefined) obj.clip = clip;
    const material = readMaterial(ctx, item.material, `${path}.material`);
    if (material) obj.material = material;
    out.push(obj);
    sourceIndex.set(id, i);
  });
  // parents must exist and must not form a loop
  const ids = new Set(out.map((o) => o.id));
  const byId = new Map(out.map((o) => [o.id, o]));
  out.forEach((o) => {
    if (o.parent === undefined) return;
    const path = `$.objects[${sourceIndex.get(o.id)}].parent`;
    if (!ids.has(o.parent) || o.parent === o.id) {
      ctx.error("bad-parent", path, `Object "${o.id}" names the parent "${o.parent}", which is not another object in this scene.`, `Set "parent" to the id of a different object, or remove it.`);
      return;
    }
    const chain = new Set([o.id]);
    for (let cur = byId.get(o.parent); cur; cur = cur.parent ? byId.get(cur.parent) : undefined) {
      if (chain.has(cur.id)) {
        ctx.error("parent-loop", path, `Object "${o.id}" ends up as its own ancestor through its "parent" links.`, `Break the loop by removing one "parent".`);
        break;
      }
      chain.add(cur.id);
    }
  });
  return out;
}

function readLayers(ctx: Ctx, input: unknown, duration: number): SceneLayer[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    ctx.error("wrong-type", "$.layers", `"layers" must be a list but ${describe(input)} was given.`, `Write layers as [{ "id": "title", "type": "text", "text": "Hello" }].`);
    return [];
  }
  if (input.length > LIMITS.maxLayers) {
    ctx.error("too-many", "$.layers", `There are ${input.length} layers; the limit is ${LIMITS.maxLayers}.`, `Remove layers until ${LIMITS.maxLayers} or fewer remain.`);
    return [];
  }
  const out: SceneLayer[] = [];
  input.forEach((item, i) => {
    const path = `$.layers[${i}]`;
    if (!isRec(item)) {
      ctx.error("wrong-type", path, `Each layer must be an object but ${describe(item)} was given.`, `Write a layer as { "id": "title", "type": "text", "text": "Hello" }.`);
      return;
    }
    checkKnown(ctx, item, path, ["id", "type", "plane", "position", "size", "anchor", "scale", "rotation", "opacity", "start", "end", "visible", "color", "text", "font", "fontSize", "strokeColor", "strokeWidth", "asset"]);
    const id = str(ctx, item, "id", path, LIMITS.maxIdLength);
    if (id === undefined) {
      if (!has(item, "id")) ctx.error("missing-field", `${path}.id`, `This layer has no "id".`, `Give every layer a unique "id" such as "title".`);
      return;
    }
    if (!ctx.claimId(id, "layer", `${path}.id`)) return;
    if (typeof item.type !== "string" || !(LAYER_TYPES as readonly string[]).includes(item.type)) {
      ctx.error(has(item, "type") ? "bad-choice" : "missing-field", `${path}.type`, `Layer "${id}" has ${has(item, "type") ? `the type ${describe(item.type)}, which is not an option` : `no "type"`}.`, `Use one of: ${LAYER_TYPES.map((a) => `"${a}"`).join(", ")}.`);
      return;
    }
    const type = item.type as SceneLayer["type"];
    const start = num(ctx, item, "start", path, 0, 0, LIMITS.maxDurationSeconds);
    const end = num(ctx, item, "end", path, duration, 0, LIMITS.maxDurationSeconds);
    if (end <= start) ctx.error("bad-time-range", `${path}.end`, `Layer "${id}" ends at ${end}s, which is not after it starts at ${start}s.`, `Make "end" larger than "start".`);
    const layer: SceneLayer = {
      id,
      type,
      plane: oneOf(ctx, item, "plane", path, LAYER_PLANES, "front"),
      position: vec2(ctx, item, "position", path, [0, 0]),
      size: vec2(ctx, item, "size", path, type === "text" ? [0, 0] : [100, 100]),
      anchor: vec2(ctx, item, "anchor", path, [0.5, 0.5]),
      scale: has(item, "scale") && item.scale !== undefined ? scale2Value(ctx, item.scale, `${path}.scale`, "scale") ?? [1, 1] : [1, 1],
      rotation: num(ctx, item, "rotation", path, 0, -36000, 36000),
      opacity: num(ctx, item, "opacity", path, 1, 0, 1),
      start,
      end,
      visible: bool(ctx, item, "visible", path, true),
      font: oneOf(ctx, item, "font", path, FONTS, "sans"),
      fontSize: num(ctx, item, "fontSize", path, 64, 4, 1000),
      strokeWidth: num(ctx, item, "strokeWidth", path, 0, 0, 100),
    };
    const col = color(ctx, item, "color", path, undefined);
    if (col !== undefined) layer.color = col;
    const stroke = color(ctx, item, "strokeColor", path, undefined);
    if (stroke !== undefined) layer.strokeColor = stroke;
    const text = str(ctx, item, "text", path, LIMITS.maxTextLength);
    if (text !== undefined) layer.text = text;
    let asset = str(ctx, item, "asset", path, 200);
    if (asset !== undefined && !checkAssetRef(ctx, asset, `${path}.asset`)) asset = undefined;
    if (asset !== undefined) layer.asset = asset;
    if (type === "text" && (layer.text === undefined || layer.text.trim() === "")) ctx.error("missing-field", `${path}.text`, `Text layer "${id}" has no "text".`, `Add the words to show.`);
    if (type === "image" && layer.asset === undefined) ctx.error("missing-field", `${path}.asset`, `Image layer "${id}" has no "asset".`, `Set "asset" to a library image or an uploaded file name.`);
    out.push(layer);
  });
  return out;
}

function readAudio(ctx: Ctx, input: unknown, duration: number): AudioTrack[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    ctx.error("wrong-type", "$.audio", `"audio" must be a list but ${describe(input)} was given.`, `Write audio as [{ "asset": "library/music_calm", "volume": 0.4 }].`);
    return [];
  }
  if (input.length > LIMITS.maxAudioTracks) {
    ctx.error("too-many", "$.audio", `There are ${input.length} audio tracks; the limit is ${LIMITS.maxAudioTracks}.`, `Remove tracks until ${LIMITS.maxAudioTracks} or fewer remain.`);
    return [];
  }
  const out: AudioTrack[] = [];
  input.forEach((item, i) => {
    const path = `$.audio[${i}]`;
    if (!isRec(item)) {
      ctx.error("wrong-type", path, `Each audio track must be an object but ${describe(item)} was given.`, `Write a track as { "asset": "library/music_calm", "volume": 0.4 }.`);
      return;
    }
    checkKnown(ctx, item, path, ["id", "asset", "start", "volume", "loop"]);
    const asset = str(ctx, item, "asset", path, 200);
    if (asset === undefined) {
      if (!has(item, "asset")) ctx.error("missing-field", `${path}.asset`, `This audio track has no "asset".`, `Set "asset" to a library sound or an uploaded file name.`);
      return;
    }
    if (!checkAssetRef(ctx, asset, `${path}.asset`)) return;
    const start = num(ctx, item, "start", path, 0, 0, LIMITS.maxDurationSeconds);
    if (start >= duration) ctx.warn("audio-after-end", `${path}.start`, `This sound starts at ${start}s, after the scene ends at ${duration}s, so it will not be heard.`, `Start it earlier or lengthen "settings.duration".`);
    out.push({ id: str(ctx, item, "id", path, LIMITS.maxIdLength) ?? `audio${i + 1}`, asset, start, volume: num(ctx, item, "volume", path, 1, 0, 1), loop: bool(ctx, item, "loop", path, false) });
  });
  return out;
}

function trackValue(ctx: Ctx, kind: "object" | "layer" | "camera", property: string, v: unknown, path: string): TrackValue | null {
  switch (property) {
    case "position":
      return kind === "layer" ? vec2Raw(ctx, v, path, property) : vec3Raw(ctx, v, path, property);
    case "rotation":
      if (kind === "layer") {
        if (!isNum(v)) {
          ctx.error("wrong-type", path, `A 2D "rotation" keyframe value must be a number of degrees but ${describe(v)} was given.`, `Use degrees, for example 90.`);
          return null;
        }
        return v;
      }
      return vec3Raw(ctx, v, path, property);
    case "lookAt":
      return vec3Raw(ctx, v, path, property);
    case "quaternion":
      return quatRaw(ctx, v, path, property);
    case "scale":
      return kind === "layer" ? scale2Value(ctx, v, path, property) : scaleValue(ctx, v, path, property);
    case "clip":
      if (typeof v !== "string" || v.length === 0 || v.length > 64) {
        ctx.error("wrong-type", path, `A "clip" keyframe value must be the name of an animation clip (text) but ${describe(v)} was given.`, `Use a clip name such as "Walk".`);
        return null;
      }
      return v;
    case "color": {
      const c = normalizeColor(v);
      if (!c) ctx.error("bad-color", path, `A "color" keyframe value must be a hex colour like "#ffd400" but ${describe(v)} was given.`, `Use # followed by 6 hex digits.`);
      return c;
    }
    case "opacity":
      if (!isNum(v) || v < 0 || v > 1) {
        ctx.error("out-of-range", path, `An "opacity" keyframe value must be a number from 0 to 1 but ${describe(v)} was given.`, `Use a number between 0 and 1.`);
        return null;
      }
      return v;
    case "fov":
      if (!isNum(v) || v < 10 || v > 120) {
        ctx.error("out-of-range", path, `A "fov" keyframe value must be a number from 10 to 120 but ${describe(v)} was given.`, `Use a field of view in degrees between 10 and 120.`);
        return null;
      }
      return v;
    case "visible":
      if (typeof v !== "boolean") {
        ctx.error("wrong-type", path, `A "visible" keyframe value must be true or false but ${describe(v)} was given.`, `Use true or false.`);
        return null;
      }
      return v;
    default:
      return null;
  }
}

function readAnimations(ctx: Ctx, input: unknown, duration: number): AnimationTrack[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    ctx.error("wrong-type", "$.animations", `"animations" must be a list but ${describe(input)} was given.`, `Write animations as [{ "target": "hero", "property": "position", "keyframes": [...] }].`);
    return [];
  }
  if (input.length > LIMITS.maxAnimations) {
    ctx.error("too-many", "$.animations", `There are ${input.length} animations; the limit is ${LIMITS.maxAnimations}.`, `Remove animations until ${LIMITS.maxAnimations} or fewer remain.`);
    return [];
  }
  const out: AnimationTrack[] = [];
  input.forEach((item, i) => {
    const path = `$.animations[${i}]`;
    if (!isRec(item)) {
      ctx.error("wrong-type", path, `Each animation must be an object but ${describe(item)} was given.`, `Write an animation as { "target": "hero", "property": "position", "keyframes": [...] }.`);
      return;
    }
    checkKnown(ctx, item, path, ["target", "property", "easing", "loop", "keyframes"]);
    const target = str(ctx, item, "target", path, LIMITS.maxIdLength);
    if (target === undefined) {
      if (!has(item, "target")) ctx.error("missing-field", `${path}.target`, `This animation has no "target".`, `Set "target" to an object id, or "camera".`);
      return;
    }
    const owner = target === CAMERA_TARGET ? "shot" : ctx.ids.get(target);
    if (owner === undefined) {
      ctx.error("unknown-target", `${path}.target`, `The animation targets "${target}", but no object, layer or shot has that id.`, `Use the id of an object, layer or shot, or "camera".`);
      return;
    }
    const kind = owner === "shot" ? "camera" : owner;
    const allowed: readonly string[] = kind === "camera" ? CAMERA_PROPERTIES : kind === "layer" ? LAYER_PROPERTIES : OBJECT_PROPERTIES;
    if (typeof item.property !== "string" || !allowed.includes(item.property)) {
      ctx.error("bad-property", `${path}.property`, `${kind === "camera" ? (target === CAMERA_TARGET ? "The camera" : `Shot "${target}"`) : `${kind === "layer" ? "Layer" : "Object"} "${target}"`} cannot animate ${describe(item.property)}.`, `Use one of: ${allowed.map((a) => `"${a}"`).join(", ")}.`);
      return;
    }
    const property = item.property;
    const easing = oneOf(ctx, item, "easing", path, EASINGS, "linear");
    const loop = bool(ctx, item, "loop", path, false);
    if (!Array.isArray(item.keyframes) || item.keyframes.length === 0) {
      ctx.error("missing-field", `${path}.keyframes`, `This animation has no keyframes.`, `Add at least one keyframe such as { "time": 0, "value": [0, 0, 0] }.`);
      return;
    }
    if (item.keyframes.length > LIMITS.maxKeyframesPerTrack) {
      ctx.error("too-many", `${path}.keyframes`, `This animation has ${item.keyframes.length} keyframes; the limit is ${LIMITS.maxKeyframesPerTrack}.`, `Use fewer keyframes.`);
      return;
    }
    const keyframes: Keyframe[] = [];
    let bad = false;
    item.keyframes.forEach((kf: unknown, k: number) => {
      const kp = `${path}.keyframes[${k}]`;
      if (!isRec(kf)) {
        ctx.error("wrong-type", kp, `Each keyframe must be an object but ${describe(kf)} was given.`, `Write a keyframe as { "time": 0, "value": [0, 0, 0] }.`);
        bad = true;
        return;
      }
      checkKnown(ctx, kf, kp, ["time", "value", "easing"]);
      if (!isNum(kf.time) || kf.time < 0) {
        ctx.error("bad-time", `${kp}.time`, `A keyframe "time" must be a number of seconds, 0 or more, but ${describe(kf.time)} was given.`, `Use seconds such as 0, 1.5 or 4.`);
        bad = true;
        return;
      }
      if (kf.time > duration) ctx.warn("keyframe-after-end", `${kp}.time`, `This keyframe is at ${kf.time}s, after the scene ends at ${duration}s, so it will never be reached.`, `Move it earlier or lengthen "settings.duration".`);
      const prev = keyframes[keyframes.length - 1];
      if (prev && kf.time < prev.time) {
        ctx.error("keyframes-unordered", `${kp}.time`, `Keyframe times must not go backwards (${kf.time}s comes after ${prev.time}s).`, `Sort the keyframes by "time", earliest first.`);
        bad = true;
        return;
      }
      const value = trackValue(ctx, kind, property, kf.value, `${kp}.value`);
      if (value === null) {
        bad = true;
        return;
      }
      const frame: Keyframe = { time: kf.time, value };
      if (has(kf, "easing")) frame.easing = oneOf(ctx, kf, "easing", kp, EASINGS, "linear" as Easing);
      keyframes.push(frame);
    });
    if (!bad) out.push({ target, property: property as AnimationTrack["property"], easing, loop, keyframes });
  });
  return out;
}

function readDialogue(ctx: Ctx, input: unknown, duration: number): DialogueLine[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    ctx.error("wrong-type", "$.dialogue", `"dialogue" must be a list but ${describe(input)} was given.`, `Write dialogue as [{ "speaker": "hero", "text": "Hello", "start": 1 }].`);
    return [];
  }
  if (input.length > LIMITS.maxDialogueLines) {
    ctx.error("too-many", "$.dialogue", `There are ${input.length} dialogue lines; the limit is ${LIMITS.maxDialogueLines}.`, `Remove lines until ${LIMITS.maxDialogueLines} or fewer remain.`);
    return [];
  }
  const out: DialogueLine[] = [];
  input.forEach((item, i) => {
    const path = `$.dialogue[${i}]`;
    if (!isRec(item)) {
      ctx.error("wrong-type", path, `Each dialogue line must be an object but ${describe(item)} was given.`, `Write a line as { "speaker": "hero", "text": "Hello", "start": 1 }.`);
      return;
    }
    checkKnown(ctx, item, path, ["speaker", "text", "start"]);
    const speaker = str(ctx, item, "speaker", path, LIMITS.maxIdLength);
    const text = str(ctx, item, "text", path, LIMITS.maxTextLength);
    if (speaker === undefined || speaker.trim() === "") {
      if (!has(item, "speaker") || speaker === "") ctx.error("missing-field", `${path}.speaker`, `This dialogue line has no "speaker".`, `Set "speaker" to an object id or a name such as "narrator".`);
      return;
    }
    if (text === undefined || text.trim() === "") {
      if (!has(item, "text") || text === "") ctx.error("missing-field", `${path}.text`, `This dialogue line has no "text".`, `Add the words to be spoken.`);
      return;
    }
    const start = num(ctx, item, "start", path, 0, 0, LIMITS.maxDurationSeconds);
    if (start >= duration) ctx.warn("dialogue-after-end", `${path}.start`, `This line starts at ${start}s, but the scene ends at ${duration}s, so it will be cut off.`, `Start it earlier or lengthen "settings.duration".`);
    out.push({ speaker, text, start });
  });
  return out;
}

function readVoices(ctx: Ctx, input: unknown): Record<string, VoiceSetting> {
  const out: Record<string, VoiceSetting> = {};
  if (input === undefined) return out;
  if (!isRec(input)) {
    ctx.error("wrong-type", "$.voices", `"voices" must be an object but ${describe(input)} was given.`, `Write voices as { "hero": { "voice": "default" } }.`);
    return out;
  }
  for (const speaker of Object.keys(input)) {
    if (UNSAFE_KEYS.has(speaker)) continue;
    const path = `$.voices.${speaker}`;
    const v = input[speaker];
    if (!isRec(v)) {
      ctx.error("wrong-type", path, `A voice setting must be an object but ${describe(v)} was given.`, `Write it as { "voice": "default", "speed": 1 }.`);
      continue;
    }
    checkKnown(ctx, v, path, ["voice", "speed"]);
    out[speaker] = { voice: str(ctx, v, "voice", path, 64) ?? "default", speed: num(ctx, v, "speed", path, 1, 0.5, 2) };
  }
  return out;
}

function readCaptions(ctx: Ctx, input: unknown): CaptionSettings {
  const o = isRec(input) ? input : {};
  if (input !== undefined && !isRec(input)) ctx.error("wrong-type", "$.captions", `"captions" must be an object but ${describe(input)} was given.`, `Write captions as { "style": "pop", "placement": "belowSpeaker" }.`);
  checkKnown(ctx, o, "$.captions", ["enabled", "style", "placement", "highlightColor", "wordsPerGroup", "anchorY", "fontScale", "speakerColors"]);
  const speakerColors: Record<string, string> = {};
  if (has(o, "speakerColors") && o.speakerColors !== undefined) {
    if (!isRec(o.speakerColors)) ctx.error("wrong-type", "$.captions.speakerColors", `"speakerColors" must be an object but ${describe(o.speakerColors)} was given.`, `Write it as { "hero": "#ffd400" }.`);
    else for (const k of Object.keys(o.speakerColors)) {
      if (UNSAFE_KEYS.has(k)) continue;
      const c = normalizeColor(o.speakerColors[k]);
      if (c) speakerColors[k] = c;
      else ctx.error("bad-color", `$.captions.speakerColors.${k}`, `The colour for "${k}" must be a hex colour like "#ffd400".`, `Use # followed by 6 hex digits.`);
    }
  }
  return {
    enabled: bool(ctx, o, "enabled", "$.captions", true),
    style: oneOf(ctx, o, "style", "$.captions", CAPTION_STYLES, "pop"),
    placement: oneOf(ctx, o, "placement", "$.captions", CAPTION_PLACEMENTS, "belowSpeaker"),
    highlightColor: color(ctx, o, "highlightColor", "$.captions", "#ffd400"),
    wordsPerGroup: num(ctx, o, "wordsPerGroup", "$.captions", 3, 1, 6, true),
    anchorY: num(ctx, o, "anchorY", "$.captions", 0.78, 0.1, 0.95),
    fontScale: num(ctx, o, "fontScale", "$.captions", 1, 0.5, 2),
    speakerColors,
  };
}

function readExport(ctx: Ctx, input: unknown): ExportSettings {
  const o = isRec(input) ? input : {};
  if (input !== undefined && !isRec(input)) ctx.error("wrong-type", "$.export", `"export" must be an object but ${describe(input)} was given.`, `Write export as { "format": "mp4", "quality": "high" }.`);
  checkKnown(ctx, o, "$.export", ["format", "quality"]);
  return { format: oneOf(ctx, o, "format", "$.export", EXPORT_FORMATS, "mp4"), quality: oneOf(ctx, o, "quality", "$.export", QUALITIES, "high") };
}

/**
 * Validate and normalise a parsed scene document. Never throws: every problem
 * comes back as an issue with a JSON path, a plain-words message and a fix.
 * `ok` is false when any issue has severity "error"; warnings never block.
 */
export function validateScene(input: unknown, options: ValidateOptions = {}): ValidationResult {
  const ctx = new Ctx(options);
  try {
    if (!isRec(input)) {
      ctx.error("wrong-type", "$", `A scene must be a JSON object but ${describe(input)} was given.`, `Reply with a single JSON object that starts with { and ends with }.`);
      return { ok: false, scene: null, issues: ctx.issues };
    }
    checkKnown(ctx, input, "$", ["version", "settings", "camera", "shots", "lights", "environment", "post", "objects", "layers", "audio", "animations", "dialogue", "voices", "captions", "export"]);
    let version = SCENE_FORMAT_VERSION;
    if (!has(input, "version")) {
      ctx.warn("missing-version", "$.version", `The scene has no "version", so ${SCENE_FORMAT_VERSION} was assumed.`, `Add "version": "${SCENE_FORMAT_VERSION}" at the top.`);
    } else if (typeof input.version !== "string" || !/^\d+\.\d+$/.test(input.version)) {
      ctx.error("bad-version", "$.version", `"version" must be text like "${SCENE_FORMAT_VERSION}" but ${describe(input.version)} was given.`, `Set "version": "${SCENE_FORMAT_VERSION}".`);
    } else if (input.version.split(".")[0] !== SCENE_FORMAT_VERSION.split(".")[0]) {
      ctx.error("unsupported-version", "$.version", `This scene is version ${input.version}, but this app reads version ${SCENE_FORMAT_VERSION.split(".")[0]}.x.`, `Rewrite the scene as version "${SCENE_FORMAT_VERSION}".`);
    } else {
      version = input.version;
      if (input.version.split(".")[1] !== SCENE_FORMAT_VERSION.split(".")[1]) ctx.warn("newer-minor-version", "$.version", `This scene is version ${input.version}; this app reads ${SCENE_FORMAT_VERSION}. Newer features will be ignored.`, `Use version "${SCENE_FORMAT_VERSION}" for best results.`);
    }
    const settings = readSettings(ctx, input.settings);
    const camera = readCamera(ctx, input.camera);
    const lights = readLights(ctx, input.lights);
    const environment = readEnvironment(ctx, input.environment);
    const post = readPost(ctx, input.post);
    const objects = readObjects(ctx, input.objects);
    const shots = readShots(ctx, input.shots, settings.duration);
    const layers = readLayers(ctx, input.layers, settings.duration);
    const audio = readAudio(ctx, input.audio, settings.duration);
    const animations = readAnimations(ctx, input.animations, settings.duration);
    const dialogue = readDialogue(ctx, input.dialogue, settings.duration);
    const voices = readVoices(ctx, input.voices);
    const captions = readCaptions(ctx, input.captions);
    const exp = readExport(ctx, input.export);
    if (ctx.failed) return { ok: false, scene: null, issues: ctx.issues };
    const scene: Scene = { version, settings, camera, shots, lights, environment, post, objects, layers, audio, animations, dialogue, voices, captions, export: exp };
    return { ok: true, scene, issues: ctx.issues };
  } catch (e) {
    // Defensive: a validator bug must still surface as a readable error, never a crash.
    ctx.error("internal", "$", `The scene could not be checked (${e instanceof Error ? e.message : "unknown problem"}).`, `Try simplifying the scene and pasting it again.`);
    return { ok: false, scene: null, issues: ctx.issues };
  }
}

/**
 * Parse pasted text (chatbots often wrap JSON in ``` fences) and validate it.
 * Syntax errors report line and column.
 */
export function parseScene(text: string, options: ValidateOptions = {}): ValidationResult {
  const fail = (code: string, message: string, fix: string): ValidationResult => ({ ok: false, scene: null, issues: [{ severity: "error", code, path: "$", message, fix }] });
  if (typeof text !== "string") return fail("wrong-type", "No scene text was provided.", "Paste the scene JSON.");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > LIMITS.maxJsonBytes) return fail("too-large", `The scene is ${(bytes / 1048576).toFixed(1)} MB; the limit is ${LIMITS.maxJsonBytes / 1048576} MB.`, "Ask the chatbot for a shorter scene.");
  let body = text.trim();
  const fenced = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/.exec(body);
  if (fenced) body = fenced[1].trim();
  if (body === "") return fail("empty", "Nothing was pasted.", "Paste the scene JSON the chatbot wrote.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    let where = "";
    // Engines word syntax errors differently: older ones give "position N", newer ones "line L column C",
    // and some only quote a snippet of the text around the problem. Use whichever is available.
    const pos = /position (\d+)/.exec(msg);
    const lc = /line (\d+) column (\d+)/.exec(msg);
    const snippet = /"(?:\.\.\.)?([\s\S]+?)(?:\.\.\.)?" is not valid JSON/.exec(msg);
    if (pos) {
      const upto = body.slice(0, Number(pos[1]));
      where = ` Near line ${upto.split("\n").length}, column ${upto.length - upto.lastIndexOf("\n")}.`;
    } else if (lc) {
      where = ` Near line ${lc[1]}, column ${lc[2]}.`;
    } else if (snippet) {
      const at = body.indexOf(snippet[1]);
      if (at >= 0) where = ` Near line ${body.slice(0, at).split("\n").length}.`;
    }
    return fail("bad-json", `The text is not valid JSON.${where}`, "Ask the chatbot to reply with the scene JSON only: no comments, no trailing commas, and double quotes around every key.");
  }
  return validateScene(parsed, options);
}
