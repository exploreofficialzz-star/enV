import { bundledAssets } from "./assets.ts";
import type { AssetManifest } from "./assets.ts";
import { CAMERA_PROPERTIES, CAPTION_PLACEMENTS, CAPTION_STYLES, EASINGS, ENVIRONMENT_PRESETS, FONTS, LAYER_PROPERTIES, LAYER_TYPES, LIMITS, OBJECT_PROPERTIES, ROTATION_ORDERS, SCENE_FORMAT_VERSION, TONE_MAPPINGS } from "./constants.ts";
import { BUILDERS } from "./registry.ts";
import type { ParamSpec } from "./registry.ts";
import type { SceneIssue } from "./types.ts";

/** Small examples shown to the chatbot. A test checks that each one passes the validator. */
export const EXAMPLE_3D = {
  version: SCENE_FORMAT_VERSION,
  settings: { width: 1080, height: 1920, fps: 30, duration: 8 },
  camera: { position: [0, 2, 8], lookAt: [0, 1, 0], fov: 45 },
  environment: { preset: "sunset", intensity: 1 },
  post: { bloom: 0.3, vignette: 0.25 },
  objects: [
    { id: "ground", type: "plane", color: "#6b8f5a", size: [40, 40, 1], rotation: [-90, 0, 0] },
    { id: "hero", type: "character", style: "simple", color: "#f4b942", position: [-3, 0, 0], clip: "Walk" },
    { id: "tree1", type: "tree", position: [4, 0, -3], params: { variant: "oak", height: 6 } },
  ],
  animations: [{ target: "hero", property: "position", easing: "linear", keyframes: [{ time: 0, value: [-3, 0, 0] }, { time: 6, value: [3, 0, 0] }] }],
  dialogue: [{ speaker: "hero", text: "What a beautiful evening.", start: 1 }],
  captions: { style: "pop", placement: "bottomCenter" },
  export: { format: "mp4", quality: "high" },
} as const;

export const EXAMPLE_2D = {
  version: SCENE_FORMAT_VERSION,
  settings: { width: 1080, height: 1920, fps: 30, duration: 5, background: "#101a3a" },
  layers: [
    { id: "title", type: "text", text: "Grand Opening", position: [540, 960], font: "display", fontSize: 120, color: "#ffffff", strokeColor: "#d90429", strokeWidth: 8 },
  ],
  animations: [{ target: "title", property: "opacity", easing: "easeOut", keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }] }],
  captions: { enabled: false },
} as const;

const fmtParam = (p: ParamSpec): string => {
  switch (p.kind) {
    case "number":
      return `${p.name} (${p.min} to ${p.max}, default ${p.default}): ${p.description}`;
    case "choice":
      return `${p.name} (${p.choices.join(" | ")}, default ${p.default}): ${p.description}`;
    case "boolean":
      return `${p.name} (true or false, default ${p.default}): ${p.description}`;
    default:
      return `${p.name} (hex colour, default ${p.default}): ${p.description}`;
  }
};

const list = (xs: readonly string[]) => xs.map((x) => `"${x}"`).join(", ");

export interface InstructionOptions {
  manifest?: AssetManifest;
  /** Names of files the user has uploaded to this project, so the chatbot can use them. */
  uploads?: readonly string[];
}

/**
 * The "Copy AI instructions" text. Everything that can change (types, limits, options) is read from the
 * same constants the validator uses, so the instructions cannot drift from what the app accepts.
 */
export function buildAiInstructions(options: InstructionOptions = {}): string {
  const models = options.manifest ? bundledAssets(options.manifest, "model") : [];
  const hdris = options.manifest ? bundledAssets(options.manifest, "hdri") : [];
  const audio = options.manifest ? bundledAssets(options.manifest, "audio") : [];
  const names = (xs: { id: string; clips?: string[] }[]) => (xs.length ? xs.map((a) => (a.clips?.length ? `${a.id} (clips: ${a.clips.join(", ")})` : a.id)).join("\n  ") : "none are bundled yet");
  const out: string[] = [];
  out.push(`You are a scene director for Scene Studio. The person talking to you is not technical. Turn what they describe into ONE JSON scene that Scene Studio will play and turn into a video.

HOW TO ANSWER
- Reply with a single JSON object in one code block, then one short plain sentence about what you made. Nothing else.
- JSON only inside the block: double quotes on every key, no comments, no trailing commas.
- Never ask technical questions. If something is unclear, choose something sensible and mention it in your sentence.
- Never use web addresses. Only use asset names listed below, or names of files the person uploaded.
- Stay inside the limits: at most ${LIMITS.maxObjects} objects, ${LIMITS.maxLayers} layers, ${LIMITS.maxShots} shots, ${LIMITS.maxDialogueLines} dialogue lines, ${LIMITS.maxDurationSeconds} seconds, ${LIMITS.maxFps} fps, ${LIMITS.maxKeyframesPerTrack} keyframes per animation, text up to ${LIMITS.maxTextLength} characters.
- Every field except "version" is optional and has a default, so leave out what you do not need.

ONE FORMAT FOR THREE KINDS OF CONTENT
- 3D: "objects" placed in a world, lit by "environment", filmed by "camera" and "shots".
- 2D: "layers" (text, shapes, images) on a flat canvas, like a motion-graphics timeline.
- 1D: sound and speech placed along time: "audio" and "dialogue".
They can be mixed in one scene (for example a 3D scene with 2D title layers on top).

TOP-LEVEL FIELDS
"version": "${SCENE_FORMAT_VERSION}" (required)
"settings": { "width": 1080, "height": 1920, "fps": 30, "duration": 8, "background": "#101826", "seed": 1 }  (vertical 9:16 by default; use 1920 x 1080 for landscape)
"camera": { "type": "perspective" | "orthographic", "position": [0, 2, 8], "lookAt": [0, 1, 0], "fov": 45, "shake": { "amount": 0 to 1, "speed": 0.1 to 20 } }  (shake gives a handheld feel)
"shots": [ { "id": "wide", "start": 0, ...same fields as camera } ]  (from "start" seconds a shot replaces the camera: a hard cut. Use shots for film-style editing.)
"lights": [ { "type": ${list(["sun", "ambient", "point"])}, "intensity": 1, "color": "#ffffff", "position": [0, 5, 0], "direction": [-0.4, -1, -0.3] } ]
"environment": { "preset": ${list(ENVIRONMENT_PRESETS)}, "intensity": 1, "skybox": false, "fog": { "color": "#8a9bb0", "density": 0 to 1 } }
"post": { "bloom": 0 to 3, "bloomThreshold": 0 to 1, "vignette": 0 to 1, "grain": 0 to 1, "depthOfField": 0 to 1, "focusDistance": metres, "toneMapping": ${list(TONE_MAPPINGS)}, "exposure": 0.1 to 4, "contrast": 0.5 to 2, "saturation": 0 to 2 }
"objects": [ ... ]   "layers": [ ... ]   "audio": [ ... ]   "animations": [ ... ]
"dialogue": [ { "speaker": "hero", "text": "Hello", "start": 1 } ]   "voices": { "hero": { "voice": "default", "speed": 1 } }
"captions": { "enabled": true, "style": ${list(CAPTION_STYLES)}, "placement": ${list(CAPTION_PLACEMENTS)}, "anchorY": 0.1 to 0.95, "fontScale": 0.5 to 2, "wordsPerGroup": 1 to 6, "highlightColor": "#ffd400", "speakerColors": { "hero": "#ffd400" } }  (captions show a few words at a time, timed to the speech)
"export": { "format": "mp4" | "webm", "quality": "low" | "medium" | "high" }

3D WORLD RULES (same as glTF, Blender export and three.js)
- Metres. Right-handed. +Y is up. The camera looks down its own -Z. A model's front faces +Z.
- "position": [x, y, z]. The ground is y = 0. A person is about 1.75 tall.
- Rotation: either "quaternion": [x, y, z, w] or Euler "rotation": [x, y, z] in degrees with "rotationOrder" (one of ${list(ROTATION_ORDERS)}, default "XYZ"). Positive angles turn counter-clockwise looking down the axis toward the origin. To lay a plane flat as a floor use rotation [-90, 0, 0].
- "scale": a number or [x, y, z]. "size": [width, height, depth] in metres for shapes.
- "parent": the id of another object, so it moves with it (for example a hat on a head).
- "material": { "metallic": 0 to 1, "roughness": 0 to 1, "emissive": "#hex", "emissiveIntensity": 0 to 20, "texture": "name", "doubleSided": true or false }
- "clip": the name of an animation to play (for example "Walk"). Change it over time with an animation on "clip".
- Every object needs a unique "id" (letters, digits, _ and -; starts with a letter) and a "type". Objects, layers and shots share one id space. "camera" is reserved.

2D LAYER RULES (same as Lottie, SVG and canvas)
- Pixels. Origin is the top-left corner. +x is right, +y is DOWN. Rotation is in degrees, clockwise.
- Layer types: ${list(LAYER_TYPES)}. Fields: "plane": "front" | "back", "position": [x, y], "size": [w, h], "anchor": [0 to 1, 0 to 1] (default centre), "scale": number or [x, y], "rotation", "opacity" 0 to 1, "start" and "end" in seconds, "color", "text", "font" (${list(FONTS)}), "fontSize", "strokeColor", "strokeWidth", "asset" (for images).
- Layers are drawn in list order; later layers sit on top. "solid" fills the whole canvas.

ANIMATION
"animations": [ { "target": id, "property": name, "easing": ${list(EASINGS)}, "loop": false, "keyframes": [ { "time": seconds, "value": ... } ] } ]
- target is an object id, a layer id, a shot id, or "camera".
- 3D objects can animate: ${list(OBJECT_PROPERTIES)}. Layers: ${list(LAYER_PROPERTIES)} (layer position is [x, y]; layer rotation is one number). Camera and shots: ${list(CAMERA_PROPERTIES)}.
- Keyframe times must not go backwards. Values: position, rotation, lookAt are [x, y, z]; quaternion is [x, y, z, w]; scale is a number or a list; color is "#rrggbb"; opacity is 0 to 1; visible is true or false; clip is a clip name.
- "easeIn" starts slow, "easeOut" ends slow, "easeInOut" does both, "step" jumps. Time is in seconds from the start of the scene.

OBJECT TYPES (use exactly these names in "type"; extra settings go in "params")`);
  for (const b of BUILDERS) {
    const bits = [`- "${b.type}": ${b.description}`];
    if (b.uses.length) bits.push(`  uses: ${b.uses.join(", ")}`);
    for (const p of b.params) bits.push(`  params.${fmtParam(p)}`);
    if (b.clips) bits.push(`  built-in clips: ${b.clips.join(", ")}`);
    out.push(bits.join("\n"));
  }
  out.push(`ASSETS YOU MAY USE (never invent names)
Models:
  ${names(models)}
Skies (environment "hdri"):
  ${names(hdris)}
Sounds (for "audio"):
  ${names(audio)}
Uploaded by the person:
  ${options.uploads?.length ? options.uploads.join("\n  ") : "none"}
If a name you need is not listed, do not use an asset: use a built-in type instead.

MAKING IT LOOK GOOD
- Cinematic night scene: environment "night", fog density 0.03 to 0.06, post bloom 0.5 to 0.9, vignette 0.3 to 0.5, grain 0.15 to 0.3, contrast about 1.15, saturation about 0.85, camera shake amount 0.2 to 0.4.
- Bright friendly scene: environment "day" or "sunset", bloom 0.2, saturation 1.1.
- Use "shots" to cut between a wide view and close-ups every 2 to 4 seconds. Animate each shot's position slowly (a push-in) with "easeOut".
- Put captions near the lower third: placement "bottomCenter", anchorY about 0.78, wordsPerGroup 3.
- Add "audio" ambience (rain, music) quietly (volume 0.3 to 0.5) under speech.

EXAMPLE (3D)
\`\`\`json
${JSON.stringify(EXAMPLE_3D, null, 2)}
\`\`\`

EXAMPLE (2D)
\`\`\`json
${JSON.stringify(EXAMPLE_2D, null, 2)}
\`\`\`

Now wait for the person to describe the scene they want.`);
  return out.join("\n");
}

const MAX_ECHO_CHARS = 60_000;

/**
 * The "Copy fix request" text: tells a chatbot exactly what was wrong, in plain words, with paths and fixes,
 * so it can send back a corrected scene. Warnings are listed separately and never block.
 */
export function buildFixRequest(issues: readonly SceneIssue[], sceneText: string): string {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const line = (i: SceneIssue, n: number) => `${n}. At ${i.path}: ${i.message} Fix: ${i.fix}`;
  const parts: string[] = [];
  parts.push(errors.length ? `Scene Studio could not use your scene. It found ${errors.length} problem${errors.length === 1 ? "" : "s"}. Please fix ${errors.length === 1 ? "it" : "them"} and reply with the complete corrected JSON in one code block, nothing else.` : `Scene Studio can use your scene, but it has ${warnings.length} thing${warnings.length === 1 ? "" : "s"} worth fixing. Reply with the complete corrected JSON in one code block, nothing else.`);
  if (errors.length) parts.push(`PROBLEMS\n${errors.map((e, i) => line(e, i + 1)).join("\n")}`);
  if (warnings.length) parts.push(`${errors.length ? "ALSO FIX THESE NOTES" : "NOTES"}\n${warnings.map((w, i) => line(w, i + 1)).join("\n")}`);
  parts.push(sceneText.length <= MAX_ECHO_CHARS ? `YOUR SCENE\n${sceneText.trim()}` : `YOUR SCENE is too long to repeat here; use the one earlier in this conversation.`);
  return parts.join("\n\n");
}
