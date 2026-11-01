import type {FieldLayer,FieldPalette,FieldVectorPlane} from "@/lib/world-lab/field-layer";
import {fieldTensorSliceAtTime} from "@/lib/world-lab/field-layer";
import {fieldFrameAtTime,fieldScalarSliceAtTime,fieldVectorGlyphsAtTime,fieldVectorStreamlinesAtTime,isFieldOverlayRendererImplemented} from "@/lib/world-lab/field-layer";

type Props={layers:readonly FieldLayer[];selectedId:string;onSelect:(id:string)=>void;
 timeSeconds:number;overlayEnabled:boolean;onOverlayChange:(v:boolean)=>void;
 vectorPlane:FieldVectorPlane;onVectorPlaneChange:(v:FieldVectorPlane)=>void;
 vectorSliceIndex:number;onVectorSliceIndexChange:(v:number)=>void;tensorComponent:number;onTensorComponentChange:(v:number)=>void};
const palette:Record<FieldPalette,readonly [number,number,number][]>={
 cividis:[[0,32,76],[55,77,104],[123,124,118],[182,168,109],[254,232,56]],
 viridis:[[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]],
 magma:[[0,0,4],[81,18,124],[183,55,121],[252,137,97],[252,253,191]],
 "blue-orange":[[33,102,172],[146,197,222],[247,247,247],[244,165,130],[178,24,43]],
};
function colorFor(value:number,minimum:number,maximum:number,p:FieldPalette):string{
 const t=maximum===minimum?0.5:Math.max(0,Math.min(1,(value-minimum)/(maximum-minimum)));
 const stops=palette[p],scaled=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(scaled)),f=scaled-i;
 const c=stops[i].map((v,k)=>Math.round(v+(stops[i+1][k]-v)*f));
 return "rgb("+c.join(",")+")";
}
export function WorldLabFieldPanel(p:Props){
 const layer=p.layers.find(x=>x.id===p.selectedId)??p.layers[0]??null;
 const frame=layer&&["scalar","vector","tensor"].includes(layer.kind)?fieldFrameAtTime(layer,p.timeSeconds):null;
 const current=frame?.values.filter((v):v is number=>typeof v==="number")??[];
 const latestEvents=layer?.events.filter(e=>e.atSeconds<=p.timeSeconds)??[];
 const source=layer?.source.kind==="solver"
  ?layer.source.modelId+" v"+layer.source.modelVersion+" · run "+layer.source.runId
  :layer?.source.kind==="dataset"?layer.source.provider+" · "+layer.source.datasetVersion:"";
 return <section className="mt-3 rounded-xl border border-border p-3"
  aria-label="Scientific field layers">
  <h3 className="text-sm font-semibold">Scientific fields</h3>
  <p className="mt-1 text-xs text-muted-foreground">
   Only recorded solver outputs and provenance-checked observations can become overlays.
   Unsupported fields remain unavailable; no internal activity is invented.
  </p>
  {p.layers.length===0?<p className="mt-2 text-sm" role="status">
   No computed field is available for this experiment. Run a supported model to create a field from its stored samples.
  </p>:<>
   <label className="mt-2 block text-sm" htmlFor="worldlab-field-layer">Field overlay</label>
   <select id="worldlab-field-layer" className="mt-1 w-full rounded border border-border bg-bg p-2"
    value={layer?.id??""} onChange={e=>p.onSelect(e.target.value)}>
    {p.layers.map(x=><option key={x.id} value={x.id}>{x.label} · {x.units.display}</option>)}
   </select>
   {layer&&<>
    <label className="mt-2 flex items-center gap-2 text-sm">
     <input type="checkbox" checked={p.overlayEnabled} onChange={e=>p.onOverlayChange(e.target.checked)}/>
     Show field overlay on the interactive scene
    </label>
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
     <div><dt className="text-muted-foreground">Type</dt><dd>{layer.kind}</dd></div>
     <div><dt className="text-muted-foreground">Renderer</dt><dd>{layer.renderer.kind}</dd></div>
     <div><dt className="text-muted-foreground">Units</dt><dd>{layer.units.si} SI · {layer.units.display} display</dd></div>
     <div><dt className="text-muted-foreground">Resolution</dt><dd>{layer.resolution.dimensions.join(" × ")} ({layer.resolution.sampleCount} cells)</dd></div>
     <div><dt className="text-muted-foreground">Calibration</dt><dd>{layer.calibration.status}</dd></div>
     <div><dt className="text-muted-foreground">Displayed sample</dt><dd>{frame?frame.sampleTimeSeconds.toFixed(4)+" s":p.timeSeconds.toFixed(4)+" s"}</dd></div>
    </dl>
    <p className="mt-2 break-words text-xs text-muted-foreground">{source}</p>
    <p className="mt-1 text-xs">{layer.legend.accessibleDescription}</p>
    {layer.kind==="scalar"&&layer.renderer.kind==="slice"&&(()=>{
     const normalAxis=p.vectorPlane==="xy"?2:p.vectorPlane==="xz"?1:0;
     const maximumSlice=layer.resolution.dimensions[normalAxis]-1;
     const slice=Math.max(0,Math.min(maximumSlice,p.vectorSliceIndex));
     return <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Scalar slice plane
       <select className="mt-1 w-full rounded border border-border bg-bg p-2"
        value={p.vectorPlane} onChange={e=>p.onVectorPlaneChange(e.target.value as FieldVectorPlane)}>
        <option value="xy">XY plane</option><option value="xz">XZ plane</option><option value="yz">YZ plane</option>
       </select>
      </label>
      <label className="text-xs">Slice index · {slice+1}/{maximumSlice+1}
       <input className="mt-2 w-full" type="range" min="0" max={maximumSlice} step="1"
        value={slice} onChange={e=>p.onVectorSliceIndexChange(Number(e.target.value))}/>
      </label>
     </div>;
    })()}
    {layer.kind==="tensor"&&layer.renderer.kind==="slice"&&(()=>{
      const normalAxis=p.vectorPlane==="xy"?2:p.vectorPlane==="xz"?1:0;
      const maximumSlice=layer.resolution.dimensions[normalAxis]-1;
      const slice=Math.max(0,Math.min(maximumSlice,p.vectorSliceIndex));
      const labels=["Txx","Txy","Txz","Tyx","Tyy","Tyz","Tzx","Tzy","Tzz"];
      return <div className="mt-2 grid gap-2 sm:grid-cols-2">
       <label className="text-xs">Tensor plane<select className="mt-1 w-full rounded border border-border bg-bg p-2"
        value={p.vectorPlane} onChange={e=>p.onVectorPlaneChange(e.target.value as FieldVectorPlane)}>
        <option value="xy">XY</option><option value="xz">XZ</option><option value="yz">YZ</option></select></label>
       <label className="text-xs">Tensor component<select className="mt-1 w-full rounded border border-border bg-bg p-2"
        value={p.tensorComponent} onChange={e=>p.onTensorComponentChange(Number(e.target.value))}>
        {labels.map((label,index)=><option key={label} value={index}>{label}</option>)}</select></label>
       <label className="text-xs sm:col-span-2">Slice index · {slice+1}/{maximumSlice+1}
        <input className="mt-1 w-full" type="range" min="0" max={maximumSlice} value={slice} step="1"
         onChange={e=>p.onVectorSliceIndexChange(Number(e.target.value))}/></label>
      </div>;
    })()}
    {layer.kind==="vector"&&(layer.renderer.kind==="glyphs"||layer.renderer.kind==="streamlines")&&(()=>{
     const normalAxis=p.vectorPlane==="xy"?2:p.vectorPlane==="xz"?1:0;
     const maximumSlice=layer.resolution.dimensions[normalAxis]-1;
     const slice=Math.max(0,Math.min(maximumSlice,p.vectorSliceIndex));
     return <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <label className="text-xs">Vector projection plane
       <select className="mt-1 w-full rounded border border-border bg-bg p-2"
        value={p.vectorPlane} onChange={e=>p.onVectorPlaneChange(e.target.value as FieldVectorPlane)}>
        <option value="xy">XY plane</option><option value="xz">XZ plane</option><option value="yz">YZ plane</option>
       </select>
      </label>
      <label className="text-xs">Slice index · {slice+1}/{maximumSlice+1}
       <input className="mt-2 w-full" type="range" min="0" max={maximumSlice} step="1"
        value={slice} onChange={e=>p.onVectorSliceIndexChange(Number(e.target.value))}/>
      </label>
     </div>;
    })()}
    {layer.kind==="vector"&&layer.renderer.kind==="glyphs"&&<p className="mt-1 text-xs text-muted-foreground">The viewport shows the selected 2D projection from recorded vector components. Arrow direction and relative length use the selected slice only; this is not a rendered 3D field volume.</p>}
    <p className="mt-1 text-xs text-muted-foreground">Range: {layer.range.minimumSI.toPrecision(5)}–{layer.range.maximumSI.toPrecision(5)} {layer.units.si}; {layer.range.uncertaintyStatement}</p>
    <p className="mt-1 text-xs text-muted-foreground">World date (UTC): {layer.timeReference.worldDateUTC}; interpolation: {layer.interpolation.method} ({layer.interpolation.validated?"validated":"not validated"})</p>
    <p className="mt-1 text-xs text-muted-foreground">
     Time basis: {layer.timeReference.kind} · display zone: {layer.timeReference.timezoneDisplay}.
     {layer.timeReference.acquiredAtUTC?"Acquired at UTC: "+layer.timeReference.acquiredAtUTC:"Acquisition time: not applicable to this computed run"}.
    </p>
    <p className="mt-1 text-xs text-muted-foreground">
     Valid window: {layer.timeReference.validFromUTC??"not declared"} → {layer.timeReference.validToUTC??"not declared"}.
     {layer.source.kind==="dataset"?"Dataset retrieved at UTC: "+layer.source.retrievedAtUTC+" · evidence: "+layer.source.evidence:"Solver output is not an external observation or forecast."}
    </p>
    {layer.kind==="event"&&<ul className="mt-2 list-disc pl-5 text-xs">{latestEvents.map(e=><li key={e.id}>{e.atSeconds.toFixed(4)} s · {e.label} · {e.severity}</li>)}</ul>}
    {layer.kind==="network"&&<p className="mt-2 text-xs">{layer.network?.nodes.length??0} nodes · {layer.network?.edges.length??0} edges</p>}
    <p className="mt-2 text-xs text-muted-foreground">{layer.validity}</p>
   </>}
  </>}
 </section>;
}
export function WorldLabFieldOverlay(p:{layer:FieldLayer|null;timeSeconds:number;visible:boolean;
 vectorPlane:FieldVectorPlane;vectorSliceIndex:number;tensorComponent:number}){
 const layer=p.layer;
 if(!p.visible||!layer)return null;
 if(!isFieldOverlayRendererImplemented(layer.kind,layer.renderer.kind)){
  return <div className="pointer-events-none absolute right-2 top-2 max-w-[min(78%,340px)] rounded-lg border border-border bg-bg/90 p-2 text-xs shadow"
   role="status" aria-label={layer.legend.accessibleDescription}>
   <p className="font-semibold">{layer.legend.title}</p>
   <p>This field is registered, but the {layer.renderer.kind} renderer is not implemented in this view. No substitute visualization is shown.</p>
  </div>;
 }
 if(layer.kind==="event"){
  const events=layer.events.filter(e=>e.atSeconds<=p.timeSeconds);
  return <div className="pointer-events-none absolute right-2 top-2 max-w-[min(75%,360px)] rounded-lg border border-border bg-bg/90 p-2 text-xs shadow"
    role="img" aria-label={layer.legend.accessibleDescription+"; "+events.length+" recorded events reached"}>
   <p className="font-semibold">{layer.legend.title} · {events.length} events</p>
   {events.slice(-3).map(e=><p key={e.id}>{e.atSeconds.toFixed(3)} s · {e.label}</p>)}
  </div>;
 }
 if(layer.kind==="network"){
  return <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-border bg-bg/90 p-2 text-xs shadow"
   role="img" aria-label={layer.legend.accessibleDescription}>
   <p className="font-semibold">{layer.legend.title}</p>
   <p>{layer.network?.nodes.length??0} nodes · {layer.network?.edges.length??0} links</p>
  </div>;
 }
 if(layer.kind==="tensor"&&layer.renderer.kind==="slice"){
  const frame=fieldTensorSliceAtTime(layer,p.timeSeconds,p.vectorPlane,p.vectorSliceIndex);
  const component=Math.max(0,Math.min(8,p.tensorComponent)),limit=Math.max(Math.abs(layer.range.minimumSI),Math.abs(layer.range.maximumSI),1e-12);
  const labels=["Txx","Txy","Txz","Tyx","Tyy","Tyz","Tzx","Tzy","Tzz"],cellWidth=256/frame.dimensionU,cellHeight=116/frame.dimensionV;
  return <div className="pointer-events-none absolute right-2 top-2 w-[min(92%,340px)] rounded-lg border border-border bg-bg/90 p-2 shadow"
   role="img" aria-label={layer.legend.accessibleDescription+"; "+labels[component]+" tensor component; "+frame.plane.toUpperCase()+" slice "+(frame.sliceIndex+1)+"; recorded sample "+frame.sampleTimeSeconds.toFixed(4)+" seconds"}>
   <p className="text-xs font-semibold">{layer.legend.title} · {labels[component]} · {frame.sampleTimeSeconds.toFixed(3)} s</p>
   <svg viewBox="0 0 300 160" width="100%" height="132" role="presentation">
    <path d="M22 12 V140 H286" fill="none" stroke="currentColor" opacity=".28"/>
    {frame.cells.map((cell,index)=>{const value=cell.components[component];
     return <rect key={index} x={22+cell.uIndex*cellWidth} y={140-(cell.vIndex+1)*cellHeight}
      width={cellWidth} height={cellHeight} fill={value===null?"#555":colorFor(value,-limit,limit,"blue-orange")}
      stroke="currentColor" strokeOpacity=".16" strokeWidth=".5">
      <title>{value===null?"No data":labels[component]+" = "+value.toPrecision(5)+" "+layer.units.display}</title>
     </rect>;})}
   </svg>
   <div className="flex justify-between text-[10px]"><span>{(-limit).toPrecision(3)} {layer.units.display}</span><span>{limit.toPrecision(3)} {layer.units.display}</span></div>
   <p className="text-[10px] text-muted-foreground">{frame.plane.toUpperCase()} slice {frame.sliceIndex+1} · signed component on a zero-centred diverging scale · {frame.cells.filter(c=>c.components[component]!==null).length} valid cells</p>
  </div>;
 }
 if(layer.kind==="scalar"&&layer.renderer.kind==="slice"){
  const frame=fieldScalarSliceAtTime(layer,p.timeSeconds,p.vectorPlane,p.vectorSliceIndex);
  const min=layer.range.minimumSI,max=layer.range.maximumSI;
  const cellWidth=256/frame.dimensionU,cellHeight=116/frame.dimensionV;
  return <div className="pointer-events-none absolute right-2 top-2 w-[min(92%,340px)] rounded-lg border border-border bg-bg/90 p-2 shadow"
   role="img" aria-label={layer.legend.accessibleDescription+"; "+frame.plane.toUpperCase()+" scalar slice "+(frame.sliceIndex+1)+"; recorded sample "+frame.sampleTimeSeconds.toFixed(4)+" seconds"}>
   <p className="text-xs font-semibold">{layer.legend.title} · {frame.sampleTimeSeconds.toFixed(3)} s</p>
   <svg viewBox="0 0 300 160" width="100%" height="132" role="presentation">
    <path d="M22 12 V140 H286" fill="none" stroke="currentColor" opacity=".28"/>
    {frame.cells.map((cell,index)=>{
     const x=22+cell.uIndex*cellWidth;
     const y=140-(cell.vIndex+1)*cellHeight;
     return <rect key={index} x={x} y={y} width={cellWidth} height={cellHeight}
      fill={cell.value===null?"#555":colorFor(cell.value,min,max,layer.legend.palette)}
      stroke="currentColor" strokeOpacity=".16" strokeWidth=".5">
      <title>{cell.value===null?"No data":cell.value.toPrecision(5)+" "+layer.units.display}</title>
     </rect>;
    })}
   </svg>
   <div className="flex justify-between text-[10px]"><span>{min.toPrecision(3)} {layer.units.display}</span><span>{max.toPrecision(3)} {layer.units.display}</span></div>
   <p className="text-[10px] text-muted-foreground">{frame.plane.toUpperCase()} · slice {frame.sliceIndex+1} · {frame.cells.filter(cell=>cell.value!==null).length} valid cells · no-data shown separately</p>
  </div>;
 }
 if(layer.kind==="vector"&&layer.renderer.kind==="streamlines"){
  if(layer.interpolation.method!=="linear"||!layer.interpolation.validated){
   return <div className="pointer-events-none absolute right-2 top-2 max-w-[min(78%,340px)] rounded-lg border border-border bg-bg/90 p-2 text-xs shadow" role="status">
    <p className="font-semibold">{layer.legend.title}</p>
    <p>Streamlines are unavailable until this vector field has validated linear spatial interpolation. No substitute rendering is shown.</p>
   </div>;
  }
  const frame=fieldVectorStreamlinesAtTime(layer,p.timeSeconds,p.vectorPlane,p.vectorSliceIndex);
  return <div className="pointer-events-none absolute right-2 top-2 w-[min(92%,340px)] rounded-lg border border-border bg-bg/90 p-2 shadow"
   role="img" aria-label={layer.legend.accessibleDescription+"; "+frame.paths.length+" computed streamlines on "+frame.plane.toUpperCase()+" slice "+(frame.sliceIndex+1)+"; recorded sample "+frame.sampleTimeSeconds.toFixed(4)+" seconds"}>
   <p className="text-xs font-semibold">{layer.legend.title} · {frame.sampleTimeSeconds.toFixed(3)} s</p>
   <svg viewBox="0 0 300 160" width="100%" height="132" role="presentation">
    <defs><marker id="worldlab-streamline-arrowhead" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5 Z" fill="currentColor"/></marker></defs>
    <path d="M22 12 V140 H286" fill="none" stroke="currentColor" opacity=".28"/>
    {frame.paths.map((path,index)=>{
     const points=path.map(([u,v])=>{
      const x=22+(u/Math.max(1,frame.dimensionU-1))*256;
      const y=140-(v/Math.max(1,frame.dimensionV-1))*116;
      return x.toFixed(1)+","+y.toFixed(1);
     }).join(" ");
     return <polyline key={index} points={points} fill="none" stroke="currentColor" strokeWidth="1.6"
      markerEnd="url(#worldlab-streamline-arrowhead)"/>;
    })}
   </svg>
   <p className="text-[10px]">{frame.plane.toUpperCase()} projection · slice {frame.sliceIndex+1}/{frame.plane==="xy"?layer.resolution.dimensions[2]:frame.plane==="xz"?layer.resolution.dimensions[1]:layer.resolution.dimensions[0]}</p>
   <p className="text-[10px] text-muted-foreground">{frame.paths.length} recorded-field paths · arrowheads show vector direction, not magnitude · {layer.units.display}</p>
  </div>;
 }
 if(layer.kind==="vector"&&layer.renderer.kind==="glyphs"){
  const frame=fieldVectorGlyphsAtTime(layer,p.timeSeconds,p.vectorPlane,p.vectorSliceIndex);
  const max=frame.maximumProjectedMagnitude;
  return <div className="pointer-events-none absolute right-2 top-2 w-[min(92%,340px)] rounded-lg border border-border bg-bg/90 p-2 shadow"
   role="img" aria-label={layer.legend.accessibleDescription+"; projected "+frame.plane.toUpperCase()+" vector glyphs at "+frame.sampleTimeSeconds.toFixed(4)+" seconds; slice "+frame.sliceIndex}>
   <p className="text-xs font-semibold">{layer.legend.title} · {frame.sampleTimeSeconds.toFixed(3)} s</p>
   <svg viewBox="0 0 300 160" width="100%" height="132" role="presentation">
    <defs><marker id="worldlab-vector-arrowhead" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5 Z" fill="currentColor"/></marker></defs>
    <path d="M22 12 V140 H286" fill="none" stroke="currentColor" opacity=".28"/>
    {frame.glyphs.map((glyph,index)=>{
     const cx=22+(glyph.uIndex/Math.max(1,frame.dimensionU-1))*256;
     const cy=140-(glyph.vIndex/Math.max(1,frame.dimensionV-1))*116;
     const spacing=Math.min(256/Math.max(1,frame.dimensionU-1),116/Math.max(1,frame.dimensionV-1));
     const length=max>0?Math.max(2,Math.min(18,spacing*0.42))*glyph.projectedMagnitude/max:0;
     const ux=glyph.projectedMagnitude>0?glyph.uComponent/glyph.projectedMagnitude:0;
     const uy=glyph.projectedMagnitude>0?glyph.vComponent/glyph.projectedMagnitude:0;
     return <g key={index}>
      {length>0?<line x1={cx} y1={cy} x2={cx+ux*length} y2={cy-uy*length}
       stroke="currentColor" strokeWidth="1.8" markerEnd="url(#worldlab-vector-arrowhead)">
       <title>{"Vector magnitude "+glyph.magnitude.toPrecision(4)+" "+layer.units.display}</title>
      </line>:<circle cx={cx} cy={cy} r="2.2" fill="currentColor"><title>Zero projected vector; full magnitude {glyph.magnitude.toPrecision(4)} {layer.units.display}</title></circle>}
     </g>;
    })}
   </svg>
   <p className="text-[10px]">{frame.plane.toUpperCase()} projection · slice {frame.sliceIndex+1}/{frame.plane==="xy"?layer.resolution.dimensions[2]:frame.plane==="xz"?layer.resolution.dimensions[1]:layer.resolution.dimensions[0]} · arrow length is relative to the largest projected vector in this slice</p>
   <p className="text-[10px] text-muted-foreground">{frame.glyphs.length} valid glyphs · no-data cells omitted · units {layer.units.display}</p>
  </div>;
 }
 const frame=fieldFrameAtTime(layer,p.timeSeconds);
 const values=frame.values;
 const valid=values.filter((v):v is number=>typeof v==="number");
 const min=layer.range.minimumSI,max=layer.range.maximumSI;
 if(layer.renderer.kind==="heatmap"){
  return <div className="pointer-events-none absolute right-2 top-2 max-w-[min(78%,340px)] rounded-lg border border-border bg-bg/90 p-2 shadow"
   role="img" aria-label={layer.legend.accessibleDescription+"; displayed sample "+frame.sampleTimeSeconds.toFixed(4)+" seconds"}>
   <p className="mb-1 text-xs font-semibold">{layer.legend.title} · {frame.sampleTimeSeconds.toFixed(3)} s</p>
   <div className="grid grid-cols-7 gap-0.5">
    {values.map((v,i)=><div key={i} className="h-3 min-w-2 rounded-[2px]"
      style={{backgroundColor:typeof v==="number"?colorFor(v,min,max,layer.legend.palette):"#555"}}
      title={typeof v==="number"?v.toPrecision(4)+" "+layer.units.display:"No data"}/>)}
   </div>
   <div className="mt-1 flex justify-between text-[10px]"><span>{min.toPrecision(3)} {layer.units.display}</span><span>{max.toPrecision(3)} {layer.units.display}</span></div>
  </div>;
 }
 const all=layer.values.filter((v):v is number=>typeof v==="number");
 const points=all.map((value,index)=>{
  const x=8+(index/Math.max(1,all.length-1))*284;
  const y=72-((value-min)/Math.max(1e-12,max-min))*62;
  return x.toFixed(1)+","+y.toFixed(1);
 }).join(" ");
 const displayed=valid[0];
 return <div className="pointer-events-none absolute right-2 top-2 w-64 rounded-lg border border-border bg-bg/90 p-2 shadow"
  role="img" aria-label={layer.legend.accessibleDescription+"; "+(displayed===undefined?"no data":displayed.toPrecision(4)+" "+layer.units.display)}>
  <p className="text-xs font-semibold">{layer.legend.title} · {frame.sampleTimeSeconds.toFixed(3)} s</p>
  <svg viewBox="0 0 300 80" width="100%" height="64" role="presentation">
   <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2"/>
  </svg>
  <p className="text-right text-[10px]">{displayed===undefined?"No data":displayed.toPrecision(4)+" "+layer.units.display}</p>
 </div>;
}
