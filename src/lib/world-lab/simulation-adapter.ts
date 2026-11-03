import { validateModel, type DampedOscillator } from "./model.ts";

export type SimulationDiagnostic = Readonly<{ severity: "error" | "warning" | "info"; code: string; message: string }>;
export type SimulationCapabilities = Readonly<{ deterministic: boolean; checkpoint: boolean; restore: boolean; eventScheduling: boolean; cancellation: boolean; maximumStepSeconds: number; maximumRunSeconds: number }>;
export type SimulationContext = Readonly<{ projectId: string; projectRevision: number; runId: string; worldDateUTC: string; seed: number }>;
export type SimulationStep = Readonly<{ deltaSeconds: number; maximumInternalStepSeconds: number; externalForceN?: number }>;
export type SimulationOutput = Readonly<{ simulatedSeconds: number; positionM: number; velocityMPerS: number; mechanicalEnergyJ: number }>;
export type SimulationAdvance<State, Output> = Readonly<{ state: State; outputs: Output; nextEventSeconds: number | null; events: readonly Readonly<{ id: string; atSeconds: number; kind: string }>[] }>;

/** Trusted, built-in model lifecycle. Imported projects contain data and model IDs, never executable adapters. */
export interface WorldLabSimulationAdapter<State, Parameters, Inputs, Outputs> {
  readonly id: string;
  readonly version: string;
  readonly capabilities: SimulationCapabilities;
  validate(parameters: unknown): readonly SimulationDiagnostic[];
  initialize(context: SimulationContext, parameters: unknown): State;
  advance(state: State, step: SimulationStep, inputs?: Inputs): SimulationAdvance<State, Outputs>;
  getOutputs(state: State): Outputs;
  checkpoint(state: State): unknown;
  restore(checkpoint: unknown): State;
  diagnostics(state: State): readonly SimulationDiagnostic[];
  dispose(): void;
}

type OscillatorState = Readonly<{
  format: "env-world-lab-simulation-state"; schemaVersion: 1;
  modelId: "damped-oscillator"; modelVersion: "1.0.0";
  projectId: string; projectRevision: number; runId: string; worldDateUTC: string; seed: number;
  simulatedSeconds: number; stepIndex: number; positionM: number; velocityMPerS: number; parameters: DampedOscillator;
}>;
type OscillatorCheckpoint = Readonly<{ format: "env-world-lab-checkpoint"; schemaVersion: 1; modelId: "damped-oscillator"; modelVersion: "1.0.0"; state: OscillatorState }>;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const idPattern = /^[A-Za-z0-9_-]{1,120}$/;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseParameters(raw: unknown): DampedOscillator {
  if (!record(raw) || raw.kind !== "damped-oscillator") throw new Error("Damped oscillator parameters are required.");
  const value = raw as unknown as DampedOscillator;
  validateModel(value);
  return Object.freeze({ ...value });
}
function parseState(raw: unknown): OscillatorState {
  if (!record(raw) || raw.format !== "env-world-lab-simulation-state" || raw.schemaVersion !== 1 ||
      raw.modelId !== "damped-oscillator" || raw.modelVersion !== "1.0.0" ||
      typeof raw.projectId !== "string" || !idPattern.test(raw.projectId) ||
      typeof raw.runId !== "string" || !idPattern.test(raw.runId) ||
      !Number.isSafeInteger(raw.projectRevision) || Number(raw.projectRevision) < 0 ||
      !Number.isFinite(Date.parse(String(raw.worldDateUTC))) ||
      !Number.isSafeInteger(raw.seed) || Number(raw.seed) < 0 || Number(raw.seed) > 0xffffffff ||
      !finite(raw.simulatedSeconds) || raw.simulatedSeconds < 0 ||
      !Number.isSafeInteger(raw.stepIndex) || Number(raw.stepIndex) < 0 ||
      !finite(raw.positionM) || Math.abs(Number(raw.positionM)) > 1e8 ||
      !finite(raw.velocityMPerS) || Math.abs(Number(raw.velocityMPerS)) > 1e6) {
    throw new Error("Simulation state is malformed or outside the supported numerical envelope.");
  }
  return Object.freeze({
    format: "env-world-lab-simulation-state", schemaVersion: 1, modelId: "damped-oscillator", modelVersion: "1.0.0",
    projectId: raw.projectId, projectRevision: Number(raw.projectRevision), runId: raw.runId,
    worldDateUTC: String(raw.worldDateUTC), seed: Number(raw.seed), simulatedSeconds: Number(raw.simulatedSeconds),
    stepIndex: Number(raw.stepIndex), positionM: Number(raw.positionM), velocityMPerS: Number(raw.velocityMPerS),
    parameters: parseParameters(raw.parameters),
  });
}
function energy(state: Pick<OscillatorState, "positionM" | "velocityMPerS" | "parameters">): number {
  return 0.5 * state.parameters.massKg * state.velocityMPerS ** 2 + 0.5 * state.parameters.springNPerM * state.positionM ** 2;
}
function rk4(position: number, velocity: number, h: number, p: DampedOscillator, forceN: number) {
  const d = (x: number, v: number): readonly [number, number] => [v, (forceN - p.springNPerM * x - p.dampingNsPerM * v) / p.massKg];
  const [a1,b1] = d(position, velocity); const [a2,b2] = d(position+h*a1/2, velocity+h*b1/2);
  const [a3,b3] = d(position+h*a2/2, velocity+h*b2/2); const [a4,b4] = d(position+h*a3, velocity+h*b3);
  const x = position+h*(a1+2*a2+2*a3+a4)/6; const v = velocity+h*(b1+2*b2+2*b3+b4)/6;
  if (![x,v].every(Number.isFinite) || Math.abs(x)>1e8 || Math.abs(v)>1e6) throw new Error("Solver left its finite state envelope.");
  return { positionM:x, velocityMPerS:v };
}

export function createDampedOscillatorAdapter(): WorldLabSimulationAdapter<OscillatorState, DampedOscillator, Readonly<{ externalForceN: number }>, SimulationOutput> {
  const capabilities: SimulationCapabilities = Object.freeze({ deterministic:true, checkpoint:true, restore:true, eventScheduling:false, cancellation:false, maximumStepSeconds:0.05, maximumRunSeconds:30 });
  const outputs = (state: OscillatorState): SimulationOutput => {
    const s = parseState(state);
    return Object.freeze({ simulatedSeconds:s.simulatedSeconds, positionM:s.positionM, velocityMPerS:s.velocityMPerS, mechanicalEnergyJ:energy(s) });
  };
  return Object.freeze({
    id:"damped-oscillator", version:"1.0.0", capabilities,
    validate(raw: unknown): readonly SimulationDiagnostic[] {
      try { parseParameters(raw); return Object.freeze([]); }
      catch (e) { return Object.freeze([{ severity:"error" as const, code:"INVALID_OSCILLATOR_PARAMETERS", message:e instanceof Error?e.message:"Invalid oscillator parameters." }]); }
    },
    initialize(context: SimulationContext, raw: unknown): OscillatorState {
      if (!context || !idPattern.test(context.projectId) || !idPattern.test(context.runId) ||
          !Number.isSafeInteger(context.projectRevision) || context.projectRevision<0 ||
          !Number.isSafeInteger(context.seed) || context.seed<0 || context.seed>0xffffffff ||
          !Number.isFinite(Date.parse(context.worldDateUTC))) throw new Error("Simulation context is invalid.");
      const p=parseParameters(raw);
      return parseState({ format:"env-world-lab-simulation-state", schemaVersion:1, modelId:"damped-oscillator", modelVersion:"1.0.0",
        projectId:context.projectId, projectRevision:context.projectRevision, runId:context.runId, worldDateUTC:context.worldDateUTC,
        seed:context.seed, simulatedSeconds:0, stepIndex:0, positionM:p.initialDisplacementM, velocityMPerS:p.initialVelocityMPerS, parameters:p });
    },
    advance(state: OscillatorState, step: SimulationStep, inputs?: Readonly<{ externalForceN: number }>) {
      const current=parseState(state); const force=inputs?.externalForceN??0;
      if (!finite(step?.deltaSeconds) || step.deltaSeconds<=0 || step.deltaSeconds>1 ||
          !finite(step.maximumInternalStepSeconds) || step.maximumInternalStepSeconds<1e-6 || step.maximumInternalStepSeconds>capabilities.maximumStepSeconds)
        throw new Error("Advance requires a positive bounded step and supported internal solver step.");
      if (!finite(force) || Math.abs(force)>10000) throw new Error("External force must be finite and within ±10,000 N.");
      const count=Math.ceil(step.deltaSeconds/step.maximumInternalStepSeconds);
      if (count>10000 || current.simulatedSeconds+step.deltaSeconds>capabilities.maximumRunSeconds+1e-12) throw new Error("Simulation exceeds its step or duration budget.");
      const h=step.deltaSeconds/count; let x=current.positionM; let v=current.velocityMPerS;
      for(let i=0;i<count;i++){ const next=rk4(x,v,h,current.parameters,force); x=next.positionM; v=next.velocityMPerS; }
      const next=parseState({ ...current, simulatedSeconds:current.simulatedSeconds+step.deltaSeconds, stepIndex:current.stepIndex+count, positionM:x, velocityMPerS:v });
      return Object.freeze({ state:next, outputs:outputs(next), nextEventSeconds:null, events:Object.freeze([]) });
    },
    getOutputs(state: OscillatorState): SimulationOutput { return outputs(state); },
    checkpoint(state: OscillatorState): OscillatorCheckpoint { return Object.freeze({ format:"env-world-lab-checkpoint", schemaVersion:1, modelId:"damped-oscillator", modelVersion:"1.0.0", state:parseState(state) }); },
    restore(raw: unknown): OscillatorState {
      if(!record(raw)||raw.format!=="env-world-lab-checkpoint"||raw.schemaVersion!==1||raw.modelId!=="damped-oscillator"||raw.modelVersion!=="1.0.0") throw new Error("Checkpoint format or model version is unsupported.");
      return parseState(raw.state);
    },
    diagnostics(state: OscillatorState): readonly SimulationDiagnostic[] {
      const e=energy(parseState(state));
      if(!Number.isFinite(e)||e<0) return Object.freeze([{severity:"error" as const,code:"INVALID_MECHANICAL_ENERGY",message:"Computed oscillator energy is invalid."}]);
      return Object.freeze([{severity:"info" as const,code:"REFERENCE_MODEL_LIMIT",message:"Linear 1D mass-spring-damper only; no nonlinear spring, geometry, contact or material failure is represented."}]);
    },
    dispose(): void { /* This reference adapter owns no external resource. */ },
  });
}

export class WorldLabSimulationAdapterRegistry {
  private readonly adapters = new Map<string, WorldLabSimulationAdapter<unknown, unknown, unknown, unknown>>();
  register<S,P,I,O>(adapter: WorldLabSimulationAdapter<S,P,I,O>): void {
    const key=adapter.id+"@"+adapter.version;
    if(!idPattern.test(adapter.id)||!/^\d+\.\d+\.\d+$/.test(adapter.version)||this.adapters.has(key)) throw new Error("Adapter ID and semantic version must be unique.");
    this.adapters.set(key,adapter as WorldLabSimulationAdapter<unknown,unknown,unknown,unknown>);
  }
  get(id:string,version:string): WorldLabSimulationAdapter<unknown,unknown,unknown,unknown> {
    const adapter=this.adapters.get(id+"@"+version);
    if(!adapter) throw new Error("Scientific model adapter is not installed or permitted.");
    return adapter;
  }
  list(): readonly Readonly<{id:string;version:string}>[] {
    return Object.freeze([...this.adapters.values()].map(a=>Object.freeze({id:a.id,version:a.version})).sort((a,b)=>a.id.localeCompare(b.id)||a.version.localeCompare(b.version)));
  }
}