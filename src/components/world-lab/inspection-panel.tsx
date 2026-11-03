import type {InspectionAxis,InspectionMode,InspectionNormal} from "@/lib/world-lab/inspection";
import type {WorldLabEntity} from "@/lib/world-lab/project";
type Props={mode:InspectionMode;onModeChange:(v:InspectionMode)=>void;opacity:number;onOpacityChange:(v:number)=>void;axis:InspectionAxis;onAxisChange:(v:InspectionAxis)=>void;normal:InspectionNormal;onNormalChange:(v:InspectionNormal)=>void;cutawayFraction:number;onCutawayFractionChange:(v:number)=>void;explosionDistanceM:number;onExplosionDistanceChange:(v:number)=>void;selected:WorldLabEntity|null;onSelectedOpacityChange:(v:number)=>void;hasAssembly:boolean;onZoomSelected:()=>void;onReset:()=>void;showLabels:boolean;onShowLabelsChange:(v:boolean)=>void;uiHidden:boolean;onUiHiddenChange:(v:boolean)=>void;
 canUndoView:boolean;canRedoView:boolean;onUndoView:()=>void;onRedoView:()=>void;};
const selectClass="mt-1 w-full rounded border border-border bg-bg p-2 text-sm";
export function WorldLabInspectionPanel(p:Props){
 return <section className="mt-3 rounded-xl border border-border p-3" aria-label="See inside and inspect selected invention">
  <h3 className="text-sm font-semibold">See Inside and inspect</h3>
  <p className="mt-1 text-xs text-muted-foreground">Display-only inspection controls. They never change material properties or scientific results.</p>
  <label className="mt-2 block text-sm" htmlFor="worldlab-inspection-mode">Inspection view</label>
  <select id="worldlab-inspection-mode" className={selectClass} value={p.mode} onChange={e=>p.onModeChange(e.target.value as InspectionMode)}>
   <option value="normal">Normal view</option><option value="transparent">See Inside · transparent solids</option><option value="xray">X-ray style · translucent wireframe</option><option value="cutaway">Cutaway · clip against a plane</option><option value="isolate">Isolate selected object or assembly</option><option value="exploded">Explode selected assembly</option>
  </select>
  {(p.mode==="transparent"||p.mode==="xray"||p.mode==="cutaway")&&<label className="mt-2 block text-sm" htmlFor="worldlab-inspection-opacity">Selected target opacity: {p.opacity}%
   <input id="worldlab-inspection-opacity" className="w-full" type="range" min={0} max={100} step={5}
    value={p.opacity} disabled={!p.selected} onChange={e=>p.onOpacityChange(Number(e.target.value))}/>
   {!p.selected&&<span className="block text-xs text-muted-foreground">Select an object or assembly first; the surrounding scene stays fully visible.</span>}
  </label>}
  {p.selected&&<label className="mt-2 block text-sm" htmlFor="worldlab-part-opacity">Selected part opacity: {Math.round(p.selected.opacity*100)}%<input id="worldlab-part-opacity" className="w-full" type="range" min={0} max={100} step={5} value={Math.round(p.selected.opacity*100)} onChange={e=>p.onSelectedOpacityChange(Number(e.target.value)/100)}/></label>}
  {p.mode==="cutaway"&&<>
   <label className="mt-2 block text-sm">Plane orientation preset
    <select className={selectClass} value={p.axis} onChange={e=>p.onAxisChange(e.target.value as InspectionAxis)}>
     <option value="x">X · left/right</option><option value="y">Y · vertical</option><option value="z">Z · front/back</option>
    </select>
   </label>
   <div className="mt-2 grid grid-cols-3 gap-2">
    {(["X","Y","Z"] as const).map((axis,index)=><label key={axis} className="text-xs">Normal {axis}: {p.normal[index].toFixed(2)}
     <input className="w-full" type="range" min={-1} max={1} step={0.05}
      value={p.normal[index]} onChange={e=>{
       const next=p.normal.map((v,i)=>i===index?Number(e.target.value):v) as unknown as InspectionNormal;
       if(Math.hypot(...next)>1e-9)p.onNormalChange(next);
      }}/>
    </label>)}
   </div>
   <p className="text-[11px] text-muted-foreground">The three components are normalized into one plane direction. The zero vector is not allowed.</p>
   <label className="mt-2 block text-sm">Plane position: {p.cutawayFraction.toFixed(2)}
    <input className="w-full" type="range" min={-1} max={1} step={0.05} value={p.cutawayFraction} onChange={e=>p.onCutawayFractionChange(Number(e.target.value))}/>
   </label>
  </>}
  {p.mode==="exploded"&&<label className="mt-2 block text-sm">Separation distance: {p.explosionDistanceM.toFixed(1)} m<input className="w-full" type="range" min={0} max={10} step={0.25} value={p.explosionDistanceM} onChange={e=>p.onExplosionDistanceChange(Number(e.target.value))}/></label>}
  {p.mode==="isolate"&&!p.selected&&<p role="status" className="mt-2 text-xs">Select an object first; no objects are hidden until a selection exists.</p>}
  {(p.mode==="isolate"||p.mode==="exploded")&&!p.hasAssembly&&p.selected&&<p className="mt-2 text-xs text-muted-foreground">This object is not in a connected assembly. Create an assembly to inspect its parts together.</p>}
  {p.mode==="xray"&&<p className="mt-2 text-xs text-muted-foreground">X-ray style is a translucent wireframe display, not medical imaging or a measured volumetric scan.</p>}
  <div className="mt-3 flex flex-wrap gap-2">
   <button type="button" className="rounded border border-border px-3 py-2 text-sm"
    disabled={!p.selected} onClick={p.onZoomSelected}>Zoom to selected</button>
   <button type="button" className="rounded border border-border px-3 py-2 text-sm"
    onClick={()=>p.onShowLabelsChange(!p.showLabels)} aria-pressed={p.showLabels}>
    {p.showLabels?"Hide scene labels":"Show scene labels"}
   </button>
   <button type="button" className="rounded border border-border px-3 py-2 text-sm"
    onClick={()=>p.onUiHiddenChange(!p.uiHidden)} aria-pressed={p.uiHidden}>
    {p.uiHidden?"Show viewport overlays":"Hide viewport overlays"}
   </button>
   <button type="button" className="rounded border border-border px-3 py-2 text-sm"
    disabled={!p.canUndoView} onClick={p.onUndoView}>Undo view</button>
   <button type="button" className="rounded border border-border px-3 py-2 text-sm"
    disabled={!p.canRedoView} onClick={p.onRedoView}>Redo view</button>
   <button type="button" className="rounded border border-border px-3 py-2 text-sm"
    onClick={p.onReset}>Reset inspection</button>
  </div>
  <p className="mt-2 text-xs text-muted-foreground">Electrical, stress and other field overlays appear only when their corresponding computed result is connected. No-data fields are not animated or fabricated.</p>
 </section>;
}
