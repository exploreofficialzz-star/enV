import {parseWorldLabProject,type WorldLabProject} from "./project.ts";
import {solveDigitalLogic} from "./digital-logic.ts";
import {
  deriveActuatorInput,runActuatorExperiment,
  type ActuatorInput,type ActuatorRun,
} from "./electromechanical.ts";

/**
 * Strictly bounded static digital-to-physical composition.
 * A calculated user-assumed Boolean bit controls an ideal, instant relay
 * switching a *constant* voltage source for one entire actuator run.
 * Not a hardware model, PWM/clock, chip, logic delay or power electronics.
 */
export type DigitalMotorRun=Readonly<{
  format:"env-world-lab-digital-motor-run";
  modelVersion:"1.0.0";
  evidence:"physics-model-computed";
  inputEvidence:"hypothetical-user-assumed";
  projectId:string;
  projectRevision:number;
  digitalNetworkId:string;
  digitalOutputId:string;
  entityId:string;
  logicBit:0|1;
  energizedVoltageV:number;
  motor:ActuatorRun;
  validity:string;
}>;

export function runDigitalMotorExperiment(
  raw:WorldLabProject,networkId:string,outputId:string,entityId:string,
  energizedVoltageV:number,
  settings:Partial<Omit<ActuatorInput,"massKg"|"supplyVoltageV">>={},
  requestedStepSeconds=1/240,
):DigitalMotorRun {
  const project=parseWorldLabProject(raw);
  if(!Number.isFinite(energizedVoltageV)||energizedVoltageV<0||
     energizedVoltageV>1000)
    throw new Error("Assumed controller voltage must be finite from 0 to 1000 V.");
  const digital=project.digitalNetworks?.find(n=>n.id===networkId);
  if(!digital)throw new Error("Select an invented digital network.");
  if(!digital.outputs.some(out=>out.id===outputId))
    throw new Error("Select an existing digital output indicator.");
  const logic=solveDigitalLogic(project,networkId);
  const bit=logic.outputs[outputId];
  if(bit!==0 && bit!==1)throw new Error("Digital indicator has no computed Boolean bit.");
  const source=deriveActuatorInput(project,entityId,{
    ...settings,supplyVoltageV:bit*energizedVoltageV,
  });
  const motor=runActuatorExperiment(source.input,source.source,requestedStepSeconds);
  if(motor.source.projectId!==project.id ||
     motor.source.projectRevision!==project.revision ||
     motor.source.entityId!==entityId)
    throw new Error("Digital motor evidence does not match the authored project.");
  return Object.freeze({
    format:"env-world-lab-digital-motor-run" as const,
    modelVersion:"1.0.0" as const,
    evidence:"physics-model-computed" as const,
    inputEvidence:"hypothetical-user-assumed" as const,
    projectId:project.id,projectRevision:project.revision,
    digitalNetworkId:networkId,digitalOutputId:outputId,entityId,
    logicBit:bit,energizedVoltageV,motor,
    validity:"An ideal static Boolean truth table drives an assumed on/off voltage source "+
      "in a bounded one-dimensional electromechanical model. No physical logic gates, "+
      "switching transients, semiconductor devices, signal delay, rotating motor, "+
      "real material characterization, power electronics or safety certification.",
  });
}
