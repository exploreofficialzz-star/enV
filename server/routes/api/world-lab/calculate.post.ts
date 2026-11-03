import {randomUUID} from "node:crypto";
import {defineHandler} from "nitro/h3";
import {auth,authConfigured,authConfigurationError} from "../../../../src/lib/auth/server";
import {runBoundedWorldLabOperation} from "../../../../src/lib/world-lab/server-compute";

const MAX_BODY_BYTES=64*1024;
const MAX_RESPONSE_BYTES=2*1024*1024;
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"content-type":"application/json; charset=utf-8",
    "cache-control":"no-store","x-content-type-options":"nosniff"},
});
async function readBoundedJson(request:Request):Promise<unknown> {
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new Error("Send a JSON scientific request.");
  const reader=request.body?.getReader();
  if(!reader)throw new Error("Scientific request has no body.");
  const decoder=new TextDecoder("utf-8",{fatal:true});
  let bytes=0,text="";
  for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    bytes+=value.byteLength;
    if(bytes>MAX_BODY_BYTES){
      await reader.cancel();
      throw new Error("Scientific project requests are limited to 64 KB.");
    }
    text+=decoder.decode(value,{stream:true});
  }
  text+=decoder.decode();
  try{return JSON.parse(text) as unknown;}
  catch{throw new Error("Scientific request is not valid JSON.");}
}
/**
 * A deliberately DISABLED-BY-DEFAULT, authenticated synchronous calculation
 * entry point. It is NOT the durable queued cloud-solver service from WP-06.
 * No development-user fallback, no cross-origin credentials, no unbounded
 * ingestion, no user-supplied code execution and no storage side effects.
 */
export default defineHandler(async event=>{
  const request=event.req;
  const requestId=randomUUID();
  if(request.method!=="POST")
    return respond({ok:false,code:"METHOD_NOT_ALLOWED",requestId},405);
  if(process.env.WORLD_LAB_SERVER_COMPUTE_ENABLED!=="true"||
      !authConfigured||authConfigurationError)
    return respond({ok:false,code:"COMPUTE_NOT_CONFIGURED",
      error:"World Lab server calculation is not enabled for this deployment.",requestId},503);
  const expected=process.env.BETTER_AUTH_URL?.trim();
  let safeOrigin="";
  try{safeOrigin=new URL(expected||request.url).origin;}
  catch{return respond({ok:false,code:"ORIGIN_NOT_CONFIGURED",requestId},503);}
  if(!expected && process.env.NODE_ENV==="production")
    return respond({ok:false,code:"ORIGIN_NOT_CONFIGURED",requestId},503);
  const origin=request.headers.get("origin");
  if(!origin||origin!==safeOrigin||
    !["same-origin","none",null].includes(request.headers.get("sec-fetch-site")))
    return respond({ok:false,code:"CROSS_ORIGIN_BLOCKED",requestId},403);
  let userId:string|undefined;
  try{
    const session=await auth.api.getSession({headers:request.headers});
    userId=session?.user?.id;
  }catch{
    return respond({ok:false,code:"SESSION_UNAVAILABLE",requestId},503);
  }
  if(!userId)return respond({ok:false,code:"AUTH_REQUIRED",requestId},401);
  try{
    const body=await readBoundedJson(request);
    const result=runBoundedWorldLabOperation(body);
    const content=JSON.stringify({ok:true,requestId,...result});
    if(Buffer.byteLength(content,"utf8")>MAX_RESPONSE_BYTES)
      return respond({ok:false,code:"RESULT_LIMIT",requestId,
        error:"This calculation exceeded the bounded response budget."},413);
    return new Response(content,{status:200,headers:{
      "content-type":"application/json; charset=utf-8","cache-control":"no-store",
      "x-content-type-options":"nosniff",
    }});
  }catch(err){
    const message=err instanceof Error?err.message:"Invalid scientific inputs.";
    // An input or solver error has no sensitive stack or account details.
    return respond({ok:false,code:"SCIENTIFIC_INPUT_REJECTED",
      error:message.slice(0,300),requestId},400);
  }
});
