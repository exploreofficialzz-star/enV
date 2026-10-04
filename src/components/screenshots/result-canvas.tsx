import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { renderScene, type Drawable, type RenderResources } from "@/lib/screenshots/render";
import { pickItem, type Measure, type Scene, type SceneLayout } from "@/lib/screenshots/scene";
import { snapValue } from "@/lib/screenshots/geometry";

interface Props {
  scene: Scene; layout: SceneLayout; resources: RenderResources; measure: Measure;
  selectedItemId: string | null; onSelectItem: (id: string | null) => void; onMoveItem: (id: string, x: number, y: number) => void;
  showGuides: boolean; zoom: "fit" | number; original: { source: Drawable; width: number; height: number } | null; label: string;
}

/** Composition preview. Uses the exact renderer the exporter uses, at preview resolution. */
export function ResultCanvas({ scene, layout, resources, measure, selectedItemId, onSelectItem, onMoveItem, showGuides, zoom, original, label }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 800 });
  const drag = useRef<{ id: string; sx: number; sy: number; ix: number; iy: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const measureBox = () => setBox({ w: Math.max(0, el.clientWidth - 16), h: window.innerHeight });
    measureBox(); const ro = new ResizeObserver(measureBox); ro.observe(el); window.addEventListener("resize", measureBox);
    return () => { ro.disconnect(); window.removeEventListener("resize", measureBox); };
  }, []);

  const maxH = Math.max(320, box.h * 0.72);
  const fit = box.w > 0 ? Math.min(2, box.w / layout.width, maxH / layout.height) : 1, css = zoom === "fit" ? fit : zoom;

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); let k = css * dpr; const px = layout.width * k * layout.height * k; if (px > 16_000_000) k *= Math.sqrt(16_000_000 / px);
    c.width = Math.max(1, Math.round(layout.width * k)); c.height = Math.max(1, Math.round(layout.height * k));
    const ctx = c.getContext("2d"); if (!ctx) return;
    if (original) {
      const r = Math.min(c.width / original.width, c.height / original.height), w = original.width * r, h = original.height * r;
      ctx.imageSmoothingQuality = "high"; ctx.drawImage(original.source, (c.width - w) / 2, (c.height - h) / 2, w, h); return;
    }
    renderScene(ctx, scene, layout, resources, { scale: c.width / layout.width, showGuides }, measure);
  }, [scene, layout, resources, css, showGuides, original, measure]);

  const toLayout = (e: { clientX: number; clientY: number }) => { const r = canvasRef.current!.getBoundingClientRect(), k = r.width / layout.width; return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, k }; };
  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (original) return; const p = toLayout(e), hit = pickItem(layout, p), item = hit && scene.items.find((i) => i.id === hit.id);
    if (!hit || !item) { onSelectItem(null); return; }
    onSelectItem(hit.id); if (item.locked) return;
    drag.current = { id: hit.id, sx: e.clientX, sy: e.clientY, ix: item.x, iy: item.y, cx: hit.center.x, cy: hit.center.y }; e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current; if (!d) return; const { k } = toLayout(e); let dx = (e.clientX - d.sx) / k, dy = (e.clientY - d.sy) / k;
    const sx = snapValue(d.cx + dx, [layout.width / 2], 8 / k), sy = snapValue(d.cy + dy, [layout.height / 2], 8 / k);
    if (sx.target !== null) dx = sx.value - d.cx; if (sy.target !== null) dy = sy.value - d.cy;
    onMoveItem(d.id, Math.round(d.ix + dx), Math.round(d.iy + dy));
  };
  const onUp = () => { drag.current = null; };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const id = selectedItemId ?? (scene.items.length === 1 ? scene.items[0].id : null), item = scene.items.find((i) => i.id === id); if (!item || item.locked) return;
    const step = e.shiftKey ? 10 : 1, moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const mv = moves[e.key]; if (mv) { e.preventDefault(); onMoveItem(item.id, item.x + mv[0], item.y + mv[1]); }
  };

  const sel = layout.items.find((l) => l.id === selectedItemId && l.hasImage && l.visible), selItem = sel && scene.items.find((i) => i.id === sel.id);
  const multi = scene.items.length > 1;
  return (
    <div ref={wrapRef} className="ss-canvas-wrap" tabIndex={0} onKeyDown={onKey} aria-label={`${label}. Arrow keys nudge the selected item.`}>
      <div className="ss-canvas-box ss-checker" style={{ width: Math.round(layout.width * css), height: Math.round(layout.height * css) }}>
        <canvas ref={canvasRef} role="img" aria-label={original ? "Original screenshot" : `${label} preview, ${layout.width} by ${layout.height} pixels`} style={{ width: "100%", height: "100%", display: "block", cursor: original ? "default" : "grab", touchAction: multi ? "none" : "pan-y" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        {sel && selItem && multi && !original ? (
          <div className="ss-sel" style={{ width: sel.geom.bounds.width * sel.scale * css, height: sel.geom.bounds.height * sel.scale * css, left: sel.center.x * css - (sel.geom.bounds.width * sel.scale * css) / 2, top: sel.center.y * css - (sel.geom.bounds.height * sel.scale * css) / 2, transform: `rotate(${sel.rotation}deg)` }} aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}
