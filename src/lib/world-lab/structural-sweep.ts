import {parseWorldLabProject,type WorldLabProject} from "./project.ts";
import {calculateStructuralBending} from "./structural-bending.ts";

/** Deterministic Euler-Bernoulli sensitivity study of an invented beam. */
const FACTORS=[0.5,0.75,1,1.25,1.5] as const;
export function runStructuralAssumptionSweep(raw:WorldLabProject,
  entityId:string,baseTipForceN:number){
  const project=parseWorldLabProject(raw);
  const baseline=calculateStructuralBending(project,entityId,baseTipForceN);
  const rows:Array<{
    forceScale:number;modulusScale:number;tipForceN:number;
    assumedModulusPa:number;status:"computed"|"outside-domain";
    tipDeflectionM:number|null;maximumBendingStressPa:number|null;
    maximumSurfaceStrain:number|null;
  }>=[];
  for(const forceScale of FACTORS){
    for(const modulusScale of FACTORS){
      const tipForceN=baseTipForceN*forceScale;
      const assumedModulusPa=baseline.assumedYoungModulusPa*modulusScale;
      try{
        const changed=parseWorldLabProject({...project,materials:project.materials.map(m=>
          m.id===baseline.materialId?{...m,youngModulusPa:assumedModulusPa}:m)});
        const evidence=calculateStructuralBending(changed,entityId,tipForceN);
        rows.push({forceScale,modulusScale,tipForceN,assumedModulusPa,
          status:"computed",tipDeflectionM:evidence.maximumTipDeflectionM,
          maximumBendingStressPa:evidence.maximumBendingStressPa,
          maximumSurfaceStrain:evidence.maximumSurfaceStrain});
      }catch{
        rows.push({forceScale,modulusScale,tipForceN,assumedModulusPa,
          status:"outside-domain",tipDeflectionM:null,
          maximumBendingStressPa:null,maximumSurfaceStrain:null});
      }
    }
  }
  return Object.freeze({
    format:"env-world-lab-structural-assumption-sweep" as const,
    modelVersion:"1.0.0" as const,
    evidence:"physics-model-computed" as const,
    inputEvidence:"hypothetical-user-assumed" as const,
    projectId:project.id,projectRevision:project.revision,entityId,
    materialId:baseline.materialId,
    baseTipForceN,baseYoungModulusPa:baseline.assumedYoungModulusPa,
    baseline,scenarioCount:rows.length,
    successfulCount:rows.filter(row=>row.status==="computed").length,
    scenarios:rows,
    validity:"25 ideal small-deformation Euler-Bernoulli cantilever cases varying "+
      "inventor-assumed Young's modulus and applied tip force. Cases outside "+
      "the 1% strain or 10% deflection domain are rejected, not extrapolated. "+
      "No material fracture/yield strength, reliability, load rating, fatigue, "+
      "buckling or measured structural behavior is implied.",
  });
}
