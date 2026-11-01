import {cadBounds} from "./cad.ts";
import type {WorldLabEntity} from "./project.ts";

/**
 * Rotation-aware enclosing-AABB broad phase. Only unrotated rectangular boxes
 * receive an exact axis-aligned overlap classification; all other overlap
 * reports remain conservative and do not claim oriented-box contact.
 */
export type WorldLabSpatialClearance=Readonly<{
  fromId:string;toId:string;gapLowerBoundMeters:number;
  axisGapMeters:readonly [number,number,number];
  overlapDepthMeters:readonly [number,number,number];
  status:"separated"|"bounds-touch"|"box-intersection"|"potential-rotated-box-intersection"|"potential-curved-intersection";
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
  const boundA=cadBounds(a),boundB=cadBounds(b);
  const gaps:[number,number,number]=[0,0,0];
  const overlap:[number,number,number]=[0,0,0];
  for(let axis=0;axis<3;axis++){
    const minA=boundA.min[axis],maxA=boundA.max[axis];
    const minB=boundB.min[axis],maxB=boundB.max[axis];
    gaps[axis]=Math.max(0,minA-maxB,minB-maxA);
    overlap[axis]=Math.max(0,Math.min(maxA,maxB)-Math.max(minA,minB));
  }
  const gap=Math.hypot(...gaps);
  const separated=gap>1e-9;
  const touching=!separated&&overlap.some(x=>x<=1e-9);
  const exact=a.shape==="box"&&b.shape==="box"&&
    (a.rotationRadians??[0,0,0]).every(v=>Math.abs(v)<1e-10)&&
    (b.rotationRadians??[0,0,0]).every(v=>Math.abs(v)<1e-10);
  const bothBoxes=a.shape==="box"&&b.shape==="box";
  const status=separated?"separated":touching?"bounds-touch":
    exact?"box-intersection":bothBoxes?"potential-rotated-box-intersection":"potential-curved-intersection";
  return {fromId:a.id,toId:b.id,gapLowerBoundMeters:gap,
    axisGapMeters:gaps,overlapDepthMeters:overlap,status,exactForBoxes:exact,
    evidence:"geometry-model-computed",
    validity:exact?
      "Axis-aligned rectangular-box geometry only. Interpenetration is not an impact, contact-force or structural simulation.":
      bothBoxes?"Conservative transformed-AABB broad-phase for rotated rectangular solids. Overlap does not establish exact oriented-box contact, penetration depth, impact or contact force.":
      "Conservative enclosing-box broad-phase. The lower bound may be zero for curved objects that do not touch; no shape-accurate collision, material deformation or contact force is claimed."};
}
