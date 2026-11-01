import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../src/lib/billing/http.server";
import { CommunityError, runCommunityRetention } from "../../../../src/lib/community/community.server";

export default defineHandler(async (event) => {
  const request=event.req;
  if(request.method!=="GET")return jsonResponse({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  try{return jsonResponse({ok:true,data:await runCommunityRetention(request)});}
  catch(error){
    if(error instanceof CommunityError)return jsonResponse({ok:false,error:error.code,message:error.message},error.status);
    return jsonResponse({ok:false,error:"COMMUNITY_RETENTION_FAILED",message:"Community retention could not complete."},503);
  }
});
