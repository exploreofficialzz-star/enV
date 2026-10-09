// @ts-nocheck
import { defineHandler } from "nitro/h3";
import { jsonResponse, optionsResponse } from "../../../../backend/http";
import { parseSocialToolId, buildSocialOutput } from "../../../../src/components/engines/social-engine-utils";
import { parseGamingToolId, buildGamingOutput } from "../../../../src/components/engines/gaming-engine-utils";
import { parseWebDesignToolId, buildWebDesignOutput } from "../../../../src/components/engines/webdesign-engine-utils";
import { parseCareerToolId, buildCareerOutput } from "../../../../src/components/engines/career-engine-utils";
import { parseEcommerceToolId, buildEcommerceOutput } from "../../../../src/components/engines/ecommerce-engine-utils";
import { parseRelationshipToolId, buildRelationshipOutput } from "../../../../src/components/engines/relationship-engine-utils";
import { parseInteractiveToolId, buildInteractiveOutput } from "../../../../src/components/engines/interactive-engine-utils";
import { parseMarketingToolId, buildMarketingOutput } from "../../../../src/components/engines/marketing-engine-utils";
import { parseToolId as parseCommunicationToolId, buildCommunication } from "../../../../src/components/engines/communication-engine-utils";
import { parseToolId as parseAccessibilityToolId } from "../../../../src/components/engines/accessibility-engine-utils";
import { parseStreamingToolId, calculateBitrate, calculateAspectRatio, calculateRevenue, buildScheduleText, buildOverlayText, buildChecklistText, buildTitles, buildDescription } from "../../../../src/components/engines/streaming-engine-utils";

const CUSTOM_CATEGORIES = new Set([
  "personal", "marketing", "communication", "accessibility", "career", "ecommerce", "relationships",
  "interactive", "gaming", "social", "streaming", "webdesign", "education", "network", "security", "creator", "creators",
]);

function clean(v: unknown, fallback = "") { return String(v ?? fallback).trim(); }
function execute(id: string, category: string, input: string, o: Record<string, unknown>): string {
  if (category === "social") return buildSocialOutput(id, o as Record<string,string>);
  if (category === "gaming") { const p = parseGamingToolId(id); return buildGamingOutput(p.family, p.workflow, { name: clean(o.name,"My Game"), base:Number(o.base??10), modifier:Number(o.modifier??0), quantity:Number(o.quantity??1), sides:Number(o.sides??6), level:Number(o.level??1), players:Number(o.players??2), rounds:Number(o.rounds??1), notes:clean(o.notes), entries:clean(o.entries,input).split("\n").filter(Boolean) }); }
  if (category === "webdesign") { const p=parseWebDesignToolId(id); return buildWebDesignOutput(p.family,p.workflow,{project:clean(o.project,"enV project"),primary:clean(o.primary,"#0d9f8a"),text:clean(o.text,"#202124"),font:clean(o.font,"system-ui, sans-serif"),maxWidth:Number(o.maxWidth??1200),spacing:Number(o.spacing??8),columns:Number(o.columns??3),radius:Number(o.radius??12)}); }
  if (category === "career") { const p=parseCareerToolId(id); return buildCareerOutput(p.family,p.workflow,{name:clean(o.name,"Alex"),role:clean(o.role,"Professional"),company:clean(o.company,"Company"),summary:clean(o.summary,input),skills:clean(o.skills,"Communication\nProblem solving"),experience:clean(o.experience,"Relevant experience"),education:clean(o.education,"Education"),target:clean(o.target,"Career goal"),salary:Number(o.salary??0),hours:Number(o.hours??40),years:Number(o.years??1)}); }
  if (category === "ecommerce") { const p=parseEcommerceToolId(id); return buildEcommerceOutput(p.family,p.workflow,{product:clean(o.product,"Product"),audience:clean(o.audience,"Customers"),price:Number(o.price??49),cost:Number(o.cost??20),quantity:Number(o.quantity??1),discount:Number(o.discount??10),shipping:Number(o.shipping??0),notes:clean(o.notes,input)}); }
  if (category === "relationships") { const p=parseRelationshipToolId(id); return buildRelationshipOutput(p.family,p.workflow,{name:clean(o.name,"Someone special"),occasion:clean(o.occasion,"Special occasion"),tone:clean(o.tone,"warm"),message:clean(o.message,input),date:clean(o.date,""),questions:clean(o.questions,"What do you appreciate most?\nWhat memory matters most?").split("\n"),answers:clean(o.answers).split("\n")}); }
  if (category === "interactive") { const p=parseInteractiveToolId(id); return buildInteractiveOutput(p.family,p.workflow,{title:clean(o.title,"Interactive experience"),description:clean(o.description,input),cta:clean(o.cta,"Continue"),items:clean(o.items,"One\nTwo\nThree").split("\n"),questions:clean(o.questions,"Question 1?\nQuestion 2?").split("\n")}); }
  if (category === "marketing") { const p=parseMarketingToolId(id); return buildMarketingOutput(p.topic,p.action,{audience:clean(o.audience,"Target audience"),goal:clean(o.goal,"Grow demand"),offer:clean(o.offer,"Offer"),channel:clean(o.channel,"Social"),notes:clean(o.notes,input),budget:Number(o.budget??100),clicks:Number(o.clicks??100),leads:Number(o.leads??10),sales:Number(o.sales??2),revenue:Number(o.revenue??200)}); }
  if (category === "communication") { const p=parseCommunicationToolId(id); return buildCommunication({kind:p.kind,action:p.action,audience:clean(o.audience,"Recipient"),subject:clean(o.subject,"Message"),purpose:clean(o.purpose,input),tone:clean(o.tone,"clear"),details:clean(o.details),date:clean(o.date),items:clean(o.items,"Agenda item 1\nAgenda item 2")}); }
  if (category === "accessibility") { const p=parseAccessibilityToolId(id); return `${p.kind} ${p.action}\n\nInput: ${clean(o.text,input)}\nForeground: ${clean(o.foreground,"#000000")}\nBackground: ${clean(o.background,"#ffffff")}\nSize: ${Number(o.size??16)}px\nLine height: ${Number(o.lineHeight??1.5)}\n\nReview against WCAG success criteria and the actual target UI before release.`; }
  if (category === "streaming") { const p=parseStreamingToolId(id); if(!p) throw new Error("Unsupported streaming tool."); const op=p.operation; if(op.includes("bitrate")) return calculateBitrate(clean(o.resolution,"1080p"),clean(o.fps,"30"),clean(o.quality,"standard"),p.platform); if(op.includes("aspect")) return calculateAspectRatio(clean(o.width,"1920"),clean(o.height,"1080")); if(op.includes("revenue")) return calculateRevenue(clean(o.viewers,"1000"),clean(o.hours,"2"),clean(o.rate,"3")); if(op.includes("schedule")) return buildScheduleText(p.platform,clean(o.date,""),clean(o.time,""),clean(o.duration,"60"),clean(o.topic,"Stream")); if(op.includes("overlay")) return buildOverlayText(p.platform,clean(o.items,"Welcome\nBe right back").split("\n")); if(op.includes("checklist")) return buildChecklistText(p.platform,clean(o.items,"Camera\nAudio\nInternet").split("\n"),[]); if(op.includes("title")) return buildTitles(clean(o.topic,"Stream"),clean(o.style,"clear")); if(op.includes("description")) return buildDescription(clean(o.topic,"Stream"),clean(o.cta,"Follow for more")); return `${p.platform} ${op}\n\n${clean(input,"Enter the stream details.")}`; }
  throw new Error(`No backend execution contract is implemented for ${category}/${id}.`);
}

export default defineHandler(async e => {
  if (e.req.method === "OPTIONS") return optionsResponse();
  try {
    const body = await e.req.json().catch(() => ({}));
    const id = clean(body.toolId); const category = clean(body.category);
    if (!id || !CUSTOM_CATEGORIES.has(category)) return jsonResponse({error:"Unsupported backend category tool."},400);
    const options = body.options && typeof body.options === "object" ? body.options as Record<string,unknown> : {};
    const output = execute(id,category,clean(body.input),options);
    return jsonResponse({toolId:id,output});
  } catch (err) { return jsonResponse({error:err instanceof Error?err.message:"Tool execution failed."},400); }
});
