/** One studio for every platform image tool: verified preset → automatic composition → drag/zoom/position → size-capped export. */
import { useEffect, useMemo, useRef, useState } from "react";
import { canvasFrom, ctxOf, fullCanvas, makeCanvas, proxyCanvas, readPixels, scaledCanvas, type SourceImage } from "@/lib/image/canvas";
import { ANCHORS, anchorFractions, clamp, computePlacement, exactRatio, nearestCommonRatio, panPosition, type Anchor } from "@/lib/image/geometry";
import { PLATFORMS, PLATFORM_IDS, getPlacement, parsePlatformOp, placementsFor, SPEC_VERIFIED_ON, type PlacementId, type PlatformId } from "@/lib/image/platform-presets";
import { detailCentroid, gaussianBlur } from "@/lib/image/pixels";
import { resizeRGBA } from "@/lib/image/resample";
import { ExportPanel } from "./export-panel";
import { SourceGate, useSource } from "./use-source";
import { Btn, ColorField, HistoryBar, Notice, Num, Section, Seg, Select, Slider, Stat, Toggle, useSettings } from "./ui";

export interface FrameV { fit: "fill" | "fit"; zoom: number; posX: number; posY: number; bgMode: "blur" | "color" | "transparent"; bg: string; showSafe: boolean; showClear: boolean; showShape: boolean }
interface V { platform: PlatformId; placement: PlacementId; variant: number; custom: boolean; cw: number; ch: number; fit: "fill" | "fit"; zoom: number; posX: number; posY: number; bgMode: "blur" | "color" | "transparent"; bg: string; showSafe: boolean; showClear: boolean; showShape: boolean; underLimit: boolean }

/** Final composition at exact output size (Lanczos), shared by the live preview scale and export. */
export function renderPlatform(src: HTMLCanvasElement, v: FrameV, outW: number, outH: number): HTMLCanvasElement {
  const fill = v.fit === "fill";
  const place = computePlacement({ width: src.width, height: src.height }, { width: outW, height: outH }, { fit: fill ? "cover" : "contain", posX: v.posX, posY: v.posY, zoom: fill ? Math.max(1, v.zoom) : clamp(v.zoom, 0.05, 1) });
  const out = makeCanvas(outW, outH); const ctx = ctxOf(out);
  if (!fill) {
    if (v.bgMode === "color") { ctx.fillStyle = v.bg; ctx.fillRect(0, 0, outW, outH); }
    else if (v.bgMode === "blur") {
      const small = scaledCanvas(src, src.width, src.height, Math.max(8, Math.round(outW / 8)), Math.max(8, Math.round(outH / 8)));
      const p = readPixels(small);
      // cover-fit the tiny copy into the small box first so the blur background fills the frame
      const sw = small.width, sh = small.height; const bgc = makeCanvas(sw, sh); const bctx = ctxOf(bgc);
      const cover = computePlacement({ width: src.width, height: src.height }, { width: sw, height: sh }, { fit: "cover" });
      bctx.drawImage(src, cover.sourceRect.x, cover.sourceRect.y, cover.sourceRect.width, cover.sourceRect.height, 0, 0, sw, sh);
      const q = readPixels(bgc); gaussianBlur(q.data, sw, sh, Math.max(2, sw / 30)); ctxOf(bgc).putImageData(q, 0, 0);
      ctx.imageSmoothingQuality = "high"; ctx.drawImage(bgc, 0, 0, outW, outH); void p;
    }
    const dw = Math.max(1, Math.round(place.dest.width)), dh = Math.max(1, Math.round(place.dest.height));
    const body = canvasFrom(resizeRGBA(readPixels(src).data, src.width, src.height, dw, dh, "lanczos3"), dw, dh);
    ctx.drawImage(body, Math.round(place.dest.x), Math.round(place.dest.y));
    return out;
  }
  const r = place.sourceRect; const cw = Math.max(1, Math.round(r.width)), ch = Math.max(1, Math.round(r.height));
  const crop = makeCanvas(cw, ch); ctxOf(crop).drawImage(src, Math.round(r.x), Math.round(r.y), cw, ch, 0, 0, cw, ch);
  return canvasFrom(resizeRGBA(readPixels(crop).data, cw, ch, outW, outH, "lanczos3"), outW, outH);
}

export function FrameEditor({ source, v, outW, outH, onPan, onZoom, safe, clear, circle, shapeGuide }: { shapeGuide?: string; source: SourceImage; v: FrameV; outW: number; outH: number; onPan: (x: number, y: number) => void; onZoom: (z: number) => void; safe?: { x: number; y: number; width: number; height: number; label: string }; clear?: { x: number; y: number; width: number; height: number; label: string }[]; circle: boolean }) {
  const wrap = useRef<HTMLDivElement>(null); const cv = useRef<HTMLCanvasElement>(null);
  const [cw, setCw] = useState(360); const pointers = useRef(new Map<number, { x: number; y: number }>());
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setCw(Math.max(160, el.clientWidth))); ro.observe(el); setCw(Math.max(160, el.clientWidth)); return () => ro.disconnect(); }, []);
  const maxH = typeof window === "undefined" ? 520 : Math.min(560, window.innerHeight * 0.6);
  const scale = Math.min(cw / outW, maxH / outH); const dw = Math.max(40, Math.round(outW * scale)), dh = Math.max(40, Math.round(outH * scale));
  const fill = v.fit === "fill";
  const place = useMemo(() => computePlacement({ width: source.width, height: source.height }, { width: outW, height: outH }, { fit: fill ? "cover" : "contain", posX: v.posX, posY: v.posY, zoom: fill ? Math.max(1, v.zoom) : clamp(v.zoom, 0.05, 1) }), [source, outW, outH, fill, v.posX, v.posY, v.zoom]);
  const blurBg = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => { // cheap blurred backdrop for the preview only
    if (fill || v.bgMode !== "blur") { blurBg.current = null; return; }
    const c = scaledCanvas(source.bitmap, source.width, source.height, 48, Math.max(8, Math.round(48 * outH / outW))); const p = readPixels(c); gaussianBlur(p.data, c.width, c.height, 3); c.getContext("2d")!.putImageData(p, 0, 0); blurBg.current = c;
  }, [source, fill, v.bgMode, outW, outH]);
  useEffect(() => {
    const c = cv.current; if (!c) return; const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(dw * dpr); c.height = Math.round(dh * dpr); const ctx = c.getContext("2d")!; ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0); ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#d9dde3"; ctx.fillRect(0, 0, outW, outH);
    if (!fill) { if (v.bgMode === "color") { ctx.fillStyle = v.bg; ctx.fillRect(0, 0, outW, outH); } else if (v.bgMode === "blur" && blurBg.current) ctx.drawImage(blurBg.current, 0, 0, outW, outH); }
    ctx.drawImage(source.bitmap, place.dest.x, place.dest.y, place.dest.width, place.dest.height);
    const dash = Math.max(2, 3 / scale);
    if (v.showClear) for (const z of clear ?? []) { ctx.fillStyle = "rgba(220,38,38,.22)"; ctx.fillRect(z.x * outW, z.y * outH, z.width * outW, z.height * outH); }
    if (v.showSafe && safe) { ctx.save(); ctx.strokeStyle = "#22c55e"; ctx.lineWidth = Math.max(1.5, 2 / scale); ctx.setLineDash([dash * 2, dash]); ctx.strokeRect(safe.x * outW, safe.y * outH, safe.width * outW, safe.height * outH); ctx.restore(); }
    if ((v.showShape || shapeGuide) && circle) { ctx.save(); ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.beginPath(); ctx.rect(0, 0, outW, outH); ctx.ellipse(outW / 2, outH / 2, Math.min(outW, outH) / 2, Math.min(outW, outH) / 2, 0, 0, Math.PI * 2); ctx.fill("evenodd"); ctx.restore(); }
    else if (shapeGuide && shapeGuide !== "square") { const r = Math.min(outW, outH) * (shapeGuide === "rounded" ? 0.18 : 0.3); ctx.save(); ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.beginPath(); ctx.rect(0, 0, outW, outH); ctx.roundRect(0, 0, outW, outH, r); ctx.fill("evenodd"); ctx.restore(); }
  }, [source, v, place, dw, dh, scale, outW, outH, fill, safe, clear, circle, shapeGuide]);
  const down = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
  const move = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId); if (!p) return;
    if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a2, b2] = [...pointers.current.values()]; const d1 = Math.hypot(a2.x - b2.x, a2.y - b2.y); if (d0 > 0) onZoom(v.zoom * (d1 / d0)); return; }
    const next = panPosition({ posX: v.posX, posY: v.posY }, (e.clientX - p.x) / scale, (e.clientY - p.y) / scale, { width: outW, height: outH }, place); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); onPan(next.posX, next.posY);
  };
  useEffect(() => { const el = cv.current; if (!el) return; const f = (e: WheelEvent) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); onZoom(v.zoom * Math.exp(-e.deltaY * 0.005)); }; el.addEventListener("wheel", f, { passive: false }); return () => el.removeEventListener("wheel", f); }, [onZoom, v.zoom]);
  const key = (e: React.KeyboardEvent) => { const s = e.shiftKey ? 0.05 : 0.01; const m: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }; if (m[e.key]) { e.preventDefault(); onPan(clamp(v.posX + m[e.key][0], 0, 1), clamp(v.posY + m[e.key][1], 0, 1)); } if (e.key === "+" || e.key === "=") onZoom(v.zoom * 1.1); if (e.key === "-") onZoom(v.zoom / 1.1); };
  return (
    <div ref={wrap} className="flex w-full justify-center rounded-lg bg-surface-2 p-2 shadow-[var(--shadow-border)]">
      <canvas ref={cv} tabIndex={0} role="application" aria-label={`Framing preview ${outW} by ${outH}. Drag or use arrow keys to reposition; plus and minus to zoom.`} style={{ width: dw, height: dh, touchAction: "none", cursor: "grab" }} className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent" onPointerDown={down} onPointerMove={move} onPointerUp={(e) => pointers.current.delete(e.pointerId)} onPointerCancel={(e) => pointers.current.delete(e.pointerId)} onKeyDown={key} />
    </div>
  );
}

function Workspace({ source, toolId, op }: { source: SourceImage; toolId: string; op: string }) {
  const parsed = parsePlatformOp(op);
  const lockedPlatform = parsed?.platform;
  const start = useMemo<V>(() => {
    const platform = lockedPlatform ?? "instagram"; const pl = getPlacement(platform, parsed?.placement ?? "post")!; const first = pl.variants[0];
    const probe = proxyCanvas(source, 160_000).canvas; const px = readPixels(probe); const c = detailCentroid(px.data, probe.width, probe.height);
    const place = computePlacement({ width: source.width, height: source.height }, { width: first.width, height: first.height }, { fit: "cover" });
    const posX = place.overflowX > 1 ? clamp((c.x * place.dest.width - first.width / 2) / (place.dest.width - first.width), 0, 1) : 0.5;
    const posY = place.overflowY > 1 ? clamp((c.y * place.dest.height - first.height / 2) / (place.dest.height - first.height), 0, 1) : 0.5;
    return { platform, placement: pl.placement, variant: 0, custom: false, cw: first.width, ch: first.height, fit: "fill", zoom: 1, posX, posY, bgMode: "blur", bg: "#ffffff", showSafe: true, showClear: true, showShape: true, underLimit: true };
  }, [source, lockedPlatform, parsed?.placement]);
  const st = useSettings<V>(start); const v = st.values;
  const pl = getPlacement(v.platform, v.placement) ?? getPlacement(v.platform, "post")!;
  const choices = placementsFor(v.platform);
  const variant = pl.variants[Math.min(v.variant, pl.variants.length - 1)];
  const outW = Math.round(v.custom ? v.cw : variant.width), outH = Math.round(v.custom ? v.ch : variant.height);
  const place = computePlacement({ width: source.width, height: source.height }, { width: outW, height: outH }, { fit: v.fit === "fill" ? "cover" : "contain", posX: v.posX, posY: v.posY, zoom: v.fit === "fill" ? Math.max(1, v.zoom) : clamp(v.zoom, 0.05, 1) });
  const enlarge = v.fit === "fill" ? outW / Math.max(1, place.sourceRect.width) : place.scale;
  const tooSmall = (pl.minWidth && outW < pl.minWidth) || (pl.minHeight && outH < pl.minHeight);
  const centre = () => st.set({ posX: 0.5, posY: 0.5, zoom: 1 });
  const pickPlacement = (platform: PlatformId, placement: PlacementId) => { const p = getPlacement(platform, placement)!; st.set({ platform, placement: p.placement, variant: 0, custom: false, cw: p.variants[0].width, ch: p.variants[0].height, posX: 0.5, posY: 0.5, zoom: 1 }); };
  const dirty = JSON.stringify(v) !== JSON.stringify(st.initial);
  const ar = `${exactRatio(outW, outH)}${nearestCommonRatio(outW, outH) && nearestCommonRatio(outW, outH) !== exactRatio(outW, outH) ? ` (≈ ${nearestCommonRatio(outW, outH)})` : ""}`;
  const conf = { official: { t: "Official", tone: "ok" as const }, documented: { t: "Documented", tone: "info" as const }, approximate: { t: "Approximate", tone: "warn" as const } }[pl.confidence];
  const limit = pl.maxBytes ?? pl.recommendedBytes;
  const info = PLATFORMS[v.platform];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <FrameEditor source={source} v={v} outW={outW} outH={outH} safe={pl.safe} clear={pl.keepClear} circle={pl.shape === "circle"} onPan={(x, y) => st.set({ posX: x, posY: y }, "pan")} onZoom={(z) => st.set({ zoom: v.fit === "fill" ? clamp(z, 1, 8) : clamp(z, 0.05, 1) }, "zoom")} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Output" value={`${outW} × ${outH}`} /><Stat label="Aspect ratio" value={ar} /><Stat label="Source region" value={v.fit === "fill" ? `${Math.round(place.sourceRect.width)} × ${Math.round(place.sourceRect.height)}` : `${source.width} × ${source.height}`} /><Stat label="Enlarged" value={enlarge > 1.01 ? `${enlarge.toFixed(2)}×` : "No"} tone={enlarge > 2 ? "warn" : undefined} /></div>
        {enlarge > 1.5 ? <Notice tone="warn">The chosen area is smaller than the output, so it is enlarged {enlarge.toFixed(1)}× and may look soft. Use a larger source image or a smaller zoom.</Notice> : null}
        {tooSmall ? <Notice tone="danger">{info.name} needs at least {pl.minWidth}×{pl.minHeight}px for this placement.</Notice> : null}
        <p className="text-xs text-muted">Drag the picture to reposition. Pinch, Ctrl/⌘+scroll, or the Zoom slider to zoom. Arrow keys nudge; Shift for bigger steps.</p>
      </div>
      <div className="space-y-4">
        <HistoryBar canUndo={st.canUndo} canRedo={st.canRedo} onUndo={st.undo} onRedo={st.redo} onReset={() => st.reset()} dirty={dirty} />
        <Section title="Platform preset">
          {!lockedPlatform ? <Select label="Platform" value={v.platform} onChange={(p) => pickPlacement(p, "post")} options={PLATFORM_IDS.map((p) => ({ value: p, label: PLATFORMS[p].name }))} /> : <p className="text-sm font-medium text-fg">{info.name}</p>}
          <Select label="Placement" value={choices.find((c) => c.placement === pl.placement)?.placement ?? choices[0].placement} onChange={(p) => pickPlacement(v.platform, p)} options={choices.map((c) => ({ value: c.placement, label: `${c.label}${c.exists ? "" : " (approximate)"}` }))} />
          <Select label="Size" value={v.custom ? "custom" : String(v.variant)} onChange={(x) => (x === "custom" ? st.set({ custom: true }) : st.set({ custom: false, variant: Number(x), cw: pl.variants[Number(x)].width, ch: pl.variants[Number(x)].height }))} options={[...pl.variants.map((x, i) => ({ value: String(i), label: `${x.width} × ${x.height} — ${x.label}` })), { value: "custom", label: "Custom size…" }]} />
          {v.custom ? <div className="grid grid-cols-2 gap-3"><Num label="Width" value={v.cw} onChange={(cw) => st.set({ cw }, "cw")} min={1} max={10000} suffix="px" /><Num label="Height" value={v.ch} onChange={(ch) => st.set({ ch }, "ch")} min={1} max={10000} suffix="px" /></div> : null}
          <div className="space-y-1.5 rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-muted">
            <p><span className={`mr-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${conf.tone === "ok" ? "bg-ok/15 text-ok" : conf.tone === "warn" ? "bg-warn/20 text-fg" : "bg-accent-soft text-fg"}`}>{conf.t}</span>{pl.basis}</p>
            {pl.note ? <p>{pl.note}</p> : null}
            <p>Checked {SPEC_VERIFIED_ON} · <a className="underline" href={info.sourceUrl} target="_blank" rel="noopener noreferrer">{info.sourceLabel}</a></p>
          </div>
          {!pl.exists ? <Notice tone="warn">{pl.note || `${info.name} doesn't publish a dedicated spec for this placement.`} Size and framing are your choice — adjust the custom size if you know better.</Notice> : null}
        </Section>
        <Section title="Framing">
          <Seg label="Composition" value={v.fit} onChange={(fit) => st.set({ fit, zoom: 1 })} options={[{ value: "fill", label: "Fill (crop to fit)" }, { value: "fit", label: "Fit (show everything)" }]} />
          <Slider label="Zoom" value={v.zoom} onChange={(zoom) => st.set({ zoom }, "zoom")} min={v.fit === "fill" ? 1 : 0.1} max={v.fit === "fill" ? 8 : 1} step={0.01} def={1} unit="×" />
          <div className="grid grid-cols-2 gap-3"><Slider label="Horizontal" value={Math.round(v.posX * 100)} onChange={(x) => st.set({ posX: x / 100 }, "px")} min={0} max={100} unit="%" def={50} /><Slider label="Vertical" value={Math.round(v.posY * 100)} onChange={(y) => st.set({ posY: y / 100 }, "py")} min={0} max={100} unit="%" def={50} /></div>
          <div className="space-y-1.5"><span className="text-[13px] font-medium text-fg">Snap to</span><div className="grid w-28 grid-cols-3 gap-1">{ANCHORS.map((a: Anchor) => <button key={a} type="button" aria-label={`Snap ${a}`} onClick={() => st.set({ ...anchorFractions(a) })} className="size-8 rounded-sm bg-surface-2 hover:bg-accent" />)}</div></div>
          <div className="flex flex-wrap gap-2"><Btn onClick={centre}>Centre</Btn><Btn onClick={() => st.set({ posX: start.posX, posY: start.posY, zoom: 1 })} title="Re-run the automatic positioning, which favours the most detailed part of the picture">Auto-position</Btn></div>
          {v.fit === "fit" ? <><Seg label="Empty space" value={v.bgMode} onChange={(bgMode) => st.set({ bgMode })} options={[{ value: "blur", label: "Blurred copy" }, { value: "color", label: "Colour" }, { value: "transparent", label: "Transparent" }]} />{v.bgMode === "color" ? <ColorField label="Fill colour" value={v.bg} onChange={(bg) => st.set({ bg }, "bg")} /> : null}</> : null}
        </Section>
        <Section title="Guides (preview only)" defaultOpen={false}>
          <Toggle label="Safe area" checked={v.showSafe} onChange={(showSafe) => st.set({ showSafe })} hint={pl.safe ? pl.safe.label : "No safe-area guidance for this placement."} />
          <Toggle label="Areas covered by app UI" checked={v.showClear} onChange={(showClear) => st.set({ showClear })} hint={pl.keepClear?.length ? pl.keepClear.map((z) => z.label).join(" · ") : "None for this placement."} />
          <Toggle label="Circular display mask" checked={v.showShape} onChange={(showShape) => st.set({ showShape })} hint={pl.shape === "circle" ? `${info.name} shows this as a circle.` : "This placement is not shown as a circle."} />
        </Section>
        <ExportPanel source={source} toolId={toolId} suffix={`${v.platform}-${pl.placement}`} formats={pl.formats} defaultFormat={source.hasAlphaChannel && pl.formats.includes("png") && pl.shape === "circle" ? "png" : pl.formats[0]} defaultQuality={90} deps={[v, outW, outH]} maxBytes={limit}
          render={() => renderPlatform(fullCanvas(source), v, outW, outH)} target={limit && v.underLimit ? { bytes: Math.floor(limit * 0.98), allowDownscale: false, minQuality: 0.4 } : undefined}>
          {limit ? <Toggle label={`Keep under ${pl.maxBytes ? "the upload limit" : "the recommended size"}`} checked={v.underLimit} onChange={(underLimit) => st.set({ underLimit })} hint="Finds the best quality that fits, without changing the dimensions." /> : null}
        </ExportPanel>
      </div>
    </div>
  );
}

export function PlatformStudio({ op, toolId }: { op: string; toolId: string }) {
  const state = useSource(toolId);
  return <SourceGate toolId={toolId} state={state}>{(source) => <Workspace key={source.id} source={source} toolId={toolId} op={op.toLowerCase()} />}</SourceGate>;
}
