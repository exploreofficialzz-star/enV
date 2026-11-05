import { cloneElement, isValidElement, useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/tools/copy-button";
import { ResultPanel } from "@/components/engines/result-panel";
import { downloadText } from "@/lib/utils";

import {
  buildCommunication,
  buildCommunicationCalendarIcs,
  buildSignatureHtml,
  communicationQualityChecks,
  getSmsMetrics,
  suggestGsm7Text,
  kindLabel,
  parseToolId,
  type Action,
  type CommunicationInput,
  type Kind,
} from "./communication-engine-utils";

function Output({ text, filename, html, calendar, gsm7 }: { text: string; filename: string; html?: string; calendar?: string; gsm7?: string }) {
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <CopyButton text={text} />
      <Button type="button" variant="outline" size="sm" onClick={() => downloadText(text, filename)}>Download</Button>
      {html ? <Button type="button" variant="outline" size="sm" onClick={() => downloadText(html, filename.replace(/\.txt$/, ".html"), "text/html")}>Download HTML</Button> : null}
      {calendar ? <Button type="button" variant="outline" size="sm" onClick={() => downloadText(calendar, filename.replace(/\.txt$/, ".ics"), "text/calendar")}>Save calendar (.ics)</Button> : null}
      {gsm7 ? <>
        <CopyButton text={gsm7} />
        <Button type="button" variant="outline" size="sm" onClick={() => downloadText(gsm7, filename.replace(/\.txt$/, "-gsm7.txt"))}>Download GSM-7 version</Button>
        <span className="self-center text-xs text-muted">GSM-7 compatible alternative · {getSmsMetrics(gsm7).segments} segment(s)</span>
      </> : null}
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

const toneOptions = [
  ["professional", "Professional"], ["friendly", "Friendly"], ["warm", "Warm"],
  ["concise", "Concise"], ["direct", "Direct"], ["empathetic", "Empathetic"],
] as const;

function BaseForm({ kind, action }: { kind: Kind; action: Action }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [place, setPlace] = useState("");
  const [purpose, setPurpose] = useState("");
  const [details, setDetails] = useState("");
  const [tone, setTone] = useState("professional");
  const [items, setItems] = useState("");
  const [email, setEmail] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [channel, setChannel] = useState(kind === "sms" ? "SMS" : "WhatsApp");
  const [duration, setDuration] = useState("30");
  const [timezone, setTimezone] = useState("");
  useEffect(() => { setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || ""); }, []);
  const [rsvpBy, setRsvpBy] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [decisions, setDecisions] = useState("");
  const [actionItems, setActionItems] = useState("");
  const [nextStep, setNextStep] = useState("");

  const input: CommunicationInput = {
    kind, action, name, subject, date, place, purpose, details, tone, items,
    email, cc, bcc, channel, duration, timezone, rsvpBy, role, company, phone,
    website, decisions, actionItems, nextStep,
  };
  const isSignature = kind === "signature";
  const canBuild = action === "template" || action === "planner" ||
    Boolean(details.trim() || purpose.trim() || items.trim() || decisions.trim() || actionItems.trim() ||
      (isSignature && [name, email, role, company, phone, website].some((value) => value.trim())));
  const output = useMemo(
    () => canBuild ? buildCommunication(input) : "",
    [action, actionItems, bcc, cc, channel, date, decisions, details, duration, email, items, kind, name, nextStep, place, purpose, rsvpBy, role, subject, timezone, tone, company, phone, website, canBuild],
  );
  const checks = useMemo(
    () => output ? communicationQualityChecks(input, output) : [],
    [output, action, actionItems, bcc, cc, date, details, duration, email, items, kind, name, nextStep, phone, purpose, rsvpBy, subject, timezone, website],
  );
  const sms = kind === "sms" && output ? getSmsMetrics(output) : null;
  const signatureHtml = isSignature && action !== "template" && action !== "formatter" && output ? buildSignatureHtml(input) : undefined;
  const calendar = useMemo(() => {
    if (!["meeting", "agenda", "invitation", "reminder"].includes(kind) || !output) return undefined;
    try { return buildCommunicationCalendarIcs(input); } catch { return undefined; }
  }, [actionItems, date, decisions, details, duration, items, kind, name, nextStep, place, purpose, rsvpBy, subject, timezone]);
  const smsCandidate = kind === "sms" && output ? suggestGsm7Text(output) : "";
  const gsm7 = smsCandidate && smsCandidate !== output && getSmsMetrics(smsCandidate).encoding === "GSM-7" ? smsCandidate : undefined;
  const title = kindLabel(kind) + " " + action;

  const reset = () => {
    setName(""); setSubject(""); setDate(""); setPlace(""); setPurpose(""); setDetails("");
    setTone("professional"); setItems(""); setEmail(""); setCc(""); setBcc("");
    setChannel(kind === "sms" ? "SMS" : "WhatsApp"); setDuration("30");
    setTimezone("");
    setRsvpBy(""); setRole(""); setCompany(""); setPhone(""); setWebsite("");
    setDecisions(""); setActionItems(""); setNextStep("");
  };

  const summary = action === "formatter"
    ? "Paste existing content. enV cleans spacing while preserving your wording and paragraph structure."
    : action === "template"
      ? "Start with a structured template. Replace the bracketed prompts with your real details."
      : action === "planner"
        ? "Build a practical checklist for preparing and following through on this communication."
        : "Create a structured draft locally, review the checks, then copy or export it. Nothing is sent.";

  return <div className="space-y-5">
    <p className="text-sm text-muted">{summary}</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={kind === "signature" ? "Full name" : kind === "meeting" || kind === "agenda" || kind === "minutes" ? "Attendee(s)" : "Recipient / audience"}>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name or audience" />
      </Field>
      <Field label={kind === "meeting" || kind === "agenda" || kind === "minutes" ? "Meeting title" : kind === "signature" ? "Role" : "Subject / title"}>
        <Input value={kind === "signature" ? role : subject} onChange={(event) => kind === "signature" ? setRole(event.target.value) : setSubject(event.target.value)} placeholder={kind === "signature" ? "Your role" : kindLabel(kind) + " title"} />
      </Field>

      {["meeting", "agenda", "minutes", "invitation", "reminder", "announcement", "follow-up"].includes(kind) ? <Field label="Date / time">
        <Input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} />
      </Field> : null}
      {["meeting", "agenda", "minutes", "invitation", "reminder"].includes(kind) || kind === "message" || kind === "sms" ? <Field label={kind === "message" || kind === "sms" ? "Channel" : "Location / meeting link"}>
        {kind === "message" || kind === "sms"
          ? <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={channel} onChange={(event) => setChannel(event.target.value)}>
              {(kind === "sms" ? ["SMS"] : ["WhatsApp", "Slack", "Microsoft Teams", "iMessage", "Email", "General"]).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          : <Input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Venue, address or meeting link" />}
      </Field> : null}

      {kind === "email" ? <>
        <Field label="Recipient email"><Input inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></Field>
        <Field label="Cc"><Input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="Optional visible recipients" /></Field>
        <Field label="Bcc"><Input value={bcc} onChange={(event) => setBcc(event.target.value)} placeholder="Optional hidden recipients" /></Field>
      </> : null}
      {kind === "signature" ? <>
        <Field label="Company"><Input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company or organization" /></Field>
        <Field label="Email"><Input inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></Field>
        <Field label="Phone"><Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Optional phone number" /></Field>
        <Field label="Website"><Input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" /></Field>
      </> : null}
      {["meeting", "agenda", "invitation", "reminder"].includes(kind) ? <Field label="Duration (minutes)"><Input inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value.replace(/[^\d]/g, ""))} placeholder="30" /></Field> : null}
      {kind === "meeting" || kind === "agenda" || kind === "minutes" || kind === "invitation" || kind === "reminder" ? <Field label="Time zone"><Input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="e.g. Africa/Lagos" /></Field> : null}
      {kind === "invitation" ? <Field label="RSVP deadline"><Input type="datetime-local" value={rsvpBy} onChange={(event) => setRsvpBy(event.target.value)} /></Field> : null}

      {kind !== "signature" && action !== "formatter" && action !== "template" ? <Field label="Purpose / context" full>
        <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="What should the reader understand or do?" />
      </Field> : null}
      {kind !== "signature" && action !== "formatter" && action !== "template" ? <Field label="Tone">
        <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={tone} onChange={(event) => setTone(event.target.value)}>
          {toneOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field> : null}

      {kind === "agenda" || kind === "minutes" || action === "planner" ? <Field label={kind === "minutes" ? "Agenda / discussion topics" : "Agenda items (one per line)"} full>
        <Textarea className="min-h-24" value={items} onChange={(event) => setItems(event.target.value)} placeholder={"Welcome\nMain discussion\nDecisions and next steps"} />
      </Field> : null}
      {kind === "minutes" ? <>
        <Field label="Decisions (one per line)" full><Textarea className="min-h-20" value={decisions} onChange={(event) => setDecisions(event.target.value)} placeholder={"Decision — reason — owner"} /></Field>
        <Field label="Action items (Owner | Task | Due date)" full><Textarea className="min-h-24" value={actionItems} onChange={(event) => setActionItems(event.target.value)} placeholder={"Alex | Send the notes | 2026-11-06"} /></Field>
      </> : null}
      {kind === "signature" ? <Field label="Short note / disclaimer (optional)" full><Textarea className="min-h-20" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Only include a disclaimer when your organization requires it." /></Field> : null}
      {kind !== "signature" ? <Field label={action === "formatter" ? "Text to format" : "Details / message"} full>
        <Textarea className="min-h-32" value={details} onChange={(event) => setDetails(event.target.value)} placeholder={action === "formatter" ? "Paste the content you want cleaned…" : "Add the important facts, context or message body…"} />
      </Field> : null}
      {["email", "message", "sms", "follow-up", "reminder", "announcement", "invitation", "minutes"].includes(kind) ? <Field label={kind === "invitation" ? "RSVP method / link" : kind === "minutes" ? "Next review date / owner" : kind === "sms" ? "Action / deadline" : "Next step / call to action"} full>
        <Input value={nextStep} onChange={(event) => setNextStep(event.target.value)} placeholder={kind === "invitation" ? "RSVP email, form or contact" : kind === "minutes" ? "e.g. Review on 2026-11-12" : kind === "sms" ? "e.g. Reply YES by 5 PM" : "What should happen next?"} />
      </Field> : null}
    </div>

    <ResultPanel items={[
      { label: "Operation", value: title },
      { label: "Status", value: output ? (checks.length ? checks.length + " review check(s)" : "Draft ready") : "Add details to begin", primary: true },
      ...(sms ? [
        { label: "Encoding", value: sms.encoding },
        { label: "Segments", value: sms.segments + " · " + sms.units + " units" },
      ] : []),
    ]} />
    {checks.length ? <div className="rounded-xl border border-border p-3" role="status">
      <p className="mb-2 text-sm font-medium">Review before use</p>
      <ul className="space-y-1 text-sm text-muted">{checks.map((check) => <li key={check}>• {check}</li>)}</ul>
    </div> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="ghost" onClick={reset}>Reset</Button>
    </div>
    {output ? <Output text={output} filename={"env-" + kind + "-" + action + ".txt"} html={signatureHtml} calendar={calendar} gsm7={gsm7} /> :
      <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted">Your result will appear here when you add the information for this {kindLabel(kind).toLowerCase()}.</div>}
    <p className="text-xs text-muted">Runs on this device. enV does not send messages, schedule reminders, record meetings, collect RSVP responses or apply legal signatures.</p>
  </div>;
}

export function CommunicationEngine({ toolId }: { toolId: string }) {
  const { kind, action } = parseToolId(toolId);
  return <BaseForm key={toolId} kind={kind} action={action} />;
}
