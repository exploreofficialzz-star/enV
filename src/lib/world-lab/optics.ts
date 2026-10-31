import {parseWorldLabProject,type WorldLabProject} from "./project.ts";

/**
 * Fresnel power reflection at a single plane boundary between two invented
 * transparent isotropic nonmagnetic lossless media. Wavelength-independent,
 * no material measurement, geometry tracing or wave interference.
 */
export type OpticalInterfaceRun=Readonly<{
  format:"env-world-lab-interface-optics";modelVersion:"1.0.0";
  evidence:"physics-model-computed";materialEvidence:"hypothetical-user-assumed";
  projectId:string;projectRevision:number;
  firstMaterialId:string;secondMaterialId:string;
  firstIndex:number;secondIndex:number;
  incidentAngleDegrees:number;reflectedAngleDegrees:number;
  transmittedAngleDegrees:number|null;criticalAngleDegrees:number|null;
  totalInternalReflection:boolean;
  sReflectance:number;pReflectance:number;
  unpolarizedReflectance:number;unpolarizedTransmittance:number;
  energyResidual:number;validity:string;
}>;
const degrees=(rad:number)=>rad*180/Math.PI;
export function calculateOpticalInterface(raw:WorldLabProject,firstId:string,
  secondId:string,incidentAngleDegrees:number):OpticalInterfaceRun{
  const p=parseWorldLabProject(raw);
  if(firstId===secondId)throw new Error("Choose two different invented materials.");
  const first=p.materials.find(m=>m.id===firstId),second=p.materials.find(m=>m.id===secondId);
  if(!first||!second||first.refractiveIndex==null||second.refractiveIndex==null)
    throw new Error("Both materials need explicit assumed refractive indices.");
  const n1=first.refractiveIndex,n2=second.refractiveIndex;
  if(!Number.isFinite(incidentAngleDegrees)||incidentAngleDegrees<0||
    incidentAngleDegrees>89.9)
    throw new Error("Light incidence must be a finite angle from 0 to 89.9 degrees.");
  const theta=incidentAngleDegrees*Math.PI/180;
  const sinT=n1/n2*Math.sin(theta);
  const critical=n1>n2?degrees(Math.asin(n2/n1)):null;
  const totalInternalReflection=sinT>1;
  let transmittedAngleDegrees:number|null=null,sReflectance=1,pReflectance=1;
  if(!totalInternalReflection){
    const cosI=Math.cos(theta),cosT=Math.sqrt(Math.max(0,1-sinT*sinT));
    transmittedAngleDegrees=degrees(Math.asin(Math.min(1,sinT)));
    sReflectance=((n1*cosI-n2*cosT)/(n1*cosI+n2*cosT))**2;
    pReflectance=((n2*cosI-n1*cosT)/(n2*cosI+n1*cosT))**2;
  }
  const unpolarizedReflectance=Math.max(0,Math.min(1,(sReflectance+pReflectance)/2));
  const unpolarizedTransmittance=1-unpolarizedReflectance;
  const energyResidual=Math.abs(1-unpolarizedReflectance-unpolarizedTransmittance);
  return Object.freeze({
    format:"env-world-lab-interface-optics" as const,
    modelVersion:"1.0.0" as const,evidence:"physics-model-computed" as const,
    materialEvidence:"hypothetical-user-assumed" as const,
    projectId:p.id,projectRevision:p.revision,
    firstMaterialId:firstId,secondMaterialId:secondId,
    firstIndex:n1,secondIndex:n2,incidentAngleDegrees,
    reflectedAngleDegrees:incidentAngleDegrees,
    transmittedAngleDegrees,criticalAngleDegrees:critical,totalInternalReflection,
    sReflectance,pReflectance,unpolarizedReflectance,unpolarizedTransmittance,
    energyResidual,
    validity:"Ideal monochromatic plane-wave Fresnel and Snell interface with "+
      "user-assumed real refractive indices, transparent isotropic lossless "+
      "nonmagnetic media and no absorption, scattering, dispersion, roughness, "+
      "coatings, diffraction, finite object geometry, spectral response or "+
      "measured optical properties. Total internal reflection is geometric-optics "+
      "model behavior, not hardware or material certification.",
  });
}
