import {defineHandler} from "nitro/h3";
import {listOwnedWorldLabProjectVersions,getOwnedWorldLabProject}
  from "../../../../../../src/lib/world-lab/project-backups.server";
import {authorizeBackupRequest,backupResponse}
  from "../../../../../../src/lib/world-lab/project-backups-http.server";
export default defineHandler(async event=>{
  const auth=await authorizeBackupRequest(event.req);
  if(auth.error)return auth.error;
  const id=event.context.params?.id;
  if(!id)return backupResponse({ok:false,requestId:auth.requestId,
    code:"INVALID_BACKUP_ID"},400);
  try{
    // Distinguish nonexistent backups from an account with an empty history.
    const current=await getOwnedWorldLabProject(auth.userId!,id);
    if(!current)return backupResponse({ok:false,requestId:auth.requestId,
      code:"NOT_FOUND"},404);
    const rows=await listOwnedWorldLabProjectVersions(auth.userId!,id);
    return backupResponse({ok:true,requestId:auth.requestId,
      versions:rows.map(row=>({
        projectId:row.project_id,serverRevision:row.server_revision,
        projectRevision:row.project_revision,title:row.project_title,
        createdAt:row.created_at,
      }))});
  }catch{return backupResponse({ok:false,requestId:auth.requestId,
    code:"BACKUP_UNAVAILABLE"},503);}
});
