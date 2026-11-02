/**
 * Bounded inventor-driven longitudinal road/flight reference model.
 * The model is not a full 6-DOF vehicle, CFD, rotor blade-element, suspension,
 * structural FEM or flightworthiness solver. All vehicle/material/battery
 * specifications are user assumptions; no capability is certified.
 */
export type VehicleFlightMode = "road-only" | "rotorcraft" | "fixed-wing";
export type VehicleDiagnostic = Readonly<{severity:"blocker"|"warning"|"info";code:string;message:string}>;
export type VehicleInput = Readonly<{
  mode:VehicleFlightMode; massKg:number; frontalAreaM2:number; dragCoefficient:number;
  airDensityKgM3:number; rollingResistanceCoefficient:number; tireFrictionCoefficient:number;
  maximumWheelDriveForceN:number; motorMaximumPowerW:number; motorEfficiency:number;
  motorForceConstantNPerA:number; motorWindingResistanceOhm:number; motorMaximumCurrentA:number;
  batteryVoltageV:number; batteryInternalResistanceOhm:number; batteryMaximumCurrentA:number;
  batteryCapacityWh:number; initialStateOfCharge:number; batteryHeatCapacityJPerK:number;
  batteryCoolingWPerK:number; maximumBatteryTemperatureK:number;
  motorHeatCapacityJPerK:number; motorCoolingWPerK:number; maximumMotorTemperatureK:number;
  ambientTemperatureK:number; initialMotorTemperatureK:number; initialBatteryTemperatureK:number;
  rotorDiskAreaM2:number|null; rotorMaximumThrustN:number|null; rotorThrottle:number; rotorEfficiency:number;
  wingAreaM2:number|null; wingLiftCoefficient:number|null; takeoffSpeedMps:number|null;
  maximumCruiseThrustN:number; cruisePropulsiveEfficiency:number;
  driveThrottle:number; maximumSpeedMps:number; maximumStructuralLoadFactor:number;
  durationSeconds:number; solverStepSeconds:number; motorFailureAtSeconds:number|null;
}>;
export type VehicleSample = Readonly<{
  timeSeconds:number; distanceMeters:number; altitudeMeters:number; horizontalSpeedMps:number; verticalSpeedMps:number;
  wheelDriveForceN:number; cruiseThrustN:number; rotorThrustN:number; wingLiftN:number; aerodynamicDragN:number;
  normalForceN:number; structuralLoadFactor:number; batteryCurrentA:number; batteryTerminalVoltageV:number;
  batteryPowerW:number; batteryStateOfCharge:number; batteryTemperatureK:number; motorTemperatureK:number;
  motorAvailable:boolean; airborne:boolean; powerLimited:boolean; electricalEnergyUsedWh:number;
}>;
export type VehicleEvent = Readonly<{timeSeconds:number;kind:"takeoff"|"touchdown"|"motor-dropout"|"power-limit"|"thermal-limit"|"structural-limit"|"battery-depleted";message:string}>;
export type VehiclePreflight = Readonly<{diagnostics:readonly VehicleDiagnostic[];weightN:number;maximumBatteryPowerW:number;requiredHoverPowerW:number|null;wingLiftAtTakeoffN:number|null;flightModeSupported:boolean}>;
export type VehicleRun = Readonly<{
  format:"env-world-lab-vehicle-run";schemaVersion:1;modelVersion:"1.0.0";evidence:"physics-model-computed";
  projectId:string;projectRevision:number;runId:string;input:VehicleInput;validity:string;
  preflight:VehiclePreflight;samples:readonly VehicleSample[];events:readonly VehicleEvent[];
  outcome:"ground-run"|"airborne"|"unable-to-takeoff"|"failed";failureReasons:readonly string[];
}>;
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const bounded=(v:number,label:string,min:number,max:number)=>{if(!Number.isFinite(v)||v<min||v>max)throw new Error(label+" must be finite and between "+min+" and "+max+".");};
const idPattern=/^[A-Za-z0-9_-]{1,120}$/;
const GRAVITY_MPS2=9.80665;
const MAX_STEPS=12000;

export function validateVehicleInput(i:VehicleInput):VehicleInput {
  if(!i||typeof i!=="object"||!["road-only","rotorcraft","fixed-wing"].includes(i.mode))throw new Error("Choose a supported vehicle experiment mode.");
  const limits:ReadonlyArray<readonly [keyof VehicleInput,string,number,number]> = [
    ["massKg","Vehicle mass (kg)",100,30000],["frontalAreaM2","Frontal area (m²)",0.2,50],["dragCoefficient","Drag coefficient",0.05,2.5],
    ["airDensityKgM3","Assumed air density (kg/m³)",0.2,2],["rollingResistanceCoefficient","Rolling resistance coefficient",0.001,0.2],
    ["tireFrictionCoefficient","Assumed tire friction coefficient",0.05,2.5],["maximumWheelDriveForceN","Maximum wheel drive force (N)",10,500000],
    ["motorMaximumPowerW","Motor maximum power (W)",100,50000000],["motorEfficiency","Motor efficiency",0.2,0.99],
    ["motorForceConstantNPerA","Motor force constant (N/A)",0.01,10000],["motorWindingResistanceOhm","Motor winding resistance (Ω)",0.0001,100],
    ["motorMaximumCurrentA","Motor current limit (A)",0.1,10000],["batteryVoltageV","Battery voltage (V)",12,2000],
    ["batteryInternalResistanceOhm","Battery internal resistance (Ω)",0,10],["batteryMaximumCurrentA","Battery current limit (A)",0.1,20000],
    ["batteryCapacityWh","Battery capacity (Wh)",10,100000000],["initialStateOfCharge","Initial battery charge",0.01,1],
    ["batteryHeatCapacityJPerK","Battery heat capacity (J/K)",10,100000000],["batteryCoolingWPerK","Battery cooling (W/K)",0,100000],
    ["maximumBatteryTemperatureK","Battery maximum temperature (K)",250,600],["motorHeatCapacityJPerK","Motor heat capacity (J/K)",10,100000000],
    ["motorCoolingWPerK","Motor cooling (W/K)",0,100000],["maximumMotorTemperatureK","Motor maximum temperature (K)",250,800],
    ["ambientTemperatureK","Ambient temperature (K)",180,360],["initialMotorTemperatureK","Initial motor temperature (K)",180,800],
    ["initialBatteryTemperatureK","Initial battery temperature (K)",180,600],["rotorThrottle","Rotor throttle",0,1],
    ["rotorEfficiency","Rotor induced-power efficiency",0.2,0.95],["maximumCruiseThrustN","Maximum cruise thrust (N)",0,500000],
    ["cruisePropulsiveEfficiency","Cruise propulsion efficiency",0.2,0.95],["driveThrottle","Drive throttle",0,1],
    ["maximumSpeedMps","Maximum speed (m/s)",1,300],["maximumStructuralLoadFactor","Assumed structural load limit (g)",1,20],
    ["durationSeconds","Simulation duration (s)",0.1,120],["solverStepSeconds","Solver step (s)",0.001,0.05],
  ];
  for(const [key,label,min,max] of limits) bounded(i[key] as number,label,min,max);
  if(Math.ceil(i.durationSeconds/i.solverStepSeconds)>MAX_STEPS)throw new Error("Vehicle experiment exceeds its 12,000-step local computation budget.");
  for(const [key,label,min,max] of [["rotorDiskAreaM2","Rotor disk area (m²)",0.05,500],["rotorMaximumThrustN","Rotor maximum thrust (N)",10,1000000],["wingAreaM2","Wing area (m²)",0.5,500],["wingLiftCoefficient","Wing lift coefficient",0.05,3],["takeoffSpeedMps","Takeoff speed (m/s)",5,150]] as const){
    const value=i[key];if(value!==null)bounded(value,label,min,max);
  }
  if(i.motorFailureAtSeconds!==null)bounded(i.motorFailureAtSeconds,"Motor failure time (s)",0,i.durationSeconds);
  if(i.mode==="rotorcraft"&&(i.rotorDiskAreaM2===null||i.rotorMaximumThrustN===null))throw new Error("Rotorcraft mode requires an assumed total rotor disk area and maximum thrust.");
  if(i.mode==="fixed-wing"&&(i.wingAreaM2===null||i.wingLiftCoefficient===null||i.takeoffSpeedMps===null))throw new Error("Fixed-wing mode requires an assumed wing area, lift coefficient and takeoff speed.");
  if(i.mode!=="road-only"&&i.maximumCruiseThrustN<=0)throw new Error("A flying vehicle needs an assumed horizontal cruise-propulsion thrust.");
  if(i.initialMotorTemperatureK>=i.maximumMotorTemperatureK||i.initialBatteryTemperatureK>=i.maximumBatteryTemperatureK)throw new Error("Initial battery and motor temperatures must be below their configured limits.");
  return Object.freeze({...i});
}

function maxBatteryDischargePower(i:VehicleInput,soc:number,temperatureK:number):number {
  if(soc<=0||temperatureK>=i.maximumBatteryTemperatureK)return 0;
  const thermalDerate=temperatureK<=i.maximumBatteryTemperatureK-20?1:Math.max(0,(i.maximumBatteryTemperatureK-temperatureK)/20);
  const voc=i.batteryVoltageV*(0.9+0.1*Math.min(1,Math.max(0,soc)));
  const r=i.batteryInternalResistanceOhm;
  const currentLimit=Math.min(i.batteryMaximumCurrentA*thermalDerate,r>0?voc/(2*r):i.batteryMaximumCurrentA*thermalDerate);
  return Math.max(0,currentLimit*(voc-currentLimit*r));
}
function rotorPower(thrustN:number,diskAreaM2:number,airDensityKgM3:number,efficiency:number):number {
  if(thrustN<=0)return 0;
  // Ideal actuator-disk induced power with a user-assumed aggregate efficiency.
  return (thrustN**1.5)/Math.sqrt(2*airDensityKgM3*diskAreaM2)/efficiency;
}

export function inspectVehiclePreflight(i:VehicleInput):VehiclePreflight {
  const safe=validateVehicleInput(i);const weight= safe.massKg*GRAVITY_MPS2;
  const diagnostics:VehicleDiagnostic[]=[];
  const maxBattery=maxBatteryDischargePower(safe,safe.initialStateOfCharge,safe.initialBatteryTemperatureK);
  let hoverPower:number|null=null,wingLift:number|null=null;
  if(safe.mode==="road-only"){diagnostics.push({severity:"info",code:"ROAD_ONLY_MODEL",message:"This configuration tests level-road longitudinal motion only; no flight capability is represented."});}
  if(safe.mode==="rotorcraft"){
    hoverPower=rotorPower(weight,safe.rotorDiskAreaM2!,safe.airDensityKgM3,safe.rotorEfficiency);
    if(safe.rotorMaximumThrustN!<weight)diagnostics.push({severity:"blocker",code:"ROTOR_THRUST_BELOW_WEIGHT",message:"Maximum assumed rotor thrust is below vehicle weight; vertical takeoff is not supported."});
    if(safe.rotorMaximumThrustN!<1.2*weight)diagnostics.push({severity:"warning",code:"LOW_ROTOR_THRUST_MARGIN",message:"Rotor thrust margin is below 20%; reserve thrust for control and disturbances is not represented."});
    if(hoverPower>maxBattery)diagnostics.push({severity:"blocker",code:"ROTOR_HOVER_POWER_EXCEEDS_BATTERY",message:"Ideal induced hover power exceeds the battery discharge envelope before cruise or accessory loads."});
  }
  if(safe.mode==="fixed-wing"){
    wingLift=0.5*safe.airDensityKgM3*safe.takeoffSpeedMps!**2*safe.wingAreaM2!*safe.wingLiftCoefficient!;
    if(wingLift<weight)diagnostics.push({severity:"blocker",code:"WING_LIFT_BELOW_WEIGHT",message:"Assumed wing lift at takeoff speed is below vehicle weight; the model will not grant takeoff."});
    const dragAtTakeoff=0.5*safe.airDensityKgM3*safe.dragCoefficient*safe.frontalAreaM2*safe.takeoffSpeedMps!**2;
    if(safe.maximumCruiseThrustN<dragAtTakeoff)diagnostics.push({severity:"blocker",code:"CRUISE_THRUST_BELOW_TAKEOFF_DRAG",message:"Available horizontal thrust is below estimated aerodynamic drag at takeoff speed."});
  }
  const requiredPower=(hoverPower??0)+safe.motorMaximumPowerW;
  if(safe.mode!=="road-only"&&maxBattery<Math.min(requiredPower,hoverPower??requiredPower))diagnostics.push({severity:"warning",code:"LIMITED_BATTERY_POWER",message:"Battery power may limit simultaneous takeoff, cruise and accessory demand."});
  diagnostics.push({severity:"info",code:"MODEL_VALIDITY_BOUNDARY",message:"Longitudinal point-mass model on a level road; no steering/yaw/roll stability, suspension travel, tire relaxation, detailed rotor aerodynamics, wing stall, weather gusts, control-law certification or structural finite-element analysis."});
  const blockers=diagnostics.some(x=>x.severity==="blocker");
  return Object.freeze({diagnostics:Object.freeze(diagnostics),weightN:weight,maximumBatteryPowerW:maxBattery,requiredHoverPowerW:hoverPower,wingLiftAtTakeoffN:wingLift,flightModeSupported:safe.mode!=="road-only"&&!blockers});
}

type DynamicState={x:number;z:number;vx:number;vz:number;soc:number;motorTemperatureK:number;batteryTemperatureK:number;energyWh:number;airborne:boolean;motorDropoutRecorded:boolean;failure:string|null};
type ForceState={wheelForce:number;cruiseThrust:number;rotorThrust:number;wingLift:number;drag:number;normal:number;loadFactor:number;batteryCurrent:number;terminalVoltage:number;batteryPower:number;motorHeat:number;batteryHeat:number;powerLimited:boolean;motorAvailable:boolean;airborne:boolean};
function electricalCurrent(power:number,voc:number,resistance:number):number {
  if(power<=0)return 0;
  if(resistance<=1e-12)return power/voc;
  const discriminant=voc*voc-4*resistance*power;
  if(discriminant< -1e-6)throw new Error("Requested battery power exceeds its resistive discharge envelope.");
  return (voc-Math.sqrt(Math.max(0,discriminant)))/(2*resistance);
}
function forces(i:VehicleInput,s:DynamicState,time:number):ForceState {
  const speed=Math.hypot(s.vx,s.vz);const weight=i.massKg*GRAVITY_MPS2;
  const wingLift=i.mode==="fixed-wing"?0.5*i.airDensityKgM3*speed*speed*i.wingAreaM2!*i.wingLiftCoefficient!:0;
  const maxBattery=maxBatteryDischargePower(i,s.soc,s.batteryTemperatureK);
  const motorAvailable=s.failure===null&&(i.motorFailureAtSeconds===null||time<i.motorFailureAtSeconds);
  const rotorRequested=i.mode==="rotorcraft"?i.rotorMaximumThrustN!*i.rotorThrottle:0;
  const requestedRotorPower=i.mode==="rotorcraft"?rotorPower(rotorRequested,i.rotorDiskAreaM2!,i.airDensityKgM3,i.rotorEfficiency):0;
  let rotorScale=requestedRotorPower>maxBattery&&requestedRotorPower>0?Math.pow(maxBattery/requestedRotorPower,2/3):1;
  let rotorThrust=rotorRequested*rotorScale;let actualRotorPower=rotorPower(rotorThrust,i.rotorDiskAreaM2??1,i.airDensityKgM3,i.rotorEfficiency);
  const takeoffCondition=i.mode==="rotorcraft"?rotorThrust+wingLift>=weight:i.mode==="fixed-wing"&&speed>=i.takeoffSpeedMps!&&wingLift>=weight;
  const airborne=s.airborne||takeoffCondition;
  const normal=airborne?0:Math.max(0,weight-wingLift-rotorThrust);
  const dragMagnitude=0.5*i.airDensityKgM3*i.dragCoefficient*i.frontalAreaM2*speed*speed;
  const dragX=speed>1e-12?dragMagnitude*s.vx/speed:0;
  const dragZ=speed>1e-12?dragMagnitude*s.vz/speed:0;
  let wheelForce=motorAvailable&&!airborne?Math.min(i.driveThrottle*i.maximumWheelDriveForceN,i.tireFrictionCoefficient*normal,i.motorMaximumCurrentA*i.motorForceConstantNPerA,i.motorMaximumPowerW*i.motorEfficiency/Math.max(s.vx,0.5)):0;
  let cruiseThrust=motorAvailable&&airborne&&i.mode!=="road-only"?i.maximumCruiseThrustN*i.driveThrottle:0;
  const requestedWheelMechanical=wheelForce*Math.max(s.vx,0.5);
  const requestedWheelCurrent=wheelForce/i.motorForceConstantNPerA;
  const requestedCruiseMechanical=cruiseThrust*Math.max(speed,0.5);
  const requestedCruiseElectrical=requestedCruiseMechanical/i.cruisePropulsiveEfficiency;
  const requestedMotorHeat=requestedWheelCurrent**2*i.motorWindingResistanceOhm;
  let requestedMotorPower=Math.max(requestedWheelMechanical/i.motorEfficiency,requestedMotorHeat)+requestedCruiseElectrical;
  const remainingBattery=Math.max(0,maxBattery-actualRotorPower);
  const availableMotorCurrent=Math.max(0,Math.min(i.motorMaximumCurrentA,i.batteryMaximumCurrentA)-actualRotorPower/Math.max(i.batteryVoltageV*0.8,1));
  const currentScale=requestedWheelCurrent+requestedCruiseElectrical/Math.max(i.batteryVoltageV*0.8,1)>0?Math.min(1,availableMotorCurrent/(requestedWheelCurrent+requestedCruiseElectrical/Math.max(i.batteryVoltageV*0.8,1))):1;
  const powerScale=requestedMotorPower>remainingBattery&&requestedMotorPower>0?remainingBattery/requestedMotorPower:1;
  const motorNameplateScale=requestedMotorPower>i.motorMaximumPowerW&&requestedMotorPower>0?i.motorMaximumPowerW/requestedMotorPower:1;
  const scale=Math.min(currentScale,powerScale,motorNameplateScale);
  const powerLimited=scale<0.999999||rotorScale<0.999999;
  wheelForce*=scale;cruiseThrust*=scale;
  const wheelCurrent=wheelForce/i.motorForceConstantNPerA;
  const wheelMechanical=wheelForce*Math.max(s.vx,0.5);
  const cruiseMechanical=cruiseThrust*Math.max(speed,0.5);
  const cruiseElectrical=cruiseMechanical/i.cruisePropulsiveEfficiency;
  const motorCopper=wheelCurrent**2*i.motorWindingResistanceOhm;
  const motorElectrical=Math.max(wheelMechanical/i.motorEfficiency,motorCopper)+cruiseElectrical;
  const totalPower=Math.min(maxBattery,actualRotorPower+motorElectrical);
  const voc=i.batteryVoltageV*(0.9+0.1*Math.min(1,Math.max(0,s.soc)));
  const batteryCurrent=electricalCurrent(totalPower,voc,i.batteryInternalResistanceOhm);
  const terminalVoltage=Math.max(0,voc-batteryCurrent*i.batteryInternalResistanceOhm);
  const motorHeat=Math.max(0,motorElectrical-wheelMechanical-cruiseMechanical);
  const batteryHeat=batteryCurrent*batteryCurrent*i.batteryInternalResistanceOhm;
  const loadFactor=Math.max(0,(wingLift+rotorThrust)/weight);
  return {wheelForce,cruiseThrust,rotorThrust,wingLift,drag:dragMagnitude,normal,loadFactor,batteryCurrent,terminalVoltage,batteryPower:totalPower,motorHeat,batteryHeat,powerLimited,motorAvailable,airborne};
}

export function runWorldLabVehicle(project:Readonly<{id:string;revision:number}>,runId:string,input:VehicleInput):VehicleRun {
  if(!project||!idPattern.test(project.id)||!Number.isSafeInteger(project.revision)||project.revision<0||!idPattern.test(runId))throw new Error("Vehicle run needs a valid project ID, revision and run ID.");
  const safe=validateVehicleInput(input);const preflight=inspectVehiclePreflight(safe);
  const count=Math.ceil(safe.durationSeconds/safe.solverStepSeconds);const h=safe.durationSeconds/count;
  let state:DynamicState={x:0,z:0,vx:0,vz:0,soc:safe.initialStateOfCharge,motorTemperatureK:safe.initialMotorTemperatureK,batteryTemperatureK:safe.initialBatteryTemperatureK,energyWh:0,airborne:false,motorDropoutRecorded:false,failure:null};
  const samples:VehicleSample[]=[];const events:VehicleEvent[]=[];const failureReasons:string[]=[];
  let previousAirborne=false;let powerLimitRecorded=false;
  for(let step=0;step<=count;step++){
    const time=step*h;const f=forces(safe,state,time);
    if(!state.motorDropoutRecorded&&safe.motorFailureAtSeconds!==null&&time>=safe.motorFailureAtSeconds){events.push({timeSeconds:time,kind:"motor-dropout",message:"The assumed drive-motor failure was injected; powered wheel/cruise thrust is disabled from this sample."});state={...state,motorDropoutRecorded:true};}
    if(f.airborne&&!previousAirborne)events.push({timeSeconds:time,kind:"takeoff",message:"The bounded model predicts lift sufficient to leave the level-road contact constraint."});
    if(!f.airborne&&previousAirborne)events.push({timeSeconds:time,kind:"touchdown",message:"The modeled body returned to the level-road contact constraint."});
    if(f.powerLimited&&!powerLimitRecorded){events.push({timeSeconds:time,kind:"power-limit",message:"Battery current, internal resistance or power limits reduced requested propulsion."});powerLimitRecorded=true;}
    const speed=Math.hypot(state.vx,state.vz);
    const sample:VehicleSample=Object.freeze({timeSeconds:time,distanceMeters:state.x,altitudeMeters:state.z,horizontalSpeedMps:state.vx,verticalSpeedMps:state.vz,
      wheelDriveForceN:f.wheelForce,cruiseThrustN:f.cruiseThrust,rotorThrustN:f.rotorThrust,wingLiftN:f.wingLift,aerodynamicDragN:f.drag,
      normalForceN:f.normal,structuralLoadFactor:f.loadFactor,batteryCurrentA:f.batteryCurrent,batteryTerminalVoltageV:f.terminalVoltage,
      batteryPowerW:f.batteryPower,batteryStateOfCharge:state.soc,batteryTemperatureK:state.batteryTemperatureK,motorTemperatureK:state.motorTemperatureK,
      motorAvailable:f.motorAvailable,airborne:f.airborne,powerLimited:f.powerLimited,electricalEnergyUsedWh:state.energyWh});
    samples.push(sample);
    if(step===count||state.failure)break;
    const dragX=speed>1e-12?f.drag*state.vx/speed:0;const dragZ=speed>1e-12?f.drag*state.vz/speed:0;
    const rolling=f.airborne?0:safe.rollingResistanceCoefficient*f.normal*(state.vx>=0?1:-1);
    const ax=(f.wheelForce+f.cruiseThrust-dragX-rolling)/safe.massKg;
    const az=f.airborne?(f.wingLift+f.rotorThrust-safe.massKg*GRAVITY_MPS2-dragZ)/safe.massKg:0;
    const vx=Math.max(0,state.vx+ax*h);const vz=state.vz+az*h;
    let z=state.z+(f.airborne?Math.max(0,vz):0)*h;let airborne=f.airborne;
    let nextVz=vz;
    if(z<=0.000001&&airborne&&nextVz<=0){z=0;nextVz=0;airborne=false;}
    const motorHeatRate=f.motorHeat-safe.motorCoolingWPerK*(state.motorTemperatureK-safe.ambientTemperatureK);
    const batteryHeatRate=f.batteryHeat-safe.batteryCoolingWPerK*(state.batteryTemperatureK-safe.ambientTemperatureK);
    const motorTemperatureK=state.motorTemperatureK+motorHeatRate*h/safe.motorHeatCapacityJPerK;
    const batteryTemperatureK=state.batteryTemperatureK+batteryHeatRate*h/safe.batteryHeatCapacityJPerK;
    const energyWh=state.energyWh+f.batteryPower*h/3600;
      const nextSoc=Math.max(0,state.soc-(f.batteryPower*h)/(3600*safe.batteryCapacityWh));
    let failure:string|null=null;
    if(f.loadFactor>safe.maximumStructuralLoadFactor){failure="The computed lift load exceeds the inventor-assumed structural load-factor limit.";events.push({timeSeconds:time,kind:"structural-limit",message:failure});}
    else if(motorTemperatureK>=safe.maximumMotorTemperatureK||batteryTemperatureK>=safe.maximumBatteryTemperatureK){failure="A modeled motor or battery temperature exceeded its user-assumed limit.";events.push({timeSeconds:time,kind:"thermal-limit",message:failure});}
    else if(vx>safe.maximumSpeedMps){failure="The modeled speed exceeded the configured maximum-speed limit.";}
    else if(nextSoc<=0&&state.soc>0){failure="The battery energy allowance was depleted; powered propulsion is no longer available.";events.push({timeSeconds:time,kind:"battery-depleted",message:failure});}
    if(failure){failureReasons.push(failure);state={...state,failure};}
    else state={x:state.x+vx*h,z,vx,vz:nextVz,soc:nextSoc,motorTemperatureK,batteryTemperatureK,energyWh,airborne,motorDropoutRecorded:state.motorDropoutRecorded,failure:null};
    previousAirborne=f.airborne;
  }
  const final=samples[samples.length-1];
  if(safe.mode!=="road-only"&&!samples.some(s=>s.airborne)&&!failureReasons.length)failureReasons.push("The vehicle did not reach the lift and takeoff conditions within the simulated run.");
  const outcome=state.failure?"failed":final.airborne?"airborne":safe.mode==="road-only"?"ground-run":"unable-to-takeoff";
  return Object.freeze({format:"env-world-lab-vehicle-run",schemaVersion:1,modelVersion:"1.0.0",evidence:"physics-model-computed",
    projectId:project.id,projectRevision:project.revision,runId,input:safe,
    validity:"Assumed-parameter longitudinal point-mass vehicle on a level road. Computes bounded tire traction, rolling resistance, aerodynamic drag, simplified wing lift or ideal actuator-disk rotor thrust, battery discharge/current/voltage, motor and battery heat, and injected drive-motor dropout. It does not model suspension travel, steering/yaw/roll, tire relaxation, full rotor/propeller aerodynamics, compressibility, wing stall, turbulence, structural FEM, flight controls, collision safety or certification.",
    preflight,samples:Object.freeze(samples),events:Object.freeze(events),outcome,failureReasons:Object.freeze(failureReasons)});
}

export function sampleWorldLabVehicle(run:VehicleRun,timeSeconds:number):VehicleSample {
  if(!Number.isFinite(timeSeconds)||timeSeconds<0||timeSeconds>run.input.durationSeconds+1e-9)throw new Error("Vehicle playback time is outside the recorded run.");
  const step=run.samples.length>1?run.samples[1].timeSeconds-run.samples[0].timeSeconds:run.input.solverStepSeconds;
  const index=Math.min(run.samples.length-1,Math.max(0,Math.round(timeSeconds/step)));
  return run.samples[index];
}

export const WORLD_LAB_VEHICLE_LIMITS=Object.freeze({maximumSteps:MAX_STEPS,maximumDurationSeconds:120,maximumStepSeconds:0.05,gravityMps2:GRAVITY_MPS2});