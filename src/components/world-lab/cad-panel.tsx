import {useEffect,useMemo,useState} from "react";
import {
  alignSolids,circularPattern,distributeSolids,duplicateSolids,linearPattern,
  mirrorSolids,rotateSolids,scaleSolids,type CadAxis,type CadAlignment,
} from "@/lib/world-lab/cad";
import type {WorldLabProject} from "@/lib/world-lab/project";

const input="w-full rounded border border-border bg-bg px-2 py-2 text-sm";
const button="rounded border border-border px-3 py-2 text-sm";
type Props={
  project:WorldLabProject|null;selectedEntityId:string;
  onChange:(transform:(project:WorldLabProject)=>WorldLabProject)=>void;
};
export function WorldLabCadPanel({project,selectedEntityId,onChange}:Props){
 const [selection,setSelection]=useState<string[]>([]);
 const [axis,setAxis]=useState<CadAxis>("z");
 const [degrees,setDegrees]=useState(15);
 const [factor,setFactor]=useState(1.1);
 const [spacing,setSpacing]=useState(1);
 const [copies,setCopies]=useState(2);
 const [instances,setInstances]=useState(6);
 const [plane,setPlane]=useState(0);
 const [center,setCenter]=useState<[number,number,number]>([0,0,0]);
 const [alignment,setAlignment]=useState<CadAlignment>("center");
 const [gap,setGap]=useState(0.25);
 const [error,setError]=useState("");
 useEffect(()=>{
   if(!project){setSelection([]);return;}
   setSelection(old=>{
     const valid=old.filter(id=>project.entities.some(e=>e.id===id));
     if(!valid.length&&selectedEntityId&&project.entities.some(e=>e.id===selectedEntityId))
       return [selectedEntityId];
     return valid;
   });
 },[project?.id,project?.entities.map(e=>e.id).join("|"),selectedEntityId]);
 const selected=useMemo(()=>project?.entities.filter(e=>selection.includes(e.id))??[],
   [project,selection]);
 const canEdit=Boolean(project&&selected.length);
 function apply(transform:(p:WorldLabProject)=>WorldLabProject){
   try{setError("");onChange(transform);}
   catch(e){setError(e instanceof Error?e.message:"CAD transformation was rejected.");}
 }
 const idFactory=()=>crypto.randomUUID();
 return <section className="mt-3 rounded-xl border border-border p-3"
   aria-label="Parametric CAD tools">
   <h3 className="text-sm font-semibold">Transform and repeat parts</h3>
   <p className="text-xs text-muted-foreground">
     Edit the actual invention geometry. Use the selection list for multiple parts.
     These CAD placement operations do not create joints, certify assemblies or
     infer material properties; a changed invention requires new scientific runs.
   </p>
   {!project||project.entities.length===0?<p className="mt-2 text-xs">Add a solid to begin CAD editing.</p>:<>
    <fieldset className="mt-2 min-w-0">
     <legend className="text-xs font-medium">Parts in this operation ({selected.length} selected)</legend>
     <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded border border-border p-2">
      {project.entities.map(e=><label key={e.id} className="flex min-h-8 items-center gap-2 text-xs">
       <input type="checkbox" checked={selection.includes(e.id)}
        onChange={event=>setSelection(old=>event.target.checked?[...old,e.id]:old.filter(x=>x!==e.id))}/>
       <span>{e.name}</span><span className="text-muted-foreground">· {e.shape}</span>
      </label>)}
     </div>
    </fieldset>
    <div className="mt-3 grid grid-cols-2 gap-2">
     <label className="text-xs">Transform axis
      <select className={input} value={axis} onChange={e=>setAxis(e.target.value as CadAxis)}>
       <option value="x">X</option><option value="y">Y</option><option value="z">Z</option>
      </select>
     </label>
     <label className="text-xs">Rotation (degrees)
      <input className={input} type="number" min={-3600} max={3600} step={1}
       value={degrees} onChange={e=>setDegrees(Number(e.target.value))}/>
     </label>
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
     <button className={button} disabled={!canEdit} onClick={()=>apply(p=>rotateSolids(p,selection,axis,degrees))}>Rotate +{degrees}°</button>
     <button className={button} disabled={!canEdit} onClick={()=>apply(p=>rotateSolids(p,selection,axis,-degrees))}>Rotate −{degrees}°</button>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
     <label className="text-xs">Uniform scale factor
      <input className={input} type="number" min={0.001} max={1000} step={0.05}
       value={factor} onChange={e=>setFactor(Number(e.target.value))}/>
     </label>
     <label className="text-xs">Pattern spacing (m)
      <input className={input} type="number" min={-100000} max={100000} step={0.1}
       value={spacing} onChange={e=>setSpacing(Number(e.target.value))}/>
     </label>
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
     <button className={button} disabled={!canEdit} onClick={()=>apply(p=>scaleSolids(p,selection,[factor,factor,factor]))}>Scale selected</button>
     <button className={button} disabled={!canEdit||project.entities.length+selected.length>200}
      onClick={()=>apply(p=>duplicateSolids(p,selection,
       axis==="x"?[spacing,0,0]:axis==="y"?[0,spacing,0]:[0,0,spacing],idFactory))}>Duplicate selected</button>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
     <label className="text-xs">Additional linear copies
      <input className={input} type="number" min={1} max={50} step={1} value={copies}
       onChange={e=>setCopies(Number(e.target.value))}/>
     </label>
     <label className="text-xs">Circular instances (including source)
      <input className={input} type="number" min={2} max={36} step={1} value={instances}
       onChange={e=>setInstances(Number(e.target.value))}/>
     </label>
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
     <button className={button} disabled={!canEdit||project.entities.length+selected.length*copies>200}
      onClick={()=>apply(p=>linearPattern(p,selection,axis,spacing,copies,idFactory))}>Create linear pattern</button>
     <button className={button} disabled={!canEdit||project.entities.length+selected.length*(instances-1)>200}
      onClick={()=>apply(p=>circularPattern(p,selection,axis,center,instances,idFactory))}>Create circular pattern</button>
    </div>
    <div className="mt-3 rounded border border-border p-2">
     <p className="text-xs font-medium">Circular pattern centre (m)</p>
     <div className="mt-1 grid grid-cols-3 gap-2">
      {(["X","Y","Z"] as const).map((v,i)=><label key={v} className="text-xs">{v}
       <input className={input} type="number" step="any" value={center[i]}
        onChange={e=>setCenter(old=>old.map((x,j)=>j===i?Number(e.target.value):x) as [number,number,number])}/>
      </label>)}
     </div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
     <label className="text-xs">Mirror plane coordinate (m)
      <input className={input} type="number" step="any" value={plane}
       onChange={e=>setPlane(Number(e.target.value))}/>
     </label>
     <label className="text-xs">Alignment
      <select className={input} value={alignment} onChange={e=>setAlignment(e.target.value as CadAlignment)}>
       <option value="min">Minimum edge</option><option value="center">Center</option><option value="max">Maximum edge</option>
      </select>
     </label>
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
     <button className={button} disabled={!canEdit} onClick={()=>apply(p=>mirrorSolids(p,selection,axis,plane))}>Mirror selected</button>
     <button className={button} disabled={!canEdit||selected.length<2} onClick={()=>apply(p=>alignSolids(p,selection,axis,alignment))}>Align selected</button>
    </div>
    <div className="mt-3 flex flex-wrap items-end gap-2">
     <label className="text-xs">Minimum gap for distribution (m)
      <input className={input} type="number" min={0} max={100000} step="any" value={gap}
       onChange={e=>setGap(Number(e.target.value))}/>
     </label>
     <button className={button} disabled={!canEdit||selected.length<3}
      onClick={()=>apply(p=>distributeSolids(p,selection,axis,gap))}>Distribute selected</button>
    </div>
   </>}
   {error&&<p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
  </section>;
}
