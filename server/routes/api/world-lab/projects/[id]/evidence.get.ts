import {defineHandler} from "nitro/h3";
import {listOwnedWorldLabScienceEvidence}
  from "../../../../../src/lib/world-lab/science-evidence-backups.server";
import {authorizeBackupRequest,backupResponse}
  from "../../../../../src/lib/world-lab/project-backups-http.server";
export default defineHandler(async event=>{
  const auth=await authorizeBackupRequest(event.req);
  if(auth.error)return auth.error;
  const id=event.context.params?.id;
  if(!id||!/^[A-Za-z0-9_-]{1,120}$/.test(id))
    return backupResponse({ok:false,code:"INVALID_PROJECT_ID",requestId:auth.requestId},400);
  try{
    const rows=await listOwnedWorldLabScienceEvidence(auth.userId!,id);
    return backupResponse({ok:true,requestId:auth.requestId,
      evidence:rows.map(row=>({id:row.evidence_id,projectId:row.project_id,
        kind:row.kind,projectRevision:row.project_revision,
        createdAt:row.created_at,uploadedAt:row.uploaded_at}))});
  }catch{
    return backupResponse({ok:false,code:"SCIENCE_BACKUP_UNAVAILABLE",
      requestId:auth.requestId},503);
  }
});
