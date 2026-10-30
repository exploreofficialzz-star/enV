import { useEffect, useState } from "react";
import { chooseAnalyticsConsent, getAnalyticsConsent } from "@/lib/analytics/client";

export function AnalyticsConsent() {
  const enabled = import.meta.env.VITE_ANALYTICS_ENABLED === "true";
  const [choice,setChoice] = useState<"granted"|"denied"|"unset">("unset");
  const [expanded,setExpanded] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  useEffect(()=>{setChoice(getAnalyticsConsent());},[]);
  if(!enabled)return null;
  const decide=async(granted:boolean)=>{
    setBusy(true);setError("");
    try{await chooseAnalyticsConsent(granted);setChoice(granted?"granted":"denied");setExpanded(false);}
    catch(reason){setError(reason instanceof Error?reason.message:"Could not save this privacy choice.");}
    finally{setBusy(false);}
  };
  if(choice!=="unset"&&!expanded)return <div className="fixed bottom-3 left-3 z-[100]"><button type="button" className="rounded-full border border-border bg-card px-3 py-2 text-xs text-muted shadow-lg" onClick={()=>setExpanded(true)}>Privacy choices</button></div>;
  return <div className="fixed bottom-3 left-3 z-[100] w-[min(94vw,410px)] rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl">
    <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Help improve enV</h2>{choice!=="unset"?<button type="button" className="text-xs text-muted" onClick={()=>setExpanded(false)}>Close</button>:null}</div>
    <p className="text-xs leading-5 text-muted">Optional usage analytics help us understand which tools work well and where they fail. We collect tool identifiers, outcomes and approximate device, browser and network categories. We do not collect your files, text you enter, passwords, search queries or tool output.</p>
    {error?<p role="alert" className="mt-2 text-xs text-red-600">{error}</p>:null}
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void decide(true)} className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-50">{busy?"Saving…":"Allow analytics"}</button><button type="button" disabled={busy} onClick={()=>void decide(false)} className="rounded-full border border-border px-4 py-2 text-xs font-semibold disabled:opacity-50">No thanks</button></div>
  </div>;
}
