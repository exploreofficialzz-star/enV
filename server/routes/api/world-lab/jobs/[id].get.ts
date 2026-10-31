import {defineHandler} from "nitro/h3";
import {getOwnedWorldLabJob} from "../../../../../src/lib/world-lab/jobs.server";
import {authorizeWorldLabJobRequest,exposedJob,respond} from "../../../../../src/lib/world-lab/jobs-http.server";
export default defineHandler(async event=>{
  const access=await authorizeWorldLabJobRequest(event.req);
  if(access.error)return access.error;
  const id=event.context.params?.id;
  if(!id)return respond({ok:false,code:"INVALID_JOB_ID",requestId:access.requestId},400);
  try{
    const row=await getOwnedWorldLabJob(access.userId!,id);
    return row?respond({ok:true,requestId:access.requestId,job:exposedJob(row)}):
      respond({ok:false,code:"NOT_FOUND",requestId:access.requestId},404);
  }catch{return respond({ok:false,code:"JOB_STORAGE_UNAVAILABLE",requestId:access.requestId},503);}
});
