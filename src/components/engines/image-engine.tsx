import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadBlob, formatFileSize } from "@/lib/utils";
import { calculateSplitTiles } from "@/components/engines/image-splitter-utils";

type LoadedImage = { file: File; url: string; el: HTMLImageElement };

const SOCIAL: Record<string, Record<string, [number, number]>> = {
  instagram: { image: [1080, 1080], profile: [320, 320], banner: [1080, 566], post: [1080, 1080], story: [1080, 1920], thumbnail: [1080, 1080], cover: [1080, 566], square: [1080, 1080], portrait: [1080, 1350], landscape: [1080, 566] },
  tiktok: { image: [1080, 1920], profile: [200, 200], banner: [1080, 1920], post: [1080, 1920], story: [1080, 1920], thumbnail: [1080, 1920], cover: [1080, 1920], square: [1080, 1080], portrait: [1080, 1350], landscape: [1920, 1080] },
  youtube: { image: [1280, 720], profile: [800, 800], banner: [2560, 1440], post: [1280, 720], story: [1080, 1920], cover: [2560, 1440], square: [1080, 1080], portrait: [1080, 1350], landscape: [1280, 720] },
  facebook: { image: [1200, 630], profile: [320, 320], banner: [1640, 856], post: [1200, 630], story: [1080, 1920], thumbnail: [1200, 630], cover: [1640, 856], square: [1080, 1080], portrait: [1080, 1350], landscape: [1200, 630] },
  x: { image: [1600, 900], profile: [400, 400], banner: [1500, 500], post: [1600, 900], story: [1080, 1920], thumbnail: [1600, 900], cover: [1500, 500], square: [1080, 1080], portrait: [1080, 1350], landscape: [1600, 900] },
  linkedin: { image: [1200, 627], profile: [400, 400], banner: [1584, 396], post: [1200, 627], story: [1080, 1920], cover: [1584, 396], square: [1080, 1080], portrait: [1080, 1350], landscape: [1200, 627] },
  pinterest: { image: [1000, 1500], profile: [165, 165], post: [1000, 1500], story: [1080, 1920], thumbnail: [1000, 1500], cover: [1000, 1500], square: [1000, 1000], portrait: [1000, 1500], landscape: [1000, 1000] },
  snapchat: { image: [1080, 1920], profile: [320, 320], post: [1080, 1920], story: [1080, 1920], cover: [1080, 1920], square: [1080, 1080], portrait: [1080, 1350], landscape: [1920, 1080] },
  threads: { image: [1080, 1350], profile: [320, 320], post: [1080, 1350], story: [1080, 1920], cover: [1080, 1350], square: [1080, 1080], portrait: [1080, 1350], landscape: [1920, 1080] },
  discord: { image: [1280, 720], profile: [512, 512], banner: [960, 540], post: [1280, 720], story: [1080, 1920], cover: [960, 540], square: [1080, 1080], portrait: [1080, 1350], landscape: [1280, 720] },
  reddit: { image: [1200, 628], profile: [256, 256], post: [1200, 628], thumbnail: [400, 400], cover: [1920, 384], square: [1080, 1080], portrait: [1080, 1350], landscape: [1200, 628] },
  twitch: { image: [1920, 1080], profile: [256, 256], banner: [1200, 480], post: [1920, 1080], thumbnail: [1280, 720], cover: [1200, 480], square: [1080, 1080], portrait: [1080, 1350], landscape: [1920, 1080] },
};

const PLATFORM_ALIASES: Record<string, string> = { "x": "x", twitter: "x" };

async function loadImage(file: File): Promise<LoadedImage> {
  const url = URL.createObjectURL(file);
  try {
    const el = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("This browser could not decode the image. Try JPG, PNG, WebP, or a browser with native support for this format."));
      img.src = url;
    });
    return { file, url, el };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasFrom(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  return { canvas, ctx };
}

function safeNumber(value: string, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function aspect(w: number, h: number) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
  const g = gcd(Math.round(w), Math.round(h));
  return `${Math.round(w) / g}:${Math.round(h) / g}`;
}

function bytesText(bytes: number) {
  return `${formatFileSize(bytes)} (${bytes.toLocaleString()} bytes)`;
}

function getSocialPreset(op: string): [number, number] | null {
  const match = op.match(/^([a-z]+)-(.+)$/);
  if (!match) return null;
  const platform = PLATFORM_ALIASES[match[1]] || match[1];
  const table = SOCIAL[platform];
  if (!table) return null;
  const action = match[2];
  const key = action.includes("profile") ? "profile" : action.includes("banner") ? "banner" : action.includes("story") ? "story" : action.includes("thumbnail") ? "thumbnail" : action.includes("cover") ? "cover" : action.includes("square") ? "square" : action.includes("portrait") ? "portrait" : action.includes("landscape") ? "landscape" : action.includes("post") ? "post" : "image";
  return table[key] || null;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export function ImageEngine({ op }: { op: string }) {
  const [images, setImages] = useState<LoadedImage[]>([]);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [splitOutputs, setSplitOutputs] = useState<{url:string;name:string}[]>([]);
  const [textResult, setTextResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quality, setQuality] = useState(0.8);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [percent, setPercent] = useState("100");
  const [text, setText] = useState("enV");
  const [angle, setAngle] = useState("90");
  const [splitCols, setSplitCols] = useState("2");
  const [splitRows, setSplitRows] = useState("2");
  const [preset, setPreset] = useState("instagram");
  const [bgThreshold, setBgThreshold] = useState("35");
  const [copied, setCopied] = useState(false);
  const outRef = useRef<HTMLAnchorElement>(null);

  const multiple = useMemo(() => /merge|contact|comparison|before-after|grid|strip|batch|splitter/.test(op), [op]);

  useEffect(() => () => {
    images.forEach((i) => URL.revokeObjectURL(i.url));
    if (outUrl?.startsWith("blob:")) URL.revokeObjectURL(outUrl);
    splitOutputs.forEach(part => URL.revokeObjectURL(part.url));
  }, [images, outUrl, splitOutputs]);

  const onFiles = async (files: File[]) => {
    try {
      setError(null);
      setTextResult(null);
      setSplitOutputs([]);
      if (outUrl?.startsWith("blob:")) URL.revokeObjectURL(outUrl);
      const selected = multiple ? files.slice(0, 20) : files.slice(0, 1);
      const loaded = await Promise.all(selected.map(loadImage));
      images.forEach((i) => URL.revokeObjectURL(i.url));
      setImages(loaded);
      setOutUrl(null);
      setSplitOutputs([]);
      if (loaded[0]) {
        setWidth(String(loaded[0].el.naturalWidth));
        setHeight(String(loaded[0].el.naturalHeight));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that image.");
    }
  };

  const process = async () => {
    if (!images[0]) { setError("Add an image first."); return; }
    setBusy(true); setError(null); setTextResult(null);
    try {
      const src = images[0].el;
      let social = getSocialPreset(op);
      if (op === "social-resize") {
        social = SOCIAL[preset]?.image ?? null;
      }
      if (social) { setWidth(String(social[0])); setHeight(String(social[1])); }

      // Metadata / calculation tools don't need re-encoding.
      if (op.includes("file-size-calculator")) {
        setTextResult(`${images.length > 1 ? `${images.length} files\n` : ""}${images.map((i) => `${i.file.name}: ${bytesText(i.file.size)}`).join("\n")}`); return;
      }
      if (op.includes("aspect-ratio-calculator")) { setTextResult(`Dimensions: ${src.naturalWidth} × ${src.naturalHeight}\nAspect ratio: ${aspect(src.naturalWidth, src.naturalHeight)}`); return; }
      if (op.includes("dimension-calculator")) { setTextResult(`Width: ${src.naturalWidth}px\nHeight: ${src.naturalHeight}px\nPixels: ${(src.naturalWidth * src.naturalHeight).toLocaleString()}\nAspect ratio: ${aspect(src.naturalWidth, src.naturalHeight)}`); return; }
      if (op.includes("ppi-calculator") || op.includes("dpi-calculator") || op.includes("print-size-calculator")) {
        const dpi = safeNumber(width || "300", 300);
        setTextResult(`At ${dpi} DPI/PPI:\nPrint width: ${(src.naturalWidth / dpi).toFixed(2)} in\nPrint height: ${(src.naturalHeight / dpi).toFixed(2)} in\nPrint size: ${(src.naturalWidth / dpi * 2.54).toFixed(2)} × ${(src.naturalHeight / dpi * 2.54).toFixed(2)} cm`); return;
      }
      if (op === "splitter") {
        const cols = Math.floor(Number(splitCols) || 1);
        const rows = Math.floor(Number(splitRows) || 1);
        const outputs: {url:string;name:string}[] = [];
        const base = images[0].file.name.replace(/\.[^.]+$/, "");
        const tiles = calculateSplitTiles(src.naturalWidth, src.naturalHeight, rows, cols);
        for (const tileInfo of tiles) {
            const x0 = tileInfo.x, y0 = tileInfo.y, x1 = tileInfo.x + tileInfo.width, y1 = tileInfo.y + tileInfo.height;
            const tile = document.createElement("canvas");
            tile.width = tileInfo.width; tile.height = tileInfo.height;
            const tctx = tile.getContext("2d");
            if (!tctx) throw new Error("Canvas is not supported in this browser.");
            tctx.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, tile.width, tile.height);
            const blob = await new Promise<Blob>((resolve, reject) => tile.toBlob(b => b ? resolve(b) : reject(new Error("Could not encode split image.")), "image/png"));
            outputs.push({ url: URL.createObjectURL(blob), name: `${base}-part-${tileInfo.row + 1}-${tileInfo.column + 1}.png` });
        }
        setSplitOutputs(outputs);
        setTextResult(`Split ${src.naturalWidth} × ${src.naturalHeight} image into ${outputs.length} PNG tiles (${cols} columns × ${rows} rows).`);
        return;
      }

      if (op.includes("metadata-inspector") || op === "exif-view") {
        setTextResult(`File: ${images[0].file.name}\nType: ${images[0].file.type || "unknown"}\nSize: ${bytesText(images[0].file.size)}\nDimensions: ${src.naturalWidth} × ${src.naturalHeight}\nNote: Full EXIF decoding depends on the browser. Re-encoding below strips common embedded metadata.`); return;
      }
      if (op.includes("transparency-checker")) {
        const { canvas, ctx } = canvasFrom(Math.min(src.naturalWidth, 500), Math.min(src.naturalHeight, 500));
        ctx.drawImage(src, 0, 0, canvas.width, canvas.height); const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let transparent = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] < 255) transparent++;
        setTextResult(`Transparent / semi-transparent pixels: ${((transparent / (d.length / 4)) * 100).toFixed(2)}%\nAlpha channel detected: ${transparent > 0 ? "Yes" : "No"}`); return;
      }
      if (op.includes("histogram-viewer")) {
        const { canvas, ctx } = canvasFrom(Math.min(src.naturalWidth, 600), Math.min(src.naturalHeight, 600)); ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data; const bins = Array(8).fill(0);
        for (let i=0;i<d.length;i+=4) bins[Math.min(7, Math.floor(((d[i]+d[i+1]+d[i+2])/3)/32))]++;
        setTextResult(`Brightness histogram (8 bins):\n${bins.map((n,i)=>`${i*32}–${i===7?255:i*32+31}: ${n.toLocaleString()}`).join("\n")}`); return;
      }

      if (op.includes("merge") || op.includes("strip") || op.includes("grid") || op.includes("contact-sheet")) {
        if (images.length < 2) throw new Error("Add at least 2 images for this tool.");
        const cellW = Math.max(...images.map(i => i.el.naturalWidth)); const cellH = Math.max(...images.map(i => i.el.naturalHeight));
        const cols = op.includes("strip") ? images.length : op.includes("grid") || op.includes("contact-sheet") ? Math.ceil(Math.sqrt(images.length)) : 1;
        const rows = Math.ceil(images.length / cols); const {canvas,ctx}=canvasFrom(cellW*cols,cellH*rows); ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
        images.forEach((i,idx)=>{ const x=(idx%cols)*cellW; const y=Math.floor(idx/cols)*cellH; ctx.save(); ctx.translate(x,y); drawContain(ctx,i.el,cellW,cellH); ctx.restore(); });
        if (op.includes("grid") || op.includes("contact-sheet") || op.includes("merge") || op.includes("strip")) {
          const final = document.createElement("canvas"); final.width=cellW*cols; final.height=cellH*rows; const f=final.getContext("2d")!; f.fillStyle="#fff";f.fillRect(0,0,final.width,final.height);
          images.forEach((i,idx)=>{ const x=(idx%cols)*cellW; const y=Math.floor(idx/cols)*cellH; f.save(); f.translate(x,y); drawContain(f,i.el,cellW,cellH); f.restore(); });
          const blob=await new Promise<Blob>((r,j)=>final.toBlob(b=>b?r(b):j(new Error("Could not encode image.")),"image/png"));
          setOutUrl(URL.createObjectURL(blob)); return;
        }
      }

      let w = social?.[0] ?? safeNumber(width, src.naturalWidth);
      let h = social?.[1] ?? safeNumber(height, src.naturalHeight);
      if (op.includes("percent")) { const p=safeNumber(percent,100)/100; w=Math.max(1,Math.round(src.naturalWidth*p)); h=Math.max(1,Math.round(src.naturalHeight*p)); }
      if (op.includes("square") || op.includes("circle") || op.includes("profile")) { const s=Math.min(src.naturalWidth,src.naturalHeight,1200); w=s;h=s; }
      if (op.includes("portrait") && !social) { w=1080;h=1350; }
      if (op.includes("landscape") && !social) { w=1280;h=720; }
      if (op.includes("story") && !social) { w=1080;h=1920; }
      if (op.includes("thumbnail") && !social) { w=1280;h=720; }
      if (op.includes("banner") || op.includes("cover")) { if (!social) { w=1500;h=500; } }
      if (op.includes("favicon") || op.includes("ico")) { w=32;h=32; }
      if (op.includes("upscaler")) { const scale=Math.max(1.5,Math.min(4,safeNumber(percent,200)/100)); w=Math.round(src.naturalWidth*scale);h=Math.round(src.naturalHeight*scale); }

      const {canvas,ctx}=canvasFrom(w,h); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality="high";
      if (op === "beautify") {
        const pad=Math.max(24,Math.round(Math.min(w,h)*.08));
        const innerW=w, innerH=h; w+=pad*2; h+=pad*2; canvas.width=w; canvas.height=h;
        ctx.fillStyle="#eef1f5";ctx.fillRect(0,0,w,h);
        ctx.fillStyle="rgba(0,0,0,.16)";ctx.beginPath();ctx.roundRect(pad+8,pad+12,innerW,innerH,Math.min(innerW,innerH)*.05);ctx.fill();
        ctx.save();ctx.translate(pad,pad);drawContain(ctx,src,innerW,innerH);ctx.restore();
      } else {
        if (op.includes("circle")) { ctx.beginPath();ctx.arc(w/2,h/2,Math.min(w,h)/2,0,Math.PI*2);ctx.clip(); }
        if (op.includes("rounded")) { const r=Math.min(w,h)*.12;ctx.beginPath();ctx.roundRect(0,0,w,h,r);ctx.clip(); }
        if (op.includes("crop")) drawCover(ctx,src,w,h); else drawContain(ctx,src,w,h);
      }

      if (op.includes("flip-horizontal")) { ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w,0);ctx.scale(-1,1);drawContain(ctx,src,w,h);ctx.restore(); }
      if (op.includes("flip-vertical")) { ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(0,h);ctx.scale(1,-1);drawContain(ctx,src,w,h);ctx.restore(); }
      if (op.includes("rotate")) { const deg=Number(angle)||90; const rad=deg*Math.PI/180; const nw=Math.ceil(Math.abs(Math.cos(rad)*w)+Math.abs(Math.sin(rad)*h)); const nh=Math.ceil(Math.abs(Math.sin(rad)*w)+Math.abs(Math.cos(rad)*h)); const r=canvasFrom(nw,nh); r.ctx.translate(nw/2,nh/2);r.ctx.rotate(rad);r.ctx.drawImage(canvas,-w/2,-h/2);canvas.width=nw;canvas.height=nh;ctx.drawImage(r.canvas,0,0);w=nw;h=nh; }

      const imageData=ctx.getImageData(0,0,canvas.width,canvas.height); const d=imageData.data;
      if (op.includes("grayscale")) for(let i=0;i<d.length;i+=4){const g=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];d[i]=d[i+1]=d[i+2]=g;}
      if (op.includes("invert")) for(let i=0;i<d.length;i+=4){d[i]=255-d[i];d[i+1]=255-d[i+1];d[i+2]=255-d[i+2];}
      if (op.includes("levels") || op.includes("brightness") || op.includes("contrast")) for(let i=0;i<d.length;i+=4){for(let c=0;c<3;c++){const x=d[i+c];d[i+c]=Math.max(0,Math.min(255,(x-128)*1.12+128+10));}}
      if (op.includes("pixelation") || op.includes("redaction")) { const block=Math.max(8,Math.round(Math.min(w,h)/30)); for(let y=0;y<h;y+=block) for(let x=0;x<w;x+=block){const p=(y*w+x)*4;ctx.fillStyle=op.includes("redaction")?"#111":`rgb(${d[p]},${d[p+1]},${d[p+2]})`;ctx.fillRect(x,y,block,block);} }
      if (op.includes("background-remover")) {
        const threshold=Math.max(5,Math.min(100,Number(bgThreshold)||35)); const corners=[0,(w-1)*4,(h-1)*w*4,(h*w-1)*4]; const samples=corners.map(p=>[d[p],d[p+1],d[p+2]]); const avg=samples.reduce((a,v)=>a.map((n,i)=>n+v[i]),[0,0,0]).map(n=>n/4);
        for(let i=0;i<d.length;i+=4){const dist=Math.sqrt((d[i]-avg[0])**2+(d[i+1]-avg[1])**2+(d[i+2]-avg[2])**2);if(dist<threshold*2)d[i+3]=0;}
      }
      ctx.putImageData(imageData,0,0);
      if (op.includes("border") || op.includes("shadow")) { ctx.strokeStyle="#111";ctx.lineWidth=Math.max(4,Math.round(Math.min(w,h)*.02));ctx.strokeRect(ctx.lineWidth/2,ctx.lineWidth/2,w-ctx.lineWidth,h-ctx.lineWidth); }
      if (op.includes("watermark") || op.includes("annotation") || op.includes("meme")) { const size=Math.max(18,w/20);ctx.font=`700 ${size}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="bottom";ctx.fillStyle="rgba(255,255,255,.9)";ctx.strokeStyle="rgba(0,0,0,.75)";ctx.lineWidth=Math.max(2,size/10);ctx.strokeText(text,w/2,h-16);ctx.fillText(text,w/2,h-16); }

      let mime="image/jpeg", ext="jpg";
      if (op.includes("png") || op.includes("favicon") || op.includes("circle") || op.includes("rounded") || op.includes("background-remover") || op.includes("alpha")) { mime="image/png";ext="png"; }
      if (op.includes("webp")) { mime="image/webp";ext="webp"; }
      if (op.includes("heic")) { mime="image/jpeg";ext="jpg"; }
      const q=op.includes("compress")||op.includes("exact-size")||op.includes("exif-strip")?quality:.92;
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not encode the image.")),mime,q));
      if(outUrl?.startsWith("blob:"))URL.revokeObjectURL(outUrl);setOutUrl(URL.createObjectURL(blob));
      setTextResult(null);
      void ext;
    } catch(e) { setError(e instanceof Error?e.message:"Processing failed."); }
    finally { setBusy(false); }
  };

  const copyText = async () => { if (!textResult) return; await navigator.clipboard?.writeText(textResult); setCopied(true); setTimeout(()=>setCopied(false),1200); };

  return <div className="space-y-4">
    <FileDropzone accept="image/*,.heic,.heif" multiple={multiple} label={multiple?"Drop images or browse":"Drop an image or browse"} hint={multiple?"Up to 20 images · processed locally":"JPG, PNG, WebP and browser-supported formats · processed locally"} onFiles={onFiles}/>
    {images.length>0?<p className="text-xs text-muted">{images.length} image{images.length===1?"":"s"} · {images.map(i=>`${i.file.name} (${i.el.naturalWidth}×${i.el.naturalHeight})`).join(" · ")}</p>:null}
    {(op.includes("resize")||op.includes("maker")||op.includes("upscaler")||op.includes("exact-size")||getSocialPreset(op)!==null)&&<div className="grid grid-cols-2 gap-3"><label className="space-y-1.5"><Label>Width</Label><Input value={width} onChange={e=>setWidth(e.target.value)} inputMode="numeric"/></label><label className="space-y-1.5"><Label>Height</Label><Input value={height} onChange={e=>setHeight(e.target.value)} inputMode="numeric"/></label></div>}
    {op.includes("upscaler")||op.includes("percent")?<label className="space-y-1.5"><Label>Scale / percent</Label><Input value={percent} onChange={e=>setPercent(e.target.value)} inputMode="decimal" placeholder="200"/></label>:null}
    {op.includes("compress")||op.includes("exif-strip")||op.includes("exact-size")?<label className="space-y-1.5"><Label>Quality {Math.round(quality*100)}%</Label><input type="range" min="0.25" max="0.95" step="0.05" value={quality} onChange={e=>setQuality(Number(e.target.value))} className="w-full"/></label>:null}
    {op.includes("background-remover")?<label className="space-y-1.5"><Label>Background sensitivity</Label><Input value={bgThreshold} onChange={e=>setBgThreshold(e.target.value)} inputMode="numeric"/></label>:null}
    {op.includes("watermark")||op.includes("annotation")||op.includes("meme")?<label className="space-y-1.5"><Label>Text</Label><Input value={text} onChange={e=>setText(e.target.value)}/></label>:null}
    {op.includes("rotate")?<label className="space-y-1.5"><Label>Angle</Label><Input value={angle} onChange={e=>setAngle(e.target.value)} inputMode="numeric"/></label>:null}
    {op.includes("social-resize")?<label className="space-y-1.5"><Label>Platform</Label><Select value={preset} onChange={e=>setPreset(e.target.value)}>{Object.keys(SOCIAL).map(k=><option key={k} value={k}>{k}</option>)}</Select></label>:null}
    {op === "splitter"?<div className="grid grid-cols-2 gap-3"><label className="space-y-1.5"><Label>Columns</Label><Input value={splitCols} onChange={e=>setSplitCols(e.target.value)} inputMode="numeric" min="1" max="12"/></label><label className="space-y-1.5"><Label>Rows</Label><Input value={splitRows} onChange={e=>setSplitRows(e.target.value)} inputMode="numeric" min="1" max="12"/></label></div>:null}
    <Button type="button" onClick={process} disabled={busy||!images[0]}>{busy?"Working…":"Process image"}</Button>
    <ErrorBanner message={error}/>
    {textResult?<div className="space-y-2"><pre className="rounded-lg bg-surface-2 p-3 text-xs whitespace-pre-wrap">{textResult}</pre><Button type="button" variant="outline" onClick={copyText}>{copied?<Check className="size-4"/>:<Copy className="size-4"/>}{copied?"Copied":"Copy result"}</Button></div>:null}
    {splitOutputs.length>0?<div className="flex flex-wrap gap-2 rounded-lg border border-border p-3">{splitOutputs.map(part=><a key={part.name} href={part.url} download={part.name}><Button type="button" variant="outline"><Download className="size-4"/>{part.name}</Button></a>)}</div>:null}
    {outUrl?<div className="space-y-3"><img src={outUrl} alt="Processed result" className="max-h-96 max-w-full rounded-lg outline outline-1 -outline-offset-1 outline-black/10"/><Button type="button" variant="outline" onClick={async()=>{const r=await fetch(outUrl);downloadBlob(await r.blob(),`env-${op}.jpg`);}}><Download className="size-4"/>Download</Button><a ref={outRef} href={outUrl} className="sr-only">result</a></div>:images[0]?<img src={images[0].url} alt="Original" className="max-h-72 max-w-full rounded-lg outline outline-1 -outline-offset-1 outline-black/10"/>:null}
  </div>;
}
