/**
 * Scene Studio scene format — shared constants.
 *
 * Status: DRAFT. The format is held at "1.0-draft" until the owner approves
 * the JSON Schema (apps/shared/scene-studio/scene-v1.schema.json). Kotlin and
 * Swift ports must mirror these values; a test keeps the JSON Schema and this
 * file in step.
 */
export const SCENE_FORMAT_VERSION = "1.0";
export const SCENE_SCHEMA_LOCKED = false;

/** Limits are assumptions chosen for low-end Android phones; owner may tune them. */
export const LIMITS = {
  maxJsonBytes: 1_048_576,
  maxObjects: 200,
  maxLights: 8,
  maxLayers: 100,
  maxShots: 50,
  maxAudioTracks: 16,
  maxAnimations: 400,
  maxKeyframesPerTrack: 500,
  maxDialogueLines: 200,
  maxTextLength: 500,
  maxParams: 32,
  maxDurationSeconds: 120,
  maxFps: 60,
  maxFrames: 7200,
  minDimension: 64,
  maxDimension: 4096,
  maxCoordinate: 10_000,
  maxIdLength: 64,
} as const;

export const EASINGS = ["linear", "easeIn", "easeOut", "easeInOut", "step"] as const;
/** 3D object tracks. "quaternion" is glTF-native (slerp); "clip" switches a GLB animation clip (step). */
export const OBJECT_PROPERTIES = ["position", "rotation", "quaternion", "scale", "color", "opacity", "visible", "clip"] as const;
/** Tracks for the base camera and for every shot. */
export const CAMERA_PROPERTIES = ["position", "lookAt", "fov"] as const;
/** 2D layer tracks (pixels, origin top-left, +y down, rotation clockwise degrees). */
export const LAYER_PROPERTIES = ["position", "scale", "rotation", "opacity", "color", "visible"] as const;
/**
 * Euler rotation orders, as named by three.js and Blender ("XYZ" is the default of both).
 * "XYZ" means R = Rx · Ry · Rz, i.e. a vector is rotated about Z first, then Y, then X (extrinsic axes).
 */
export const ROTATION_ORDERS = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"] as const;
export const ENVIRONMENT_PRESETS = ["studio", "day", "sunset", "night", "overcast", "none"] as const;
export const TONE_MAPPINGS = ["aces", "neutral", "none"] as const;
export const LAYER_TYPES = ["solid", "rect", "ellipse", "text", "image"] as const;
export const LAYER_PLANES = ["front", "back"] as const;
export const FONTS = ["sans", "serif", "display", "mono"] as const;
export const LIGHT_TYPES = ["sun", "ambient", "point"] as const;
export const CAMERA_TYPES = ["perspective", "orthographic"] as const;
export const CAPTION_STYLES = ["pop", "classic"] as const;
export const CAPTION_PLACEMENTS = ["belowSpeaker", "bottomCenter"] as const;
export const EXPORT_FORMATS = ["mp4", "webm"] as const;
export const QUALITIES = ["low", "medium", "high"] as const;

/** Reserved animation target for the scene camera. Objects, layers and shots may not use this id. */
export const CAMERA_TARGET = "camera";
export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
