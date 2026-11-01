import { defineHandler } from "nitro/h3";
import { hasDeveloperAdminSession } from "../../../../src/lib/developer-admin.server";

export default defineHandler(async (event) => {
  const authenticated=hasDeveloperAdminSession(event.req);
  return new Response(JSON.stringify({ok:authenticated,data:authenticated?{authenticated:true}:undefined}),{
    status:authenticated?200:401,
    headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},
  });
});
