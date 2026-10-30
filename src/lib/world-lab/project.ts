import { z } from "zod";
import { validateProject as validateLegacyGameProject } from "../game-studio/project.ts";

/**
 * The World Lab portable v1 project contract.
 * Geometry-only authoring is distinct from scientific model validity.
 * This is an untrusted data format: no script, source code or executable assets.
 */
const scalar = z.number().finite();
const positiveDimension = scalar.min(0.001).max(10000);
const coords = z.tuple([scalar.min(-100000), scalar.min(-100000), scalar.min(-100000)]);
const dimensions = z.tuple([positiveDimension, positiveDimension, positiveDimension]);
const uid = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
const isoDate = z.string().datetime({ offset: true });
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const materialSchema = z.object({
  id: uid,
  name: z.string().trim().min(1).max(120),
  densityKgM3: scalar.min(0.001).max(1e9).nullable(),
  youngModulusPa: scalar.min(0).max(1e15).nullable(),
  evidence: z.literal("hypothetical-user-assumed"),
}).strict();
const entitySchema = z.object({
  id: uid,
  name: z.string().trim().min(1).max(120),
  shape: z.enum(["box", "sphere", "cylinder"]),
  positionMeters: coords,
  dimensionsMeters: dimensions,
  color: hexColor,
  materialId: uid.nullable(),
  scientificRole: z.enum(["visual-only", "reference-solid"]),
  opacity: scalar.min(0).max(1),
}).strict().superRefine((entity, ctx) => {
  if (entity.shape === "sphere" &&
    (entity.dimensionsMeters[0] !== entity.dimensionsMeters[1] ||
      entity.dimensionsMeters[1] !== entity.dimensionsMeters[2])) {
    ctx.addIssue({ code: "custom", message: "Spheres must have one uniform diameter." });
  }
  if (entity.shape === "cylinder" && entity.dimensionsMeters[0] !== entity.dimensionsMeters[2]) {
    ctx.addIssue({ code: "custom", message: "A circular cylinder needs equal X and Z diameter." });
  }
});


const circuitNodeSchema=z.object({
  id:uid,label:z.string().trim().min(1).max(80),
}).strict();
const circuitComponentSchema=z.discriminatedUnion("kind",[
  z.object({id:uid,kind:z.literal("dc-source"),positiveNodeId:uid,
    negativeNodeId:uid,voltageV:scalar.min(-1000).max(1000)}).strict(),
  z.object({id:uid,kind:z.literal("resistor"),positiveNodeId:uid,
    negativeNodeId:uid,resistanceOhm:scalar.min(0.01).max(1000000000)}).strict(),
  z.object({id:uid,kind:z.literal("hypothetical-device"),
    name:z.string().trim().min(1).max(120),
    assumption:z.string().trim().min(1).max(500),
    positiveNodeId:uid,negativeNodeId:uid,
    evidence:z.literal("hypothetical-user-assumed"),
    assumedResistanceOhm:scalar.min(0.01).max(1e9).optional()}).strict(),
]);
const circuitNetworkSchema=z.object({
  id:uid,name:z.string().trim().min(1).max(120),groundNodeId:uid,
  nodes:z.array(circuitNodeSchema).min(2).max(24),
  components:z.array(circuitComponentSchema).min(1).max(48),
}).strict().superRefine((n,ctx)=>{
  if(new Set(n.nodes.map(x=>x.id)).size!==n.nodes.length)
    ctx.addIssue({code:"custom",message:"Duplicate circuit node IDs."});
  if(new Set(n.components.map(x=>x.id)).size!==n.components.length)
    ctx.addIssue({code:"custom",message:"Duplicate circuit component IDs."});
  const ids=new Set(n.nodes.map(x=>x.id));
  if(!ids.has(n.groundNodeId))
    ctx.addIssue({code:"custom",message:"Circuit ground node is missing."});
  for(const c of n.components){
    if(!ids.has(c.positiveNodeId)||!ids.has(c.negativeNodeId)||
      c.positiveNodeId===c.negativeNodeId)
      ctx.addIssue({code:"custom",message:"Circuit ports must connect two distinct existing nodes."});
  }
});
export type WorldLabCircuitNetwork=z.infer<typeof circuitNetworkSchema>;
export type WorldLabCircuitComponent=WorldLabCircuitNetwork["components"][number];

export const worldLabProjectSchema = z.object({
  format: z.literal("env-world-lab"),
  schemaVersion: z.literal(1),
  id: uid,
  title: z.string().trim().min(1).max(120),
  revision: z.number().int().min(0).max(1000000000),
  createdAt: isoDate,
  updatedAt: isoDate,
  world: z.object({
    frame: z.literal("LOCAL_ENU"),
    representation: z.literal("representative-not-measured"),
    origin: z.tuple([z.literal(0), z.literal(0), z.literal(0)]),
    terrainSource: z.null(),
  }).strict(),
  camera: z.object({
    positionMeters: coords,
    lookingAtMeters: coords,
  }).strict(),
  entities: z.array(entitySchema).max(200),
  materials: z.array(materialSchema).max(100),
  networks: z.array(circuitNetworkSchema).max(12).optional(),
}).strict().superRefine((p, ctx) => {
  if (new Set(p.entities.map(x => x.id)).size !== p.entities.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate entity IDs." });
  }
  if (new Set(p.materials.map(x => x.id)).size !== p.materials.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate material IDs." });
  }
  if(new Set((p.networks??[]).map(x=>x.id)).size!==(p.networks??[]).length)
    ctx.addIssue({code:"custom",message:"Duplicate circuit network IDs."});
  const materials = new Set(p.materials.map(x => x.id));
  for (const entity of p.entities) {
    if (entity.materialId !== null && !materials.has(entity.materialId)) {
      ctx.addIssue({ code: "custom", message: "Entity refers to a missing material." });
    }
  }
  if (Date.parse(p.updatedAt) < Date.parse(p.createdAt)) {
    ctx.addIssue({ code: "custom", message: "Updated time precedes creation time." });
  }
});
export type WorldLabProject = z.infer<typeof worldLabProjectSchema>;
export type WorldLabEntity = WorldLabProject["entities"][number];
export type WorldLabMaterial = WorldLabProject["materials"][number];

export const MAX_PROJECT_JSON_BYTES = 1024 * 1024;

export function parseWorldLabProject(value: unknown): WorldLabProject {
  const parsed = worldLabProjectSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid or unsupported World Lab project: " + parsed.error.issues.slice(0, 3).map(issue => issue.message).join("; "));
  return parsed.data;
}
export function readWorldLabProjectJson(json: string): WorldLabProject {
  if (new TextEncoder().encode(json).byteLength > MAX_PROJECT_JSON_BYTES) {
    throw new Error("The World Lab JSON file exceeds the 1 MB import limit.");
  }
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw new Error("The World Lab file is not valid JSON."); }
  return parseWorldLabProject(value);
}
export function serializeWorldLabProject(value: WorldLabProject): string {
  const safe = parseWorldLabProject(value);
  const json = JSON.stringify(safe, null, 2);
  if (new TextEncoder().encode(json).byteLength > MAX_PROJECT_JSON_BYTES) {
    throw new Error("This project exceeds the 1 MB portable JSON limit.");
  }
  return json;
}
export function blankWorldLabProject(id: string, now: string): WorldLabProject {
  return parseWorldLabProject({
    format: "env-world-lab", schemaVersion: 1, id, title: "My World Lab",
    revision: 0, createdAt: now, updatedAt: now,
    world: { frame: "LOCAL_ENU", origin: [0, 0, 0],
      representation: "representative-not-measured", terrainSource: null },
    camera: { positionMeters: [0, 1.65, -8], lookingAtMeters: [0, 1.2, 0] },
    entities: [], materials: [], networks: [],
  });
}
export function newSolid(id: string, shape: WorldLabEntity["shape"], at: number): WorldLabEntity {
  const dims: [number, number, number] = [1, 1, 1];
  return entitySchema.parse({
    id, name: shape === "box" ? "Cube" : shape === "sphere" ? "Sphere" : "Cylinder",
    shape, positionMeters: [-2 + (at % 5), 0.5, 1.8 + Math.floor(at / 5)],
    dimensionsMeters: dims, color: "#CFD7D6", materialId: null,
    scientificRole: "visual-only", opacity: 1,
  });
}

export function solidQuantities(entity: WorldLabEntity, material?: WorldLabMaterial): {
  volumeM3: number; massKg: number | null; evidence: "physics-model-computed" | "unknown-insufficient-evidence";
} {
  const safe = entitySchema.parse(entity);
  const [x, y, z] = safe.dimensionsMeters;
  const volume = safe.shape === "box" ? x * y * z
    : safe.shape === "sphere" ? Math.PI * x ** 3 / 6
    : Math.PI * x * z * y / 4;
  const mass = material?.densityKgM3 == null ? null : volume * material.densityKgM3;
  return { volumeM3: volume, massKg: mass,
    evidence: mass === null ? "unknown-insufficient-evidence" : "physics-model-computed" };
}

export type LegacyImportReport = {
  project: WorldLabProject;
  warnings: string[];
  ignoredObjectIds: string[];
};
/**
 * Safe, read-only legacy env-3d-game v1 migration. This does not transfer
 * gameplay scripts, player abilities, collision semantics or unknown GLB physics.
 * Visual-only primitives survive; unsupported asset geometry is reported.
 */
export function importLegacyGameScene(input: unknown, id: string, now: string): LegacyImportReport {
  const legacy = validateLegacyGameProject(input);
  const project = blankWorldLabProject(id, now);
  const warnings: string[] = ["Converted scene geometry is visual-only: no legacy collisions, player rules or physics have been imported."];
  const ignoredObjectIds: string[] = [];
  for (const object of legacy.objects) {
    if (object.kind === "ground") {
      warnings.push("Legacy ground converted to the World Lab representative ground, without transferring terrain physics.");
      continue;
    }
    if (object.kind !== "box" && object.kind !== "sphere" && object.kind !== "cylinder") {
      ignoredObjectIds.push(object.id);
      continue;
    }
    const dims: [number, number, number] = [object.scale.x, object.scale.y, object.scale.z];
    if (object.kind === "sphere" && (dims[0] !== dims[1] || dims[1] !== dims[2])) {
      ignoredObjectIds.push(object.id);
      warnings.push("Nonuniform legacy sphere " + object.name + " requires explicit review before conversion.");
      continue;
    }
    if (object.kind === "cylinder" && dims[0] !== dims[2]) {
      ignoredObjectIds.push(object.id);
      warnings.push("Elliptical legacy cylinder " + object.name + " requires explicit review before conversion.");
      continue;
    }
    if (project.entities.length >= 200) {
      ignoredObjectIds.push(object.id);
      continue;
    }
    project.entities.push(entitySchema.parse({
      id: object.id, name: object.name, shape: object.kind,
      positionMeters: [object.position.x, object.position.y, object.position.z],
      dimensionsMeters: dims, color: object.color, materialId: null,
      scientificRole: "visual-only", opacity: object.visible ? 1 : 0,
    }));
    if (object.rotation.x || object.rotation.y || object.rotation.z) {
      warnings.push("Rotation on legacy object " + object.name + " is not represented in the v1 World Lab project schema.");
    }
  }
  if (ignoredObjectIds.length) warnings.push("Skipped " + ignoredObjectIds.length + " objects requiring unsupported assets, shape fidelity or capacity.");
  return { project: parseWorldLabProject(project), warnings, ignoredObjectIds };
}
