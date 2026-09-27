import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CodeResult } from "@/components/engines/result-panel";
import { initialValues } from "@/components/engines/initial-values";

const CHARSETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{}:,.?~",
};

function randomInt(max: number) {
  if (max <= 0) return 0;
  const bytes = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / max) * max;
  do crypto.getRandomValues(bytes); while (bytes[0] >= limit);
  return bytes[0] % max;
}

function securePick(chars: string) {
  return chars[randomInt(chars.length)];
}

function shuffle(chars: string[]) {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function generatePassword(opts: Record<string, string>) {
  const length = Math.min(256, Math.max(8, Number(opts.length) || 20));
  const pools: string[] = [];
  if (opts.lower !== "false") pools.push(CHARSETS.lower);
  if (opts.upper !== "false") pools.push(CHARSETS.upper);
  if (opts.numbers !== "false") pools.push(CHARSETS.numbers);
  if (opts.symbols !== "false") pools.push(CHARSETS.symbols);
  if (!pools.length) throw new Error("Select at least one character set.");
  const all = pools.join("");
  const chars = pools.map(securePick);
  while (chars.length < length) chars.push(securePick(all));
  return shuffle(chars);
}

function estimateStrength(password: string) {
  if (!password) return { score: 0, label: "Empty", entropy: 0, guesses: "—", tips: ["Enter a password to analyze it."] };
  const lower = /[a-z]/.test(password);
  const upper = /[A-Z]/.test(password);
  const number = /\d/.test(password);
  const symbol = /[^A-Za-z0-9]/.test(password);
  const pool = (lower ? 26 : 0) + (upper ? 26 : 0) + (number ? 10 : 0) + (symbol ? 33 : 0);
  const entropy = Math.round(password.length * Math.log2(Math.max(pool, 1)));
  let score = entropy >= 80 ? 4 : entropy >= 60 ? 3 : entropy >= 40 ? 2 : entropy >= 28 ? 1 : 0;
  const lowerText = password.toLowerCase();
  if (/^(.)\1+$/.test(password) || /12345|qwerty|password|letmein|admin/.test(lowerText)) score = Math.min(score, 0);
  if (/(.)\1{3,}/.test(password)) score = Math.min(score, 1);
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
  const tips: string[] = [];
  if (password.length < 16) tips.push("Use at least 16 characters; longer passphrases are easier to make strong.");
  if (!upper || !lower) tips.push("Mix uppercase and lowercase letters, or use a long random passphrase.");
  if (!number) tips.push("Add numbers if the site requires them.");
  if (!symbol) tips.push("Add symbols if the site allows them.");
  if (/password|qwerty|12345|admin/i.test(password)) tips.push("Avoid common words and predictable patterns.");
  return { score, label: labels[score], entropy, guesses: `~2^${entropy} possible guesses`, tips };
}

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
