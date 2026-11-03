import { parseWorldLabProject, solidQuantities, type WorldLabProject } from "./project.ts";
import { validateModel, type AssumedMassSource, type DampedOscillator } from "./model.ts";

/**
 * A user-invented material can supply *assumed* inertial mass to the
 * independent linear mass/spring reference model.
 *
 * This is NOT a rigid-body simulation of the shape. The shape's uniform
 * assumed density is used only as a lumped mass; collision, strength,
 * rotational inertia, contact, thermal or material behavior are not predicted.
 */
export function deriveOscillatorFromSolid(
  projectInput: WorldLabProject,
  selectedEntityId: string,
  spring: DampedOscillator,
): Readonly<{input: DampedOscillator; source: AssumedMassSource}> {
  const project = parseWorldLabProject(projectInput);
  const entity = project.entities.find(item => item.id === selectedEntityId);
  if (!entity) throw new Error("Select a solid in the World Lab project first.");
  const material = project.materials.find(item => item.id === entity.materialId);
  if (!material) throw new Error("Assign a hypothetical material with a density assumption to this solid.");
  if (material.densityKgM3 === null) {
    throw new Error("The material density is unknown. Enter a hypothetical density before running this derived-mass experiment.");
  }
  const quantity = solidQuantities(entity, material);
  if (quantity.massKg === null) throw new Error("Material mass could not be derived.");
  const input: DampedOscillator = { ...spring, massKg: quantity.massKg };
  // Prevent a browser from attempting a numerically impossible trajectory.
  validateModel(input);
  const source: AssumedMassSource = {
    kind: "material-geometry-mass",
    evidence: "hypothetical-user-assumed",
    projectId: project.id,
    projectRevision: project.revision,
    entityId: entity.id,
    entityName: entity.name,
    materialId: material.id,
    materialName: material.name,
    volumeM3: quantity.volumeM3,
    assumedDensityKgM3: material.densityKgM3,
    derivedMassKg: quantity.massKg,
    assumption: "Uniform hypothetical density times ideal solid volume; treated solely as a lumped 1D inertial mass. No contact or material-strength effects.",
  };
  return Object.freeze({ input: Object.freeze(input), source: Object.freeze(source) });
}
