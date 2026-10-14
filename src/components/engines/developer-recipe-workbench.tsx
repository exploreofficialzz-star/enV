import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Download, Plus, RotateCcw, ShieldCheck, Trash2, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBanner } from "@/components/tools/error-banner";
import { DEVELOPER_RECIPE_OPERATIONS, runDeveloperRecipe } from "@/lib/engines/developer-studios";

type StepDraft = { id: number; op: string; name: string; find: string; replacement: string; pointer: string };
type RecipeReport = {
  status: string;
  stepsCompleted: number;
  steps: Array<{ index: number; name: string; operation: string; status: string; inputUtf8Bytes: number; outputUtf8Bytes: number; preview: string; warnings: string[] }>;
  finalOutput: string;
  finalOutputCharacters: number;
  finalOutputUtf8Bytes: number;
  warnings: string[];
  semantics: string[];
};

const EXAMPLE_INPUT = "  <p>Hello   <strong>enV</strong> 🚀</p>\r\n";
const EXAMPLE_STEPS = (): StepDraft[] => [
  { id: 1, name: "Normalize line endings", op: "normalize-newlines", find: "", replacement: "", pointer: "" },
  { id: 2, name: "Remove opening paragraph tag", op: "replace-literal", find: "<p>", replacement: "", pointer: "" },
  { id: 3, name: "Remove closing paragraph tag", op: "replace-literal", find: "</p>", replacement: "", pointer: "" },
  { id: 4, name: "Remove opening strong tag", op: "replace-literal", find: "<strong>", replacement: "", pointer: "" },
  { id: 5, name: "Remove closing strong tag", op: "replace-literal", find: "</strong>", replacement: "", pointer: "" },
  { id: 6, name: "Collapse whitespace", op: "collapse-whitespace", find: "", replacement: "", pointer: "" },
  { id: 7, name: "Trim", op: "trim", find: "", replacement: "", pointer: "" },
];
const readableOp = (op: string) => op.split("-").map((part) => part === "nfc" || part === "nfd" || part === "nfkc" || part === "nfkd" ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

/** First-class native React workbench for building, reordering, inspecting, and rerunning bounded recipes. */
export function DeveloperRecipeWorkbench() {
  const [input, setInput] = useState(EXAMPLE_INPUT);
  const [steps, setSteps] = useState<StepDraft[]>(EXAMPLE_STEPS);
  const [newOperation, setNewOperation] = useState("trim");
  const [report, setReport] = useState<RecipeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [nextId, setNextId] = useState(8);
  const importInputRef = useRef<HTMLInputElement>(null);
  const byteCount = useMemo(() => new TextEncoder().encode(input).byteLength, [input]);
  const currentConfig = () => ({ input, steps: steps.map(({ id: _id, ...step }) => ({ op: step.op, ...(step.name.trim() ? { name: step.name.trim() } : {}), ...(step.op === "replace-literal" ? { find: step.find, replacement: step.replacement } : {}), ...(step.op === "json-pointer-get" ? { pointer: step.pointer } : {}) })) });

  const patchStep = (id: number, patch: Partial<StepDraft>) => setSteps((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step));
  const move = (index: number, direction: -1 | 1) => setSteps((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const copy = [...current]; [copy[index], copy[target]] = [copy[target], copy[index]]; return copy;
  });
  const loadExample = () => { setInput(EXAMPLE_INPUT); setSteps(EXAMPLE_STEPS()); setNextId(8); setReport(null); setError(null); setNotice(""); };
  const run = async () => {
    setBusy(true); setError(null); setNotice(""); setReport(null);
    try {
      const raw = await runDeveloperRecipe(JSON.stringify(currentConfig()));
      const parsed = JSON.parse(raw) as RecipeReport;
      setReport(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recipe could not be completed.");
    } finally { setBusy(false); }
  };
  const copy = async (value: string, what: string) => {
    try { await navigator.clipboard.writeText(value); setNotice(`${what} copied.`); }
    catch { setError("Clipboard access was unavailable. Select the output and copy it manually."); }
  };
  const download = (value: string, filename: string, type = "text/plain;charset=utf-8") => {
    const url = URL.createObjectURL(new Blob([value], { type }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
    queueMicrotask(() => URL.revokeObjectURL(url));
  };
  const importRecipe = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 7 * 1_048_576) throw new Error("Recipe file exceeds the 7 MiB safety limit.");
      const parsed = JSON.parse(await file.text()) as { input?: unknown; steps?: unknown };
      if (typeof parsed.input !== "string" || !Array.isArray(parsed.steps) || parsed.steps.length < 1 || parsed.steps.length > 16) throw new Error("Recipe JSON needs a string input and between 1 and 16 steps.");
      const imported = parsed.steps.map((candidate, index) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error(`Recipe step ${index + 1} must be an object.`);
        const step = candidate as Record<string, unknown>;
        if (typeof step.op !== "string" || !DEVELOPER_RECIPE_OPERATIONS.includes(step.op)) throw new Error(`Recipe step ${index + 1} uses an unsupported operation.`);
        for (const key of ["name", "find", "replacement", "replace", "pointer"] as const) if (step[key] !== undefined && typeof step[key] !== "string") throw new Error(`Recipe step ${index + 1}: ${key} must be text.`);
        return { id: index + 1, op: step.op, name: typeof step.name === "string" ? step.name : readableOp(step.op), find: typeof step.find === "string" ? step.find : "", replacement: typeof step.replacement === "string" ? step.replacement : typeof step.replace === "string" ? step.replace : "", pointer: typeof step.pointer === "string" ? step.pointer : "" };
      });
      setInput(parsed.input); setSteps(imported); setNextId(imported.length + 1); setReport(null); setError(null); setNotice("Recipe JSON loaded locally. Review it, then run the recipe.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import the local recipe file."); }
    finally { if (importInputRef.current) importInputRef.current.value = ""; }
  };
  const loadJsonExample = () => {
    setInput('{"items":[{"id":9007199254740993,"name":"enV"}]}');
    setSteps([{ id: 1, op: "json-pointer-get", name: "Extract item ID losslessly", find: "", replacement: "", pointer: "/items/0/id" }]);
    setNextId(2); setReport(null); setError(null); setNotice("Loaded a JSON Pointer example. The large integer should remain exact.");
  };

  return <div className="space-y-5">
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-3 text-sm" role="note">
      <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><div><p className="font-medium">Local recipe execution</p><p className="mt-1 text-muted">An explicit allow-list of transforms runs in this browser. No arbitrary script/eval, shell, network or user-defined code steps are accepted. Input stays in memory and is not uploaded by this engine.</p></div></div>
    </div>

    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="recipe-source">Source text</Label><span className="text-xs text-muted tabular-nums">{byteCount.toLocaleString()} / 1,048,576 UTF-8 bytes</span></div>
      <Textarea id="recipe-source" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void run(); } }} className="min-h-40 font-mono" placeholder="Paste text, JSON, logs, HTML, or encoded text…" />
    </div>

    <section className="space-y-3" aria-labelledby="recipe-steps-heading">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="recipe-steps-heading" className="text-base font-semibold">Transformation steps</h3><p className="text-xs text-muted">Steps run from top to bottom. Each step receives the previous step’s output.</p></div><span className="text-xs text-muted">{steps.length} / 16</span></div>
      <ol className="space-y-3">
        {steps.map((step, index) => <li key={step.id} className="rounded-lg border border-border p-3">
          <div className="flex items-start gap-2"><span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-xs font-semibold">{index + 1}</span><div className="min-w-0 flex-1 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2"><label className="block space-y-1"><Label htmlFor={`recipe-op-${step.id}`}>Operation</Label><select id={`recipe-op-${step.id}`} value={step.op} onChange={(event) => patchStep(step.id, { op: event.target.value, name: step.name || readableOp(event.target.value) })} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm">{DEVELOPER_RECIPE_OPERATIONS.map((op) => <option key={op} value={op}>{readableOp(op)}</option>)}</select></label><label className="block space-y-1"><Label htmlFor={`recipe-name-${step.id}`}>Step name (optional)</Label><Input id={`recipe-name-${step.id}`} value={step.name} onChange={(event) => patchStep(step.id, { name: event.target.value })} maxLength={100} placeholder={readableOp(step.op)} /></label></div>
            {step.op === "replace-literal" ? <div className="grid gap-2 sm:grid-cols-2"><label className="block space-y-1"><Label htmlFor={`recipe-find-${step.id}`}>Find literal text</Label><Input id={`recipe-find-${step.id}`} value={step.find} onChange={(event) => patchStep(step.id, { find: event.target.value })} maxLength={10000} placeholder="Required, case-sensitive" /></label><label className="block space-y-1"><Label htmlFor={`recipe-replace-${step.id}`}>Replace with</Label><Input id={`recipe-replace-${step.id}`} value={step.replacement} onChange={(event) => patchStep(step.id, { replacement: event.target.value })} maxLength={100000} placeholder="Can be empty" /></label></div> : null}
            {step.op === "json-pointer-get" ? <label className="block space-y-1"><Label htmlFor={`recipe-pointer-${step.id}`}>JSON Pointer (RFC 6901)</Label><Input id={`recipe-pointer-${step.id}`} value={step.pointer} onChange={(event) => patchStep(step.id, { pointer: event.target.value })} placeholder="/items/0/id (empty selects root)" /></label> : null}
          </div><div className="flex shrink-0 flex-col gap-1"> <Button type="button" size="icon" variant="ghost" aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`Move step ${index + 1} down`} disabled={index === steps.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`Remove step ${index + 1}`} disabled={steps.length <= 1} onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))}><Trash2 className="size-4" /></Button></div></div>
        </li>)}
      </ol>
      <div className="flex flex-wrap items-center gap-2"><label className="min-w-0 flex-1 space-y-1"><Label htmlFor="recipe-new-operation">Add operation</Label><select id="recipe-new-operation" value={newOperation} onChange={(event) => setNewOperation(event.target.value)} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm">{DEVELOPER_RECIPE_OPERATIONS.map((op) => <option key={op} value={op}>{readableOp(op)}</option>)}</select></label><Button type="button" variant="outline" className="mt-5" disabled={steps.length >= 16} onClick={() => { setSteps((current) => [...current, { id: nextId, op: newOperation, name: "", find: "", replacement: "", pointer: "" }]); setNextId((id) => id + 1); }}><Plus className="mr-1.5 size-4" />Add step</Button></div>
    </section>

    <div className="flex flex-wrap items-center gap-2"><Button type="button" onClick={() => void run()} disabled={busy || steps.length < 1}><Workflow className="mr-1.5 size-4" />{busy ? "Running recipe…" : "Run recipe"}</Button><Button type="button" variant="outline" onClick={loadExample}><RotateCcw className="mr-1.5 size-4" />Load text example</Button><Button type="button" variant="outline" onClick={loadJsonExample}>Load JSON Pointer example</Button><Button type="button" variant="outline" onClick={() => download(JSON.stringify(currentConfig(), null, 2), "env-recipe.json", "application/json;charset=utf-8")}><Download className="mr-1.5 size-4" />Export recipe</Button><Button type="button" variant="outline" onClick={() => importInputRef.current?.click()}>Import recipe</Button><input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" aria-label="Choose recipe JSON file" onChange={(event) => void importRecipe(event.target.files?.[0])} /><Button type="button" variant="ghost" onClick={() => { setInput(""); setSteps([{ id: 1, op: "trim", name: "Trim", find: "", replacement: "", pointer: "" }]); setNextId(2); setReport(null); setError(null); setNotice(""); }}>Reset</Button><span className="text-xs text-muted">Ctrl/⌘ + Enter runs the recipe.</span></div>
    <ErrorBanner message={error} />
    {notice ? <p className="text-sm text-muted" role="status">{notice}</p> : null}

    {report ? <section className="space-y-4 border-t border-border pt-4" aria-labelledby="recipe-results-heading">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 id="recipe-results-heading" className="text-base font-semibold">Recipe completed</h3><p className="mt-1 text-sm text-muted">{report.stepsCompleted} steps · {report.finalOutputCharacters.toLocaleString()} Unicode code points · {report.finalOutputUtf8Bytes.toLocaleString()} UTF-8 bytes</p></div><span className="rounded-md border border-emerald-700/30 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">{report.status}</span></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void copy(report.finalOutput, "Final output")}><Copy className="mr-1.5 size-4" />Copy output</Button><Button type="button" variant="outline" size="sm" onClick={() => download(report.finalOutput, "env-recipe-output.txt")}><Download className="mr-1.5 size-4" />Download output</Button><Button type="button" variant="ghost" size="sm" onClick={() => void copy(JSON.stringify(report, null, 2), "Audit report")}><Copy className="mr-1.5 size-4" />Copy audit JSON</Button></div>
      <div className="space-y-1"><Label htmlFor="recipe-final-output">Final output</Label><Textarea id="recipe-final-output" readOnly value={report.finalOutput} className="min-h-40 font-mono" /></div>
      <div className="space-y-2"><h4 className="text-sm font-semibold">Step audit trail</h4><ol className="space-y-2">{report.steps.map((step) => <li key={step.index} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium">{step.index}. {step.name}</p><p className="mt-1 text-xs text-muted">{readableOp(step.operation)} · {step.inputUtf8Bytes.toLocaleString()} → {step.outputUtf8Bytes.toLocaleString()} bytes</p></div><span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{step.status}</span></div><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-2 font-mono text-xs">{step.preview || "(empty output)"}</pre>{step.warnings.map((warning) => <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" key={warning}>{warning}</p>)}</li>)}</ol></div>
      {report.warnings.length ? <div className="space-y-1"><h4 className="text-sm font-semibold">Warnings</h4>{report.warnings.map((warning) => <p className="text-sm text-amber-700 dark:text-amber-400" key={warning}>{warning}</p>)}</div> : null}
      <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Engine semantics and safety notes</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">{report.semantics.map((item) => <li key={item}>{item}</li>)}</ul></details>
    </section> : null}
  </div>;
}
