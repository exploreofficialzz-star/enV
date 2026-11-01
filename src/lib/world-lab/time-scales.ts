export type EarthOrientationQuality="observed"|"predicted";
export type EarthOrientationSample=Readonly<{
 utcDay:string;mjd:number;ut1MinusUtcSeconds:number;uncertaintySeconds:number;
 quality:EarthOrientationQuality;
}>;
export type IersBulletinASeries=Readonly<{
 format:"env-iers-bulletin-a-series";schemaVersion:1;
 source:"IERS Bulletin A";
 volume:string;number:number;issuedDateUTC:string;
 algorithm:string;
 validFromUTC:string;validThroughUTC:string;
 samples:readonly EarthOrientationSample[];
}>;
export type TimeScaleReading=Readonly<{
 utc:string;tai:string;tt:string;ut1:string;
 taiMinusUtcSeconds:number;ttMinusUtcSeconds:number;ut1MinusUtcSeconds:number;
 ut1UncertaintySeconds:number;earthOrientationQuality:EarthOrientationQuality;
 earthOrientationSource:string;earthOrientationBulletin:string;
 earthOrientationIssuedDateUTC:string;
}>;
const DAY_MS=86_400_000;
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"] as const;
const finite=(value:number)=>Number.isFinite(value);
const LEAP_ROWS:readonly (readonly [string,number])[]=Object.freeze([
 ["1972-01-01",10],["1972-07-01",11],["1973-01-01",12],["1974-01-01",13],
 ["1975-01-01",14],["1976-01-01",15],["1977-01-01",16],["1978-01-01",17],
 ["1979-01-01",18],["1980-01-01",19],["1981-07-01",20],["1982-07-01",21],
 ["1983-07-01",22],["1985-07-01",23],["1988-01-01",24],["1990-01-01",25],
 ["1991-01-01",26],["1992-07-01",27],["1993-07-01",28],["1994-07-01",29],
 ["1996-01-01",30],["1997-07-01",31],["1999-01-01",32],["2006-01-01",33],
 ["2009-01-01",34],["2012-07-01",35],["2015-07-01",36],["2017-01-01",37],
]);
export const IERS_TIME_SCALE_PROVENANCE=Object.freeze({
 leapSecondSource:"USNO/IERS tai-utc.dat",
 leapSecondSourceURL:"https://maia.usno.navy.mil/ser7/tai-utc.dat",
 leapSecondNoticeSource:"IERS Bulletin A Volume XXXIX Number 044, issued 2026-10-29",
 leapSecondNoticeURL:"https://maia.usno.navy.mil/ser7/ser7.dat",
 taiMinusUtcValidThroughUTC:"2027-01-01T00:00:00.000Z",
 ttDefinition:"TT = TAI + 32.184 seconds exactly",
});
function utcMilliseconds(value:string):number{
 if(typeof value!=="string"||!value.endsWith("Z"))throw new Error("Time-scale input must be an explicit UTC timestamp ending in Z.");
 const valueMs=Date.parse(value);
 if(!finite(valueMs))throw new Error("Time-scale input is not a valid UTC timestamp.");
 return valueMs;
}
function isoWithScale(milliseconds:number,scale:"TAI"|"TT"|"UT1"){
 if(!finite(milliseconds))throw new Error("Converted time is outside the supported range.");
 return new Date(milliseconds).toISOString().replace("Z"," "+scale);
}
function taiMinusUtcAt(milliseconds:number):number{
 const validThrough=Date.parse(IERS_TIME_SCALE_PROVENANCE.taiMinusUtcValidThroughUTC);
 if(milliseconds<Date.parse("1972-01-01T00:00:00.000Z")||milliseconds>validThrough)
  throw new Error("TAI−UTC is not certified by the bundled IERS leap-second data for this date. Update the leap-second table before continuing.");
 let offset:number|undefined;
 for(const [date,value] of LEAP_ROWS)if(milliseconds>=Date.parse(date+"T00:00:00.000Z"))offset=value;else break;
 if(offset===undefined)throw new Error("No authoritative TAI−UTC offset is available for this date.");
 return offset;
}
export function utcToTaiTt(value:string):Readonly<{
 utc:string;tai:string;tt:string;taiMinusUtcSeconds:number;ttMinusUtcSeconds:number;
 leapTableSource:string;leapTableValidThroughUTC:string;
}>{
 const milliseconds=utcMilliseconds(value),offset=taiMinusUtcAt(milliseconds);
 return Object.freeze({
  utc:new Date(milliseconds).toISOString(),
  tai:isoWithScale(milliseconds+offset*1000,"TAI"),
  tt:isoWithScale(milliseconds+(offset+32.184)*1000,"TT"),
  taiMinusUtcSeconds:offset,ttMinusUtcSeconds:offset+32.184,
  leapTableSource:IERS_TIME_SCALE_PROVENANCE.leapSecondSource,
  leapTableValidThroughUTC:IERS_TIME_SCALE_PROVENANCE.taiMinusUtcValidThroughUTC,
 });
}
function makeSeries(rows:EarthOrientationSample[],volume:string,number:number,issuedDateUTC:string,algorithm:string):IersBulletinASeries{
 rows.sort((a,b)=>a.mjd-b.mjd);
 if(rows.length<2)throw new Error("IERS Bulletin A must contain at least two consecutive Earth-orientation samples.");
 for(let i=0;i<rows.length;i++){
  const row=rows[i];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.utcDay)||!Number.isSafeInteger(row.mjd)||
   !finite(row.ut1MinusUtcSeconds)||Math.abs(row.ut1MinusUtcSeconds)>1||
   !finite(row.uncertaintySeconds)||row.uncertaintySeconds<0||row.uncertaintySeconds>1||
   !["observed","predicted"].includes(row.quality))
   throw new Error("IERS Earth-orientation row contains invalid values.");
  const midnight=Date.parse(row.utcDay+"T00:00:00.000Z");
  if(!finite(midnight)||new Date(midnight).toISOString().slice(0,10)!==row.utcDay||
   Math.floor(midnight/DAY_MS)+40587!==row.mjd)
   throw new Error("IERS MJD does not match its UTC calendar date.");
  if(i>0&&(rows[i-1].mjd+1!==row.mjd||rows[i-1].utcDay===row.utcDay))
   throw new Error("IERS Earth-orientation samples must be unique and daily consecutive.");
 }
 return Object.freeze({
  format:"env-iers-bulletin-a-series",schemaVersion:1,source:"IERS Bulletin A",
  volume,number,issuedDateUTC,algorithm,
  validFromUTC:rows[0].utcDay+"T00:00:00.000Z",
  validThroughUTC:rows[rows.length-1].utcDay+"T00:00:00.000Z",
  samples:Object.freeze(rows.map(row=>Object.freeze({...row}))),
 });
}
/** Parse the published plain-text IERS RS/PC Bulletin A (ser7.dat) without losing provenance. */
export function parseIersBulletinA(rawText:string):IersBulletinASeries{
 if(typeof rawText!=="string"||rawText.length<100||rawText.length>2_000_000||
  !/I\\s*E\\s*R\\s*S\\s+B\\s*U\\s*L\\s*L\\s*E\\s*T\\s*I\\s*N\\s*[-–]\\s*A/i.test(rawText))
  throw new Error("Import must be the official plain-text IERS Bulletin A product (ser7.dat).");
 const header=rawText.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s+Vol\.\s+([IVXLCDM]+)\s+No\.\s*(\d+)/i);
 if(!header)throw new Error("IERS Bulletin A issue date and bulletin number could not be identified.");
 const day=Number(header[1]),month=MONTHS.findIndex(value=>value.toLowerCase()===header[2].toLowerCase())+1,year=Number(header[3]);
 const issuedDateUTC=[year,String(month).padStart(2,"0"),String(day).padStart(2,"0")].join("-");
 const issuedMs=Date.parse(issuedDateUTC+"T00:00:00.000Z");
 if(!finite(issuedMs)||new Date(issuedMs).toISOString().slice(0,10)!==issuedDateUTC)
  throw new Error("IERS bulletin issue date is invalid.");
 let inCombined=false,inPredictions=false;
 const rows:EarthOrientationSample[]=[];
 let lastObservedMjd:number|null=null;
 let algorithm="IERS Rapid Service/Prediction Centre source-defined algorithm";
 const lines=rawText.split(/\r?\n/);
 for(const line of lines){
  if(/COMBINED EARTH ORIENTATION PARAMETERS/i.test(line))inCombined=true;
  if(/^\s*PREDICTIONS\s*:/i.test(line))inPredictions=true;
  if(/Kalman smoother and weighted cubic spline/i.test(line))
   algorithm="IERS Rapid Service Kalman smoother and weighted cubic spline";
  if(!inCombined)continue;
  const tokens=line.trim().split(/\s+/);
  if(!inPredictions&&tokens.length>=10&&/^\d{2}$/.test(tokens[0])&&
    /^\d{1,2}$/.test(tokens[1])&&/^\d{1,2}$/.test(tokens[2])&&/^\d{5}$/.test(tokens[3])){
   const shortYear=Number(tokens[0]),rowYear=shortYear<50?2000+shortYear:1900+shortYear;
   const month=Number(tokens[1]),rowDay=Number(tokens[2]),mjd=Number(tokens[3]);
   const ut1=Number(tokens[8]),sigma=Number(tokens[9]);
   const date=[rowYear,String(month).padStart(2,"0"),String(rowDay).padStart(2,"0")].join("-");
   rows.push({utcDay:date,mjd,ut1MinusUtcSeconds:ut1,uncertaintySeconds:sigma,quality:"observed"});
   lastObservedMjd=mjd;
   continue;
  }
  if(inPredictions&&tokens.length>=7&&/^\d{4}$/.test(tokens[0])&&
    /^\d{1,2}$/.test(tokens[1])&&/^\d{1,2}$/.test(tokens[2])&&/^\d{5}$/.test(tokens[3])){
   const rowYear=Number(tokens[0]),month=Number(tokens[1]),rowDay=Number(tokens[2]),mjd=Number(tokens[3]);
   const lastObserved=lastObservedMjd;
   if(lastObserved===null)throw new Error("IERS prediction rows require a preceding observed Earth-orientation sample.");
   const ut1=Number(tokens[6]),daysAfterLastObservation=mjd-lastObserved;
   if(daysAfterLastObservation<=0)throw new Error("IERS prediction date must follow the last observed sample.");
   const date=[rowYear,String(month).padStart(2,"0"),String(rowDay).padStart(2,"0")].join("-");
   // Bulletin A's stated prediction-error law: S_t = 0.00025 × (MJD − 61342)^0.75 seconds.
   const sigma=0.00025*Math.pow(daysAfterLastObservation,0.75);
   rows.push({utcDay:date,mjd,ut1MinusUtcSeconds:ut1,uncertaintySeconds:sigma,quality:"predicted"});
  }
 }
 if(!rows.some(row=>row.quality==="observed")||!rows.some(row=>row.quality==="predicted"))
  throw new Error("Bulletin A must include both rapid-service observations and prediction rows.");
 return makeSeries(rows,header[4],Number(header[5]),issuedDateUTC,algorithm);
}
export function utcToUt1(value:string,series:IersBulletinASeries):Readonly<{
 utc:string;ut1:string;ut1MinusUtcSeconds:number;uncertaintySeconds:number;
 quality:EarthOrientationQuality;bulletin:string;issuedDateUTC:string;
}>{
 if(series.format!=="env-iers-bulletin-a-series"||series.schemaVersion!==1||series.source!=="IERS Bulletin A"||
  !Array.isArray(series.samples)||series.samples.length<2)
  throw new Error("Earth-orientation series format or schema is unsupported.");
 const milliseconds=utcMilliseconds(value),first=Date.parse(series.validFromUTC),last=Date.parse(series.validThroughUTC);
 if(milliseconds<first||milliseconds>last)
  throw new Error("UT1−UTC is unavailable outside the imported IERS Bulletin A coverage.");
 let index=0;
 while(index<series.samples.length-1&&Date.parse(series.samples[index+1].utcDay+"T00:00:00.000Z")<=milliseconds)index++;
 const left=series.samples[index],right=series.samples[index+1];
 if(!right&&milliseconds===last)return Object.freeze({
  utc:new Date(milliseconds).toISOString(),
  ut1:isoWithScale(milliseconds+left.ut1MinusUtcSeconds*1000,"UT1"),
  ut1MinusUtcSeconds:left.ut1MinusUtcSeconds,uncertaintySeconds:left.uncertaintySeconds,
  quality:left.quality,bulletin:"Volume "+series.volume+" No. "+series.number,
  issuedDateUTC:series.issuedDateUTC,
 });
 if(!right)throw new Error("An adjacent IERS sample is required to interpolate UT1−UTC.");
 const leftMs=Date.parse(left.utcDay+"T00:00:00.000Z"),fraction=(milliseconds-leftMs)/DAY_MS;
 if(fraction<0||fraction>1)throw new Error("IERS interpolation interval is invalid.");
 const dut1=left.ut1MinusUtcSeconds+(right.ut1MinusUtcSeconds-left.ut1MinusUtcSeconds)*fraction;
 const sigma=Math.sqrt((1-fraction)**2*left.uncertaintySeconds**2+fraction**2*right.uncertaintySeconds**2);
 const quality=left.quality==="predicted"||right.quality==="predicted"?"predicted":"observed";
 return Object.freeze({
  utc:new Date(milliseconds).toISOString(),ut1:isoWithScale(milliseconds+dut1*1000,"UT1"),
  ut1MinusUtcSeconds:dut1,uncertaintySeconds:sigma,quality,
  bulletin:"Volume "+series.volume+" No. "+series.number,issuedDateUTC:series.issuedDateUTC,
 });
}
/** IAU 2000 Resolution B1.9 rate constant: dTT/dTCG = 1 − LG. */
export const IAU_LG=6.969290134e-10;
/** IAU 2006 Resolution B3 defining constants for the linear TCB ↔ TDB relation. */
export const IAU_LB=1.550519768e-8;
export const IAU_TDB0_SECONDS=-6.55e-5;
/** 1977-01-01 00:00:00 TAI at the geocentre, expressed as the TT/TCG MJD reference. */
export const IAU_REFERENCE_MJD=43144.0003725;
const MAX_EXTENDED_MJD=1_000_000_000;
function boundedMjd(value:number,label:string):number{
 if(!finite(value)||Math.abs(value)>MAX_EXTENDED_MJD)
  throw new Error(label+" must be a finite MJD within ±1,000,000,000 days.");
 return value;
}
export function ttMjdToTcgMjd(ttMjd:number):number{
 const value=boundedMjd(ttMjd,"TT MJD");
 return IAU_REFERENCE_MJD+(value-IAU_REFERENCE_MJD)/(1-IAU_LG);
}
export function tcgMjdToTtMjd(tcgMjd:number):number{
 const value=boundedMjd(tcgMjd,"TCG MJD");
 return IAU_REFERENCE_MJD+(value-IAU_REFERENCE_MJD)*(1-IAU_LG);
}
/** IAU 2006 Resolution B3: TDB = TCB − LB·(JD_TCB−T0)·86400 + TDB0. */
export function tcbMjdToTdbMjd(tcbMjd:number):number{
 const value=boundedMjd(tcbMjd,"TCB MJD");
 return IAU_REFERENCE_MJD+(value-IAU_REFERENCE_MJD)*(1-IAU_LB)+IAU_TDB0_SECONDS/86_400;
}
export function tdbMjdToTcbMjd(tdbMjd:number):number{
 const value=boundedMjd(tdbMjd,"TDB MJD");
 return IAU_REFERENCE_MJD+(value-IAU_REFERENCE_MJD-IAU_TDB0_SECONDS/86_400)/(1-IAU_LB);
}
/** UTC→TCG is bounded by the validity of the bundled UTC↔TAI leap-second table. */
export function utcToTcg(value:string):Readonly<{utc:string;tt:string;tcg:string;ttMjd:number;tcgMjd:number;source:string;referenceEvent:string}>{
 const base=utcToTaiTt(value);
 const ttMilliseconds=Date.parse(base.tt.replace(" TT",""));
 if(!finite(ttMilliseconds))throw new Error("TT instant could not be represented for TCG conversion.");
 const ttMjd=ttMilliseconds/DAY_MS+40587;
 const tcgMjd=ttMjdToTcgMjd(ttMjd);
 const tcgMilliseconds=(tcgMjd-40587)*DAY_MS;
 return Object.freeze({utc:base.utc,tt:base.tt,tcg:isoWithScale(tcgMilliseconds,"TCG"),
  ttMjd,tcgMjd,source:"IAU 2000 Resolution B1.9",
  referenceEvent:"1977-01-01T00:00:00 TAI at the geocentre"});
}
export function convertUtcToTimeScales(value:string,series:IersBulletinASeries):TimeScaleReading{
 const base=utcToTaiTt(value),earth=utcToUt1(value,series);
 return Object.freeze({
  utc:base.utc,tai:base.tai,tt:base.tt,ut1:earth.ut1,
  taiMinusUtcSeconds:base.taiMinusUtcSeconds,ttMinusUtcSeconds:base.ttMinusUtcSeconds,
  ut1MinusUtcSeconds:earth.ut1MinusUtcSeconds,ut1UncertaintySeconds:earth.uncertaintySeconds,
  earthOrientationQuality:earth.quality,earthOrientationSource:"IERS Bulletin A",
  earthOrientationBulletin:earth.bulletin,earthOrientationIssuedDateUTC:earth.issuedDateUTC,
 });
}
