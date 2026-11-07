import { defineHandler } from "nitro/h3";
import { isSameOriginRequest } from "../../../../../../src/lib/billing/http.server";
import { clearAnalyticsDashboardCookie, revokeAnalyticsDashboardSession } from "../../../../../../src/lib/analytics/analytics.server";

export default defineHandler(async (event) => {
  const request=event.req;
  if(request.method!=="POST")return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}),{status:405,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  if(!isSameOriginRequest(request))return new Response(JSON.stringify({ok:false,error:"CROSS_ORIGIN_REQUEST_BLOCKED"}),{status:403,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  const clearCookie = clearAnalyticsDashboardCookie();
  try {
    await revokeAnalyticsDashboardSession(request);
    return new Response(JSON.stringify({ok:true,data:{revoked:true}}),{
      status:200,
      headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","set-cookie":clearCookie},
    });
  } catch {
    // Clear the browser copy even when the database cannot confirm server revocation.
    // The non-2xx response keeps the UI honest about the incomplete server-side action.
    return new Response(JSON.stringify({ok:false,error:"ANALYTICS_SESSION_REVOCATION_UNAVAILABLE",message:"The browser session was cleared, but server-side revocation could not be confirmed."}),{
      status:503,
      headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","set-cookie":clearCookie},
    });
  }
});
