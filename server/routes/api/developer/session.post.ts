import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, readJsonObject } from "../../../../src/lib/billing/http.server";
import { createDeveloperAdminSession, DeveloperAdminError } from "../../../../src/lib/developer-admin.server";

export default defineHandler(async (event) => {
  const request=event.req;
  const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
  if(request.method!=="POST")return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}),{status:405,headers});
  if(!isSameOriginRequest(request))return new Response(JSON.stringify({ok:false,error:"CROSS_ORIGIN_REQUEST_BLOCKED"}),{status:403,headers});
  const body=await readJsonObject(request,4096);
  if(!body)return new Response(JSON.stringify({ok:false,error:"INVALID_JSON",message:"Enter the developer workspace password."}),{status:400,headers});
  try{
    const session=await createDeveloperAdminSession(request,body);
    return new Response(JSON.stringify({ok:true,data:{expiresAt:session.expiresAt}}),{status:200,headers:{...headers,"set-cookie":session.setCookie}});
  }catch(error){
    const status=error instanceof DeveloperAdminError?error.status:503;
    const code=error instanceof DeveloperAdminError?error.code:"DEVELOPER_ADMIN_LOGIN_UNAVAILABLE";
    const message=error instanceof DeveloperAdminError?error.message:"Developer sign-in is temporarily unavailable.";
    return new Response(JSON.stringify({ok:false,error:code,message}),{status,headers});
  }
});
