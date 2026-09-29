import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResultPanel } from "@/components/engines/result-panel";
import { CopyButton } from "@/components/tools/copy-button";
import { downloadText } from "@/lib/utils";
import { calculatePersonalResult, type PersonalFamily } from "@/lib/personal-calculations";

const STORAGE_PREFIX = "env:personal:";

type Family = PersonalFamily;
type Action = "planner" | "calculator" | "generator" | "tracker" | "checklist" | "countdown";

type StoredItem = { id: string; text: string; done: boolean; createdAt: string };

function parseToolId(id: string): { family: Family; action: Action } {
  const families: Family[] = ["life-event", "checklist", "countdown", "reminder", "packing", "shopping", "habit", "budget", "goal", "decision", "routine", "meal", "study", "sleep", "time"];
  const family = families.find((f) => id.startsWith(`${f}-`)) ?? "goal";
  const suffix = id.slice(family.length + 1) as Action;
  return { family, action: ["planner", "calculator", "generator", "tracker", "checklist", "countdown"].includes(suffix) ? suffix : "planner" };
}

function familyLabel(family: Family) {
  return family === "life-event" ? "Life Event" : family[0].toUpperCase() + family.slice(1);
}

function useLocalItems(key: string) {
  const [items, setItems] = useState<StoredItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is StoredItem =>
        typeof item === "object" && item !== null &&
        typeof (item as StoredItem).id === "string" &&
        typeof (item as StoredItem).text === "string" &&
        typeof (item as StoredItem).done === "boolean" &&
        typeof (item as StoredItem).createdAt === "string"
      );
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(items)); } catch { /* storage can be unavailable */ }
  }, [key, items]);
  return [items, setItems] as const;
}

function addItem(text: string, setItems: Dispatch<SetStateAction<StoredItem[]>>) {
  const value = text.trim();
  if (!value) return;
  const randomId = globalThis.crypto?.randomUUID?.();
  setItems((items) => [...items, { id: randomId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, text: value, done: false, createdAt: new Date().toISOString() }]);
}

function formatCountdown(ms: number) {
  const safe = Math.max(0, ms);
  const seconds = Math.floor(safe / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
}


export function PersonalEngine({ toolId }: { toolId: string }) {
  const { family, action } = parseToolId(toolId);
  if (action === "calculator") return <PersonalCalculator family={family} />;
  if (action === "generator") return <PersonalGenerator family={family} />;
  if (action === "tracker") return <PersonalTracker family={family} />;
  if (action === "checklist") return <PersonalChecklist family={family} />;
  if (action === "countdown") return <PersonalCountdown family={family} />;
  return <PersonalPlanner family={family} />;
}

function PersonalPlanner({ family }: { family: Family }) {
  const [title, setTitle] = useState(`${familyLabel(family)} plan`);
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [target, setTarget] = useState(60);
  const [notes, setNotes] = useState("");
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const validDates = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs;
  const days = validDates ? Math.ceil((endMs - startMs) / 86400000) + 1 : 0;
  const plan = useMemo(() => {
    const safeTarget = Math.max(1, Number(target) || 1);
    return Array.from({ length: Math.min(days, 31) }, (_, i) => {
      const date = new Date(new Date(start).getTime() + i * 86400000).toISOString().slice(0, 10);
      return `${date} — ${familyLabel(family)}: ${safeTarget} ${family === "time" ? "minutes" : family === "study" ? "minutes" : "units"}`;
    }).join("\n");
  }, [days, family, start, target]);
  const output = `${title}\nPeriod: ${start} to ${end}\n\n${plan}${notes.trim() ? `\n\nNotes:\n${notes.trim()}` : ""}`;
  const reset = () => {
    setTitle(`${familyLabel(family)} plan`);
    setStart(new Date().toISOString().slice(0, 10));
    setEnd(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    setTarget(60);
    setNotes("");
  };
  return <div className="space-y-5">
    <p className="text-sm text-muted">Build a concrete local plan. Nothing is uploaded or scheduled on a server.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Plan title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Daily target"><Input type="number" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></Field>
      <Field label="Start date"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <Field label="End date"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      <Field label="Notes" full><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add constraints, priorities, or reminders…" /></Field>
    </div>
    {!validDates ? <p role="alert" className="text-sm text-destructive">Choose valid dates with the end date on or after the start date.</p> : null}
    {days > 31 ? <p className="text-xs text-subtle">Preview is capped at 31 daily rows; the selected period is still shown in the exported plan.</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={reset}>Reset</Button>
    </div>
    {validDates ? <TextOutput text={output} filename={`${family}-plan.txt`} /> : null}
  </div>;
}

function PersonalCalculator({ family }: { family: Family }) {
  const [a, setA] = useState("1000"); const [b, setB] = useState("300"); const [c, setC] = useState("30");
  const [extra, setExtra] = useState("0");
  const rawValues = [a, b, c, extra];
  const invalid = rawValues.some((value) => value.trim() !== "" && !Number.isFinite(Number(value)));
  const reset = () => { setA("1000"); setB("300"); setC("30"); setExtra("0"); };
  const result = useMemo(() => calculatePersonalResult(family, [Number(a) || 0, Number(b) || 0, Number(c) || 0, Number(extra) || 0]), [a, b, c, extra, family]);
  const labels = family === "decision" ? ["Option A score", "Criterion A weight %", "Option B score", "Criterion B weight %"] : family === "goal" ? ["Current value", "Target value", "Months", "Unused"] : family === "sleep" ? ["Sleep hours", "Wake hour (e.g. 7.5)", "Unused", "Unused"] : ["Value 1", "Value 2", "Value 3", "Value 4"];
  return <div className="space-y-5">
    <p className="text-sm text-muted">Calculate locally using the inputs below. Values are estimates where the underlying quantity is personal or variable.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={labels[0]}><Input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} /></Field>
      <Field label={labels[1]}><Input inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} /></Field>
      <Field label={labels[2]}><Input inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} /></Field>
      <Field label={labels[3]}><Input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} /></Field>
    </div>
    {invalid ? <p role="alert" className="text-sm text-destructive">Enter valid numbers in all fields.</p> : <ResultPanel items={result.items} />}
    <Button type="button" variant="outline" onClick={reset}>Reset</Button>
  </div>;
}

function PersonalGenerator({ family }: { family: Family }) {
  const templates: Record<Family, string> = {
    budget: "MONTHLY BUDGET\n\nIncome:\n- Main income: ____\n- Other income: ____\n\nNeeds:\n- Housing: ____\n- Food: ____\n- Transport: ____\n- Utilities: ____\n\nGoals:\n- Savings: ____\n- Debt payment: ____\n\nFlexible spending:\n- Entertainment: ____\n- Shopping: ____\n",
    habit: "HABIT PLAN\n\nHabit: ____\nWhy it matters: ____\nMinimum daily action: ____\nCue: ____\nPreferred time: ____\nHow success will be measured: ____\nReview date: ____\n",
    goal: "GOAL PLAN\n\nGoal: ____\nCurrent state: ____\nTarget: ____\nDeadline: ____\nWhy: ____\nMilestones:\n1. ____\n2. ____\n3. ____\nFirst action today: ____\n",
    decision: "DECISION WORKSHEET\n\nDecision: ____\nOptions:\nA. ____\nB. ____\nC. ____\nCriteria and weights:\n- Cost: ____%\n- Time: ____%\n- Benefit: ____%\n- Risk: ____%\nEvidence/notes: ____\n",
    routine: "ROUTINE\n\nStart time: ____\n1. ____ — ____ minutes\n2. ____ — ____ minutes\n3. ____ — ____ minutes\n4. ____ — ____ minutes\nEnd condition: ____\n",
    checklist: "CHECKLIST\n\n[ ] Task 1\n[ ] Task 2\n[ ] Task 3\n[ ] Task 4\n[ ] Task 5\n\nNotes: ____\n",
    countdown: "COUNTDOWN\n\nEvent: ____\nTarget date/time: ____\nPurpose: ____\nWhat should be completed before then:\n1. ____\n2. ____\n3. ____\n",
    reminder: "REMINDER\n\nReminder: ____\nDue: ____\nReason: ____\nAction required: ____\n",
    packing: "PACKING LIST\n\nEssentials\n[ ] ID / documents\n[ ] Phone / charger\n[ ] Money / cards\n[ ] Medication / personal items\n\nClothing\n[ ] Tops\n[ ] Bottoms\n[ ] Underwear\n[ ] Shoes\n\nOther\n[ ] ____\n[ ] ____\n",
    shopping: "SHOPPING LIST\n\nProduce:\n[ ] ____\nPantry:\n[ ] ____\nHousehold:\n[ ] ____\nPersonal:\n[ ] ____\nBudget: ____\n",
    meal: "MEAL PLAN\n\nBreakfast: ____\nLunch: ____\nDinner: ____\nSnacks: ____\nPrep needed: ____\nIngredients to buy: ____\n",
    study: "STUDY PLAN\n\nSubject: ____\nTopic: ____\nStudy block: ____ minutes\n1. Review: ____\n2. Practice: ____\n3. Recall: ____\n4. Questions to revisit: ____\n",
    sleep: "SLEEP ROUTINE\n\nTarget bedtime: ____\nTarget wake time: ____\nWind-down begins: ____\nBefore bed:\n[ ] Reduce screens\n[ ] Prepare tomorrow\n[ ] Quiet activity\n[ ] Set alarm\n",
    time: "DAILY TIME PLAN\n\n06:00 — ____\n08:00 — ____\n10:00 — ____\n12:00 — ____\n14:00 — ____\n16:00 — ____\n18:00 — ____\n20:00 — ____\n",
    "life-event": "LIFE EVENT PLAN\n\nEvent: ____\nDate: ____\nLocation: ____\nGuests: ____\nBudget: ____\nKey tasks:\n1. ____\n2. ____\n3. ____\n4. ____\n",
  };
  const [custom, setCustom] = useState(templates[family]);
  const text = custom.trim();
  const reset = () => setCustom(templates[family]);
  return <div className="space-y-5">
    <p className="text-sm text-muted">Generate an editable starting template for a {familyLabel(family).toLowerCase()} workflow.</p>
    <Textarea className="min-h-80 font-mono text-sm" value={custom} onChange={(e) => setCustom(e.target.value)} />
    <Button type="button" variant="outline" onClick={reset}>Reset</Button>
    <TextOutput text={text} filename={`${family}-template.txt`} />
  </div>;
}

function PersonalTracker({ family }: { family: Family }) {
  const [items, setItems] = useLocalItems(`${family}:tracker`);
  const [text, setText] = useState("");
  const done = items.filter((i) => i.done).length;
  const reset = () => { setItems([]); setText(""); };
  return <div className="space-y-5">
    <p className="text-sm text-muted">Track entries locally on this device. Data is persisted with browser local storage.</p>
    <div className="flex gap-2"><Input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Add ${familyLabel(family).toLowerCase()} entry…`} onKeyDown={(e) => { if (e.key === "Enter") { addItem(text, setItems); setText(""); } }} /><Button type="button" onClick={() => { addItem(text, setItems); setText(""); }}>Add</Button></div>
    <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm">{done} of {items.length} completed</div>
    <ItemList items={items} setItems={setItems} />
    <Button type="button" variant="outline" onClick={reset} disabled={!items.length}>Reset</Button>
  </div>;
}

function PersonalChecklist({ family }: { family: Family }) {
  const [items, setItems] = useLocalItems(`${family}:checklist`);
  const [text, setText] = useState("");
  const done = items.filter((i) => i.done).length;
  const output = items.map((i) => `[${i.done ? "x" : " "}] ${i.text}`).join("\n");
  const reset = () => { setItems([]); setText(""); };
  return <div className="space-y-5">
    <p className="text-sm text-muted">Create and manage a persistent checklist for this workflow.</p>
    <div className="flex gap-2"><Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task…" onKeyDown={(e) => { if (e.key === "Enter") { addItem(text, setItems); setText(""); } }} /><Button type="button" onClick={() => { addItem(text, setItems); setText(""); }}>Add</Button></div>
    <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm">{done} of {items.length} complete{items.length ? ` (${((done / items.length) * 100).toFixed(0)}%)` : ""}</div>
    <ItemList items={items} setItems={setItems} />
    <Button type="button" variant="outline" onClick={reset} disabled={!items.length}>Reset</Button>
    {items.length ? <TextOutput text={output} filename={`${family}-checklist.txt`} /> : <p className="text-sm text-subtle">Add at least one item to export the checklist.</p>}
  </div>;
}

function PersonalCountdown({ family }: { family: Family }) {
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const target = new Date(date).getTime();
  const validTarget = Number.isFinite(target);
  const remaining = validTarget ? target - now : NaN;
  const reset = () => setDate(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  return <div className="space-y-5">
    <p className="text-sm text-muted">Live countdown for a selected date and time. The timer runs entirely in your browser.</p>
    <Field label="Target date and time"><Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
    <div className="rounded-2xl border border-border bg-surface-2 p-8 text-center">
      <p className="text-sm text-muted">{familyLabel(family)} countdown</p>
      <div className="mt-3 font-mono text-3xl font-semibold sm:text-5xl" aria-live="polite">{!validTarget ? "Enter a valid date" : remaining > 0 ? formatCountdown(remaining) : "Time reached"}</div>
    </div>
    {validTarget ? <ResultPanel items={[{ label: "Target", value: new Date(target).toLocaleString() }, { label: "Status", value: remaining > 0 ? "Counting down" : "Reached", primary: true }]} /> : <p role="alert" className="text-sm text-destructive">Choose a valid target date and time.</p>}
    <Button type="button" variant="outline" onClick={reset}>Reset</Button>
  </div>;
}

function ItemList({ items, setItems }: { items: StoredItem[]; setItems: Dispatch<SetStateAction<StoredItem[]>> }) {
  if (!items.length) return <div className="rounded-xl border border-dashed border-border p-6 text-sm text-subtle">No entries yet.</div>;
  return <div className="space-y-2">{items.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
    <input type="checkbox" checked={item.done} onChange={() => setItems((all) => all.map((x) => x.id === item.id ? { ...x, done: !x.done } : x))} aria-label={`Mark ${item.text} complete`} />
    <span className={`min-w-0 flex-1 text-sm ${item.done ? "text-subtle line-through" : ""}`}>{item.text}</span>
    <Button type="button" variant="ghost" size="sm" onClick={() => setItems((all) => all.filter((x) => x.id !== item.id))}>Remove</Button>
  </div>)}</div>;
}

function TextOutput({ text, filename }: { text: string; filename: string }) {
  if (!text) return null;
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2"><CopyButton text={text} /><Button type="button" variant="outline" size="sm" onClick={() => downloadText(text, filename)}>Download</Button></div>
    <pre className="max-h-96 overflow-auto rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg whitespace-pre-wrap">{text}</pre>
  </div>;
}

function Field({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) {
  return <label className={full ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}><Label>{label}</Label>{children}</label>;
}
