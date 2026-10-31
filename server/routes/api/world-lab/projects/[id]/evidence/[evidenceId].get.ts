import {defineHandler} from "nitro/h3";
import {getOwnedWorldLabScienceEvidence}
  from "../../../../../../src/lib/world-lab/science-evidence-backups.server";
import {authorizeBackupRequest,backupResponse}
  from "../../../../../../src/lib/world-lab/project-backups-http.server";
export default defineHandler(async event=>{
  const auth=await authorizeBackupRequest(event.req);
  if(auth.error)return auth.error;
  const projectId=event.context.params?.id;
  const evidenceId=event.context.params?.evidenceId;
  if(!projectId||!evidenceId)
    return backupResponse({ok:false,code:"INVALID_SCIENCE_ID",requestId:auth.requestId},400);
  try{
    const row=await getOwnedWorldLabScienceEvidence(auth.userId!,projectId,evidenceId);
    if(!row)return backupResponse({ok:false,code:"NOT_FOUND",
      requestId:auth.requestId},404);
    return backupResponse({ok:true,requestId:auth.requestId,
      evidence:row.evidence_json});
  }catch{
    return backupResponse({ok:false,code:"SCIENCE_BACKUP_UNAVAILABLE",
      requestId:auth.requestId},503);
  }
});
