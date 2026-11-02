import {randomUUID} from "node:crypto";
import {auth,authConfigured,authConfigurationError} from "../auth/server";
import {readBoundedJsonObject} from "../billing/bounded-json.server";
export function backupResponse(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store","x-content-type-options":"nosniff",
  }});
}
export async function authorizeBackupRequest(req:Request){
  const requestId=randomUUID();
  const fail=(status:number,code:string)=>({
    requestId,userId:null,error:backupResponse({ok:false,requestId,code},status),
  });
  if(process.env.WORLD_LAB_PROJECT_SYNC_ENABLED!=="true"||
     !process.env.DATABASE_URL?.trim()||!authConfigured||authConfigurationError)
    return fail(503,"SYNC_NOT_CONFIGURED");
  const explicit=process.env.BETTER_AUTH_URL?.trim();
  if(!explicit&&process.env.NODE_ENV==="production")return fail(503,"ORIGIN_NOT_CONFIGURED");
  let expected="";
  try{expected=new URL(explicit||req.url).origin;}catch{return fail(503,"ORIGIN_NOT_CONFIGURED");}
  const site=req.headers.get("sec-fetch-site"),origin=req.headers.get("origin");
  if((site&&site!=="same-origin"&&site!=="none")||
    (origin&&origin!==expected)||(req.method!=="GET"&&origin!==expected))
    return fail(403,"CROSS_ORIGIN_BLOCKED");
  try{
    const session=await auth.api.getSession({headers:req.headers});
    if(!session?.user?.id)return fail(401,"AUTH_REQUIRED");
    return {requestId,userId:session.user.id,error:null};
  }catch{return fail(503,"SESSION_UNAVAILABLE");}
}
export const readBackupBody=(req:Request)=>
  readBoundedJsonObject(req,1_048_576);
export function backupSummary(row:{
  project_id:string;project_title:string;project_revision:number;
  server_revision:number;updated_at:string|Date;
}){
  return {projectId:row.project_id,title:row.project_title,
    projectRevision:row.project_revision,serverRevision:row.server_revision,
    updatedAt:row.updated_at};
}
