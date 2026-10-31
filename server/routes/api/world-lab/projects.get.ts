import {defineHandler} from "nitro/h3";
import {listOwnedWorldLabProjects} from "../../../../src/lib/world-lab/project-backups.server";
import {authorizeBackupRequest,backupResponse,backupSummary}
  from "../../../../src/lib/world-lab/project-backups-http.server";
export default defineHandler(async event=>{
  const auth=await authorizeBackupRequest(event.req);
  if(auth.error)return auth.error;
  try{
    const backups=await listOwnedWorldLabProjects(auth.userId!);
    return backupResponse({ok:true,requestId:auth.requestId,
      backups:backups.map(backupSummary)});
  }catch{return backupResponse({ok:false,requestId:auth.requestId,
    code:"BACKUP_UNAVAILABLE"},503);}
});
