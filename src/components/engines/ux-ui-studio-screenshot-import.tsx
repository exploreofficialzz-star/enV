import { useEffect, useId, useRef, useState } from "react";
import {
  reconstructStudioScreenshot,
  STUDIO_SCREENSHOT_MAX_BYTES,
  type StudioScreenshotReconstruction,
  type StudioScreenshotReconstructionProgress,
} from "./ux-ui-studio-reconstruct";
import "./ux-ui-studio-screenshot-import.css";

export type StudioScreenshotImportResult = StudioScreenshotReconstruction & { includeReference: boolean };
export type StudioScreenshotImportProps = {
  file: File;
  onApply: (result: StudioScreenshotImportResult) => void;
  onClose: () => void;
};

/** A screenshot is analyzed locally and reviewed before any editable screen is added. */
export function StudioScreenshotImport({ file, onApply, onClose }: StudioScreenshotImportProps) {
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
    if (!result || working) return;
    try {
      onApply({ ...result, includeReference });
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
      {result && <div className="uxui-screenshot-import-preview-modes" role="group" aria-label="Screenshot preview">
        <button type="button" aria-pressed={previewMode === "original"} onClick={() => setPreviewMode("original")}>Original screenshot</button>
        <button type="button" aria-pressed={previewMode === "layers"} onClick={() => setPreviewMode("layers")}>Reconstructed layers</button>
      </div>}
      <div className="uxui-screenshot-import-preview" aria-busy={working}>
        {previewMode === "layers" && result ? <svg viewBox={`0 0 ${result.width} ${result.height}`} role="img" aria-label="Reconstructed screenshot preview">
          <rect width={result.width} height={result.height} fill={result.background} />
          {result.elements.map((layer, index) => {
            if (layer.kind === "image") return <image key={index} x={layer.x} y={layer.y} width={layer.width} height={layer.height} href={layer.imageDataUrl} preserveAspectRatio="none" />;
            if (layer.kind === "text") return <text key={index} x={layer.x} y={layer.y + (layer.fontSize || layer.height * 0.8)} fill={layer.color || "#111111"} fontFamily={layer.fontFamily || "system-ui"} fontSize={layer.fontSize || layer.height * 0.8} fontWeight={layer.fontWeight || 400}>{layer.text}</text>;
            return <rect key={index} x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.radius || 0} fill={layer.background || "transparent"} stroke={layer.borderColor || "transparent"} strokeWidth={layer.borderWidth || 0} />;
          })}
        </svg> : previewUrl ? <img src={previewUrl} alt="Original screenshot to reconstruct" /> : <p>Choose a valid screenshot to preview it.</p>}
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
        <p className="uxui-screenshot-import-note">Creates a new {result.width} × {result.height} px editable screen with {result.elements.length} layers. Source layers and exact fonts cannot be recovered from pixels; check the recognized words, typography and spacing.</p>
        {result.warnings.length > 0 && <ul className="uxui-screenshot-import-warnings">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
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
