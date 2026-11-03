import {
  classifyObservationFreshness,
  observationEvidenceClass,
  type WorldObservation,
  type ObservationFreshness,
} from "./observation-contract.ts";

export type EarthReferenceLayer =
  | "surface"
  | "soil-regolith"
  | "sediment"
  | "crust"
  | "upper-mantle"
  | "mantle-transition"
  | "lower-mantle"
  | "outer-core"
  | "inner-core";

export type AtmosphereReferenceLayer =
  | "surface-boundary-layer"
  | "troposphere"
  | "stratosphere"
  | "mesosphere"
  | "thermosphere"
  | "exosphere";

export type ReferenceLayer = Readonly<{
  id:string;
  label:string;
  lowerBoundMeters:number;
  upperBoundMeters:number;
  boundary:"approximate-reference";
  description:string;
  limitations:string;
}>;

const earthLayers:readonly ReferenceLayer[] = Object.freeze([
  {id:"surface",label:"Surface / land or ocean interface",lowerBoundMeters:0,upperBoundMeters:0,boundary:"approximate-reference",description:"The local surface datum selected by the project.",limitations:"Surface appearance is not evidence of soil, geology or bathymetry."},
  {id:"soil-regolith",label:"Illustrative soil and regolith",lowerBoundMeters:0,upperBoundMeters:2,boundary:"approximate-reference",description:"A shallow teaching layer for soil, weathered rock and unconsolidated cover.",limitations:"Thickness and composition vary by site; no local survey is implied."},
  {id:"sediment",label:"Illustrative sediment and shallow groundwater zone",lowerBoundMeters:2,upperBoundMeters:1000,boundary:"approximate-reference",description:"A generic sedimentary volume where aquifers may occur.",limitations:"Aquifer location, water table, porosity and flow require measured local data."},
  {id:"crust",label:"Earth crust reference",lowerBoundMeters:1000,upperBoundMeters:35000,boundary:"approximate-reference",description:"A representative crustal depth band.",limitations:"Crust thickness varies substantially between continents, oceans and tectonic settings."},
  {id:"upper-mantle",label:"Upper mantle reference",lowerBoundMeters:35000,upperBoundMeters:410000,boundary:"approximate-reference",description:"A broad mantle reference band below a simplified crust boundary.",limitations:"The crust-mantle boundary and local structure are not inferred from this generic layer."},
  {id:"mantle-transition",label:"Mantle transition-zone reference",lowerBoundMeters:410000,upperBoundMeters:660000,boundary:"approximate-reference",description:"A global teaching band around major mantle seismic discontinuities.",limitations:"Depths and properties are global approximations, not a local tomography result."},
  {id:"lower-mantle",label:"Lower mantle reference",lowerBoundMeters:660000,upperBoundMeters:2890000,boundary:"approximate-reference",description:"A broad deep-mantle reference volume.",limitations:"No mineral-phase, temperature or convection field is supplied by this visual layer."},
  {id:"outer-core",label:"Outer core reference",lowerBoundMeters:2890000,upperBoundMeters:5150000,boundary:"approximate-reference",description:"A global reference shell for the liquid outer core.",limitations:"The shell is a teaching boundary; no site-specific or live geophysical measurement is implied."},
  {id:"inner-core",label:"Inner core reference",lowerBoundMeters:5150000,upperBoundMeters:6371000,boundary:"approximate-reference",description:"A global reference shell for the solid inner core.",limitations:"Illustrative planetary interior only; not a material-state prediction."},
]);

const atmosphereLayers:readonly ReferenceLayer[] = Object.freeze([
  {id:"surface-boundary-layer",label:"Surface boundary layer",lowerBoundMeters:0,upperBoundMeters:200,boundary:"approximate-reference",description:"A shallow atmospheric boundary-layer reference.",limitations:"Local wind and turbulence require measured or modelled meteorological data."},
  {id:"troposphere",label:"Troposphere reference",lowerBoundMeters:200,upperBoundMeters:12000,boundary:"approximate-reference",description:"The main lower-atmosphere weather layer.",limitations:"Tropopause altitude varies with latitude, season and weather."},
  {id:"stratosphere",label:"Stratosphere reference",lowerBoundMeters:12000,upperBoundMeters:50000,boundary:"approximate-reference",description:"A broad stratospheric reference band.",limitations:"No ozone, temperature or wind observation is attached by this descriptor."},
  {id:"mesosphere",label:"Mesosphere reference",lowerBoundMeters:50000,upperBoundMeters:85000,boundary:"approximate-reference",description:"A global reference band above the stratosphere.",limitations:"Layer boundaries vary; no observed profile is represented."},
  {id:"thermosphere",label:"Thermosphere reference",lowerBoundMeters:85000,upperBoundMeters:600000,boundary:"approximate-reference",description:"A broad upper-atmosphere teaching band.",limitations:"Solar activity strongly affects state; no current upper-atmosphere dataset is attached."},
  {id:"exosphere",label:"Exosphere reference",lowerBoundMeters:600000,upperBoundMeters:10000000,boundary:"approximate-reference",description:"An approximate outer atmospheric transition band.",limitations:"Upper boundary is conventional and not a sharp physical surface."},
]);

export function earthReferenceLayers():readonly ReferenceLayer[]{return earthLayers;}
export function atmosphereReferenceLayers():readonly ReferenceLayer[]{return atmosphereLayers;}

export function earthReferenceLayerAtDepth(depthBelowSurfaceMeters:number):ReferenceLayer {
  if(!Number.isFinite(depthBelowSurfaceMeters)||depthBelowSurfaceMeters<0||depthBelowSurfaceMeters>6371000) {
    throw new Error("Subsurface depth must be between the local surface and the reference Earth-centre depth.");
  }
  if(depthBelowSurfaceMeters===0)return earthLayers[0];
  const layer=earthLayers.find(x=>depthBelowSurfaceMeters>=x.lowerBoundMeters&&
    (depthBelowSurfaceMeters<x.upperBoundMeters||x.id==="inner-core"&&depthBelowSurfaceMeters<=x.upperBoundMeters));
  if(!layer)throw new Error("No Earth reference layer is defined at this depth.");
  return layer;
}

export function atmosphereReferenceLayerAtAltitude(altitudeMeters:number):ReferenceLayer {
  if(!Number.isFinite(altitudeMeters)||altitudeMeters< -12000||altitudeMeters>10000000) {
    throw new Error("Atmospheric altitude is outside the supported reference range.");
  }
  const altitude=Math.max(0,altitudeMeters);
  const layer=atmosphereLayers.find(x=>altitude>=x.lowerBoundMeters&&
    (altitude<x.upperBoundMeters||x.id==="exosphere"&&altitude<=x.upperBoundMeters));
  if(!layer)throw new Error("No atmosphere reference layer is defined at this altitude.");
  return layer;
}

export type LayerEvidenceStatus = Readonly<{
  status:"not-attached"|"measured-observed"|"forecast"|"climatological-reference"|"synthetic-model"|"representative-only";
  freshness:ObservationFreshness|null;
  label:string;
  limitations:string;
}>;

/** Evidence status for a layer. No attached data always resolves to not-attached, never fabricated measurement. */
export function assessLayerEvidence(
  observation:WorldObservation|null,
  atUTC:string,
):LayerEvidenceStatus {
  if(!observation)return Object.freeze({
    status:"not-attached",freshness:null,label:"No observation dataset attached",
    limitations:"This layer is a reference boundary only. It contains no measured imagery, elevation, weather or subsurface payload.",
  });
  const freshness=classifyObservationFreshness(observation,atUTC);
  const status:LayerEvidenceStatus["status"]=observation.kind==="measured"?"measured-observed":
    observation.kind==="forecast"?"forecast":
    observation.kind==="climatology"?"climatological-reference":
    observation.kind==="synthetic-model"?"synthetic-model":"representative-only";
  const evidence=observationEvidenceClass(observation.kind);
  const stale=freshness==="stale"||freshness==="expired"||freshness==="not-yet-valid";
  return Object.freeze({
    status,freshness,label:observation.label,
    limitations:stale
      ? "This source is stale, expired or not yet valid for the selected timestamp. Do not present it as a current observation."
      : evidence==="representative-only"
        ? "Representative geometry only; not measured reality."
        : observation.assumptions.join(" ")||"Use the attached source metadata and model validity notes.",
  });
}
