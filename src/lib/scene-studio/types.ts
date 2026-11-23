import type {
  CAMERA_PROPERTIES,
  CAMERA_TYPES,
  CAPTION_PLACEMENTS,
  CAPTION_STYLES,
  EASINGS,
  ENVIRONMENT_PRESETS,
  EXPORT_FORMATS,
  FONTS,
  LAYER_PLANES,
  LAYER_PROPERTIES,
  LAYER_TYPES,
  LIGHT_TYPES,
  OBJECT_PROPERTIES,
  QUALITIES,
  ROTATION_ORDERS,
  TONE_MAPPINGS,
} from "./constants.ts";

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
/** Quaternion [x, y, z, w], always unit length after validation (glTF convention). */
export type Vec4 = [number, number, number, number];
export type Easing = (typeof EASINGS)[number];
export type Quality = (typeof QUALITIES)[number];
export type ParamValue = string | number | boolean;
export type TrackValue = number | Vec2 | Vec3 | Vec4 | string | boolean;

/**
 * 3D coordinate system — the glTF 2.0 / three.js convention (also stated in the chatbot prompt template):
 * right-handed, +Y up, units are metres, cameras look down their local -Z, a model's front faces +Z.
 * Rotations: either `quaternion` [x, y, z, w] (glTF native) or Euler `rotation` in degrees with an explicit
 * `rotationOrder` (default "XYZ", the Blender and three.js default). Positive angles are counter-clockwise
 * looking down the axis toward the origin (right-hand rule). Babylon renders with useRightHandedSystem = true.
 * 2D layers use the Lottie/SVG/canvas convention instead: pixels, origin top-left, +y down, clockwise degrees.
 */
export interface SceneSettings {
  width: number;
  height: number;
  fps: number;
  /** Seconds. Scene time is always frame / fps, never the wall clock. */
  duration: number;
  background: string;
  /** Seed for any randomness a builder uses, so every frame is reproducible. */
  seed: number;
}

export interface SceneCamera {
  type: (typeof CAMERA_TYPES)[number];
  position: Vec3;
  lookAt: Vec3;
  /** Vertical field of view in degrees (perspective only). */
  fov: number;
  /** Deterministic handheld shake. amount 0 = steady. */
  shake: { amount: number; speed: number };
}

/** A camera that takes over from `start` seconds until the next shot starts (a hard cut). */
export interface SceneShot extends SceneCamera {
  id: string;
  start: number;
}

export interface MaterialSettings {
  metallic: number;
  roughness: number;
  emissive?: string;
  emissiveIntensity: number;
  /** Texture asset name (library or uploaded image). */
  texture?: string;
  doubleSided: boolean;
}

export interface SceneEnvironment {
  preset: (typeof ENVIRONMENT_PRESETS)[number];
  /** Image-based lighting strength. */
  intensity: number;
  /** Optional HDRI asset (library or uploaded). Overrides the preset's lighting image. */
  hdri?: string;
  /** Draw the environment as the sky instead of the flat background colour. */
  skybox: boolean;
  fog: { color: string; density: number };
}

/** Post-processing, kept flat and bounded so chatbots get it right. 0 / 1 values leave the picture unchanged. */
export interface ScenePost {
  bloom: number;
  bloomThreshold: number;
  vignette: number;
  grain: number;
  /** Depth-of-field blur strength; 0 is off. */
  depthOfField: number;
  /** Distance in metres that stays sharp when depthOfField is on. */
  focusDistance: number;
  toneMapping: (typeof TONE_MAPPINGS)[number];
  exposure: number;
  contrast: number;
  saturation: number;
}

export interface SceneLayer {
  id: string;
  type: (typeof LAYER_TYPES)[number];
  plane: (typeof LAYER_PLANES)[number];
  /** Pixels, origin top-left. */
  position: Vec2;
  /** Width and height in pixels. */
  size: Vec2;
  /** Point inside the layer that position, scale and rotation act around, as 0..1 fractions. */
  anchor: Vec2;
  scale: Vec2;
  /** Clockwise degrees. */
  rotation: number;
  opacity: number;
  /** Seconds the layer is on screen. */
  start: number;
  end: number;
  visible: boolean;
  color?: string;
  text?: string;
  font: (typeof FONTS)[number];
  fontSize: number;
  strokeColor?: string;
  strokeWidth: number;
  asset?: string;
}

/** 1D content: sound laid out along the single time axis. */
export interface AudioTrack {
  id: string;
  asset: string;
  start: number;
  volume: number;
  loop: boolean;
}

export interface SceneLight {
  type: (typeof LIGHT_TYPES)[number];
  intensity: number;
  color: string;
  /** point lights only */
  position: Vec3;
  /** sun lights only: direction the light travels */
  direction: Vec3;
}

export interface SceneObject {
  id: string;
  /** Builder type name. Unknown types fall back at build time, not here. */
  type: string;
  rotationOrder: (typeof ROTATION_ORDERS)[number];
  /** When present it wins over `rotation`. */
  quaternion?: Vec4;
  material?: MaterialSettings;
  /** Initial animation clip name from a GLB (e.g. "Swim"). Switch later with a "clip" track. */
  clip?: string;
  clipSpeed: number;
  asset?: string;
  style?: string;
  color?: string;
  text?: string;
  size?: Vec3;
  params: Record<string, ParamValue>;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  visible: boolean;
  opacity: number;
  parent?: string;
}

export interface Keyframe {
  time: number;
  value: TrackValue;
  easing?: Easing;
}

export interface AnimationTrack {
  /** An object id, a layer id, a shot id, or "camera". */
  target: string;
  property: (typeof OBJECT_PROPERTIES)[number] | (typeof CAMERA_PROPERTIES)[number] | (typeof LAYER_PROPERTIES)[number];
  easing: Easing;
  loop: boolean;
  keyframes: Keyframe[];
}

export interface DialogueLine {
  speaker: string;
  text: string;
  /** Seconds from scene start. */
  start: number;
}

export interface VoiceSetting {
  voice: string;
  speed: number;
}

export interface CaptionSettings {
  enabled: boolean;
  style: (typeof CAPTION_STYLES)[number];
  placement: (typeof CAPTION_PLACEMENTS)[number];
  highlightColor: string;
  wordsPerGroup: number;
  /** Vertical position of the caption block for bottomCenter placement, as a fraction of frame height from the top. */
  anchorY: number;
  /** Multiplier on the automatic caption font size. */
  fontScale: number;
  speakerColors: Record<string, string>;
}

export interface ExportSettings {
  format: (typeof EXPORT_FORMATS)[number];
  quality: Quality;
}

/** A fully defaulted, validated scene. Every optional field has a value. */
export interface Scene {
  version: string;
  settings: SceneSettings;
  camera: SceneCamera;
  shots: SceneShot[];
  lights: SceneLight[];
  environment: SceneEnvironment;
  post: ScenePost;
  objects: SceneObject[];
  layers: SceneLayer[];
  audio: AudioTrack[];
  animations: AnimationTrack[];
  dialogue: DialogueLine[];
  voices: Record<string, VoiceSetting>;
  captions: CaptionSettings;
  export: ExportSettings;
}

export type IssueSeverity = "error" | "warning";

/** Plain-words problem report. `fix` is written so it can be pasted back to a chatbot. */
export interface SceneIssue {
  severity: IssueSeverity;
  /** Stable machine code, e.g. "unknown-field". */
  code: string;
  /** JSON path such as `$.objects[2].position`. */
  path: string;
  message: string;
  fix: string;
}

export interface ValidationResult {
  ok: boolean;
  /** Present only when ok is true. */
  scene: Scene | null;
  issues: SceneIssue[];
}

export interface ValidateOptions {
  /** Builder registry type names. When given, other types produce a fallback warning. */
  knownTypes?: readonly string[];
}
