import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fitStudioScreenshot, scaleStudioScreenshotLayer, type StudioFrame, type StudioSize } from "@/lib/engines/ux-ui-studio-geometry";
import {
  reconstructStudioScreenshot,
  STUDIO_SCREENSHOT_MAX_BYTES,
  type StudioScreenshotReconstruction,
  type StudioScreenshotReconstructionProgress,
} from "./ux-ui-studio-reconstruct";
import "./ux-ui-studio-screenshot-import.css";

export type StudioScreenshotImportResult = StudioScreenshotReconstruction & { includeReference: boolean; referenceFrame?: StudioFrame; matchMockup?: boolean };
export type StudioScreenshotImportProps = {
  file: File;
  screenSize?: StudioSize;
  onApply: (result: StudioScreenshotImportResult) => void;
  onClose: () => void;
};

/** A screenshot is analyzed locally and reviewed before any editable screen is added. */
export function StudioScreenshotImport({ file, screenSize, onApply, onClose }: StudioScreenshotImportProps) {
  const titleId = useId();
  const helpId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const closeRef = useRef(onClose);
  const [previewUrl, setPreviewUrl] = useState("");
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<StudioScreenshotReconstructionProgress | null>(null);
  const [result, setResult] = useState<StudioScreenshotReconstruction | null>(null);
  const [error, setError] = useState("");
  const [includeReference, setIncludeReference] = useState(false);
  const [previewMode, setPreviewMode] = useState<"original" | "layers">("original");
  const [screenMode, setScreenMode] = useState<"mockup" | "source">(screenSize ? "mockup" : "source");
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [showOverlay, setShowOverlay] = useState(false);
  const fittedResult = useMemo(() => {
    if (!result) return null;
    if (screenMode !== "mockup" || !screenSize) return { ...result, matchMockup: false, referenceFrame: { x: 0, y: 0, width: result.width, height: result.height } };
    const frame = fitStudioScreenshot(result, screenSize, fitMode);
    return { ...result, ...screenSize, matchMockup: true, referenceFrame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height }, elements: result.elements.map(layer => scaleStudioScreenshotLayer(layer, frame)) };
  }, [result, screenMode, screenSize, fitMode]);
  const fileError = file.size > STUDIO_SCREENSHOT_MAX_BYTES
    ? "Choose a screenshot of " + Math.round(STUDIO_SCREENSHOT_MAX_BYTES / 1024 / 1024) + " MB or smaller."
    : !file.size ? "This image file is empty. Choose another screenshot." : "";
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setWorking(false);
    setProgress(null);
    setResult(null);
    setError("");
    setIncludeReference(false);
    setPreviewMode("original");
    if (file.size > STUDIO_SCREENSHOT_MAX_BYTES || !file.size) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => { URL.revokeObjectURL(url); };
  }, [file]);

  function closeImport() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    closeRef.current();
  }

  async function reconstruct() {
    if (working || fileError) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setWorking(true);
    setResult(null);
    setError("");
    setProgress({ stage: "decode", progress: 0, message: "Opening screenshot…" });
    try {
      const reconstructed = await reconstructStudioScreenshot(file, {
        signal: controller.signal,
        onProgress: update => {
          if (controllerRef.current === controller && !controller.signal.aborted) setProgress(update);
        },
      });
      if (controllerRef.current !== controller || controller.signal.aborted) return;
      setResult(reconstructed);
      setPreviewMode("layers");
      setProgress(null);
    } catch (failure) {
      if (controllerRef.current !== controller || controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : "The screenshot could not be reconstructed. Try a clear PNG or JPEG screenshot.");
      setProgress(null);
    } finally {
      if (controllerRef.current === controller) { controllerRef.current = null; setWorking(false); }
    }
  }

  function apply() {
    if (!fittedResult || working) return;
    try {
      onApply({ ...fittedResult, includeReference });
      onClose();
    } catch {
      setError("The editable screen could not be added. Please try again.");
    }
  }

  const percentage = Math.round(Math.min(1, Math.max(0, progress?.progress || 0)) * 100);
  return <dialog ref={dialogRef} className="uxui-screenshot-import" aria-labelledby={titleId} aria-describedby={helpId}
    onCancel={event => { event.preventDefault(); closeImport(); }} onKeyDown={event => event.stopPropagation()}>
    <div className="uxui-screenshot-import-content">
      <header className="uxui-screenshot-import-heading">
        <div><h2 id={titleId}>Reconstruct editable layers</h2><p id={helpId}>Recognize English text and flat shapes from your screenshot. Photos and detailed areas stay as image crops. Review the result before adding a screen.</p></div>
        <button type="button" aria-label="Cancel screenshot import" onClick={closeImport}>Cancel</button>
      </header>
      <p className="uxui-screenshot-import-file"><span>{file.name}</span><span>{(file.size / 1024 / 1024).toFixed(2)} MB · processed on this device</span></p>
      {screenSize && <div className="uxui-screenshot-sizing">
        <label>Screen size<select aria-label="Screenshot screen size" value={screenMode} onChange={event => setScreenMode(event.target.value as "mockup" | "source")}>
          <option value="mockup">Match current mockup · {screenSize.width} × {screenSize.height}</option><option value="source">Use screenshot dimensions</option>
        </select></label>
        {screenMode === "mockup" && <label>Image fit<select aria-label="Screenshot fit" value={fitMode} onChange={event => setFitMode(event.target.value as "contain" | "cover")}>
          <option value="contain">Fit whole screenshot</option><option value="cover">Fill screen · crop edges</option>
        </select></label>}
        <p>Text, shapes and artwork scale together. Fit keeps the whole screenshot; fill crops the edges to cover the screen.</p>
      </div>}
      {result && <div className="uxui-screenshot-import-preview-modes" role="group" aria-label="Screenshot preview">
        <button type="button" aria-pressed={previewMode === "original"} onClick={() => setPreviewMode("original")}>Original screenshot</button>
        <button type="button" aria-pressed={previewMode === "layers"} onClick={() => setPreviewMode("layers")}>Reconstructed layers</button>
      </div>}
      <div className="uxui-screenshot-import-preview" aria-busy={working}>
        {previewMode === "layers" && fittedResult ? <svg viewBox={`0 0 ${fittedResult.width} ${fittedResult.height}`} role="img" aria-label="Reconstructed screenshot preview">
          <rect width={fittedResult.width} height={fittedResult.height} fill={fittedResult.background} />
          {fittedResult.elements.map((layer, index) => {
            if (layer.kind === "image") return <image key={index} x={layer.x} y={layer.y} width={layer.width} height={layer.height} href={layer.imageDataUrl} preserveAspectRatio="none" />;
            if (layer.kind === "text") return <text key={index} x={layer.x} y={layer.y + (layer.fontSize || layer.height * 0.8)} fill={layer.color || "#111111"} fontFamily={layer.fontFamily || "system-ui"} fontSize={layer.fontSize || layer.height * 0.8} fontWeight={layer.fontWeight || 400}>{layer.text}</text>;
            return <rect key={index} x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.radius || 0} fill={layer.background || "transparent"} stroke={layer.borderColor || "transparent"} strokeWidth={layer.borderWidth || 0} />;
          })}
          {showOverlay && <image href={result?.referenceDataUrl} {...fittedResult.referenceFrame} opacity={0.4} preserveAspectRatio="none" />}
        </svg> : fittedResult ? <svg viewBox={`0 0 ${fittedResult.width} ${fittedResult.height}`} role="img" aria-label="Original screenshot fitted to screen"><rect width={fittedResult.width} height={fittedResult.height} fill={fittedResult.background} /><image href={result?.referenceDataUrl} {...fittedResult.referenceFrame} preserveAspectRatio="none" /></svg> : previewUrl ? <img src={previewUrl} alt="Original screenshot to reconstruct" /> : <p>Choose a valid screenshot to preview it.</p>}
      </div>
      {working && <div className="uxui-screenshot-import-progress" role="status" aria-live="polite">
        <span>{progress?.message || "Reconstructing screenshot…"}</span>
        <progress max={100} value={percentage} aria-label="Screenshot reconstruction progress" /><span>{percentage}%</span>
      </div>}
      {(fileError || error) && <p className="uxui-screenshot-import-error" role="alert">{fileError || error}</p>}
      {result && <>
        <dl className="uxui-screenshot-import-results" aria-label="Reconstruction results" aria-live="polite" aria-atomic="true">
          <div><dt>Text lines</dt><dd>{result.stats.textLines}</dd></div>
          <div><dt>Flat shapes</dt><dd>{result.stats.shapes}</dd></div>
          <div><dt>Image regions</dt><dd>{result.stats.imageRegions}</dd></div>
          <div><dt>OCR confidence</dt><dd>{Math.round(result.stats.ocrConfidence)}%</dd></div>
        </dl>
        <p className="uxui-screenshot-import-note">Creates a new {fittedResult?.width} × {fittedResult?.height} px editable screen with {result.elements.length} layers. Source layers and exact fonts cannot be recovered from pixels; check the recognized words, typography and spacing.</p>
        {result.warnings.length > 0 && <ul className="uxui-screenshot-import-warnings">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
        <label className="uxui-screenshot-import-reference"><input type="checkbox" checked={showOverlay} onChange={event => { setShowOverlay(event.target.checked); setPreviewMode("layers"); }} />Overlay original to check alignment</label>
        <details className="uxui-screenshot-text-review"><summary>Review recognized text · {result.stats.textLines} lines</summary><p>Correct recognition mistakes before adding the screen. Changes appear in the preview.</p>{result.elements.filter(layer => layer.kind === "text").map((layer, index) => <label key={layer.id}>Line {index + 1}<input aria-label={"Recognized text line " + (index + 1)} value={layer.text || ""} maxLength={1000} onChange={event => { const text = event.target.value; const measure = document.createElement("canvas").getContext("2d"); if (measure) measure.font = `${layer.fontWeight || 400} ${layer.fontSize || 16}px Inter, sans-serif`; const width = Math.max(layer.width, (measure?.measureText(text).width || 0) + 2); setResult(previous => previous ? { ...previous, elements: previous.elements.map(item => item.id === layer.id ? { ...item, text, width, name: text.slice(0, 64) } : item) } : previous); }} /></label>)}</details>
        <label className="uxui-screenshot-import-reference"><input type="checkbox" checked={includeReference} onChange={event => setIncludeReference(event.target.checked)} />Keep original screenshot as a hidden reference</label>
      </>}
      <footer className="uxui-screenshot-import-footer">
        <span>{working ? "You can cancel while recognition is running." : "Your current design stays in place. The reconstruction is added as a new screen."}</span>
        {result ? <button type="button" className="uxui-screenshot-import-primary" onClick={apply} disabled={working}>Add editable screen</button>
          : <button type="button" className="uxui-screenshot-import-primary" onClick={() => void reconstruct()} disabled={working || Boolean(fileError)}>{working ? "Reconstructing…" : "Reconstruct editable layers"}</button>}
      </footer>
    </div>
  </dialog>;
}
