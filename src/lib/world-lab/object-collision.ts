import {parseWorldLabProject,solidQuantities,type WorldLabProject} from "./project.ts";

/**
 * Event-exact, ONE-dimensional frictionless central impact between two boxes.
 * Two rigid centres stay on the same Y/Z lane. Finite material densities provide
 * assumed inertial masses. This does not solve arbitrary 3D rigid-body dynamics,
 * rotating contacts, breaking matter, deformation, or continuous contact stacks.
 */
export type CollisionSample=Readonly<{
  timeSeconds:number;
  leftCenterXM:number;rightCenterXM:number;
  leftVelocityMps:number;rightVelocityMps:number;
  collided:boolean;
}>;
export type ObjectCollisionRun=Readonly<{
  format:"env-world-lab-object-collision";
  modelVersion:"1.0.0";
  evidence:"physics-model-computed";
  inputEvidence:"hypothetical-user-assumed";
  projectId:string;projectRevision:number;
  leftEntityId:string;rightEntityId:string;
  leftMaterialId:string;rightMaterialId:string;
  leftMassKg:number;rightMassKg:number;
  leftStartXM:number;rightStartXM:number;
  leftHalfWidthM:number;rightHalfWidthM:number;
  leftInitialVelocityMps:number;rightInitialVelocityMps:number;
  restitution:number;durationSeconds:number;
  impactTimeSeconds:number;
  contactXM:number;
  leftFinalVelocityMps:number;rightFinalVelocityMps:number;
  impulseNs:number;
  momentumBeforeKgMps:number;momentumAfterKgMps:number;
  energyBeforeJ:number;energyAfterJ:number;dissipatedEnergyJ:number;
  validity:string;
}>;

export function calculateObjectCollision(raw:WorldLabProject,entityAId:string,
  entityBId:string,velocityLeftMps:number,velocityRightMps:number,
  restitution:number,durationSeconds=4):ObjectCollisionRun {
  const project=parseWorldLabProject(raw);
  if(entityAId===entityBId)throw new Error("Choose two different physical solids.");
  const pair=[project.entities.find(s=>s.id===entityAId),
    project.entities.find(s=>s.id===entityBId)];
  if(!pair[0]||!pair[1])throw new Error("Both collision solids must exist.");
  if(pair.some(x=>x?.shape!=="box"))
    throw new Error("The central-impact reference currently accepts two rectangular box solids.");
  const [left,right]=[pair[0],pair[1]].sort((a,b)=>a.positionMeters[0]-b.positionMeters[0]);
  if(left.positionMeters[0]===right.positionMeters[0])
    throw new Error("Two solids must have distinct initial X centres.");
  if(Math.abs(left.positionMeters[1]-right.positionMeters[1])>1e-8 ||
     Math.abs(left.positionMeters[2]-right.positionMeters[2])>1e-8)
    throw new Error("Central one-dimensional impacts need aligned Y and Z centres.");
  const l=left.dimensionsMeters[0]/2,r=right.dimensionsMeters[0]/2;
  const gap=right.positionMeters[0]-r-(left.positionMeters[0]+l);
  if(gap<=1e-9)throw new Error("Initial colliders must not be touching or overlapping.");
  if(![velocityLeftMps,velocityRightMps,restitution,durationSeconds].every(Number.isFinite) ||
      Math.max(Math.abs(velocityLeftMps),Math.abs(velocityRightMps))>100 ||
      restitution<0 || restitution>1 || durationSeconds<=0 ||durationSeconds>30)
    throw new Error("Finite velocities ±100 m/s, restitution 0–1 and duration (0,30] s are required.");
  const speed=velocityLeftMps-velocityRightMps;
  if(speed<=0)throw new Error("The left solid must be approaching the right solid.");
  const impact=gap/speed;
  if(impact>durationSeconds)throw new Error("No impact occurs within the selected duration.");
  const leftMaterial=project.materials.find(m=>m.id===left.materialId);
  const rightMaterial=project.materials.find(m=>m.id===right.materialId);
  const ml=solidQuantities(left,leftMaterial).massKg;
  const mr=solidQuantities(right,rightMaterial).massKg;
  if(ml===null||mr===null||ml<0.001||mr<0.001||ml>10000||mr>10000)
    throw new Error("Both invented solids need assigned, finite assumed mass from density (0.001–10,000 kg).");
  const impulse=(1+restitution)*speed/(1/ml+1/mr);
  const afterL=velocityLeftMps-impulse/ml;
  const afterR=velocityRightMps+impulse/mr;
  const momentumBefore=ml*velocityLeftMps+mr*velocityRightMps;
  const momentumAfter=ml*afterL+mr*afterR;
  const energyBefore=0.5*(ml*velocityLeftMps**2+mr*velocityRightMps**2);
  const energyAfter=0.5*(ml*afterL**2+mr*afterR**2);
  const dissipated=0.5*(ml*mr/(ml+mr))*(1-restitution**2)*speed**2;
  const contact=left.positionMeters[0]+l+velocityLeftMps*impact;
  const computed=[ml,mr,impulse,afterL,afterR,momentumBefore,momentumAfter,
    energyBefore,energyAfter,dissipated,contact];
  if(!computed.every(Number.isFinite) ||
     Math.abs(momentumAfter-momentumBefore)>1e-8*Math.max(1,Math.abs(momentumBefore)) ||
     Math.abs(energyBefore-energyAfter-dissipated)>1e-8*Math.max(1,energyBefore) ||
     energyAfter>energyBefore+1e-8*Math.max(1,energyBefore))
    throw new Error("Impact conservation audit failed or exceeded numerical bounds.");
  return Object.freeze({
    format:"env-world-lab-object-collision" as const,modelVersion:"1.0.0" as const,
    evidence:"physics-model-computed" as const,inputEvidence:"hypothetical-user-assumed" as const,
    projectId:project.id,projectRevision:project.revision,
    leftEntityId:left.id,rightEntityId:right.id,
    leftMaterialId:leftMaterial!.id,rightMaterialId:rightMaterial!.id,
    leftMassKg:ml,rightMassKg:mr,
    leftStartXM:left.positionMeters[0],rightStartXM:right.positionMeters[0],
    leftHalfWidthM:l,rightHalfWidthM:r,
    leftInitialVelocityMps:velocityLeftMps,rightInitialVelocityMps:velocityRightMps,
    restitution,durationSeconds,impactTimeSeconds:impact,contactXM:contact,
    leftFinalVelocityMps:afterL,rightFinalVelocityMps:afterR,impulseNs:impulse,
    momentumBeforeKgMps:momentumBefore,momentumAfterKgMps:momentumAfter,
    energyBeforeJ:energyBefore,energyAfterJ:energyAfter,dissipatedEnergyJ:dissipated,
    validity:"Single instantaneous frictionless central collision of two ideal rigid boxes, "+
      "aligned Y/Z centres, no ground friction, rotation, gravity over the horizontal "+
      "interval, air drag or secondary contacts. Rectangular X extents set first contact. "+
      "Both masses come from user-assumed densities. Restitution is user-assumed. "+
      "Post-impact motion is free at constant velocity; this does not certify "+
      "invented-material survival, deformation or real-world safety.",
  });
}

export function sampleObjectCollision(run:ObjectCollisionRun,t:number):CollisionSample {
  if(!Number.isFinite(t)||t<0||t>run.durationSeconds)
    throw new Error("Collision time must stay inside the simulated interval.");
  const before=Math.min(t,run.impactTimeSeconds);
  const after=Math.max(0,t-run.impactTimeSeconds);
  return {
    timeSeconds:t,
    leftCenterXM:run.leftStartXM+run.leftInitialVelocityMps*before+run.leftFinalVelocityMps*after,
    rightCenterXM:run.rightStartXM+run.rightInitialVelocityMps*before+run.rightFinalVelocityMps*after,
    leftVelocityMps:t<run.impactTimeSeconds?run.leftInitialVelocityMps:run.leftFinalVelocityMps,
    rightVelocityMps:t<run.impactTimeSeconds?run.rightInitialVelocityMps:run.rightFinalVelocityMps,
    collided:t>=run.impactTimeSeconds,
  };
}
