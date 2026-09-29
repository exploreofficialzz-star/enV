import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldGrid } from "@/components/engines/fields";
import { initialValues } from "@/components/engines/initial-values";
import { ResultPanel } from "@/components/engines/result-panel";
import {
  STREAMING_PLATFORMS,
  RESOLUTIONS,
  FPS,
  buildChecklistText,
  buildDescription,
  buildOverlayText,
  buildScheduleText,
  buildTitles,
  calculateAspectRatio,
  calculateBitrate,
  calculateRevenue,
  parseStreamingToolId,
  validateSchedule,
  type StreamingPlatform,
  type StreamingOperation,
} from "./streaming-engine-utils";

function ResetButton({ onClick }: { onClick: () => void }) {
  return <Button type="button" variant="ghost" size="sm" onClick={onClick}>Reset</Button>;
}

function ErrorText({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p> : null;
}

export function StreamingEngine({ toolId }: { toolId: string }) {
  const parsed = parseStreamingToolId(toolId);
  if (!parsed) return <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">This streaming utility is not configured.</div>;
  return <StreamingOperationView platform={parsed.platform} operation={parsed.operation} />;
}

function StreamingOperationView({ platform, operation }: { platform: StreamingPlatform; operation: StreamingOperation }) {
  if (operation === "bitrate-calculator") return <Bitrate platform={platform} />;
  if (operation === "resolution-helper") return <Resolution platform={platform} />;
  if (operation === "aspect-ratio-helper") return <Aspect platform={platform} />;
  if (operation === "revenue-calculator") return <Revenue platform={platform} />;
  if (operation === "stream-schedule") return <Schedule platform={platform} />;
  if (operation === "overlay-planner") return <Overlay platform={platform} />;
  if (operation === "stream-checklist") return <Checklist platform={platform} />;
  if (operation === "title-generator") return <Title platform={platform} />;
  return <Description platform={platform} />;
}

function Bitrate({ platform }: { platform: StreamingPlatform }) {
  const fields = useMemo(() => [
    { name: "resolution", label: "Resolution", type: "select" as const, options: Object.keys(RESOLUTIONS).map((v) => ({ value: v, label: v })), defaultValue: "1080p" },
    { name: "fps", label: "Frame rate", type: "select" as const, options: Object.keys(FPS).map((v) => ({ value: v, label: `${v} FPS` })), defaultValue: "30" },
    { name: "quality", label: "Quality", type: "select" as const, options: [{ value: "low", label: "Efficient" }, { value: "high", label: "High quality" }], defaultValue: "high" },
  ], []);
  const defaults = useMemo(() => initialValues(fields), [fields]);
  const [values, setValues] = useState(defaults);
  const result = calculateBitrate(values.resolution, values.fps, values.quality, platform);
  const reset = () => setValues(defaults);
  const output = "error" in result ? "" : `Video bitrate: ${result.video} kbps\nAudio bitrate: ${result.audio} kbps\nCombined target: ${result.combined} kbps\nPlatform: ${STREAMING_PLATFORMS[platform]}`;
  return <form className="space-y-5" onSubmit={(e) => e.preventDefault()}><FieldGrid fields={fields} values={values} onChange={(n, v) => setValues((x) => ({ ...x, [n]: v }))} /><ErrorText message={"error" in result ? result.error ?? null : null} />{"error" in result ? null : <ResultPanel extraText={output} items={[{ label: "Video bitrate", value: `${result.video} kbps`, primary: true }, { label: "Audio bitrate", value: `${result.audio} kbps` }, { label: "Combined target", value: `${result.combined} kbps` }, { label: "Platform", value: STREAMING_PLATFORMS[platform] }]} filename={`${platform}-bitrate.txt`} />}<ResetButton onClick={reset} /></form>;
}

function Resolution({ platform }: { platform: StreamingPlatform }) {
  const fields = useMemo(() => [{ name: "resolution", label: "Resolution", type: "select" as const, options: Object.keys(RESOLUTIONS).map((v) => ({ value: v, label: v })), defaultValue: "1080p" }, { name: "orientation", label: "Orientation", type: "select" as const, options: [{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }, { value: "square", label: "Square" }], defaultValue: "landscape" }], []);
  const defaults = useMemo(() => initialValues(fields), [fields]);
  const [values, setValues] = useState(defaults);
  const [w, h] = RESOLUTIONS[values.resolution] ?? RESOLUTIONS["1080p"];
  const dims = values.orientation === "portrait" ? `${h} × ${w}` : values.orientation === "square" ? `${Math.min(w, h)} × ${Math.min(w, h)}` : `${w} × ${h}`;
  return <form className="space-y-5" onSubmit={(e) => e.preventDefault()}><FieldGrid fields={fields} values={values} onChange={(n, v) => setValues((x) => ({ ...x, [n]: v }))} /><ResultPanel extraText={`Recommended canvas: ${dims}\nPlatform: ${STREAMING_PLATFORMS[platform]}`} items={[{ label: "Recommended canvas", value: dims, primary: true }, { label: "Platform", value: STREAMING_PLATFORMS[platform] }]} filename={`${platform}-resolution.txt`} /><ResetButton onClick={() => setValues(defaults)} /></form>;
}

function Aspect({ platform }: { platform: StreamingPlatform }) {
  const fields = useMemo(() => [{ name: "width", label: "Width", type: "number" as const, defaultValue: "1920" }, { name: "height", label: "Height", type: "number" as const, defaultValue: "1080" }], []);
  const defaults = useMemo(() => initialValues(fields), [fields]);
  const [values, setValues] = useState(defaults);
  const result = calculateAspectRatio(values.width, values.height);
  return <form className="space-y-5" onSubmit={(e) => e.preventDefault()}><FieldGrid fields={fields} values={values} onChange={(n, v) => setValues((x) => ({ ...x, [n]: v }))} /><ErrorText message={"error" in result ? result.error ?? null : null} />{"error" in result ? null : <ResultPanel extraText={`Aspect ratio: ${result.ratio}\nDecimal ratio: ${result.decimal.toFixed(3)}\nPlatform: ${STREAMING_PLATFORMS[platform]}`} items={[{ label: "Aspect ratio", value: result.ratio, primary: true }, { label: "Decimal ratio", value: result.decimal.toFixed(3) }, { label: "Platform", value: STREAMING_PLATFORMS[platform] }]} filename={`${platform}-aspect-ratio.txt`} />}<ResetButton onClick={() => setValues(defaults)} /></form>;
}

function Revenue({ platform }: { platform: StreamingPlatform }) {
  const fields = useMemo(() => [{ name: "viewers", label: "Average live viewers", type: "number" as const, defaultValue: "100" }, { name: "hours", label: "Streaming hours", type: "number" as const, defaultValue: "2" }, { name: "rate", label: "Estimated earnings per 1,000 viewer-hours ($)", type: "number" as const, defaultValue: "3" }], []);
  const defaults = useMemo(() => initialValues(fields), [fields]);
  const [values, setValues] = useState(defaults);
  const result = calculateRevenue(values.viewers, values.hours, values.rate);
  return <form className="space-y-5" onSubmit={(e) => e.preventDefault()}><FieldGrid fields={fields} values={values} onChange={(n, v) => setValues((x) => ({ ...x, [n]: v }))} /><ErrorText message={"error" in result ? result.error ?? null : null} />{"error" in result ? null : <ResultPanel extraText={`Estimated gross: $${result.estimate.toFixed(2)}\nPlatform: ${STREAMING_PLATFORMS[platform]}\nEstimate only; actual monetization varies by platform, audience and revenue source.`} items={[{ label: "Estimated gross", value: `$${result.estimate.toFixed(2)}`, primary: true }, { label: "Platform", value: STREAMING_PLATFORMS[platform] }, { label: "Important", value: "Estimate only; actual monetization varies by platform, audience and revenue source." }]} filename={`${platform}-revenue-estimate.txt`} />}<ResetButton onClick={() => setValues(defaults)} /></form>;
}

function Schedule({ platform }: { platform: StreamingPlatform }) {
  const fields = useMemo(() => [{ name: "date", label: "Date", type: "date" as const, defaultValue: new Date().toISOString().slice(0, 10) }, { name: "time", label: "Start time", type: "text" as const, defaultValue: "19:00", placeholder: "19:00" }, { name: "duration", label: "Duration", type: "text" as const, defaultValue: "02:00", placeholder: "02:00" }, { name: "topic", label: "Stream topic", type: "text" as const, defaultValue: "" }], []);
  const defaults = useMemo(() => initialValues(fields), [fields]);
  const [values, setValues] = useState(defaults);
  const error = validateSchedule(values.date, values.time, values.duration);
  const text = buildScheduleText(platform, values.date, values.time, values.duration, values.topic);
  return <form className="space-y-5" onSubmit={(e) => e.preventDefault()}><FieldGrid fields={fields} values={values} onChange={(n, v) => setValues((x) => ({ ...x, [n]: v }))} /><ErrorText message={error} />{!error ? <ResultPanel extraText={text} items={[{ label: "Schedule", value: `${values.date} · ${values.time} · ${values.duration}`, primary: true }, { label: "Topic", value: values.topic.trim() || "Untitled stream" }]} filename={`${platform}-stream-schedule.txt`} /> : null}<ResetButton onClick={() => setValues(defaults)} /></form>;
}

function Overlay({ platform }: { platform: StreamingPlatform }) {
  const defaults = ["Camera frame", "Name/handle", "Latest follower or subscriber", "Chat area", "Alert area"];
  const [items, setItems] = useState(defaults);
  const text = buildOverlayText(platform, items);
  return <div className="space-y-5"><div className="grid gap-2 sm:grid-cols-2">{items.map((item, i) => <div key={`${item}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3"><span>{i + 1}. {item}</span><Button type="button" variant="ghost" onClick={() => setItems((x) => x.filter((_, j) => j !== i))}>Remove</Button></div>)}</div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => setItems((x) => [...x, `Custom element ${x.length + 1}`])}>Add element</Button><ResetButton onClick={() => setItems(defaults)} /></div><ResultPanel extraText={text} items={[{ label: "Platform", value: STREAMING_PLATFORMS[platform] }, { label: "Elements", value: `${items.length} planned`, primary: true }]} filename={`${platform}-overlay-plan.txt`} /></div>;
}

function Checklist({ platform }: { platform: StreamingPlatform }) {
  const defaults = ["Test camera and microphone", "Check network/upload speed", "Confirm scene/layout", "Prepare title and description", "Test alerts and chat", "Start recording/backup if needed", "Confirm stream is live", "Monitor chat and stream health", "End stream cleanly", "Save/archive the recording"];
  const [checked, setChecked] = useState<boolean[]>(defaults.map(() => false));
  const completed = checked.filter(Boolean).length;
  const text = buildChecklistText(platform, defaults, checked);
  return <div className="space-y-4"><div className="space-y-2">{defaults.map((item, i) => <label key={item} className="flex items-center gap-3 rounded-lg border border-border p-3"><input type="checkbox" checked={checked[i]} onChange={() => setChecked((x) => x.map((v, j) => j === i ? !v : v))} /> <span className={checked[i] ? "line-through opacity-60" : ""}>{item}</span></label>)}</div><div className="flex flex-wrap gap-2"><ResetButton onClick={() => setChecked(defaults.map(() => false))} /></div><ResultPanel extraText={text} items={[{ label: "Progress", value: `${completed}/${defaults.length}`, primary: true }, { label: "Platform", value: STREAMING_PLATFORMS[platform] }]} filename={`${platform}-stream-checklist.txt`} /></div>;
}

function Title({ platform }: { platform: StreamingPlatform }) {
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("educational");
  const titles = buildTitles(topic, style);
  const output = titles.join("\n");
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor={`${platform}-title-topic`} className="mb-1.5 block text-sm font-medium">Stream topic</label><input id={`${platform}-title-topic`} className="h-10 w-full rounded-md border border-border bg-background px-3" placeholder="Stream topic" value={topic} onChange={(e) => setTopic(e.target.value)} /></div><div><label htmlFor={`${platform}-title-style`} className="mb-1.5 block text-sm font-medium">Style</label><select id={`${platform}-title-style`} className="h-10 w-full rounded-md border border-border bg-background px-3" value={style} onChange={(e) => setStyle(e.target.value)}><option value="educational">Educational</option><option value="community">Community</option><option value="announcement">Announcement</option></select></div></div>{titles.length ? <ResultPanel extraText={output} items={[{ label: "Platform", value: STREAMING_PLATFORMS[platform] }, { label: "Generated options", value: "5", primary: true }]} filename={`${platform}-title-options.txt`} /> : <p className="text-sm text-muted">Enter a topic to generate titles.</p>}<ResetButton onClick={() => { setTopic(""); setStyle("educational"); }} /></div>;
}

function Description({ platform }: { platform: StreamingPlatform }) {
  const [topic, setTopic] = useState("");
  const [cta, setCta] = useState("Subscribe and turn on notifications for future streams.");
  const text = buildDescription(topic, cta);
  return <div className="space-y-5"><div><label htmlFor={`${platform}-description-topic`} className="mb-1.5 block text-sm font-medium">Stream topic</label><textarea id={`${platform}-description-topic`} className="min-h-24 w-full rounded-md border border-border bg-background p-3" placeholder="Stream topic" value={topic} onChange={(e) => setTopic(e.target.value)} /></div><div><label htmlFor={`${platform}-description-cta`} className="mb-1.5 block text-sm font-medium">Call to action</label><textarea id={`${platform}-description-cta`} className="min-h-20 w-full rounded-md border border-border bg-background p-3" value={cta} onChange={(e) => setCta(e.target.value)} /></div>{text ? <ResultPanel extraText={text} items={[{ label: "Platform", value: STREAMING_PLATFORMS[platform] }, { label: "Description", value: "Generated", primary: true }]} filename={`${platform}-description.txt`} /> : <p className="text-sm text-muted">Enter a topic to generate a structured description.</p>}<ResetButton onClick={() => { setTopic(""); setCta("Subscribe and turn on notifications for future streams."); }} /></div>;
}
