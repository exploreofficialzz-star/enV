export type SpatialLod = "planetary" | "regional" | "local" | "component" | "micro";

export type SpatialResolutionRequest = Readonly<{
  visibleRadiusMeters:number;
  cameraRangeMeters:number;
  verticalFieldOfViewRadians:number;
  viewportHeightPixels:number;
  targetPixelsPerCell:number;
  minimumVisualCellMeters:number;
  maximumVisualCellMeters:number;
  maximumVisibleCells:number;
  solverCellMeters:number;
  solverDomainId:string;
  modelId:string;
  modelVersion:string;
}>;

export type SpatialResolutionPlan = Readonly<{
  lod:SpatialLod;
  visualCellMeters:number;
  solverCellMeters:number;
  estimatedVisibleCells:number;
  visualToSolverRatio:number;
  solverResolutionChanged:false;
  diagnostics:readonly Readonly<{code:string;severity:"warning"|"info";message:string}>[];
}>;

const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
function positive(v:unknown,name:string,max=1e12):number {
  if(!finite(v)||v<=0||v>max) throw new Error(name+" must be finite, positive and within its supported bound.");
  return v;
}
function lodForDiameter(diameter:number):SpatialLod {
  if(diameter>=1_000_000)return "planetary";
  if(diameter>=10_000)return "regional";
  if(diameter>=10)return "local";
  if(diameter>=0.001)return "component";
  return "micro";
}

/** Visual LOD adapts to camera range and a cell budget. It never changes solver resolution. */
export function planSpatialResolution(request:SpatialResolutionRequest):SpatialResolutionPlan {
  const radius=positive(request.visibleRadiusMeters,"Visible radius",1e9);
  const range=positive(request.cameraRangeMeters,"Camera range",1e12);
  const fov=positive(request.verticalFieldOfViewRadians,"Vertical field of view",Math.PI);
  if(fov>=Math.PI) throw new Error("Field of view must be below π radians.");
  const viewport=positive(request.viewportHeightPixels,"Viewport height",32768);
  const targetPixels=positive(request.targetPixelsPerCell,"Target pixels per cell",4096);
  const minimum=positive(request.minimumVisualCellMeters,"Minimum visual cell",1e9);
  const maximum=positive(request.maximumVisualCellMeters,"Maximum visual cell",1e12);
  if(maximum<minimum)throw new Error("Maximum visual cell size cannot be smaller than its minimum.");
  const cellBudget=positive(request.maximumVisibleCells,"Visible cell budget",1e9);
  const solver=positive(request.solverCellMeters,"Solver cell size",1e12);
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(request.solverDomainId)||
     !/^[A-Za-z0-9_-]{1,120}$/.test(request.modelId)||
     !/^\d+\.\d+\.\d+$/.test(request.modelVersion)) {
    throw new Error("Spatial resolution requires a stable solver domain and versioned model identity.");
  }
  const diameter=radius*2;
  const pixelFootprint=(2*range*Math.tan(fov/2))/viewport;
  const screenTarget=pixelFootprint*targetPixels;
  const budgetTarget=diameter/Math.cbrt(cellBudget);
  const visual=clamp(Math.max(screenTarget,budgetTarget,minimum),minimum,maximum);
  const estimated=Math.ceil(Math.pow(diameter/visual,3));
  const ratio=visual/solver;
  const diagnostics:Array<{code:string;severity:"warning"|"info";message:string}>=[];
  if(estimated>cellBudget*1.001)diagnostics.push({code:"VISUAL_CELL_BUDGET_EXCEEDED",severity:"warning",message:"The visible geometry exceeds its cell budget; lower detail or reduce the visible domain."});
  if(ratio>8||ratio<0.125)diagnostics.push({code:"VISUAL_SOLVER_RESOLUTION_MISMATCH",severity:"warning",message:"Visual and solver cell sizes differ materially. This affects rendering only; scientific values remain on the solver grid."});
  diagnostics.push({code:"SOLVER_GRID_PRESERVED",severity:"info",message:"Adaptive LOD changed render geometry only. The registered solver resolution is unchanged."});
  return Object.freeze({lod:lodForDiameter(diameter),visualCellMeters:visual,solverCellMeters:solver,estimatedVisibleCells:estimated,visualToSolverRatio:ratio,solverResolutionChanged:false,diagnostics:Object.freeze(diagnostics)});
}

export type TemporalResolutionRequest=Readonly<{durationSeconds:number;requestedStepSeconds:number;minimumStepSeconds:number;maximumStableStepSeconds:number;maximumSteps:number}>;
export type TemporalResolutionPlan=Readonly<{stepSeconds:number;stepCount:number;durationSeconds:number;solverStepChanged:boolean;diagnostics:readonly Readonly<{code:string;severity:"warning"|"info";message:string}>[]}>;
/** Enforce a model's stability cap and compute budget; never silently use unstable steps. */
export function planTemporalResolution(request:TemporalResolutionRequest):TemporalResolutionPlan {
  const duration=positive(request.durationSeconds,"Simulation duration",1e12);
  const desired=positive(request.requestedStepSeconds,"Requested solver step",1e9);
  const minStep=positive(request.minimumStepSeconds,"Minimum solver step",1e9);
  const stable=positive(request.maximumStableStepSeconds,"Maximum stable solver step",1e9);
  const maximumSteps=positive(request.maximumSteps,"Maximum solver steps",1e9);
  if(!Number.isSafeInteger(maximumSteps))throw new Error("Maximum solver steps must be a safe integer.");
  if(minStep>stable)throw new Error("The solver minimum step exceeds its stability limit.");
  const selected=Math.min(desired,stable);
  if(selected<minStep)throw new Error("Requested temporal resolution is below the solver minimum.");
  const count=Math.ceil(duration/selected);
  if(count>maximumSteps)throw new Error("This duration exceeds the solver step budget at its stable time step. Shorten the run or use a reduced-order model.");
  const actual=duration/count;
  if(actual>stable*(1+1e-12)||actual<minStep*(1-1e-12))throw new Error("No bounded stable step fits the requested duration and compute budget.");
  const diagnostics:Array<{code:string;severity:"warning"|"info";message:string}>=[];
  if(desired>stable)diagnostics.push({code:"STABILITY_STEP_CLAMPED",severity:"warning",message:"Requested step exceeded the model stability limit. A smaller solver step was used."});
  diagnostics.push({code:"SIMULATED_TIME_IS_MODEL_TIME",severity:"info",message:"Playback speed changes viewing time only; recorded solver timestamps and step size remain unchanged."});
  return Object.freeze({stepSeconds:actual,stepCount:count,durationSeconds:duration,solverStepChanged:Math.abs(actual-desired)>1e-12,diagnostics:Object.freeze(diagnostics)});
}

export type PhysicalQuantity="length"|"area"|"volume"|"mass"|"time"|"speed"|"acceleration"|"force"|"pressure"|"energy"|"power"|"temperature"|"density"|"current"|"voltage"|"conductivity";
const allowedUnits:Readonly<Record<PhysicalQuantity,readonly string[]>>={
  length:["m","mm","km"],area:["m2","km2"],volume:["m3","L"],mass:["kg","g","tonne"],time:["s","min","h"],
  speed:["m/s","km/h"],acceleration:["m/s2"],force:["N","kN"],pressure:["Pa","kPa","MPa"],energy:["J","kJ","Wh","kWh"],
  power:["W","kW"],temperature:["K","degC"],density:["kg/m3"],current:["A","mA"],voltage:["V","mV","kV"],conductivity:["W/(m K)","S/m"],
};
export type ReducedOrderBoundary=Readonly<{
  id:string;sourceModelId:string;sourceModelVersion:string;targetModelId:string;targetPortId:string;
  quantity:PhysicalQuantity;unit:string;value:number;uncertaintyLower:number|null;uncertaintyUpper:number|null;
  sourceResolutionMeters:number|null;targetResolutionMeters:number|null;
  evidence:"measured-observed"|"physics-model-computed"|"climatological-reference"|"representative-only";
  validityStartUTC:string;validityEndUTC:string;assumptions:readonly string[];
}>;
/** Typed model boundary. Coupling is not asserted until units and scale assumptions are checked. */
export function validateReducedOrderBoundary(raw:ReducedOrderBoundary):readonly Readonly<{code:string;severity:"warning"|"info";message:string}>[] {
  if(!raw||!/^[A-Za-z0-9_-]{1,120}$/.test(raw.id)||!/^[A-Za-z0-9_-]{1,120}$/.test(raw.sourceModelId)||
     !/^\d+\.\d+\.\d+$/.test(raw.sourceModelVersion)||!/^[A-Za-z0-9_-]{1,120}$/.test(raw.targetModelId)||
     !/^[A-Za-z0-9_-]{1,120}$/.test(raw.targetPortId))throw new Error("Reduced-order boundary identities are malformed.");
  if(!allowedUnits[raw.quantity]||!allowedUnits[raw.quantity].includes(raw.unit))throw new Error("Boundary quantity and unit are incompatible.");
  if(!finite(raw.value)||Math.abs(raw.value)>1e30)throw new Error("Boundary value is nonfinite or outside its numeric envelope.");
  if((raw.uncertaintyLower===null)!==(raw.uncertaintyUpper===null)||
     (raw.uncertaintyLower!==null&&(!finite(raw.uncertaintyLower)||!finite(raw.uncertaintyUpper)||raw.uncertaintyLower>raw.uncertaintyUpper||raw.value<raw.uncertaintyLower||raw.value>raw.uncertaintyUpper))) {
    throw new Error("Boundary uncertainty must be a paired interval containing its value.");
  }
  for(const [value,label] of [[raw.sourceResolutionMeters,"Source resolution"],[raw.targetResolutionMeters,"Target resolution"]] as const) {
    if(value!==null)positive(value,label,1e12);
  }
  if(!Number.isFinite(Date.parse(raw.validityStartUTC))||!Number.isFinite(Date.parse(raw.validityEndUTC))||Date.parse(raw.validityStartUTC)>Date.parse(raw.validityEndUTC))throw new Error("Boundary validity interval is invalid.");
  if(!Array.isArray(raw.assumptions)||raw.assumptions.length>100||!raw.assumptions.every(x=>typeof x==="string"&&x.trim().length>0&&x.length<=500))throw new Error("Boundary assumptions must be an explicit bounded list.");
  const diagnostics:Array<{code:string;severity:"warning"|"info";message:string}>=[];
  if(raw.evidence==="representative-only")diagnostics.push({code:"REPRESENTATIVE_BOUNDARY",severity:"warning",message:"This boundary is illustrative only and cannot be treated as a measured environmental condition."});
  if(raw.sourceResolutionMeters!==null&&raw.targetResolutionMeters!==null) {
    const ratio=Math.max(raw.sourceResolutionMeters,raw.targetResolutionMeters)/Math.min(raw.sourceResolutionMeters,raw.targetResolutionMeters);
    if(ratio>8)diagnostics.push({code:"REDUCED_ORDER_RESOLUTION_GAP",severity:"warning",message:"Source and target resolutions differ by more than 8×. A documented aggregation or interpolation operator is required before coupling."});
  }
  return Object.freeze(diagnostics.map(x=>Object.freeze(x)));
}
