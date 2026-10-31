import {defineHandler} from "nitro/h3";
import {getOwnedWorldLabProject} from "../../../../../src/lib/world-lab/project-backups.server";
import {authorizeBackupRequest,backupResponse,backupSummary}
  from "../../../../../src/lib/world-lab/project-backups-http.server";
export default defineHandler(async event=>{
  const auth=await authorizeBackupRequest(event.req);
  if(auth.error)return auth.error;
  const id=event.context.params?.id;
  if(!id)return backupResponse({ok:false,code:"INVALID_BACKUP_ID",
    requestId:auth.requestId},400);
  try{
    const row=await getOwnedWorldLabProject(auth.userId!,id);
    if(!row)return backupResponse({ok:false,code:"NOT_FOUND",
      requestId:auth.requestId},404);
    return backupResponse({ok:true,requestId:auth.requestId,
      backup:backupSummary(row),project:row.project_json});
  }catch{return backupResponse({ok:false,requestId:auth.requestId,
    code:"BACKUP_UNAVAILABLE"},503);}
});
