import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CodeResult } from "@/components/engines/result-panel";
import { initialValues } from "@/components/engines/initial-values";

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", x: "X",
  linkedin: "LinkedIn", twitch: "Twitch", spotify: "Spotify", "apple-music": "Apple Music", podcast: "Podcast",
};

function kindOf(op: string) {
  const platform = Object.keys(PLATFORM_LABELS).find((x) => op.startsWith(`${x}-`));
  return platform ? op.slice(platform.length + 1) : op;
}

function fieldsFor(op: string): UiField[] {
  const kind = kindOf(op);
  if (kind === "revenue-calculator") return [
    { name: "views", label: "Views / plays", type: "number", defaultValue: 100000, min: 0 },
    { name: "rate", label: "Assumed rate per 1,000", type: "number", defaultValue: 3, min: 0, step: 0.01 },
    { name: "other", label: "Other revenue", type: "number", defaultValue: 0, min: 0 },
  ];
  if (kind === "engagement-calculator") return [
    { name: "likes", label: "Likes", type: "number", defaultValue: 1000, min: 0 },
    { name: "comments", label: "Comments", type: "number", defaultValue: 100, min: 0 },
    { name: "shares", label: "Shares / saves", type: "number", defaultValue: 50, min: 0 },
    { name: "followers", label: "Followers / subscribers", type: "number", defaultValue: 10000, min: 1 },
  ];
  if (kind === "growth-calculator") return [
    { name: "start", label: "Starting audience", type: "number", defaultValue: 1000, min: 0 },
    { name: "end", label: "Ending audience", type: "number", defaultValue: 1500, min: 0 },
    { name: "periods", label: "Periods", type: "number", defaultValue: 1, min: 1 },
  ];
  if (kind === "content-planner" || kind === "content-calendar") return [
    { name: "topic", label: "Topic / niche", type: "text", defaultValue: "AI tools for creators" },
    { name: "goal", label: "Goal", type: "text", defaultValue: "Grow audience" },
    { name: "count", label: "Ideas", type: "number", defaultValue: 7, min: 1, max: 30 },
  ];
  if (["caption-generator", "title-generator", "description-generator", "hashtag-generator", "bio-generator"].includes(kind)) return [
    { name: "topic", label: "Topic", type: "text", defaultValue: "AI music" },
    { name: "audience", label: "Audience", type: "text", defaultValue: "music creators" },
    { name: "tone", label: "Tone", type: "select", defaultValue: "natural", options: [{ value: "natural", label: "Natural" }, { value: "professional", label: "Professional" }, { value: "playful", label: "Playful" }, { value: "bold", label: "Bold" }] },
  ];
  if (kind === "posting-time-helper") return [
    { name: "timezone", label: "Your timezone", type: "text", defaultValue: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
    { name: "days", label: "Preferred posting days", type: "text", defaultValue: "Mon, Wed, Fri" },
  ];
  if (kind === "thumbnail-size-helper") return [];
  return [{ name: "value", label: "Value", type: "text", defaultValue: "100" }];
}

const SIZES: Record<string, string> = {
  youtube: "1280×720 thumbnail (16:9); channel banner 2560×1440; profile 800×800",
  tiktok: "1080×1920 vertical (9:16); profile 200×200 recommended minimum",
  instagram: "1080×1080 square; 1080×1350 portrait; 1080×1920 story/reel",
  facebook: "1200×630 link image; 1080×1080 square post; 1640×856 cover",
  x: "1600×900 landscape; 1080×1080 square; 1500×500 header",
  linkedin: "1200×627 landscape; 1080×1080 square; 1584×396 personal banner",
  twitch: "1280×720 video thumbnail; 1200×480 profile banner",
  spotify: "3000×3000 cover art is a common high-resolution delivery target; verify distributor requirements",
  "apple-music": "3000×3000 cover art is a common high-resolution delivery target; verify distributor requirements",
  podcast: "3000×3000 cover art is a common high-resolution delivery target; verify hosting/distribution requirements",
};

function textIdeas(kind: string, platform: string, topic: string, audience: string, tone: string, count = 5) {
  const p = PLATFORM_LABELS[platform] ?? platform;
  const t = topic.trim() || "your topic";
  const a = audience.trim() || "your audience";
  const n = Math.min(20, Math.max(1, count));
  const templates: Record<string, (i: number) => string> = {
    "title-generator": (i) => `${i + 1}. ${tone === "bold" ? "The truth about " : "How to "}${t}: what ${a} should know`,
    "caption-generator": (i) => `${i + 1}. ${t} made simple. Save this if you're creating for ${a}.`,
    "description-generator": (i) => `${i + 1}. In this ${p} post, we break down ${t} for ${a}. Key points, practical examples, and a simple next step.`,
    "hashtag-generator": () => `#${t.replace(/[^a-zA-Z0-9]+/g, "") || "creator"} #${a.replace(/[^a-zA-Z0-9]+/g, "") || "creators"} #content #${p.toLowerCase().replace(/[^a-z0-9]+/g, "")} #creator`,
    "bio-generator": (i) => `${i + 1}. ${t} creator | Helping ${a} learn, create & grow | New content weekly`,
  };
  return Array.from({ length: n }, (_, i) => templates[kind]?.(i) ?? `${i + 1}. ${t}`);
}

function creatorRun(op: string, values: Record<string, string>) {
  const platformKey = Object.keys(PLATFORM_LABELS).find((x) => op.startsWith(`${x}-`)) ?? "youtube";
  const platform = PLATFORM_LABELS[platformKey];
  const kind = kindOf(op);
  if (kind === "thumbnail-size-helper") return `${platform} creator asset guide\n\n${SIZES[platformKey] ?? "Check the platform's current publishing specifications before export."}`;
  if (kind === "engagement-calculator") {
    const interactions = Number(values.likes || 0) + Number(values.comments || 0) + Number(values.shares || 0);
    const followers = Math.max(1, Number(values.followers || 0));
    return `${platform} engagement rate\nInteractions: ${interactions.toLocaleString()}\nAudience: ${followers.toLocaleString()}\nEngagement rate: ${(interactions / followers * 100).toFixed(2)}%\n\nFormula: (likes + comments + shares/saves) ÷ audience × 100.`;
  }
  if (kind === "growth-calculator") {
    const start = Number(values.start || 0), end = Number(values.end || 0), periods = Math.max(1, Number(values.periods || 1));
    const change = end - start; const pct = start ? change / start * 100 : 0; const rate = start > 0 && end >= 0 ? (Math.pow(end / start, 1 / periods) - 1) * 100 : 0;
    return `${platform} growth\nStarting audience: ${start.toLocaleString()}\nEnding audience: ${end.toLocaleString()}\nNet change: ${change.toLocaleString()}\nTotal growth: ${pct.toFixed(2)}%\nCompound growth per period: ${rate.toFixed(2)}%`;
  }
  if (kind === "revenue-calculator") {
    const views = Number(values.views || 0), rate = Number(values.rate || 0), other = Number(values.other || 0);
    return `${platform} revenue estimate\nViews / plays: ${views.toLocaleString()}\nAssumed rate: ${rate.toFixed(4)} per 1,000\nEstimated rate-based revenue: ${(views / 1000 * rate).toFixed(2)}\nOther revenue: ${other.toFixed(2)}\nEstimated total: ${(views / 1000 * rate + other).toFixed(2)}\n\nThis is an editable assumption, not a platform payout guarantee.`;
  }
  if (["caption-generator", "title-generator", "description-generator", "hashtag-generator", "bio-generator"].includes(kind)) return textIdeas(kind, platformKey, values.topic, values.audience, values.tone, kind === "hashtag-generator" ? 1 : 5).join("\n\n");
  if (kind === "content-planner" || kind === "content-calendar") {
    const count = Math.min(30, Math.max(1, Number(values.count || 7))); const topic = values.topic || "your niche"; const goal = values.goal || "grow audience";
    return Array.from({ length: count }, (_, i) => `${i + 1}. ${platform} — ${topic}: ${["how-to", "mistake to avoid", "behind the scenes", "myth vs fact", "case study", "quick tips", "FAQ"][i % 7]} — goal: ${goal}`).join("\n");
  }
  if (kind === "posting-time-helper") return `${platform} posting-time planning\nTimezone: ${values.timezone || "UTC"}\nPreferred days: ${values.days || "Mon, Wed, Fri"}\n\nStart with 2–3 consistent test windows, compare your native analytics, then adjust. There is no universal best posting time for every audience.`;
  if (op === "bpm") return `BPM helper\nEnter a beat duration in seconds to estimate BPM: BPM = 60 ÷ beat seconds.\nExample: 0.5s per beat = 120 BPM.`;
  return `${platform} creator utility\n${op}\n\nUse your platform analytics and current publishing specifications as the source of truth.`;
}

export function CreatorEngine({ op }: { op: string }) {
  const fields = useMemo(() => fieldsFor(op), [op]);
  const [values, setValues] = useState(() => initialValues(fields));
  const [out, setOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const run = () => { try { setError(null); setOut(creatorRun(op, values)); } catch (e) { setError(e instanceof Error ? e.message : "Could not run creator tool."); } };
  return <div className="space-y-4">
    {fields.length ? <FieldGrid fields={fields} values={values} onChange={(n, v) => setValues((x) => ({ ...x, [n]: v }))} /> : null}
    <div className="flex flex-wrap gap-2"><Button type="button" onClick={run}>Run tool</Button><Button type="button" variant="ghost" onClick={() => { setOut(""); setError(null); }}>Clear</Button></div>
    <ErrorBanner message={error} />
    <CodeResult code={out} filename={`env-${op}.txt`} />
    {/(revenue|royalty|earnings)/.test(op) && <p className="text-xs text-subtle">Revenue and royalty outputs are estimates using your editable assumptions. Actual platform earnings depend on monetization eligibility, audience, geography, revenue source, rights agreements and platform rules.</p>}
  </div>;
}
