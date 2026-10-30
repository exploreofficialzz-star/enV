import {
  parseWorldLabProject, solidQuantities,
  type WorldLabEntity, type WorldLabProject,
} from "./project.ts";

/**
 * Intentionally bounded, ONE-dimensional centre-of-mass free-fall/contact model.
 * No object-object collision, rotation, lift, structural failure, soft bodies,
 * terrain measurements, or actual material characterization.
 */
export type DropInput = Readonly<{
  massKg: number;
  supportingHalfHeightM: number;
  dropHeightM: number;
  initialVelocityMps: number;
  gravityMps2: number;
  airDensityKgM3: number;
  projectedAreaM2: number;
  dragCoefficient: number;
  restitution: number;
  durationSeconds: number;
}>;
export type DropSample = Readonly<{
  timeSeconds: number;
  heightAboveGroundM: number;
  velocityMps: number;
  speedMps: number;
  kineticEnergyJ: number;
  gravitationalEnergyJ: number;
  totalMechanicalEnergyJ: number;
  grounded: boolean;
}>;
export type DropRun = Readonly<{
  format: "env-world-lab-drop-run";
  modelVersion: "1.0.0";
  inputEvidence: "hypothetical-user-assumed";
  evidence: "physics-model-computed";
  source: Readonly<{ projectId: string; entityId: string; materialId: string; materialName: string; projectRevision: number }>;
  input: DropInput;
  samples: readonly DropSample[];
  impactCount: number;
  validity: string;
  stepSeconds: number;
}>;

const limit = (value: number, name: string, minimum: number, maximum: number) => {
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new Error(name + " must be finite, between " + minimum + " and " + maximum + ".");
};

function crossSection(entity: WorldLabEntity): number {
  const [x,,z] = entity.dimensionsMeters;
  return entity.shape === "box" ? x * z : Math.PI * (x / 2) * (z / 2);
}

/**
 * Integrates an INVENTED solid by its assumed uniform density.
 * The scene stays untouched and the source project is never mutated.
 */
export function deriveDropInput(projectRaw: WorldLabProject, entityId: string,
  options: Readonly<{ heightM?: number; restitution?: number; gravityMps2?: number; airDensityKgM3?: number }> = {},
): Readonly<{ input: DropInput; source: DropRun["source"] }> {
  const project = parseWorldLabProject(projectRaw);
  const entity = project.entities.find(item => item.id === entityId);
  if (!entity) throw new Error("Select a solid to test its falling motion.");
  const material = project.materials.find(item => item.id === entity.materialId);
  if (!material || material.densityKgM3 === null)
    throw new Error("This solid has no known mass. Assign an invented material and assumed density first.");
  const properties = solidQuantities(entity, material);
  if (properties.massKg === null) throw new Error("The object's mass is unknown.");
  const input: DropInput = {
    massKg: properties.massKg,
    supportingHalfHeightM: entity.dimensionsMeters[1] / 2,
    dropHeightM: options.heightM ?? 5,
    initialVelocityMps: 0,
    gravityMps2: options.gravityMps2 ?? 9.80665,
    airDensityKgM3: options.airDensityKgM3 ?? 1.225,
    projectedAreaM2: crossSection(entity),
    dragCoefficient: entity.shape === "sphere" ? 0.47 : 1.05,
    restitution: options.restitution ?? 0.3,
    durationSeconds: 6,
  };
  validateDropInput(input);
  return {
    input,
    source: { projectId: project.id, projectRevision: project.revision, entityId: entity.id,
      materialId: material.id, materialName: material.name },
  };
}

export function validateDropInput(input: DropInput): void {
  if (!input || typeof input !== "object") throw new Error("Drop inputs are required.");
  limit(input.massKg, "Mass (kg)", 0.001, 10000);
  limit(input.supportingHalfHeightM, "Object half-height (m)", 0.0005, 5000);
  limit(input.dropHeightM, "Release height (m)", 0, 100);
  limit(input.initialVelocityMps, "Initial vertical velocity (m/s)", -100, 100);
  limit(input.gravityMps2, "Gravity (m/s²)", 0, 100);
  limit(input.airDensityKgM3, "Air density (kg/m³)", 0, 100);
  limit(input.projectedAreaM2, "Projected area (m²)", 0.000001, 100000);
  limit(input.dragCoefficient, "Drag coefficient", 0, 3);
  limit(input.restitution, "Bounce coefficient", 0, 1);
  limit(input.durationSeconds, "Simulated duration (s)", 0.01, 20);
}

export function runDropExperiment(input: DropInput, source: DropRun["source"],
  solverStepSeconds = 1 / 240): DropRun {
  validateDropInput(input);
  if (!source || !source.projectId || !source.entityId || !source.materialId ||
      !source.materialName || !Number.isSafeInteger(source.projectRevision) || source.projectRevision < 0)
    throw new Error("Original solid and material provenance are required.");
  limit(solverStepSeconds, "Solver step (s)", 1 / 1000, 1 / 30);
  const steps = Math.ceil(input.durationSeconds / solverStepSeconds);
  if (steps > 20000) throw new Error("This test exceeds the local solver step budget.");
  const dt = input.durationSeconds / steps;
  const samples: DropSample[] = [];
  let height = input.dropHeightM;
  let velocity = input.initialVelocityMps;
  let impactCount = 0;
  const coefficient = 0.5 * input.airDensityKgM3 * input.dragCoefficient * input.projectedAreaM2 / input.massKg;
  for (let i = 0; i <= steps; i++) {
    const ke = 0.5 * input.massKg * velocity * velocity;
    const pe = input.massKg * input.gravityMps2 * height;
    samples.push(Object.freeze({
      timeSeconds: i * dt,
      heightAboveGroundM: height,
      velocityMps: velocity,
      speedMps: Math.abs(velocity),
      kineticEnergyJ: ke,
      gravitationalEnergyJ: pe,
      totalMechanicalEnergyJ: ke + pe,
      grounded: height === 0 && velocity === 0,
    }));
    if (i === steps) break;
    // Quadratic drag opposes movement; semi-implicit integration.
    const a = -input.gravityMps2 - coefficient * velocity * Math.abs(velocity);
    velocity += a * dt;
    if (!Number.isFinite(velocity) || Math.abs(velocity) > 10000)
      throw new Error("The drop experiment left its numerical validity range.");
    height += velocity * dt;
    if (height <= 0) {
      height = 0;
      if (velocity < 0) {
        impactCount++;
        velocity = -velocity * input.restitution;
        // A low-energy bounce cannot overcome gravity in the next substep.
        if (velocity < Math.max(0.025, input.gravityMps2 * dt)) velocity = 0;
      }
    }
  }
  return Object.freeze({
    format: "env-world-lab-drop-run" as const,
    modelVersion: "1.0.0" as const,
    evidence: "physics-model-computed" as const,
    inputEvidence: "hypothetical-user-assumed" as const,
    source: Object.freeze({ ...source }),
    input: Object.freeze({ ...input }),
    samples: Object.freeze(samples),
    impactCount,
    stepSeconds: dt,
    validity: "Simplified 1D centre-of-mass gravity, quadratic drag and flat-ground bounce; " +
      "assumed uniform density and drag coefficient. No torque, structural failure, deformation, " +
      "material discovery, object-object impacts, or engineering certification.",
  });
}

export function sampleDrop(run: DropRun, timeSeconds: number): DropSample {
  limit(timeSeconds, "Playback time (s)", 0, run.input.durationSeconds);
  return run.samples[Math.min(run.samples.length - 1, Math.round(timeSeconds / run.stepSeconds))];
}
