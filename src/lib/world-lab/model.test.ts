import test from "node:test";
import assert from "node:assert/strict";
import {
  advancePlayback, runExperiment, sampleRun, validateModel, validateNovelMaterial,
  type DampedOscillator, type RCCircuit,
} from "./model.ts";

const oscillator: DampedOscillator = {
  kind: "damped-oscillator", massKg: 1, springNPerM: 4, dampingNsPerM: 0,
  initialDisplacementM: 0.5, initialVelocityMPerS: 0,
};
const rc: RCCircuit = {
  kind: "rc-circuit", resistanceOhm: 1000, capacitanceF: 0.001,
  supplyVoltageV: 10, initialVoltageV: 0,
};
const run = (input: DampedOscillator | RCCircuit) =>
  runExperiment(input, { id: "test-reference", worldDateUTC: "2026-10-30T00:00:00Z" });

test("mass-spring period and energy agree with analytic undamped solution", () => {
  const result = run(oscillator);
  const atOne = sampleRun(result, 1);
  assert.ok(Math.abs((atOne.positionM ?? 0) - 0.5 * Math.cos(2)) < 1e-8);
  assert.ok(Math.abs((atOne.velocityMPerS ?? 0) + Math.sin(2)) < 1e-8);
  for (const item of result.samples) {
    assert.ok(Math.abs((item.mechanicalEnergyJ ?? 0) - 0.5) < 1e-7);
  }
});
test("damping dissipates mechanical energy, never produces it", () => {
  const result = run({ ...oscillator, dampingNsPerM: 0.5 });
  let last = Infinity;
  for (const sample of result.samples) {
    assert.ok((sample.mechanicalEnergyJ ?? Infinity) <= last + 1e-10);
    last = sample.mechanicalEnergyJ ?? Infinity;
  }
});
test("RC charge uses an analytic time constant and dissipates nonnegative heat", () => {
  const result = run(rc);
  const atTau = sampleRun(result, 1);
  assert.ok(Math.abs((atTau.capacitorVoltageV ?? 0) - 10 * (1 - Math.exp(-1))) < 1e-12);
  assert.ok(Math.abs((result.samples[0].currentA ?? 0) - 0.01) < 1e-12);
  assert.ok(result.samples.every(item => (item.resistorHeatW ?? -1) >= 0));
});
test("invalid numerical/scientific inputs fail closed", () => {
  assert.throws(() => validateModel({ ...oscillator, massKg: -1 }));
  assert.throws(() => validateModel({ ...rc, capacitanceF: Number.NaN }));
  assert.throws(() => runExperiment(rc, {
    id: "x", worldDateUTC: "invalid-date",
  }));
  assert.throws(() => runExperiment(rc, {
    id: "x", worldDateUTC: "2026-10-30T00:00:00Z", solverStepSeconds: 0.0001, durationSeconds: 30,
  }), /budget/);
});
test("playback rate does not change the immutable solver trajectory", () => {
  const result = run(oscillator);
  const original = sampleRun(result, 2);
  const slower = advancePlayback(1, 1, 0.1, 12);
  const faster = advancePlayback(1, 1, 10, 12);
  assert.equal(slower, 1.1);
  assert.equal(faster, 11);
  assert.deepEqual(sampleRun(result, 2), original);
  assert.equal(result.samples.length, 2881);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.samples));
});
test("changed parameters form a separate branch with provenance", () => {
  const first = run(oscillator);
  const second = runExperiment({ ...oscillator, springNPerM: 9 }, {
    id: "run-two", parentRunId: first.id, worldDateUTC: "2026-10-30T00:00:00Z",
  });
  assert.equal(second.parentRunId, first.id);
  if (first.inputs.kind !== "damped-oscillator") throw new Error("Unexpected model kind");
  assert.equal(first.inputs.springNPerM, 4);
  assert.notEqual(sampleRun(first, 1).positionM, sampleRun(second, 1).positionM);
  assert.equal(second.evidence, "physics-model-computed");
  assert.equal(second.illustrativeGeometry, true);
});
test("unknown novel-material properties stay unknown instead of made-up values", () => {
  const material = validateNovelMaterial({
    name: "New micro-lattice", densityKgM3: null, youngModulusPa: null,
    provenance: "hypothetical-user-assumed",
  });
  assert.equal(material.densityKgM3, null);
  assert.equal(material.youngModulusPa, null);
  assert.throws(() => validateNovelMaterial({ ...material, densityKgM3: -1 }));
});

test("stiff numerical systems are safely substepped or rejected", () => {
  const integrated = runExperiment({ ...oscillator, springNPerM: 900 }, {
    id: "stiff-valid", worldDateUTC: "2026-10-30T00:00:00Z", durationSeconds: 1,
  });
  assert.ok(integrated.time.solverStepSeconds < 1 / 240);
  assert.ok(integrated.samples.every(sample => Number.isFinite(sample.mechanicalEnergyJ)));
  assert.throws(() => runExperiment({
    ...oscillator, massKg: 0.001, springNPerM: 1000000,
  }, { id: "stiff-over-budget", worldDateUTC: "2026-10-30T00:00:00Z" }), /specialized solver/);
});

test("insulated heat rod conserves summed temperature, smooths gradients and stays nonnegative", () => {
  const rod = {
    kind: "heat-rod" as const,
    thermalDiffusivityM2PerS: 0.02, lengthMeters: 2,
    ambientTemperatureK: 293.15, centerTemperatureK: 373.15,
  };
  const result = runExperiment(rod, {
    id: "heat-test", worldDateUTC: "2026-10-30T00:00:00Z", durationSeconds: 2,
  });
  const first = result.samples[0];
  const last = result.samples[result.samples.length - 1];
  assert.equal(first.temperaturesK?.length, 21);
  assert.ok(Math.abs((first.meanTemperatureK ?? 0) - (last.meanTemperatureK ?? 1)) < 1e-9);
  assert.ok((last.maximumTemperatureK ?? Infinity) < (first.maximumTemperatureK ?? 0));
  assert.ok(result.samples.every(sample => sample.temperaturesK?.every(t => Number.isFinite(t) && t >= 0)));
});
test("heat solver adapts timestep or rejects over-budget stiff diffusion", () => {
  const rod = {
    kind: "heat-rod" as const, thermalDiffusivityM2PerS: 0.5,
    lengthMeters: 0.5, ambientTemperatureK: 293.15, centerTemperatureK: 400,
  };
  const result = runExperiment(rod, {
    id: "heat-finite", worldDateUTC: "2026-10-30T00:00:00Z", durationSeconds: 0.5,
  });
  assert.ok(result.time.solverStepSeconds < 1/240);
  assert.throws(() => runExperiment({...rod, thermalDiffusivityM2PerS: 100}, {
    id: "heat-too-stiff", worldDateUTC: "2026-10-30T00:00:00Z",
  }), /specialized solver/);
});
