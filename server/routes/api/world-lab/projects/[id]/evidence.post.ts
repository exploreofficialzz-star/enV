import {defineHandler} from "nitro/h3";
import {readBoundedJsonObject} from "../../../../../../src/lib/billing/bounded-json.server";
import {uploadOwnedWorldLabScienceEvidence}
  from "../../../../../../src/lib/world-lab/science-evidence-backups.server";
import {WorldLabBackupError} from "../../../../../../src/lib/world-lab/project-backups.server";
import {authorizeBackupRequest,backupResponse}
  from "../../../../../../src/lib/world-lab/project-backups-http.server";
export default defineHandler(async event=>{
  const auth=await authorizeBackupRequest(event.req);
  if(auth.error)return auth.error;
  const projectId=event.context.params?.id;
  if(!projectId||!/^[A-Za-z0-9_-]{1,120}$/.test(projectId))
    return backupResponse({ok:false,code:"INVALID_PROJECT_ID",requestId:auth.requestId},400);
  const body=await readBoundedJsonObject(event.req,2_200_000);
  if(!body||Object.keys(body).length!==1||!Object.hasOwn(body,"evidence"))
    return backupResponse({ok:false,code:"INVALID_SCIENCE_REQUEST",requestId:auth.requestId},400);
  try{
    const row=await uploadOwnedWorldLabScienceEvidence(auth.userId!,projectId,
      body.evidence);
    return backupResponse({ok:true,requestId:auth.requestId,
      id:row.evidence_id,projectId:row.project_id,kind:row.kind});
  }catch(error){
    if(error instanceof WorldLabBackupError)
      return backupResponse({ok:false,requestId:auth.requestId,code:error.code,
        error:error.message},error.code==="BACKUP_CONFLICT"||
          error.code==="EVIDENCE_CONFLICT"?409:
          error.code==="EVIDENCE_QUOTA"?429:400);
    return backupResponse({ok:false,requestId:auth.requestId,
      code:"SCIENCE_BACKUP_UNAVAILABLE"},503);
  }
});
