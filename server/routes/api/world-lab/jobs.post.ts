import {defineHandler} from "nitro/h3";
import {enqueueWorldLabJob,WorldLabJobError} from "../../../../src/lib/world-lab/jobs.server";
import {authorizeWorldLabJobRequest,readJobBody,exposedJob,respond} from "../../../../src/lib/world-lab/jobs-http.server";
export default defineHandler(async event=>{
  const access=await authorizeWorldLabJobRequest(event.req);
  if(access.error)return access.error;
  const body=await readJobBody(event.req);
  if(!body)return respond({ok:false,code:"INVALID_JSON",requestId:access.requestId},400);
  const key=event.req.headers.get("idempotency-key");
  if(!key)return respond({ok:false,code:"IDEMPOTENCY_KEY_REQUIRED",requestId:access.requestId},400);
  try{
    const row=await enqueueWorldLabJob(access.userId!,body,key);
    return respond({ok:true,requestId:access.requestId,job:exposedJob(row)},202);
  }catch(error){
    if(error instanceof WorldLabJobError){
      const status=error.code==="QUOTA_EXCEEDED"?429:
        error.code==="IDEMPOTENCY_CONFLICT"?409:
        error.code==="JOBS_NOT_CONFIGURED"?503:400;
      return respond({ok:false,code:error.code,error:error.message,
        requestId:access.requestId},status);
    }
    return respond({ok:false,code:"JOB_STORAGE_UNAVAILABLE",requestId:access.requestId},503);
  }
});
