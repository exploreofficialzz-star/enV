import {runChemicalThermal,type ReactionThermalInput} from "./chemical-thermal.ts";

/**
 * Explicit 5x5 parametric sensitivity experiment.
 * This is deterministic model exploration of assumed input values, not a
 * statistical confidence interval, measured chemical identity or hazard test.
 */
export const CHEMICAL_SWEEP_FACTORS=Object.freeze([0.5,0.75,1,1.25,1.5]);
export type ChemicalSweepPoint=Readonly<{
  frequencyFactorScale:number;heatReleaseScale:number;
  attemptedPreExponentialPerS:number;attemptedReactionHeatReleasedJPerMol:number;
  status:"computed"|"outside-domain";
  finalReactantMol:number|null;finalProductMol:number|null;
  finalTemperatureK:number|null;maximumTemperatureK:number|null;
  maximumAbsoluteEnergyResidualJ:number|null;
}>;
export function runChemicalAssumptionSweep(input:ReactionThermalInput){
  // Baseline itself must be a valid, numerically stable physical model.
  const baseline=runChemicalThermal(input,1/120);
  const scenarios:ChemicalSweepPoint[]=[];
  for(const kinetic of CHEMICAL_SWEEP_FACTORS){
    for(const enthalpy of CHEMICAL_SWEEP_FACTORS){
      const attemptedPreExponentialPerS=input.preExponentialPerS*kinetic;
      const attemptedReactionHeatReleasedJPerMol=input.reactionHeatReleasedJPerMol*enthalpy;
      const scenario={...input,preExponentialPerS:attemptedPreExponentialPerS,
        reactionHeatReleasedJPerMol:attemptedReactionHeatReleasedJPerMol};
      try{
        const experiment=runChemicalThermal(scenario,1/120);
        const last=experiment.samples[experiment.samples.length-1];
        const maximumTemperatureK=Math.max(...experiment.samples.map(s=>s.temperatureK));
        const maximumAbsoluteEnergyResidualJ=Math.max(...experiment.samples.map(
          s=>Math.abs(s.energyResidualJ)));
        scenarios.push({frequencyFactorScale:kinetic,heatReleaseScale:enthalpy,
          attemptedPreExponentialPerS,attemptedReactionHeatReleasedJPerMol,
          status:"computed",finalReactantMol:last.reactantRemainingMol,
          finalProductMol:last.productFormedMol,
          finalTemperatureK:last.temperatureK,maximumTemperatureK,
          maximumAbsoluteEnergyResidualJ});
      }catch{
        // The solver rejected this proposed variant: do not invent or
        // interpolate temperature or chemistry for an unsupported assumption.
        scenarios.push({frequencyFactorScale:kinetic,heatReleaseScale:enthalpy,
          attemptedPreExponentialPerS,attemptedReactionHeatReleasedJPerMol,
          status:"outside-domain",finalReactantMol:null,finalProductMol:null,
          finalTemperatureK:null,maximumTemperatureK:null,
          maximumAbsoluteEnergyResidualJ:null});
      }
    }
  }
  return Object.freeze({
    format:"env-world-lab-chemical-assumption-sweep" as const,
    modelVersion:"1.0.0" as const,
    evidence:"physics-model-computed" as const,
    inputEvidence:"hypothetical-user-assumed" as const,
    baselineInput:input,
    baselineFinalTemperatureK:baseline.samples[baseline.samples.length-1].temperatureK,
    baselineFinalProductMol:baseline.samples[baseline.samples.length-1].productFormedMol,
    scenarioCount:scenarios.length,
    successfulCount:scenarios.filter(x=>x.status==="computed").length,
    scenarios:Object.freeze(scenarios),
    validity:"Bounded 25-case deterministic sensitivity grid for user-assumed first-order "+
      "Arrhenius frequency factor and enthalpy, coupled to a lumped temperature model. "+
      "Unsupported variants are explicitly marked outside-domain. No measured "+
      "chemistry, statistical probability, hazard claim, reaction pathway, "+
      "confidence interval or product identity is inferred.",
  });
}
