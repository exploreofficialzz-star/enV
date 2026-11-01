import {useEffect,useMemo,useState,type PointerEvent as ReactPointerEvent} from "react";
import {rotateGroupAroundCentroid,scaleGroupAroundCentroid} from "@/lib/world-lab/cad";
import {
  alignSolids,circularPattern,distributeSolids,duplicateSolids,extrudeCircle,
  extrudeRectangle,linearPattern,mirrorSolids,rotateSolids,scaleSolids,type CadAxis,type CadAlignment,
} from "@/lib/world-lab/cad";
import type {WorldLabProject} from "@/lib/world-lab/project";
import {measureSolidCenters,snapSolidsToGrid} from "@/lib/world-lab/edit-history";

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
 const [gridStep,setGridStep]=useState(0.5);
 const [sketchWidth,setSketchWidth]=useState(2);
 const [sketchDepth,setSketchDepth]=useState(2);
 const [extrusionHeight,setExtrusionHeight]=useState(1);
 const [circleRadius,setCircleRadius]=useState(0.5);
 const [sketchBaseCenter,setSketchBaseCenter]=useState<[number,number,number]>([0,0,0]);
 const [sketchRotationDegrees,setSketchRotationDegrees]=useState<[number,number,number]>([0,0,0]);
 const [sketchShape,setSketchShape]=useState<"rectangle"|"circle">("rectangle");
 const [sketchStart,setSketchStart]=useState<{x:number;y:number}|null>(null);
 const [sketchEnd,setSketchEnd]=useState<{x:number;y:number}|null>(null);
 const [error,setError]=useState("");
 function sketchPoint(event:ReactPointerEvent<SVGSVGElement>){
   const rect=event.currentTarget.getBoundingClientRect();
   return {x:Math.max(0,Math.min(400,(event.clientX-rect.left)/rect.width*400)),
     y:Math.max(0,Math.min(220,(event.clientY-rect.top)/rect.height*220))};
 }
 function beginSketch(event:ReactPointerEvent<SVGSVGElement>){
   event.currentTarget.setPointerCapture(event.pointerId);
   const p=sketchPoint(event);setSketchStart(p);setSketchEnd(p);
 }
 function moveSketch(event:ReactPointerEvent<SVGSVGElement>){
   if(sketchStart)setSketchEnd(sketchPoint(event));
 }
 function finishSketch(event:ReactPointerEvent<SVGSVGElement>){
   if(!sketchStart)return;
   const end=sketchPoint(event),dx=end.x-sketchStart.x,dy=end.y-sketchStart.y;
   if(sketchShape==="rectangle"){
     setSketchWidth(Number((Math.max(2,Math.abs(dx))/20).toFixed(3)));
     setSketchDepth(Number((Math.max(2,Math.abs(dy))/20).toFixed(3)));
   }else{
     setCircleRadius(Number((Math.max(2,Math.hypot(dx,dy))/20).toFixed(3)));
   }
   setSketchEnd(end);setSketchStart(null);
 }
 const entityKey=project?.entities.map(e=>e.id).join("|")??"";
 useEffect(()=>{
   if(!project){setSelection([]);return;}
   setSelection(old=>{
     const valid=old.filter(id=>project.entities.some(e=>e.id===id));
     if(!valid.length&&selectedEntityId&&project.entities.some(e=>e.id===selectedEntityId))
       return [selectedEntityId];
     return valid;
   });
 },[project?.id,entityKey,selectedEntityId]);
 const selected=useMemo(()=>project?.entities.filter(e=>selection.includes(e.id))??[],
   [project,entityKey,selection]);
 const canEdit=Boolean(project&&selected.length);
 const pairMeasurement=selected.length===2?measureSolidCenters(selected[0],selected[1]):null;
 const sketchRotationRadians=sketchRotationDegrees.map(value=>value*Math.PI/180) as [number,number,number];
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
    <div className="mt-3 rounded border border-border p-2">
     <p className="text-xs font-medium">Position tools</p>
     <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="text-xs">Grid spacing (m)
       <input className={input} aria-label="CAD grid spacing (m)" type="number" min={0.001} max={100} step="any"
        value={gridStep} onChange={event=>setGridStep(Number(event.target.value))}/>
      </label>
      <button type="button" className={button} disabled={!canEdit}
       onClick={()=>apply(p=>snapSolidsToGrid(p,selection,gridStep))}>
       Snap selected to grid
      </button>
     </div>
     {pairMeasurement?<div className="mt-2 text-xs" role="status" aria-label="Selected part centre measurement">
       <p>Centre-to-centre: {pairMeasurement.centerDistanceMeters.toFixed(4)} m</p>
       <p>Horizontal distance: {pairMeasurement.horizontalDistanceMeters.toFixed(4)} m</p>
       <p>Offset X/Y/Z: {pairMeasurement.deltaMeters.map(value=>value.toFixed(3)).join(" / ")} m</p>
       <p className="text-muted-foreground">Geometry-derived centre measurement; not surface clearance or proof of contact.</p>
      </div>:<p className="mt-2 text-xs text-muted-foreground">Select exactly two parts to measure centre-to-centre distance and axis offsets.</p>}
    </div>
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
     <button className={button} disabled={!canEdit} onClick={()=>apply(p=>rotateGroupAroundCentroid(p,selection,axis,degrees))}>Rotate group around centre</button>
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
     <button className={button} disabled={!canEdit} onClick={()=>apply(p=>scaleSolids(p,selection,[factor,factor,factor]))}>Scale parts</button>
     <button className={button} disabled={!canEdit} onClick={()=>apply(p=>scaleGroupAroundCentroid(p,selection,factor))}>Scale group around centre</button>
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

    <div className="mt-3 rounded border border-border p-2">
     <p className="text-xs font-medium">2D sketch and extrusion</p>
     <p className="text-xs text-muted-foreground">
      Draw a bounded closed rectangle or circle in the X/Z sketch plane, then
      extrude along Y. These profile tools create portable box/cylinder solids;
      arbitrary curves and feature-tree history are not implied.
     </p>
     <div className="mt-2 flex gap-2">
      <button type="button" className={button} aria-pressed={sketchShape==="rectangle"}
       onClick={()=>setSketchShape("rectangle")}>Rectangle profile</button>
      <button type="button" className={button} aria-pressed={sketchShape==="circle"}
       onClick={()=>setSketchShape("circle")}>Circle profile</button>
     </div>
     <svg viewBox="0 0 400 220" role="img"
      aria-label="Draw a closed sketch profile by dragging across the grid. The profile dimensions update in metres."
      className="mt-2 h-44 w-full touch-none rounded border border-border bg-bg"
      onPointerDown={beginSketch} onPointerMove={moveSketch} onPointerUp={finishSketch}
      onPointerCancel={()=>setSketchStart(null)}>
      <defs><pattern id="world-lab-sketch-grid" width="20" height="20" patternUnits="userSpaceOnUse">
       <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.8"/>
      </pattern></defs>
      <rect width="400" height="220" fill="url(#world-lab-sketch-grid)"/>
      <path d="M200 0V220 M0 110H400" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1"/>
      {sketchStart&&sketchEnd&&sketchShape==="rectangle"&&
       <rect x={Math.min(sketchStart.x,sketchEnd.x)} y={Math.min(sketchStart.y,sketchEnd.y)}
        width={Math.max(2,Math.abs(sketchEnd.x-sketchStart.x))}
        height={Math.max(2,Math.abs(sketchEnd.y-sketchStart.y))}
        fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="2"/>}
      {sketchStart&&sketchEnd&&sketchShape==="circle"&&
       <circle cx={sketchStart.x} cy={sketchStart.y}
        r={Math.max(2,Math.hypot(sketchEnd.x-sketchStart.x,sketchEnd.y-sketchStart.y))}
        fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="2"/>}
      {!sketchStart&&sketchEnd&&<circle cx={sketchEnd.x} cy={sketchEnd.y} r="3" fill="currentColor"/>}
      <text x="10" y="15" fontSize="10" fill="currentColor">Drag to draw · 20 px = 1 m</text>
     </svg>
     <p className="text-xs text-muted-foreground">
      Draw a closed profile above to set its dimensions, or enter exact values below.
      Supported v1 extrusion profiles are a rectangle and a circle.
     </p>
     <p className="mt-2 text-xs font-medium">Sketch centre on base plane (m)</p>
     <div className="grid grid-cols-3 gap-2">
      {(["X","Y","Z"] as const).map((label,i)=><label className="text-xs" key={label}>{label}
       <input className={input} aria-label={"Sketch base centre "+label+" (m)"} type="number" step="any" value={sketchBaseCenter[i]}
        onChange={e=>setSketchBaseCenter(old=>old.map((v,j)=>j===i?Number(e.target.value):v) as [number,number,number])}/>
      </label>)}
     </div>
     <p className="mt-2 text-xs font-medium">Extrusion orientation (degrees)</p>
     <div className="grid grid-cols-3 gap-2">
      {(["X","Y","Z"] as const).map((label,i)=><label className="text-xs" key={label}>{label}
       <input className={input} aria-label={"Sketch orientation "+label+" (degrees)"} type="number" min={-360} max={360} step="1" value={sketchRotationDegrees[i]}
        onChange={e=>setSketchRotationDegrees(old=>old.map((v,j)=>j===i?Number(e.target.value):v) as [number,number,number])}/>
      </label>)}
     </div>
     <div className="mt-2 grid grid-cols-2 gap-2">
      <label className="text-xs">Rectangle width (m)
       <input className={input} aria-label="Sketch rectangle width (m)" type="number" min={0.001} max={10000} step="any"
        value={sketchWidth} onChange={e=>setSketchWidth(Number(e.target.value))}/>
      </label>
      <label className="text-xs">Rectangle depth (m)
       <input className={input} aria-label="Sketch rectangle depth (m)" type="number" min={0.001} max={10000} step="any"
        value={sketchDepth} onChange={e=>setSketchDepth(Number(e.target.value))}/>
      </label>
      <label className="text-xs">Extrusion height (m)
       <input className={input} aria-label="Sketch extrusion height (m)" type="number" min={0.001} max={10000} step="any"
        value={extrusionHeight} onChange={e=>setExtrusionHeight(Number(e.target.value))}/>
      </label>
      <label className="text-xs">Circle radius (m)
       <input className={input} aria-label="Sketch circle radius (m)" type="number" min={0.0005} max={5000} step="any"
        value={circleRadius} onChange={e=>setCircleRadius(Number(e.target.value))}/>
      </label>
     </div>
     <div className="mt-2 flex flex-wrap gap-2">
      <button className={button} disabled={!project||project.entities.length>=200}
       onClick={()=>apply(p=>extrudeRectangle(p,{center:sketchBaseCenter,
        widthMeters:sketchWidth,depthMeters:sketchDepth,heightMeters:extrusionHeight,
        rotationRadians:sketchRotationRadians},idFactory))}>
       Extrude rectangle
      </button>
      <button className={button} disabled={!project||project.entities.length>=200}
       onClick={()=>apply(p=>extrudeCircle(p,{center:sketchBaseCenter,
        radiusMeters:circleRadius,heightMeters:extrusionHeight,
        rotationRadians:sketchRotationRadians},idFactory))}>
       Extrude circle
      </button>
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
