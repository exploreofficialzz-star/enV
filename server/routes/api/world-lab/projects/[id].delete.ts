import {defineHandler} from "nitro/h3";
import {deleteOwnedWorldLabProject,WorldLabBackupError}
  from "../../../../../src/lib/world-lab/project-backups.server";
import {authorizeBackupRequest,backupResponse,readBackupBody}
  from "../../../../../src/lib/world-lab/project-backups-http.server";
export default defineHandler(async event=>{
  const auth=await authorizeBackupRequest(event.req);
  if(auth.error)return auth.error;
  const id=event.context.params?.id;
  if(!id)return backupResponse({ok:false,requestId:auth.requestId,
    code:"INVALID_BACKUP_ID"},400);
  const body=await readBackupBody(event.req);
  if(!body||Object.keys(body).length!==1||
    !Object.hasOwn(body,"expectedServerRevision")||
    !Number.isSafeInteger(body.expectedServerRevision)||
    Number(body.expectedServerRevision)<1)
    return backupResponse({ok:false,requestId:auth.requestId,
      code:"INVALID_BACKUP_REQUEST"},400);
  try{
    const deleted=await deleteOwnedWorldLabProject(
      auth.userId!,id,body.expectedServerRevision as number);
    if(!deleted)return backupResponse({ok:false,requestId:auth.requestId,
      code:"NOT_FOUND"},404);
    return backupResponse({ok:true,requestId:auth.requestId,deletedProjectId:id});
  }catch(error){
    if(error instanceof WorldLabBackupError)return backupResponse({
      ok:false,requestId:auth.requestId,code:error.code,error:error.message,
    },error.code==="BACKUP_CONFLICT"?409:400);
    return backupResponse({ok:false,requestId:auth.requestId,
      code:"BACKUP_UNAVAILABLE"},503);
  }
});
