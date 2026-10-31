import type {WorldLabEntity} from "./project.ts";

/**
 * Primitive-axis aligned broad-phase only. Portable v1 has no rotation.
 * For two boxes the Euclidean surface gap is exact; for a curved shape
 * it is a conservative lower bound from the enclosing AABBs.
 */
export type WorldLabSpatialClearance=Readonly<{
  fromId:string;toId:string;gapLowerBoundMeters:number;
  axisGapMeters:readonly [number,number,number];
  overlapDepthMeters:readonly [number,number,number];
  status:"separated"|"bounds-touch"|"box-intersection"|"potential-curved-intersection";
  exactForBoxes:boolean;
  evidence:"geometry-model-computed";
  validity:string;
}>;
export function inspectWorldLabSpatialClearance(
  a:WorldLabEntity,b:WorldLabEntity):WorldLabSpatialClearance {
  if(a.id===b.id)throw new Error("Choose two distinct physical solids.");
  const coords=[a.positionMeters,b.positionMeters].flat();
  const sizes=[a.dimensionsMeters,b.dimensionsMeters].flat();
  if(coords.some(x=>!Number.isFinite(x)||Math.abs(x)>100000)||
    sizes.some(x=>!Number.isFinite(x)||x<=0||x>10000))
    throw new Error("Invalid bounded primitive geometry.");
  const gaps:[number,number,number]=[0,0,0];
  const overlap:[number,number,number]=[0,0,0];
  for(let axis=0;axis<3;axis++){
    const halfA=a.dimensionsMeters[axis]/2,halfB=b.dimensionsMeters[axis]/2;
    const minA=a.positionMeters[axis]-halfA,maxA=a.positionMeters[axis]+halfA;
    const minB=b.positionMeters[axis]-halfB,maxB=b.positionMeters[axis]+halfB;
    gaps[axis]=Math.max(0,minA-maxB,minB-maxA);
    overlap[axis]=Math.max(0,Math.min(maxA,maxB)-Math.max(minA,minB));
  }
  const gap=Math.hypot(...gaps);
  const separated=gap>1e-9;
  const touching=!separated&&overlap.some(x=>x<=1e-9);
  const exact=a.shape==="box"&&b.shape==="box";
  const status=separated?"separated":touching?"bounds-touch":
    exact?"box-intersection":"potential-curved-intersection";
  return {fromId:a.id,toId:b.id,gapLowerBoundMeters:gap,
    axisGapMeters:gaps,overlapDepthMeters:overlap,status,exactForBoxes:exact,
    evidence:"geometry-model-computed",
    validity:exact?
      "Axis-aligned rectangular-box geometry only. Interpenetration is not an impact, contact-force or structural simulation.":
      "Conservative enclosing-box broad-phase. The lower bound may be zero for curved objects that do not touch; no shape-accurate collision, material deformation or contact force is claimed."};
}
