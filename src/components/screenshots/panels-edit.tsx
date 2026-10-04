import { Button } from "@/components/ui/button";
import { rgbaToHex } from "@/lib/screenshots/backgrounds";
import { isDestructive, isLineKind, isPathKind, type AnnotationKind, type AnnotationObject } from "@/lib/screenshots/annotations";
import { rgbToHsl } from "@/lib/screenshots/pixel-ops";
import type { ExportPlan, ExportSettings } from "@/lib/screenshots/export-plan";
import { FORMAT_INFO, type ExportFormat } from "@/lib/screenshots/export-plan";
import type { Rgba } from "@/lib/screenshots/types";
import { ColorInput, NumberInput, Note, Segmented, Slider, TextInput, Toggle } from "./controls";
import type { EditorTool } from "./editor-canvas";
import type { PanelCtx } from "./panel-types";
import { PALETTE_LABELS } from "./tool-palettes";

function ToolHint({ tool, onAddCentre }: { tool: EditorTool; onAddCentre: (k: AnnotationKind) => void }) {
  const label = PALETTE_LABELS[tool as AnnotationKind], placeable = !!label && tool !== "pen" && tool !== "highlighter";
  return (
    <div className="ss-stack">
      {placeable ? <div className="ss-btnrow"><Button size="sm" variant="outline" onClick={() => onAddCentre(tool as AnnotationKind)}>Place {label.toLowerCase()} in the centre</Button></div> : null}
      <p className="ss-hint">{label ? `Active tool: ${label}. Click or drag on the image to draw; hold Shift for straight lines and squares.` : "Choose a tool above the image, then draw on it. Select moves and resizes marks."}</p>
    </div>
  );
}

function Layers({ items, selectedId, onSelect, onDelete, onUpdate }: { items: AnnotationObject[]; selectedId: string | null; onSelect: (id: string) => void; onDelete: (id: string) => void; onUpdate: (o: AnnotationObject, key: string) => void }) {
  if (!items.length) return <p className="ss-hint">Nothing added yet.</p>;
  return (
    <ol className="ss-layers" aria-label="Marks, top-most last">
      {items.map((o) => (
        <li key={o.id} className={o.id === selectedId ? "is-sel" : ""}>
          <button type="button" className="ss-layer-main" onClick={() => onSelect(o.id)} aria-pressed={o.id === selectedId}><span>{o.name}{o.kind === "step" ? ` ${o.step}` : ""}{o.text && (o.kind === "text" || o.kind === "callout") ? ` · ${o.text.slice(0, 18)}` : ""}</span></button>
          <button type="button" className="ss-mini" aria-pressed={!o.visible} onClick={() => onUpdate({ ...o, visible: !o.visible }, `vis${o.id}`)}>{o.visible ? "Hide" : "Show"}</button>
          <button type="button" className="ss-mini" aria-pressed={o.locked} onClick={() => onUpdate({ ...o, locked: !o.locked }, `lock${o.id}`)}>{o.locked ? "Unlock" : "Lock"}</button>
          <button type="button" className="ss-mini ss-mini-danger" aria-label={`Delete ${o.name}`} onClick={() => onDelete(o.id)}>✕</button>
        </li>))}
    </ol>
  );
}

function ObjectProps({ o, onChange, onDelete, onDuplicate, onReorder, adv }: { o: AnnotationObject; onChange: (o: AnnotationObject, key: string) => void; onDelete: () => void; onDuplicate: () => void; onReorder: (to: "front" | "back") => void; adv: boolean }) {
  const up = (p: Partial<AnnotationObject>, k: string) => onChange({ ...o, ...p }, `${k}:${o.id}`);
  const textual = o.kind === "text" || o.kind === "callout", destructive = isDestructive(o), line = isLineKind(o.kind), path = isPathKind(o.kind);
  const hasStroke = ["arrow", "line", "rect", "ellipse", "pen", "highlighter", "measure", "callout", "text"].includes(o.kind), hasFill = ["rect", "ellipse", "text", "callout", "step"].includes(o.kind);
  return (
    <div className="ss-stack ss-props">
      <p className="ss-label">Selected: {o.name}</p>
      {destructive ? <>
        {o.kind === "redact" ? <ColorInput label="Fill colour" value={o.fill} onChange={(v) => up({ fill: v, stroke: v }, "rf")} /> : null}
        {o.kind === "blur" ? <Slider label="Blur radius" value={o.strength} min={2} max={80} unit="px" onChange={(v) => up({ strength: v }, "bl")} /> : null}
        {o.kind === "pixelate" ? <Slider label="Block size" value={o.strength} min={4} max={100} unit="px" onChange={(v) => up({ strength: v }, "px")} /> : null}
        {o.kind !== "redact" ? <Note tone="warn">Blur and pixelation reduce detail but are not guaranteed to make text unreadable. Use Solid to hide secrets.</Note> : null}
      </> : null}
      {o.kind === "spotlight" ? <Slider label="Dimming" value={Math.round(o.strength * 100)} min={10} max={95} unit="%" onChange={(v) => up({ strength: v / 100 }, "sp")} /> : null}
      {textual ? <><TextInput key={o.id} label="Text" value={o.text} multiline maxLength={300} autoFocus onChange={(v) => up({ text: v }, "tx")} /><Slider label="Text size" value={o.fontSize} min={10} max={120} unit="px" onChange={(v) => up({ fontSize: v }, "fs")} /><ColorInput label="Text colour" value={o.textColor} onChange={(v) => up({ textColor: v }, "tc")} /></> : null}
      {o.kind === "step" ? <><NumberInput label="Number" value={o.step} min={0} max={999} onChange={(v) => up({ step: Math.max(0, Math.round(v)) }, "sn")} /><Slider label="Size" value={o.width} min={24} max={200} unit="px" onChange={(v) => up({ width: v, height: v, fontSize: Math.round(v * 0.5) }, "ss")} /></> : null}
      {hasStroke && !destructive ? <ColorInput label={o.kind === "highlighter" ? "Colour" : "Line colour"} value={o.stroke} onChange={(v) => up({ stroke: v }, "sc")} /> : null}
      {hasStroke && !destructive && o.kind !== "text" ? <Slider label={path || line ? "Thickness" : "Line width"} value={o.strokeWidth} min={1} max={o.kind === "highlighter" ? 80 : 40} unit="px" onChange={(v) => up({ strokeWidth: v }, "sw")} /> : null}
      {hasFill ? <ColorInput label="Fill" value={o.fill} allowClear={o.kind !== "step"} onChange={(v) => up({ fill: v }, "fl")} /> : null}
      {adv && !destructive && o.kind !== "spotlight" ? <Slider label="Opacity" value={Math.round(o.opacity * 100)} min={5} max={100} unit="%" onChange={(v) => up({ opacity: v / 100 }, "op")} /> : null}
      {adv && (line || o.kind === "rect" || o.kind === "ellipse") ? <Segmented label="Line style" value={o.lineStyle} options={[{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }]} onChange={(v) => up({ lineStyle: v }, "ls")} /> : null}
      {adv && o.kind === "arrow" ? <Segmented label="Arrow head" value={o.arrowHead} options={[{ value: "triangle", label: "Filled" }, { value: "open", label: "Open" }, { value: "none", label: "None" }]} onChange={(v) => up({ arrowHead: v }, "ah")} /> : null}
      {adv && ["rect", "callout", "spotlight", "text"].includes(o.kind) ? <Slider label="Corner radius" value={o.radius} min={0} max={80} unit="px" onChange={(v) => up({ radius: v }, "rr")} /> : null}
      {adv && !destructive && !line && !path && o.kind !== "step" ? <Slider label="Rotation" value={o.rotation} min={-180} max={180} unit="°" onChange={(v) => up({ rotation: v }, "ro")} /> : null}
      <div className="ss-btnrow"><Button size="sm" variant="outline" onClick={onDuplicate}>Duplicate</Button><Button size="sm" variant="danger" onClick={onDelete}>Delete</Button>
        {adv ? <><Button size="sm" variant="ghost" onClick={() => onReorder("front")}>Bring to front</Button><Button size="sm" variant="ghost" onClick={() => onReorder("back")}>Send to back</Button></> : null}</div>
    </div>
  );
}

interface MarkProps { ctx: PanelCtx; tool: EditorTool; setTool: (t: EditorTool) => void; selectedId: string | null; setSelectedId: (id: string | null) => void; onAddCentre: (k: AnnotationKind) => void; onUpdate: (o: AnnotationObject, key: string) => void; onDelete: (id: string) => void; onDuplicate: (id: string) => void; onReorder: (id: string, to: "front" | "back") => void }

export function AnnotatePanel({ markColor, setMarkColor, ...p }: MarkProps & { markColor: string; setMarkColor: (c: string) => void }) {
  const items = p.ctx.scene.annotations.filter((o) => !isDestructive(o)), sel = items.find((o) => o.id === p.selectedId);
  return (
    <div className="ss-stack">
      <ToolHint tool={p.tool} onAddCentre={p.onAddCentre} />
      <ColorInput label="Colour for new marks" value={markColor} onChange={setMarkColor} />
      {sel ? <ObjectProps o={sel} adv={p.ctx.adv} onChange={p.onUpdate} onDelete={() => p.onDelete(sel.id)} onDuplicate={() => p.onDuplicate(sel.id)} onReorder={(to) => p.onReorder(sel.id, to)} /> : null}
      <Layers items={items} selectedId={p.selectedId} onSelect={p.setSelectedId} onDelete={p.onDelete} onUpdate={p.onUpdate} />
      <p className="ss-hint">Marks stay editable until you export. Shortcuts: Delete removes, arrow keys nudge, Ctrl/⌘+D duplicates, Esc deselects.</p>
    </div>
  );
}

export function RedactPanel(p: MarkProps) {
  const items = p.ctx.scene.annotations.filter(isDestructive), sel = items.find((o) => o.id === p.selectedId), crop = p.ctx.item?.crop;
  const outside = crop ? items.filter((o) => o.x < crop.x || o.y < crop.y || o.x + o.width > crop.x + crop.width || o.y + o.height > crop.y + crop.height).length : 0;
  return (
    <div className="ss-stack">
      <Note tone="warn">Redactions are editable here but permanently flattened into the exported file, so the hidden pixels are not recoverable from it. Keep your original screenshot if you need it.</Note>
      <ToolHint tool={p.tool} onAddCentre={p.onAddCentre} />
      {outside > 0 ? <Note tone="info">{outside} redaction{outside > 1 ? "s extend" : " extends"} outside your crop; the cropped-out area is not part of the export.</Note> : null}
      {sel ? <ObjectProps o={sel} adv={p.ctx.adv} onChange={p.onUpdate} onDelete={() => p.onDelete(sel.id)} onDuplicate={() => p.onDuplicate(sel.id)} onReorder={(to) => p.onReorder(sel.id, to)} /> : null}
      <Layers items={items} selectedId={p.selectedId} onSelect={p.setSelectedId} onDelete={p.onDelete} onUpdate={p.onUpdate} />
      <p className="ss-hint">{items.length} redaction{items.length === 1 ? "" : "s"} will be applied on export. File names and embedded metadata are not carried into the exported image.</p>
    </div>
  );
}

export interface PickInfo { x: number; y: number; rgba: Rgba }
export interface QrState { results: string[]; error: string | null; busy: boolean }

/** Colour readout. Shown beside the editor while the picker is active, and again in the Inspect panel. */
export function PickReadout({ pick, onCopy }: { pick: PickInfo | null; onCopy: (text: string) => void }) {
  if (!pick) return <p className="ss-hint">Click or drag over the image to read a colour. A magnifier shows the exact pixel.</p>;
  const hex = rgbaToHex(pick.rgba).toUpperCase(), hsl = rgbToHsl(pick.rgba), [r, g, b, a] = pick.rgba;
  return (
    <div className="ss-pick"><span className="ss-chip" style={{ background: hex }} aria-hidden="true" />
      <div><button type="button" className="ss-link" onClick={() => onCopy(hex)}>{hex}</button> · <button type="button" className="ss-link" onClick={() => onCopy(`rgb(${r}, ${g}, ${b})`)}>rgb({r}, {g}, {b})</button> · <button type="button" className="ss-link" onClick={() => onCopy(`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`)}>hsl({hsl.h}, {hsl.s}%, {hsl.l}%)</button>
        <br /><span className="ss-hint">Pixel {pick.x}, {pick.y}{a < 255 ? ` · alpha ${Math.round((a / 255) * 100)}%` : ""}. Click a value to copy it.</span></div></div>
  );
}

/** QR results. Links are never opened automatically: opening needs an explicit click and a confirmation. */
export function QrResults({ qr, onCopy }: { qr: QrState; onCopy: (text: string) => void }) {
  const openLink = (u: string) => { try { const url = new URL(u); if (!/^https?:$/.test(url.protocol)) return; if (window.confirm(`This opens an external website (${url.hostname}). Continue?`)) window.open(url.href, "_blank", "noopener,noreferrer"); } catch { /* not a URL */ } };
  return (
    <div className="ss-stack">{qr.busy ? <p className="ss-hint">Scanning…</p> : null}{qr.error ? <Note tone="danger">{qr.error}</Note> : null}
      {!qr.busy && !qr.error && qr.results.length === 0 ? <Note>No QR code found in that area.</Note> : null}
      {qr.results.map((r, i) => (<div key={`${i}-${r.slice(0, 20)}`} className="ss-qr"><code>{r.slice(0, 400)}</code><div className="ss-btnrow"><Button size="sm" variant="outline" onClick={() => onCopy(r)}>Copy</Button>{/^https?:\/\//i.test(r) ? <Button size="sm" variant="ghost" onClick={() => openLink(r)}>Open link…</Button> : null}</div></div>))}</div>
  );
}

export function InspectPanel({ ctx, tool, setTool, pick, onCopy, qr, canQr }: { ctx: PanelCtx; tool: EditorTool; setTool: (t: EditorTool) => void; pick: PickInfo | null; onCopy: (text: string) => void; qr: QrState | null; canQr: boolean }) {
  const src = ctx.source;
  return (
    <div className="ss-stack">
      <div className="ss-btnrow"><Button size="sm" variant="outline" aria-pressed={tool === "eyedropper"} onClick={() => setTool(tool === "eyedropper" ? "select" : "eyedropper")}>Colour picker</Button>
        {canQr ? <Button size="sm" variant="outline" aria-pressed={tool === "qr"} onClick={() => setTool(tool === "qr" ? "select" : "qr")}>Scan QR in area</Button> : null}</div>
      <PickReadout pick={pick} onCopy={onCopy} />
      {canQr ? null : <p className="ss-hint">QR scanning needs a browser with built-in barcode detection; it isn’t available here. Text recognition (OCR) isn’t included in this tool.</p>}
      {qr ? <QrResults qr={qr} onCopy={onCopy} /> : null}
      {src ? <dl className="ss-dl"><dt>File</dt><dd>{src.name}</dd><dt>Size</dt><dd>{src.width} × {src.height} px ({((src.width * src.height) / 1e6).toFixed(1)} MP)</dd><dt>Type</dt><dd>{src.mime}{src.hasAlpha ? " · transparency" : ""}</dd><dt>File size</dt><dd>{(src.bytes / 1024).toFixed(0)} KB</dd>{src.colorSpace ? <><dt>Colour space</dt><dd>{src.colorSpace}</dd></> : null}</dl> : null}
    </div>
  );
}

export type SizeChoice = "native" | "1" | "2" | "custom";
export function ExportPanel({ settings, setSettings, plan, sizeChoice, setSizeChoice, nativeScale, nativeCapped, scaleLocked, lockNote, adv, busy, disabled, webpOk, canShare, canCopy, onDownload, onCopy, onShare, formatNote }: {
  settings: ExportSettings; setSettings: (fn: (s: ExportSettings) => ExportSettings) => void; plan: ExportPlan; sizeChoice: SizeChoice; setSizeChoice: (c: SizeChoice) => void; nativeScale: number; nativeCapped: boolean; scaleLocked: boolean; lockNote: string;
  adv: boolean; busy: boolean; disabled: boolean; webpOk: boolean; canShare: boolean; canCopy: boolean; onDownload: () => void; onCopy: () => void; onShare: () => void; formatNote: string | null;
}) {
  const info = FORMAT_INFO[settings.format];
  return (
    <div className="ss-stack">
      <Segmented<ExportFormat> label="Format" value={settings.format} options={[{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP", disabled: !webpOk }, { value: "pdf", label: "PDF" }]} onChange={(v) => setSettings((s) => ({ ...s, format: v }))} />
      {info.lossy ? <Slider label="Quality" value={Math.round(settings.quality * 100)} min={30} max={100} unit="%" onChange={(v) => setSettings((s) => ({ ...s, quality: v / 100 }))} /> : <p className="ss-hint">{settings.format === "png" ? "PNG is lossless and keeps transparency." : "One page, sized to the image at 96 dpi."}</p>}
      {scaleLocked ? <Note tone="info">{lockNote}</Note> : (
        <Segmented<SizeChoice> label="Size" value={sizeChoice} options={[{ value: "native", label: `Native ×${nativeScale}` }, { value: "1", label: "1×" }, { value: "2", label: "2×" }, { value: "custom", label: "Custom" }]} onChange={(v) => { setSizeChoice(v); if (v === "custom") setSettings((s) => ({ ...s, sizeMode: "custom", width: plan.width, height: plan.height })); else setSettings((s) => ({ ...s, sizeMode: "scale", scale: v === "native" ? nativeScale : Number(v) })); }} />
      )}
      {!scaleLocked && sizeChoice === "native" && nativeCapped ? <p className="ss-hint">Limited to 16 megapixels so the export works on every device, including phones; the screenshot is a little below its native resolution. Choose Custom for a larger file.</p> : null}
      {!scaleLocked && sizeChoice === "custom" ? <div className="ss-grid2"><NumberInput label="Width" value={settings.width} min={1} unit="px" onChange={(v) => setSettings((s) => ({ ...s, width: v }))} /><NumberInput label="Height" value={settings.lockAspect ? plan.height : settings.height} min={1} unit="px" disabled={settings.lockAspect} onChange={(v) => setSettings((s) => ({ ...s, height: v }))} /></div> : null}
      {!scaleLocked && sizeChoice === "custom" ? <Toggle label="Lock aspect ratio" checked={settings.lockAspect} onChange={(v) => setSettings((s) => ({ ...s, lockAspect: v }))} /> : null}
      {plan.flattenColor ? <ColorInput label="Fill for transparent areas" value={settings.flattenColor} onChange={(v) => setSettings((s) => ({ ...s, flattenColor: v }))} /> : null}
      {adv ? <TextInput label="File name (optional)" value={settings.filename} maxLength={60} placeholder="Derived from the screenshot" onChange={(v) => setSettings((s) => ({ ...s, filename: v }))} /> : null}
      <p className="ss-summary" aria-live="polite"><strong>{plan.width.toLocaleString()} × {plan.height.toLocaleString()} px</strong> · {info.label}{plan.ok ? "" : " · too large"}<br /><span className="ss-hint">{plan.filename}</span></p>
      {plan.error ? <Note tone="danger">{plan.error}</Note> : null}
      {[...plan.warnings, ...(formatNote ? [formatNote] : [])].map((w, i) => <Note key={`${i}-${w}`} tone="warn">{w}</Note>)}
      <div className="ss-actions">
        <Button size="lg" onClick={onDownload} disabled={disabled || busy || !plan.ok}>{busy ? "Exporting…" : "Download"}</Button>
        <Button variant="outline" onClick={onCopy} disabled={disabled || busy || !canCopy || !plan.ok} title={canCopy ? "Copies a PNG" : "Image copy isn’t supported in this browser"}>Copy image</Button>
        {canShare ? <Button variant="outline" onClick={onShare} disabled={disabled || busy || !plan.ok}>Share</Button> : null}
      </div>
    </div>
  );
}
