import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clipboard, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { ErrorBanner } from "@/components/tools/error-banner";
import { initialValues } from "@/components/engines/initial-values";
import {
  CREATOR_PLATFORMS,
  creatorFieldsFor,
  creatorKindFromOp,
  creatorPlatformFromOp,
  runCreatorTool,
} from "@/lib/engines/creator";
import "./creator-engine.css";

function compactLabel(name: string, fallback: string, platform: string) {
  const labels: Record<string, string> = {
    brand: "Brand", topic: "Topic", audience: "Audience", goal: "Goal", count: "Count",
    pillar: "Pillar", startDate: "Start date", days: "Days", formatMix: "Formats",
    tone: "Tone", proof: "Proof", cta: "CTA", keywords: "Keywords",
    timezone: "Time zone", audienceWindows: "Active windows",
    historyStreams: platform === "apple-music" ? "Past plays" : "Past streams",
    historyPayout: "Past payout", forecastStreams: platform === "apple-music" ? "Forecast plays" : "Forecast streams",
    rightsShare: "Your share", distributionFee: "Extra fees", artistShare: "Your share",
    feePct: "Extra fees", currency: "Currency", volume: "Views / volume", rate: "RPM",
    other: "Other income", fee: "Partner share", listeners: "Listeners", streams: "Streams",
    saves: "Saves", playlistAdds: "Playlist adds", plays: "Plays", shazams: "Shazams",
    radioSpins: "Radio spins", purchases: "Purchases", downloads: "Downloads",
    engagedListeners: "Engaged listeners", followers: "Followers", completion: "Completion %",
    views: "Views", likes: "Likes", comments: "Comments", shares: "Shares",
    impressions: "Impressions", clicks: "Impression views", avgViewPct: "Avg viewed %",
    avgViewers: "Avg viewers", chatters: "Chatters", chatMessages: "Chat messages",
    follows: "New follows", reach: "Reach", start: "Start", end: "End",
    periods: "Periods", period: "Period", asset: "Asset",
  };
  return labels[name] ?? fallback;
}

function actionLabel(op: string) {
  const kind = creatorKindFromOp(op);
  if (kind === "posting-time-helper") return "Analyse";
  if (kind === "content-calendar") return "Build plan";
  if (kind === "content-planner") return "Plan";
  if (kind === "thumbnail-size-helper") return "View";
  if (kind.includes("calculator")) return "Calculate";
  return "Generate";
}

function TapTempo() {
  const taps = useRef<number[]>([]);
  const [bpm, setBpm] = useState<number | null>(null);
  const [seconds, setSeconds] = useState("0.5");
  const [tapCount, setTapCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tap = () => {
    const now = performance.now();
    const last = taps.current.at(-1);
    if (last !== undefined && now - last > 2500) taps.current = [];
    taps.current = [...taps.current, now].slice(-9);
    setTapCount(taps.current.length);
    if (taps.current.length >= 3) {
      const intervals = taps.current.slice(1).map((time, index) => time - taps.current[index]!);
      const sorted = [...intervals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      const stable = intervals.filter((value) => value > median * 0.7 && value < median * 1.3);
      const average = stable.reduce((sum, value) => sum + value, 0) / Math.max(1, stable.length);
      setBpm(60000 / average);
      setError(null);
      setCopied(false);
    }
  };
  const calculate = () => {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a beat duration greater than zero.");
      return;
    }
    setBpm(60 / value);
    setError(null);
    setCopied(false);
  };
  const reset = () => {
    taps.current = [];
    setBpm(null);
    setTapCount(0);
    setError(null);
    setCopied(false);
  };
  const copy = async () => {
    if (bpm === null) return;
    try {
      await navigator.clipboard.writeText(bpm.toFixed(2) + " BPM");
      setCopied(true);
      setError(null);
    } catch {
      setError("Copy is unavailable in this browser.");
    }
  };

  return (
    <div className="env-creator-workspace">
      <div className="env-creator-workspace__topline">
        <span className="env-creator-workspace__platform">Tempo</span>
        <button type="button" className="env-creator-workspace__icon-button" onClick={reset} aria-label="Reset tempo" title="Reset">
          <RotateCcw aria-hidden="true" />
        </button>
      </div>
      <section className="env-tap-tempo" aria-live="polite">
        <div className="env-tap-tempo__value">{bpm === null ? "—" : bpm.toFixed(1)}</div>
        <div className="env-tap-tempo__unit">BPM</div>
        <div className="env-tap-tempo__count">{tapCount} taps</div>
        <Button type="button" className="env-tap-tempo__tap" onClick={tap}>Tap beat</Button>
        <div className="env-tap-tempo__manual">
          <label htmlFor="env-beat-seconds">Seconds / beat</label>
          <Input id="env-beat-seconds" inputMode="decimal" value={seconds} onChange={(event) => setSeconds(event.target.value)} />
          <Button type="button" variant="outline" onClick={calculate}>Calculate</Button>
        </div>
      </section>
      <div className="env-creator-workspace__bottom">
        {error ? <ErrorBanner message={error} /> : null}
        <Button type="button" variant="outline" className="env-creator-workspace__copy" disabled={bpm === null} onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

export function CreatorEngine({ op }: { op: string }) {
  if (op === "bpm") return <TapTempo />;
  return <CreatorToolWorkspace op={op} />;
}

function CreatorToolWorkspace({ op }: { op: string }) {
  const platformKey = creatorPlatformFromOp(op);
  const platform = CREATOR_PLATFORMS[platformKey]?.label ?? "Creator";
  const fields = useMemo<UiField[]>(() => creatorFieldsFor(op).map((field) => ({
    ...field,
    label: compactLabel(field.name, field.label, platformKey),
    hint: undefined,
    placeholder: field.name === "audienceWindows" ? "Mon 18:00 = 42" : field.placeholder,
  }) as UiField), [op, platformKey]);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(fields));
  const [out, setOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setValues(initialValues(fields));
    setOut("");
    setError(null);
    setCopied(false);
  }, [fields]);

  const run = () => {
    try {
      setError(null);
      setOut(runCreatorTool(op, values));
      setCopied(false);
    } catch (cause) {
      setOut("");
      setError(cause instanceof Error ? cause.message : "Unable to complete this action.");
    }
  };
  const reset = () => {
    setValues(initialValues(fields));
    setOut("");
    setError(null);
    setCopied(false);
  };
  const copy = async () => {
    if (!out) return;
    try {
      await navigator.clipboard.writeText(out);
      setCopied(true);
      setError(null);
    } catch {
      setError("Copy is unavailable in this browser.");
    }
  };

  return (
    <div className="env-creator-workspace">
      <div className="env-creator-workspace__topline">
        <div className="env-creator-workspace__context">
          <span className="env-creator-workspace__platform">{platform}</span>
        </div>
        <button type="button" className="env-creator-workspace__icon-button" onClick={reset} aria-label="Reset tool" title="Reset">
          <RotateCcw aria-hidden="true" />
        </button>
      </div>

      <div className="env-creator-workspace__body">
        <div className="env-creator-workspace__form">
          <FieldGrid fields={fields} values={values} onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))} />
        </div>
        <section className="env-creator-workspace__result" aria-live="polite" aria-label="Tool result">
          <div className="env-creator-workspace__result-head">
            <span className="env-creator-workspace__result-title">Result</span>
            <button type="button" className="env-creator-workspace__icon-button" onClick={() => void copy()} aria-label={copied ? "Copied" : "Copy result"} title={copied ? "Copied" : "Copy"} disabled={!out}>
              {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
            </button>
          </div>
          {out ? <pre className="env-creator-workspace__output">{out}</pre> : <div className="env-creator-workspace__blank" aria-hidden="true" />}
        </section>
      </div>

      <div className="env-creator-workspace__bottom">
        {error ? <ErrorBanner message={error} /> : null}
        <Button type="button" className="env-creator-workspace__primary" onClick={run}>
          {actionLabel(op)}
        </Button>
      </div>
    </div>
  );
}
