import {parseWorldLabProject,type WorldLabProject} from "./project.ts";
import {solveDcNetwork,type DcNetworkResult} from "./network.ts";
import {
  deriveActuatorInput,runActuatorExperiment,
  type ActuatorInput,type ActuatorRun,
} from "./electromechanical.ts";

/**
 * Ideal-source co-simulation: solve passive DC network with MNA, then connect
 * the electromechanical motor IN PARALLEL with the one ideal voltage source.
 * Because the source voltage is ideal/stiff, passive currents are unchanged;
 * the source's actual current includes the motor's time-varying current.
 * This is a coupled source/KCL/power account, not a finite-battery model.
 */
export type NetworkMotorSample=Readonly<{
  timeSeconds:number;
  motorCurrentA:number;
  sourceBranchCurrentA:number;
  totalSourcePowerW:number;
  networkResistiveHeatW:number;
  motorElectricalPowerW:number;
  totalSuppliedEnergyJ:number;
  totalDissipatedEnergyJ:number;
  combinedPowerBalanceResidualJ:number;
}>;
export type NetworkMotorRun=Readonly<{
  format:"env-world-lab-network-motor-run";
  modelVersion:"1.0.0";
  evidence:"physics-model-computed";
  validity:string;
  projectId:string;
  projectRevision:number;
  networkId:string;
  entityId:string;
  sourceComponentId:string;
  dc:DcNetworkResult;
  motor:ActuatorRun;
  samples:readonly NetworkMotorSample[];
}>;

export function runNetworkMotorExperiment(
  raw:WorldLabProject,entityId:string,
  settings:Partial<Omit<ActuatorInput,"massKg"|"supplyVoltageV">>={},
  requestedStepSeconds=1/240,
):NetworkMotorRun {
  const p=parseWorldLabProject(raw);
  const network=p.networks?.[0];
  if(!network)throw new Error("Create an electrical circuit before wiring this motor.");
  const sources=network.components.filter(c=>c.kind==="dc-source");
  if(sources.length!==1)
    throw new Error("The reference motor wiring supports exactly one ideal source.");
  const source=sources[0];
  if(source.voltageV<0)
    throw new Error("Reverse-polarity source requires a signed motor model not yet supported.");
  const dc=solveDcNetwork(network,p);
  const output=deriveActuatorInput(p,entityId,{
    ...settings,supplyVoltageV:source.voltageV,
  });
  const motor=runActuatorExperiment(output.input,output.source,requestedStepSeconds);
  const baseSourceCurrent=dc.branchCurrentsA[source.id];
  if(!Number.isFinite(baseSourceCurrent))
    throw new Error("DC source branch current was not determined.");
  const samples=motor.samples.map(m=>{
    // MNA uses conventional current from positive source pin to negative;
    // the motor branch draws positive current and thus increases the magnitude
    // of the source's negative delivery current.
    const current=baseSourceCurrent-m.coilCurrentA;
    const sourcePower=-source.voltageV*current;
    const totalEnergy=m.suppliedEnergyJ+dc.sourcePowerSuppliedW*m.timeSeconds;
    const totalDissipation=m.dissipatedEnergyJ+dc.resistivePowerW*m.timeSeconds;
    const residual=m.energyResidualJ+dc.powerResidualW*m.timeSeconds;
    if(![current,sourcePower,totalEnergy,totalDissipation,residual].every(Number.isFinite))
      throw new Error("Coupled network and actuator exceeded finite energy bounds.");
    return Object.freeze({
      timeSeconds:m.timeSeconds,
      motorCurrentA:m.coilCurrentA,
      sourceBranchCurrentA:current,
      totalSourcePowerW:sourcePower,
      networkResistiveHeatW:dc.resistivePowerW,
      motorElectricalPowerW:source.voltageV*m.coilCurrentA,
      totalSuppliedEnergyJ:totalEnergy,
      totalDissipatedEnergyJ:totalDissipation,
      combinedPowerBalanceResidualJ:residual,
    });
  });
  return Object.freeze({
    format:"env-world-lab-network-motor-run" as const,modelVersion:"1.0.0" as const,
    evidence:"physics-model-computed" as const,projectId:p.id,projectRevision:p.revision,
    networkId:network.id,entityId,sourceComponentId:source.id,dc,motor,
    samples:Object.freeze(samples),
    validity:"Ideal 1D stiff-voltage-source network and motor branch. Source current, DC " +
      "resistor heat, back-EMF, motor heat, lift and energy are calculated together. " +
      "No finite battery sag, network parasitics, signal delay, switching, coil geometry " +
      "measurement, device certification or independent material characterization.",
  });
}
