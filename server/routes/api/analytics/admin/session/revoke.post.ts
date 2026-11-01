import { defineHandler } from "nitro/h3";
import { isSameOriginRequest } from "../../../../../../src/lib/billing/http.server";
import { revokeAnalyticsDashboardSession } from "../../../../../../src/lib/analytics/analytics.server";

export default defineHandler(async (event) => {
  const request=event.req;
  if(request.method!=="POST")return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}),{status:405,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  if(!isSameOriginRequest(request))return new Response(JSON.stringify({ok:false,error:"CROSS_ORIGIN_REQUEST_BLOCKED"}),{status:403,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  return new Response(JSON.stringify({ok:true,data:{revoked:true}}),{
    status:200,
    headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","set-cookie":revokeAnalyticsDashboardSession()},
  });
});
