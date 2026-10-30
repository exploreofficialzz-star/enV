/**
 * The World Lab local reference models. These are deliberately bounded scientific
 * experiments, not a universal physics engine or certified engineering analysis.
 * Scientific provenance and time semantics are part of the API.
 */
export type EvidenceKind =
  | "measured-observed"
  | "physics-model-computed"
  | "hypothetical-user-assumed"
  | "unknown-insufficient-evidence";

export type DampedOscillator = Readonly<{
  kind: "damped-oscillator";
  massKg: number;
  springNPerM: number;
  dampingNsPerM: number;
  initialDisplacementM: number;
  initialVelocityMPerS: number;
}>;

export type RCCircuit = Readonly<{
  kind: "rc-circuit";
  resistanceOhm: number;
  capacitanceF: number;
  supplyVoltageV: number;
  initialVoltageV: number;
}>;

export type HeatRod = Readonly<{
  kind: "heat-rod";
  thermalDiffusivityM2PerS: number;
  lengthMeters: number;
  ambientTemperatureK: number;
  centerTemperatureK: number;
}>;

export const HEAT_CELLS = 21;
export type ModelInput = DampedOscillator | RCCircuit | HeatRod;

export type ModelSample = Readonly<{
  simulatedSeconds: number;
  positionM?: number;
  velocityMPerS?: number;
  mechanicalEnergyJ?: number;
  capacitorVoltageV?: number;
  currentA?: number;
  resistorHeatW?: number;
  storedEnergyJ?: number;
  temperaturesK?: readonly number[];
  meanTemperatureK?: number;
  maximumTemperatureK?: number;
}>;

export type LabRun = Readonly<{
  format: "env-world-lab-run";
  schemaVersion: 1;
  id: string;
  parentRunId: string | null;
  modelId: string;
  modelVersion: string;
  evidence: "physics-model-computed";
  illustrativeGeometry: true;
  inputs: ModelInput;
  time: Readonly<{
    simulatedDurationSeconds: number;
    solverStepSeconds: number;
    worldDateUTC: string;
  }>;
  validity: string;
  samples: readonly ModelSample[];
}>;

export type NovelMaterial = Readonly<{
  name: string;
  densityKgM3: number | null;
  youngModulusPa: number | null;
  provenance: "hypothetical-user-assumed";
}>;

export const MODEL_VERSION = "1.0.0";
export const DEMO_DURATION_SECONDS = 12;
export const DEFAULT_SOLVER_STEP_SECONDS = 1 / 240;

function bounded(value: number, label: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(label + " must be a finite number from " + min + " to " + max + ".");
  }
}

export function validateModel(input: ModelInput): void {
  if (!input || typeof input !== "object") throw new Error("A scientific model is required.");
  if (input.kind === "damped-oscillator") {
    bounded(input.massKg, "Mass (kg)", 0.001, 10000);
    bounded(input.springNPerM, "Spring stiffness (N/m)", 0.001, 1000000);
    bounded(input.dampingNsPerM, "Damping (N s/m)", 0, 100000);
    bounded(input.initialDisplacementM, "Displacement (m)", -10, 10);
    bounded(input.initialVelocityMPerS, "Velocity (m/s)", -100, 100);
  } else if (input.kind === "heat-rod") {
    bounded(input.thermalDiffusivityM2PerS, "Thermal diffusivity (m2/s)", 1e-7, 100);
    bounded(input.lengthMeters, "Rod length (m)", 0.1, 100);
    bounded(input.ambientTemperatureK, "Ambient temperature (K)", 0, 2000);
    bounded(input.centerTemperatureK, "Center temperature (K)", 0, 2000);
  } else if (input.kind === "rc-circuit") {
    bounded(input.resistanceOhm, "Resistance (ohm)", 0.001, 1000000000);
    bounded(input.capacitanceF, "Capacitance (F)", 1e-9, 1000);
    bounded(input.supplyVoltageV, "Supply voltage (V)", -1000, 1000);
    bounded(input.initialVoltageV, "Initial capacitor voltage (V)", -1000, 1000);
  } else {
    throw new Error("This model is not supported by the local solver.");
  }
}

export function validateNovelMaterial(candidate: NovelMaterial): NovelMaterial {
  if (!candidate || typeof candidate.name !== "string" || !candidate.name.trim() ||
      candidate.name.length > 120 || candidate.provenance !== "hypothetical-user-assumed") {
    throw new Error("A proposed material needs a name and an explicit hypothetical evidence label.");
  }
  if (candidate.densityKgM3 !== null) bounded(candidate.densityKgM3, "Density (kg/m3)", 0.001, 1e9);
  if (candidate.youngModulusPa !== null) bounded(candidate.youngModulusPa, "Young's modulus (Pa)", 0, 1e15);
  return Object.freeze({ ...candidate });
}

function derivative(x: number, v: number, model: DampedOscillator): [number, number] {
  return [v, -(model.springNPerM * x + model.dampingNsPerM * v) / model.massKg];
}

/** Fixed-step RK4 for a linear mass-spring-damper, without external forcing. */
function oscillatorStep(x: number, v: number, h: number, model: DampedOscillator): [number, number] {
  const [a1, b1] = derivative(x, v, model);
  const [a2, b2] = derivative(x + h * a1 / 2, v + h * b1 / 2, model);
  const [a3, b3] = derivative(x + h * a2 / 2, v + h * b2 / 2, model);
  const [a4, b4] = derivative(x + h * a3, v + h * b3, model);
  return [x + h * (a1 + 2 * a2 + 2 * a3 + a4) / 6,
    v + h * (b1 + 2 * b2 + 2 * b3 + b4) / 6];
}

export function runExperiment(input: ModelInput, options: Readonly<{
  id: string;
  worldDateUTC: string;
  parentRunId?: string | null;
  durationSeconds?: number;
  solverStepSeconds?: number;
}>): LabRun {
  validateModel(input);
  if (!options.id || options.id.length > 120 || !Number.isFinite(Date.parse(options.worldDateUTC))) {
    throw new Error("A valid run ID and UTC world date are required.");
  }
  const duration = options.durationSeconds ?? DEMO_DURATION_SECONDS;
  const h = options.solverStepSeconds ?? DEFAULT_SOLVER_STEP_SECONDS;
  bounded(duration, "Duration (s)", 0.01, 30);
  bounded(h, "Solver time step (s)", 0.0001, 0.05);
  // RK4 is not A-stable. Resolve the natural frequency and viscous decay
  // before integrating, so extreme stiffness never becomes fictitious energy.
  const maximumStableH = input.kind === "damped-oscillator"
    ? 0.08 / Math.max(1, Math.sqrt(input.springNPerM / input.massKg),
      input.dampingNsPerM / input.massKg)
    : input.kind === "heat-rod"
      ? 0.45 * (input.lengthMeters / HEAT_CELLS) ** 2 / input.thermalDiffusivityM2PerS
      : h;
  const steps = Math.ceil(duration / Math.min(h, maximumStableH));
  if (steps > 50000) throw new Error("The local reference run exceeds its 50,000-step budget; this stiff model needs a specialized solver.");
  const actualH = duration / steps;
  const frames: ModelSample[] = [];
  let x = input.kind === "damped-oscillator" ? input.initialDisplacementM : 0;
  let v = input.kind === "damped-oscillator" ? input.initialVelocityMPerS : 0;
  // A finite-volume 1D heat equation with zero flux on both ends.
  // No conductivity, heat capacity or radiative effects are inferred.
  let cells = input.kind === "heat-rod"
    ? Array.from({ length: HEAT_CELLS }, (_, index) =>
        index === Math.floor(HEAT_CELLS / 2) ? input.centerTemperatureK : input.ambientTemperatureK)
    : [];
  for (let i = 0; i <= steps; i++) {
    const t = i * actualH;
    if (input.kind === "damped-oscillator") {
      const e = (input.massKg * v * v + input.springNPerM * x * x) / 2;
      frames.push(Object.freeze({ simulatedSeconds: t, positionM: x,
        velocityMPerS: v, mechanicalEnergyJ: e }));
      if (i < steps) [x, v] = oscillatorStep(x, v, actualH, input);
    } else if (input.kind === "heat-rod") {
      const mean = cells.reduce((sum, temperature) => sum + temperature, 0) / HEAT_CELLS;
      frames.push(Object.freeze({ simulatedSeconds: t,
        temperaturesK: Object.freeze([...cells]), meanTemperatureK: mean,
        maximumTemperatureK: Math.max(...cells) }));
      if (i < steps) {
        const dx = input.lengthMeters / HEAT_CELLS;
        const r = input.thermalDiffusivityM2PerS * actualH / (dx * dx);
        // Conservation form: every interior flux has equal/opposite effects.
        const fluxes = cells.slice(0, -1).map((current, j) => r * (cells[j + 1] - current));
        cells = cells.map((current, j) => current +
          (j < fluxes.length ? fluxes[j] : 0) - (j > 0 ? fluxes[j - 1] : 0));
      }
    } else {
      const tau = input.resistanceOhm * input.capacitanceF;
      const capacitorVoltageV = input.supplyVoltageV +
        (input.initialVoltageV - input.supplyVoltageV) * Math.exp(-t / tau);
      const currentA = (input.supplyVoltageV - capacitorVoltageV) / input.resistanceOhm;
      frames.push(Object.freeze({ simulatedSeconds: t, capacitorVoltageV, currentA,
        resistorHeatW: currentA * currentA * input.resistanceOhm,
        storedEnergyJ: input.capacitanceF * capacitorVoltageV * capacitorVoltageV / 2 }));
    }
  }
  return Object.freeze({
    format: "env-world-lab-run" as const,
    schemaVersion: 1 as const,
    id: options.id,
    parentRunId: options.parentRunId ?? null,
    modelId: input.kind,
    modelVersion: MODEL_VERSION,
    evidence: "physics-model-computed" as const,
    illustrativeGeometry: true as const,
    inputs: Object.freeze({ ...input }),
    time: Object.freeze({ simulatedDurationSeconds: duration, solverStepSeconds: actualH,
      worldDateUTC: new Date(options.worldDateUTC).toISOString() }),
    validity: input.kind === "damped-oscillator"
      ? "Linear 1D small-displacement spring, constant mass, constant viscous damping; RK4 numerical integration. No contacts or material failure."
      : input.kind === "heat-rod"
        ? "Insulated 1D heat diffusion with constant thermal diffusivity, 21 uniform finite-volume cells and stable explicit flux steps. This model does not predict external heating, conductivity or molecular detail."
        : "Ideal lumped-element DC series RC circuit, constant R and C, no parasitics or temperature dependence; analytic solution.",
    samples: Object.freeze(frames),
  });
}

/** Playback/seek only; does not recompute or modify recorded physics. */
export function sampleRun(run: LabRun, simulatedSeconds: number): ModelSample {
  bounded(simulatedSeconds, "Playback position (s)", 0, run.time.simulatedDurationSeconds);
  const index = Math.min(run.samples.length - 1,
    Math.round(simulatedSeconds / run.time.solverStepSeconds));
  return run.samples[index];
}

/** Decouples simulated time, solver dt and wall-clock playback rate. */
export function advancePlayback(seconds: number, elapsedWallSeconds: number,
  playbackRate: number, durationSeconds: number): number {
  bounded(elapsedWallSeconds, "Elapsed wall time (s)", 0, 60);
  bounded(playbackRate, "Playback rate", 0.01, 100);
  bounded(durationSeconds, "Duration (s)", 0.01, 30);
  bounded(seconds, "Playback position (s)", 0, durationSeconds);
  return Math.min(durationSeconds, seconds + elapsedWallSeconds * playbackRate);
}
