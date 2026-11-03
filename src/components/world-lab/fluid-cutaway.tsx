import type {WorldLabEntity} from "@/lib/world-lab/project";
import type {HydrostaticResult} from "@/lib/world-lab/hydrostatics";

/** Read-only cutaway. Waterline follows the actual chosen solver immersion. */
export function WorldLabFluidCutaway({
  entity,result,
}:Readonly<{entity:WorldLabEntity;result:HydrostaticResult}>){
  const height=entity.dimensionsMeters[1];
  const fraction=Math.max(0,Math.min(1,result.input.immersionDepthM/height));
  const surfaceY=155-140*fraction;
  const shape=entity.shape;
  const silhouette=shape==="sphere"?
    <circle cx="140" cy="85" r="70" fill="none" stroke="currentColor" strokeWidth="2.5"/>:
    <rect x="90" y="15" width="100" height="140" rx={shape==="cylinder"?15:0}
      fill="none" stroke="currentColor" strokeWidth="2.5"/>;
  return <figure className="mt-2 rounded-lg border border-border p-2"
    aria-label="Fluid surface and invented solid cutaway">
    <figcaption className="text-xs font-medium">See the fluid level against your invention</figcaption>
    <svg role="img" viewBox="0 0 280 180" width="100%" style={{maxHeight:240}}
      aria-label={"Schematic cross-section with "+result.input.immersionDepthM.toFixed(3)+
        " metres of solid immersed; calculated upward buoyancy "+
        result.buoyancyForceN.toFixed(3)+" newtons"}>
      <title>Hydrostatic cutaway at the selected immersion</title>
      <desc>Illustrative 2D cutaway only, not a measured volume image. The displayed waterline follows the exact input depth used for the numerical calculation.</desc>
      <rect x="3" y={surfaceY} width="274" height={155-surfaceY}
        fill="#0ea5e9" fillOpacity="0.16"/>
      <line x1="3" x2="277" y1={surfaceY} y2={surfaceY}
        stroke="#0284c7" strokeWidth="2.5" strokeDasharray="6 3"/>
      {silhouette}
      <text x="8" y="12" fill="currentColor" fontSize="11">Assumed fluid</text>
      <text x="8" y="175" fill="currentColor" fontSize="11">
        {Math.round(fraction*100)}% vertical immersion
      </text>
    </svg>
    <p className="text-xs text-muted-foreground">
      Display is a schematic slice, not a volumetric fluid solver. The buoyancy,
      pressure and equilibrium values below come from the shape equations and
      the explicit hypothetical input assumptions.
    </p>
  </figure>;
}
