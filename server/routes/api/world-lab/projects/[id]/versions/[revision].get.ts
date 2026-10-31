import {defineHandler} from "nitro/h3";
import {getOwnedWorldLabProjectVersion}
  from "../../../../../../../src/lib/world-lab/project-backups.server";
import {authorizeBackupRequest,backupResponse}
  from "../../../../../../../src/lib/world-lab/project-backups-http.server";
export default defineHandler(async event=>{
  const auth=await authorizeBackupRequest(event.req);
  if(auth.error)return auth.error;
  const id=event.context.params?.id;
  const raw=event.context.params?.revision;
  const revision=raw&&/^[1-9][0-9]{0,9}$/.test(raw)?Number(raw):NaN;
  if(!id||!Number.isSafeInteger(revision)||revision>1000000000)
    return backupResponse({ok:false,requestId:auth.requestId,
      code:"INVALID_BACKUP_VERSION"},400);
  try{
    const row=await getOwnedWorldLabProjectVersion(auth.userId!,id,revision);
    if(!row)return backupResponse({ok:false,requestId:auth.requestId,
      code:"NOT_FOUND"},404);
    return backupResponse({ok:true,requestId:auth.requestId,
      version:{projectId:row.project_id,serverRevision:row.server_revision,
        projectRevision:row.project_revision,title:row.project_title,
        createdAt:row.created_at},project:row.project_json});
  }catch{return backupResponse({ok:false,requestId:auth.requestId,
    code:"BACKUP_UNAVAILABLE"},503);}
});
