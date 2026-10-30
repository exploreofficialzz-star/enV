import { ANALYTICS_POLICY_VERSION, validateEventsPayload } from "./protocol.mjs";
import type { AnalyticsEventInput } from "./protocol.mjs";

type Consent = "granted" | "denied" | "unset";
const KEYS={choice:"env.analytics.choice.v1",subject:"env.analytics.subject.v1",session:"env.analytics.session.v1",queue:"env.analytics.queue.v1",revoke:"env.analytics.revoke.v1"};
let flush:Promise<void>|null=null;
function storage(){try{return typeof window==="undefined"?null:window.localStorage;}catch{return null;}}
function get(key:string){try{return storage()?.getItem(key)??null;}catch{return null;}}
function set(key:string,value:string){try{storage()?.setItem(key,value);}catch{}}
function remove(key:string){try{storage()?.removeItem(key);}catch{}}
function id(){try{return typeof crypto!="undefined"&&crypto.randomUUID?crypto.randomUUID():null;}catch{return null;}}
function subject(){return get(KEYS.subject);}
function session(){try{let value=sessionStorage.getItem(KEYS.session);if(!value){value=id();if(value)sessionStorage.setItem(KEYS.session,value);}return value;}catch{return null;}}
function queue():AnalyticsEventInput[]{try{const raw=get(KEYS.queue);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed.slice(-25):[];}catch{return [];}}
function save(items:AnalyticsEventInput[]){set(KEYS.queue,JSON.stringify(items.slice(-25)));}
export function getAnalyticsConsent():Consent{const value=get(KEYS.choice);return value==="granted"||value==="denied"?value:"unset";}
async function postConsent(subjectId:string,granted:boolean){const response=await fetch("/api/analytics/consent",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({subjectId,platform:"web",granted,policyVersion:ANALYTICS_POLICY_VERSION})});if(!response.ok)throw new Error("The analytics preference could not be saved.");}
export async function chooseAnalyticsConsent(granted:boolean){
 const old=subject();
 if(!granted){set(KEYS.choice,"denied");remove(KEYS.queue);remove(KEYS.session);remove(KEYS.subject);if(old){try{await postConsent(old,false);remove(KEYS.revoke);}catch{set(KEYS.revoke,old);}}return;}
 const current=old??id();if(!current)throw new Error("This browser cannot create a secure analytics installation ID.");
 await postConsent(current,true);set(KEYS.subject,current);set(KEYS.choice,"granted");void flushAnalyticsEvents();
}
export function recordAnalyticsEvent(event:Omit<AnalyticsEventInput,"eventId"|"occurredAt">){
 if(typeof window==="undefined"||getAnalyticsConsent()!=="granted")return;
 const subjectId=subject(),sessionId=session(),eventId=id();if(!subjectId||!sessionId||!eventId)return;
 const nav=navigator as Navigator&{connection?:{type?:string;effectiveType?:string}};
 const width=innerWidth,connection=nav.connection;
 const normalized={...event,eventId,occurredAt:new Date().toISOString(),isOffline:navigator.onLine===false,
  networkType:connection?.type==="wifi"?"wifi":connection?.type==="cellular"?"cellular":connection?.type==="ethernet"?"ethernet":"unknown",
  networkEffectiveType:["slow-2g","2g","3g","4g"].includes(connection?.effectiveType??"")?connection!.effectiveType:"unknown",
  deviceClass:width<640?"phone":width<1024?"tablet":"desktop"} as AnalyticsEventInput;
 try{const valid=validateEventsPayload({subjectId,platform:"web",policyVersion:ANALYTICS_POLICY_VERSION,events:[normalized]}).events[0];save([...queue(),valid]);if(navigator.onLine!==false)void flushAnalyticsEvents();}catch{/* Unsafe/unknown event metadata is discarded. */}
}
async function retryRevoke(){const pending=get(KEYS.revoke);if(!pending||navigator.onLine===false)return;try{await postConsent(pending,false);remove(KEYS.revoke);}catch{}}
export async function flushAnalyticsEvents(){
 if(typeof window==="undefined"||navigator.onLine===false)return;if(flush)return flush;
 flush=(async()=>{await retryRevoke();if(getAnalyticsConsent()!=="granted")return;const subjectId=subject(),sessionId=session();if(!subjectId||!sessionId)return;
 const batch=queue().slice(0,25);if(!batch.length)return;
 const response=await fetch("/api/analytics/events",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-env-analytics-session":sessionId},body:JSON.stringify({subjectId,platform:"web",policyVersion:ANALYTICS_POLICY_VERSION,events:batch})});
 if(response.ok){const sent=new Set(batch.map(e=>e.eventId));save(queue().filter(e=>!sent.has(e.eventId)));}
 })().catch(()=>undefined).finally(()=>{flush=null;});return flush;
}
