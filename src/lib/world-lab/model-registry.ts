import type {WorldLabRemoteOperation} from "./server-compute.ts";
/** Honest runtime registry: reference models only, never universal/engineering certification. */
export type ScientificModelDescriptor=Readonly<{
  id:string;version:"1.0.0";discipline:string;
  execution:"device"|"account-worker";evidence:"physics-model-computed";
  validity:string;source:string;limitations:string;certified:false;
}>;
const remote:Readonly<Record<WorldLabRemoteOperation,ScientificModelDescriptor>>={
  "hydrostatics":{id:"hydrostatics",version:"1.0.0",discipline:"fluid statics",
    execution:"account-worker",evidence:"physics-model-computed",
    validity:"Bounded hydrostatic fluid pressure and buoyancy in an assumed uniform fluid.",
    source:"Classical hydrostatic pressure and Archimedes principle",
    limitations:"No moving fluid, local geology or measured material coefficients.",certified:false},
  "dc-network":{id:"dc-network",version:"1.0.0",discipline:"electric circuits",
    execution:"account-worker",evidence:"physics-model-computed",
    validity:"Bounded linear passive DC nodal network with ideal sources.",
    source:"Kirchhoff circuit laws",limitations:"No AC, device transients or semiconductor model.",certified:false},
  "wired-motor":{id:"wired-motor",version:"1.0.0",discipline:"electromechanics",
    execution:"account-worker",evidence:"physics-model-computed",
    validity:"One-dimensional ideal-voltage motor/actuator with assumed parameters.",
    source:"Lumped R-L electrical and Newtonian mechanical equations",
    limitations:"No torque-speed map, vehicle or realistic battery.",certified:false},
  "chemical-thermal":{id:"chemical-thermal",version:"1.0.0",discipline:"reaction kinetics",
    execution:"account-worker",evidence:"physics-model-computed",
    validity:"Single-reactant hypothetical Arrhenius and lumped thermal exchange.",
    source:"Arrhenius rate equation and first law of thermodynamics",
    limitations:"No verified invented molecular pathways.",certified:false},
  "multi-sphere":{id:"multi-sphere",version:"1.0.0",discipline:"rigid-body contacts",
    execution:"account-worker",evidence:"physics-model-computed",
    validity:"Successive isolated frictionless smooth-sphere impulse contacts.",
    source:"Classical linear momentum and restitution laws",
    limitations:"No stacking, friction, spin or simultaneous contacts.",certified:false},
  "exhaustive-logic":{id:"exhaustive-logic",version:"1.0.0",discipline:"digital logic",
    execution:"account-worker",evidence:"physics-model-computed",
    validity:"Deterministic bounded Boolean truth tables of user-designed gates.",
    source:"Boolean algebra and exhaustive finite enumeration",
    limitations:"No physical transistor timing, chip voltage or firmware.",certified:false},
  "chemical-sweep":{id:"chemical-sweep",version:"1.0.0",discipline:"reaction sensitivity",
    execution:"account-worker",evidence:"physics-model-computed",
    validity:"25-case numerical sweep over a bounded assumed thermal reaction.",
    source:"Arrhenius rate and first-law parameter perturbations",
    limitations:"Not chemical discovery or experimental calibration.",certified:false},
  "structural-sweep":{id:"structural-sweep",version:"1.0.0",discipline:"structural sensitivity",
    execution:"account-worker",evidence:"physics-model-computed",
    validity:"Bounded Euler-Bernoulli cantilever sensitivity to assumed stiffness.",
    source:"Euler-Bernoulli linear elastic beam theory",
    limitations:"No fracture/yield or full 3D FEM.",certified:false},
  "newton-gravity":{id:"newton-gravity",version:"1.0.0",discipline:"orbital mechanics",
    execution:"account-worker",evidence:"physics-model-computed",
    validity:"Finite pairwise Newtonian gravitational trajectory with bounded energy drift.",
    source:"Newton inverse-square gravity; velocity-Verlet integration",
    limitations:"No relativity, tides, collisions or live ephemerides.",certified:false},
};
export function worldLabModelForRemote(kind:string):ScientificModelDescriptor{
  if(!Object.prototype.hasOwnProperty.call(remote,kind))
    throw new Error("Requested scientific model is not registered or available.");
  return remote[kind as WorldLabRemoteOperation];
}
export function worldLabRemoteModelCatalog():readonly ScientificModelDescriptor[]{
  return Object.freeze(Object.values(remote));
}
export function validateRunProvenance(model:ScientificModelDescriptor,
  value:Readonly<{modelVersion:string;evidence:string;validity:string}>):void{
  if(value.modelVersion!==model.version||
    value.evidence!==model.evidence||typeof value.validity!=="string"||
    !value.validity.trim())
    throw new Error("Scientific result model version or computed evidence is inconsistent.");
}
