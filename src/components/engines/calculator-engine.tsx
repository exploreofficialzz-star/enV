import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { FieldGrid } from "@/components/engines/fields";
import { initialValues } from "@/components/engines/initial-values";
import { ResultPanel } from "@/components/engines/result-panel";
import { calculators } from "@/lib/engines/formulas";
import { Clock3, Trash2 } from "lucide-react";

type CalcResult = { label: string; value: string; hint?: string; primary?: boolean };
type HistoryItem = { id: string; summary: string; result: string; time: string };

export function CalculatorEngine({ formula }: { formula: string; toolId?: string }) {
  const def = calculators[formula];
  const [values, setValues] = useState(() => initialValues(def?.fields ?? []));
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CalcResult[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const fields = useMemo(() => def?.fields ?? [], [def]);

  const onChange = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));
  const formulaNote = def?.formula;
  const ready = useMemo(() => fields.some((f) => (values[f.name] ?? "").trim() !== ""), [fields, values]);

  const run = () => {
    if (!def) {
      setError("This calculator is not wired yet.");
      return;
    }
    try {
      setError(null);
      const next = def.compute(values);
      setResults(next);
      const primary = next.find((item) => item.primary) ?? next[0];
      const summary = fields.map((field) => `${field.label}: ${values[field.name] ?? ""}`).filter((x) => !x.endsWith(": ")).join(" · ");
      const item: HistoryItem = {
        id: `${Date.now()}-${Math.random()}`,
        summary: summary || "Calculation",
        result: primary ? `${primary.label}: ${primary.value}${primary.hint ? ` ${primary.hint}` : ""}` : "Calculated",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setHistory((items) => [item, ...items].slice(0, 5));
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : "Could not calculate. Check your inputs.");
    }
  };

  if (!def) return <p className="text-sm text-muted">This calculator is not available.</p>;

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); run(); }}>
      <FieldGrid fields={fields} values={values} onChange={onChange} />
      {formulaNote ? <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-subtle">Formula: {formulaNote}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Calculate</Button>
        <Button type="button" variant="ghost" onClick={() => { setValues(initialValues(fields)); setResults([]); setError(null); }}>Reset</Button>
      </div>
      <ErrorBanner message={error} />
      {ready ? <ResultPanel items={results} filename={`env-${formula}.txt`} /> : null}
      {history.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface-2 p-3" aria-label="Recent calculations">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-medium"><Clock3 className="size-4" /> Recent calculations</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setHistory([])}><Trash2 className="size-4" /> Clear</Button>
          </div>
          <div className="space-y-2">
            {history.map((item) => (
              <div key={item.id} className="rounded-lg bg-surface px-3 py-2 text-xs">
                <div className="flex justify-between gap-3"><span className="truncate text-muted">{item.summary}</span><span className="shrink-0 text-subtle">{item.time}</span></div>
                <div className="mt-1 font-medium">{item.result}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </form>
  );
}
