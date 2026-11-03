import {useMemo,useRef,useState} from "react";
import {parseWorldObservation,classifyObservationFreshness,type WorldObservation} from "@/lib/world-lab/observation-contract";
import {earthReferenceLayerAtDepth,atmosphereReferenceLayerAtAltitude,assessLayerEvidence} from "@/lib/world-lab/world-layers";

const field="w-full rounded border border-border bg-bg px-2 py-2 text-sm";
const button="rounded border border-border px-3 py-2 text-sm";
function parseNumber(value:string,fallback:number):number {
  const n=Number(value);
  return value.trim()!==""&&Number.isFinite(n)?n:fallback;
}

export function WorldLabReferenceLayersPanel() {
  const [depthText,setDepthText]=useState("0");
  const [altitudeText,setAltitudeText]=useState("0");
  const [observation,setObservation]=useState<WorldObservation|null>(null);
  const [problem,setProblem]=useState("");
  const picker=useRef<HTMLInputElement>(null);
  const depth=parseNumber(depthText,0);
  const altitude=parseNumber(altitudeText,0);
  const earth=useMemo(()=>{try{return {value:earthReferenceLayerAtDepth(depth),error:""};}catch(e){return {value:null,error:e instanceof Error?e.message:"Invalid depth."};}},[depth]);
  const sky=useMemo(()=>{try{return {value:atmosphereReferenceLayerAtAltitude(altitude),error:""};}catch(e){return {value:null,error:e instanceof Error?e.message:"Invalid altitude."};}},[altitude]);
  const now=new Date().toISOString();
  const evidence=useMemo(()=>{try{return assessLayerEvidence(observation,now);}catch(e){return {status:"not-attached",freshness:null,label:"Invalid observation timestamp",limitations:e instanceof Error?e.message:"Observation metadata could not be assessed."} as const;}},[observation,now]);
  async function attach(file:File|undefined) {
    if(!file)return;
    try {
      if(file.size<=0||file.size>128*1024)throw new Error("Choose a non-empty observation manifest smaller than 128 KB.");
      const parsed=parseWorldObservation(JSON.parse(await file.text()));
      setObservation(parsed);setProblem("");
    }catch(e){setObservation(null);setProblem(e instanceof Error?e.message:"The observation manifest is invalid.");}
    if(picker.current)picker.current.value="";
  }
  return <section className="mt-3 rounded-xl border border-border p-3" aria-label="World observation and reference layers">
    <h3 className="text-sm font-semibold">Surface, subsurface and atmosphere layers</h3>
    <p className="text-xs text-muted-foreground">Navigate continuous reference depth and altitude bands. These bands are approximate teaching references. Real terrain, aquifers, geology, weather and satellite observations appear only when a licensed dataset manifest and its payload are attached.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 rounded-lg border border-border p-3">
        <label className="block text-xs">Depth below project surface (m)
          <input className={field} type="number" min="0" max="6371000" step="any" value={depthText} onChange={e=>setDepthText(e.target.value)}/>
        </label>
        {earth.value&&<>
          <p className="text-sm font-medium">{earth.value.label}</p>
          <p className="text-xs text-muted-foreground">{earth.value.description}</p>
          <p className="text-xs text-muted-foreground">{earth.value.limitations}</p>
        </>}
        {earth.error&&<p role="alert" className="text-xs text-red-600">{earth.error}</p>}
        <p className="text-[11px] text-muted-foreground">Reference boundary · not a local geological survey</p>
      </div>
      <div className="space-y-2 rounded-lg border border-border p-3">
        <label className="block text-xs">Altitude above reference surface (m)
          <input className={field} type="number" min="-12000" max="10000000" step="any" value={altitudeText} onChange={e=>setAltitudeText(e.target.value)}/>
        </label>
        {sky.value&&<>
          <p className="text-sm font-medium">{sky.value.label}</p>
          <p className="text-xs text-muted-foreground">{sky.value.description}</p>
          <p className="text-xs text-muted-foreground">{sky.value.limitations}</p>
        </>}
        {sky.error&&<p role="alert" className="text-xs text-red-600">{sky.error}</p>}
        <p className="text-[11px] text-muted-foreground">Atmosphere boundary · not a weather forecast</p>
      </div>
    </div>
    <div className="mt-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs font-semibold">Observation evidence</p><p className="text-xs text-muted-foreground">{evidence.label}</p></div>
        <span className="rounded border border-border px-2 py-1 text-[11px]">{evidence.status.replaceAll("-"," ")}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{evidence.limitations}</p>
      {observation&&<div className="mt-2 text-xs">
        <p>Layer: {observation.layer} · evidence: {observation.kind}</p>
        <p>Dataset: {observation.source?.datasetId??observation.modelId??"representative layer"} · version: {observation.source?.datasetVersion??observation.modelVersion??"—"}</p>
        <p>Freshness at current time: {classifyObservationFreshness(observation,now)}</p>
      </div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={button} type="button" onClick={()=>picker.current?.click()}>Attach observation manifest</button>
        <button className={button} type="button" disabled={!observation} onClick={()=>{setObservation(null);setProblem("");}}>Clear manifest</button>
        <input ref={picker} className="hidden" type="file" accept=".json,application/json" onChange={e=>void attach(e.target.files?.[0])}/>
      </div>
      {problem&&<p role="alert" className="mt-2 text-xs text-red-600">{problem}</p>}
    </div>
  </section>;
}
