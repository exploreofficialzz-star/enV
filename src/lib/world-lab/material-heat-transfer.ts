import {parseWorldLabProject,solidQuantities,type WorldLabProject} from "./project.ts";

/** Energy-conserving, two-node lumped heat exchange between face-contacting,
 * axis-aligned rectangular solids of invented homogeneous materials.
 * No fluid, convection, radiation, phase-change or validated material identity.
 */
export type MaterialHeatInput=Readonly<{
  firstEntityId:string;secondEntityId:string;
  firstTemperatureK:number;secondTemperatureK:number;
  durationSeconds:number;
}>;
export type MaterialHeatSample=Readonly<{
  timeSeconds:number;firstTemperatureK:number;secondTemperatureK:number;
  interfaceHeatFlowW:number;energyResidualJ:number;
}>;
export type MaterialHeatRun=Readonly<{
  format:"env-world-lab-material-heat-transfer";
  modelVersion:"1.0.0";evidence:"physics-model-computed";
  materialEvidence:"hypothetical-user-assumed";
  projectId:string;projectRevision:number;
  firstEntityId:string;secondEntityId:string;
  firstMaterialId:string;secondMaterialId:string;
  firstThermalCapacityJPerK:number;secondThermalCapacityJPerK:number;
  conductanceWPerK:number;equilibriumTemperatureK:number;
  input:MaterialHeatInput;samples:readonly MaterialHeatSample[];
  validity:string;
}>;
function bounded(value:number,low:number,high:number,label:string){
  if(!Number.isFinite(value)||value<low||value>high)
    throw new Error(label+" is outside its finite assumed domain.");
  return value;
}
export function calculateMaterialHeatTransfer(raw:WorldLabProject,
  input:MaterialHeatInput):MaterialHeatRun{
  const p=parseWorldLabProject(raw);
  if(input.firstEntityId===input.secondEntityId)
    throw new Error("Choose two separate materials in contacting solids.");
  const first=p.entities.find(e=>e.id===input.firstEntityId);
  const second=p.entities.find(e=>e.id===input.secondEntityId);
  if(!first||!second||first.shape!=="box"||second.shape!=="box")
    throw new Error("Contact heat transfer currently requires two invented rectangular box solids.");
  const m1=p.materials.find(m=>m.id===first.materialId);
  const m2=p.materials.find(m=>m.id===second.materialId);
  if(!m1||!m2||m1.densityKgM3===null||m2.densityKgM3===null||
    m1.thermalConductivityWPerMK==null||m2.thermalConductivityWPerMK==null||
    m1.specificHeatJPerKgK==null||m2.specificHeatJPerKgK==null)
    throw new Error("Both invented materials require assumed density, conductivity and specific heat.");
  const a=first.positionMeters,b=second.positionMeters;
  const d1=first.dimensionsMeters,d2=second.dimensionsMeters;
  if(Math.abs(a[1]-b[1])>1e-7||Math.abs(a[2]-b[2])>1e-7||
    Math.abs(d1[1]-d2[1])>1e-7||Math.abs(d1[2]-d2[2])>1e-7||
    Math.abs(Math.abs(a[0]-b[0])-(d1[0]+d2[0])/2)>1e-7)
    throw new Error("Thermal interface needs face-touching X-aligned boxes of equal Y/Z cross-section.");
  const firstTemp=bounded(input.firstTemperatureK,200,2000,"First temperature");
  const secondTemp=bounded(input.secondTemperatureK,200,2000,"Second temperature");
  const duration=bounded(input.durationSeconds,0.1,3600,"Thermal duration");
  const q1=solidQuantities(first,m1).massKg;
  const q2=solidQuantities(second,m2).massKg;
  if(q1===null||q2===null)throw new Error("Assumed material masses must be available.");
  const c1=q1*m1.specificHeatJPerKgK,c2=q2*m2.specificHeatJPerKgK;
  const area=d1[1]*d1[2];
  const conductance=1/(d1[0]/(2*m1.thermalConductivityWPerMK*area)+
    d2[0]/(2*m2.thermalConductivityWPerMK*area));
  const total=c1+c2;
  const equilibrium=(c1/total)*firstTemp+(c2/total)*secondTemp;
  const rate=conductance*(1/c1+1/c2);
  if(![c1,c2,conductance,equilibrium,rate].every(Number.isFinite)||
    c1<=0||c2<=0||conductance<=0||rate<0)
    throw new Error("Invented thermal properties produced a non-finite heat exchange.");
  const samples:MaterialHeatSample[]=[];
  for(let i=0;i<=120;i++){
    const time=i/120*duration;
    const difference=(firstTemp-secondTemp)*Math.exp(-rate*time);
    const t1=equilibrium+(c2/total)*difference;
    const t2=equilibrium-(c1/total)*difference;
    const flow=conductance*(t1-t2);
    const residual=c1*(t1-firstTemp)+c2*(t2-secondTemp);
    const tolerance=1e-7*Math.max(1,
      Math.abs(c1*(firstTemp-secondTemp)),Math.abs(c2*(firstTemp-secondTemp)));
    if(![t1,t2,flow,residual].every(Number.isFinite)||Math.abs(residual)>tolerance)
      throw new Error("Invented material heat-transfer energy conservation audit failed.");
    samples.push({timeSeconds:time,firstTemperatureK:t1,
      secondTemperatureK:t2,interfaceHeatFlowW:flow,energyResidualJ:residual});
  }
  return Object.freeze({
    format:"env-world-lab-material-heat-transfer",modelVersion:"1.0.0",
    evidence:"physics-model-computed",materialEvidence:"hypothetical-user-assumed",
    projectId:p.id,projectRevision:p.revision,firstEntityId:first.id,
    secondEntityId:second.id,firstMaterialId:m1.id,secondMaterialId:m2.id,
    firstThermalCapacityJPerK:c1,secondThermalCapacityJPerK:c2,
    conductanceWPerK:conductance,equilibriumTemperatureK:equilibrium,
    input:Object.freeze({...input}),samples:Object.freeze(samples),
    validity:"Exact two-node insulated contact model with user-assumed homogeneous "+
      "density, specific heat and thermal conductivity. X-aligned equal-cross-section "+
      "rectangular slabs, ideal interface, uniform internal temperature. No "+
      "transient interior gradients, radiation, convection, phase change, "+
      "actual safety limits or measured material identity.",
  });
}
export function sampleMaterialHeatTransfer(run:MaterialHeatRun,time:number){
  if(!Number.isFinite(time))throw new Error("Thermal time must be finite.");
  const index=Math.max(0,Math.min(run.samples.length-1,
    Math.round(time/run.input.durationSeconds*120)));
  return run.samples[index];
}
