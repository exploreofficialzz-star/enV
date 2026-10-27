import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import "./ux-ui-studio-image-repair.css";

type Point = { x: number; y: number };
type BrushMode = "erase" | "restore";
type BrushSnapshot = { pixels: ImageData; dirty: boolean };

export type StudioImageRepairProps = {
  original: string;
  source: string;
  onApply: (dataUrl: string) => void;
  onClose: () => void;
  busy?: boolean;
};

/** Repairs the local preview. The design is changed only when Apply repair is chosen. */
export function StudioImageRepair({ original, source, onApply, onClose, busy = false }: StudioImageRepairProps) {
  const titleId = useId();
  const helpId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<HTMLCanvasElement | null>(null);
  const initialRef = useRef<ImageData | null>(null);
  const historyRef = useRef<BrushSnapshot[]>([]);
  const strokeRef = useRef<{ id: number; point: Point; before: ImageData; wasDirty: boolean; history: BrushSnapshot[] } | null>(null);
  const closeRef = useRef(onClose);
  const [mode, setMode] = useState<BrushMode>("erase");
  const [brushSize, setBrushSize] = useState(48);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [error, setError] = useState("");
  const disabled = busy || loading || Boolean(error);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      strokeRef.current = null;
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    originalRef.current = null;
    initialRef.current = null;
    historyRef.current = [];
    strokeRef.current = null;
    setLoading(true);
    setError("");
    setDirty(false);
    setUndoCount(0);
    const load = async () => {
      const currentImage = new Image();
      const originalImage = new Image();
      currentImage.src = source;
      originalImage.src = original || source;
      await Promise.all([currentImage.decode(), originalImage.decode()]);
      if (cancelled) return;
      if (!currentImage.naturalWidth || !currentImage.naturalHeight) throw new Error("The image has no visible dimensions.");
      const scale = Math.min(1, 1024 / Math.max(currentImage.naturalWidth, currentImage.naturalHeight));
      const width = Math.max(1, Math.round(currentImage.naturalWidth * scale));
      const height = Math.max(1, Math.round(currentImage.naturalHeight * scale));
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const originalCanvas = document.createElement("canvas");
      originalCanvas.width = width;
      originalCanvas.height = height;
      const originalContext = originalCanvas.getContext("2d");
      if (!context || !originalContext) throw new Error("Image repair is unavailable in this browser.");
      context.clearRect(0, 0, width, height);
      context.drawImage(currentImage, 0, 0, width, height);
      originalContext.drawImage(originalImage, 0, 0, width, height);
      initialRef.current = context.getImageData(0, 0, width, height);
      originalRef.current = originalCanvas;
      setLoading(false);
    };
    void load().catch(() => {
      if (cancelled) return;
      setError("Could not open this image for repair. Try replacing it with a local PNG, JPEG or WebP image.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [original, source]);

  function pointerPoint(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width),
      y: (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height),
    };
  }

  function paint(from: Point, to: Point) {
    const context = canvasRef.current?.getContext("2d");
    const originalCanvas = originalRef.current;
    if (!context || !originalCanvas) return;
    const radius = brushSize / 2;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 3)));
    context.save();
    if (mode === "erase") {
      context.globalCompositeOperation = "destination-out";
      context.lineWidth = brushSize;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      // A zero-length stroke is not painted consistently by every canvas implementation.
      context.beginPath();
      context.arc(to.x, to.y, radius, 0, Math.PI * 2);
      context.fill();
    } else {
      // Clear first so restoration copies original alpha as well as RGB values.
      context.beginPath();
      for (let index = 0; index <= steps; index++) {
        const x = from.x + (to.x - from.x) * index / steps;
        const y = from.y + (to.y - from.y) * index / steps;
        context.moveTo(x + radius, y);
        context.arc(x, y, radius, 0, Math.PI * 2);
      }
      context.clip();
      context.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
      context.drawImage(originalCanvas, 0, 0);
    }
    context.restore();
  }

  function cancelStroke() {
    const stroke = strokeRef.current;
    const canvas = canvasRef.current;
    if (!stroke || !canvas) return;
    strokeRef.current = null;
    canvas.getContext("2d")?.putImageData(stroke.before, 0, 0);
    historyRef.current = stroke.history;
    setUndoCount(historyRef.current.length);
    setDirty(stroke.wasDirty);
    if (canvas.hasPointerCapture(stroke.id)) canvas.releasePointerCapture(stroke.id);
  }

  function undoBrush() {
    if (disabled || strokeRef.current) return;
    const previous = historyRef.current.pop();
    if (!previous) return;
    canvasRef.current?.getContext("2d")?.putImageData(previous.pixels, 0, 0);
    setUndoCount(historyRef.current.length);
    setDirty(previous.dirty);
  }

  function resetPreview() {
    if (disabled || !initialRef.current) return;
    cancelStroke();
    canvasRef.current?.getContext("2d")?.putImageData(initialRef.current, 0, 0);
    historyRef.current = [];
    setUndoCount(0);
    setDirty(false);
  }

  function applyRepair() {
    if (disabled || !dirty || !canvasRef.current) return;
    try {
      onApply(canvasRef.current.toDataURL("image/png"));
      onClose();
    } catch {
      setError("The repaired image could not be saved. Try a smaller local image.");
    }
  }

  return <dialog ref={dialogRef} className="uxui-image-repair" aria-labelledby={titleId} aria-describedby={helpId}
    onCancel={event => { event.preventDefault(); closeRef.current(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        undoBrush();
      }
    }}>
    <div className="uxui-image-repair-content">
      <header className="uxui-image-repair-heading">
        <div><h2 id={titleId}>Repair background removal</h2><p id={helpId}>Erase leftover background or restore parts of your original image. Apply when you are happy with the result.</p></div>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
      </header>
      <div className="uxui-image-repair-tools">
        <div role="group" aria-label="Repair brush mode" className="uxui-image-repair-modes">
          <button type="button" aria-pressed={mode === "erase"} onClick={() => setMode("erase")} disabled={disabled}>Erase</button>
          <button type="button" aria-pressed={mode === "restore"} onClick={() => setMode("restore")} disabled={disabled}>Restore</button>
        </div>
        <label className="uxui-image-repair-brush">Brush size
          <input type="range" min={4} max={160} step={2} value={brushSize} disabled={disabled} onChange={event => setBrushSize(Number(event.target.value))} />
          <input type="number" aria-label="Repair brush size" min={4} max={160} step={2} value={brushSize} disabled={disabled} onChange={event => setBrushSize(Math.min(160, Math.max(4, Number(event.target.value) || 4)))} />
        </label>
        <button type="button" disabled={disabled || !undoCount} onClick={undoBrush}>Undo brush</button>
        <button type="button" disabled={disabled || !dirty} onClick={resetPreview}>Reset repair</button>
      </div>
      <div className="uxui-image-repair-stage" aria-busy={loading}>
        <canvas ref={canvasRef} role="img" aria-label="Image repair preview. Drag to erase or restore with the selected brush." tabIndex={0}
          onPointerDown={event => {
            if (disabled || event.button !== 0 || !event.isPrimary) return;
            const canvas = event.currentTarget;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) return;
            event.preventDefault();
            const point = pointerPoint(event);
            const before = context.getImageData(0, 0, canvas.width, canvas.height);
            const history = historyRef.current;
            historyRef.current = [...history.slice(-5), { pixels: before, dirty }];
            strokeRef.current = { id: event.pointerId, point, before, wasDirty: dirty, history };
            setUndoCount(historyRef.current.length);
            canvas.setPointerCapture(event.pointerId);
            canvas.focus({ preventScroll: true });
            paint(point, point);
            setDirty(true);
          }}
          onPointerMove={event => {
            const stroke = strokeRef.current;
            if (!stroke || stroke.id !== event.pointerId || disabled) return;
            event.preventDefault();
            const point = pointerPoint(event);
            paint(stroke.point, point);
            stroke.point = point;
          }}
          onPointerUp={event => {
            if (strokeRef.current?.id !== event.pointerId) return;
            strokeRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={cancelStroke} onLostPointerCapture={cancelStroke} />
        {loading && <p role="status">Opening image…</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <footer className="uxui-image-repair-footer">
        <span>Checkerboard areas are transparent. Your original stays available.</span>
        <button type="button" className="uxui-image-repair-apply" onClick={applyRepair} disabled={disabled || !dirty}>Apply repair</button>
      </footer>
    </div>
  </dialog>;
}
