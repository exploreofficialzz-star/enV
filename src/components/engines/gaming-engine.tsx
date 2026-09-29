import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/tools/copy-button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadText } from "@/lib/utils";
import { buildGamingOutput, parseGamingToolId } from "./gaming-engine-utils";

export function GamingEngine({ toolId }: { toolId: string }) {
  const parsed = useMemo(() => { try { return { value: parseGamingToolId(toolId), error: null }; } catch (e) { return { value: null, error: e instanceof Error ? e.message : "Unsupported gaming tool." }; } }, [toolId]);
  const [name, setName] = useState("My Game"); const [base, setBase] = useState(10); const [modifier, setModifier] = useState(0);
  const [quantity, setQuantity] = useState(1); const [sides, setSides] = useState(6); const [level, setLevel] = useState(1);
  const [players, setPlayers] = useState(2); const [rounds, setRounds] = useState(1); const [notes, setNotes] = useState("");
  const [entriesText, setEntriesText] = useState("Alpha\nBeta\nGamma\nDelta");
  const input = { name, base, modifier, quantity, sides, level, players, rounds, notes, entries: entriesText.split("\n") };
  const result = useMemo(() => { if (!parsed.value) return ""; try { return buildGamingOutput(parsed.value.family, parsed.value.workflow, input); } catch { return ""; } }, [parsed.value, name, base, modifier, quantity, sides, level, players, rounds, notes, entriesText]);
  const error = useMemo(() => { if (!parsed.value) return parsed.error; try { buildGamingOutput(parsed.value.family, parsed.value.workflow, input); return null; } catch (e) { return e instanceof Error ? e.message : "Invalid gaming inputs."; } }, [parsed.value, parsed.error, name, base, modifier, quantity, sides, level, players, rounds, notes, entriesText]);
  const reset = () => { setName("My Game"); setBase(10); setModifier(0); setQuantity(1); setSides(6); setLevel(1); setPlayers(2); setRounds(1); setNotes(""); setEntriesText("Alpha\nBeta\nGamma\nDelta"); };
  const workflow = parsed.value?.workflow;
  return <div className="space-y-5"><p className="text-sm text-muted-foreground">Gaming utility runs locally in enV. Generated trackers save progress in the exported page's browser storage.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label htmlFor="gaming-name">Name</Label><Input id="gaming-name" value={name} onChange={e=>setName(e.target.value)} /></div>
      <div><Label htmlFor="gaming-base">Base / starting value</Label><Input id="gaming-base" type="number" value={base} onChange={e=>setBase(Number(e.target.value))} /></div>
      <div><Label htmlFor="gaming-modifier">Modifier</Label><Input id="gaming-modifier" type="number" value={modifier} onChange={e=>setModifier(Number(e.target.value))} /></div>
      <div><Label htmlFor="gaming-quantity">Quantity</Label><Input id="gaming-quantity" type="number" min="1" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} /></div>
      <div><Label htmlFor="gaming-sides">Dice sides</Label><Input id="gaming-sides" type="number" min="2" value={sides} onChange={e=>setSides(Number(e.target.value))} /></div>
      <div><Label htmlFor="gaming-level">Level</Label><Input id="gaming-level" type="number" min="1" value={level} onChange={e=>setLevel(Number(e.target.value))} /></div>
      <div><Label htmlFor="gaming-players">Players / members</Label><Input id="gaming-players" type="number" min="1" value={players} onChange={e=>setPlayers(Number(e.target.value))} /></div>
      <div><Label htmlFor="gaming-rounds">Rounds</Label><Input id="gaming-rounds" type="number" min="1" value={rounds} onChange={e=>setRounds(Number(e.target.value))} /></div>
      <div className="sm:col-span-2"><Label htmlFor="gaming-notes">Goal / notes</Label><textarea id="gaming-notes" className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={notes} onChange={e=>setNotes(e.target.value)} /></div>
      {(workflow === "planner" || workflow === "tracker" || workflow === "bracket-generator") && <div className="sm:col-span-2"><Label htmlFor="gaming-entries">Entries (one per line)</Label><textarea id="gaming-entries" className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={entriesText} onChange={e=>setEntriesText(e.target.value)} /></div>}
    </div>
    <ErrorBanner message={error} />
    <div className="flex flex-wrap gap-2"><CopyButton text={result}/><Button type="button" variant="outline" size="sm" disabled={!result} onClick={()=>downloadText(result,`env-${toolId}.html`)}>Download</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>Reset</Button></div>
    {result ? <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{result}</pre> : null}
  </div>;
}
