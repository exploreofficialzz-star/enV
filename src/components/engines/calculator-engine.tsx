import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CalculatorFields } from "@/components/engines/calculator-fields";
import { CalculatorResults, NumberDisplayControls } from "@/components/engines/calculator-results";
import { initialValues } from "@/components/engines/initial-values";
import { CalcInputError } from "@/lib/calc/numeric";
import { DEFAULT_DISPLAY, applyDisplaySettings, buildCalculationSummary, describeOutput, type DisplaySettings } from "@/lib/calc/display";
import { calculators, type CalcOutput } from "@/lib/engines/formulas";
import { Clock3, RotateCcw, Trash2, X } from "lucide-react";

type CalcError = { message: string; /** Name of the input the error is about, when known. */ field: string | null };
type Computed = { outputs: CalcOutput[]; inputs: Record<string, string>; steps: string[] };
type HistoryItem = { id: string; summary: string; result: string; time: string; values: Record<string, string> };

export function CalculatorEngine({ formula }: { formula: string; toolId?: string }) {
  // Keyed by formula so navigating between calculators never carries over inputs, results or errors.
  return <CalculatorForm key={formula} formula={formula} />;
}

function CalculatorForm({ formula }: { formula: string }) {
  const def = calculators[formula];
  const fields = useMemo(() => def?.fields ?? [], [def]);
  const errorId = useId();
  const [values, setValues] = useState(() => initialValues(fields));
  const [error, setError] = useState<CalcError | null>(null);
  const [computed, setComputed] = useState<Computed | null>(null);
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_DISPLAY);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState("");

  // Move focus to the input an error is about so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (error?.field) document.getElementById(error.field)?.focus();
  }, [error]);

  const shown = useMemo(() => (computed ? applyDisplaySettings(computed.outputs, display) : []), [computed, display]);
  const inputList = useMemo(
    () => (computed ? fields.map((field) => ({ label: field.label, value: computed.inputs[field.name] ?? "", suffix: field.suffix })) : []),
    [computed, fields],
  );
  const summary = useMemo(
    () => (computed ? buildCalculationSummary({ formula: def?.formula, inputs: inputList, steps: computed.steps, outputs: shown }) : ""),
    [computed, def, inputList, shown],
  );
  const stale = computed !== null && fields.some((field) => (values[field.name] ?? "") !== (computed.inputs[field.name] ?? ""));
  const hasNumericResults = computed?.outputs.some((item) => item.raw !== undefined) ?? false;

  const onChange = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));

  const run = () => {
    if (!def) return;
    try {
      const outputs = def.compute(values);
      let steps: string[] = [];
      try {
        steps = def.explain?.(values) ?? [];
      } catch {
        steps = []; // steps are a courtesy; never let them hide a valid result
      }
      const primary = outputs.find((item) => item.primary) ?? outputs[0];
      setError(null);
      setComputed({ outputs, inputs: { ...values }, steps });
      setStatus(primary ? describeOutput(primary) : "Calculated");
      const summaryText = fields.map((field) => `${field.label}: ${values[field.name] ?? ""}`).filter((x) => !x.endsWith(": ")).join(" · ");
      const item: HistoryItem = {
        id: `${Date.now()}-${Math.random()}`,
        summary: summaryText || "Calculation",
        result: primary ? `${describeOutput(primary)}${primary.hint ? ` ${primary.hint}` : ""}` : "Calculated",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        values: { ...values },
      };
      setHistory((items) => [item, ...items].slice(0, 5));
    } catch (e) {
      const reference = e instanceof CalcInputError ? e.field : undefined;
      const target = reference ? fields.find((field) => field.name === reference || field.label === reference) : undefined;
      setComputed(null);
      setStatus("");
      setError({ message: e instanceof Error ? e.message : "Could not calculate. Check your inputs.", field: target?.name ?? null });
    }
  };

  const reset = () => {
    setValues(initialValues(fields));
    setComputed(null);
    setError(null);
    setStatus("");
  };

  const reuse = (item: HistoryItem) => {
    setValues(item.values);
    setComputed(null);
    setError(null);
    setStatus("");
  };

  if (!def) return <p className="text-sm text-muted">This calculator is not available.</p>;

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <CalculatorFields fields={fields} values={values} onChange={onChange} invalidField={error?.field ?? null} errorId={errorId} />
      {def.formula ? <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-subtle">Formula: {def.formula}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Calculate</Button>
        <Button type="button" variant="ghost" onClick={reset}>
          Reset
        </Button>
      </div>
      <div id={errorId}>
        <ErrorBanner message={error?.message ?? null} />
      </div>
      <p role="status" className="sr-only">
        {status}
      </p>
      {computed ? (
        <>
          <CalculatorResults items={shown} summary={summary} stale={stale} inputs={inputList} steps={computed.steps} filename={`env-${formula}.txt`} />
          {hasNumericResults ? <NumberDisplayControls settings={display} onChange={setDisplay} /> : null}
        </>
      ) : null}
      {history.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface-2 p-3" aria-label="Recent calculations">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Clock3 className="size-4" /> Recent calculations
            </h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setHistory([])}>
              <Trash2 className="size-4" /> Clear
            </Button>
          </div>
          <ul className="space-y-2">
            {history.map((item) => (
              <li key={item.id} className="rounded-lg bg-surface px-3 py-2 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="truncate text-muted">{item.summary}</span>
                  <span className="shrink-0 text-subtle">{item.time}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-medium">{item.result}</span>
                  <span className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => reuse(item)} aria-label={`Reuse inputs from ${item.time}`}>
                      <RotateCcw className="size-4" /> Reuse
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setHistory((items) => items.filter((entry) => entry.id !== item.id))}
                      aria-label={`Remove calculation from ${item.time}`}
                    >
                      <X className="size-4" />
                    </Button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </form>
  );
}
