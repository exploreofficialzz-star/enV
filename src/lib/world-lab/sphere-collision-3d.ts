import {parseWorldLabProject,solidQuantities,type WorldLabProject} from "./project.ts";

/**
 * Exact first-contact time for two nonoverlapping ideal spheres in 3-space.
 * One isolated, instantaneous, frictionless normal impulse; no external forces.
 * No spin, soft bodies, secondary contacts, container walls, material failure,
 * measured restitution, or arbitrary-shape narrow-phase contact.
 */
export type Vec3=readonly [number,number,number];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const plus=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(a:Vec3,k:number):Vec3=>[a[0]*k,a[1]*k,a[2]*k];
const cross=(a:Vec3,b:Vec3):Vec3=>[
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0],
];
const length=(a:Vec3)=>Math.hypot(...a);
const finite=(a:Vec3)=>a.every(Number.isFinite);

export type SphereImpactEvidence=Readonly<{
  format:"env-world-lab-sphere-impact-3d";
  modelVersion:"1.0.0";
  evidence:"physics-model-computed";
  assumptionEvidence:"hypothetical-user-assumed";
  projectId:string;projectRevision:number;
  firstEntityId:string;secondEntityId:string;
  firstMaterialId:string;secondMaterialId:string;
  initialFirstCentreM:Vec3;initialSecondCentreM:Vec3;
  firstInitialVelocityMps:Vec3;secondInitialVelocityMps:Vec3;
  firstFinalVelocityMps:Vec3;secondFinalVelocityMps:Vec3;
  firstRadiusM:number;secondRadiusM:number;
  firstMassKg:number;secondMassKg:number;
  impactTimeSeconds:number;durationSeconds:number;
  restitution:number;
  impactNormal:Vec3;
  impulseNs:Vec3;
  momentumBeforeKgMps:Vec3;momentumAfterKgMps:Vec3;
  angularMomentumBeforeKgM2PerS:Vec3;angularMomentumAfterKgM2PerS:Vec3;
  energyBeforeJ:number;energyAfterJ:number;dissipatedEnergyJ:number;
  validity:string;
}>;

export function solveSphereImpact3d(raw:WorldLabProject,firstId:string,secondId:string,
  firstVelocityMps:Vec3,secondVelocityMps:Vec3,
  restitution:number,durationSeconds=4):SphereImpactEvidence {
  const project=parseWorldLabProject(raw);
  if(firstId===secondId)throw new Error("Select two distinct spheres.");
  const a=project.entities.find(e=>e.id===firstId);
  const b=project.entities.find(e=>e.id===secondId);
  if(!a||!b||a.shape!=="sphere"||b.shape!=="sphere")
    throw new Error("True 3D central-contact reference requires two existing spheres.");
  if(!finite(firstVelocityMps)||!finite(secondVelocityMps)||
      length(firstVelocityMps)>100||length(secondVelocityMps)>100||
      !Number.isFinite(restitution)||restitution<0||restitution>1||
      !Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>30)
    throw new Error("Velocities must be finite and at most 100 m/s; restitution 0–1 and duration (0,30] s.");
  const pA=a.positionMeters,pB=b.positionMeters;
  const rA=a.dimensionsMeters[0]/2,rB=b.dimensionsMeters[0]/2;
  const delta=sub(pB,pA), relative=sub(secondVelocityMps,firstVelocityMps);
  const radius=rA+rB;
  if(length(delta)<=radius+1e-9)
    throw new Error("Spheres must start strictly separated, not overlapping or in contact.");
  const qa=dot(relative,relative),qb=2*dot(delta,relative);
  const qc=dot(delta,delta)-radius**2;
  if(qa<=0||qb>=0)
    throw new Error("No approaching sphere collision occurs at these relative velocities.");
  const discriminant=qb*qb-4*qa*qc;
  if(discriminant<0)
    throw new Error("The two moving spheres will miss each other.");
  const hit=(-qb-Math.sqrt(discriminant))/(2*qa);
  if(!Number.isFinite(hit)||hit<0||hit>durationSeconds)
    throw new Error("No sphere impact occurs within the selected simulation duration.");
  const normal=mul(plus(delta,mul(relative,hit)),1/radius);
  const normalSize=length(normal);
  if(!Number.isFinite(normalSize)||Math.abs(normalSize-1)>1e-7)
    throw new Error("Impact geometry failed its normal-vector consistency audit.");
  const closing=dot(relative,normal);
  if(closing>=-1e-10)
    throw new Error("No inward-moving sphere impact at first contact.");

  const maMaterial=project.materials.find(m=>m.id===a.materialId);
  const mbMaterial=project.materials.find(m=>m.id===b.materialId);
  const ma=solidQuantities(a,maMaterial).massKg;
  const mb=solidQuantities(b,mbMaterial).massKg;
  if(ma===null||mb===null||ma<0.001||mb<0.001||ma>10000||mb>10000)
    throw new Error("Both spheres require invented density assumptions giving mass from 0.001 to 10,000 kg.");
  const impulseMagnitude=-(1+restitution)*closing/(1/ma+1/mb);
  const impulse=mul(normal,impulseMagnitude);
  const nextA=sub(firstVelocityMps,mul(impulse,1/ma));
  const nextB=plus(secondVelocityMps,mul(impulse,1/mb));
  const momentumBefore=plus(mul(firstVelocityMps,ma),mul(secondVelocityMps,mb));
  const momentumAfter=plus(mul(nextA,ma),mul(nextB,mb));
  const energyBefore=0.5*(ma*dot(firstVelocityMps,firstVelocityMps)+
    mb*dot(secondVelocityMps,secondVelocityMps));
  const energyAfter=0.5*(ma*dot(nextA,nextA)+mb*dot(nextB,nextB));
  const dissipated=0.5*ma*mb/(ma+mb)*(1-restitution**2)*closing**2;
  const atHitA=plus(pA,mul(firstVelocityMps,hit));
  const atHitB=plus(pB,mul(secondVelocityMps,hit));
  const angularBefore=plus(mul(cross(atHitA,firstVelocityMps),ma),
    mul(cross(atHitB,secondVelocityMps),mb));
  const angularAfter=plus(mul(cross(atHitA,nextA),ma),
    mul(cross(atHitB,nextB),mb));
  const tol=1e-8;
  if(![...impulse,...nextA,...nextB,...momentumBefore,...momentumAfter,
    ...angularBefore,...angularAfter,energyBefore,energyAfter,dissipated].every(Number.isFinite)||
    length(sub(momentumBefore,momentumAfter))>tol*Math.max(1,length(momentumBefore))||
    length(sub(angularBefore,angularAfter))>tol*Math.max(1,length(angularBefore))||
    Math.abs(energyBefore-energyAfter-dissipated)>tol*Math.max(1,energyBefore)||
    energyAfter>energyBefore+tol*Math.max(1,energyBefore))
    throw new Error("3D impulse violates finite momentum, angular momentum or energy audits.");
  return Object.freeze({
    format:"env-world-lab-sphere-impact-3d" as const,
    modelVersion:"1.0.0" as const,evidence:"physics-model-computed" as const,
    assumptionEvidence:"hypothetical-user-assumed" as const,
    projectId:project.id,projectRevision:project.revision,
    firstEntityId:a.id,secondEntityId:b.id,
    firstMaterialId:maMaterial!.id,secondMaterialId:mbMaterial!.id,
    initialFirstCentreM:pA,initialSecondCentreM:pB,
    firstInitialVelocityMps:firstVelocityMps,secondInitialVelocityMps:secondVelocityMps,
    firstFinalVelocityMps:nextA,secondFinalVelocityMps:nextB,
    firstRadiusM:rA,secondRadiusM:rB,firstMassKg:ma,secondMassKg:mb,
    impactTimeSeconds:hit,durationSeconds,restitution,
    impactNormal:normal,impulseNs:impulse,
    momentumBeforeKgMps:momentumBefore,momentumAfterKgMps:momentumAfter,
    angularMomentumBeforeKgM2PerS:angularBefore,
    angularMomentumAfterKgM2PerS:angularAfter,
    energyBeforeJ:energyBefore,energyAfterJ:energyAfter,dissipatedEnergyJ:dissipated,
    validity:"Exactly two ideal nonrotating rigid spheres, free-flight at constant 3D velocity, "+
      "one frictionless instantaneous normal impulse, no gravity, rolling, "+
      "tangential friction, deformation, thermal transfer, obstacles, "+
      "additional impacts, damage or fracture. Invented masses and "+
      "coefficient of restitution are assumptions, not verified material performance.",
  });
}

export function sampleSphereImpact3d(run:SphereImpactEvidence,timeSeconds:number) {
  if(!Number.isFinite(timeSeconds)||timeSeconds<0||timeSeconds>run.durationSeconds)
    throw new Error("3D impact playback is outside the calculated duration.");
  const before=Math.min(timeSeconds,run.impactTimeSeconds);
  const after=Math.max(0,timeSeconds-run.impactTimeSeconds);
  return {
    timeSeconds,collided:timeSeconds>=run.impactTimeSeconds,
    firstCentreM:plus(plus(run.initialFirstCentreM,mul(run.firstInitialVelocityMps,before)),
      mul(run.firstFinalVelocityMps,after)),
    secondCentreM:plus(plus(run.initialSecondCentreM,mul(run.secondInitialVelocityMps,before)),
      mul(run.secondFinalVelocityMps,after)),
    firstVelocityMps:timeSeconds<run.impactTimeSeconds?
      run.firstInitialVelocityMps:run.firstFinalVelocityMps,
    secondVelocityMps:timeSeconds<run.impactTimeSeconds?
      run.secondInitialVelocityMps:run.secondFinalVelocityMps,
  };
}
