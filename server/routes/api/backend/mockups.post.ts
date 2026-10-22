// @ts-nocheck
import { defineHandler } from "nitro/h3";
import { jsonResponse, optionsResponse, measureServerOperation, safeFailureResponse } from "../../../../backend/http";
import { readJsonObject, RequestBodyError } from "../../../../backend/request-body.mjs";
import { createDefaultProject } from "../../../../src/lib/mockups/project";
import { renderProjectSvg } from "../../../../src/lib/mockups/render";
import { DEVICE_TEMPLATES } from "../../../../src/lib/mockups/devices";
import { platformTheme } from "../../../../src/lib/mockups/themes";
import { normalizeMockupPlatform, parseMockupToolId } from "../../../../src/components/engines/mockups-category-engine-utils";
export default defineHandler(async e => measureServerOperation(e.req, "server.mockup_rendering", async () => {if(e.req.method==="OPTIONS")return optionsResponse();try{const b=await readJsonObject(e.req, 64 * 1024);const id=String(b.toolId||"");const p=parseMockupToolId(id);const platform=normalizeMockupPlatform(p.platform) as any;const project=createDefaultProject(platform);project.name=id;project.scene=p.kind==="group"?"group":p.kind==="voice"?"voice":p.kind==="video"?"video":p.kind==="notification"?"notification":p.kind==="typing"?"typing":p.kind==="receipt"?"receipt":id.includes("-post-mockup")?"post":"chat";const device=DEVICE_TEMPLATES.find(d=>d.id===project.deviceTemplate)||DEVICE_TEMPLATES[0];const svg=renderProjectSvg(project,device,platformTheme(platform,"light"));return new Response(svg,{headers:{"content-type":"image/svg+xml","content-disposition":`attachment; filename="${id}.svg"`,"cache-control":"no-store"}})}catch(err){if(err instanceof RequestBodyError)return jsonResponse({ok:false,code:err.code,error:err.message},err.status);return safeFailureResponse(e.req,err,"MOCKUP_RENDER_FAILED","We couldn’t create this mockup. Review the design options and try again.",422)}}))
