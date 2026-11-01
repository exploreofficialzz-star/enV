import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, readJsonObject } from "../../../../src/lib/billing/http.server";
import { CommunityError, recordCommunityView } from "../../../../src/lib/community/community.server";

export default defineHandler(async (event) => {
  const request=event.req;
  if(request.method!=="POST")return jsonResponse({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  if(!isSameOriginRequest(request))return jsonResponse({ok:false,error:"CROSS_ORIGIN_REQUEST_BLOCKED"},403);
  const body=await readJsonObject(request,4096);
  if(!body)return jsonResponse({ok:false,error:"INVALID_JSON",message:"The view event is invalid."},400);
  try{return jsonResponse({ok:true,data:await recordCommunityView(request,body)});}
  catch(error){
    if(error instanceof CommunityError)return jsonResponse({ok:false,error:error.code,message:error.message},error.status);
    return jsonResponse({ok:false,error:"COMMUNITY_VIEW_UNAVAILABLE",message:"The page view could not be recorded."},503);
  }
});
