import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/tools/copy-button";
import { ResultPanel } from "@/components/engines/result-panel";
import { downloadText } from "@/lib/utils";
import {
  buildCelebration,
  celebrationCountdown,
  celebrationOccasionLabel,
  parseCelebrationToolId,
  type CelebrationInput,
} from "./celebration-engine-utils";

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <div className={full ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}>
    <Label>{label}</Label>
    {children}
  </div>;
}

const themes = [
  ["classic", "Classic"], ["rose", "Rose"], ["gold", "Gold"],
  ["garden", "Garden"], ["ocean", "Ocean"], ["midnight", "Midnight"],
];

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("A selected photo could not be read."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("A selected photo could not be read."));
    reader.readAsDataURL(file);
  });
}

export function CelebrationEngine({ toolId }: { toolId: string }) {
  const parsed = parseCelebrationToolId(toolId);
  const [values, setValues] = useState<CelebrationInput>({
    ...parsed, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    theme: "classic", photos: [],
  });
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const result = useMemo(() => buildCelebration(values), [values]);
  const countdown = parsed.experience === "countdown" ? celebrationCountdown(values, now) : null;
  const update = (key: keyof CelebrationInput, value: string | string[]) =>
    setValues((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    if (parsed.experience !== "countdown") return;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [parsed.experience]);

  async function selectPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    const files = Array.from(event.target.files ?? []);
    if (files.length > 8) { setError("Choose up to 8 photos."); event.target.value = ""; return; }
    if (files.some((file) => !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type))) {
      setError("Use JPG, PNG, WebP or AVIF photos."); event.target.value = ""; return;
    }
    if (files.some((file) => file.size > 2 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 8 * 1024 * 1024) {
      setError("Keep each photo under 2 MB and the total selection under 8 MB."); event.target.value = ""; return;
    }
    try { update("photos", await Promise.all(files.map(fileAsDataUrl))); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The photos could not be read."); }
    event.target.value = "";
  }

  const label = celebrationOccasionLabel(parsed.occasion);
  const title = values.title?.trim() || label + " celebration";
  const isInvite = parsed.experience === "invitation-generator";
  const isCountdown = parsed.experience === "countdown";
  const isMemory = parsed.experience === "memory-page";
  const isQuiz = parsed.experience === "quiz-generator";
  const isReveal = parsed.experience === "reveal-page" || parsed.experience === "surprise-page" || parsed.experience === "interactive-card";

  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Create a personal {label.toLowerCase()} experience, preview the details and export a clean page or message. Everything is prepared on this device.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Title">
        <Input value={values.title ?? ""} onChange={(event) => update("title", event.target.value)} placeholder={label + " celebration"} maxLength={120} />
      </Field>
      <Field label="Person or group being celebrated">
        <Input value={values.honoree ?? ""} onChange={(event) => update("honoree", event.target.value)} placeholder="Name" maxLength={100} />
      </Field>
      <Field label="Host / organiser">
        <Input value={values.host ?? ""} onChange={(event) => update("host", event.target.value)} placeholder="Optional" maxLength={100} />
      </Field>
      <Field label="Theme">
        <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={values.theme} onChange={(event) => update("theme", event.target.value)}>
          {themes.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select>
      </Field>
      {parsed.experience !== "interactive-card" && parsed.experience !== "reveal-page" && parsed.experience !== "surprise-page" && parsed.experience !== "quiz-generator" && parsed.experience !== "memory-page" ? <>
        <Field label="Date and time">
          <Input type="datetime-local" value={values.date ?? ""} onChange={(event) => update("date", event.target.value)} />
        </Field>
        <Field label="Time zone">
          <Input value={values.timezone ?? ""} onChange={(event) => update("timezone", event.target.value)} placeholder="Africa/Lagos" />
        </Field>
      </> : null}
      {["page-generator", "invitation-generator", "countdown"].includes(parsed.experience) ? <>
        <Field label="Location / venue">
          <Input value={values.location ?? ""} onChange={(event) => update("location", event.target.value)} placeholder="Venue or online meeting link" maxLength={180} />
        </Field>
      </> : null}
      {isInvite ? <>
        <Field label="RSVP link">
          <Input value={values.rsvpUrl ?? ""} onChange={(event) => update("rsvpUrl", event.target.value)} placeholder="https://…" inputMode="url" />
        </Field>
        <Field label="Reply by">
          <Input value={values.rsvpBy ?? ""} onChange={(event) => update("rsvpBy", event.target.value)} placeholder="e.g. 20 December" maxLength={80} />
        </Field>
        <Field label="Dress code / theme">
          <Input value={values.dressCode ?? ""} onChange={(event) => update("dressCode", event.target.value)} placeholder="Optional" maxLength={100} />
        </Field>
      </> : null}
      {parsed.experience === "page-generator" ? <Field label="Schedule / programme (one item per line)" full>
        <Textarea value={values.schedule ?? ""} onChange={(event) => update("schedule", event.target.value)} rows={4} placeholder={"Welcome\nMain activity\nCelebration"} />
      </Field> : null}
      {isMemory ? <>
        <Field label="Memory notes" full>
          <Textarea value={values.memories ?? ""} onChange={(event) => update("memories", event.target.value)} rows={4} placeholder="Add a favourite moment, story or personal note…" />
        </Field>
        <Field label="Add photos (up to 8)" full>
          <Input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={selectPhotos} />
          <p className="text-xs text-muted-foreground">{(values.photos ?? []).length} photo(s) selected. Photos stay in this page until you export it.</p>
        </Field>
      </> : null}
      {isReveal ? <Field label={parsed.experience === "interactive-card" ? "Inside of the card" : "Message to reveal"} full>
        <Textarea value={values.revealMessage ?? ""} onChange={(event) => update("revealMessage", event.target.value)} rows={4} placeholder="Write the message guests will discover…" />
      </Field> : null}
      {isQuiz ? <>
        <Field label="Question" full>
          <Textarea value={values.quizQuestion ?? ""} onChange={(event) => update("quizQuestion", event.target.value)} rows={2} placeholder="Ask a question about the person or occasion…" />
        </Field>
        <Field label="Answer choices (one per line)" full>
          <Textarea value={values.quizOptions ?? ""} onChange={(event) => update("quizOptions", event.target.value)} rows={4} placeholder={"Choice one\nChoice two\nChoice three"} />
        </Field>
        <Field label="Correct answer">
          <Input value={values.quizAnswer ?? ""} onChange={(event) => update("quizAnswer", event.target.value)} placeholder="Enter one choice exactly" />
        </Field>
      </> : null}
      <Field label="Main message" full>
        <Textarea value={values.message ?? ""} onChange={(event) => update("message", event.target.value)} rows={4} placeholder="Write the message in your own words…" maxLength={3000} />
      </Field>
      {parsed.experience !== "interactive-card" && parsed.experience !== "reveal-page" && parsed.experience !== "surprise-page" && parsed.experience !== "quiz-generator" ? <Field label="Extra details" full>
        <Textarea value={values.details ?? ""} onChange={(event) => update("details", event.target.value)} rows={3} placeholder="Helpful details, access notes or anything guests should know…" maxLength={3000} />
      </Field> : null}
    </div>

    {error ? <div className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive" role="alert">{error}</div> : null}
    {result.checks.length ? <div className="rounded-xl border border-border p-3" role="status">
      <p className="mb-2 text-sm font-medium">Review before sharing</p>
      <ul className="space-y-1 text-sm text-muted-foreground">{result.checks.map((check) => <li key={check}>• {check}</li>)}</ul>
    </div> : null}
    {isCountdown ? <ResultPanel items={[
      { label: "Countdown", value: countdown ? (countdown.complete ? "The celebration has started" : countdown.days + " days · " + countdown.hours + " hours · " + countdown.minutes + " minutes · " + countdown.seconds + " seconds") : "Add a valid date, time and time zone", primary: true },
      { label: "Time zone", value: values.timezone || "Not set" },
    ]} /> : null}
    <div className="rounded-xl border border-border p-4 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{values.message?.trim() || "Your personal message will appear here."}</p>
      {values.honoree ? <p className="text-sm">For {values.honoree}</p> : null}
      {values.date ? <p className="text-sm">{values.date} {values.timezone ? "· " + values.timezone : ""}</p> : null}
      {values.location ? <p className="text-sm">{values.location}</p> : null}
      {isMemory && values.photos?.length ? <div className="flex flex-wrap gap-2">{values.photos.map((photo, index) => <img key={index} src={photo} alt={"Memory " + (index + 1)} className="h-16 w-16 rounded-lg object-cover" />)}</div> : null}
    </div>
    <ResultPanel items={[
      { label: "Experience", value: parsed.experience.replace(/-/g, " ") },
      { label: "Export", value: "Editable HTML page + plain-text copy" },
      { label: "Privacy", value: "Local export · no guest responses stored" },
    ]} />
    <div className="flex flex-wrap gap-2">
      <CopyButton text={result.text} />
      <Button type="button" variant="outline" onClick={() => downloadText(result.html, "env-" + toolId + ".html", "text/html")}>Download page</Button>
      <Button type="button" variant="outline" onClick={() => downloadText(result.text, "env-" + toolId + ".txt", "text/plain")}>Download text</Button>
      <Button type="button" variant="ghost" onClick={() => {
        setValues({ ...parsed, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", theme: "classic", photos: [] });
        setError("");
      }}>Reset</Button>
    </div>
    <p className="text-xs text-muted-foreground">The exported page works without an enV account or guest app. It does not send invitations, host a live event, or collect RSVPs; add your own response link or contact method.</p>
  </div>;
}
