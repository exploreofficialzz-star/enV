import test from "node:test";
import assert from "node:assert/strict";
import { blankWorldLabProject, newSolid } from "./project.ts";
import {
  deriveActuatorInput, runActuatorExperiment,
  type ActuatorRun,
} from "./electromechanical.ts";
import { verifyActuatorNumerics } from "./actuator-verification.ts";

const project = () => {
  const p = blankWorldLabProject("lab-audit", "2026-10-30T00:00:00Z");
  const solid = newSolid("cube", "box", 0);
  solid.materialId = "hypothetical";
  p.materials.push({
    id: "hypothetical", name: "User-assumed substance",
    densityKgM3: 1, youngModulusPa: null,
    evidence: "hypothetical-user-assumed",
  });
  p.entities.push(solid);
  return p;
};

test("zero-power grounded system has zero energy residual and passes step-halving check", () => {
  const d = deriveActuatorInput(project(), "cube", { supplyVoltageV: 0 });
  const run = runActuatorExperiment(d.input, d.source);
  const audit = verifyActuatorNumerics(run);
  assert.equal(audit.status, "within-internal-tolerance");
  assert.equal(audit.maximumEnergyResidualFraction, 0);
  assert.equal(audit.maximumHeightDifferenceM, 0);
  assert.equal(audit.maximumCurrentDifferenceA, 0);
  assert.ok((audit.refinedStepSeconds ?? Infinity) < audit.coarseStepSeconds);
  assert.ok(Object.isFrozen(audit));
});

test("powered inventor's actuator receives deterministic, finite numerical diagnostics", () => {
  const d = deriveActuatorInput(project(), "cube", {
    supplyVoltageV: 24, forceConstantNPerA: 8,
  });
  const run = runActuatorExperiment(d.input, d.source);
  const one = verifyActuatorNumerics(run);
  const two = verifyActuatorNumerics(run);
  assert.deepEqual(one, two);
  assert.notEqual(one.status, "unavailable");
  assert.ok(one.inspectedSamples > 100);
  assert.ok(Number.isFinite(one.maximumEnergyResidualFraction));
  assert.ok(Number.isFinite(one.maximumRelativeStateDifference));
  assert.match(one.explanation, /(?:trajectory|threshold)/i);
});

test("a falsified first-law residual is flagged instead of certified", () => {
  const d = deriveActuatorInput(project(), "cube", { supplyVoltageV: 0 });
  const run = runActuatorExperiment(d.input, d.source);
  const fake = {
    ...run,
    samples: run.samples.map((s, index) => index === 1
      ? { ...s, energyResidualJ: 100 } : s),
  } as ActuatorRun;
  const audit = verifyActuatorNumerics(fake);
  assert.equal(audit.status, "outside-internal-tolerance");
  assert.ok((audit.maximumEnergyResidualFraction ?? 0) > audit.energyTolerance);
});

test("invalid and non-finite recorded evidence is rejected", () => {
  assert.throws(() => verifyActuatorNumerics({} as ActuatorRun), /versioned/);
  const d = deriveActuatorInput(project(), "cube");
  const run = runActuatorExperiment(d.input, d.source);
  const corrupt = { ...run, samples: [
    { ...run.samples[0], energyResidualJ: Number.NaN }, ...run.samples.slice(1),
  ] } as ActuatorRun;
  assert.throws(() => verifyActuatorNumerics(corrupt), /non-finite/);
});

test("unsupported refinement is explicitly unavailable, never a green check", () => {
  const d = deriveActuatorInput(project(), "cube");
  const run = runActuatorExperiment(d.input, d.source);
  const tooSmallStep = { ...run, solverStepSeconds: 0.00015 } as ActuatorRun;
  const audit = verifyActuatorNumerics(tooSmallStep);
  assert.equal(audit.status, "unavailable");
  assert.equal(audit.refinedStepSeconds, null);
  assert.equal(audit.maximumRelativeStateDifference, null);
});
