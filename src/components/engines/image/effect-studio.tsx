/** One studio for every adjust / filter / frame tool: declarative controls, instant preview, full-resolution refinement, compare, undo/redo, export. */
import { useEffect, useMemo, useRef, useState } from "react";
import { ImageToolError, errorMessage, fullCanvas, proxyCanvas, toDrawable, yieldToUi, type Drawable, type SourceImage } from "@/lib/image/canvas";
import { CompareView } from "./compare";
import { EFFECT_SPECS, defaultsOf, type Ctl, type EffectSpec, type Values } from "./effect-specs";
import { ExportPanel } from "./export-panel";
import { SourceGate, useSource } from "./use-source";
import { Chips, ColorField, HistoryBar, Notice, Section, Seg, Slider, Stat, Toggle, useSettings } from "./ui";

function Control({ c, values, set }: { c: Ctl; values: Values; set: (p: Values, key?: string) => void }) {
  if (c.show && !c.show(values)) return null;
  const v = values[c.id];
  switch (c.kind) {
    case "range": return <Slider label={c.label} value={Number(v)} min={c.min ?? 0} max={c.max ?? 100} step={c.step} unit={c.unit} def={Number(c.def)} hint={c.hint} onChange={(x) => set({ [c.id]: x }, c.id)} />;
    case "seg": return <Seg label={c.label} value={String(v)} options={c.options ?? []} hint={c.hint} onChange={(x) => set({ [c.id]: x })} />;
    case "toggle": return <Toggle label={c.label} checked={Boolean(v)} hint={c.hint} onChange={(x) => set({ [c.id]: x })} />;
    case "color": return <ColorField label={c.label} value={String(v)} allowTransparent={c.transparent} onChange={(x) => set({ [c.id]: x }, c.id)} />;
    default: return null;
  }
}

function Workspace({ source, spec, toolId }: { source: SourceImage; spec: EffectSpec; toolId: string }) {
  const settings = useSettings<Values>(useMemo(() => defaultsOf(spec), [spec]));
  const { values, set } = settings;
  const proxy = useMemo(() => proxyCanvas(source), [source]);
  const [before, setBefore] = useState<Drawable>(() => toDrawable(proxy.canvas));
  const [after, setAfter] = useState<Drawable | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exact, setExact] = useState(false);
  const token = useRef(0);
  const canRefine = proxy.scale < 1 && source.width * source.height <= 24_000_000;

  useEffect(() => {
    const id = ++token.current; setBusy(true); setExact(proxy.scale >= 1);
    const quick = setTimeout(() => {
      try { const out = spec.run(proxy.canvas, values, proxy.scale); if (id !== token.current) return; setBefore(toDrawable(proxy.canvas)); setAfter(toDrawable(out)); setError(null); setBusy(canRefine); }
      catch (e) { if (id === token.current) { setError(errorMessage(e, "This setting couldn't be applied.")); setBusy(false); } }
    }, 0);
    const refine = canRefine ? setTimeout(async () => {
      if (id !== token.current) return;
      try {
        await yieldToUi(); if (id !== token.current) return;
        const full = fullCanvas(source); const out = spec.run(full, values, 1);
        if (id !== token.current) return; setBefore(toDrawable(full)); setAfter(toDrawable(out)); setExact(true); setBusy(false);
      } catch (e) { if (id === token.current) { setError(errorMessage(e, "The full-size preview couldn't be created.")); setBusy(false); } }
    }, 650) : undefined;
    return () => { clearTimeout(quick); if (refine) clearTimeout(refine); };
  }, [values, spec, proxy, source, canRefine]);

  const groups = useMemo(() => {
    const order = ["", ...(spec.groups?.map((g) => g.id) ?? [])];
    for (const c of spec.controls) if (c.group && !order.includes(c.group)) order.push(c.group);
    return order.map((g) => ({ id: g, controls: spec.controls.filter((c) => (c.group ?? "") === g) })).filter((g) => g.controls.length);
  }, [spec]);
  const dirty = JSON.stringify(values) !== JSON.stringify(settings.initial);
  const outW = after ? Math.round(after.width / (exact ? 1 : proxy.scale)) : null, outH = after ? Math.round(after.height / (exact ? 1 : proxy.scale)) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <CompareView before={before} after={after} busy={busy} note={exact ? "Showing the full-resolution result." : "Fast preview — the full-resolution result replaces it when you stop adjusting."} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Original" value={`${source.width} × ${source.height}`} />
          <Stat label="Result" value={outW && outH ? `${exact ? "" : "≈ "}${outW} × ${outH}` : "—"} />
          <Stat label="Preview" value={exact ? "Full resolution" : "Fast (downscaled)"} tone={exact ? "ok" : undefined} />
          <Stat label="Format" value={source.type.replace("image/", "").toUpperCase()} />
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
      <div className="space-y-4">
        <p className="text-sm text-muted">{spec.intro}</p>
        <HistoryBar canUndo={settings.canUndo} canRedo={settings.canRedo} onUndo={settings.undo} onRedo={settings.redo} onReset={() => settings.reset()} dirty={dirty} />
        {spec.presets?.length || spec.auto ? (
          <div className="space-y-2"><span className="text-[13px] font-medium text-fg">Quick starts</span>
            <div className="flex flex-wrap gap-1.5">
              {spec.auto ? <button type="button" className="min-h-8 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg" onClick={() => set(spec.auto!(proxy.canvas))}>{spec.autoLabel ?? "Auto"}</button> : null}
              <Chips items={(spec.presets ?? []).map((p) => ({ id: p.id, label: p.label }))} onPick={(id) => { const p = spec.presets!.find((x) => x.id === id)!; set({ ...defaultsOf(spec), ...p.values }); }} />
            </div></div>
        ) : null}
        {groups.map((g) => (
          <Section key={g.id || "main"} title={g.id || "Settings"} defaultOpen={spec.groups?.find((x) => x.id === g.id)?.open ?? true}>
            {g.controls.map((c) => <Control key={c.id} c={c} values={values} set={set} />)}
          </Section>
        ))}
        {spec.tips ? <Notice>{spec.tips}</Notice> : null}
        <ExportPanel source={source} toolId={toolId} suffix={spec.suffix} defaultFormat={spec.defaultFormat} deps={[values]} render={() => spec.run(fullCanvas(source), values, 1)} />
      </div>
    </div>
  );
}

export function EffectStudio({ op, toolId }: { op: string; toolId: string }) {
  const spec = EFFECT_SPECS[op.toLowerCase()];
  const state = useSource(toolId);
  if (!spec) throw new ImageToolError(`No settings are defined for “${op}”.`, "invalid");
  return <SourceGate toolId={toolId} state={state}>{(source) => <Workspace key={`${source.id}`} source={source} spec={spec} toolId={toolId} />}</SourceGate>;
}
