import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { closeImageAsset, decodeImage } from "@/lib/image/decode-engine";
import { assertSafeBatch } from "@/lib/image/limits";
import type { ImageAsset } from "@/lib/image/types";
import { downloadBlob } from "@/lib/utils";
import { createAnnotation, duplicateObject, isLineKind, moveObject, nextStepNumber, reorder, type AnnotationKind, type AnnotationObject } from "@/lib/screenshots/annotations";
import { buildContents, canCopyImage, canDetectQr, canShareFile, copyPng, detectQr, encodeExport, previewContentScale, renderExportCanvas, shareFile, sourceSizes } from "@/lib/screenshots/export-runtime";
import { DEFAULT_EXPORT, planExport, type ExportSettings } from "@/lib/screenshots/export-plan";
import { ASPECT_PRESETS } from "@/lib/screenshots/geometry";
import { canUndo, canRedo, commit, createHistory, redo, undo } from "@/lib/screenshots/history";
import { makeMeasure, type RenderResources } from "@/lib/screenshots/render";
import { arrangeItems, bestOrientation, browserDefaultsFor, computeLayout, createItem, nativeExportScale, type Scene } from "@/lib/screenshots/scene";
import { getCanvasPreset } from "@/lib/screenshots/store-presets";
import { buildInitialScene, type PanelId, type ScreenshotToolConfig } from "@/lib/screenshots/tool-config";
import type { Rect } from "@/lib/screenshots/types";
import { canCaptureDisplay, canReadClipboardImage, captureDisplayFrame, imagesFromPasteEvent, readClipboardImages } from "./capture";
import { Section } from "./controls";
import { EditorCanvas, type EditorApi, type EditorTool } from "./editor-canvas";
import { AnnotatePanel, ExportPanel, InspectPanel, PickReadout, QrResults, RedactPanel, type PickInfo, type QrState, type SizeChoice } from "./panels-edit";
import { ANNOTATE_TOOLS, REDACT_TOOLS } from "./tool-palettes";
import { BackgroundPanel, CollagePanel, CropPanel, FramePanel, HeadlinePanel, LayoutPanel, LockPanel, ShadowPanel, SourcePanel, StylePanel } from "./panels-scene";
import type { PanelCtx } from "./panel-types";
import { ResultCanvas } from "./result-canvas";
import { useSources, type SourceEntry, type SourceOrigin } from "./use-sources";
import "./studio.css";

const MAX_COLLAGE = 12;
let idSeed = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${++idSeed}`;
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 30));
const TITLES: Record<PanelId, string> = { crop: "Crop", frame: "Frame", layout: "Layout & size", background: "Background", shadow: "Shadow", style: "Corners & border", headline: "Headline", annotate: "Annotate", redact: "Redact", collage: "Collage", lock: "Lock screen", inspect: "Inspect" };
const OPEN: Partial<Record<PanelId, boolean>> = { frame: true, annotate: true, redact: true, collage: true, headline: true, lock: true, style: true, layout: true };
const isTyping = (t: HTMLElement | null) => !!t && (t.tagName === "TEXTAREA" || t.isContentEditable || (t.tagName === "INPUT" && !["range", "checkbox", "radio", "color", "button"].includes((t as HTMLInputElement).type)));

export function ScreenshotStudio({ cfg }: { cfg: ScreenshotToolConfig }) {
  const [hist, setHist] = useState(() => createHistory(buildInitialScene(cfg)));
  const scene = hist.present, sceneRef = useRef(scene); sceneRef.current = scene;
  const sources = useSources(), measure = useMemo(() => makeMeasure(), []);
  const multi = cfg.workflowInfo.multi, panels = cfg.workflowInfo.panels;
  const canEdit = !multi && panels.some((p) => p === "crop" || p === "annotate" || p === "redact" || p === "inspect");

  const [adv, setAdv] = useState(false), [view, setView] = useState<"result" | "edit">(cfg.workflowInfo.view), [tool, setTool] = useState<EditorTool>("select");
  const [selectedObj, setSelectedObj] = useState<string | null>(null), [selectedItem, setSelectedItem] = useState<string | null>(null), [markColor, setMarkColor] = useState("#ff3b30");
  const [cropAspect, setCropAspect] = useState("free"), [pick, setPick] = useState<PickInfo | null>(null), [qr, setQr] = useState<QrState | null>(null);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT), [sizeChoice, setSizeChoice] = useState<SizeChoice>("native");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState("");
  const [compare, setCompare] = useState(false), [zoom, setZoom] = useState<"fit" | number>("fit"), [guides, setGuides] = useState(false), [editorZoom, setEditorZoom] = useState(100);
  const [delay, setDelay] = useState(0), [cursor, setCursor] = useState(false), [remaining, setRemaining] = useState<number | null>(null), abortRef = useRef<AbortController | null>(null);
  const [bgImage, setBgImage] = useState<{ asset: ImageAsset; width: number; height: number } | null>(null);
  const [caps] = useState(() => ({ capture: canCaptureDisplay(), paste: canReadClipboardImage(), copy: canCopyImage(), qr: canDetectQr(), webp: (() => { try { return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp"); } catch { return false; } })() }));
  const editorApi = useRef<EditorApi | null>(null), filesRef = useRef<(f: File[], o: SourceOrigin) => Promise<void>>(async () => {});

  const edit = useCallback((fn: (s: Scene) => Scene, key?: string) => setHist((h) => { const next = fn(h.present); return next === h.present ? h : commit(h, next, { key }); }), []);
  const patchItem = useCallback((id: string, patch: Partial<Scene["items"][number]>, key?: string) => edit((s) => ({ ...s, items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }), key ? `item:${id}:${key}` : undefined), [edit]);

  const byId = useMemo(() => new Map(sources.list.map((s) => [s.id, s])), [sources.list]);
  const sizes = useMemo(() => sourceSizes(sources.map), [sources.map]);
  const layout = useMemo(() => computeLayout(scene, sizes, measure), [scene, sizes, measure]);
  const primary = scene.items[0], primarySource = primary?.imageId ? byId.get(primary.imageId) : undefined, hasImage = scene.items.some((i) => i.imageId && byId.has(i.imageId));
  const activeItem = multi ? scene.items.find((i) => i.id === selectedItem) ?? scene.items[0] : primary, activeSource = activeItem?.imageId ? byId.get(activeItem.imageId) : undefined;

  const refsKey = scene.items.map((i) => `${i.id}:${i.imageId ?? ""}`).join("|");
  const refs = useMemo(() => (refsKey ? refsKey.split("|").map((p) => { const [id, imageId] = p.split(":"); return { id, imageId: imageId || null }; }) : []), [refsKey]);
  const deferredAnn = useDeferredValue(scene.annotations);
  const contents = useMemo(() => { try { return buildContents(refs, deferredAnn, sources.map, (s) => previewContentScale(s.width, s.height)); } catch { return {}; } }, [refs, deferredAnn, sources.map]);
  const bgResource = useMemo(() => (bgImage ? { source: bgImage.asset.bitmap, width: bgImage.width, height: bgImage.height } : null), [bgImage]);
  const resources: RenderResources = useMemo(() => ({ contents, bgImage: bgResource }), [contents, bgResource]);

  /* ------------------------------------------------------------ intake */
  const setSingleSource = useCallback((e: SourceEntry) => {
    edit((s) => { const prev = s.items[0], presetId = prev?.presetId ?? cfg.defaultFrameId;
      const item = prev ? { ...prev, imageId: e.id, name: e.name, crop: null, orientation: bestOrientation(prev.presetId, e) } : createItem("item1", presetId, { imageId: e.id, name: e.name, orientation: bestOrientation(presetId, e), browser: browserDefaultsFor(presetId) });
      return { ...s, items: [item], annotations: [] }; });
    setSelectedObj(null); setPick(null); setQr(null); setSizeChoice("native"); setExportSettings((x) => ({ ...x, sizeMode: "scale" }));
  }, [cfg.defaultFrameId, edit]);

  const handleFiles = useCallback(async (files: File[], origin: SourceOrigin) => {
    setError(null); setNotice("");
    try {
      const room = multi ? MAX_COLLAGE - sceneRef.current.items.length : 1, list = files.slice(0, Math.max(0, room));
      if (!list.length) { setError(`A collage holds up to ${MAX_COLLAGE} screenshots.`); return; }
      assertSafeBatch(list);
      const { added, failures } = await sources.add(list, origin, new Set(sceneRef.current.items.map((i) => i.imageId).filter(Boolean) as string[]));
      if (failures.length) setError(failures[0] + (failures.length > 1 ? ` (and ${failures.length - 1} more)` : ""));
      if (!added.length) return;
      if (multi) {
        const nowSizes = { ...sourceSizes(sources.map), ...Object.fromEntries(added.map((a) => [a.id, { width: a.width, height: a.height }])) };
        edit((s) => { const presetId = s.items[0]?.presetId ?? cfg.defaultFrameId; const items = [...s.items, ...added.map((a) => createItem(newId("it"), presetId, { imageId: a.id, name: a.name, orientation: bestOrientation(presetId, a), browser: browserDefaultsFor(presetId) }))]; return arrangeItems({ ...s, items }, nowSizes, s.collage.layout); });
      } else { setSingleSource(added[0]); if (files.length > 1) setNotice("This tool edits one screenshot at a time, so only the first image was used. Device Collage tools combine several."); }
    } catch (e) { setError(msg(e)); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multi, sources.add, sources.map, edit, cfg.defaultFrameId, measure, setSingleSource]);
  filesRef.current = handleFiles;

  useEffect(() => {
    const h = (e: ClipboardEvent) => { if (isTyping(e.target as HTMLElement | null)) return; const files = imagesFromPasteEvent(e); if (files.length) { e.preventDefault(); void filesRef.current(files, "paste"); } };
    document.addEventListener("paste", h); return () => document.removeEventListener("paste", h);
  }, []);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  useEffect(() => () => { bgImage && closeImageAsset(bgImage.asset); }, [bgImage]);

  const pasteButton = async () => { try { const f = await readClipboardImages(); if (!f.length) setNotice("There is no image on the clipboard."); else await handleFiles(f, "paste"); } catch { setNotice("Your browser blocked clipboard access. Press Ctrl/⌘ + V instead."); } };
  const doCapture = async () => {
    const ac = new AbortController(); abortRef.current = ac; setError(null); setRemaining(delay);
    try { const f = await captureDisplayFrame({ delaySec: delay, includeCursor: cursor, signal: ac.signal, onTick: setRemaining }); await handleFiles([f], "capture"); }
    catch (e) { if (e instanceof DOMException && (e.name === "AbortError" || e.name === "NotAllowedError")) setNotice("Capture cancelled."); else setError(msg(e)); }
    finally { setRemaining(null); abortRef.current = null; }
  };
  const onBgFile = async (file: File) => { try { const asset = await decodeImage(file); setBgImage((p) => { if (p) closeImageAsset(p.asset); return { asset, width: asset.metadata.width, height: asset.metadata.height }; }); edit((s) => ({ ...s, background: { kind: "image", imageId: "bg", fit: "cover", color: "#ffffff" } })); } catch (e) { setError(msg(e)); } };

  /* ------------------------------------------------------------ editing helpers */
  const setCrop = useCallback((rect: Rect | null, key: string) => { const id = sceneRef.current.items[0]?.id; if (id) patchItem(id, { crop: rect }, key); }, [patchItem]);
  const createObj = useCallback((kind: AnnotationKind, at: { x: number; y: number }) => {
    const c = markColor, over: Partial<AnnotationObject> = kind === "text" ? { textColor: c } : kind === "step" ? { fill: c } : ["arrow", "line", "rect", "ellipse", "pen", "callout"].includes(kind) ? { stroke: c } : {};
    let obj = createAnnotation(newId("o"), kind, at, over); if (kind === "step") obj = { ...obj, step: nextStepNumber(sceneRef.current.annotations) };
    edit((s) => ({ ...s, annotations: [...s.annotations, obj] }), `add:${obj.id}`); setSelectedObj(obj.id); return obj;
  }, [markColor, edit]);
  const patchObj = useCallback((next: AnnotationObject, key: string) => edit((s) => ({ ...s, annotations: s.annotations.map((o) => (o.id === next.id ? next : o)) }), key), [edit]);
  const deleteObj = useCallback((id: string) => { edit((s) => ({ ...s, annotations: s.annotations.filter((o) => o.id !== id) })); setSelectedObj((cur) => (cur === id ? null : cur)); }, [edit]);
  const duplicateObj = useCallback((id: string) => { const o = sceneRef.current.annotations.find((x) => x.id === id); if (!o) return; const copy = duplicateObject(o, newId("o")); edit((s) => ({ ...s, annotations: [...s.annotations, copy] })); setSelectedObj(copy.id); }, [edit]);
  const addCentre = (kind: AnnotationKind) => {
    const src = primarySource; if (!src) return; const crop = primary?.crop, cx = crop ? crop.x + crop.width / 2 : src.width / 2, cy = crop ? crop.y + crop.height / 2 : src.height / 2, t = createAnnotation("t", kind, { x: 0, y: 0 });
    createObj(kind, { x: cx - (isLineKind(kind) ? 80 : t.width / 2), y: cy - (isLineKind(kind) ? 0 : t.height / 2) }); setView("edit");
  };
  const chooseTool = (t: EditorTool) => { setTool(t); if (t !== "select") setView("edit"); };
  const resetAll = () => edit((s) => { const fresh = buildInitialScene(cfg), items = s.items.map((i, n) => createItem(i.id, cfg.defaultFrameId, { imageId: i.imageId, name: i.name, orientation: n >= 0 && i.imageId && byId.get(i.imageId) ? bestOrientation(cfg.defaultFrameId, byId.get(i.imageId) as SourceEntry) : "portrait", browser: browserDefaultsFor(cfg.defaultFrameId) })); const next = { ...fresh, items }; return multi ? arrangeItems(next, sizes, next.collage.layout) : next; });
  const runQr = (region: Rect) => { if (!primarySource) return; setQr({ results: [], error: null, busy: true }); setView("edit"); detectQr(primarySource.bitmap, region).then((results) => setQr({ results, error: null, busy: false })).catch((e) => setQr({ results: [], error: msg(e), busy: false })); };
  const copyText = async (t: string) => { try { await navigator.clipboard.writeText(t); setNotice(`Copied ${t}`); } catch { setNotice("Copying was blocked by the browser."); } };

  /* ------------------------------------------------------------ export */
  const storeCanvas = scene.canvas.mode === "preset" ? getCanvasPreset(scene.canvas.presetId) : undefined, storeBound = !!storeCanvas && storeCanvas.group !== "generic";
  const nativeScale = useMemo(() => nativeExportScale(layout), [layout]), nativeCapped = useMemo(() => nativeExportScale(layout, Number.MAX_SAFE_INTEGER) > nativeScale + 0.005, [layout, nativeScale]);
  const effective: ExportSettings = { ...exportSettings, ...(storeBound ? { sizeMode: "scale" as const, scale: 1 } : sizeChoice === "native" ? { sizeMode: "scale" as const, scale: nativeScale } : {}) };
  const planCtx = { toolSlug: cfg.toolId, sourceName: primarySource?.name ?? activeSource?.name, hasTransparency: layout.hasTransparency, alphaForbidden: storeCanvas ? !storeCanvas.alphaAllowed : false };
  const plan = planExport({ width: layout.width, height: layout.height }, effective, planCtx);
  const formatNote = storeBound && (effective.format === "webp" || effective.format === "pdf") ? `${storeCanvas?.group === "app-store" ? "App Store Connect" : "Google Play"} accepts PNG or JPEG screenshots; choose one of those for upload.` : null;
  const runExport = async (mode: "download" | "copy" | "share") => {
    if (!hasImage || busy) return; setBusy(true); setError(null);
    try {
      await nextFrame(); const p = mode === "copy" ? planExport({ width: layout.width, height: layout.height }, { ...effective, format: "png" }, planCtx) : plan;
      if (!p.ok) throw new Error(p.error ?? "This export is too large.");
      const canvas = await renderExportCanvas(scene, sources.map, bgResource, p, measure), blob = await encodeExport(canvas, p); canvas.width = canvas.height = 0;
      if (mode === "download") { downloadBlob(blob, p.filename); setNotice(`Saved ${p.filename} (${p.width} × ${p.height} px).`); }
      else if (mode === "copy") { await copyPng(blob); setNotice("Copied the image to the clipboard."); }
      else { const file = new File([blob], p.filename, { type: p.mime }); if (!canShareFile(file)) throw new Error("Sharing this file isn’t supported here. Use Download instead."); await shareFile(file); }
    } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setError(msg(e)); } finally { setBusy(false); }
  };
  const canShare = hasImage && typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof File !== "undefined";

  /* ------------------------------------------------------------ keyboard */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase(), typing = isTyping(e.target as HTMLElement);
    if (mod && key === "z" && !typing) { e.preventDefault(); setHist((h) => (e.shiftKey ? redo(h) : undo(h))); return; }
    if (mod && key === "y" && !typing) { e.preventDefault(); setHist(redo); return; }
    if (mod && key === "enter") { e.preventDefault(); void runExport("download"); return; }
    if (typing) return;
    const o = scene.annotations.find((x) => x.id === selectedObj);
    if (key === "escape") { setSelectedObj(null); setTool("select"); return; }
    if ((key === "delete" || key === "backspace") && o) { e.preventDefault(); deleteObj(o.id); return; }
    if (mod && key === "d" && o) { e.preventDefault(); duplicateObj(o.id); return; }
    if (view === "edit" && o && key.startsWith("arrow")) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; patchObj(moveObject(o, key === "arrowleft" ? -s : key === "arrowright" ? s : 0, key === "arrowup" ? -s : key === "arrowdown" ? s : 0), `nudge:${o.id}`); return; }
    if (view === "edit" && (key === "+" || key === "=")) { editorApi.current?.zoomIn(); return; }
    if (view === "edit" && key === "-") { editorApi.current?.zoomOut(); return; }
    if (view === "edit" && key === "0") { editorApi.current?.fit(); }
  };
  const onDrop = (e: DragEvent) => { const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/")); if (files.length) { e.preventDefault(); void handleFiles(files, "drop"); } };

  /* ------------------------------------------------------------ panels */
  const ctx: PanelCtx = { cfg, scene, layout, adv, edit, item: activeItem, patchItem, source: activeSource };
  const markProps = { ctx, tool, setTool: chooseTool, selectedId: selectedObj, setSelectedId: setSelectedObj, onAddCentre: addCentre, onUpdate: patchObj, onDelete: deleteObj, onDuplicate: duplicateObj, onReorder: (id: string, to: "front" | "back") => edit((s) => ({ ...s, annotations: reorder(s.annotations, id, to) })) };
  const cropRatio = ASPECT_PRESETS.find((a) => a.id === cropAspect)?.ratio ?? null;
  const panelNodes: Record<PanelId, ReactNode> = {
    crop: <CropPanel ctx={ctx} cropAspect={cropAspect} setCropAspect={setCropAspect} onCropTool={() => chooseTool("crop")} setCrop={setCrop} />,
    frame: <FramePanel ctx={ctx} onApplyAll={multi ? (presetId) => edit((s) => arrangeItems({ ...s, items: s.items.map((i) => ({ ...i, presetId, browser: browserDefaultsFor(presetId), orientation: i.imageId && byId.get(i.imageId) ? bestOrientation(presetId, byId.get(i.imageId) as SourceEntry) : i.orientation })) }, sizes, s.collage.layout)) : undefined} />,
    layout: <LayoutPanel ctx={ctx} />, background: <BackgroundPanel ctx={ctx} onBgFile={onBgFile} hasBgImage={!!bgImage} />, shadow: <ShadowPanel ctx={ctx} />, style: <StylePanel ctx={ctx} />, headline: <HeadlinePanel ctx={ctx} />,
    annotate: <AnnotatePanel {...markProps} markColor={markColor} setMarkColor={setMarkColor} />, redact: <RedactPanel {...markProps} />,
    collage: <CollagePanel ctx={ctx} list={sources.list.filter((s) => scene.items.some((i) => i.imageId === s.id))} selectedItemId={activeItem?.id ?? null} onSelectItem={setSelectedItem} sizes={sizes}
      onRemoveItem={(id) => { edit((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) })); setSelectedItem(null); }} onMoveItem={(id, dir) => edit((s) => { const i = s.items.findIndex((x) => x.id === id), j = i + dir; if (i < 0 || j < 0 || j >= s.items.length) return s; const items = s.items.slice(); [items[i], items[j]] = [items[j], items[i]]; return arrangeItems({ ...s, items }, sizes, s.collage.layout); })} />,
    lock: <LockPanel ctx={ctx} />,
    inspect: <InspectPanel ctx={ctx} tool={tool} setTool={chooseTool} pick={pick} onCopy={copyText} qr={qr} canQr={caps.qr} />,
  };
  const frameTitle = cfg.info.group === "browser" ? "Browser window" : TITLES.frame;
  const toolRow: { id: EditorTool; label: string }[] = [{ id: "select", label: "Select" }, { id: "hand", label: "Pan" }, { id: "crop", label: "Crop" }, ...(cfg.workflow === "annotation" ? ANNOTATE_TOOLS.map((t) => ({ id: t.kind as EditorTool, label: t.label })) : cfg.workflow === "redaction" ? REDACT_TOOLS.map((t) => ({ id: t.kind as EditorTool, label: t.label })) : []), { id: "eyedropper", label: "Picker" }];
  const warnings = Array.from(new Set([...layout.warnings, ...(layout.items.some((i) => i.hasImage && i.scale < 0.05) ? ["An item is almost invisible at this size."] : [])]));

  const source = (
    <SourcePanel source={activeSource} recent={sources.list} multi={multi} canCapture={caps.capture} canPaste={caps.paste} onFiles={(f) => void handleFiles(f, "upload")} onPaste={() => void pasteButton()} onCapture={() => void doCapture()}
      onRemove={() => { edit((s) => ({ ...s, items: [], annotations: [] })); setNotice("Image removed from this edit. It stays in Recent until you clear it."); }} onUse={(id) => { const e = byId.get(id); if (e) setSingleSource(e); }}
      onClearAll={() => { sources.clear(); setHist(createHistory(buildInitialScene(cfg))); setNotice("All images were cleared from this tab."); }} capture={{ delay, setDelay, cursor, setCursor, remaining, cancel: () => abortRef.current?.abort() }} />
  );

  if (!hasImage) {
    return (
      <div className="ss" onKeyDown={onKeyDown} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <ErrorBanner message={error} />
        <div className="ss-empty">
          <FileDropzone accept="image/*" multiple={multi} label={multi ? "Drop screenshots here, or browse" : "Drop a screenshot here, or browse"} hint="PNG, JPEG, WebP and more. Everything stays in your browser." onFiles={(f) => void handleFiles(f, "drop")} />
          {source}
          <p className="ss-hint">{cfg.info.note}</p>
        </div>
        <p className="ss-sr" role="status" aria-live="polite">{notice}</p>
      </div>
    );
  }

  return (
    <div className="ss" onKeyDown={onKeyDown} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ErrorBanner message={error} />
      <div className="ss-main">
        <section className="ss-stage" aria-label="Preview and editor">
          <div className="ss-toolbar">
            {canEdit ? <div className="ss-seg" role="tablist" aria-label="View">{(["result", "edit"] as const).map((v) => (<button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>{v === "result" ? "Result" : "Edit"}</button>))}</div> : null}
            <span className="ss-spacer" />
            <Button size="icon" variant="ghost" aria-label="Undo" title="Undo (Ctrl/⌘+Z)" disabled={!canUndo(hist)} onClick={() => setHist(undo)}><Undo2 size={18} /></Button>
            <Button size="icon" variant="ghost" aria-label="Redo" title="Redo (Ctrl/⌘+Shift+Z)" disabled={!canRedo(hist)} onClick={() => setHist(redo)}><Redo2 size={18} /></Button>
            <Button size="sm" variant="ghost" onClick={resetAll}>Reset</Button>
            <div className="ss-seg" role="radiogroup" aria-label="Controls detail">{(["simple", "advanced"] as const).map((m) => (<button key={m} type="button" role="radio" aria-checked={(m === "advanced") === adv} onClick={() => setAdv(m === "advanced")}>{m === "simple" ? "Simple" : "Advanced"}</button>))}</div>
          </div>

          {view === "edit" && primarySource && canEdit ? (
            <>
              <div className="ss-tools" role="toolbar" aria-label="Editing tools">{toolRow.map((t) => (<button key={t.id} type="button" aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>{t.label}</button>))}
                <span className="ss-spacer" /><button type="button" aria-label="Zoom out" onClick={() => editorApi.current?.zoomOut()}>−</button><span className="ss-zoom" aria-live="off">{editorZoom}%</span><button type="button" aria-label="Zoom in" onClick={() => editorApi.current?.zoomIn()}>+</button><button type="button" onClick={() => editorApi.current?.fit()}>Fit</button><button type="button" onClick={() => editorApi.current?.actual()}>100%</button></div>
              {tool === "eyedropper" ? <div className="ss-readout"><PickReadout pick={pick} onCopy={copyText} /></div> : null}
              {qr ? <div className="ss-readout"><QrResults qr={qr} onCopy={copyText} /></div> : null}
              <EditorCanvas source={primarySource} composed={primary ? (contents[primary.id]?.canvas ?? null) : null} objects={scene.annotations} selectedId={selectedObj} tool={tool} crop={primary?.crop ?? null} cropAspect={cropRatio} snap={scene.snap}
                apiRef={editorApi} onZoom={setEditorZoom} onSelect={setSelectedObj} onCreate={createObj} onPatch={patchObj} onCrop={setCrop} onPick={setPick} onRegion={runQr} />
              <p className="ss-hint">Scroll the page outside the image. Ctrl/⌘ + scroll or pinch to zoom; drag with Pan, the middle mouse button, or Space held.</p>
            </>
          ) : (
            <>
              <div className="ss-tools" role="toolbar" aria-label="Preview options">
                <label className="ss-inline">Zoom <select value={String(zoom)} onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}><option value="fit">Fit</option><option value="1">100%</option><option value="2">200%</option></select></label>
                {primarySource && !multi ? <button type="button" aria-pressed={compare} onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") setCompare(true); }} onKeyUp={() => setCompare(false)} title="Hold to see your original">Hold for original</button> : null}
                {adv ? <button type="button" aria-pressed={guides} onClick={() => setGuides((g) => !g)}>Safe-area guides</button> : null}
                <span className="ss-spacer" /><span className="ss-hint">{layout.width} × {layout.height}</span></div>
              <ResultCanvas scene={scene} layout={layout} resources={resources} measure={measure} selectedItemId={multi ? activeItem?.id ?? null : primary?.id ?? null} onSelectItem={(id) => (multi ? setSelectedItem(id) : undefined)} onMoveItem={(id, x, y) => patchItem(id, { x, y }, "drag")}
                showGuides={guides} zoom={zoom} original={compare && primarySource ? { source: primarySource.bitmap, width: primarySource.width, height: primarySource.height } : null} label={cfg.title} />
              {multi ? null : <p className="ss-hint">Drag the result to reposition it; arrow keys nudge. It snaps to the centre.</p>}
            </>
          )}
          {warnings.length ? <ul className="ss-warn" role="status">{warnings.map((w, i) => <li key={`${i}-${w}`}>{w}</li>)}</ul> : null}
        </section>

        <aside className="ss-side" aria-label="Settings">
          <Section title="Screenshot" open={false}>{source}</Section>
          {panels.map((id) => (<Section key={id} title={id === "frame" ? frameTitle : TITLES[id]} open={!!OPEN[id]}>{panelNodes[id]}</Section>))}
          <Section title="Export" open>
            <ExportPanel settings={effective} setSettings={setExportSettings} plan={plan} sizeChoice={sizeChoice} setSizeChoice={setSizeChoice} nativeScale={nativeScale} nativeCapped={nativeCapped} scaleLocked={storeBound} lockNote={storeCanvas ? `Exact ${storeCanvas.label} (${layout.width} × ${layout.height}). Store screenshots must match this size.` : ""}
              adv={adv} busy={busy} disabled={!hasImage} webpOk={caps.webp} canShare={canShare} canCopy={caps.copy} formatNote={formatNote} onDownload={() => void runExport("download")} onCopy={() => void runExport("copy")} onShare={() => void runExport("share")} />
          </Section>
        </aside>
      </div>
      <div className="ss-bar"><span className="ss-bar-info"><strong>{plan.width} × {plan.height}</strong> · {effective.format.toUpperCase()}</span><Button onClick={() => void runExport("download")} disabled={busy || !plan.ok}>{busy ? "Exporting…" : "Download"}</Button></div>
      <p className="ss-sr" role="status" aria-live="polite">{notice}</p>
      {notice ? <p className="ss-notice" aria-hidden="true">{notice}</p> : null}
    </div>
  );
}
