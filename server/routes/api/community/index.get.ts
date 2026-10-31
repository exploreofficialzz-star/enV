import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse } from "../../../../src/lib/billing/http.server";
import { CommunityError, getCommunityFeed } from "../../../../src/lib/community/community.server";

export default defineHandler(async (event) => {
  const request=event.req;
  if(request.method!=="GET")return jsonResponse({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  if(!isSameOriginRequest(request))return jsonResponse({ok:false,error:"CROSS_ORIGIN_REQUEST_BLOCKED"},403);
  const url=new URL(request.url);
  try{return jsonResponse({ok:true,data:await getCommunityFeed(request,url.searchParams.get("toolId"),url.searchParams.get("visitorId")??undefined)});}
  catch(error){
    if(error instanceof CommunityError)return jsonResponse({ok:false,error:error.code,message:error.message},error.status);
    return jsonResponse({ok:false,error:"COMMUNITY_FEED_UNAVAILABLE",message:"Tool discussions are temporarily unavailable."},503);
  }
});
