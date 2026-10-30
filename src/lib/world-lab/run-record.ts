import { validateModel, MODEL_VERSION, type LabRun, type ModelSample } from "./model.ts";

/**
 * Read untrusted IndexedDB snapshots defensively. These are *locally computed*
 * reference results, not scientifically signed or independently measured data.
 */
export const MAX_STORED_RUN_BYTES = 8 * 1024 * 1024;
export const MAX_STORED_RUNS_PER_PROJECT = 20;

const validId = (s: unknown) => typeof s === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(s);
const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
export function parseStoredWorldLabRun(input: unknown): LabRun {
  if (!input || typeof input !== "object") throw new Error("Saved scientific run is missing.");
  const run = input as Partial<LabRun>;
  if (run.format !== "env-world-lab-run" || run.schemaVersion !== 1 ||
      !validId(run.id) || !(run.parentRunId === null || validId(run.parentRunId)) ||
      run.modelVersion !== MODEL_VERSION || run.evidence !== "physics-model-computed" ||
      run.illustrativeGeometry !== true ||
      run.inputEvidence !== "hypothetical-user-assumed" ||
      typeof run.validity !== "string" || run.validity.length < 15 ||
      run.validity.length > 1000 || !run.time ||
      !finite(run.time.simulatedDurationSeconds) ||
      !finite(run.time.solverStepSeconds) ||
      !Number.isFinite(Date.parse(run.time.worldDateUTC)) ||
      !run.inputs || run.modelId !== run.inputs.kind) {
    throw new Error("Stored World Lab run contains invalid model, evidence or time metadata.");
  }
  validateModel(run.inputs);
  const duration=run.time.simulatedDurationSeconds;
  const step=run.time.solverStepSeconds;
  if (!(duration >= 0.01 && duration <= 30 && step >= 1e-9 && step <= 0.05) ||
      !Array.isArray(run.samples) || run.samples.length < 2 ||
      run.samples.length > 50001) {
    throw new Error("Stored World Lab run exceeds solver or recording limits.");
  }
  if (Math.abs((run.samples.length-1)*step-duration) > 1e-6) {
    throw new Error("Stored run time grid is inconsistent.");
  }
  const allowed = new Set([
    "simulatedSeconds","positionM","velocityMPerS","mechanicalEnergyJ",
    "capacitorVoltageV","currentA","resistorHeatW","storedEnergyJ",
    "temperaturesK","meanTemperatureK","maximumTemperatureK",
  ]);
  for (let i=0;i<run.samples.length;i++) {
    const sample: ModelSample=run.samples[i];
    if (!sample || typeof sample!=="object" || !finite(sample.simulatedSeconds) ||
        Math.abs(sample.simulatedSeconds-i*step)>1e-5 ||
        Object.keys(sample).some(key=>!allowed.has(key))) {
      throw new Error("Stored run contains corrupted sample positions or unsupported data fields.");
    }
    for(const [key,value] of Object.entries(sample)) {
      if (key==="temperaturesK") {
        if (!Array.isArray(value) || value.length!==21 || value.some(item=>!finite(item)||item<0||item>2000)) {
          throw new Error("Stored heat field does not contain 21 finite Kelvin values.");
        }
      } else if (!finite(value)) {
        throw new Error("Stored run contains a non-finite scientific result.");
      }
    }
    if(run.modelId==="heat-rod" && (!sample.temperaturesK ||
      !finite(sample.maximumTemperatureK) || !finite(sample.meanTemperatureK))) {
      throw new Error("A stored heat run needs its recorded temperature field.");
    }
    if(run.modelId==="damped-oscillator" &&
      (!finite(sample.positionM)||!finite(sample.velocityMPerS)||!finite(sample.mechanicalEnergyJ))) {
      throw new Error("A stored oscillator run needs recorded motion and energy.");
    }
    if(run.modelId==="rc-circuit" && (!finite(sample.capacitorVoltageV)||
      !finite(sample.currentA)||!finite(sample.storedEnergyJ)||!finite(sample.resistorHeatW))) {
      throw new Error("A stored RC run needs its voltage, current, heat and energy.");
    }
  }
  const source=run.assumedMassSource;
  if(source!==null) {
    if(!source || source.kind!=="material-geometry-mass" ||
       source.evidence!=="hypothetical-user-assumed" || !validId(source.projectId) ||
       !validId(source.entityId)||!validId(source.materialId)||
       !finite(source.volumeM3)||!finite(source.assumedDensityKgM3)||
       !finite(source.derivedMassKg)||typeof source.entityName!=="string"||
       typeof source.materialName!=="string"||typeof source.assumption!=="string"||
       run.inputs.kind!=="damped-oscillator" ||
       Math.abs(source.volumeM3*source.assumedDensityKgM3-source.derivedMassKg)>1e-9*Math.max(1,source.derivedMassKg) ||
       Math.abs(run.inputs.massKg-source.derivedMassKg)>1e-9*Math.max(1,source.derivedMassKg)) {
      throw new Error("Saved hypothetical-mass provenance is inconsistent.");
    }
  }
  return Object.freeze({
    ...run,
    inputs:Object.freeze({...run.inputs}),
    assumedMassSource:source?Object.freeze({...source}):null,
    samples:Object.freeze(run.samples.map(s=>Object.freeze({
      ...s,
      ...(s.temperaturesK ? {temperaturesK:Object.freeze([...s.temperaturesK])}:{}),
    }))),
  }) as LabRun;
}
export function serializeStoredWorldLabRun(run:LabRun):string {
  const verified=parseStoredWorldLabRun(run);
  const json=JSON.stringify(verified);
  if(new TextEncoder().encode(json).byteLength>MAX_STORED_RUN_BYTES) {
    throw new Error("Scientific run exceeds the 8 MB browser history limit. Export the run JSON instead.");
  }
  return json;
}
