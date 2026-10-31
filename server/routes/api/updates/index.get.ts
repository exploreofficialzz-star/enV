import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../src/lib/billing/http.server";
import { listPublicUpdates, UpdatesError } from "../../../../src/lib/updates/updates.server";

export default defineHandler(async (event) => {
  const request=event.req;
  if(request.method!=="GET")return jsonResponse({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  const url=new URL(request.url);
  try {
    const data=await listPublicUpdates({
      platform:url.searchParams.get("platform")??"web",
      channel:url.searchParams.get("channel")??"stable",
      version:url.searchParams.get("version"),
      limit:url.searchParams.get("limit")??5,
    });
    return jsonResponse({ok:true,data});
  } catch(error) {
    if(error instanceof UpdatesError)return jsonResponse({ok:false,error:error.code,message:error.message},error.status);
    return jsonResponse({ok:false,error:"UPDATES_UNAVAILABLE",message:"Product updates are temporarily unavailable."},503);
  }
});
