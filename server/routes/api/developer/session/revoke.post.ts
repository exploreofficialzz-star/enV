import { defineHandler } from "nitro/h3";
import { isSameOriginRequest } from "../../../../../src/lib/billing/http.server";
import { revokeDeveloperAdminSession } from "../../../../../src/lib/developer-admin.server";

export default defineHandler(async (event) => {
  const request=event.req;
  const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
  if(request.method!=="POST")return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}),{status:405,headers});
  if(!isSameOriginRequest(request))return new Response(JSON.stringify({ok:false,error:"CROSS_ORIGIN_REQUEST_BLOCKED"}),{status:403,headers});
  return new Response(JSON.stringify({ok:true,data:{revoked:true}}),{status:200,headers:{...headers,"set-cookie":revokeDeveloperAdminSession()}});
});
