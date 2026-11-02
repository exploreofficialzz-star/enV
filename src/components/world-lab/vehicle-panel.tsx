import {useEffect,useMemo,useState} from "react";
import type {WorldLabProject} from "@/lib/world-lab/project";
import {inspectVehiclePreflight,runWorldLabVehicle,sampleWorldLabVehicle,type VehicleInput,type VehicleRun} from "@/lib/world-lab/vehicle";

const field="w-full rounded border border-border bg-bg px-2 py-2 text-sm";
const action="rounded border border-border px-3 py-2 text-sm";
const defaults:VehicleInput={
  mode:"road-only",massKg:1200,frontalAreaM2:2.2,dragCoefficient:0.32,airDensityKgM3:1.225,rollingResistanceCoefficient:0.012,tireFrictionCoefficient:0.9,
  maximumWheelDriveForceN:6500,motorMaximumPowerW:180000,motorEfficiency:0.9,motorForceConstantNPerA:40,motorWindingResistanceOhm:0.08,motorMaximumCurrentA:220,
  batteryVoltageV:400,batteryInternalResistanceOhm:0.04,batteryMaximumCurrentA:500,batteryCapacityWh:60000,initialStateOfCharge:1,batteryHeatCapacityJPerK:180000,batteryCoolingWPerK:35,maximumBatteryTemperatureK:370,
  motorHeatCapacityJPerK:45000,motorCoolingWPerK:80,maximumMotorTemperatureK:420,ambientTemperatureK:293.15,initialMotorTemperatureK:293.15,initialBatteryTemperatureK:293.15,
  rotorDiskAreaM2:null,rotorMaximumThrustN:null,rotorThrottle:0.85,rotorEfficiency:0.8,wingAreaM2:null,wingLiftCoefficient:null,takeoffSpeedMps:null,maximumCruiseThrustN:1800,cruisePropulsiveEfficiency:0.78,
  driveThrottle:0.8,maximumSpeedMps:80,maximumStructuralLoadFactor:3,durationSeconds:20,solverStepSeconds:0.02,motorFailureAtSeconds:null,
};
function number(value:number,unit:string="",digits=4){return value.toLocaleString(undefined,{maximumFractionDigits:digits})+(unit?" "+unit:"");}
function download(run:VehicleRun){
  const blob=new Blob([JSON.stringify(run,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);
  try{const a=document.createElement("a");a.href=url;a.download="world-lab-vehicle-run-"+run.runId+".json";document.body.appendChild(a);a.click();a.remove();}
  finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export function WorldLabVehiclePanel({project}:{project:WorldLabProject|null}){
  const [input,setInput]=useState<VehicleInput>(defaults);
  const [run,setRun]=useState<VehicleRun|null>(null);
  const [time,setTime]=useState(0);const [playing,setPlaying]=useState(false);const [rate,setRate]=useState(1);const [error,setError]=useState("");
  const active=run&&project&&run.projectId===project.id&&run.projectRevision===project.revision?run:null;
  const preflight=useMemo(()=>{try{return {value:inspectVehiclePreflight(input),error:""};}catch(e){return {value:null,error:e instanceof Error?e.message:"Vehicle assumptions are invalid."};}},[input]);
  const sample=active?sampleWorldLabVehicle(active,Math.min(time,active.samples.at(-1)?.timeSeconds??0)):null;
  useEffect(()=>{if(!playing||!active)return;let frame=0,previous=0;const tick=(now:number)=>{if(previous)setTime(t=>{const end=active.samples.at(-1)?.timeSeconds??active.input.durationSeconds;const next=Math.min(end,t+Math.min(0.05,(now-previous)/1000)*rate);if(next>=end)setPlaying(false);return next;});previous=now;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing,active,rate]);
  function patch<K extends keyof VehicleInput>(key:K,value:VehicleInput[K]){setInput(old=>({...old,[key]:value}));setRun(null);setTime(0);setPlaying(false);setError("");}
  function calculate(){if(!project){setError("Create or open an invention before running a vehicle experiment.");return;}try{const value=runWorldLabVehicle(project,crypto.randomUUID(),input);setRun(value);setTime(0);setPlaying(false);setError("");}catch(e){setRun(null);setError(e instanceof Error?e.message:"Vehicle experiment could not run.");}}
  const preflightItems=preflight.value?.diagnostics??[];
  return <section className="mb-3 rounded-xl border border-border p-3" aria-label="Flying vehicle build run and diagnose experiment">
    <h3 className="text-sm font-semibold">Build, run and diagnose a vehicle</h3>
    <p className="text-xs text-muted-foreground">Start with a road vehicle, then test a hypothetical rotorcraft or fixed-wing configuration. Change mass, traction, drag, power, battery and lift assumptions and inspect the computed forces, current, energy and thermal response.</p>
    {!project&&<p className="mt-2 text-xs">Open an invention to attach this experiment to its project ID and revision.</p>}
    <div className="mt-2 grid grid-cols-2 gap-2">
      <label className="text-xs">Vehicle experiment
        <select className={field} value={input.mode} onChange={e=>{const mode=e.target.value as VehicleInput["mode"];setInput(old=>({...old,mode,rotorDiskAreaM2:mode==="rotorcraft"?(old.rotorDiskAreaM2??15):null,rotorMaximumThrustN:mode==="rotorcraft"?(old.rotorMaximumThrustN??10000):null,wingAreaM2:mode==="fixed-wing"?(old.wingAreaM2??18):null,wingLiftCoefficient:mode==="fixed-wing"?(old.wingLiftCoefficient??1.4):null,takeoffSpeedMps:mode==="fixed-wing"?(old.takeoffSpeedMps??28):null,maximumCruiseThrustN:mode==="road-only"?0:(old.maximumCruiseThrustN||1800)}));setRun(null);setTime(0);setPlaying(false);setError("");}}>
          <option value="road-only">Road vehicle</option><option value="rotorcraft">Rotorcraft / VTOL</option><option value="fixed-wing">Fixed-wing vehicle</option>
        </select>
      </label>
      <label className="text-xs">Vehicle mass (kg)
        <input className={field} type="number" min={100} max={30000} value={input.massKg} onChange={e=>patch("massKg",Number(e.target.value))}/>
      </label>
      <label className="text-xs">Frontal area (m²)
        <input className={field} type="number" min={0.2} max={50} step="any" value={input.frontalAreaM2} onChange={e=>patch("frontalAreaM2",Number(e.target.value))}/>
      </label>
      <label className="text-xs">Drag coefficient
        <input className={field} type="number" min={0.05} max={2.5} step="any" value={input.dragCoefficient} onChange={e=>patch("dragCoefficient",Number(e.target.value))}/>
      </label>
      <label className="text-xs">Tire friction coefficient
        <input className={field} type="number" min={0.05} max={2.5} step="any" value={input.tireFrictionCoefficient} onChange={e=>patch("tireFrictionCoefficient",Number(e.target.value))}/>
      </label>
      <label className="text-xs">Drive throttle ({Math.round(input.driveThrottle*100)}%)
        <input className={field} type="range" min={0} max={1} step={0.01} value={input.driveThrottle} onChange={e=>patch("driveThrottle",Number(e.target.value))}/>
      </label>
      <label className="text-xs">Test duration (s)
        <input className={field} type="number" min={0.1} max={120} step="0.1" value={input.durationSeconds} onChange={e=>patch("durationSeconds",Number(e.target.value))}/>
      </label>
      <label className="text-xs">Maximum speed (m/s)
        <input className={field} type="number" min={1} max={300} step="any" value={input.maximumSpeedMps} onChange={e=>patch("maximumSpeedMps",Number(e.target.value))}/>
      </label>
    </div>
    {input.mode==="rotorcraft"&&<div className="mt-2 rounded border border-border p-2">
      <h4 className="text-xs font-semibold">Rotor lift assumptions</h4>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs">Total rotor disk area (m²)<input className={field} type="number" min={0.05} max={500} step="any" value={input.rotorDiskAreaM2??15} onChange={e=>patch("rotorDiskAreaM2",Number(e.target.value))}/></label>
        <label className="text-xs">Maximum rotor thrust (N)<input className={field} type="number" min={10} max={1000000} step="any" value={input.rotorMaximumThrustN??10000} onChange={e=>patch("rotorMaximumThrustN",Number(e.target.value))}/></label>
        <label className="text-xs">Rotor throttle ({Math.round(input.rotorThrottle*100)}%)<input className={field} type="range" min={0} max={1} step={0.01} value={input.rotorThrottle} onChange={e=>patch("rotorThrottle",Number(e.target.value))}/></label>
        <label className="text-xs">Assumed rotor efficiency<input className={field} type="number" min={0.2} max={0.95} step="any" value={input.rotorEfficiency} onChange={e=>patch("rotorEfficiency",Number(e.target.value))}/></label>
      </div>
    </div>}
    {input.mode==="fixed-wing"&&<div className="mt-2 rounded border border-border p-2">
      <h4 className="text-xs font-semibold">Wing and takeoff assumptions</h4>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs">Wing area (m²)<input className={field} type="number" min={0.5} max={500} step="any" value={input.wingAreaM2??18} onChange={e=>patch("wingAreaM2",Number(e.target.value))}/></label>
        <label className="text-xs">Lift coefficient<input className={field} type="number" min={0.05} max={3} step="any" value={input.wingLiftCoefficient??1.4} onChange={e=>patch("wingLiftCoefficient",Number(e.target.value))}/></label>
        <label className="text-xs">Takeoff speed (m/s)<input className={field} type="number" min={5} max={150} step="any" value={input.takeoffSpeedMps??28} onChange={e=>patch("takeoffSpeedMps",Number(e.target.value))}/></label>
      </div>
    </div>}
    {input.mode!=="road-only"&&<label className="mt-2 block text-xs">Maximum horizontal cruise thrust (N)
      <input className={field} type="number" min={0} max={500000} step="any" value={input.maximumCruiseThrustN} onChange={e=>patch("maximumCruiseThrustN",Number(e.target.value))}/>
    </label>}
    <details className="mt-2 rounded border border-border p-2"><summary className="cursor-pointer text-xs font-semibold">Battery, motor and failure assumptions</summary>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs">Battery voltage (V)<input className={field} type="number" min={12} max={2000} value={input.batteryVoltageV} onChange={e=>patch("batteryVoltageV",Number(e.target.value))}/></label>
        <label className="text-xs">Battery limit (A)<input className={field} type="number" min={0.1} max={20000} value={input.batteryMaximumCurrentA} onChange={e=>patch("batteryMaximumCurrentA",Number(e.target.value))}/></label>
        <label className="text-xs">Battery capacity (Wh)<input className={field} type="number" min={10} max={100000000} value={input.batteryCapacityWh} onChange={e=>patch("batteryCapacityWh",Number(e.target.value))}/></label>
        <label className="text-xs">Initial charge ({Math.round(input.initialStateOfCharge*100)}%)<input className={field} type="range" min={0.01} max={1} step={0.01} value={input.initialStateOfCharge} onChange={e=>patch("initialStateOfCharge",Number(e.target.value))}/></label>
        <label className="text-xs">Motor maximum power (W)<input className={field} type="number" min={100} max={50000000} value={input.motorMaximumPowerW} onChange={e=>patch("motorMaximumPowerW",Number(e.target.value))}/></label>
        <label className="text-xs">Motor maximum current (A)<input className={field} type="number" min={0.1} max={10000} value={input.motorMaximumCurrentA} onChange={e=>patch("motorMaximumCurrentA",Number(e.target.value))}/></label>
        <label className="text-xs">Motor force constant (N/A)<input className={field} type="number" min={0.01} max={10000} step="any" value={input.motorForceConstantNPerA} onChange={e=>patch("motorForceConstantNPerA",Number(e.target.value))}/></label>
        <label className="text-xs">Motor efficiency<input className={field} type="number" min={0.2} max={0.99} step="any" value={input.motorEfficiency} onChange={e=>patch("motorEfficiency",Number(e.target.value))}/></label>
        <label className="text-xs">Motor failure injection time (s; blank disables)<input className={field} type="number" min={0} max={input.durationSeconds} step="any" value={input.motorFailureAtSeconds??""} onChange={e=>patch("motorFailureAtSeconds",e.target.value===""?null:Number(e.target.value))}/></label>
        <label className="text-xs">Maximum structural load (g)<input className={field} type="number" min={1} max={20} step="any" value={input.maximumStructuralLoadFactor} onChange={e=>patch("maximumStructuralLoadFactor",Number(e.target.value))}/></label>
      </div>
    </details>
    {preflight.error&&<p role="alert" className="mt-2 text-xs text-red-600">{preflight.error}</p>}
    {preflight.value&&<div className="mt-2 rounded border border-border p-2">
      <p className="text-xs font-semibold">Preflight diagnostics</p>
      <p className="mt-1 text-xs">Weight: {number(preflight.value.weightN,"N")} · Available battery power: {number(preflight.value.maximumBatteryPowerW,"W")}</p>
      {preflight.value.requiredHoverPowerW!==null&&<p className="text-xs">Ideal induced hover power: {number(preflight.value.requiredHoverPowerW,"W")}</p>}
      {preflight.value.wingLiftAtTakeoffN!==null&&<p className="text-xs">Wing lift at takeoff speed: {number(preflight.value.wingLiftAtTakeoffN,"N")}</p>}
      {preflightItems.map((item,index)=><p key={item.code+index} className={"mt-1 text-xs "+(item.severity==="blocker"?"text-red-600":item.severity==="warning"?"text-amber-600":"text-muted-foreground")}>{item.severity.toUpperCase()} · {item.message}</p>)}
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" className={action} disabled={!project||!!preflight.error} onClick={calculate}>Run {input.mode==="road-only"?"road test":"takeoff / flight test"}</button>
      {active&&<button type="button" className={action} onClick={()=>download(active)}>Export run evidence</button>}
    </div>
    {active&&sample&&<div className="mt-3 rounded border border-border p-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-semibold">Computed vehicle state</h4><span className="text-xs">{active.outcome.replaceAll("-"," ")}</span></div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <p>Speed: <strong>{number(sample.horizontalSpeedMps,"m/s")}</strong></p><p>Altitude: <strong>{number(sample.altitudeMeters,"m")}</strong></p>
        <p>Wheel drive: <strong>{number(sample.wheelDriveForceN,"N")}</strong></p><p>Rotor thrust: <strong>{number(sample.rotorThrustN,"N")}</strong></p>
        <p>Wing lift: <strong>{number(sample.wingLiftN,"N")}</strong></p><p>Aerodynamic drag: <strong>{number(sample.aerodynamicDragN,"N")}</strong></p>
        <p>Battery current: <strong>{number(sample.batteryCurrentA,"A")}</strong></p><p>Terminal voltage: <strong>{number(sample.batteryTerminalVoltageV,"V")}</strong></p>
        <p>Battery charge: <strong>{number(sample.batteryStateOfCharge*100,"%")}</strong></p><p>Motor temperature: <strong>{number(sample.motorTemperatureK,"K")}</strong></p>
        <p>Battery temperature: <strong>{number(sample.batteryTemperatureK,"K")}</strong></p><p>Electrical energy used: <strong>{number(sample.electricalEnergyUsedWh,"Wh")}</strong></p>
      </div>
      <label className="mt-3 block text-xs">Recorded simulation time: {number(time,"s",3)} / {number(active.samples.at(-1)?.timeSeconds??0,"s",3)}
        <input type="range" className="w-full" min={0} max={active.samples.at(-1)?.timeSeconds??active.input.durationSeconds} step={active.input.solverStepSeconds} value={Math.min(time,active.samples.at(-1)?.timeSeconds??active.input.durationSeconds)} onChange={e=>{setPlaying(false);setTime(Number(e.target.value));}}/>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={action} onClick={()=>setPlaying(p=>!p)}>{playing?"Pause playback":"Play recorded run"}</button>
        <button type="button" className={action} onClick={()=>{setPlaying(false);setTime(0);}}>Reset</button>
        <button type="button" className={action} onClick={()=>{setPlaying(false);setTime(Math.min(active.samples.at(-1)?.timeSeconds??0,time+active.input.solverStepSeconds));}}>Single step</button>
        <select className={field+" w-auto"} value={rate} aria-label="Vehicle playback speed" onChange={e=>setRate(Number(e.target.value))}>{[0.1,1,2,10].map(v=><option key={v} value={v}>{v}×</option>)}</select>
      </div>
      {active.events.map((event,index)=><p key={event.kind+index} className="mt-1 text-xs">{number(event.timeSeconds,"s",2)} · {event.kind.replaceAll("-"," ")} · {event.message}</p>)}
      {active.failureReasons.map((reason,index)=><p key={index} role="alert" className="mt-1 text-xs text-red-600">{reason}</p>)}
      <p className="mt-2 text-xs text-muted-foreground">{active.validity}</p>
    </div>}
  </section>;
}