import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarDays,
  Clock3,
  FileText,
  Hash,
  Image as ImageIcon,
  Music2,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Type,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CodeResult } from "@/components/engines/result-panel";
import { initialValues } from "@/components/engines/initial-values";
import {
  CREATOR_PLATFORMS,
  creatorFieldsFor,
  creatorKindFromOp,
  creatorPlatformFromOp,
  runCreatorTool,
  type CreatorField,
} from "@/lib/engines/creator";
import type { UiField } from "@/components/engines/fields";

type Values = Record<string, string>;

type ToolState = {
  fields: CreatorField[];
  values: Values;
  update: (name: string, value: string) => void;
  run: () => void;
  reset: () => void;
  out: string;
  error: string | null;
};

/** Shared state/validation only. Each operation below owns its actual screen layout. */
function useCreatorTool(op: string): ToolState {
  const fields = useMemo(() => creatorFieldsFor(op), [op]);
  const [values, setValues] = useState<Values>(() => initialValues(fields as UiField[]));
  const [out, setOut] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues(initialValues(fields as UiField[]));
    setOut("");
    setError(null);
  }, [fields]);

  const update = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));
  const run = () => {
    try {
      setError(null);
      setOut(runCreatorTool(op, values));
    } catch (e) {
      setOut("");
      setError(e instanceof Error ? e.message : "Could not run this tool. Check the inputs and try again.");
    }
  };
  const reset = () => {
    setValues(initialValues(fields as UiField[]));
    setOut("");
    setError(null);
  };

  return { fields, values, update, run, reset, out, error };
}

function ToolField({
  field,
  values,
  update,
  className = "",
}: {
  field?: CreatorField;
  values: Values;
  update: (name: string, value: string) => void;
  className?: string;
}) {
  if (!field) return null;
  const id = `creator-${field.name.replace(/[^a-z0-9-]/gi, "-")}`;
  return (
    <div className={`block min-w-0 space-y-1.5 ${className}`}>
      <Label htmlFor={id}>{field.label}</Label>
      {field.type === "textarea" ? (
        <Textarea
          id={id}
          value={values[field.name] ?? ""}
          placeholder={field.placeholder}
          onChange={(event) => update(field.name, event.target.value)}
          className="min-h-36"
        />
      ) : field.type === "select" ? (
        <Select
          id={id}
          value={values[field.name] ?? String(field.defaultValue ?? field.options?.[0]?.value ?? "")}
          onChange={(event) => update(field.name, event.target.value)}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      ) : (
        <div className="relative">
          <Input
            id={id}
            type={field.type === "number" ? "text" : field.type ?? "text"}
            inputMode={field.type === "number" ? "decimal" : undefined}
            value={values[field.name] ?? ""}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(event) => update(field.name, event.target.value)}
            className={field.suffix ? "pr-14" : ""}
          />
          {field.suffix ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-subtle">{field.suffix}</span> : null}
        </div>
      )}
      {field.hint ? <span className="block text-xs leading-5 text-subtle">{field.hint}</span> : null}
    </div>
  );
}

function FieldByName({ state, name, className }: { state: ToolState; name: string; className?: string }) {
  return <ToolField field={state.fields.find((field) => field.name === name)} values={state.values} update={state.update} className={className} />;
}

function ScreenHeading({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon className="size-5" /></div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-muted">{description}</p>
      </div>
    </div>
  );
}

function WorkPanel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ToolActions({ state, primary = "Run tool" }: { state: ToolState; primary?: string }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" onClick={state.run}>{primary}</Button>
      <Button type="button" variant="ghost" onClick={state.reset}><RotateCcw className="size-4" /> Reset</Button>
    </div>
  );
}

function ToolOutput({ state, op, title = "Your result" }: { state: ToolState; op: string; title?: string }) {
  return (
    <>
      <ErrorBanner message={state.error} />
      {state.out ? (
        <section className="rounded-xl border border-border bg-surface-2 p-4 sm:p-5" aria-live="polite">
          <div className="mb-2 flex items-center gap-2"><Sparkles className="size-4 text-accent" /><h3 className="text-sm font-semibold">{title}</h3></div>
          <CodeResult code={state.out} filename={`env-${op}.txt`} />
        </section>
      ) : null}
    </>
  );
}

function platformMeta(op: string) {
  const key = creatorPlatformFromOp(op);
  return { key, ...CREATOR_PLATFORMS[key]! };
}

function RevenueScreen({ op }: { op: string }) {
  const state = useCreatorTool(op);
  const platform = platformMeta(op);
  const statementBased = platform.key === "spotify" || platform.key === "apple-music";
  return (
    <div className="space-y-4">
      <ScreenHeading icon={Music2} eyebrow={`${platform.label} · Earnings`} title={`${platform.label} revenue calculator`} description={statementBased ? "Build a royalty scenario from your own statement history. The tool derives your observed rate instead of assuming a fixed payment per stream." : "Estimate a revenue scenario using your own dashboard RPM and eligible volume. Change the assumptions to model a cautious, expected or stronger period."} />
      {statementBased ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <WorkPanel title="1. Your past statement" description="Use stream/play counts and payout from the same reporting period.">
            <FieldByName state={state} name="historyStreams" />
            <FieldByName state={state} name="historyPayout" />
          </WorkPanel>
          <WorkPanel title="2. Forecast this release / catalogue" description="Apply your historic effective rate to a new volume, then account for your rights share and fees.">
            <FieldByName state={state} name="forecastStreams" />
            <FieldByName state={state} name="rightsShare" />
            <FieldByName state={state} name="distributionFee" />
            <FieldByName state={state} name="currency" />
          </WorkPanel>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <WorkPanel title="Performance from your dashboard" description="Use a comparable reporting window and the platform's own monetized or eligible volume.">
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldByName state={state} name="volume" />
              <FieldByName state={state} name="rate" />
              <FieldByName state={state} name="other" />
              <FieldByName state={state} name="fee" />
              <FieldByName state={state} name="currency" className="sm:col-span-2" />
            </div>
          </WorkPanel>
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Scenario notes</p>
            <ul className="mt-3 space-y-2 text-sm leading-5 text-muted">
              <li>Use your own recent RPM, not a public average.</li>
              <li>Exclude views or impressions that were not eligible for monetization.</li>
              <li>Enter your partner or management share separately.</li>
            </ul>
            <p className="mt-4 rounded-lg bg-surface px-3 py-2 text-xs leading-5 text-subtle">This is a planning estimate, not a guaranteed platform payout. Currency is a display label only.</p>
          </div>
        </div>
      )}
      <ToolActions state={state} primary="Estimate revenue" />
      <ToolOutput state={state} op={op} title="Revenue scenario" />
    </div>
  );
}

function EngagementScreen({ op }: { op: string }) {
  const state = useCreatorTool(op);
  const platform = platformMeta(op);
  const music = platform.key === "spotify" || platform.key === "apple-music";
  const live = platform.key === "twitch";
  const podcast = platform.key === "podcast";
  const video = platform.key === "youtube";
  const heading = music ? "Listener response" : live ? "Live community activity" : podcast ? "Episode audience quality" : video ? "Video performance" : "Post interaction";
  const description = music
    ? "Measure saves, playlist activity and listening behaviour against the same listener period."
    : live ? "Understand how many viewers participate in chat and how the live session converts to follows."
      : podcast ? "Compare downloads, engaged listeners, followers and completion using one host and reporting window."
        : video ? "Keep view-based interaction, thumbnail click-through and viewing depth separate instead of blending unlike metrics."
          : "Enter the native analytics figures for one post or one consistent reporting period. Reach, impressions and views are not interchangeable.";
  return (
    <div className="space-y-4">
      <ScreenHeading icon={Activity} eyebrow={`${platform.label} · Performance`} title={`${platform.label} engagement calculator`} description={description} />
      <WorkPanel title={heading} description={`Enter the figures exactly as shown in ${platform.label}'s analytics. The result keeps platform-specific measures distinct.`}>
        {music ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldByName state={state} name="listeners" />
            <FieldByName state={state} name={platform.key === "apple-music" ? "plays" : "streams"} />
            <FieldByName state={state} name={platform.key === "apple-music" ? "shazams" : "saves"} />
            <FieldByName state={state} name={platform.key === "apple-music" ? "radioSpins" : "playlistAdds"} />
            {platform.key === "apple-music" ? <FieldByName state={state} name="purchases" /> : null}
          </div>
        ) : live ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldByName state={state} name="avgViewers" />
            <FieldByName state={state} name="chatters" />
            <FieldByName state={state} name="chatMessages" />
            <FieldByName state={state} name="follows" />
          </div>
        ) : podcast ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldByName state={state} name="listeners" />
            <FieldByName state={state} name="downloads" />
            <FieldByName state={state} name="engagedListeners" />
            <FieldByName state={state} name="followers" />
            <FieldByName state={state} name="completion" className="sm:col-span-2" />
          </div>
        ) : video ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldByName state={state} name="views" />
            <FieldByName state={state} name="likes" />
            <FieldByName state={state} name="comments" />
            <FieldByName state={state} name="shares" />
            <FieldByName state={state} name="impressions" />
            <FieldByName state={state} name="clicks" />
            <FieldByName state={state} name="avgViewPct" className="sm:col-span-2" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldByName state={state} name="likes" />
            <FieldByName state={state} name="comments" />
            <FieldByName state={state} name="shares" />
            <FieldByName state={state} name="saves" />
            <FieldByName state={state} name="reach" />
            <FieldByName state={state} name="followers" />
          </div>
        )}
      </WorkPanel>
      <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-3 text-xs leading-5 text-muted"><Activity className="mt-0.5 size-4 shrink-0 text-accent" /> Use the same post, episode, stream or statement window for every value. The tool does not connect to private account analytics.</div>
      <ToolActions state={state} primary="Calculate engagement" />
      <ToolOutput state={state} op={op} title="Performance breakdown" />
    </div>
  );
}

function GrowthScreen({ op }: { op: string }) {
  const state = useCreatorTool(op);
  const platform = platformMeta(op);
  return (
    <div className="space-y-4">
      <ScreenHeading icon={TrendingUp} eyebrow={`${platform.label} · Audience trend`} title={`${platform.label} growth calculator`} description={`Compare ${platform.audienceLabel} across two points in time. See net change, overall growth and the average compounded rate for your selected period.`} />
      <WorkPanel title="Audience checkpoints" description="Choose matching dates or reporting periods from the same native analytics source.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-surface-2 p-3"><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Starting point</p><FieldByName state={state} name="start" /></div>
          <div className="rounded-lg bg-surface-2 p-3"><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Latest point</p><FieldByName state={state} name="end" /></div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><FieldByName state={state} name="periods" /><FieldByName state={state} name="period" /></div>
      </WorkPanel>
      <ToolActions state={state} primary="Calculate growth" />
      <ToolOutput state={state} op={op} title="Growth report" />
    </div>
  );
}

function PlannerScreen({ op }: { op: string }) {
  const state = useCreatorTool(op);
  const platform = platformMeta(op);
  return (
    <div className="space-y-4">
      <ScreenHeading icon={Sparkles} eyebrow={`${platform.label} · Creative planning`} title={`${platform.label} content planner`} description={`Build a practical ${platform.label} idea list around a clear audience, goal and content pillar. The formats and planning angles are tailored to ${platform.style}.`} />
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <WorkPanel title="Campaign brief" description="Give the planner enough context to make specific ideas rather than generic prompts.">
          <div className="space-y-3">
            <FieldByName state={state} name="brand" />
            <FieldByName state={state} name="topic" />
            <FieldByName state={state} name="audience" />
            <div className="grid gap-3 sm:grid-cols-2"><FieldByName state={state} name="goal" /><FieldByName state={state} name="count" /></div>
            <FieldByName state={state} name="pillar" />
          </div>
        </WorkPanel>
        <div className="space-y-4">
          <WorkPanel title="Recommended creative formats" description={`Select and adapt formats that match how people use ${platform.label}.`}>
            <div className="flex flex-wrap gap-2">{platform.formats.map((format) => <span key={format} className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs">{format}</span>)}</div>
          </WorkPanel>
          <WorkPanel title="Content pillars" description="Use these as recurring editorial lanes, not as a rigid posting formula.">
            <div className="flex flex-wrap gap-2">{platform.pillars.map((pillar) => <span key={pillar} className="rounded-md bg-accent/10 px-2.5 py-1.5 text-xs font-medium capitalize text-accent">{pillar}</span>)}</div>
          </WorkPanel>
        </div>
      </div>
      <ToolActions state={state} primary="Build content plan" />
      <ToolOutput state={state} op={op} title="Your content plan" />
    </div>
  );
}

function CalendarScreen({ op }: { op: string }) {
  const state = useCreatorTool(op);
  const platform = platformMeta(op);
  return (
    <div className="space-y-4">
      <ScreenHeading icon={CalendarDays} eyebrow={`${platform.label} · Publishing schedule`} title={`${platform.label} content calendar`} description="Create a dated publishing plan using the days and formats you actually intend to use. This creates a plan only; it does not schedule or publish posts." />
      <WorkPanel title="Campaign and schedule" description="Set the start date, posting rhythm and content formats for this campaign.">
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldByName state={state} name="brand" />
          <FieldByName state={state} name="topic" />
          <FieldByName state={state} name="goal" />
          <FieldByName state={state} name="startDate" />
          <FieldByName state={state} name="count" />
          <FieldByName state={state} name="days" />
          <FieldByName state={state} name="formatMix" className="sm:col-span-2" />
        </div>
      </WorkPanel>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Formats", platform.formats.length], ["Editorial pillars", platform.pillars.length], ["Channels", 1], ["Publishing", "Manual"]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border bg-surface-2 p-3"><p className="text-[11px] text-muted">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}
      </div>
      <ToolActions state={state} primary="Generate calendar" />
      <ToolOutput state={state} op={op} title="Dated publishing plan" />
    </div>
  );
}

const COPY_SCREENS: Record<string, { icon: LucideIcon; title: string; eyebrow: string; description: string; primary: string; resultTitle: string }> = {
  "caption-generator": { icon: Type, title: "Caption generator", eyebrow: "Social copy · Captions", description: "Write captions with a clear opening, a natural voice and an action that fits the audience.", primary: "Generate captions", resultTitle: "Caption drafts" },
  "title-generator": { icon: FileText, title: "Title generator", eyebrow: "Social copy · Titles", description: "Create specific, clear titles that communicate the value of the video, post, track or episode without misleading the audience.", primary: "Create title options", resultTitle: "Title options" },
  "description-generator": { icon: FileText, title: "Description writer", eyebrow: "Social copy · Descriptions", description: "Build a useful description with context, key details and a relevant next step—not a block of repeated keywords.", primary: "Write descriptions", resultTitle: "Description drafts" },
  "hashtag-generator": { icon: Hash, title: "Hashtag generator", eyebrow: "Social discovery · Hashtags", description: "Create a focused mix of topic, audience and platform tags. These are suggestions, not a live trend report or a reach guarantee.", primary: "Generate hashtags", resultTitle: "Suggested hashtag sets" },
  "bio-generator": { icon: UserRound, title: "Bio generator", eyebrow: "Profile identity · Bio", description: "Shape a concise profile bio that makes your identity, audience and value clear at a glance.", primary: "Create bio options", resultTitle: "Bio options" },
};

function CopywritingScreen({ op, kind }: { op: string; kind: string }) {
  const state = useCreatorTool(op);
  const platform = platformMeta(op);
  const screen = COPY_SCREENS[kind]!;
  const hashtag = kind === "hashtag-generator";
  const bio = kind === "bio-generator";
  const title = kind === "title-generator";
  const description = kind === "description-generator";
  return (
    <div className="space-y-4">
      <ScreenHeading icon={screen.icon} eyebrow={`${platform.label} · ${screen.eyebrow}`} title={`${platform.label} ${screen.title.toLowerCase()}`} description={`${screen.description} ${platform.label} style: ${platform.style}.`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <WorkPanel title={hashtag ? "Keyword brief" : bio ? "Profile identity" : title ? "Title brief" : description ? "Description brief" : "Caption brief"} description={hashtag ? "Keep the phrase focused on the actual content and niche." : "Specific details make the generated copy more believable and useful."}>
          <div className="space-y-3">
            <FieldByName state={state} name="brand" />
            <FieldByName state={state} name="topic" />
            <FieldByName state={state} name="audience" />
            {!hashtag && !bio && <FieldByName state={state} name="goal" />}
            {!hashtag && <FieldByName state={state} name="tone" />}
            {!hashtag && <FieldByName state={state} name="proof" />}
            {!bio && !title && !hashtag && <FieldByName state={state} name="cta" />}
            {hashtag && <FieldByName state={state} name="keywords" />}
            {bio && <FieldByName state={state} name="keywords" />}
            {!bio && !hashtag && <FieldByName state={state} name="keywords" />}
            <FieldByName state={state} name="count" />
          </div>
        </WorkPanel>
        <div className="space-y-4">
          <WorkPanel title={hashtag ? "Tag mix guide" : bio ? "Profile checklist" : title ? "Title quality check" : description ? "Description structure" : "Caption structure"}>
            {hashtag ? (
              <ol className="space-y-3 text-sm text-muted"><li><strong className="text-fg">1. Topic tags</strong><p className="text-xs">Name the subject of the content.</p></li><li><strong className="text-fg">2. Audience tags</strong><p className="text-xs">Use phrases your intended community recognises.</p></li><li><strong className="text-fg">3. Platform tags</strong><p className="text-xs">Keep the set relevant to the selected platform.</p></li></ol>
            ) : bio ? (
              <ul className="space-y-2 text-sm text-muted"><li>Who you are or what you make.</li><li>Who your work helps or entertains.</li><li>One clear reason to follow or listen.</li><li>A relevant next step, when space allows.</li></ul>
            ) : title ? (
              <ul className="space-y-2 text-sm text-muted"><li>Make the subject recognisable.</li><li>Promise a specific outcome or point of interest.</li><li>Avoid unsupported claims and artificial urgency.</li></ul>
            ) : description ? (
              <ul className="space-y-2 text-sm text-muted"><li>Set the context first.</li><li>Include the most useful details or takeaways.</li><li>Close with a natural next step and any necessary links.</li></ul>
            ) : (
              <ul className="space-y-2 text-sm text-muted"><li>Open with a human, clear first line.</li><li>Add one useful detail, story or proof point.</li><li>Finish with a relevant invitation to respond or act.</li></ul>
            )}
          </WorkPanel>
          <div className="rounded-xl border border-border bg-surface-2 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><WandSparkles className="size-4 text-accent" />Output style</div><p className="text-xs leading-5 text-muted">{hashtag ? "Focused tag suggestions with no claim of live trend access." : bio ? "Short profile-ready variations with a distinct positioning angle." : title ? "Multiple headline angles rather than minor rewrites of one sentence." : description ? "Readable, structured copy that can be edited before publishing." : "Several draft directions with a platform-appropriate voice."}</p></div>
        </div>
      </div>
      <ToolActions state={state} primary={screen.primary} />
      <ToolOutput state={state} op={op} title={screen.resultTitle} />
    </div>
  );
}

function PostingTimeScreen({ op }: { op: string }) {
  const state = useCreatorTool(op);
  const platform = platformMeta(op);
  return (
    <div className="space-y-4">
      <ScreenHeading icon={Clock3} eyebrow={`${platform.label} · Audience timing`} title={`${platform.label} posting time helper`} description="Compare audience activity windows from your own analytics. The tool ranks the evidence you provide; it will not invent a universal best time." />
      <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
        <WorkPanel title="Audience and objective" description="Keep your timezone consistent with the dashboard where you collected the activity data.">
          <FieldByName state={state} name="timezone" />
          <div className="mt-3"><FieldByName state={state} name="goal" /></div>
          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs leading-5 text-muted">Use your audience's local timezone when possible. For a global audience, compare important regions separately.</div>
        </WorkPanel>
        <WorkPanel title="Activity windows from native analytics" description="One window per line. Format: Day HH:mm = activity score.">
          <FieldByName state={state} name="audienceWindows" />
          <div className="mt-3 flex flex-wrap gap-2">{["Mon 18:00 = 42", "Wed 20:00 = 37", "Sat 11:00 = 29"].map((sample) => <span key={sample} className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-muted">{sample}</span>)}</div>
        </WorkPanel>
      </div>
      <ToolActions state={state} primary="Rank my activity windows" />
      <ToolOutput state={state} op={op} title="Evidence-based timing suggestions" />
    </div>
  );
}

function ThumbnailScreen({ op }: { op: string }) {
  const state = useCreatorTool(op);
  const platform = platformMeta(op);
  const assetField = state.fields.find((field) => field.name === "asset");
  const asset = state.values.asset || String(assetField?.defaultValue ?? "thumbnail");
  return (
    <div className="space-y-4">
      <ScreenHeading icon={ImageIcon} eyebrow={`${platform.label} · Artwork and dimensions`} title={`${platform.label} thumbnail size helper`} description="Choose the asset placement to see a practical canvas and export checklist. Always verify final limits and crops in the platform's current upload flow." />
      <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <WorkPanel title="Choose an asset" description="The correct canvas depends on where the artwork will appear.">
          <FieldByName state={state} name="asset" />
          <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-center">
            <div className={`mx-auto flex items-center justify-center rounded-lg border border-border bg-surface-2 ${asset === "vertical" ? "aspect-[9/16] w-24" : asset === "banner" ? "aspect-[3/1] w-full" : "aspect-square w-28"}`}><ImageIcon className="size-7 text-muted" /></div>
            <p className="mt-3 text-xs font-medium capitalize">{asset.replace(/-/g, " ")} preview area</p>
            <p className="mt-1 text-[11px] text-muted">Canvas shape preview only</p>
          </div>
        </WorkPanel>
        <WorkPanel title="Platform canvas guidance" description={platform.size}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-surface-2 p-3"><p className="text-xs text-muted">Crop safety</p><p className="mt-1 text-sm font-medium">Check every placement</p></div>
            <div className="rounded-lg bg-surface-2 p-3"><p className="text-xs text-muted">Rights</p><p className="mt-1 text-sm font-medium">Use licensed assets</p></div>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-muted"><li>Keep important text and faces away from the edges.</li><li>Preview the artwork at phone size.</li><li>Export a separate file for each placement rather than stretching one crop.</li><li>Check file type, upload limit and current requirements before publishing.</li></ul>
        </WorkPanel>
      </div>
      <ToolActions state={state} primary="Show export guide" />
      <ToolOutput state={state} op={op} title="Asset export guide" />
    </div>
  );
}

function TapTempo() {
  const taps = useRef<number[]>([]);
  const [bpm, setBpm] = useState<number | null>(null);
  const [beatSeconds, setBeatSeconds] = useState("0.5");
  const [tapCount, setTapCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const tap = () => {
    const now = performance.now();
    const last = taps.current.at(-1);
    if (last && now - last > 2500) taps.current = [];
    taps.current = [...taps.current, now].slice(-9);
    setTapCount(taps.current.length);
    if (taps.current.length >= 3) {
      const intervals = taps.current.slice(1).map((time, index) => time - taps.current[index]!);
      const sorted = [...intervals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      const filtered = intervals.filter((value) => value > median * 0.7 && value < median * 1.3);
      const average = filtered.reduce((sum, value) => sum + value, 0) / Math.max(1, filtered.length);
      setBpm(60000 / average);
      setError(null);
    }
  };

  const manual = () => {
    const seconds = Number(beatSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) { setError("Enter a beat duration greater than zero."); return; }
    setBpm(60 / seconds);
    setError(null);
  };

  const clear = () => { taps.current = []; setBpm(null); setTapCount(0); setError(null); };
  return (
    <div className="space-y-4">
      <ScreenHeading icon={Music2} eyebrow="Music tools · Tempo" title="BPM calculator" description="Tap along to a steady beat or enter a beat duration to measure tempo. Recent taps are averaged to reduce timing noise." />
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Live tap tempo</p>
          <div className="my-4 text-5xl font-semibold tabular-nums tracking-tight">{bpm === null ? "—" : bpm.toFixed(1)} <span className="text-lg text-muted">BPM</span></div>
          <p className="mb-5 text-sm leading-5 text-muted">Tap in time with the song, metronome or rhythm. Use at least three taps for a reading.</p>
          <div className="flex flex-wrap gap-2"><Button type="button" onClick={tap} className="min-w-36">Tap beat · {tapCount}</Button><Button type="button" variant="outline" onClick={clear}>Reset taps</Button></div>
        </section>
        <WorkPanel title="Manual beat conversion" description="Enter the length of one beat in seconds.">
          <label className="block space-y-1.5"><Label htmlFor="beat-seconds">Seconds per beat</Label><Input id="beat-seconds" inputMode="decimal" value={beatSeconds} onChange={(event) => setBeatSeconds(event.target.value)} /></label>
          <p className="mt-2 text-xs text-muted">Example: 0.5 seconds per beat equals 120 BPM.</p>
          <Button type="button" onClick={manual} className="mt-4">Convert to BPM</Button>
        </WorkPanel>
      </div>
      <ErrorBanner message={error} />
      {bpm !== null ? <div className="rounded-xl border border-border bg-surface-2 p-4" aria-live="polite"><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-muted">Tempo</p><p className="mt-1 text-lg font-semibold tabular-nums">{bpm.toFixed(2)} BPM</p></div><div><p className="text-xs text-muted">Beat duration</p><p className="mt-1 text-lg font-semibold tabular-nums">{(60 / bpm).toFixed(4)} sec</p></div><div><p className="text-xs text-muted">Tap count</p><p className="mt-1 text-lg font-semibold tabular-nums">{tapCount}</p></div></div><CodeResult code={`Tempo: ${bpm.toFixed(2)} BPM\nBeat duration: ${(60 / bpm).toFixed(4)} seconds\nTap count: ${tapCount}`} filename="env-bpm-tempo.txt" /></div> : null}
    </div>
  );
}

export function CreatorEngine({ op }: { op: string }) {
  const kind = creatorKindFromOp(op);
  if (op === "bpm") return <TapTempo />;
  if (kind === "revenue-calculator") return <RevenueScreen op={op} />;
  if (kind === "engagement-calculator") return <EngagementScreen op={op} />;
  if (kind === "growth-calculator") return <GrowthScreen op={op} />;
  if (kind === "content-planner") return <PlannerScreen op={op} />;
  if (kind === "content-calendar") return <CalendarScreen op={op} />;
  if (kind === "posting-time-helper") return <PostingTimeScreen op={op} />;
  if (kind === "thumbnail-size-helper") return <ThumbnailScreen op={op} />;
  if (["caption-generator", "title-generator", "description-generator", "hashtag-generator", "bio-generator"].includes(kind)) return <CopywritingScreen op={op} kind={kind} />;
  return <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">This Creator & Music tool does not have a dedicated interface yet.</div>;
}