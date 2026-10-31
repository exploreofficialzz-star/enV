import {defineHandler} from "nitro/h3";
import {listOwnedWorldLabJobs} from "../../../../src/lib/world-lab/jobs.server";
import {authorizeWorldLabJobRequest,exposedJob,respond}
  from "../../../../src/lib/world-lab/jobs-http.server";

export default defineHandler(async event=>{
  const access=await authorizeWorldLabJobRequest(event.req);
  if(access.error)return access.error;
  try{
    const jobs=await listOwnedWorldLabJobs(access.userId!);
    return respond({ok:true,requestId:access.requestId,
      jobs:jobs.map(exposedJob)});
  }catch{
    return respond({ok:false,code:"JOB_STORAGE_UNAVAILABLE",
      requestId:access.requestId},503);
  }
});
