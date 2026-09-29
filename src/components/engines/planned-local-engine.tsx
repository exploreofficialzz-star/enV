import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/tools/copy-button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadText } from "@/lib/utils";

const n=(v:string,d=0)=>{const x=Number(v);return Number.isFinite(x)?x:d};
const money=(x:number)=>x.toFixed(2);
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]!));

function family(id:string){
 const p=id.split("-"); return {kind:p[p.length-1], topic:p.slice(0,-1).join(" ")};
}
function run(id:string, v:Record<string,string>){
 const {kind,topic}=family(id); const a=n(v.a,1), b=n(v.b,1), c=n(v.c,1);
 if (id.includes("rsvp-page")||id.includes("check-in-page")) return `<section><h1>${esc(v.title||topic)}</h1><p>${esc(v.body||"You're invited. Please confirm your attendance.")}</p><p>Guest: ${esc(v.name||"Guest")}</p><p>Status: ${esc(v.status||"Attending")}</p></section>`;
 if (id.includes("invitation-generator")) return `<section><h1>${esc(v.title||topic)}</h1><p>${esc(v.body||"You are warmly invited.")}</p><p>Date: ${esc(v.date||"Set a date")}</p><p>Location: ${esc(v.location||"Set a location")}</p></section>`;
 if (id.includes("countdown")) { const d=Date.parse(v.date); if(!Number.isFinite(d)) throw Error("Enter a valid target date/time."); const days=Math.max(0,Math.ceil((d-Date.now())/86400000)); return `${topic} countdown\nTarget: ${new Date(d).toLocaleString()}\nApproximate days remaining: ${days}`; }
 if (id.includes("schedule-builder")||id.includes("agenda-generator")) return `${topic} ${kind}\n\n${v.title||"Event agenda"}\n${(v.items||"Welcome\nMain activity\nBreak\nClosing").split("\n").map((x,i)=>`${i+1}. ${x}`).join("\n")}`;
 if (id.includes("event-qr-generator")) return `QR payload for ${topic}\n${v.title||"Event"}\n${v.date||""}\n${v.location||""}\n${v.url||""}`;
 if (id.includes("ticket-mockup")) return `TICKET\n${(v.title||topic).toUpperCase()}\nGuest: ${v.name||"Guest"}\nDate: ${v.date||"TBD"}\nSeat: ${v.seat||"General"}\nCode: ${v.code||"ENV-001"}`;
 if (id.includes("page-generator")||id.includes("interactive-card")||id.includes("memory-page")||id.includes("reveal-page")||id.includes("quiz-generator")||id.includes("surprise-page")) return `<!doctype html><html><body><main><h1>${esc(v.title||topic)}</h1><p>${esc(v.body||"A personal page created with enV.")}</p><p>For: ${esc(v.name||"Someone special")}</p></main></body></html>`;
 if (["calculator","scaler","converter"].includes(kind)) {
   if(id.includes("serving")||id.includes("portion")){const servings=Math.max(1,a), target=Math.max(1,b); return `${topic}: ${money(target/servings)}× the original quantities.`;}
   if(id.includes("recipe")||id.includes("ingredient")||id.includes("meal")){return `${topic} result\nInput A: ${a}\nInput B: ${b}\nComputed ratio: ${money(a/b)}`;}
   if(id.includes("fuel")){const km=a, lPer100=b, price=c; return `Fuel estimate\nDistance: ${km} km\nFuel: ${money(km*lPer100/100)} L\nFuel cost: ${money(km*lPer100/100*price)}`;}
   if(id.includes("budget")||id.includes("cost")||id.includes("hotel")||id.includes("daily")){return `${topic} estimate\nAmount: ${money(a)}\nDays/units: ${b}\nTotal: ${money(a*b)}`;}
   if(id.includes("temperature")){return `Temperature conversion helper\n${a} °C = ${money(a*9/5+32)} °F = ${money(a+273.15)} K`;}
   if(id.includes("distance")){return `${topic}: ${money(a)} km = ${money(a*0.621371)} mi = ${money(a*1000)} m`}
   if(id.includes("time")||id.includes("duration")){return `${topic}: ${money(a)} minutes = ${money(a/60)} hours.`}
   if(id.includes("currency")){return `${topic}: ${money(a)} × supplied rate ${money(b)} = ${money(a*b)}`}
   if(id.includes("dpi")||id.includes("ppi")||id.includes("resolution")||id.includes("print-size")){const px=Math.max(1,a), dpi=Math.max(1,b); return `${topic}\nPixels: ${px}\nDensity: ${dpi} DPI\nPhysical size: ${money(px/dpi)} inches`}
   if(id.includes("aspect-ratio")){return `${topic}: ${money(a)}:${money(b)} = ${money(a/b)}:1`}
   if(id.includes("fps")||id.includes("frame")){return `${topic}: ${money(a)} fps × ${money(b)} seconds = ${Math.round(a*b).toLocaleString()} frames`}
   if(id.includes("bitrate")){return `${topic}: ${money(a)} Mbps × ${money(b)} seconds ≈ ${money(a*b/8)} MB (decimal estimate)`}
   if(id.includes("fov")){return `${topic}: horizontal FOV from focal length ${a} and sensor width ${b}: ${money(2*Math.atan(b/(2*a))*180/Math.PI)}°`}
   return `${topic} calculation\nA: ${a}\nB: ${b}\nC: ${c}\nResult: ${money(a*b+c)}`;
 }
 if(kind==="planner"||kind==="generator"||kind==="guide"||kind==="checker"||kind==="checklist") return `${topic} ${kind}\n\nGoal: ${v.title||topic}\n\n1. Define the inputs and constraints\n2. Choose measurable targets\n3. Calculate or prepare the required values\n4. Verify the result against the stated constraints\n5. Save/export the final plan\n\nNotes: ${v.body||""}`;
 return `${topic} utility\n${v.body||"Enter the relevant values and generate a result."}`;
}

export function PlannedLocalEngine({toolId}:{toolId:string}){
 const [a,setA]=useState("10"),[b,setB]=useState("2"),[c,setC]=useState("50"),[title,setTitle]=useState(""),[name,setName]=useState(""),[body,setBody]=useState(""),[date,setDate]=useState(""),[location,setLocation]=useState(""),[items,setItems]=useState(""),[url,setUrl]=useState(""),[seat,setSeat]=useState("General"),[code,setCode]=useState("ENV-001"),[status,setStatus]=useState("Attending");
 const values={a,b,c,title,name,body,date,location,items,url,seat,code,status};
 const [out,setOut]=useState(""); const [err,setErr]=useState("");
 const generate=()=>{try{setErr("");setOut(run(toolId,values));}catch(e){setOut("");setErr(e instanceof Error?e.message:"Invalid input.")}};
 const reset=()=>{setA("10");setB("2");setC("50");setTitle("");setName("");setBody("");setDate("");setLocation("");setItems("");setUrl("");setSeat("General");setCode("ENV-001");setStatus("Attending");setOut("");setErr("");};
 const event=/rsvp|invitation|countdown|schedule|agenda|event-qr|ticket-mockup|check-in|page-generator|interactive-card|memory-page|reveal-page|quiz-generator|surprise-page/.test(toolId);
 return <div className="space-y-5"><p className="text-sm text-muted-foreground">Client-side enV utility. No account or external service is required.</p>
 <div className="grid gap-4 sm:grid-cols-2"><div><Label>Value A</Label><Input value={a} onChange={e=>setA(e.target.value)} inputMode="decimal"/></div><div><Label>Value B</Label><Input value={b} onChange={e=>setB(e.target.value)} inputMode="decimal"/></div><div><Label>Value C / rate</Label><Input value={c} onChange={e=>setC(e.target.value)} inputMode="decimal"/></div>
 {event&&<><div><Label>Title</Label><Input value={title} onChange={e=>setTitle(e.target.value)}/></div><div><Label>Name</Label><Input value={name} onChange={e=>setName(e.target.value)}/></div><div><Label>Date / time</Label><Input value={date} onChange={e=>setDate(e.target.value)} type="datetime-local"/></div><div><Label>Location</Label><Input value={location} onChange={e=>setLocation(e.target.value)}/></div><div><Label>URL</Label><Input value={url} onChange={e=>setUrl(e.target.value)}/></div><div><Label>Code / seat</Label><Input value={code} onChange={e=>setCode(e.target.value)}/></div><div className="sm:col-span-2"><Label>Content / items (one per line)</Label><textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={body||items} onChange={e=>{setBody(e.target.value);setItems(e.target.value)}}/></div></>}
 </div><ErrorBanner message={err}/><div className="flex flex-wrap gap-2"><Button onClick={generate}>Generate</Button>{out&&<CopyButton text={out}/>}<Button variant="outline" onClick={()=>out&&downloadText(out,`env-${toolId}.${out.startsWith("<!")?"html":"txt"}`)}>Download</Button><Button variant="ghost" onClick={reset}>Reset</Button></div>{out&&<pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 text-sm">{out}</pre>}</div>;
}
