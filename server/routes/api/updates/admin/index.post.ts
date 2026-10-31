import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, readJsonObject } from "../../../../../src/lib/billing/http.server";
import { manageProductUpdate, UpdatesError } from "../../../../../src/lib/updates/updates.server";

export default defineHandler(async (event) => {
  const request=event.req;
  if(request.method!=="POST")return jsonResponse({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  if(!isSameOriginRequest(request))return jsonResponse({ok:false,error:"CROSS_ORIGIN_REQUEST_BLOCKED"},403);
  const body=await readJsonObject(request,20_000);
  if(!body)return jsonResponse({ok:false,error:"INVALID_JSON",message:"The update is invalid or too large."},400);
  try{return jsonResponse({ok:true,data:await manageProductUpdate(request,body)});}
  catch(error) {
    if(error instanceof UpdatesError)return jsonResponse({ok:false,error:error.code,message:error.message},error.status);
    return jsonResponse({ok:false,error:"UPDATE_MANAGEMENT_FAILED",message:"The product update could not be saved."},503);
  }
});
