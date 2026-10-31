import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, readJsonObject } from "../../../../src/lib/billing/http.server";
import { CommunityError, createCommunityComment } from "../../../../src/lib/community/community.server";

export default defineHandler(async (event) => {
  const request=event.req;
  if(request.method!=="POST")return jsonResponse({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  if(!isSameOriginRequest(request))return jsonResponse({ok:false,error:"CROSS_ORIGIN_REQUEST_BLOCKED"},403);
  const body=await readJsonObject(request,12_000);
  if(!body)return jsonResponse({ok:false,error:"INVALID_JSON",message:"The comment is invalid or too large."},400);
  try{const data=await createCommunityComment(request,body);return jsonResponse({ok:true,data},data.duplicate?200:201);}
  catch(error){
    if(error instanceof CommunityError)return jsonResponse({ok:false,error:error.code,message:error.message},error.status);
    return jsonResponse({ok:false,error:"COMMUNITY_COMMENT_UNAVAILABLE",message:"The comment was not accepted. Retry safely with the same idempotency key."},503);
  }
});
