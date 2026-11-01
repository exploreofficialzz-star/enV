import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, readJsonObject } from "../../../../../src/lib/billing/http.server";
import { CommunityError, moderateCommunityReport } from "../../../../../src/lib/community/community.server";

export default defineHandler(async (event) => {
  const request=event.req;
  if(request.method!=="POST")return jsonResponse({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  if(!isSameOriginRequest(request))return jsonResponse({ok:false,error:"CROSS_ORIGIN_REQUEST_BLOCKED"},403);
  const body=await readJsonObject(request,4096);
  if(!body)return jsonResponse({ok:false,error:"INVALID_JSON",message:"The moderation decision is invalid."},400);
  try{return jsonResponse({ok:true,data:await moderateCommunityReport(request,body)});}
  catch(error){
    if(error instanceof CommunityError)return jsonResponse({ok:false,error:error.code,message:error.message},error.status);
    return jsonResponse({ok:false,error:"COMMUNITY_MODERATION_UPDATE_UNAVAILABLE",message:"The moderation decision could not be saved."},503);
  }
});
