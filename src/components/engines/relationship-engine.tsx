import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/tools/copy-button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadText } from "@/lib/utils";
import { buildRelationshipOutput, parseRelationshipToolId, scoreRelationshipQuiz } from "./relationship-engine-utils";

export function RelationshipEngine({ toolId }: { toolId: string }) {
  const parsed = useMemo(() => { try { return { value: parseRelationshipToolId(toolId), error: null }; } catch (e) { return { value: null, error: e instanceof Error ? e.message : "Unsupported relationship tool." }; } }, [toolId]);
  const [person, setPerson] = useState("Your Name");
  const [otherPerson, setOtherPerson] = useState("Their Name");
  const [details, setDetails] = useState("I’m grateful for the memories we share and would like to make another thoughtful one together.");
  const [tone, setTone] = useState("warm");
  const [date, setDate] = useState("");
  const [answers, setAnswers] = useState<string[]>(["", "", "", "", ""]);
  const input = { person, otherPerson, details, tone, date, answers };
  const result = useMemo(() => { if (!parsed.value) return ""; try { return buildRelationshipOutput(parsed.value.family, parsed.value.workflow, input); } catch { return ""; } }, [parsed.value, person, otherPerson, details, tone, date, answers]);
  const error = useMemo(() => { if (!parsed.value) return parsed.error; try { buildRelationshipOutput(parsed.value.family, parsed.value.workflow, input); return null; } catch (e) { return e instanceof Error ? e.message : "Invalid relationship inputs."; } }, [parsed.value, parsed.error, person, otherPerson, details, tone, date, answers]);
  const reset = () => { setPerson("Your Name"); setOtherPerson("Their Name"); setDetails("I’m grateful for the memories we share and would like to make another thoughtful one together."); setTone("warm"); setDate(""); setAnswers(["", "", "", "", ""]); };
  const isQuiz = parsed.value?.workflow === "quiz";
  const questions = isQuiz ? 5 : 0;
  return <div className="space-y-5"><p className="text-sm text-muted-foreground">Create this relationship tool locally. No account or external service is required.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label htmlFor="relationship-person">Your name</Label><Input id="relationship-person" value={person} onChange={e=>setPerson(e.target.value)} /></div>
      <div><Label htmlFor="relationship-other">Their name</Label><Input id="relationship-other" value={otherPerson} onChange={e=>setOtherPerson(e.target.value)} /></div>
      <div><Label htmlFor="relationship-tone">Tone</Label><Input id="relationship-tone" value={tone} onChange={e=>setTone(e.target.value)} /></div>
      <div><Label htmlFor="relationship-date">Countdown date/time (optional except countdown tools)</Label><Input id="relationship-date" type="datetime-local" value={date} onChange={e=>setDate(e.target.value)} /></div>
      <div className="sm:col-span-2"><Label htmlFor="relationship-details">Details</Label><textarea id="relationship-details" className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={details} onChange={e=>setDetails(e.target.value)} /></div>
      {isQuiz && Array.from({length: questions}, (_, i) => <div className="sm:col-span-2" key={i}><Label htmlFor={`relationship-answer-${i}`}>Answer {i + 1}</Label><Input id={`relationship-answer-${i}`} value={answers[i] ?? ""} onChange={e=>setAnswers((prev)=>prev.map((v,j)=>j===i?e.target.value:v))} /></div>)}
    </div>
    {isQuiz ? <p className="text-xs text-muted-foreground">Quiz completion: {scoreRelationshipQuiz(parsed.value!.family, answers)}%</p> : null}
    <ErrorBanner message={error} />
    <div className="flex flex-wrap gap-2"><CopyButton text={result}/><Button type="button" variant="outline" size="sm" disabled={!result} onClick={()=>downloadText(result,`env-${toolId}.html`)}>Download</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>Reset</Button></div>
    {result ? <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{result}</pre> : null}
  </div>;
}
