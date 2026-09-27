import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Clock3, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CopyButton } from "@/components/tools/copy-button";
import { convert, formatUnitValue, systems, paperInfo } from "@/lib/engines/units";
import { parseNumber } from "@/lib/utils";

type Mode = "standard" | "table" | "quick" | "comparison" | "reference";
type HistoryItem = { amount: string; from: string; to: string; result: string };

const MODE_COPY: Record<Mode, string> = {
  standard: "Instant conversion with a full unit comparison.",
  table: "Use one value as a reference across every supported unit.",
  quick: "Common conversions are one tap away.",
  comparison: "Compare the same value across the complete unit set.",
  reference: "Browse units and conversion factors before calculating.",
};

export function ConverterEngine({ system, mode = "standard" }: { system: string; mode?: Mode }) {
  const def = systems[system];
  const units = def?.units ?? [];
  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState(units[0]?.id ?? "");
  const [to, setTo] = useState(units[1]?.id ?? units[0]?.id ?? "");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    setFrom(units[0]?.id ?? "");
    setTo(units[1]?.id ?? units[0]?.id ?? "");
  }, [system]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem(`env-converter-history:${system}`) ?? "[]")); } catch { setHistory([]); }
  }, [system]);

  const result = useMemo(() => {
    if (!def || !amount.trim()) return null;
    const n = parseNumber(amount);
    if (!Number.isFinite(n)) return { error: "Enter a valid number." };
    try { return { value: convert(system, n, from, to) }; }
    catch (e) { return { error: e instanceof Error ? e.message : "Cannot convert these units." }; }
  }, [amount, def, from, system, to]);

  if (!def) return <p className="text-sm text-muted">Unknown unit system.</p>;

  const text = result && "value" in result && result.value !== undefined
    ? `${amount} ${from} = ${formatUnitValue(result.value)} ${to}` : "";
  const current = result && "value" in result && result.value !== undefined ? result.value : null;
  const sourceNumber = parseNumber(amount);

  function saveHistory() {
    if (!text) return;
    const item = { amount, from, to, result: formatUnitValue(current as number) };
    const next = [item, ...history.filter(x => !(x.amount === item.amount && x.from === item.from && x.to === item.to))].slice(0, 8);
    setHistory(next); localStorage.setItem(`env-converter-history:${system}`, JSON.stringify(next));
  }

  function tableRows() {
    return units.map(unit => {
      let value = "—";
      if (Number.isFinite(sourceNumber) && amount.trim()) {
        try { value = formatUnitValue(convert(system, sourceNumber, from, unit.id)); } catch { /* unsupported pair */ }
      }
      return { unit, value };
    });
  }

  const rows = tableRows();
  const quickPairs = units.slice(0, Math.min(units.length, 8)).flatMap((u, i) => units.slice(i + 1, Math.min(units.length, i + 3)).map(v => [u, v] as const)).slice(0, 8);

  if (system === "paper") {
    return <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface-2/50 p-4"><div className="flex items-center gap-2 font-medium"><Info className="size-4"/> Paper sizes are references, not linear units.</div><p className="mt-1 text-sm text-subtle">Choose a standard to compare its physical dimensions in millimetres and inches.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{units.map(u => <div key={u.id} className="rounded-lg border border-border p-4"><p className="font-medium">{u.label}</p><p className="mt-1 text-sm text-subtle">{paperInfo(u.id)}</p></div>)}</div>
    </div>;
  }

  if (system === "dpi") {
    return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><div><Label>Pixels</Label><Input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} /></div><div><Label>Print width (in)</Label><Input inputMode="decimal" value={to === "in" ? amount : ""} onChange={e=>{setTo("in");setAmount(e.target.value)}} placeholder="e.g. 8.27" /></div><div><Label>DPI / PPI</Label><Input inputMode="decimal" value="300" readOnly /></div></div><p className="text-sm text-subtle">For a print workflow, pixels = inches × DPI. Change the standard converter above in the page controls when you need another direction.</p><div className="rounded-lg bg-surface-2 p-4 text-sm">At 300 DPI, 8.27 inches requires about <strong>{Number.isFinite(sourceNumber) ? Math.round(sourceNumber * 300).toLocaleString() : "—"}</strong> pixels.</div></div>;
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-subtle">{MODE_COPY[mode]}</p>{text ? <Button variant="outline" size="sm" onClick={saveHistory}><Clock3 className="mr-2 size-4"/>Save conversion</Button> : null}</div>
    <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
      <div className="space-y-1.5"><Label htmlFor="from-amount">From</Label><Input id="from-amount" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} /><Select value={from} onChange={e=>setFrom(e.target.value)} aria-label="From unit">{units.map(u=><option key={u.id} value={u.id}>{u.label}</option>)}</Select></div>
      <Button type="button" variant="outline" size="icon" className="mx-auto" aria-label="Swap units" onClick={()=>{setFrom(to);setTo(from)}}><ArrowDownUp className="size-4"/></Button>
      <div className="space-y-1.5"><Label>To</Label><div className="flex h-11 items-center rounded-md bg-surface-2 px-3 text-sm font-medium tabular-nums">{current !== null ? formatUnitValue(current) : "—"}</div><Select value={to} onChange={e=>setTo(e.target.value)} aria-label="To unit">{units.map(u=><option key={u.id} value={u.id}>{u.label}</option>)}</Select></div>
    </div>
    <ErrorBanner message={result && "error" in result ? result.error ?? null : null}/>
    {text ? <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-4 py-3"><p className="text-sm font-medium tabular-nums">{text}</p><CopyButton text={text}/></div> : null}
    {mode === "quick" ? <div className="grid gap-2 sm:grid-cols-2">{quickPairs.map(([a,b])=><button key={`${a.id}-${b.id}`} type="button" className="rounded-lg border border-border p-3 text-left text-sm hover:bg-surface-2" onClick={()=>{setFrom(a.id);setTo(b.id)}}><span className="font-medium">{a.label}</span><span className="mx-2 text-subtle">→</span><span>{b.label}</span></button>)}</div> : null}
    {mode !== "reference" ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left text-xs text-subtle">{mode === "comparison" ? "Complete comparison from the source value" : "All units from the source value"}</caption><thead><tr className="text-xs text-subtle"><th className="py-2 font-medium">Unit</th><th className="py-2 font-medium">Value</th></tr></thead><tbody>{rows.map(r=><tr key={r.unit.id} className="border-t border-border"><td className="py-2">{r.unit.label}</td><td className="py-2 tabular-nums">{r.value}</td></tr>)}</tbody></table></div> : <div className="grid gap-2 sm:grid-cols-2">{units.map(u=><div key={u.id} className="rounded-lg border border-border p-3"><p className="font-medium">{u.label}</p><p className="mt-1 text-xs text-subtle">Base factor: {u.toBase === 0 ? "special / reference mapping" : u.toBase}</p></div>)}</div>}
    {history.length ? <div className="border-t border-border pt-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><Clock3 className="size-4"/>Recent conversions</div><div className="flex flex-wrap gap-2">{history.map((h,i)=><button key={i} type="button" className="rounded-md bg-surface-2 px-3 py-2 text-xs" onClick={()=>{setAmount(h.amount);setFrom(h.from);setTo(h.to)}}>{h.amount} → {h.result}</button>)}</div></div> : null}
  </div>;
}
