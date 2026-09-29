import { cloneElement, isValidElement, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/tools/copy-button";
import { ResultPanel } from "@/components/engines/result-panel";
import { downloadText } from "@/lib/utils";

import { buildCommunication, kindLabel, parseToolId, type Action, type Kind } from "./communication-engine-utils";

function Output({ text, filename }: { text: string; filename: string }) {
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <CopyButton text={text} />
      <Button type="button" variant="outline" size="sm" onClick={() => downloadText(text, filename)}>Download</Button>
    </div>
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{text}</pre>
  </div>;
}

function Field({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) {
  const generatedId = useId();
  const control = isValidElement<{ id?: string }>(children)
    ? cloneElement(children, { id: children.props.id ?? generatedId })
    : children;
  const controlId = isValidElement<{ id?: string }>(control) ? control.props.id : generatedId;
  return (
    <div className={full ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}>
      <Label htmlFor={controlId}>{label}</Label>
      {control}
    </div>
  );
}

function BaseForm({ kind, action }: { kind: Kind; action: Action }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [place, setPlace] = useState("");
  const [purpose, setPurpose] = useState("");
  const [details, setDetails] = useState("");
  const [tone, setTone] = useState("professional");
  const [items, setItems] = useState("Welcome\nMain discussion\nQuestions\nNext steps");

  const output = useMemo(() => buildCommunication({ kind, action, name, subject, date, place, purpose, details, tone, items }), [action, date, details, items, kind, name, place, purpose, subject, tone]);
  const title = `${kindLabel(kind)} ${action}`;
  const reset = () => {
    setName("");
    setSubject("");
    setDate("");
    setPlace("");
    setPurpose("");
    setDetails("");
    setTone("professional");
    setItems("Welcome\nMain discussion\nQuestions\nNext steps");
  };
  const summary = action === "formatter"
    ? "Paste existing communication and the tool will structure it locally."
    : action === "template"
      ? "Start from an editable, reusable template."
      : "Create a copyable communication document locally. No message is sent."
  ;

  return <div className="space-y-5">
    <p className="text-sm text-muted">{summary}</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Recipient / name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name or audience" /></Field>
      <Field label={kind === "meeting" || kind === "agenda" || kind === "minutes" ? "Meeting title" : "Subject / title"}><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`${kindLabel(kind)} title`} /></Field>
      <Field label="Date / time"><Input value={date} onChange={(e) => setDate(e.target.value)} placeholder="e.g. Friday, 10:00 AM" /></Field>
      <Field label="Location / channel"><Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Office, Zoom, email, etc." /></Field>
      <Field label="Purpose / context"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What is this communication about?" /></Field>
      {action !== "formatter" && action !== "template" ? <Field label="Tone"><select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={tone} onChange={(e) => setTone(e.target.value)}><option value="professional">Professional</option><option value="friendly">Friendly</option><option value="concise">Concise</option><option value="warm">Warm</option></select></Field> : null}
      <Field label={action === "formatter" ? "Text to format" : "Details / body"} full><Textarea className="min-h-32" value={details} onChange={(e) => setDetails(e.target.value)} placeholder={action === "formatter" ? "Paste the text you want structured…" : "Add the important details…"} /></Field>
      {(kind === "agenda" || kind === "minutes" || action === "planner") ? <Field label="Items (one per line)" full><Textarea value={items} onChange={(e) => setItems(e.target.value)} /></Field> : null}
    </div>
    <ResultPanel items={[{ label: "Operation", value: title }, { label: "Status", value: "Generated locally", primary: true }]} />
    <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" onClick={reset}>Reset</Button></div>
    <Output text={output} filename={`env-${kind}-${action}.txt`} />
  </div>;
}

export function CommunicationEngine({ toolId }: { toolId: string }) {
  const { kind, action } = parseToolId(toolId);
  return <BaseForm key={toolId} kind={kind} action={action} />;
}
