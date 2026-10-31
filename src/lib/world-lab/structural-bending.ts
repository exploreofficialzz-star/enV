import {parseWorldLabProject,type WorldLabProject} from "./project.ts";

/**
 * Euler–Bernoulli cantilever reference, not a strength/failure certificate.
 * A box's X dimension is its horizontal unsupported length; Y is its
 * vertical depth and Z its width. The user assumes a clamped left end
 * and a downward point load at the right free end.
 */
export type StructuralBendingEvidence=Readonly<{
  format:"env-world-lab-structural-bending";
  modelVersion:"1.0.0";
  evidence:"physics-model-computed";
  materialEvidence:"hypothetical-user-assumed";
  projectId:string;
  projectRevision:number;
  entityId:string;
  materialId:string;
  appliedForceN:number;
  beamLengthM:number;
  beamDepthM:number;
  beamWidthM:number;
  assumedYoungModulusPa:number;
  secondMomentM4:number;
  maximumTipDeflectionM:number;
  maximumBendingStressPa:number;
  maximumSurfaceStrain:number;
  bendingStiffnessNm2:number;
  validity:string;
}>;

export function calculateStructuralBending(
  raw:WorldLabProject,entityId:string,appliedForceN:number,
):StructuralBendingEvidence {
  const project=parseWorldLabProject(raw);
  if(!Number.isFinite(appliedForceN)||appliedForceN<0||appliedForceN>1e8)
    throw new Error("Downward tip load must be finite between 0 and 100,000,000 N.");
  const solid=project.entities.find(e=>e.id===entityId);
  if(!solid)throw new Error("Choose a solid to test bending.");
  if(solid.shape!=="box")
    throw new Error("The cantilever reference only supports rectangular box beams.");
  const material=project.materials.find(m=>m.id===solid.materialId);
  if(!material||material.youngModulusPa===null||material.youngModulusPa<=0)
    throw new Error("Assign a hypothetical material with positive assumed Young's modulus.");
  const [length,depth,width]=solid.dimensionsMeters;
  if(length/depth<5)
    throw new Error("Euler–Bernoulli reference requires length at least five times the beam depth.");
  const I=width*depth**3/12;
  const EI=material.youngModulusPa*I;
  const deflection=appliedForceN*length**3/(3*EI);
  const stress=appliedForceN*length*depth/(2*I);
  const strain=stress/material.youngModulusPa;
  if(![I,EI,deflection,stress,strain].every(Number.isFinite)||EI<=0)
    throw new Error("Structural bending exceeded finite model limits.");
  if(deflection>0.1*length||strain>0.01)
    throw new Error("Predicted bending exceeds the small-deflection/strain reference domain; no valid result can be claimed.");
  return Object.freeze({
    format:"env-world-lab-structural-bending" as const,
    modelVersion:"1.0.0" as const,
    evidence:"physics-model-computed" as const,
    materialEvidence:"hypothetical-user-assumed" as const,
    projectId:project.id,projectRevision:project.revision,entityId,
    materialId:material.id,appliedForceN,
    beamLengthM:length,beamDepthM:depth,beamWidthM:width,
    assumedYoungModulusPa:material.youngModulusPa,
    secondMomentM4:I,maximumTipDeflectionM:deflection,
    maximumBendingStressPa:stress,maximumSurfaceStrain:strain,
    bendingStiffnessNm2:EI,
    validity:"Ideal, homogeneous, isotropic, linear-elastic, slender rectangular "+
      "cantilever with a perfectly clamped end and a static point load. The "+
      "invented Young's modulus is a user assumption, not measured evidence. "+
      "No yield strength, fracture limit, fatigue, buckling, shear deformation, "+
      "creep, torsion, safety factor or real-world load capacity is known.",
  });
}
