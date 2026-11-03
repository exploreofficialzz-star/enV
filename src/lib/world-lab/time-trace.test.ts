import test from "node:test";
import assert from "node:assert/strict";
import { runExperiment } from "./model.ts";
import { buildScientificTimeTrace } from "./time-trace.ts";
const when="2026-10-30T15:00:00Z";
test("oscillator trace presents negative and positive displacement with bounded geometry",()=>{
  const run=runExperiment({kind:"damped-oscillator",massKg:1,springNPerM:4,
    dampingNsPerM:0,initialDisplacementM:1,initialVelocityMPerS:0},{
    id:"osc-trace",worldDateUTC:when,
  });
  const chart=buildScientificTimeTrace(run);
  assert.equal(chart.metric,"positionM");
  assert.ok(chart.minimum < -0.99);
  assert.ok(chart.maximum > 0.99);
  assert.ok(chart.samplesPlotted<=301);
  assert.ok(chart.points.split(" ").every(point=>{
    const [x,y]=point.split(",").map(Number);
    return Number.isFinite(x)&&Number.isFinite(y)&&
      x>=chart.x0&&x<=chart.x1&&y>=chart.y0&&y<=chart.y1;
  }));
  assert.equal(Number(chart.points.split(" ")[0].split(",")[0]),chart.x0);
  assert.equal(Number(chart.points.split(" ").at(-1)?.split(",")[0]),chart.x1);
});
test("constant analytic RC trace does not divide by zero or invent variation",()=>{
  const run=runExperiment({kind:"rc-circuit",resistanceOhm:1000,
    capacitanceF:0.001,supplyVoltageV:2,initialVoltageV:2},{
    id:"flat",worldDateUTC:when,
  });
  const trace=buildScientificTimeTrace(run);
  assert.equal(trace.minimum,2);
  assert.equal(trace.maximum,2);
  assert.ok(trace.points.length>0);
  assert.ok(!trace.points.includes("NaN"));
  assert.equal(trace.metric,"capacitorVoltageV");
});
test("heat trace measures actual hottest cell temperatures",()=>{
  const run=runExperiment({kind:"heat-rod",thermalDiffusivityM2PerS:0.01,
    lengthMeters:1,ambientTemperatureK:293,centerTemperatureK:353},{
    id:"heat",worldDateUTC:when,durationSeconds:1,
  });
  const trace=buildScientificTimeTrace(run);
  assert.equal(trace.metric,"maximumTemperatureK");
  assert.equal(trace.maximum,353);
  assert.ok(trace.minimum>=293);
});
