import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { FieldGrid } from "@/components/engines/fields";
import { initialValues } from "@/components/engines/initial-values";
import { ResultPanel } from "@/components/engines/result-panel";
import { calculators } from "@/lib/engines/formulas";

export function CalculatorEngine({ formula }: { formula: string }) {
  const def = calculators[formula];
  const [values, setValues] = useState(() => initialValues(def?.fields ?? []));
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ label: string; value: string; hint?: string; primary?: boolean }[]>([]);

  const fields = useMemo(() => def?.fields ?? [], [def]);

  const onChange = (name: string, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
  };

  const run = () => {
    if (!def) {
      setError("This calculator is not wired yet.");
      return;
    }
    try {
      setError(null);
      setResults(def.compute(values));
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : "Could not calculate. Check your inputs.");
    }
  };

  const formulaNote = def?.formula;

  const ready = useMemo(() => fields.some((f) => (values[f.name] ?? "").trim() !== ""), [fields, values]);

  if (!def) {
    return <p className="text-sm text-muted">This calculator is not available.</p>;
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <FieldGrid fields={fields} values={values} onChange={onChange} />
      {formulaNote ? <p className="text-xs text-subtle">{formulaNote}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Calculate</Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setValues(initialValues(fields));
            setResults([]);
            setError(null);
          }}
        >
          Reset
        </Button>
      </div>
      <ErrorBanner message={error} />
      {ready ? <ResultPanel items={results} filename={`env-${formula}.txt`} /> : null}
    </form>
  );
}
