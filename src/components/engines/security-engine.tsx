import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CodeResult } from "@/components/engines/result-panel";
import { initialValues } from "@/components/engines/initial-values";

import { estimateStrength, generatePassword } from "./security-engine-utils";

const PASSWORD_FIELDS: UiField[] = [
  { name: "length", label: "Length", type: "number", defaultValue: 24, min: 8, max: 256 },
  { name: "lower", label: "Lowercase", type: "select", defaultValue: "true", options: [{ value: "true", label: "Include" }, { value: "false", label: "Exclude" }] },
  { name: "upper", label: "Uppercase", type: "select", defaultValue: "true", options: [{ value: "true", label: "Include" }, { value: "false", label: "Exclude" }] },
  { name: "numbers", label: "Numbers", type: "select", defaultValue: "true", options: [{ value: "true", label: "Include" }, { value: "false", label: "Exclude" }] },
  { name: "symbols", label: "Symbols", type: "select", defaultValue: "true", options: [{ value: "true", label: "Include" }, { value: "false", label: "Exclude" }] },
];

export function SecurityEngine({ op }: { op: string }) {
  const [opts, setOpts] = useState(() => initialValues(PASSWORD_FIELDS));
  const [password, setPassword] = useState("");
  const [out, setOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const strength = useMemo(() => estimateStrength(password), [password]);

  if (op === "password-strength") {
    return (
      <div className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Password</span>
          <input className="h-10 rounded-md border bg-background px-3" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        </label>
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center justify-between"><strong>{strength.label}</strong><span>{strength.score}/4</span></div>
          <div className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-foreground transition-all" style={{ width: `${strength.score * 25}%` }} /></div>
          <p className="text-sm text-subtle">Estimated entropy: {strength.entropy} bits · {strength.guesses}</p>
          {strength.tips.map((tip) => <p key={tip} className="text-sm">• {tip}</p>)}
        </div>
        <p className="text-xs text-subtle">Analysis runs locally in your browser. This is a heuristic strength estimate, not a breach check or guarantee against guessing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FieldGrid fields={PASSWORD_FIELDS} values={opts} onChange={(n, v) => setOpts((o) => ({ ...o, [n]: v }))} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => { try { setError(null); setOut(generatePassword(opts)); } catch (e) { setError(e instanceof Error ? e.message : "Could not generate a password."); } }}>Generate</Button>
        <Button type="button" variant="ghost" onClick={() => { setOut(""); setError(null); }}>Clear</Button>
      </div>
      <ErrorBanner message={error} />
      <CodeResult code={out} filename="env-password.txt" />
      {out && <p className="text-xs text-subtle">Generated with the browser's cryptographic random source when available. enV does not send the generated password to a server.</p>}
    </div>
  );
}
