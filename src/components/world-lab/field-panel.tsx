import type {FieldLayer,FieldPalette} from "@/lib/world-lab/field-layer";
import {fieldFrameAtTime} from "@/lib/world-lab/field-layer";

type Props={layers:readonly FieldLayer[];selectedId:string;onSelect:(id:string)=>void;
 timeSeconds:number;overlayEnabled:boolean;onOverlayChange:(v:boolean)=>void};
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
    <p className="mt-1 text-xs text-muted-foreground">Range: {layer.range.minimumSI.toPrecision(5)}–{layer.range.maximumSI.toPrecision(5)} {layer.units.si}; {layer.range.uncertaintyStatement}</p>
    <p className="mt-1 text-xs text-muted-foreground">World date (UTC): {layer.timeReference.worldDateUTC}; interpolation: {layer.interpolation.method} ({layer.interpolation.validated?"validated":"not validated"})</p>
    {layer.kind==="event"&&<ul className="mt-2 list-disc pl-5 text-xs">{latestEvents.map(e=><li key={e.id}>{e.atSeconds.toFixed(4)} s · {e.label} · {e.severity}</li>)}</ul>}
    {layer.kind==="network"&&<p className="mt-2 text-xs">{layer.network?.nodes.length??0} nodes · {layer.network?.edges.length??0} edges</p>}
    <p className="mt-2 text-xs text-muted-foreground">{layer.validity}</p>
   </>}
  </>}
 </section>;
}
export function WorldLabFieldOverlay(p:{layer:FieldLayer|null;timeSeconds:number;visible:boolean}){
 const layer=p.layer;
 if(!p.visible||!layer)return null;
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
