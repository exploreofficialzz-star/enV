import {
  runActuatorExperiment, sampleActuator,
  type ActuatorRun, type ActuatorSample,
} from "./electromechanical.ts";

/**
 * A numerical self-consistency check, NOT validation against measurements.
 * The same assumed 1D electromechanical model is solved with a halved step.
 * Each result is compared at the original physical sample times.
 *
 * This check cannot establish physical accuracy, material properties,
 * device safety or model validity. A failed or unavailable check is never
 * silently represented as a pass.
 */
export type ActuatorNumericalAudit = Readonly<{
  status: "within-internal-tolerance" | "outside-internal-tolerance" | "unavailable";
  inspectedSamples: number;
  coarseStepSeconds: number;
  refinedStepSeconds: number | null;
  maximumHeightDifferenceM: number | null;
  maximumCurrentDifferenceA: number | null;
  maximumRelativeStateDifference: number | null;
  maximumEnergyResidualFraction: number | null;
  stateTolerance: 0.01;
  energyTolerance: 0.02;
  explanation: string;
}>;

const STATE_TOLERANCE = 0.01 as const;
const ENERGY_TOLERANCE = 0.02 as const;

function immutableAudit(value: ActuatorNumericalAudit): ActuatorNumericalAudit {
  return Object.freeze(value);
}

function energyResidualFraction(sample: ActuatorSample, initialEnergyJ: number): number {
  // Compare the first-law residual with all available energy transfers,
  // including nonzero initial gravitational energy, not just source work.
  const kinetic = sample.kineticEnergyJ;
  const potential = sample.gravitationalEnergyJ;
  const magnetic = sample.magneticEnergyJ;
  const supply = sample.suppliedEnergyJ;
  const dissipation = sample.dissipatedEnergyJ;
  const residual = sample.energyResidualJ;
  if (![kinetic, potential, magnetic, supply, dissipation, residual]
    .every(Number.isFinite)) {
    throw new Error("The actuator numerical audit found a non-finite energy value.");
  }
  const scale = Math.max(1, Math.abs(initialEnergyJ) + Math.abs(supply),
    Math.abs(kinetic) + Math.abs(potential) + Math.abs(magnetic) +
      Math.abs(dissipation));
  return Math.abs(residual) / scale;
}

export function verifyActuatorNumerics(run: ActuatorRun): ActuatorNumericalAudit {
  if (run?.format !== "env-world-lab-actuator-run" ||
      run.modelVersion !== "1.0.0" ||
      !Array.isArray(run.samples) || run.samples.length < 2 ||
      !(Number.isFinite(run.solverStepSeconds) && run.solverStepSeconds > 0)) {
    throw new Error("A completed, versioned actuator calculation is required.");
  }
  const initial = run.samples[0];
  const initialEnergyJ = initial.kineticEnergyJ +
    initial.gravitationalEnergyJ + initial.magneticEnergyJ;
  let maximumEnergyResidualFraction = 0;
  for (const point of run.samples) {
    maximumEnergyResidualFraction = Math.max(maximumEnergyResidualFraction,
      energyResidualFraction(point, initialEnergyJ));
  }

  const halfStep = run.solverStepSeconds / 2;
  if (halfStep < 0.0001) {
    return immutableAudit({
      status: "unavailable", inspectedSamples: run.samples.length,
      coarseStepSeconds: run.solverStepSeconds, refinedStepSeconds: null,
      maximumHeightDifferenceM: null, maximumCurrentDifferenceA: null,
      maximumRelativeStateDifference: null,
      maximumEnergyResidualFraction, stateTolerance: STATE_TOLERANCE,
      energyTolerance: ENERGY_TOLERANCE,
      explanation: "Half-step comparison exceeds the supported local solver resolution. " +
        "The energy residual is reported, but time-step convergence is unverified.",
    });
  }

  let refined: ActuatorRun;
  try {
    refined = runActuatorExperiment(run.input, run.source, halfStep);
  } catch {
    // A model requiring too many substeps needs a different solver. Never
    // turn a resource-limit or stability rejection into a green audit.
    return immutableAudit({
      status: "unavailable", inspectedSamples: run.samples.length,
      coarseStepSeconds: run.solverStepSeconds, refinedStepSeconds: null,
      maximumHeightDifferenceM: null, maximumCurrentDifferenceA: null,
      maximumRelativeStateDifference: null,
      maximumEnergyResidualFraction, stateTolerance: STATE_TOLERANCE,
      energyTolerance: ENERGY_TOLERANCE,
      explanation: "The halved-step run did not complete within solver bounds. " +
        "A converged result cannot be established using this local method.",
    });
  }

  let maximumHeightDifferenceM = 0;
  let maximumCurrentDifferenceA = 0;
  let maximumRelativeStateDifference = 0;
  for (const coarse of run.samples) {
    const fine = sampleActuator(refined,
      Math.min(run.input.durationSeconds, coarse.timeSeconds));
    const heightDifference = Math.abs(coarse.heightM - fine.heightM);
    const currentDifference = Math.abs(coarse.coilCurrentA - fine.coilCurrentA);
    const relativeHeight = heightDifference /
      Math.max(1, Math.abs(coarse.heightM), Math.abs(fine.heightM));
    const relativeCurrent = currentDifference /
      Math.max(1, Math.abs(coarse.coilCurrentA), Math.abs(fine.coilCurrentA));
    if (![heightDifference, currentDifference, relativeHeight, relativeCurrent]
      .every(Number.isFinite)) {
      throw new Error("The halved-step model produced a non-finite comparison.");
    }
    maximumHeightDifferenceM = Math.max(maximumHeightDifferenceM, heightDifference);
    maximumCurrentDifferenceA = Math.max(maximumCurrentDifferenceA, currentDifference);
    maximumRelativeStateDifference = Math.max(maximumRelativeStateDifference,
      relativeHeight, relativeCurrent);
  }

  const within = maximumRelativeStateDifference <= STATE_TOLERANCE &&
    maximumEnergyResidualFraction <= ENERGY_TOLERANCE;
  return immutableAudit({
    status: within ? "within-internal-tolerance" : "outside-internal-tolerance",
    inspectedSamples: run.samples.length,
    coarseStepSeconds: run.solverStepSeconds,
    refinedStepSeconds: refined.solverStepSeconds,
    maximumHeightDifferenceM, maximumCurrentDifferenceA,
    maximumRelativeStateDifference, maximumEnergyResidualFraction,
    stateTolerance: STATE_TOLERANCE, energyTolerance: ENERGY_TOLERANCE,
    explanation: within
      ? "The recorded 1D trajectory is internally consistent under step halving " +
        "and its energy residual is within the declared thresholds. This does not " +
        "validate assumed device or material properties."
      : "One or more numerical self-check thresholds were exceeded. Treat " +
        "the trajectory as uncertain and do not rely on it for engineering decisions.",
  });
}
