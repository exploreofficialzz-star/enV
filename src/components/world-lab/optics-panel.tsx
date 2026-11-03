import {useState} from "react";
import {parseWorldLabProject,reviseWorldLabMaterial,
  type WorldLabProject} from "@/lib/world-lab/project";
import {calculateOpticalInterface,type OpticalInterfaceRun} from "@/lib/world-lab/optics";
import {traceOpticalScene,type OpticalRayTrace} from "@/lib/world-lab/optical-ray-trace";
import type {Vec3} from "@/lib/world-lab/sphere-collision-3d";

type Props={
  project:WorldLabProject|null;
  mutateProject:(edit:(p:WorldLabProject)=>WorldLabProject)=>void;
  onKeepEvidence:(result:OpticalInterfaceRun|OpticalRayTrace)=>void;
  onVisualize:(run:OpticalInterfaceRun|null)=>void;
  onVisualizeRay:(trace:OpticalRayTrace|null)=>void;
};
const field="rounded border border-border bg-bg px-2 py-1 text-sm";
const button="rounded border border-border px-3 py-2 text-sm";
const readVector=(value:string):Vec3=>{
  const numbers=value.split(",").map(s=>s.trim()).map(Number);
  if(numbers.length!==3||numbers.some(n=>!Number.isFinite(n)||Math.abs(n)>100000))
    throw new Error("Enter three finite X,Y,Z coordinates separated by commas.");
  return [numbers[0],numbers[1],numbers[2]];
};
export function WorldLabOpticsPanel({
  project,mutateProject,onKeepEvidence,onVisualize,onVisualizeRay,
}:Props){
  const [source,setSource]=useState("");
  const [destination,setDestination]=useState("");
  const [editMaterial,setEditMaterial]=useState("");
  const [assumedIndex,setAssumedIndex]=useState("1.5");
  const [angle,setAngle]=useState(30);
  const [result,setResult]=useState<OpticalInterfaceRun|null>(null);
  const [error,setError]=useState("");
  const [rayOrigin,setRayOrigin]=useState("-4,0,0");
  const [rayDirection,setRayDirection]=useState("1,0,0");
  const [rayDistance,setRayDistance]=useState(10);
  const [rayBudget,setRayBudget]=useState(8);
  const [rayResult,setRayResult]=useState<OpticalRayTrace|null>(null);
  const traceable=project?.entities.filter(e=>
    e.scientificRole==="reference-solid"&&
    (e.shape==="sphere"||e.shape==="box")&&
    project.materials.some(m=>m.id===e.materialId&&m.refractiveIndex!=null))??[];
  const currentRay=rayResult&&project?.id===rayResult.projectId&&
    project.revision===rayResult.projectRevision?rayResult:null;
  const resetRay=()=>{setRayResult(null);onVisualizeRay(null);};
  const materials=project?.materials??[];
  const first=materials.some(m=>m.id===source)?source:materials[0]?.id??"";
  const second=materials.some(m=>m.id===destination)&&destination!==first?
    destination:materials.find(m=>m.id!==first)?.id??"";
  const current=result&&project?.id===result.projectId&&
    project?.revision===result.projectRevision?result:null;
  const saveIndex=()=>{
    if(!editMaterial)return;
    try{
      const index=assumedIndex.trim()===""?null:Number(assumedIndex);
      if(index!==null&&(!Number.isFinite(index)||index<1||index>5))
        throw new Error("Assumed index must be 1 to 5, or blank for unknown.");
      mutateProject(p=>{
        const m=p.materials.find(x=>x.id===editMaterial);
        if(!m)throw new Error("Choose an invented material.");
        return reviseWorldLabMaterial(p,m.id,{
          name:m.name,densityKgM3:m.densityKgM3,youngModulusPa:m.youngModulusPa,
          refractiveIndex:index,
        });
      });
      setResult(null);onVisualize(null);resetRay();setError("");
    }catch(cause){setError(cause instanceof Error?cause.message:"Invalid optical assumption.");}
  };
  return <section className="mb-3 rounded-xl border border-border p-3"
    aria-label="Invented material optical interface">
    <h3 className="text-sm font-semibold">Invent light and material behavior</h3>
    <p className="text-xs text-muted-foreground">
      Choose two invented materials, assume their refractive indices, and see
      how an ideal light ray reflects and bends at a flat boundary.
      Unknown properties remain unknown; this does not establish real optical performance.
    </p>
    {materials.length===0&&<p className="mt-2 text-xs">Invent at least two materials to begin.</p>}
    {materials.length>0&&<div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="text-xs">Material whose optical assumption you want to edit
        <select className={field+" block"} value={editMaterial}
          onChange={e=>{
            setEditMaterial(e.target.value);
            setAssumedIndex(project?.materials.find(m=>m.id===e.target.value)
              ?.refractiveIndex?.toString()??"");
          }}>
          <option value="">Choose material</option>
          {materials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <label className="text-xs">Assumed refractive index (1–5)
        <input className={field+" block"} type="number" min={1} max={5}
          step={0.01} value={assumedIndex} onChange={e=>setAssumedIndex(e.target.value)}/>
      </label>
      <button className={button} type="button" disabled={!editMaterial}
        onClick={saveIndex}>Save optical assumption</button>
    </div>}
    {materials.length>=2&&<div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="text-xs">Light starts in
          <select className={field+" block"} value={first}
            onChange={e=>{setSource(e.target.value);setResult(null);onVisualize(null);}}>
            {materials.map(m=><option key={m.id} value={m.id}>
              {m.name} (n = {m.refractiveIndex??"unknown"})
            </option>)}
          </select>
        </label>
        <label className="text-xs">Light enters
          <select className={field+" block"} value={second}
            onChange={e=>{setDestination(e.target.value);setResult(null);onVisualize(null);}}>
            {materials.filter(m=>m.id!==first).map(m=><option key={m.id} value={m.id}>
              {m.name} (n = {m.refractiveIndex??"unknown"})
            </option>)}
          </select>
        </label>
        <label className="text-xs">Incidence angle from normal (°)
          <input className={field+" block"} type="number" min={0} max={89.9}
            step={0.1} value={angle} onChange={e=>{
              setAngle(Number(e.target.value));setResult(null);onVisualize(null);
            }}/>
        </label>
      </div>
      <button className={button} type="button" onClick={()=>{
        if(!project)return;
        try{
          const next=calculateOpticalInterface(parseWorldLabProject(project),
            first,second,angle);
          resetRay();setResult(next);onVisualize(next);setError("");
        }catch(cause){setResult(null);onVisualize(null);
          setError(cause instanceof Error?cause.message:"Unsupported light model.");}
      }}>Calculate ideal light interface locally</button>
    </div>}
    {current&&<div className="mt-3 space-y-2 text-xs" aria-live="polite">
      <p>Reflection: {(100*current.unpolarizedReflectance).toFixed(3)}% ·
        Transmission: {(100*current.unpolarizedTransmittance).toFixed(3)}%</p>
      <p>{current.totalInternalReflection?"Total internal reflection":
        "Transmitted angle: "+current.transmittedAngleDegrees?.toFixed(3)+"°"} ·
        Reflected angle: {current.reflectedAngleDegrees.toFixed(3)}°</p>
      <p>Critical angle: {current.criticalAngleDegrees===null?"Not applicable":
        current.criticalAngleDegrees.toFixed(3)+"°"} ·
        Ideal power balance residual: {current.energyResidual.toExponential(2)}</p>
      <button className={button} type="button" onClick={()=>onKeepEvidence(current)}>
        Keep optical evidence with invention
      </button>
      <p className="text-muted-foreground">The drawn rays are an XY-plane illustration at the origin, not a collision or optical trace through your 3D solids.</p>
      <p className="text-muted-foreground">{current.validity}</p>
    </div>}
    <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs"
      aria-label="Trace light through invented 3D solids">
      <h4 className="font-semibold">Trace a light ray through your 3D invention</h4>
      <p className="text-muted-foreground">
        Unlike the flat-boundary illustration, this traces your actual placed
        reference boxes and spheres with invented refractive indices.
        It follows one primary ray and records untraced reflection energy,
        not a fully illuminated scene.
      </p>
      <p>{traceable.length} optically configured box or sphere
        {traceable.length===1?"":"s"} in this invention (1–40 supported).</p>
      {traceable.length>0&&<button className={button} type="button" onClick={()=>{
        const target=traceable[0];
        const [x,y,z]=target.positionMeters;
        const offset=Math.max(2,target.dimensionsMeters[0]);
        setRayOrigin([x-offset*2,y,z].join(","));
        setRayDirection("1,0,0");
        setRayDistance(Math.min(1000,offset*5));
        resetRay();
      }}>Aim at first optical solid: {traceable[0].name}</button>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label>Ray origin X,Y,Z (metres)
          <input className={field+" block w-full"} value={rayOrigin}
            onChange={e=>{setRayOrigin(e.target.value);resetRay();}}/>
        </label>
        <label>Ray direction X,Y,Z
          <input className={field+" block w-full"} value={rayDirection}
            onChange={e=>{setRayDirection(e.target.value);resetRay();}}/>
        </label>
        <label>Maximum propagation distance (m)
          <input className={field+" block w-full"} type="number" min={0.1}
            max={1000} step={1} value={rayDistance}
            onChange={e=>{setRayDistance(Number(e.target.value));resetRay();}}/>
        </label>
        <label>Maximum material boundaries
          <input className={field+" block w-full"} type="number" min={1}
            max={16} step={1} value={rayBudget}
            onChange={e=>{setRayBudget(Number(e.target.value));resetRay();}}/>
        </label>
      </div>
      <button className={button} type="button" disabled={traceable.length===0}
        onClick={()=>{
          if(!project)return;
          try{
            const trace=traceOpticalScene(project,{
              originMeters:readVector(rayOrigin),
              direction:readVector(rayDirection),
              maximumDistanceMeters:rayDistance,
              maximumInterfaces:rayBudget,
            });
            setRayResult(trace);
            onVisualize(null);onVisualizeRay(trace);setError("");
          }catch(cause){
            resetRay();
            setError(cause instanceof Error?cause.message:
              "This optical geometry is outside the supported tracing domain.");
          }
        }}>Trace actual invented 3D geometry locally</button>
      {currentRay&&<div className="space-y-2" aria-live="polite">
        <p>Computed {currentRay.segments.length} ray segments.
          Surviving primary-ray power:
          {" "+(currentRay.finalPrimaryRayPowerFraction*100).toFixed(3)+"%"}.
          Unfollowed reflection power:
          {" "+(currentRay.accountedLostBranchPowerFraction*100).toFixed(3)+"%"}.
        </p>
        <div className="max-h-40 overflow-auto">
          {currentRay.segments.map((part,i)=>
            <p key={i}>Segment {i+1} — {part.kind},
              {part.entityId?" solid "+part.entityId:" exterior"}:
              {" "+part.travelMeters.toPrecision(4)+" m"}.
              Reflection {(part.reflectance*100).toFixed(2)}%.</p>)}
        </div>
        <button className={button} type="button"
          onClick={()=>onKeepEvidence(currentRay)}>
          Keep 3D optical trace with invention
        </button>
        <p className="text-muted-foreground">{currentRay.validity}</p>
      </div>}
    </div>
    {error&&<p role="alert" className="mt-2 text-xs">{error}</p>}
  </section>;
}
