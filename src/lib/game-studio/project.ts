import { z } from "zod";

export const MAX_ASSET_BYTES = 15 * 1024 * 1024;
const finite = z.number().finite().min(-10000).max(10000);
const vector = z.object({ x: finite, y: finite, z: finite });
const assetSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(160),
  kind: z.enum(["glb", "artboard"]),
  dataUrl: z.string().max(Math.ceil((MAX_ASSET_BYTES * 4) / 3) + 128),
  source: z
    .object({
      projectId: z.string().max(120),
      screenId: z.string().max(120),
      updatedAt: z.string().max(80),
    })
    .optional(),
  width: z.number().int().positive().max(4096).optional(),
  height: z.number().int().positive().max(4096).optional(),
});
const objectSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(160),
  kind: z.enum(["box", "sphere", "cylinder", "ground", "artboard", "model"]),
  assetId: z.string().max(120).optional(),
  position: vector,
  rotation: vector,
  scale: vector,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  visible: z.boolean(),
  locked: z.boolean(),
  collider: z.boolean(),
  player: z.boolean(),
  speed: z.number().finite().min(0.1).max(20),
});
const projectSchema = z.object({
  format: z.literal("env-3d-game"),
  version: z.literal(1),
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(100),
  objects: z.array(objectSchema).max(500),
  assets: z.array(assetSchema).max(100),
});
export type GameProject = z.infer<typeof projectSchema>;
export type GameObject = z.infer<typeof objectSchema>;
export type GameAsset = z.infer<typeof assetSchema>;
export type ObjectKind = GameObject["kind"];
export type Vector = GameObject["position"];

export function id() {
  return globalThis.crypto.randomUUID();
}
export function blankProject(): GameProject {
  return {
    format: "env-3d-game",
    version: 1,
    id: id(),
    name: "Untitled world",
    objects: [],
    assets: [],
  };
}
export function makeObject(kind: ObjectKind, name?: string): GameObject {
  return {
    id: id(),
    name:
      name ||
      {
        box: "Cube",
        sphere: "Sphere",
        cylinder: "Cylinder",
        ground: "Ground",
        artboard: "Artboard",
        model: "Model",
      }[kind],
    kind,
    position: { x: 0, y: kind === "ground" ? 0 : 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: kind === "ground" ? { x: 10, y: 1, z: 10 } : { x: 1, y: 1, z: 1 },
    color: kind === "ground" ? "#768b7b" : "#2bb6a4",
    visible: true,
    locked: false,
    collider: kind === "ground",
    player: false,
    speed: 3,
  };
}
export type GameTemplate = "starter" | "courtyard" | "gallery";
export function starterProject(template: GameTemplate = "starter"): GameProject {
  const p = blankProject();
  p.name = { starter: "Starter world", courtyard: "Courtyard explorer", gallery: "Gallery room" }[
    template
  ];
  const ground = makeObject("ground");
  const player = {
    ...makeObject("box", "Player"),
    position: { x: 0, y: 0.5, z: 0 },
    color: "#25ad9c",
    player: true,
  };
  const block = {
    ...makeObject("box", "Obstacle"),
    position: { x: 2, y: 0.5, z: 2 },
    color: "#f6bb82",
    collider: true,
  };
  if (template === "courtyard") {
    ground.scale = { x: 16, y: 1, z: 16 };
    ground.color = "#a7b99d";
    const pillar = (name: string, x: number, z: number): GameObject => ({
      ...makeObject("cylinder", name),
      position: { x, y: 1, z },
      scale: { x: 1, y: 2, z: 1 },
      color: "#e0c7a6",
      collider: true,
    });
    p.objects = [
      ground,
      player,
      pillar("Pillar 1", -3, 3),
      pillar("Pillar 2", 3, 3),
      pillar("Pillar 3", -3, -3),
      pillar("Pillar 4", 3, -3),
      block,
    ];
  } else if (template === "gallery") {
    ground.scale = { x: 12, y: 1, z: 10 };
    ground.color = "#d3d5ce";
    const wall = (name: string, x: number, z: number, sx: number, sz: number): GameObject => ({
      ...makeObject("box", name),
      position: { x, y: 1.5, z },
      scale: { x: sx, y: 3, z: sz },
      color: "#ece7df",
      collider: true,
    });
    p.objects = [
      ground,
      player,
      wall("Back wall", 0, 4.5, 12, 0.2),
      wall("Left wall", -5.9, 0, 0.2, 9),
      wall("Right wall", 5.9, 0, 0.2, 9),
      { ...block, name: "Display plinth", position: { x: 0, y: 0.5, z: 2.5 }, color: "#e4c4a7" },
    ];
  } else p.objects = [ground, player, block];
  return p;
}

export function validateProject(input: unknown): GameProject {
  const result = projectSchema.safeParse(input);
  if (!result.success)
    throw new Error("This is not a valid enV 3D Studio project, or its version is unsupported.");
  const p = result.data;
  if (
    new Set(p.objects.map((o) => o.id)).size !== p.objects.length ||
    new Set(p.assets.map((a) => a.id)).size !== p.assets.length
  )
    throw new Error("The project contains duplicate IDs.");
  if (p.objects.filter((o) => o.player).length > 1)
    throw new Error("A project can have only one player.");
  for (const asset of p.assets) {
    const prefix =
      asset.kind === "glb" ? "data:model/gltf-binary;base64," : "data:image/png;base64,";
    if (
      !asset.dataUrl.startsWith(prefix) ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.dataUrl.slice(prefix.length))
    )
      throw new Error(`Asset “${asset.name}” is invalid or unsupported.`);
    const bytes = base64Bytes(asset.dataUrl.slice(prefix.length));
    if (bytes.length > MAX_ASSET_BYTES) throw new Error(`Asset “${asset.name}” is too large.`);
    if (asset.kind === "glb") validateGlb(bytes);
    else {
      const image = validatePng(bytes);
      if (
        (asset.width && asset.width !== image.width) ||
        (asset.height && asset.height !== image.height)
      )
        throw new Error(`Artboard “${asset.name}” has inconsistent image dimensions.`);
    }
  }
  for (const o of p.objects) {
    if (o.scale.x <= 0 || o.scale.y <= 0 || o.scale.z <= 0)
      throw new Error(`Object “${o.name}” must have a positive scale.`);
    if (o.kind === "artboard" || o.kind === "model") {
      const asset = p.assets.find((a) => a.id === o.assetId);
      if (!asset || asset.kind !== (o.kind === "model" ? "glb" : "artboard"))
        throw new Error(`Object “${o.name}” has a missing or incompatible asset.`);
    }
  }
  return p;
}
const pngCrcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

/** Check PNG chunk bounds and CRCs before a stored or imported Artboard is trusted. */
export function validatePng(bytes: Uint8Array): { width: number; height: number } {
  const invalid = () => new Error("The Artboard image is not a valid PNG.");
  if (
    bytes.length < 45 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  )
    throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8,
    width = 0,
    height = 0,
    hasPixels = false,
    ended = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    if (length > bytes.length - offset - 12) throw invalid();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    let crc = 0xffffffff;
    for (let index = offset + 4; index < offset + 8 + length; index++)
      crc = pngCrcTable[(crc ^ bytes[index]) & 255] ^ (crc >>> 8);
    if ((crc ^ 0xffffffff) >>> 0 !== view.getUint32(offset + 8 + length, false)) throw invalid();
    if (offset === 8) {
      if (type !== "IHDR" || length !== 13) throw invalid();
      width = view.getUint32(offset + 8, false);
      height = view.getUint32(offset + 12, false);
      if (!width || !height || width > 4096 || height > 4096) throw invalid();
    } else if (type === "IHDR") throw invalid();
    if (type === "IDAT") hasPixels = true;
    offset += length + 12;
    if (type === "IEND") {
      if (length !== 0 || offset !== bytes.length) throw invalid();
      ended = true;
      break;
    }
  }
  if (!ended || !hasPixels) throw invalid();
  return { width, height };
}
function base64Bytes(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("The model data is not valid base64.");
  }
}
export function validateGlb(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error("Models must be 15 MB or smaller.");
  if (bytes.byteLength < 20) throw new Error("This file is not a valid GLB model.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error("Choose a valid glTF 2.0 GLB file.");
  const jsonLength = view.getUint32(12, true);
  if (jsonLength < 2 || jsonLength > bytes.byteLength - 20)
    throw new Error("The GLB JSON chunk is incomplete.");
  let gltf: { asset?: { version?: string }; extensionsUsed?: unknown };
  try {
    gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  } catch {
    throw new Error("The GLB contains invalid model data.");
  }
  if (gltf.asset?.version !== "2.0") throw new Error("Only glTF 2.0 models are supported.");
  const externalResource = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(externalResource);
    return Object.entries(value).some(
      ([key, item]) =>
        (key === "uri" && typeof item === "string" && !item.startsWith("data:")) ||
        externalResource(item),
    );
  };
  if (externalResource(gltf))
    throw new Error(
      "This GLB refers to external files. Embed its textures and buffers before importing.",
    );
  if (
    Array.isArray(gltf.extensionsUsed) &&
    gltf.extensionsUsed.some((extension) =>
      ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"].includes(
        extension,
      ),
    )
  )
    throw new Error(
      "This model uses compressed geometry or textures that need an external decoder. Export an uncompressed GLB and try again.",
    );
}
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}
