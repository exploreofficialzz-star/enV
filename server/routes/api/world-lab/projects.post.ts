import {defineHandler} from "nitro/h3";
import {saveOwnedWorldLabProject,WorldLabBackupError}
  from "../../../../src/lib/world-lab/project-backups.server";
import {authorizeBackupRequest,backupResponse,backupSummary,readBackupBody}
  from "../../../../src/lib/world-lab/project-backups-http.server";
export default defineHandler(async event=>{
  const auth=await authorizeBackupRequest(event.req);
  if(auth.error)return auth.error;
  const body=await readBackupBody(event.req);
  if(!body||Object.keys(body).some(k=>!["project","expectedServerRevision"].includes(k))||
    !Object.hasOwn(body,"expectedServerRevision"))
    return backupResponse({ok:false,code:"INVALID_BACKUP_REQUEST",
      requestId:auth.requestId},400);
  try{
    const row=await saveOwnedWorldLabProject(auth.userId!,body.project,
      body.expectedServerRevision as number|null);
    return backupResponse({ok:true,requestId:auth.requestId,backup:backupSummary(row)});
  }catch(error){
    if(error instanceof WorldLabBackupError){
      const status=error.code==="BACKUP_CONFLICT"?409:
        error.code==="BACKUP_LIMIT"?429:
        error.code==="SYNC_NOT_CONFIGURED"?503:400;
      return backupResponse({ok:false,requestId:auth.requestId,
        code:error.code,error:error.message},status);
    }
    return backupResponse({ok:false,requestId:auth.requestId,
      code:"BACKUP_UNAVAILABLE"},503);
  }
});
