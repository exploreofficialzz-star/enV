/**
 * Builds the 3D objects of a scene with Babylon.js: shapes, props, characters, water, particles, text, models.
 * Everything that moves is a pure function of the scene time (see particles.ts, water.ts, character-poses.ts),
 * never of the wall clock, so any frame can be drawn on its own.
 *
 * NOTE: this file needs a browser with WebGL and the `babylonjs` package, so it is not run by the Node tests.
 * The maths it applies is tested in render-math.test.ts and frame-state.test.ts.
 */
import * as B from "babylonjs";
import "babylonjs-loaders";
import type { ObjectState } from "./frame-state.ts";
import type { ObjectPlan } from "./object-plan.ts";
import { poseFor, resolveClip } from "./character-poses.ts";
import { EMITTER_ADDITIVE, EMITTER_COLORS, hash01, particleAt, particleCount } from "./particles.ts";
import type { EmitterType } from "./particles.ts";
import type { QualityPlan } from "./render-look.ts";
import type { SceneObject, Vec3 } from "./types.ts";
import { waveHeightAt } from "./water.ts";

export interface AssetBytes {
  /** The file's bytes, or null when it is not available. */
  get(name: string): Promise<Uint8Array | null>;
}

export interface BuildContext {
  scene: B.Scene;
  quality: QualityPlan;
  qualityName: "low" | "medium" | "high";
  seed: number;
  shadows: B.ShadowGenerator | null;
  assets: AssetBytes;
  softSprite: B.Texture;
}

export interface UpdateContext {
  time: number;
  /** Camera basis in world space, for billboards. */
  right: B.Vector3;
  up: B.Vector3;
  position: B.Vector3;
}

export interface BuiltObject {
  root: B.TransformNode;
  /** The meshes that belong to this object only (not those of objects parented to it); fading applies to these. */
  ownMeshes: B.AbstractMesh[];
  /** Colour animation target. */
  tint(hex: string): void;
  update(state: ObjectState, uc: UpdateContext): void;
  dispose(): void;
}

const DEG = Math.PI / 180;
const c3 = (hex: string) => B.Color3.FromHexString(/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#808080");
const v3 = (v: Vec3) => new B.Vector3(v[0], v[1], v[2]);

interface MaterialLook {
  metallic: number;
  roughness: number;
  emissive?: string;
  emissiveIntensity: number;
  doubleSided: boolean;
}

function lookOf(o: SceneObject, defaults: Partial<MaterialLook> = {}): MaterialLook {
  const m = o.material;
  return {
    metallic: m?.metallic ?? defaults.metallic ?? 0,
    roughness: m?.roughness ?? defaults.roughness ?? 0.6,
    emissive: m?.emissive ?? defaults.emissive,
    emissiveIntensity: m?.emissiveIntensity ?? defaults.emissiveIntensity ?? 1,
    doubleSided: m?.doubleSided ?? defaults.doubleSided ?? false,
  };
}

/** Lights fade out over their `range` the same way for every material, built-in or from a model file. */
function useStandardFalloff(mat: B.PBRMaterial): void {
  mat.usePhysicalLightFalloff = false;
  mat.useGLTFLightFalloff = false;
}

function pbr(ctx: BuildContext, name: string, hex: string, look: MaterialLook): B.PBRMaterial {
  const mat = new B.PBRMaterial(name, ctx.scene);
  useStandardFalloff(mat);
  mat.albedoColor = c3(hex);
  mat.metallic = look.metallic;
  mat.roughness = look.roughness;
  if (look.emissive) {
    mat.emissiveColor = c3(look.emissive);
    mat.emissiveIntensity = look.emissiveIntensity;
  }
  mat.backFaceCulling = !look.doubleSided;
  mat.twoSidedLighting = look.doubleSided;
  mat.maxSimultaneousLights = 8;
  return mat;
}

function glow(ctx: BuildContext, name: string, hex: string, strength = 1): B.StandardMaterial {
  const mat = new B.StandardMaterial(name, ctx.scene);
  mat.disableLighting = true;
  mat.emissiveColor = c3(hex).scale(strength);
  return mat;
}

/** Wraps everything a builder makes under one root and keeps the lists the shared behaviour needs. */
class Kit {
  readonly root: B.TransformNode;
  readonly tinted: B.PBRMaterial[] = [];
  readonly disposables: { dispose(): void }[] = [];
  constructor(readonly ctx: BuildContext, id: string) {
    this.root = new B.TransformNode(id, ctx.scene);
  }
  mesh<T extends B.AbstractMesh>(m: T, parent: B.TransformNode = this.root, castShadow = true): T {
    m.parent = parent;
    m.receiveShadows = true;
    if (castShadow) this.ctx.shadows?.addShadowCaster(m);
    return m;
  }
  node(name: string, parent: B.TransformNode = this.root): B.TransformNode {
    const n = new B.TransformNode(name, this.ctx.scene);
    n.parent = parent;
    return n;
  }
  /** A PBR material that colour animation also changes. */
  tintable(name: string, hex: string, look: MaterialLook): B.PBRMaterial {
    const mat = pbr(this.ctx, name, hex, look);
    this.tinted.push(mat);
    return mat;
  }
  built(update: BuiltObject["update"] = () => undefined): BuiltObject {
    return {
      root: this.root,
      ownMeshes: [],
      tint: (hex) => {
        for (const m of this.tinted) m.albedoColor = c3(hex);
      },
      update,
      dispose: () => {
        for (const d of this.disposables) d.dispose();
        this.root.dispose(false, true);
      },
    };
  }
}

const size3 = (o: SceneObject, fallback: Vec3 = [1, 1, 1]): Vec3 => o.size ?? fallback;
const num = (p: ObjectPlan, name: string): number => p.params[name] as number;
const str = (p: ObjectPlan, name: string): string => p.params[name] as string;

// ---- simple shapes ---------------------------------------------------------------------------

function shapeMesh(ctx: BuildContext, type: string, o: SceneObject, p: ObjectPlan): B.Mesh {
  const s = ctx.scene;
  switch (type) {
    case "sphere": return B.MeshBuilder.CreateSphere(o.id, { diameter: 1, segments: 32 }, s);
    case "cylinder": return B.MeshBuilder.CreateCylinder(o.id, { height: 1, diameter: 1, tessellation: 48 }, s);
    case "cone": return B.MeshBuilder.CreateCylinder(o.id, { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: 48 }, s);
    case "capsule": return B.MeshBuilder.CreateCapsule(o.id, { height: 1, radius: 0.25, tessellation: 24 }, s);
    case "plane": return B.MeshBuilder.CreatePlane(o.id, { width: 1, height: 1, sideOrientation: B.Mesh.DOUBLESIDE }, s);
    case "torus": return B.MeshBuilder.CreateTorus(o.id, { diameter: 1, thickness: num(p, "tube"), tessellation: 48 }, s);
    default: return B.MeshBuilder.CreateBox(o.id, { size: 1 }, s);
  }
}

function buildShape(ctx: BuildContext, o: SceneObject, p: ObjectPlan, color: string): BuiltObject {
  const kit = new Kit(ctx, o.id);
  const mesh = kit.mesh(shapeMesh(ctx, p.type, o, p), kit.root, p.type !== "plane");
  const [sx, sy, sz] = size3(o);
  // a capsule is 0.5 wide for a height of 1, so its width is doubled to make `size` the box it fits in
  mesh.scaling = p.type === "capsule" ? new B.Vector3(sx * 2, sy, sz * 2) : new B.Vector3(sx, sy, sz);
  const mat = kit.tintable(`${o.id}-material`, color, lookOf(o, { roughness: 0.55, doubleSided: p.type === "plane" }));
  mesh.material = mat;
  return kit.built();
}

// ---- props -----------------------------------------------------------------------------------

function buildTree(kit: Kit, o: SceneObject, p: ObjectPlan): void {
  const h = num(p, "height");
  const variant = str(p, "variant");
  const trunk = kit.ctx.scene;
  const bark = pbr(kit.ctx, `${o.id}-bark`, "#5b4030", { metallic: 0, roughness: 0.95, emissiveIntensity: 1, doubleSided: false });
  const leaf = kit.tintable(`${o.id}-leaf`, o.color ?? (variant === "pine" ? "#2f6b3f" : "#3f8a4a"), { metallic: 0, roughness: 0.85, emissiveIntensity: 1, doubleSided: false });
  const add = (m: B.Mesh, y: number, mat: B.Material) => {
    m.position.y = y;
    m.material = mat;
    kit.mesh(m);
    return m;
  };
  if (variant === "pine") {
    add(B.MeshBuilder.CreateCylinder(`${o.id}-trunk`, { height: h * 0.25, diameter: h * 0.06 }, trunk), h * 0.125, bark);
    for (let i = 0; i < 4; i++) {
      const w = h * (0.34 - i * 0.07);
      add(B.MeshBuilder.CreateCylinder(`${o.id}-tier${i}`, { height: h * 0.3, diameterTop: 0, diameterBottom: w, tessellation: 24 }, trunk), h * (0.28 + i * 0.17), leaf);
    }
  } else if (variant === "palm") {
    const t = add(B.MeshBuilder.CreateCylinder(`${o.id}-trunk`, { height: h * 0.85, diameterTop: h * 0.03, diameterBottom: h * 0.05 }, trunk), h * 0.425, bark);
    t.rotation.z = 0.08;
    for (let i = 0; i < 7; i++) {
      const frond = B.MeshBuilder.CreatePlane(`${o.id}-frond${i}`, { width: h * 0.12, height: h * 0.45, sideOrientation: B.Mesh.DOUBLESIDE }, trunk);
      const arm = kit.node(`${o.id}-frondpivot${i}`);
      arm.position.y = h * 0.85;
      arm.rotation.y = (i / 7) * Math.PI * 2;
      frond.parent = arm;
      frond.position.set(0, -h * 0.05, h * 0.2);
      frond.rotation.x = 1.1;
      frond.material = leaf;
      kit.ctx.shadows?.addShadowCaster(frond);
    }
  } else {
    add(B.MeshBuilder.CreateCylinder(`${o.id}-trunk`, { height: h * 0.45, diameterTop: h * 0.05, diameterBottom: h * 0.08 }, trunk), h * 0.225, bark);
    const blobs: [number, number, number, number][] = [[0, 0.62, 0, 0.5], [-0.15, 0.55, 0.05, 0.36], [0.16, 0.58, -0.04, 0.38], [0.02, 0.8, 0.02, 0.34]];
    for (const [x, y, z, d] of blobs) {
      const m = add(B.MeshBuilder.CreateSphere(`${o.id}-crown`, { diameter: h * d, segments: 16 }, trunk), h * y, leaf);
      m.position.x = h * x;
      m.position.z = h * z;
    }
  }
}

function buildBush(kit: Kit, o: SceneObject): void {
  const [sx, sy, sz] = size3(o, [1.2, 0.9, 1.2]);
  const leaf = kit.tintable(`${o.id}-leaf`, o.color ?? "#3d7d3f", { metallic: 0, roughness: 0.9, emissiveIntensity: 1, doubleSided: false });
  const spots: [number, number, number, number][] = [[0, 0.5, 0, 1], [-0.35, 0.4, 0.1, 0.7], [0.35, 0.42, -0.1, 0.75], [0.05, 0.4, 0.3, 0.6]];
  for (const [x, y, z, k] of spots) {
    const m = B.MeshBuilder.CreateSphere(`${o.id}-puff`, { diameter: 1, segments: 12 }, kit.ctx.scene);
    m.scaling.set(sx * k, sy * k, sz * k);
    m.position.set(x * sx, y * sy, z * sz);
    m.material = leaf;
    kit.mesh(m);
  }
}

function buildRock(kit: Kit, o: SceneObject, p: ObjectPlan): void {
  const [sx, sy, sz] = size3(o, [1, 0.8, 1]);
  const m = B.MeshBuilder.CreateIcoSphere(o.id, { radius: 0.5, subdivisions: 3, flat: false, updatable: true }, kit.ctx.scene);
  const pos = m.getVerticesData(B.VertexBuffer.PositionKind)!;
  const seed = Math.floor(hash01(kit.ctx.seed, o.id.length, 9) * 1e6);
  const rough = num(p, "roughness");
  const out = pos.slice();
  for (let i = 0; i < pos.length; i += 3) {
    const k = 1 + (hash01(seed, Math.round(pos[i] * 997 + pos[i + 1] * 331 + pos[i + 2] * 173), 5) - 0.5) * rough * 0.7;
    out[i] = pos[i] * k;
    out[i + 1] = pos[i + 1] * k;
    out[i + 2] = pos[i + 2] * k;
  }
  m.updateVerticesData(B.VertexBuffer.PositionKind, out);
  const normals: number[] = [];
  B.VertexData.ComputeNormals(out, m.getIndices()!, normals);
  m.updateVerticesData(B.VertexBuffer.NormalKind, normals);
  m.scaling.set(sx, sy, sz);
  m.position.y = sy * 0.3;
  m.material = kit.tintable(`${o.id}-rock`, o.color ?? "#7b7f86", lookOf(o, { roughness: 0.95 }));
  kit.mesh(m);
}

function buildHouse(kit: Kit, o: SceneObject, p: ObjectPlan): void {
  const floors = num(p, "floors");
  const [w, , d] = size3(o, [6, 3, 6]);
  const h = 3 * floors;
  const wall = kit.tintable(`${o.id}-wall`, o.color ?? "#d9c9a8", { metallic: 0, roughness: 0.9, emissiveIntensity: 1, doubleSided: false });
  const body = B.MeshBuilder.CreateBox(`${o.id}-body`, { width: w, height: h, depth: d }, kit.ctx.scene);
  body.position.y = h / 2;
  body.material = wall;
  kit.mesh(body);
  const roofMat = pbr(kit.ctx, `${o.id}-roof`, "#7a3b2e", { metallic: 0, roughness: 0.8, emissiveIntensity: 1, doubleSided: false });
  if (str(p, "roof") === "gable") {
    const roof = B.MeshBuilder.CreateCylinder(`${o.id}-roof`, { height: d + 0.6, diameter: w * 1.25, tessellation: 3 }, kit.ctx.scene);
    roof.rotation.x = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.scaling.set(1, 1, 0.55);
    roof.position.y = h + w * 0.13;
    roof.material = roofMat;
    kit.mesh(roof);
  } else {
    const slab = B.MeshBuilder.CreateBox(`${o.id}-slab`, { width: w + 0.4, height: 0.3, depth: d + 0.4 }, kit.ctx.scene);
    slab.position.y = h + 0.15;
    slab.material = roofMat;
    kit.mesh(slab);
  }
  const glass = glow(kit.ctx, `${o.id}-glass`, "#f1d78a", 0.45);
  const door = B.MeshBuilder.CreateBox(`${o.id}-door`, { width: 1, height: 2.1, depth: 0.12 }, kit.ctx.scene);
  door.position.set(0, 1.05, d / 2 + 0.02);
  door.material = pbr(kit.ctx, `${o.id}-doormat`, "#4a3326", { metallic: 0, roughness: 0.7, emissiveIntensity: 1, doubleSided: false });
  kit.mesh(door, kit.root, false);
  const cols = Math.max(1, Math.floor(w / 2.4));
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      if (f === 0 && Math.abs(c - (cols - 1) / 2) < 0.6 && cols % 2 === 1) continue; // the door's place
      const win = B.MeshBuilder.CreateBox(`${o.id}-window`, { width: 0.9, height: 1.1, depth: 0.1 }, kit.ctx.scene);
      win.position.set((c - (cols - 1) / 2) * 2.4, 1.7 + f * 3, d / 2 + 0.02);
      win.material = glass;
      kit.mesh(win, kit.root, false);
    }
  }
}

function buildRoad(kit: Kit, o: SceneObject, p: ObjectPlan): void {
  const length = num(p, "length");
  const width = num(p, "width");
  const lanes = num(p, "lanes");
  const ground = B.MeshBuilder.CreateGround(`${o.id}-asphalt`, { width, height: length }, kit.ctx.scene);
  ground.material = kit.tintable(`${o.id}-asphalt`, o.color ?? "#2c2f35", { metallic: 0, roughness: 0.55, emissiveIntensity: 1, doubleSided: true });
  kit.mesh(ground, kit.root, false);
  const paint = pbr(kit.ctx, `${o.id}-paint`, "#e8e8e0", { metallic: 0, roughness: 0.6, emissiveIntensity: 1, doubleSided: false });
  for (let lane = 1; lane < lanes; lane++) {
    const x = -width / 2 + (width * lane) / lanes;
    for (let z = -length / 2 + 2; z < length / 2 - 2; z += 6) {
      const dash = B.MeshBuilder.CreateBox(`${o.id}-dash`, { width: 0.15, height: 0.01, depth: 3 }, kit.ctx.scene);
      dash.position.set(x, 0.012, z + 1.5);
      dash.material = paint;
      kit.mesh(dash, kit.root, false);
    }
  }
}

function buildStreetlamp(kit: Kit, o: SceneObject, p: ObjectPlan): void {
  const h = num(p, "height");
  const metal = pbr(kit.ctx, `${o.id}-pole`, o.color ?? "#3a3f46", { metallic: 0.6, roughness: 0.5, emissiveIntensity: 1, doubleSided: false });
  const pole = B.MeshBuilder.CreateCylinder(`${o.id}-pole`, { height: h, diameterTop: 0.08, diameterBottom: 0.14 }, kit.ctx.scene);
  pole.position.y = h / 2;
  pole.material = metal;
  kit.mesh(pole);
  const arm = B.MeshBuilder.CreateBox(`${o.id}-arm`, { width: 0.7, height: 0.06, depth: 0.06 }, kit.ctx.scene);
  arm.position.set(0.3, h, 0);
  arm.material = metal;
  kit.mesh(arm);
  const bulb = B.MeshBuilder.CreateSphere(`${o.id}-bulb`, { diameter: 0.3, segments: 12 }, kit.ctx.scene);
  bulb.position.set(0.62, h - 0.12, 0);
  bulb.material = glow(kit.ctx, `${o.id}-bulbmat`, "#ffe2a8", 1.4);
  kit.mesh(bulb, kit.root, false);
  const light = new B.PointLight(`${o.id}-light`, new B.Vector3(0.62, h - 0.3, 0), kit.ctx.scene);
  light.parent = kit.root;
  light.diffuse = c3("#ffd9a0");
  light.intensity = num(p, "lightIntensity");
  light.range = Math.max(10, h * 3.5);
  kit.disposables.push(light);
}

function buildCar(kit: Kit, o: SceneObject, p: ObjectPlan): void {
  const body = str(p, "body");
  const paint = kit.tintable(`${o.id}-paint`, o.color ?? "#b3262b", { metallic: 0.5, roughness: 0.3, emissiveIntensity: 1, doubleSided: false });
  const dark = pbr(kit.ctx, `${o.id}-dark`, "#16181c", { metallic: 0.2, roughness: 0.4, emissiveIntensity: 1, doubleSided: false });
  const glassMat = pbr(kit.ctx, `${o.id}-glass`, "#1b2733", { metallic: 0.1, roughness: 0.05, emissiveIntensity: 1, doubleSided: false });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: B.Material) => {
    const m = B.MeshBuilder.CreateBox(`${o.id}-part`, { width: w, height: h, depth: d }, kit.ctx.scene);
    m.position.set(x, y, z);
    m.material = mat;
    return kit.mesh(m);
  };
  const length = body === "suv" ? 4.7 : body === "truck" ? 5.4 : 4.4;
  box(1.85, 0.65, length, 0, 0.62, 0, paint);
  if (body === "truck") {
    box(1.8, 0.9, 1.7, 0, 1.3, length * 0.18, paint);
    box(1.7, 0.1, 1.9, 0, 0.98, -length * 0.22, dark);
  } else {
    const cabinLength = body === "suv" ? length * 0.62 : length * 0.5;
    box(1.7, body === "suv" ? 0.85 : 0.7, cabinLength, 0, 1.3, -length * 0.04, glassMat);
  }
  for (const sx of [-0.9, 0.9]) {
    for (const sz of [-length * 0.33, length * 0.33]) {
      const wheel = B.MeshBuilder.CreateCylinder(`${o.id}-wheel`, { height: 0.28, diameter: 0.74, tessellation: 24 }, kit.ctx.scene);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx, 0.37, sz);
      wheel.material = dark;
      kit.mesh(wheel);
    }
  }
  for (const sx of [-0.65, 0.65]) {
    const lamp = B.MeshBuilder.CreateBox(`${o.id}-lamp`, { width: 0.3, height: 0.14, depth: 0.06 }, kit.ctx.scene);
    lamp.position.set(sx, 0.7, length / 2);
    lamp.material = glow(kit.ctx, `${o.id}-lampmat`, "#fff4d6", 1.2);
    kit.mesh(lamp, kit.root, false);
    const tail = lamp.clone(`${o.id}-tail`);
    tail.position.z = -length / 2;
    tail.material = glow(kit.ctx, `${o.id}-tailmat`, "#ff2a2a", 0.8);
    tail.parent = kit.root;
  }
}

function buildCrate(kit: Kit, o: SceneObject): void {
  const [sx, sy, sz] = size3(o, [1, 1, 1]);
  const wood = kit.tintable(`${o.id}-wood`, o.color ?? "#a9763f", { metallic: 0, roughness: 0.85, emissiveIntensity: 1, doubleSided: false });
  const dark = pbr(kit.ctx, `${o.id}-slat`, "#6e4a25", { metallic: 0, roughness: 0.9, emissiveIntensity: 1, doubleSided: false });
  const core = B.MeshBuilder.CreateBox(`${o.id}-core`, { width: sx * 0.94, height: sy * 0.94, depth: sz * 0.94 }, kit.ctx.scene);
  core.position.y = sy / 2;
  core.material = wood;
  kit.mesh(core);
  for (const [w, h, d, x, y, z] of [
    [sx, 0.08 * sy, 0.08 * sz, 0, 0.04 * sy, sz / 2], [sx, 0.08 * sy, 0.08 * sz, 0, sy - 0.04 * sy, sz / 2],
    [sx, 0.08 * sy, 0.08 * sz, 0, 0.04 * sy, -sz / 2], [sx, 0.08 * sy, 0.08 * sz, 0, sy - 0.04 * sy, -sz / 2],
    [0.08 * sx, sy, 0.08 * sz, sx / 2, sy / 2, sz / 2], [0.08 * sx, sy, 0.08 * sz, -sx / 2, sy / 2, sz / 2],
    [0.08 * sx, sy, 0.08 * sz, sx / 2, sy / 2, -sz / 2], [0.08 * sx, sy, 0.08 * sz, -sx / 2, sy / 2, -sz / 2],
  ] as number[][]) {
    const slat = B.MeshBuilder.CreateBox(`${o.id}-frame`, { width: w, height: h, depth: d }, kit.ctx.scene);
    slat.position.set(x, y, z);
    slat.material = dark;
    kit.mesh(slat);
  }
}

function buildPipe(kit: Kit, o: SceneObject, p: ObjectPlan): void {
  const radius = num(p, "radius");
  const length = num(p, "length");
  const wall = num(p, "wall");
  const concrete = kit.tintable(`${o.id}-concrete`, o.color ?? "#6b6e72", lookOf(o, { roughness: 0.92, doubleSided: true }));
  const pivot = kit.node(`${o.id}-pivot`);
  pivot.rotation.x = Math.PI / 2; // cylinders stand along Y; the pipe lies along Z
  const outer = B.MeshBuilder.CreateCylinder(`${o.id}-outer`, { height: length, diameter: 2 * (radius + wall), tessellation: 64, cap: B.Mesh.NO_CAP }, kit.ctx.scene);
  outer.material = concrete;
  kit.mesh(outer, pivot);
  const inner = B.MeshBuilder.CreateCylinder(`${o.id}-inner`, { height: length, diameter: 2 * radius, tessellation: 64, cap: B.Mesh.NO_CAP, sideOrientation: B.Mesh.BACKSIDE }, kit.ctx.scene);
  inner.material = concrete;
  kit.mesh(inner, pivot, false);
  const ring = B.MeshBuilder.CreateTorus(`${o.id}-rim`, { diameter: 2 * radius + wall, thickness: wall, tessellation: 64 }, kit.ctx.scene);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = length / 2;
  ring.material = concrete;
  kit.mesh(ring, kit.root, false);
}

// ---- character -------------------------------------------------------------------------------

const STYLE_COLORS: Record<string, { shirt: string; pants: string; cap?: string }> = {
  simple: { shirt: "#f4b942", pants: "#2f3b52" },
  casual: { shirt: "#4a90d9", pants: "#3b3f4a" },
  officer: { shirt: "#2a3f6b", pants: "#1c2740", cap: "#1c2740" },
};

interface Rig {
  body: B.TransformNode;
  upper: B.TransformNode;
  head: B.TransformNode;
  hip: [B.TransformNode, B.TransformNode];
  knee: [B.TransformNode, B.TransformNode];
  shoulder: [B.TransformNode, B.TransformNode];
  elbow: [B.TransformNode, B.TransformNode];
  height: number;
}

function buildCharacter(kit: Kit, o: SceneObject, p: ObjectPlan): Rig {
  const H = num(p, "height");
  const look = STYLE_COLORS[o.style ?? "simple"] ?? STYLE_COLORS.simple;
  const shirt = kit.tintable(`${o.id}-shirt`, o.color ?? look.shirt, { metallic: 0, roughness: 0.75, emissiveIntensity: 1, doubleSided: false });
  const skin = pbr(kit.ctx, `${o.id}-skin`, "#e0b48f", { metallic: 0, roughness: 0.6, emissiveIntensity: 1, doubleSided: false });
  const pants = pbr(kit.ctx, `${o.id}-pants`, look.pants, { metallic: 0, roughness: 0.8, emissiveIntensity: 1, doubleSided: false });
  const limb = (parent: B.TransformNode, name: string, length: number, radius: number, mat: B.Material) => {
    const m = B.MeshBuilder.CreateCapsule(name, { height: length, radius, tessellation: 12 }, kit.ctx.scene);
    m.position.y = -length / 2;
    m.material = mat;
    return kit.mesh(m, parent);
  };
  const body = kit.node(`${o.id}-body`);
  const hips = kit.node(`${o.id}-hips`, body);
  hips.position.y = 0.5 * H;
  const legs = [1, -1].map((side) => {
    const hip = kit.node(`${o.id}-hip`, hips);
    hip.position.x = 0.055 * H * side;
    limb(hip, `${o.id}-thigh`, 0.26 * H, 0.05 * H, pants);
    const knee = kit.node(`${o.id}-knee`, hip);
    knee.position.y = -0.25 * H;
    limb(knee, `${o.id}-shin`, 0.26 * H, 0.042 * H, pants);
    const foot = B.MeshBuilder.CreateBox(`${o.id}-foot`, { width: 0.07 * H, height: 0.04 * H, depth: 0.12 * H }, kit.ctx.scene);
    foot.position.set(0, -0.26 * H, 0.025 * H);
    foot.material = pants;
    kit.mesh(foot, knee);
    return { hip, knee };
  });
  const upper = kit.node(`${o.id}-upper`, hips);
  const torso = B.MeshBuilder.CreateCapsule(`${o.id}-torso`, { height: 0.36 * H, radius: 0.085 * H, tessellation: 16 }, kit.ctx.scene);
  torso.position.y = 0.17 * H;
  torso.scaling.z = 0.7;
  torso.material = shirt;
  kit.mesh(torso, upper);
  const arms = [1, -1].map((side) => {
    const shoulder = kit.node(`${o.id}-shoulder`, upper);
    shoulder.position.set(0.125 * H * side, 0.3 * H, 0);
    limb(shoulder, `${o.id}-arm`, 0.2 * H, 0.032 * H, shirt);
    const elbow = kit.node(`${o.id}-elbow`, shoulder);
    elbow.position.y = -0.19 * H;
    limb(elbow, `${o.id}-forearm`, 0.19 * H, 0.028 * H, skin);
    return { shoulder, elbow };
  });
  const head = kit.node(`${o.id}-head`, upper);
  head.position.y = 0.37 * H;
  const skull = B.MeshBuilder.CreateSphere(`${o.id}-skull`, { diameter: 0.14 * H, segments: 16 }, kit.ctx.scene);
  skull.position.y = 0.05 * H;
  skull.material = skin;
  kit.mesh(skull, head);
  if (look.cap) {
    const cap = B.MeshBuilder.CreateCylinder(`${o.id}-cap`, { height: 0.035 * H, diameter: 0.16 * H, tessellation: 24 }, kit.ctx.scene);
    cap.position.set(0, 0.105 * H, 0.01 * H);
    cap.material = pbr(kit.ctx, `${o.id}-capmat`, look.cap, { metallic: 0, roughness: 0.7, emissiveIntensity: 1, doubleSided: false });
    kit.mesh(cap, head);
  }
  return { body, upper, head, hip: [legs[0].hip, legs[1].hip], knee: [legs[0].knee, legs[1].knee], shoulder: [arms[0].shoulder, arms[1].shoulder], elbow: [arms[0].elbow, arms[1].elbow], height: H };
}

/** Applies a pose. Left side is +X (the character faces +Z). Forward swings turn about -X; see character-poses.ts. */
function applyPose(rig: Rig, clip: string | undefined, time: number): void {
  const p = poseFor(clip, time);
  rig.body.position.y = p.bodyY * rig.height;
  rig.body.rotation.x = p.bodyPitch;
  rig.upper.rotation.x = p.spinePitch;
  rig.head.rotation.x = p.headNod;
  rig.head.rotation.y = p.headTurn;
  const sides: [number, number, number, number, number, number, number][] = [
    [0, p.hipL, p.kneeL, p.shoulderL, p.elbowL, p.armOutL, 1],
    [1, p.hipR, p.kneeR, p.shoulderR, p.elbowR, p.armOutR, -1],
  ];
  for (const [i, hip, knee, shoulder, elbow, armOut, side] of sides) {
    rig.hip[i].rotation.x = -hip;
    rig.knee[i].rotation.x = knee;
    rig.shoulder[i].rotation.x = -shoulder;
    rig.shoulder[i].rotation.z = armOut * side;
    rig.elbow[i].rotation.x = -elbow;
  }
}

// ---- models ----------------------------------------------------------------------------------

function sniffMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89) return "image/png";
  if (bytes[0] === 0xff) return "image/jpeg";
  return "image/webp";
}

/** A texture from uploaded picture bytes (png, jpg or webp). */
export async function textureFromBytes(ctx: BuildContext, name: string, bytes: Uint8Array): Promise<B.DynamicTexture | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: sniffMime(bytes) }));
    const tex = new B.DynamicTexture(name, { width: bitmap.width, height: bitmap.height }, ctx.scene, true);
    tex.hasAlpha = true;
    const g = tex.getContext() as unknown as CanvasRenderingContext2D;
    g.drawImage(bitmap, 0, 0);
    tex.update(true);
    bitmap.close();
    return tex;
  } catch {
    return null;
  }
}

interface LoadedModel {
  kit: Kit;
  groups: B.AnimationGroup[];
}

async function loadModel(kit: Kit, o: SceneObject, p: ObjectPlan, fitHeight: number): Promise<LoadedModel | null> {
  if (p.asset.kind === "none" || !p.asset.available) return null;
  const bytes = await kit.ctx.assets.get(p.asset.name);
  if (!bytes) return null;
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "model/gltf-binary" }));
  try {
    const result = await B.SceneLoader.ImportMeshAsync("", "", url, kit.ctx.scene, undefined, ".glb");
    const fit = kit.node(`${o.id}-fit`);
    for (const n of [...result.meshes, ...result.transformNodes]) if (!n.parent) n.parent = fit;
    for (const m of result.meshes) {
      m.receiveShadows = true;
      kit.ctx.shadows?.addShadowCaster(m);
    }
    if (fitHeight > 0 && result.meshes.length > 0) {
      const { min, max } = result.meshes[0].getHierarchyBoundingVectors(true);
      const h = max.y - min.y;
      if (h > 1e-6) {
        const k = fitHeight / h;
        fit.scaling.scaleInPlace(k);
        fit.position.y = -min.y * k; // feet on the ground
      }
    }
    for (const m of result.meshes) {
      const material = m.material;
      if (material instanceof B.PBRMaterial) useStandardFalloff(material);
      else if (material instanceof B.MultiMaterial) for (const sub of material.subMaterials) if (sub instanceof B.PBRMaterial) useStandardFalloff(sub);
    }
    for (const g of result.animationGroups) g.stop();
    return { kit, groups: result.animationGroups };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function findGroup(groups: readonly B.AnimationGroup[], clip: string | undefined): B.AnimationGroup | undefined {
  if (groups.length === 0) return undefined;
  const wanted = (clip ?? "Idle").toLowerCase();
  return groups.find((g) => g.name.toLowerCase() === wanted) ?? groups.find((g) => g.name.toLowerCase().endsWith(`|${wanted}`)) ?? groups.find((g) => g.name.toLowerCase().includes(wanted));
}

function modelUpdater(model: LoadedModel): BuiltObject["update"] {
  const started = new Set<B.AnimationGroup>();
  return (state) => {
    const group = findGroup(model.groups, state.clip);
    if (!group) return;
    if (!started.has(group)) {
      group.start(false, 1, group.from, group.to, false);
      group.pause();
      started.add(group);
    }
    const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    const length = (group.to - group.from) / fps;
    const t = length > 0 ? state.clipTime % length : 0;
    group.goToFrame(group.from + t * fps);
  };
}

// ---- stand-in --------------------------------------------------------------------------------

function buildStandIn(kit: Kit, o: SceneObject): void {
  const [sx, sy, sz] = size3(o);
  const m = B.MeshBuilder.CreateBox(`${o.id}-standin`, { width: sx, height: sy, depth: sz }, kit.ctx.scene);
  m.position.y = sy / 2;
  const mat = new B.StandardMaterial(`${o.id}-standin-mat`, kit.ctx.scene);
  mat.diffuseColor = c3("#7a5af8");
  mat.alpha = 0.55;
  mat.wireframe = false;
  m.material = mat;
  kit.mesh(m, kit.root, false);
}

// ---- water -----------------------------------------------------------------------------------

function buildWater(kit: Kit, o: SceneObject, p: ObjectPlan): BuiltObject["update"] {
  const w = o.size?.[0] ?? 20;
  const d = o.size?.[2] ?? 20;
  const n = kit.ctx.quality.waterGrid;
  const mesh = B.MeshBuilder.CreateGround(`${o.id}-surface`, { width: w, height: d, subdivisions: n, updatable: true }, kit.ctx.scene);
  const mat = kit.tintable(`${o.id}-water`, o.color ?? "#2d5d7a", lookOf(o, { metallic: 0, roughness: 0.08, doubleSided: true }));
  mat.alpha = 0.82;
  mat.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHABLEND;
  mesh.material = mat;
  kit.mesh(mesh, kit.root, false);
  const base = mesh.getVerticesData(B.VertexBuffer.PositionKind)!.slice();
  const indices = mesh.getIndices()!;
  const positions = new Float32Array(base.length);
  const normals: number[] = [];
  const waves = { waveHeight: num(p, "waveHeight"), waveSpeed: num(p, "waveSpeed"), flow: num(p, "flow") };
  return (_state, uc) => {
    for (let i = 0; i < base.length; i += 3) {
      positions[i] = base[i];
      positions[i + 1] = waveHeightAt(base[i], base[i + 2], uc.time, waves);
      positions[i + 2] = base[i + 2];
    }
    mesh.updateVerticesData(B.VertexBuffer.PositionKind, positions);
    B.VertexData.ComputeNormals(positions, indices, normals);
    mesh.updateVerticesData(B.VertexBuffer.NormalKind, normals);
  };
}

// ---- particles -------------------------------------------------------------------------------

function buildEmitter(kit: Kit, o: SceneObject, p: ObjectPlan, type: EmitterType): BuiltObject["update"] {
  const params = { intensity: num(p, "intensity"), area: num(p, "area"), height: (p.params.height as number | undefined) ?? 5 };
  const count = particleCount(type, params.intensity, kit.ctx.qualityName);
  const quad = B.MeshBuilder.CreatePlane(`${o.id}-particle`, { size: 1, sideOrientation: B.Mesh.DOUBLESIDE }, kit.ctx.scene);
  quad.parent = kit.root;
  quad.isPickable = false;
  const mat = new B.StandardMaterial(`${o.id}-particle-material`, kit.ctx.scene);
  mat.disableLighting = true;
  mat.emissiveColor = c3(o.color ?? EMITTER_COLORS[type]);
  mat.diffuseTexture = kit.ctx.softSprite;
  mat.useAlphaFromDiffuseTexture = true;
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  mat.fogEnabled = type === "rain" || type === "snow" || type === "dust" || type === "smoke";
  if (EMITTER_ADDITIVE[type]) mat.alphaMode = B.Engine.ALPHA_ADD;
  quad.material = mat;
  quad.hasVertexAlpha = true;
  const matrices = new Float32Array(16 * Math.max(1, count));
  const colors = new Float32Array(4 * Math.max(1, count));
  if (count === 0) {
    quad.isVisible = false;
    return () => undefined;
  }
  const rgb = c3("#ffffff");
  return (_state, uc) => {
    // the camera's right/up in the emitter's own space, so billboards face the camera whatever the emitter's rotation
    const inverse = kit.root.getWorldMatrix().clone().invert();
    const right = B.Vector3.TransformNormal(uc.right, inverse).normalize();
    const up = B.Vector3.TransformNormal(uc.up, inverse).normalize();
    const forward = B.Vector3.Cross(right, up);
    for (let i = 0; i < count; i++) {
      const q = particleAt(type, i, uc.time, params, kit.ctx.seed);
      const sx = q.size;
      const sy = q.streak > 0 ? q.streak : q.size;
      const a = i * 16;
      const streakUp = q.streak > 0 ? B.Vector3.Up() : up;
      const streakRight = q.streak > 0 ? B.Vector3.Cross(streakUp, forward).normalize() : right;
      matrices[a] = streakRight.x * sx; matrices[a + 1] = streakRight.y * sx; matrices[a + 2] = streakRight.z * sx; matrices[a + 3] = 0;
      matrices[a + 4] = streakUp.x * sy; matrices[a + 5] = streakUp.y * sy; matrices[a + 6] = streakUp.z * sy; matrices[a + 7] = 0;
      matrices[a + 8] = forward.x; matrices[a + 9] = forward.y; matrices[a + 10] = forward.z; matrices[a + 11] = 0;
      matrices[a + 12] = q.x; matrices[a + 13] = q.y; matrices[a + 14] = q.z; matrices[a + 15] = 1;
      colors[i * 4] = rgb.r; colors[i * 4 + 1] = rgb.g; colors[i * 4 + 2] = rgb.b; colors[i * 4 + 3] = q.alpha;
    }
    quad.thinInstanceSetBuffer("matrix", matrices, 16, false);
    quad.thinInstanceSetBuffer("color", colors, 4, false);
    quad.thinInstanceRefreshBoundingInfo(false);
  };
}

// ---- text and pictures -----------------------------------------------------------------------

function buildTextPlane(kit: Kit, o: SceneObject, p: ObjectPlan): void {
  const letterHeight = num(p, "height");
  const font = { sans: "bold 120px system-ui, Arial, sans-serif", serif: "bold 120px Georgia, serif", display: "900 120px Impact, Arial Black, sans-serif", mono: "120px ui-monospace, Menlo, monospace" }[str(p, "font") as "sans"] ?? "bold 120px sans-serif";
  const text = o.text ?? "";
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const textWidth = Math.max(10, probe.measureText(text).width);
  const pxH = 180;
  const pxW = Math.min(4096, Math.ceil(textWidth + 60));
  const tex = new B.DynamicTexture(`${o.id}-text`, { width: pxW, height: pxH }, kit.ctx.scene, true);
  tex.hasAlpha = true;
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#ffffff";
  g.fillText(text, pxW / 2, pxH / 2);
  tex.update(true);
  const plane = B.MeshBuilder.CreatePlane(`${o.id}-plane`, { width: (letterHeight * pxW) / pxH, height: letterHeight, sideOrientation: B.Mesh.DOUBLESIDE }, kit.ctx.scene);
  const mat = kit.tintable(`${o.id}-textmat`, o.color ?? "#ffffff", { metallic: 0, roughness: 0.6, emissive: o.color ?? "#ffffff", emissiveIntensity: 0.6, doubleSided: true });
  mat.albedoTexture = tex;
  mat.opacityTexture = tex;
  mat.useAlphaFromAlbedoTexture = true;
  mat.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHATEST;
  plane.material = mat;
  kit.mesh(plane, kit.root, false);
}

async function buildBillboard(kit: Kit, o: SceneObject, p: ObjectPlan): Promise<void> {
  const [sx, sy] = size3(o, [1, 1, 1]);
  const plane = B.MeshBuilder.CreatePlane(`${o.id}-billboard`, { width: sx, height: sy, sideOrientation: B.Mesh.DOUBLESIDE }, kit.ctx.scene);
  plane.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
  const mat = kit.tintable(`${o.id}-billboardmat`, o.color ?? "#ffffff", { metallic: 0, roughness: 1, emissive: "#ffffff", emissiveIntensity: 0.5, doubleSided: true });
  if (p.asset.kind !== "none" && p.asset.available) {
    const bytes = await kit.ctx.assets.get(p.asset.name);
    const tex = bytes ? await textureFromBytes(kit.ctx, `${o.id}-picture`, bytes) : null;
    if (tex) {
      mat.albedoTexture = tex;
      mat.opacityTexture = tex;
      mat.useAlphaFromAlbedoTexture = true;
    }
  }
  plane.material = mat;
  kit.mesh(plane, kit.root, false);
}

// ---- entry point -----------------------------------------------------------------------------

/** A colour for every object that has none, by what it is. */
const DEFAULT_COLORS: Record<string, string> = { box: "#9aa4b2", sphere: "#9aa4b2", cylinder: "#9aa4b2", cone: "#9aa4b2", capsule: "#9aa4b2", plane: "#8c939c", torus: "#9aa4b2" };

export async function buildObject(ctx: BuildContext, o: SceneObject, plan: ObjectPlan): Promise<BuiltObject> {
  const color = o.color ?? DEFAULT_COLORS[plan.type] ?? "#9aa4b2";
  let built: BuiltObject;
  const emitter = (["rain", "snow", "smoke", "fire", "sparks", "dust", "splash"] as const).find((t) => t === plan.type);

  if (plan.standIn) {
    const kit = new Kit(ctx, o.id);
    buildStandIn(kit, o);
    built = kit.built();
  } else if (plan.type === "character" || plan.type === "asset" || (plan.type === "tree" && plan.asset.kind !== "none" && plan.asset.available)) {
    const kit = new Kit(ctx, o.id);
    const fit = plan.type === "character" ? num(plan, "height") : plan.type === "asset" ? num(plan, "fitHeight") : num(plan, "height");
    const model = plan.asset.kind !== "none" && plan.asset.available ? await loadModel(kit, o, plan, fit) : null;
    if (model) {
      if (o.color) for (const m of kit.root.getChildMeshes()) if (m.material instanceof B.PBRMaterial) kit.tinted.push(m.material);
      built = kit.built(modelUpdater(model));
    } else if (plan.type === "character") {
      const rig = buildCharacter(kit, o, plan);
      built = kit.built((state) => applyPose(rig, resolveClip(state.clip), state.clipTime));
    } else {
      buildStandIn(kit, o);
      built = kit.built();
    }
  } else if (emitter) {
    const kit = new Kit(ctx, o.id);
    built = kit.built(buildEmitter(kit, o, plan, emitter));
  } else if (plan.type === "water") {
    const kit = new Kit(ctx, o.id);
    built = kit.built(buildWater(kit, o, plan));
  } else if (["box", "sphere", "cylinder", "cone", "capsule", "plane", "torus"].includes(plan.type)) {
    built = buildShape(ctx, o, plan, color);
  } else {
    const kit = new Kit(ctx, o.id);
    switch (plan.type) {
      case "tree": buildTree(kit, o, plan); break;
      case "bush": buildBush(kit, o); break;
      case "rock": buildRock(kit, o, plan); break;
      case "house": buildHouse(kit, o, plan); break;
      case "road": buildRoad(kit, o, plan); break;
      case "streetlamp": buildStreetlamp(kit, o, plan); break;
      case "car": buildCar(kit, o, plan); break;
      case "crate": buildCrate(kit, o); break;
      case "pipe": buildPipe(kit, o, plan); break;
      case "text": buildTextPlane(kit, o, plan); break;
      case "billboard": await buildBillboard(kit, o, plan); break;
      default: break; // "group" and anything empty: just the root
    }
    built = kit.built();
  }
  built.root.name = o.id;
  built.ownMeshes = built.root.getChildMeshes(false);
  return built;
}

/** Applies the per-frame values every object shares (placement, visibility, fade, colour). */
export function applyCommon(built: BuiltObject, state: ObjectState): void {
  const r = built.root;
  r.position.set(state.position[0], state.position[1], state.position[2]);
  if (r.rotationQuaternion) r.rotationQuaternion.copyFromFloats(state.quaternion[0], state.quaternion[1], state.quaternion[2], state.quaternion[3]);
  else r.rotationQuaternion = new B.Quaternion(state.quaternion[0], state.quaternion[1], state.quaternion[2], state.quaternion[3]);
  r.scaling.set(state.scale[0], state.scale[1], state.scale[2]);
  r.setEnabled(state.visible && state.opacity > 0);
  const alpha = Math.min(1, Math.max(0, state.opacity));
  for (const m of built.ownMeshes) if (m.visibility !== alpha) m.visibility = alpha;
  if (state.color) built.tint(state.color);
}

/** Creates the soft round sprite particles use. */
export function makeSoftSprite(scene: B.Scene): B.DynamicTexture {
  const tex = new B.DynamicTexture("soft-sprite", { width: 64, height: 64 }, scene, true);
  tex.hasAlpha = true;
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  tex.update(true);
  return tex;
}

export { DEG as DEGREES, v3 as vec3 };
