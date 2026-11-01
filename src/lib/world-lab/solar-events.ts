export type SolarEventStatus="normal"|"polar-day"|"polar-night";
export type ApproximateSolarEvents=Readonly<{
 dateUTC:string;latitudeDegrees:number;longitudeDegrees:number;
 status:SolarEventStatus;solarNoonUTC:string;
 sunriseUTC:string|null;sunsetUTC:string|null;daylightMinutes:number|null;
 method:"NOAA-general-solar-position-equations";
 horizonZenithDegrees:90.833;
 timeBasis:"UTC civil date; no UT1/TT conversion";
 validity:string;
}>;
const radians=(degrees:number)=>degrees*Math.PI/180;
const finite=(value:number)=>Number.isFinite(value);
function isLeapYear(year:number){return year%4===0&&(year%100!==0||year%400===0);}
function utcAtMinutes(dateUTC:string,minutes:number){
 const [year,month,day]=dateUTC.split("-").map(Number);
 return new Date(Date.UTC(year,month-1,day)+minutes*60_000).toISOString();
}
/**
 * Estimate apparent sunrise, sunset and solar noon with NOAA's general
 * solar-position equations. This is a daily planning/teaching approximation,
 * not an astronomical ephemeris or observed horizon measurement.
 */
export function approximateSolarEvents(dateUTC:string,latitudeDegrees:number,
 longitudeDegrees:number):ApproximateSolarEvents{
 if(typeof dateUTC!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(dateUTC))
  throw new Error("Solar date must be a calendar date in YYYY-MM-DD UTC form.");
 const [year,month,day]=dateUTC.split("-").map(Number);
 if(year<1800||year>2100)throw new Error("Solar approximation is supported only from 1800 through 2100.");
 const midnight=Date.parse(dateUTC+"T00:00:00.000Z");
 if(!Number.isFinite(midnight)||new Date(midnight).toISOString().slice(0,10)!==dateUTC)
  throw new Error("Solar date is not a valid Gregorian calendar day.");
 if(!finite(latitudeDegrees)||latitudeDegrees < -90||latitudeDegrees>90)
  throw new Error("Solar latitude must be finite and between -90° and 90°.");
 if(!finite(longitudeDegrees)||longitudeDegrees < -180||longitudeDegrees>180)
  throw new Error("Solar longitude must be finite and between -180° and 180°.");
 const dayOfYear=Math.floor((midnight-Date.UTC(year,0,1))/86_400_000)+1;
 const yearLength=isLeapYear(year)?366:365;
 // NOAA fractional year at 12:00 UTC for the selected civil date.
 const gamma=2*Math.PI/yearLength*(dayOfYear-1);
 const equationOfTimeMinutes=229.18*(0.000075+0.001868*Math.cos(gamma)-
  0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-
  0.040849*Math.sin(2*gamma));
 const declinationRadians=0.006918-0.399912*Math.cos(gamma)+
  0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+
  0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+
  0.00148*Math.sin(3*gamma);
 const latitude=radians(latitudeDegrees);
 const zenith=radians(90.833);
 const denominator=Math.cos(latitude)*Math.cos(declinationRadians);
 const cosHourAngle=Math.cos(zenith)/denominator-
  Math.tan(latitude)*Math.tan(declinationRadians);
 const solarNoonMinutes=720-4*longitudeDegrees-equationOfTimeMinutes;
 const solarNoonUTC=utcAtMinutes(dateUTC,solarNoonMinutes);
 if(!finite(cosHourAngle)||!finite(solarNoonMinutes))
  throw new Error("Solar position exceeded the supported numerical range.");
 let status:SolarEventStatus="normal";
 let sunriseUTC:string|null=null,sunsetUTC:string|null=null,daylightMinutes:number|null=null;
 if(cosHourAngle>1+1e-12){
  status="polar-night";
 }else if(cosHourAngle < -1-1e-12){
  status="polar-day";
 }else{
  const hourAngleDegrees=Math.acos(Math.max(-1,Math.min(1,cosHourAngle)))*180/Math.PI;
  const sunriseMinutes=solarNoonMinutes-4*hourAngleDegrees;
  const sunsetMinutes=solarNoonMinutes+4*hourAngleDegrees;
  sunriseUTC=utcAtMinutes(dateUTC,sunriseMinutes);
  sunsetUTC=utcAtMinutes(dateUTC,sunsetMinutes);
  daylightMinutes=(sunsetMinutes-sunriseMinutes);
 }
 return Object.freeze({
  dateUTC,latitudeDegrees,longitudeDegrees,status,solarNoonUTC,
  sunriseUTC,sunsetUTC,daylightMinutes,method:"NOAA-general-solar-position-equations",
  horizonZenithDegrees:90.833,
  timeBasis:"UTC civil date; no UT1/TT conversion",
  validity:"Approximate solar geometry for 1800–2100 using a standard 0.833° apparent-horizon correction. No local terrain, elevation horizon, weather, pressure, humidity, measured solar data, Earth-orientation parameters, leap-second table or precision ephemeris is included.",
 });
}
