import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadBlob, formatFileSize } from "@/lib/utils";

type Img = { file: File; url: string; el: HTMLImageElement };

async function loadImage(file: File): Promise<Img> {
  const url = URL.createObjectURL(file);
  const el = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image. Try JPG, PNG, or WebP."));
    img.src = url;
  });
  return { file, url, el };
}

function canvasFrom(img: HTMLImageElement, w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  return { canvas, ctx };
}

function applyConvolution(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kernel: number[],
  divisor?: number,
) {
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const k = kernel;
  const div = divisor ?? (k.reduce((a, b) => a + b, 0) || 1);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        let ki = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const i = ((y + ky) * w + (x + kx)) * 4 + c;
            acc += src.data[i] * k[ki++];
          }
        }
        dst.data[(y * w + x) * 4 + c] = Math.max(0, Math.min(255, acc / div));
      }
      dst.data[(y * w + x) * 4 + 3] = src.data[(y * w + x) * 4 + 3];
    }
  }
  ctx.putImageData(dst, 0, 0);
}

const SOCIAL: Record<string, [number, number]> = {
  "ig-square": [1080, 1080],
  "ig-portrait": [1080, 1350],
  "ig-landscape": [1080, 566],
  tiktok: [1080, 1920],
  yt: [1280, 720],
  x: [1600, 900],
  linkedin: [1200, 627],
  pinterest: [1000, 1500],
  facebook: [1200, 630],
};

export function ImageEngine({ op }: { op: string }) {
  const [img, setImg] = useState<Img | null>(null);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quality, setQuality] = useState(0.8);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [text, setText] = useState("enV");
  const [angle, setAngle] = useState("90");
  const [preset, setPreset] = useState("ig-square");
  const outRef = useRef<HTMLAnchorElement>(null);

  const onFiles = async (files: File[]) => {
    try {
      setError(null);
      const loaded = await loadImage(files[0]);
      if (img) URL.revokeObjectURL(img.url);
      if (outUrl) URL.revokeObjectURL(outUrl);
      setImg(loaded);
      setOutUrl(null);
      setWidth(String(loaded.el.naturalWidth));
      setHeight(String(loaded.el.naturalHeight));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that file.");
    }
  };

  const process = async () => {
    if (!img) {
      setError("Add an image first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const src = img.el;
      let w = src.naturalWidth;
      let h = src.naturalHeight;
      if (op === "resize" || op === "social-resize" || op === "pfp" || op === "favicon" || op === "to-ico") {
        if (op === "social-resize") {
          const [pw, ph] = SOCIAL[preset];
          w = pw;
          h = ph;
        } else if (op === "pfp") {
          const s = Math.min(w, h, 800);
          w = s;
          h = s;
        } else if (op === "favicon" || op === "to-ico") {
          w = 32;
          h = 32;
        } else {
          w = Number(width) || w;
          h = Number(height) || h;
        }
      }
      const { canvas, ctx } = canvasFrom(src, w, h);
      if (op === "circle" || op === "pfp") {
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
      }
      if (op === "rounded") {
        const r = Math.min(w, h) * 0.12;
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, r);
        ctx.clip();
      }
      if (op === "rotate") {
        const deg = Number(angle) || 0;
        const rad = (deg * Math.PI) / 180;
        const nw = Math.abs(Math.cos(rad) * w) + Math.abs(Math.sin(rad) * h);
        const nh = Math.abs(Math.sin(rad) * w) + Math.abs(Math.cos(rad) * h);
        canvas.width = nw;
        canvas.height = nh;
        ctx.translate(nw / 2, nh / 2);
        ctx.rotate(rad);
        ctx.drawImage(src, -w / 2, -h / 2, w, h);
      } else if (op === "flip") {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(src, 0, 0, w, h);
      } else if (op === "crop") {
        const side = Math.min(src.naturalWidth, src.naturalHeight);
        const sx = (src.naturalWidth - side) / 2;
        const sy = (src.naturalHeight - side) / 2;
        canvas.width = side;
        canvas.height = side;
        ctx.drawImage(src, sx, sy, side, side, 0, 0, side, side);
      } else {
        ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      }

      if (op === "grayscale" || op === "invert" || op === "levels") {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = data.data;
        for (let i = 0; i < d.length; i += 4) {
          if (op === "grayscale") {
            const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            d[i] = d[i + 1] = d[i + 2] = g;
          } else if (op === "invert") {
            d[i] = 255 - d[i];
            d[i + 1] = 255 - d[i + 1];
            d[i + 2] = 255 - d[i + 2];
          } else {
            d[i] = Math.min(255, d[i] * 1.1 + 10);
            d[i + 1] = Math.min(255, d[i + 1] * 1.1 + 10);
            d[i + 2] = Math.min(255, d[i + 2] * 1.1 + 10);
          }
        }
        ctx.putImageData(data, 0, 0);
      }
      if (op === "blur") applyConvolution(ctx, canvas.width, canvas.height, [1, 2, 1, 2, 4, 2, 1, 2, 1], 16);
      if (op === "sharpen") applyConvolution(ctx, canvas.width, canvas.height, [0, -1, 0, -1, 5, -1, 0, -1, 0], 1);
      if (op === "watermark" || op === "meme") {
        ctx.fillStyle = "rgba(0,0,0,.45)";
        const size = Math.max(18, canvas.width / 18);
        ctx.font = `700 ${size}px Outfit, sans-serif`;
        ctx.textAlign = "center";
        if (op === "meme") {
          ctx.strokeStyle = "#000";
          ctx.lineWidth = size / 8;
          ctx.fillStyle = "#fff";
          ctx.textBaseline = "top";
          ctx.strokeText(text.toUpperCase(), canvas.width / 2, 16);
          ctx.fillText(text.toUpperCase(), canvas.width / 2, 16);
        } else {
          ctx.fillStyle = "rgba(255,255,255,.85)";
          ctx.textBaseline = "bottom";
          ctx.fillText(text, canvas.width / 2, canvas.height - 16);
        }
      }
      if (op === "border" || op === "beautify") {
        const pad = op === "beautify" ? Math.round(canvas.width * 0.08) : 16;
        const next = document.createElement("canvas");
        next.width = canvas.width + pad * 2;
        next.height = canvas.height + pad * 2;
        const nctx = next.getContext("2d");
        if (!nctx) throw new Error("Canvas is not supported in this browser.");
        nctx.fillStyle = op === "beautify" ? "#efece6" : "#16181d";
        nctx.fillRect(0, 0, next.width, next.height);
        if (op === "beautify") {
          nctx.shadowColor = "rgba(22,24,29,.25)";
          nctx.shadowBlur = 24;
          nctx.shadowOffsetY = 8;
        }
        nctx.drawImage(canvas, pad, pad);
        canvas.width = next.width;
        canvas.height = next.height;
        ctx.drawImage(next, 0, 0);
      }
      if (op === "palette" || op === "pick-color") {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const buckets = new Map<string, number>();
        for (let i = 0; i < data.length; i += 4 * 24) {
          const key = [data[i], data[i + 1], data[i + 2]].map((n) => Math.round(n / 32) * 32).join(",");
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        const top = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
        const hexes = top.map(([k]) => {
          const [r, g, b] = k.split(",").map(Number);
          return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
        });
        setOutUrl("palette:" + hexes.join(" "));
        setBusy(false);
        return;
      }
      if (op === "exif-view") {
        const buf = await img.file.arrayBuffer();
        const info = `Name: ${img.file.name}\nType: ${img.file.type}\nSize: ${formatFileSize(img.file.size)}\nPixels: ${src.naturalWidth} × ${src.naturalHeight}\nBytes: ${buf.byteLength}\nNote: Full EXIF decode is limited in-browser; re-encoding (EXIF remover) strips metadata.`;
        setOutUrl("text:" + info);
        setBusy(false);
        return;
      }

      const mime =
        op === "to-png" || op === "circle" || op === "rounded" || op === "pfp" || op === "favicon"
          ? "image/png"
          : op === "to-webp"
            ? "image/webp"
            : "image/jpeg";
      const q = op === "compress" || op === "exif-strip" ? quality : 0.92;
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))), mime, q);
      });
      if (outUrl && outUrl.startsWith("blob:")) URL.revokeObjectURL(outUrl);
      setOutUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Processing failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <FileDropzone
        accept="image/*"
        label="Drop an image or browse"
        hint="JPG, PNG, or WebP · processed locally"
        onFiles={onFiles}
      />
      {img ? (
        <p className="text-xs text-muted">
          {img.file.name} · {img.el.naturalWidth}×{img.el.naturalHeight} · {formatFileSize(img.file.size)}
        </p>
      ) : null}
      {(op === "resize") && (
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <Label>Width</Label>
            <Input value={width} onChange={(e) => setWidth(e.target.value)} inputMode="numeric" />
          </label>
          <label className="space-y-1.5">
            <Label>Height</Label>
            <Input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="numeric" />
          </label>
        </div>
      )}
      {op === "social-resize" && (
        <label className="space-y-1.5">
          <Label>Preset</Label>
          <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
            {Object.keys(SOCIAL).map((k) => (
              <option key={k} value={k}>
                {k} ({SOCIAL[k].join("×")})
              </option>
            ))}
          </Select>
        </label>
      )}
      {(op === "compress" || op === "exif-strip") && (
        <label className="space-y-1.5">
          <Label>Quality {Math.round(quality * 100)}%</Label>
          <input
            type="range"
            min={0.3}
            max={0.95}
            step={0.05}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full"
          />
        </label>
      )}
      {(op === "watermark" || op === "meme") && (
        <label className="space-y-1.5">
          <Label>{op === "meme" ? "Caption" : "Watermark text"}</Label>
          <Input value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      {op === "rotate" && (
        <label className="space-y-1.5">
          <Label>Angle</Label>
          <Input value={angle} onChange={(e) => setAngle(e.target.value)} />
        </label>
      )}
      <Button type="button" onClick={process} disabled={busy || !img}>
        {busy ? "Working…" : "Process image"}
      </Button>
      <ErrorBanner message={error} />
      {outUrl?.startsWith("palette:") ? (
        <div className="grid grid-cols-4 gap-2">
          {outUrl.slice(8).split(" ").map((c) => (
            <div key={c} className="overflow-hidden rounded-md">
              <div className="h-14" style={{ background: c }} />
              <p className="px-1 py-1 font-mono text-[11px]">{c}</p>
            </div>
          ))}
        </div>
      ) : outUrl?.startsWith("text:") ? (
        <pre className="rounded-lg bg-surface-2 p-3 text-xs whitespace-pre-wrap">{outUrl.slice(5)}</pre>
      ) : outUrl ? (
        <div className="space-y-3">
          <img src={outUrl} alt="Result" className="max-h-80 rounded-lg outline outline-1 -outline-offset-1 outline-black/10" />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              const res = await fetch(outUrl);
              downloadBlob(await res.blob(), `env-${op}.jpg`);
            }}
          >
            <Download className="size-4" />
            Download
          </Button>
          <a ref={outRef} href={outUrl} className="sr-only">
            result
          </a>
        </div>
      ) : img ? (
        <img src={img.url} alt="Original" className="max-h-64 rounded-lg outline outline-1 -outline-offset-1 outline-black/10" />
      ) : null}
    </div>
  );
}
