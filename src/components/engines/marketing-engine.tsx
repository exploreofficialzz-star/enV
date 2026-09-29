import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/tools/copy-button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadText } from "@/lib/utils";
import { buildMarketingOutput, parseMarketingToolId, type MarketingAction } from "./marketing-engine-utils";

type Props = { toolId: string };

function Field({ id, label, children, full = false }: { id: string; label: string; children: ReactNode; full?: boolean }) {
  return <div className={full ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}><Label htmlFor={id}>{label}</Label>{children}</div>;
}

export function MarketingEngine({ toolId }: Props) {
  const parsed = useMemo(() => { try { return { value: parseMarketingToolId(toolId), error: null as string | null }; } catch (e) { return { value: null, error: e instanceof Error ? e.message : "Unsupported marketing tool." }; } }, [toolId]);
  const { topic, action } = parsed.value ?? { topic: "Marketing", action: "generator" as MarketingAction };
  const [audience, setAudience] = useState(""); const [goal, setGoal] = useState(""); const [offer, setOffer] = useState(""); const [channel, setChannel] = useState(""); const [notes, setNotes] = useState("");
  const [budget, setBudget] = useState("100"); const [clicks, setClicks] = useState("1000"); const [leads, setLeads] = useState("50"); const [sales, setSales] = useState("10"); const [revenue, setRevenue] = useState("500");
  const output = useMemo(() => {
    if (!parsed.value) return "";
    try {
      return buildMarketingOutput(topic, action, { audience, goal, offer, channel, notes, budget: Number(budget), clicks: Number(clicks), leads: Number(leads), sales: Number(sales), revenue: Number(revenue) });
    } catch (e) {
      return "";
    }
  }, [action, audience, budget, channel, clicks, goal, leads, notes, offer, revenue, sales, topic, parsed.value]);
  const isCalc = action === "calculator";
  const calculateError = useMemo(() => {
    if (!parsed.value || !isCalc) return null;
    try { buildMarketingOutput(topic, action, { audience, goal, offer, channel, notes, budget: Number(budget), clicks: Number(clicks), leads: Number(leads), sales: Number(sales), revenue: Number(revenue) }); return null; }
    catch (e) { return e instanceof Error ? e.message : "Invalid marketing inputs."; }
  }, [action, audience, budget, channel, clicks, goal, leads, notes, offer, revenue, sales, topic, parsed.value, isCalc]);
  function reset() { setAudience(""); setGoal(""); setOffer(""); setChannel(""); setNotes(""); setBudget("100"); setClicks("1000"); setLeads("50"); setSales("10"); setRevenue("500"); }
  return <div className="space-y-5">
    <p className="text-sm text-muted">Local marketing utility for <strong>{topic}</strong>. Outputs are deterministic and use only your inputs; no AI service or campaign is contacted.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="marketing-audience" label="Target audience"><Input id="marketing-audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. small business owners" /></Field>
      <Field id="marketing-goal" label="Primary goal"><Input id="marketing-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. generate qualified leads" /></Field>
      <Field id="marketing-offer" label="Offer / product"><Input id="marketing-offer" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="What are you promoting?" /></Field>
      <Field id="marketing-channel" label="Channel"><Input id="marketing-channel" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="e.g. email, search, social" /></Field>
      {isCalc ? <><Field id="marketing-budget" label="Budget"><Input id="marketing-budget" type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field><Field id="marketing-clicks" label="Clicks"><Input id="marketing-clicks" type="number" min="0" value={clicks} onChange={(e) => setClicks(e.target.value)} /></Field><Field id="marketing-leads" label="Leads"><Input id="marketing-leads" type="number" min="0" value={leads} onChange={(e) => setLeads(e.target.value)} /></Field><Field id="marketing-sales" label="Sales"><Input id="marketing-sales" type="number" min="0" value={sales} onChange={(e) => setSales(e.target.value)} /></Field><Field id="marketing-revenue" label="Revenue"><Input id="marketing-revenue" type="number" min="0" value={revenue} onChange={(e) => setRevenue(e.target.value)} /></Field></> : null}
      <Field id="marketing-notes" label="Notes / context" full><Textarea id="marketing-notes" className="min-h-28" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add facts, constraints, claims, dates or other context…" /></Field>
    </div>
    <ErrorBanner message={parsed.error ?? calculateError} />
    <div className="flex flex-wrap gap-2"><CopyButton text={output} /><Button type="button" variant="outline" size="sm" disabled={!output} onClick={() => downloadText(output, `env-${toolId}.txt`)}>Download</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>Reset</Button></div>
    {output ? <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{output}</pre> : null}
  </div>;
}
