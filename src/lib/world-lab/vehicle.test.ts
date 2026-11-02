import assert from "node:assert/strict";
import test from "node:test";
import { inspectVehiclePreflight, runWorldLabVehicle, sampleWorldLabVehicle, type VehicleInput } from "./vehicle.ts";

const base:VehicleInput={
  mode:"road-only",massKg:1200,frontalAreaM2:2.2,dragCoefficient:0.32,airDensityKgM3:1.225,rollingResistanceCoefficient:0.012,tireFrictionCoefficient:0.9,
  maximumWheelDriveForceN:6500,motorMaximumPowerW:180000,motorEfficiency:0.9,motorForceConstantNPerA:40,motorWindingResistanceOhm:0.08,motorMaximumCurrentA:220,
  batteryVoltageV:400,batteryInternalResistanceOhm:0.04,batteryMaximumCurrentA:500,batteryCapacityWh:60000,initialStateOfCharge:1,batteryHeatCapacityJPerK:180000,batteryCoolingWPerK:35,maximumBatteryTemperatureK:370,
  motorHeatCapacityJPerK:45000,motorCoolingWPerK:80,maximumMotorTemperatureK:420,ambientTemperatureK:293.15,initialMotorTemperatureK:293.15,initialBatteryTemperatureK:293.15,
  rotorDiskAreaM2:null,rotorMaximumThrustN:null,rotorThrottle:0,rotorEfficiency:0.8,wingAreaM2:null,wingLiftCoefficient:null,takeoffSpeedMps:null,maximumCruiseThrustN:0,cruisePropulsiveEfficiency:0.78,
  driveThrottle:0.8,maximumSpeedMps:80,maximumStructuralLoadFactor:3,durationSeconds:10,solverStepSeconds:0.02,motorFailureAtSeconds:null,
};
const context={id:"vehicle-project",revision:3};

test("road vehicle computes powered longitudinal acceleration, drag, traction and battery discharge",()=>{
  const run=runWorldLabVehicle(context,"road-run-1",base);
  assert.equal(run.outcome,"ground-run");
  assert.ok(run.samples.at(-1)!.horizontalSpeedMps>0);
  assert.ok(run.samples.at(-1)!.distanceMeters>0);
  assert.ok(run.samples.at(-1)!.batteryStateOfCharge<1);
  assert.ok(run.samples.some(s=>s.normalForceN>0&&s.wheelDriveForceN>0));
  assert.ok(run.samples.every(s=>Number.isFinite(s.batteryTerminalVoltageV)&&s.batteryTerminalVoltageV>0));
});

test("road tire force never exceeds the user-assumed friction limit",()=>{
  const run=runWorldLabVehicle(context,"road-traction",base);
  for(const sample of run.samples) assert.ok(sample.wheelDriveForceN<=base.tireFrictionCoefficient*sample.normalForceN+1e-6);
});

test("motor dropout is recorded at the configured time and disables wheel drive",()=>{
  const run=runWorldLabVehicle(context,"motor-failure",{...base,motorFailureAtSeconds:2});
  const event=run.events.find(e=>e.kind==="motor-dropout");
  assert.ok(event);
  assert.ok(event.timeSeconds>=2&&event.timeSeconds<2.1);
  assert.equal(sampleWorldLabVehicle(run,4).wheelDriveForceN,0);
});

test("rotorcraft lift is computed from assumed disk area and can reach a bounded airborne state",()=>{
  const input:VehicleInput={...base,mode:"rotorcraft",massKg:600,maximumWheelDriveForceN:10,motorMaximumPowerW:1200000,
    batteryVoltageV:800,batteryMaximumCurrentA:1500,batteryInternalResistanceOhm:0.01,batteryCapacityWh:200000,
    rotorDiskAreaM2:15,rotorMaximumThrustN:10000,rotorThrottle:0.9,maximumCruiseThrustN:1800,driveThrottle:0,
    durationSeconds:2,maximumStructuralLoadFactor:4};
  const run=runWorldLabVehicle(context,"rotorcraft-lift",input);
  assert.ok(run.samples.some(s=>s.airborne));
  assert.ok(run.samples.some(s=>s.rotorThrustN>600*9.80665));
  assert.ok(run.events.some(e=>e.kind==="takeoff"));
});

test("fixed-wing takeoff is blocked when modeled wing lift at takeoff speed is below weight",()=>{
  const input:VehicleInput={...base,mode:"fixed-wing",wingAreaM2:2,wingLiftCoefficient:1,takeoffSpeedMps:25,maximumCruiseThrustN:2500};
  const preflight=inspectVehiclePreflight(input);
  assert.ok(preflight.diagnostics.some(d=>d.code==="WING_LIFT_BELOW_WEIGHT"&&d.severity==="blocker"));
  const run=runWorldLabVehicle(context,"wing-no-lift",{...input,durationSeconds:12});
  assert.equal(run.outcome,"unable-to-takeoff");
  assert.ok(run.failureReasons.some(s=>s.includes("did not reach")));
});

test("fixed-wing takeoff uses computed dynamic pressure and can become airborne",()=>{
  // Match the declared takeoff speed to the computed lift-equals-weight boundary;
  // otherwise ground contact force falls to zero before the configured speed is reached.
  const input:VehicleInput={...base,mode:"fixed-wing",massKg:1200,wingAreaM2:24,wingLiftCoefficient:1.4,
    takeoffSpeedMps:Math.sqrt((2*1200*9.80665)/(1.225*24*1.4)),maximumCruiseThrustN:4000,
    maximumWheelDriveForceN:10000,motorMaximumPowerW:350000,batteryMaximumCurrentA:700,durationSeconds:60,maximumSpeedMps:100};
  const run=runWorldLabVehicle(context,"wing-takeoff",input);
  assert.ok(run.preflight.wingLiftAtTakeoffN!>run.preflight.weightN);
  assert.ok(run.samples.some(s=>s.airborne));
});

test("invalid project revisions, non-finite values, and unsupported flight inputs fail closed",()=>{
  assert.throws(()=>runWorldLabVehicle({...context,revision:-1},"bad-run",base),/project ID/);
  assert.throws(()=>runWorldLabVehicle(context,"bad-run",{...base,massKg:Number.NaN}),/Vehicle mass/);
  assert.throws(()=>runWorldLabVehicle(context,"bad-run",{...base,mode:"rotorcraft",rotorDiskAreaM2:null,rotorMaximumThrustN:null}),/rotor disk area/);
  assert.throws(()=>runWorldLabVehicle(context,"bad-run",{...base,solverStepSeconds:0.001,durationSeconds:120}),/12,000-step/);
});

test("vehicle result carries immutable project revision, assumptions and named limitations",()=>{
  const run=runWorldLabVehicle(context,"revisioned-run",base);
  assert.equal(run.projectRevision,3);
  assert.equal(run.evidence,"physics-model-computed");
  assert.match(run.validity,/does not model suspension/);
  assert.equal(run.samples.length,501);
});