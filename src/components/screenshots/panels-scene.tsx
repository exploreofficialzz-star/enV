import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { ASPECT_PRESETS } from "@/lib/screenshots/geometry";
import { getPreset } from "@/lib/screenshots/presets";
import { CANVAS_PRESETS, getCanvasPreset } from "@/lib/screenshots/store-presets";
import { BACKDROP_PRESETS, type BackgroundSpec } from "@/lib/screenshots/backgrounds";
import { NO_FRAME, arrangeItems, bestOrientation, browserDefaultsFor, effectiveCrop, type CollageLayout, type Scene } from "@/lib/screenshots/scene";
import { DEFAULT_SHADOW } from "@/lib/screenshots/shadow";
import { ColorInput, NumberInput, Note, SelectField, Segmented, Slider, TextInput, Toggle } from "./controls";
import type { PanelCtx } from "./panel-types";
import type { SourceEntry } from "./use-sources";

const bgCss = (b: BackgroundSpec): string => b.kind === "solid" ? b.color : b.kind === "linear" ? `linear-gradient(${b.angle}deg, ${b.stops.map((s) => s.color).join(", ")})` : b.kind === "radial" ? `radial-gradient(circle, ${b.stops.map((s) => s.color).join(", ")})` : "transparent";

/* ---------------------------------------------------------------- source */
export function SourcePanel({ source, recent, onFiles, onPaste, onCapture, onRemove, onUse, onClearAll, canCapture, canPaste, capture, multi }: {
  source: SourceEntry | undefined; recent: SourceEntry[]; onFiles: (f: File[]) => void; onPaste: () => void; onCapture: () => void; onRemove: () => void; onUse: (id: string) => void; onClearAll: () => void;
  canCapture: boolean; canPaste: boolean; multi: boolean; capture: { delay: number; setDelay: (n: number) => void; cursor: boolean; setCursor: (b: boolean) => void; remaining: number | null; cancel: () => void };
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="ss-stack">
      {source && !multi ? <p className="ss-meta"><strong>{source.name}</strong><br />{source.width} × {source.height} px · {(source.bytes / 1024).toFixed(0)} KB · {source.mime.replace("image/", "").toUpperCase()}{source.hasAlpha ? " · has transparency" : ""}</p> : null}
      <div className="ss-btnrow">
        <Button size="sm" variant="outline" onClick={() => input.current?.click()}>{multi ? "Add screenshots" : source ? "Replace image" : "Choose image"}</Button>
        <input ref={input} type="file" accept="image/*" multiple={multi} hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) onFiles(f); }} />
        <Button size="sm" variant="outline" onClick={onPaste}>Paste</Button>
        {canCapture ? <Button size="sm" variant="outline" onClick={onCapture} disabled={capture.remaining !== null}>Capture screen</Button> : null}
        {source && !multi ? <Button size="sm" variant="ghost" onClick={onRemove}>Remove</Button> : null}
      </div>
      {!canPaste ? <p className="ss-hint">Press Ctrl/⌘ + V anywhere on this page to paste an image.</p> : null}
      {canCapture ? (
        <details className="ss-sub"><summary>Capture options</summary>
          <p className="ss-hint">Your browser asks which screen, window or tab to share. The frame is grabbed after the delay and sharing stops immediately. Choosing this tab includes this page in the capture.</p>
          <SelectField label="Delay" value={String(capture.delay)} options={[{ value: "0", label: "No delay" }, { value: "3", label: "3 seconds" }, { value: "5", label: "5 seconds" }, { value: "10", label: "10 seconds" }]} onChange={(v) => capture.setDelay(Number(v))} />
          <Toggle label="Include mouse cursor" checked={capture.cursor} onChange={capture.setCursor} hint="Support varies by browser." />
        </details>
      ) : <p className="ss-hint">Screen capture isn’t available in this browser. Upload or paste a screenshot instead.</p>}
      {capture.remaining !== null ? <Note tone="info">Capturing{capture.remaining > 0 ? ` in ${capture.remaining}…` : "…"} <button type="button" className="ss-link" onClick={capture.cancel}>Cancel</button></Note> : null}
      {recent.length > 1 && !multi ? (
        <div><span className="ss-label">Recent in this tab</span>
          <div className="ss-thumbs">{recent.map((r) => (<button key={r.id} type="button" className="ss-thumb" aria-pressed={r.id === source?.id} aria-label={`Use ${r.name}`} title={r.name} onClick={() => onUse(r.id)}>{r.thumb ? <img src={r.thumb} alt="" /> : r.name}</button>))}</div>
          <p className="ss-hint">Kept in memory for this tab only; nothing is saved to your device. <button type="button" className="ss-link" onClick={onClearAll}>Clear all images</button></p></div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- crop */
export function CropPanel({ ctx, cropAspect, setCropAspect, onCropTool, setCrop }: { ctx: PanelCtx; cropAspect: string; setCropAspect: (v: string) => void; onCropTool: () => void; setCrop: (r: { x: number; y: number; width: number; height: number } | null, key: string) => void }) {
  const { item, source } = ctx; if (!item || !source) return <Note>Add a screenshot to crop it.</Note>;
  const full = { width: source.width, height: source.height }, c = effectiveCrop(item, full) ?? { x: 0, y: 0, ...full }, ratio = ASPECT_PRESETS.find((a) => a.id === cropAspect)?.ratio ?? null;
  const clampRect = (r: { x: number; y: number; width: number; height: number }) => { const w = Math.max(1, Math.min(full.width, Math.round(r.width))), h = Math.max(1, Math.min(full.height, Math.round(r.height))); return { x: Math.max(0, Math.min(full.width - w, Math.round(r.x))), y: Math.max(0, Math.min(full.height - h, Math.round(r.y))), width: w, height: h }; };
  const apply = (r: typeof c) => { const n = clampRect(r); setCrop(n.x === 0 && n.y === 0 && n.width === full.width && n.height === full.height ? null : n, "crop-num"); };
  return (
    <div className="ss-stack">
      <div className="ss-btnrow"><Button size="sm" variant="outline" onClick={onCropTool}>Draw crop on image</Button><Button size="sm" variant="ghost" disabled={!item.crop} onClick={() => setCrop(null, "crop-reset")}>Reset crop</Button></div>
      <SelectField label="Aspect ratio" value={cropAspect} options={ASPECT_PRESETS.map((a) => ({ value: a.id, label: a.label }))} onChange={setCropAspect} />
      <div className="ss-grid2">
        <NumberInput label="X" value={c.x} min={0} max={full.width - 1} unit="px" onChange={(v) => apply({ ...c, x: v })} />
        <NumberInput label="Y" value={c.y} min={0} max={full.height - 1} unit="px" onChange={(v) => apply({ ...c, y: v })} />
        <NumberInput label="Width" value={c.width} min={1} max={full.width} unit="px" onChange={(v) => apply({ ...c, width: v, height: ratio ? v / ratio : c.height })} />
        <NumberInput label="Height" value={c.height} min={1} max={full.height} unit="px" onChange={(v) => apply({ ...c, height: v, width: ratio ? v * ratio : c.width })} />
      </div>
      <p className="ss-hint">Cropping is non-destructive: the original stays intact until you export.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- frame */
export function FramePanel({ ctx, onApplyAll }: { ctx: PanelCtx; onApplyAll?: (presetId: string) => void }) {
  const { cfg, item, source, patchItem, adv } = ctx; if (!item) return <Note>Add a screenshot to choose a frame.</Note>;
  const allowNone = cfg.workflow !== "frame" && cfg.workflow !== "lockscreen", preset = item.presetId === NO_FRAME ? null : getPreset(item.presetId);
  const options = [...(allowNone ? [{ value: NO_FRAME, label: "No frame" }] : []), ...cfg.framePresetIds.map((id) => ({ value: id, label: getPreset(id).label }))];
  const setPreset = (id: string) => patchItem(item.id, { presetId: id, orientation: source ? bestOrientation(id, source) : item.orientation, browser: { ...browserDefaultsFor(id), address: item.browser.address, tabTitle: item.browser.tabTitle, appearance: item.browser.appearance } }, "frame");
  const b = item.browser;
  return (
    <div className="ss-stack">
      <SelectField label="Frame" value={item.presetId} options={options} onChange={setPreset} />
      {onApplyAll ? <Button size="sm" variant="ghost" onClick={() => onApplyAll(item.presetId)}>Apply this frame to all</Button> : null}
      {preset && preset.orientations.length > 1 ? <Segmented label="Orientation" value={item.orientation} options={preset.orientations.map((o) => ({ value: o, label: o === "portrait" ? "Portrait" : "Landscape" }))} onChange={(v) => patchItem(item.id, { orientation: v }, "orient")} /> : null}
      {preset?.kind !== "browser" ? <Segmented label="Screenshot fit" value={item.fit} options={[{ value: "auto", label: "Auto" }, { value: "cover", label: "Fill" }, { value: "contain", label: "Fit" }]} onChange={(v) => patchItem(item.id, { fit: v }, "fit")} /> : null}
      {preset?.kind !== "browser" ? <p className="ss-hint">Auto fills the screen when proportions match and letterboxes otherwise. Fill crops; Fit shows everything.</p> : null}
      {adv && item.fit !== "cover" && preset?.kind !== "browser" ? <ColorInput label="Letterbox colour" value={item.letterbox} onChange={(v) => patchItem(item.id, { letterbox: v }, "letterbox")} /> : null}
      {adv && preset && preset.camera !== "none" && preset.kind !== "browser" ? <Toggle label="Show camera cut-out" checked={item.showCamera} onChange={(v) => patchItem(item.id, { showCamera: v }, "camera")} /> : null}
      {preset?.kind === "browser" ? (
        <>
          <Toggle label="Show browser toolbar" checked={b.showChrome} onChange={(v) => patchItem(item.id, { browser: { ...b, showChrome: v } }, "chrome")} />
          <Segmented label="Appearance" value={b.appearance} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} onChange={(v) => patchItem(item.id, { browser: { ...b, appearance: v } }, "appearance")} />
          <TextInput label="Address text (display only)" value={b.address} maxLength={160} placeholder="Optional" onChange={(v) => patchItem(item.id, { browser: { ...b, address: v } }, "address")} />
          {adv ? <><TextInput label="Tab title" value={b.tabTitle} maxLength={80} placeholder="Optional" onChange={(v) => patchItem(item.id, { browser: { ...b, tabTitle: v } }, "tabtitle")} />
            <Toggle label="Show tab strip" checked={b.showTabs} onChange={(v) => patchItem(item.id, { browser: { ...b, showTabs: v } }, "tabs")} />
            <Segmented label="Window controls" value={b.controls} options={[{ value: "mac", label: "macOS" }, { value: "windows", label: "Windows" }, { value: "none", label: "None" }]} onChange={(v) => patchItem(item.id, { browser: { ...b, controls: v } }, "controls")} /></> : null}
          <p className="ss-hint">The address is drawn as text only. Nothing is loaded or opened.</p>
        </>
      ) : null}
      <details className="ss-sub"><summary>About this frame</summary><p className="ss-hint">{cfg.info.note}</p></details>
    </div>
  );
}

/* ---------------------------------------------------------------- style */
export function StylePanel({ ctx }: { ctx: PanelCtx }) {
  const { scene, edit, adv, item } = ctx, st = scene.style, framed = !!item && item.presetId !== NO_FRAME;
  return (
    <div className="ss-stack">
      {framed ? <Note>Corner radius follows the device frame. Choose “No frame” in the Frame section to round the screenshot itself.</Note> : null}
      <Slider label="Corner radius" value={st.radius} min={0} max={160} unit="px" onChange={(v) => edit((s) => ({ ...s, style: { ...s.style, radius: v } }), "radius")} />
      {adv ? <><Toggle label="Border" checked={st.borderEnabled} onChange={(v) => edit((s) => ({ ...s, style: { ...s.style, borderEnabled: v } }))} />
        {st.borderEnabled ? <><Slider label="Border width" value={st.borderWidth} min={1} max={24} unit="px" onChange={(v) => edit((s) => ({ ...s, style: { ...s.style, borderWidth: v } }), "bw")} />
          <ColorInput label="Border colour" value={st.borderColor} onChange={(v) => edit((s) => ({ ...s, style: { ...s.style, borderColor: v } }), "bc")} />
          <Slider label="Border opacity" value={Math.round(st.borderOpacity * 100)} min={0} max={100} unit="%" onChange={(v) => edit((s) => ({ ...s, style: { ...s.style, borderOpacity: v / 100 } }), "bo")} /></> : null}</> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- layout */
export function LayoutPanel({ ctx }: { ctx: PanelCtx }) {
  const { cfg, scene, edit, item, patchItem, adv, layout } = ctx, c = scene.canvas, wf = cfg.workflow, showCanvas = wf !== "frame";
  const cp = c.mode === "preset" ? getCanvasPreset(c.presetId) : undefined;
  const presetOptions = CANVAS_PRESETS.filter((p) => p.group === "generic" || p.group === cfg.family).map((p) => ({ value: p.id, label: p.label, group: p.group === "generic" ? "Generic" : p.group === "app-store" ? "App Store" : "Google Play" }));
  const setPreset = (id: string) => { const p = getCanvasPreset(id); if (p) edit((sc) => ({ ...sc, canvas: { mode: "preset", presetId: id, width: p.width, height: p.height } })); };
  const rot = wf === "mockup" || wf === "presentation" || adv;
  return (
    <div className="ss-stack">
      {showCanvas ? <Segmented label="Canvas" value={c.mode} options={[{ value: "auto", label: "Fit to content" }, { value: "preset", label: "Preset size" }, { value: "custom", label: "Custom" }]} onChange={(v) => edit((s) => ({ ...s, canvas: { ...s.canvas, mode: v, width: v === "custom" ? layout.width : s.canvas.width, height: v === "custom" ? layout.height : s.canvas.height } }))} /> : null}
      {showCanvas && c.mode === "preset" ? <SelectField label="Preset size" value={c.presetId} options={presetOptions} onChange={setPreset} /> : null}
      {cp?.sourceUrl ? <Note tone={cp.verification === "official-page" ? "ok" : "info"}>{cp.verification === "official-page" ? "Size listed on the official store page" : "Size checked against secondary sources; confirm in the store console"} (checked {cp.lastVerified}). No transparency allowed. <a href={cp.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a>{cp.note ? ` ${cp.note}` : ""}</Note> : null}
      {showCanvas && c.mode === "custom" ? <div className="ss-grid2"><NumberInput label="Width" value={c.width} min={16} max={12000} unit="px" onChange={(v) => edit((s) => ({ ...s, canvas: { ...s.canvas, width: v } }), "cw")} /><NumberInput label="Height" value={c.height} min={16} max={12000} unit="px" onChange={(v) => edit((s) => ({ ...s, canvas: { ...s.canvas, height: v } }), "ch")} /></div> : null}
      {showCanvas && c.mode === "custom" ? <Button size="sm" variant="ghost" onClick={() => edit((s) => ({ ...s, canvas: { ...s.canvas, width: s.canvas.height, height: s.canvas.width } }))}>Swap width and height</Button> : null}
      {showCanvas ? <Slider label="Padding" value={scene.padding.x} min={0} max={400} unit="px" onChange={(v) => edit((s) => ({ ...s, padding: { ...s.padding, x: v, y: s.padding.linked ? v : s.padding.y } }), "pad")} /> : null}
      {adv && showCanvas ? <><Toggle label="Link padding sides" checked={scene.padding.linked} onChange={(v) => edit((s) => ({ ...s, padding: { ...s.padding, linked: v, y: v ? s.padding.x : s.padding.y } }))} />
        {!scene.padding.linked ? <Slider label="Vertical padding" value={scene.padding.y} min={0} max={400} unit="px" onChange={(v) => edit((s) => ({ ...s, padding: { ...s.padding, y: v } }), "pady")} /> : null}</> : null}
      {item ? <Slider label="Size" value={Math.round(item.scale * 100)} min={20} max={200} unit="%" onChange={(v) => patchItem(item.id, { scale: v / 100 }, "scale")} /> : null}
      {item && rot ? <Slider label="Rotation" value={item.rotation} min={-45} max={45} unit="°" onChange={(v) => patchItem(item.id, { rotation: v }, "rot")} /> : null}
      {item && adv ? <><div className="ss-grid2"><NumberInput label="Offset X" value={item.x} unit="px" onChange={(v) => patchItem(item.id, { x: v }, "ox")} /><NumberInput label="Offset Y" value={item.y} unit="px" onChange={(v) => patchItem(item.id, { y: v }, "oy")} /></div>
        <div className="ss-btnrow"><Button size="sm" variant="ghost" onClick={() => patchItem(item.id, { x: 0, y: 0, rotation: 0, scale: 1 })}>Reset placement</Button></div></> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- background */
export function BackgroundPanel({ ctx, onBgFile, hasBgImage }: { ctx: PanelCtx; onBgFile: (f: File) => void; hasBgImage: boolean }) {
  const { scene, edit, adv } = ctx, bg = scene.background, input = useRef<HTMLInputElement>(null);
  const set = (spec: BackgroundSpec, key?: string) => edit((s) => ({ ...s, background: spec }), key);
  const grad = bg.kind === "linear" ? bg : { kind: "linear" as const, angle: 135, stops: [{ offset: 0, color: "#dbeafe" }, { offset: 1, color: "#e0e7ff" }] };
  return (
    <div className="ss-stack">
      <div><span className="ss-label">Presets</span>
        <div className="ss-swatches">{BACKDROP_PRESETS.map((p) => (<button key={p.id} type="button" className={`ss-swatch${p.spec.kind === "transparent" ? " ss-checker" : ""}`} style={{ background: bgCss(p.spec) }} title={p.label} aria-label={p.label} onClick={() => set(p.spec)} />))}</div></div>
      {adv ? (
        <>
          <Segmented label="Type" value={bg.kind} options={[{ value: "transparent", label: "None" }, { value: "solid", label: "Solid" }, { value: "linear", label: "Gradient" }, { value: "image", label: "Image" }]}
            onChange={(k) => set(k === "transparent" ? { kind: "transparent" } : k === "solid" ? { kind: "solid", color: bg.kind === "solid" ? bg.color : "#f5f5f7" } : k === "linear" ? grad : { kind: "image", imageId: "bg", fit: "cover", color: "#ffffff" })} />
          {bg.kind === "solid" ? <ColorInput label="Colour" value={bg.color} onChange={(v) => set({ kind: "solid", color: v }, "bgc")} /> : null}
          {bg.kind === "linear" ? <>
            <Slider label="Angle" value={bg.angle} min={0} max={360} unit="°" onChange={(v) => set({ ...bg, angle: v }, "bga")} />
            <ColorInput label="Start colour" value={bg.stops[0]?.color ?? "#ffffff"} onChange={(v) => set({ ...bg, stops: [{ offset: 0, color: v }, bg.stops[1] ?? { offset: 1, color: "#ffffff" }] }, "bg0")} />
            <ColorInput label="End colour" value={bg.stops[bg.stops.length - 1]?.color ?? "#ffffff"} onChange={(v) => set({ ...bg, stops: [bg.stops[0] ?? { offset: 0, color: "#ffffff" }, { offset: 1, color: v }] }, "bg1")} /></> : null}
          {bg.kind === "image" ? <>
            <div className="ss-btnrow"><Button size="sm" variant="outline" onClick={() => input.current?.click()}>{hasBgImage ? "Replace image" : "Choose image"}</Button></div>
            <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onBgFile(f); }} />
            <Segmented label="Image fit" value={bg.fit} options={[{ value: "cover", label: "Fill" }, { value: "contain", label: "Fit" }]} onChange={(v) => set({ ...bg, fit: v }, "bgf")} />
            {bg.fit === "contain" ? <ColorInput label="Behind image" value={bg.color} onChange={(v) => set({ ...bg, color: v }, "bgcol")} /> : null}</> : null}
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- shadow */
export function ShadowPanel({ ctx }: { ctx: PanelCtx }) {
  const { scene, edit, adv } = ctx, s = scene.shadow, set = (p: Partial<typeof s>, key?: string) => edit((sc) => ({ ...sc, shadow: { ...sc.shadow, ...p } }), key);
  return (
    <div className="ss-stack">
      <Toggle label="Drop shadow" checked={s.enabled} onChange={(v) => set({ enabled: v, ...(v && s.blur === 0 ? { blur: DEFAULT_SHADOW.blur } : {}) })} />
      {s.enabled ? <>
        <Slider label="Strength" value={Math.round(s.opacity * 100)} min={0} max={100} unit="%" onChange={(v) => set({ opacity: v / 100 }, "so")} />
        {adv ? <>
          <Slider label="Softness" value={s.blur} min={0} max={160} unit="px" onChange={(v) => set({ blur: v }, "sb")} />
          <div className="ss-grid2"><NumberInput label="Offset X" value={s.offsetX} unit="px" onChange={(v) => set({ offsetX: v }, "sx")} /><NumberInput label="Offset Y" value={s.offsetY} unit="px" onChange={(v) => set({ offsetY: v }, "sy")} /></div>
          <Slider label="Spread" value={s.spread} min={0} max={80} unit="px" onChange={(v) => set({ spread: v }, "ss")} />
          <ColorInput label="Colour" value={s.color} onChange={(v) => set({ color: v }, "sc")} />
          <Segmented label="Style" value={s.style} options={[{ value: "outer", label: "Outer" }, { value: "inner", label: "Inner" }]} onChange={(v) => set({ style: v })} /></> : null}
      </> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- headline */
export function HeadlinePanel({ ctx }: { ctx: PanelCtx }) {
  const { scene, edit, adv } = ctx, h = scene.headline, set = (p: Partial<typeof h>, key?: string) => edit((s) => ({ ...s, headline: { ...s.headline, ...p } }), key);
  return (
    <div className="ss-stack">
      <Toggle label="Show headline" checked={h.enabled} onChange={(v) => set({ enabled: v })} />
      {h.enabled ? <>
        <TextInput label="Headline" value={h.title} multiline maxLength={120} placeholder="Type your headline" onChange={(v) => set({ title: v }, "ht")} />
        <TextInput label="Subtitle" value={h.subtitle} multiline maxLength={200} placeholder="Optional supporting line" onChange={(v) => set({ subtitle: v }, "hs")} />
        <Segmented label="Position" value={h.position} options={[{ value: "top", label: "Above device" }, { value: "bottom", label: "Below device" }]} onChange={(v) => set({ position: v })} />
        {adv ? <>
          <Segmented label="Alignment" value={h.align} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} onChange={(v) => set({ align: v })} />
          <Slider label="Headline size" value={h.titleSize} min={16} max={200} unit="px" onChange={(v) => set({ titleSize: v }, "hts")} />
          <Slider label="Subtitle size" value={h.subtitleSize} min={12} max={120} unit="px" onChange={(v) => set({ subtitleSize: v }, "hss")} />
          <Slider label="Text width" value={Math.round(h.maxWidth * 100)} min={30} max={100} unit="%" onChange={(v) => set({ maxWidth: v / 100 }, "hw")} />
          <ColorInput label="Headline colour" value={h.color} onChange={(v) => set({ color: v }, "hc")} /><ColorInput label="Subtitle colour" value={h.subtitleColor} onChange={(v) => set({ subtitleColor: v }, "hsc")} /></> : null}
        <p className="ss-hint">Text is drawn with your system font. Nothing is uploaded.</p>
      </> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- collage */
export function CollagePanel({ ctx, list, selectedItemId, onSelectItem, onRemoveItem, onMoveItem, sizes }: {
  ctx: PanelCtx; list: SourceEntry[]; selectedItemId: string | null; onSelectItem: (id: string) => void; onRemoveItem: (id: string) => void; onMoveItem: (id: string, dir: -1 | 1) => void; sizes: Record<string, { width: number; height: number }>;
}) {
  const { scene, edit, patchItem, adv } = ctx, sel = scene.items.find((i) => i.id === selectedItemId) ?? scene.items[0], byId = new Map(list.map((s) => [s.id, s]));
  const rearrange = (mode: CollageLayout) => edit((s: Scene) => arrangeItems(s, sizes, mode));
  const presets = CANVAS_PRESETS.filter((p) => p.group === "generic");
  return (
    <div className="ss-stack">
      {scene.items.length === 0 ? <Note>Add up to 12 screenshots with “Add screenshots” above.</Note> : (
        <ol className="ss-layers" aria-label="Screenshots in this collage">
          {scene.items.map((it, i) => { const src = it.imageId ? byId.get(it.imageId) : undefined; return (
            <li key={it.id} className={it.id === sel?.id ? "is-sel" : ""}>
              <button type="button" className="ss-layer-main" onClick={() => onSelectItem(it.id)} aria-pressed={it.id === sel?.id}>{src?.thumb ? <img src={src.thumb} alt="" /> : null}<span>{i + 1}. {src?.name ?? it.name}</span></button>
              <button type="button" className="ss-mini" aria-label="Move earlier" disabled={i === 0} onClick={() => onMoveItem(it.id, -1)}>↑</button>
              <button type="button" className="ss-mini" aria-label="Move later" disabled={i === scene.items.length - 1} onClick={() => onMoveItem(it.id, 1)}>↓</button>
              <button type="button" className="ss-mini" aria-label={it.visible ? "Hide" : "Show"} aria-pressed={!it.visible} onClick={() => patchItem(it.id, { visible: !it.visible })}>{it.visible ? "Hide" : "Show"}</button>
              <button type="button" className="ss-mini ss-mini-danger" aria-label={`Remove ${src?.name ?? it.name}`} onClick={() => onRemoveItem(it.id)}>✕</button>
            </li>); })}
        </ol>
      )}
      <Segmented label="Arrange" value={scene.collage.layout} options={[{ value: "row", label: "Row" }, { value: "column", label: "Column" }, { value: "grid", label: "Grid" }, { value: "overlap", label: "Overlap" }]} onChange={rearrange} />
      <Slider label="Spacing" value={scene.collage.gap} min={0} max={200} unit="px" onChange={(v) => edit((s) => arrangeItems({ ...s, collage: { ...s.collage, gap: v } }, sizes, s.collage.layout), "gap")} />
      {scene.collage.layout === "grid" ? <Slider label="Columns" value={scene.collage.columns} min={1} max={6} onChange={(v) => edit((s) => arrangeItems({ ...s, collage: { ...s.collage, columns: v } }, sizes, "grid"), "cols")} /> : null}
      <SelectField label="Canvas size" value={ctx.scene.canvas.presetId} options={presets.map((p) => ({ value: p.id, label: p.label }))} onChange={(id) => { const p = presets.find((x) => x.id === id); if (p) edit((s) => arrangeItems({ ...s, canvas: { mode: "custom", presetId: id, width: p.width, height: p.height } }, sizes, s.collage.layout)); }} />
      <Slider label="Padding" value={scene.padding.x} min={0} max={300} unit="px" onChange={(v) => edit((s) => arrangeItems({ ...s, padding: { ...s.padding, x: v, y: v } }, sizes, s.collage.layout), "cpad")} />
      {sel ? <>
        <p className="ss-label">Selected: {byId.get(sel.imageId ?? "")?.name ?? sel.name}</p>
        <Slider label="Size" value={Math.round(sel.scale * 100)} min={10} max={300} unit="%" onChange={(v) => patchItem(sel.id, { scale: v / 100 }, "cs")} />
        <Slider label="Rotation" value={sel.rotation} min={-45} max={45} unit="°" onChange={(v) => patchItem(sel.id, { rotation: v }, "cr")} />
        {adv ? <div className="ss-grid2"><NumberInput label="X" value={sel.x} unit="px" onChange={(v) => patchItem(sel.id, { x: v }, "cx")} /><NumberInput label="Y" value={sel.y} unit="px" onChange={(v) => patchItem(sel.id, { y: v }, "cy")} /></div> : null}
        <p className="ss-hint">Drag a device in the preview to reposition it; arrow keys nudge the selected one. Changing “Arrange” re-flows everything, and Undo restores your positions.</p></> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- lock screen */
export function LockPanel({ ctx }: { ctx: PanelCtx }) {
  const { scene, edit } = ctx, l = scene.lock, set = (p: Partial<typeof l>, key?: string) => edit((s) => ({ ...s, lock: { ...s.lock, ...p } }), key);
  const setN = (id: string, p: Partial<(typeof l.notifications)[number]>, key: string) => set({ notifications: l.notifications.map((n) => (n.id === id ? { ...n, ...p } : n)) }, key);
  return (
    <div className="ss-stack">
      <Note>Your screenshot or wallpaper is the lock-screen background. The clock and notifications below are editable presentation text, not a captured system state.</Note>
      <Toggle label="Show date and time" checked={l.showTime} onChange={(v) => set({ showTime: v })} />
      {l.showTime ? <><TextInput label="Time" value={l.time} maxLength={12} onChange={(v) => set({ time: v }, "lt")} /><TextInput label="Date" value={l.date} maxLength={60} onChange={(v) => set({ date: v }, "ld")} /></> : null}
      <Segmented label="Text style" value={l.appearance} options={[{ value: "light", label: "Light text" }, { value: "dark", label: "Dark text" }]} onChange={(v) => set({ appearance: v })} />
      {l.notifications.map((n, i) => (
        <fieldset key={n.id} className="ss-fieldset"><legend>Notification {i + 1}</legend>
          <TextInput label="App name" value={n.app} maxLength={40} onChange={(v) => setN(n.id, { app: v }, `na${n.id}`)} /><TextInput label="Title" value={n.title} maxLength={80} onChange={(v) => setN(n.id, { title: v }, `nt${n.id}`)} /><TextInput label="Message" value={n.body} maxLength={160} onChange={(v) => setN(n.id, { body: v }, `nb${n.id}`)} />
          <Button size="sm" variant="ghost" onClick={() => set({ notifications: l.notifications.filter((x) => x.id !== n.id) })}>Remove notification</Button></fieldset>))}
      {l.notifications.length < 3 ? <Button size="sm" variant="outline" onClick={() => set({ notifications: [...l.notifications, { id: `n${Date.now()}`, app: "", title: "", body: "" }] })}>Add notification</Button> : null}
    </div>
  );
}
