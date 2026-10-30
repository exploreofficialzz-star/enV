import { z } from "zod";

/** A bounded, explicitly simplified classical-mechanics experiment; not a universal physical solver. */
const scalar = z.number().finite();
const vector = z.object({ x: scalar, y: scalar, z: scalar }).strict();
const positiveVector = z.object({
  x: scalar.gt(0).max(1000),
  y: scalar.gt(0).max(1000),
  z: scalar.gt(0).max(1000),
}).strict();
const objectSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  kind: z.enum(["box", "sphere", "cylinder"]),
  behavior: z.enum(["static", "dynamic"]),
  dimensionsM: positiveVector,
  positionM: vector,
  velocityMps: vector,
  forceN: vector,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  opacity: scalar.min(0.05).max(1),
  material: z.object({
    name: z.string().min(1).max(120),
    densityKgM3: scalar.gt(0).max(50000),
    evidence: z.enum(["measured", "reference", "hypothetical"]),
    source: z.string().max(500),
  }).strict(),
  restitution: scalar.min(0).max(1),
  friction: scalar.min(0).max(1),
}).strict();
const projectSchema = z.object({
  format: z.literal("env-world-lab"),
  version: z.literal(1),
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  environment: z.object({
    gravityMps2: scalar.min(0).max(100),
    airDensityKgM3: scalar.min(0).max(100),
    groundY: scalar.min(-10000).max(10000),
    label: z.string().min(1).max(160),
    evidence: z.literal("illustrative"),
  }).strict(),
  elapsedSeconds: scalar.min(0).max(1e9),
  objects: z.array(objectSchema).max(100),
}).strict();
export type WorldLabProject = z.infer<typeof projectSchema>;
export type WorldLabObject = WorldLabProject["objects"][number];
export type LabVector = WorldLabObject["positionM"];
export type LabShape = WorldLabObject["kind"];

const zero = (): LabVector => ({ x: 0, y: 0, z: 0 });
const freshId = () => globalThis.crypto.randomUUID();
export const LAB_MODEL = "classical-point-mass-v1";
export const LAB_LIMITATIONS = "Simplified translational Newtonian dynamics with approximate quadratic air drag and a flat-ground contact rule. No rotational inertia, lift, fracture, fluid solver, atomic-scale prediction or real geospatial measurements. Results are model predictions, not physical certification.";

export function createWorldLabProject(): WorldLabProject {
  return {
    format: "env-world-lab", version: 1, id: freshId(), name: "My World Lab",
    environment: {
      gravityMps2: 9.80665, airDensityKgM3: 1.225, groundY: 0,
      label: "Representative Earth-like test ground (not a measured location)",
      evidence: "illustrative",
    },
    elapsedSeconds: 0,
    objects: [],
  };
}

export function createLabObject(kind: LabShape, positionM: LabVector = { x: 0, y: 3, z: 5 }): WorldLabObject {
  const dimensionsM = kind === "sphere" ? { x: 1, y: 1, z: 1 } : { x: 1.2, y: 1.2, z: 1.2 };
  return {
    id: freshId(), name: kind === "sphere" ? "Ball" : kind === "box" ? "Block" : "Cylinder",
    kind, behavior: "dynamic", dimensionsM,
    positionM: { ...positionM }, velocityMps: zero(), forceN: zero(),
    color: kind === "sphere" ? "#e7aa5e" : "#4bada2", opacity: 1,
    material: { name: "User-defined material", densityKgM3: 700, evidence: "hypothetical", source: "User-assumed density; not a measured substance" },
    restitution: 0.25, friction: 0.5,
  };
}

export function volumeM3(item: WorldLabObject): number {
  const { x, y, z } = item.dimensionsM;
  if (item.kind === "box") return x * y * z;
  if (item.kind === "sphere") return (4 / 3) * Math.PI * Math.pow(x / 2, 3);
  return Math.PI * Math.pow(x / 2, 2) * y;
}
export function massKg(item: WorldLabObject): number {
  return volumeM3(item) * item.material.densityKgM3;
}
export function supportingRadiusM(item: WorldLabObject): number {
  return item.kind === "sphere" ? item.dimensionsM.x / 2 : item.dimensionsM.y / 2;
}
function projectedAreaM2(item: WorldLabObject): number {
  return item.kind === "box"
    ? item.dimensionsM.x * item.dimensionsM.z
    : Math.PI * Math.pow(item.dimensionsM.x / 2, 2);
}

/** Reject malformed imports and nonphysical dimensions; never execute user-supplied code. */
export function validateWorldLabProject(value: unknown): WorldLabProject {
  const project = projectSchema.parse(value);
  const ids = project.objects.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Objects must have unique IDs.");
  for (const item of project.objects) {
    if (item.kind === "sphere" && (item.dimensionsM.x !== item.dimensionsM.y || item.dimensionsM.y !== item.dimensionsM.z))
      throw new Error("A sphere must have equal X, Y and Z dimensions.");
    const minY = project.environment.groundY + supportingRadiusM(item);
    if (item.behavior === "static" && item.positionM.y < minY - 0.000001)
      throw new Error("Static objects cannot be embedded below this flat-ground model.");
  }
  return project;
}

/** Semi-implicit Euler with bounded fixed substeps; deterministic for the same inputs and step size. */
export function advanceWorld(project: WorldLabProject, simulatedSeconds: number): WorldLabProject {
  if (!Number.isFinite(simulatedSeconds) || simulatedSeconds < 0 || simulatedSeconds > 1)
    throw new Error("Advance a finite, positive interval no longer than one simulated second.");
  if (simulatedSeconds === 0) return project;
  const substeps = Math.ceil(simulatedSeconds * 120);
  const dt = simulatedSeconds / substeps;
  const gravity = project.environment.gravityMps2;
  const airDensity = project.environment.airDensityKgM3;
  const groundY = project.environment.groundY;
  const next = project.objects.map(item => ({
    ...item,
    positionM: { ...item.positionM }, velocityMps: { ...item.velocityMps },
  }));
  for (let step = 0; step < substeps; step++) {
    for (const item of next) {
      if (item.behavior === "static") continue;
      const mass = massKg(item);
      const velocity = item.velocityMps;
      const position = item.positionM;
      const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
      const dragCoefficient = item.kind === "sphere" ? 0.47 : 1.05;
      const dragPerMass = 0.5 * airDensity * dragCoefficient * projectedAreaM2(item) * speed / mass;
      velocity.x += (item.forceN.x / mass - dragPerMass * velocity.x) * dt;
      velocity.y += (item.forceN.y / mass - gravity - dragPerMass * velocity.y) * dt;
      velocity.z += (item.forceN.z / mass - dragPerMass * velocity.z) * dt;
      position.x += velocity.x * dt;
      position.y += velocity.y * dt;
      position.z += velocity.z * dt;
      const floor = groundY + supportingRadiusM(item);
      if (position.y <= floor) {
        position.y = floor;
        if (velocity.y < 0) velocity.y = -velocity.y * item.restitution;
        if (Math.abs(velocity.y) < 0.035) velocity.y = 0;
        const lateralSpeed = Math.hypot(velocity.x, velocity.z);
        if (lateralSpeed > 0) {
          const reduced = Math.max(0, lateralSpeed - item.friction * gravity * dt);
          velocity.x *= reduced / lateralSpeed;
          velocity.z *= reduced / lateralSpeed;
        }
      }
    }
  }
  return { ...project, elapsedSeconds: project.elapsedSeconds + simulatedSeconds, objects: next };
}

export function describeLabObject(item: WorldLabObject, project: WorldLabProject) {
  const speedMps = Math.hypot(item.velocityMps.x, item.velocityMps.y, item.velocityMps.z);
  const heightM = Math.max(0, item.positionM.y - supportingRadiusM(item) - project.environment.groundY);
  return { massKg: massKg(item), speedMps, kineticEnergyJ: 0.5 * massKg(item) * speedMps ** 2,
    gravitationalEnergyJ: massKg(item) * project.environment.gravityMps2 * heightM };
}
