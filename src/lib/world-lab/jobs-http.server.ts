/** Shared fail-closed authentication for owned World Lab job requests. */
import {randomUUID} from "node:crypto";
import {auth,authConfigured,authConfigurationError} from "../auth/server";
import {readBoundedJsonObject} from "../billing/bounded-json.server";
export const respond=(body:unknown,status=200):Response=>new Response(JSON.stringify(body),{
  status,headers:{"content-type":"application/json; charset=utf-8",
    "cache-control":"no-store","x-content-type-options":"nosniff"},
});
export async function authorizeWorldLabJobRequest(request:Request):Promise<{
  requestId:string;userId:string|null;error:Response|null;
}> {
  const requestId=randomUUID();
  const fail=(code:string,status:number)=>({
    requestId,userId:null,error:respond({ok:false,code,requestId},status),
  });
  if(process.env.WORLD_LAB_JOBS_ENABLED!=="true"||
     !process.env.DATABASE_URL?.trim()||!authConfigured||authConfigurationError)
    return fail("JOBS_NOT_CONFIGURED",503);
  const configuredOrigin=process.env.BETTER_AUTH_URL?.trim();
  if(!configuredOrigin&&process.env.NODE_ENV==="production")
    return fail("ORIGIN_NOT_CONFIGURED",503);
  let expected="";
  try{expected=new URL(configuredOrigin||request.url).origin;}catch{
    return fail("ORIGIN_NOT_CONFIGURED",503);
  }
  const site=request.headers.get("sec-fetch-site");
  const origin=request.headers.get("origin");
  if((site&&site!=="same-origin"&&site!=="none")||
    (origin&&origin!==expected)||
    (request.method!=="GET"&&origin!==expected))
    return fail("CROSS_ORIGIN_BLOCKED",403);
  try{
    const session=await auth.api.getSession({headers:request.headers});
    if(!session?.user?.id)return fail("AUTH_REQUIRED",401);
    return {requestId,userId:session.user.id,error:null};
  }catch{return fail("SESSION_UNAVAILABLE",503);}
}
export const readJobBody=(request:Request)=>readBoundedJsonObject(request,64*1024);
export function exposedJob(row:{
  id:string;kind:string;project_id:string;project_revision:number;
  status:string;attempts:number;result_json:unknown|null;error_code:string|null;
  created_at:Date|string;started_at:Date|string|null;completed_at:Date|string|null;
}){
  return {id:row.id,kind:row.kind,projectId:row.project_id,
    projectRevision:row.project_revision,status:row.status,attempts:row.attempts,
    createdAt:row.created_at,startedAt:row.started_at,
    completedAt:row.completed_at,errorCode:row.error_code,
    result:row.status==="succeeded"?row.result_json:null};
}
