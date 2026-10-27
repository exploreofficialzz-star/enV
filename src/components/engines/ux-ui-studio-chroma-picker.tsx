import { useEffect, useRef, useState, type PointerEvent } from "react";

type Props = { source: string; color: string; picking: boolean; onPicking: (value: boolean) => void; onColor: (value: string) => void };

/** Sample original pixels with a loupe above the finger, including after a previous key. */
export function StudioChromaPicker({ source, color, picking, onPicking, onColor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pixelRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [sample, setSample] = useState<{ x: number; y: number; color: string } | null>(null);
  const activePointer = useRef<number | null>(null);

  useEffect(() => {
    let canceled = false;
    setReady(false); setError(""); setSample(null);
    const image = new Image(); image.src = source;
    void image.decode().then(() => {
      if (canceled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      imageRef.current = image;
      // Bound the preview buffer; sampling and the loupe still read original pixels.
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Image color sampling is unavailable.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height); setReady(true);
    }).catch(() => { if (!canceled) setError("Could not open the original image for sampling. You can still set Key color below."); });
    return () => { canceled = true; imageRef.current = null; };
  }, [source]);

  function read(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget, bounds = canvas.getBoundingClientRect();
    const image = imageRef.current;
    if (!image) return null;
    const x = Math.max(0, Math.min(image.naturalWidth - 1, Math.floor((event.clientX - bounds.left) * image.naturalWidth / Math.max(1, bounds.width))));
    const y = Math.max(0, Math.min(image.naturalHeight - 1, Math.floor((event.clientY - bounds.top) * image.naturalHeight / Math.max(1, bounds.height))));
    try {
      if (!pixelRef.current) { pixelRef.current = document.createElement("canvas"); pixelRef.current.width = 1; pixelRef.current.height = 1; }
      const context = pixelRef.current.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.clearRect(0, 0, 1, 1); context.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      if (!pixel[3]) { setSample(null); setError("This pixel is transparent. Choose a visible color."); return null; }
      const value = "#" + Array.from(pixel.slice(0, 3), channel => channel.toString(16).padStart(2, "0")).join("");
      setSample({ x, y, color: value }); setError("");
      const loupe = loupeRef.current?.getContext("2d");
      if (loupe) {
        loupe.clearRect(0, 0, 112, 112); loupe.imageSmoothingEnabled = false;
        loupe.drawImage(image, x - 3, y - 3, 7, 7, 0, 0, 112, 112);
        loupe.strokeStyle = "#fff"; loupe.lineWidth = 3; loupe.strokeRect(48, 48, 16, 16);
        loupe.strokeStyle = "#111"; loupe.lineWidth = 1; loupe.strokeRect(48, 48, 16, 16);
      }
      return value;
    } catch { setError("This image cannot be sampled. Use an imported PNG, JPEG or WebP image."); return null; }
  }

  return <section className="uxui-chroma-picker" aria-label="Pick chroma key from image">
    <button type="button" disabled={!ready} aria-pressed={picking} onClick={() => onPicking(!picking)}>{picking ? "Picking color · tap or drag on image" : "Pick color from image"}</button>
    <p>Tap the selected layer or use this original-image preview. Drag slowly to inspect pixels, then lift your finger to choose.</p>
    <div className="uxui-chroma-sample-readout" aria-live="polite"><span style={{ background: sample?.color || color }} />{sample ? sample.color + " · pixel " + sample.x + ", " + sample.y : color}<canvas ref={loupeRef} width={112} height={112} aria-label="Magnified color sample" /></div>
    <canvas ref={canvasRef} className={picking ? "is-picking" : ""} role="img" aria-label="Original image color picker" tabIndex={ready ? 0 : -1}
      onKeyDown={event => { if (event.key === "Escape") { onPicking(false); setSample(null); } }}
      onPointerDown={event => {
        if (!picking || !ready) return;
        event.preventDefault(); activePointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); read(event);
      }}
      onPointerMove={event => { if (activePointer.current === event.pointerId) read(event); }}
      onPointerUp={event => {
        if (activePointer.current !== event.pointerId) return;
        activePointer.current = null;
        const value = read(event); if (value) onColor(value);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { activePointer.current = null; setSample(null); }} />
    {error && <p role="status">{error}</p>}
  </section>;
}
