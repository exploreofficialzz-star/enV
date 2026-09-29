import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/tools/copy-button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadText } from "@/lib/utils";
import { buildInteractiveOutput, parseInteractiveToolId } from "./interactive-engine-utils";

export function InteractiveEngine({ toolId }: { toolId: string }) {
  const parsed = useMemo(() => { try { return { value: parseInteractiveToolId(toolId), error: null }; } catch (e) { return { value: null, error: e instanceof Error ? e.message : "Unsupported interactive tool." }; } }, [toolId]);
  const [title, setTitle] = useState("My Interactive Experience");
  const [recipient, setRecipient] = useState("Guest");
  const [body, setBody] = useState("Welcome! I made this page for you.");
  const [optionA, setOptionA] = useState("Yes");
  const [optionB, setOptionB] = useState("Maybe later");
  const [date, setDate] = useState("");
  const input = { title, recipient, body, optionA, optionB, date };
  const result = useMemo(() => { if (!parsed.value) return ""; try { return buildInteractiveOutput(parsed.value.family, parsed.value.workflow, input); } catch { return ""; } }, [parsed.value, title, recipient, body, optionA, optionB, date]);
  const error = useMemo(() => { if (!parsed.value) return parsed.error; try { buildInteractiveOutput(parsed.value.family, parsed.value.workflow, input); return null; } catch (e) { return e instanceof Error ? e.message : "Invalid interactive inputs."; } }, [parsed.value, parsed.error, title, recipient, body, optionA, optionB, date]);
  const reset = () => { setTitle("My Interactive Experience"); setRecipient("Guest"); setBody("Welcome! I made this page for you."); setOptionA("Yes"); setOptionB("Maybe later"); setDate(""); };
  const family = parsed.value?.family;
  const needsOptions = family === "choice" || family === "decision" || family === "yes-no";
  const needsDate = family === "countdown";
  return <div className="space-y-5"><p className="text-sm text-muted-foreground">Build and export this interactive experience locally. No account or external service is required.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label htmlFor="interactive-title">Title</Label><Input id="interactive-title" value={title} onChange={e=>setTitle(e.target.value)} /></div>
      <div><Label htmlFor="interactive-recipient">Recipient</Label><Input id="interactive-recipient" value={recipient} onChange={e=>setRecipient(e.target.value)} /></div>
      <div className="sm:col-span-2"><Label htmlFor="interactive-body">Content</Label><textarea id="interactive-body" className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={body} onChange={e=>setBody(e.target.value)} /></div>
      {needsOptions ? <><div><Label htmlFor="interactive-option-a">Option A</Label><Input id="interactive-option-a" value={optionA} onChange={e=>setOptionA(e.target.value)} /></div>{family !== "yes-no" ? <div><Label htmlFor="interactive-option-b">Option B</Label><Input id="interactive-option-b" value={optionB} onChange={e=>setOptionB(e.target.value)} /></div> : null}</> : null}
      {needsDate ? <div><Label htmlFor="interactive-date">Target date/time</Label><Input id="interactive-date" type="datetime-local" value={date} onChange={e=>setDate(e.target.value)} /></div> : null}
    </div>
    <ErrorBanner message={error} />
    <div className="flex flex-wrap gap-2"><CopyButton text={result}/><Button type="button" variant="outline" size="sm" disabled={!result} onClick={()=>downloadText(result,`env-${toolId}.html`)}>Download</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>Reset</Button></div>
    {result ? <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{result}</pre> : null}
  </div>;
}
