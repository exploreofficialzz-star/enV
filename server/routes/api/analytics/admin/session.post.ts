import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, readJsonObject } from "../../../../../src/lib/billing/http.server";
import { AnalyticsError, createAnalyticsDashboardSession } from "../../../../../src/lib/analytics/analytics.server";

export default defineHandler(async (event) => {
  const request=event.req;
  if(request.method!=="POST")return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}),{status:405,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  if(!isSameOriginRequest(request))return new Response(JSON.stringify({ok:false,error:"CROSS_ORIGIN_REQUEST_BLOCKED"}),{status:403,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  const body=await readJsonObject(request,4096);
  if(!body)return new Response(JSON.stringify({ok:false,error:"INVALID_JSON",message:"Enter the developer dashboard password."}),{status:400,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  try {
    const session=await createAnalyticsDashboardSession(request,body);
    return new Response(JSON.stringify({ok:true,data:{expiresAt:session.expiresAt}}),{
      status:200,
      headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","set-cookie":session.setCookie},
    });
  } catch(error) {
    const status=error instanceof AnalyticsError?error.status:503;
    const code=error instanceof AnalyticsError?error.code:"ANALYTICS_DASHBOARD_LOGIN_UNAVAILABLE";
    const message=error instanceof AnalyticsError?error.message:"Dashboard sign-in is temporarily unavailable.";
    return new Response(JSON.stringify({ok:false,error:code,message}),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  }
});
