import assert from "node:assert/strict";
import test from "node:test";
import { createDampedOscillatorAdapter, WorldLabSimulationAdapterRegistry } from "./simulation-adapter.ts";
import type { DampedOscillator, SimulationContext } from "./simulation-adapter.ts";

const parameters: DampedOscillator = { kind:"damped-oscillator", massKg:1, springNPerM:4, dampingNsPerM:0.5, initialDisplacementM:0.5, initialVelocityMPerS:0 };
const context: SimulationContext = { projectId:"project-one", projectRevision:4, runId:"run-one", worldDateUTC:"2026-10-30T00:00:00.000Z", seed:12 };

test("oscillator adapter validates, initializes, advances and exposes computed readouts", () => {
  const adapter=createDampedOscillatorAdapter();
  assert.deepEqual(adapter.validate(parameters), []);
  let state=adapter.initialize(context,parameters);
  assert.equal(adapter.getOutputs(state).positionM,0.5);
  for(let i=0;i<100;i++) state=adapter.advance(state,{deltaSeconds:0.01,maximumInternalStepSeconds:0.002}).state;
  const output=adapter.getOutputs(state);
  assert.equal(output.simulatedSeconds,1);
  assert.ok(Number.isFinite(output.mechanicalEnergyJ)&&output.mechanicalEnergyJ>=0);
  assert.ok(state.stepIndex>=500);
  assert.deepEqual(adapter.diagnostics(state).map(x=>x.severity),["info"]);
});

test("same inputs and seed produce deterministic states", () => {
  const adapter=createDampedOscillatorAdapter();
  const run=()=>{let state=adapter.initialize(context,parameters);for(let i=0;i<25;i++)state=adapter.advance(state,{deltaSeconds:0.04,maximumInternalStepSeconds:0.005}).state;return adapter.getOutputs(state);};
  assert.deepEqual(run(),run());
});

test("checkpoint and restore reproduce the same subsequent integration", () => {
  const adapter=createDampedOscillatorAdapter();
  let state=adapter.initialize(context,parameters);
  for(let i=0;i<20;i++)state=adapter.advance(state,{deltaSeconds:0.025,maximumInternalStepSeconds:0.005}).state;
  const restored=adapter.restore(JSON.parse(JSON.stringify(adapter.checkpoint(state))));
  const nextA=adapter.advance(state,{deltaSeconds:0.03,maximumInternalStepSeconds:0.005}).state;
  const nextB=adapter.advance(restored,{deltaSeconds:0.03,maximumInternalStepSeconds:0.005}).state;
  assert.deepEqual(nextA,nextB);
});

test("bounded forcing changes computed motion", () => {
  const adapter=createDampedOscillatorAdapter();
  const state=adapter.initialize(context,{...parameters,initialDisplacementM:0,initialVelocityMPerS:0});
  const result=adapter.advance(state,{deltaSeconds:0.01,maximumInternalStepSeconds:0.001},{externalForceN:10});
  assert.ok(result.state.velocityMPerS>0);
  assert.equal(result.nextEventSeconds,null);
  assert.equal(result.events.length,0);
});

test("invalid parameters, context, step, force and checkpoint are rejected", () => {
  const adapter=createDampedOscillatorAdapter();
  assert.equal(adapter.validate({...parameters,massKg:Number.NaN}).length,1);
  assert.throws(()=>adapter.initialize({...context,seed:-1},parameters),/context/);
  const state=adapter.initialize(context,parameters);
  assert.throws(()=>adapter.advance(state,{deltaSeconds:0,maximumInternalStepSeconds:0.01}),/bounded step/);
  assert.throws(()=>adapter.advance(state,{deltaSeconds:0.01,maximumInternalStepSeconds:0.1}),/internal solver step/);
  assert.throws(()=>adapter.restore({format:"env-world-lab-checkpoint",schemaVersion:1,modelId:"damped-oscillator",modelVersion:"2.0.0"}),/unsupported/);
  assert.throws(()=>adapter.advance(state,{deltaSeconds:0.01,maximumInternalStepSeconds:0.001},{externalForceN:Infinity}),/force/);
});

test("registry rejects duplicate versions and unavailable models", () => {
  const registry=new WorldLabSimulationAdapterRegistry();
  const adapter=createDampedOscillatorAdapter();
  registry.register(adapter);
  assert.deepEqual(registry.list(),[{id:"damped-oscillator",version:"1.0.0"}]);
  assert.throws(()=>registry.register(adapter),/unique/);
  assert.equal(registry.get("damped-oscillator","1.0.0").id,"damped-oscillator");
  assert.throws(()=>registry.get("untrusted","1.0.0"),/not installed/);
  adapter.dispose();
});