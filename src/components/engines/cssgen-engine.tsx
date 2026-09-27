import { useMemo, useState } from "react";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { initialValues } from "@/components/engines/initial-values";
import { CodeResult } from "@/components/engines/result-panel";

const BASE_FIELDS: Record<string, UiField[]> = {
  gradient: [
    { name: "from", label: "From", type: "text", defaultValue: "#0d9f8a" },
    { name: "to", label: "To", type: "text", defaultValue: "#1db87a" },
    { name: "angle", label: "Angle", type: "number", defaultValue: 135 },
  ],
  shadow: [
    { name: "x", label: "X", type: "number", defaultValue: 0 },
    { name: "y", label: "Y", type: "number", defaultValue: 8 },
    { name: "blur", label: "Blur", type: "number", defaultValue: 24 },
    { name: "spread", label: "Spread", type: "number", defaultValue: 0 },
    { name: "color", label: "Color", type: "text", defaultValue: "rgba(22,24,29,.18)" },
  ],
  border: [
    { name: "width", label: "Width", type: "number", defaultValue: 1 },
    { name: "radius", label: "Radius", type: "number", defaultValue: 16 },
    { name: "color", label: "Color", type: "text", defaultValue: "#e4e0d8" },
  ],
  button: [
    { name: "bg", label: "Background", type: "text", defaultValue: "#0d9f8a" },
    { name: "text", label: "Text", type: "text", defaultValue: "#ffffff" },
    { name: "radius", label: "Radius", type: "number", defaultValue: 10 },
    { name: "px", label: "Padding X", type: "number", defaultValue: 16 },
    { name: "py", label: "Padding Y", type: "number", defaultValue: 10 },
  ],
  card: [
    { name: "radius", label: "Radius", type: "number", defaultValue: 20 },
    { name: "pad", label: "Padding", type: "number", defaultValue: 20 },
    { name: "border", label: "Border color", type: "text", defaultValue: "#e7e5e4" },
  ],
  badge: [
    { name: "bg", label: "Background", type: "text", defaultValue: "#e8f7f3" },
    { name: "text", label: "Text", type: "text", defaultValue: "#087f6d" },
    { name: "radius", label: "Radius", type: "number", defaultValue: 999 },
    { name: "px", label: "Padding X", type: "number", defaultValue: 10 },
    { name: "py", label: "Padding Y", type: "number", defaultValue: 5 },
  ],
  input: [
    { name: "border", label: "Border", type: "text", defaultValue: "#d6d3d1" },
    { name: "radius", label: "Radius", type: "number", defaultValue: 10 },
    { name: "focus", label: "Focus color", type: "text", defaultValue: "#0d9f8a" },
  ],
  avatar: [
    { name: "size", label: "Size", type: "number", defaultValue: 96 },
    { name: "bg", label: "Background", type: "text", defaultValue: "#e7f7f3" },
    { name: "radius", label: "Radius %", type: "number", defaultValue: 50 },
  ],
  glass: [
    { name: "blur", label: "Blur", type: "number", defaultValue: 18 },
    { name: "alpha", label: "Tint alpha", type: "number", defaultValue: 0.16 },
    { name: "borderAlpha", label: "Border alpha", type: "number", defaultValue: 0.35 },
  ],
  neomorph: [
    { name: "size", label: "Size", type: "number", defaultValue: 120 },
    { name: "radius", label: "Radius", type: "number", defaultValue: 24 },
    { name: "dist", label: "Distance", type: "number", defaultValue: 10 },
  ],
  pattern: [
    { name: "color", label: "Pattern color", type: "text", defaultValue: "#0d9f8a" },
    { name: "size", label: "Size", type: "number", defaultValue: 24 },
    { name: "opacity", label: "Opacity", type: "number", defaultValue: 0.14 },
  ],
  blob: [{ name: "seed", label: "Seed", type: "number", defaultValue: 7 }],
  wave: [{ name: "amp", label: "Amplitude", type: "number", defaultValue: 24 }],
  noise: [{ name: "opacity", label: "Opacity", type: "number", defaultValue: 0.06 }],
};

function familyAndWorkflow(op: string) {
  const [family, workflow = "tool"] = op.split(":");
  return { family: family === "neumorphism" ? "neomorph" : family, workflow };
}

function cssFor(family: string, v: Record<string, string>) {
  if (family === "gradient") {
    const css = `background: linear-gradient(${Number(v.angle) || 135}deg, ${v.from}, ${v.to});`;
    return { css, style: { background: `linear-gradient(${Number(v.angle) || 135}deg, ${v.from}, ${v.to})` } };
  }
  if (family === "shadow") {
    const sh = `${Number(v.x) || 0}px ${Number(v.y) || 0}px ${Math.max(0, Number(v.blur) || 0)}px ${Number(v.spread) || 0}px ${v.color}`;
    return { css: `box-shadow: ${sh};`, style: { boxShadow: sh } };
  }
  if (family === "border") {
    const css = `border: ${Math.max(0, Number(v.width) || 0)}px solid ${v.color};\nborder-radius: ${Math.max(0, Number(v.radius) || 0)}px;`;
    return { css, style: { border: `${Math.max(0, Number(v.width) || 0)}px solid ${v.color}`, borderRadius: `${Math.max(0, Number(v.radius) || 0)}px` } };
  }
  if (family === "button") {
    const css = `background: ${v.bg};\ncolor: ${v.text};\nborder: 0;\nborder-radius: ${Number(v.radius) || 0}px;\npadding: ${Number(v.py) || 0}px ${Number(v.px) || 0}px;\ncursor: pointer;`;
    return { css, style: { background: v.bg, color: v.text, borderRadius: `${Number(v.radius) || 0}px`, padding: `${Number(v.py) || 0}px ${Number(v.px) || 0}px` } };
  }
  if (family === "card") {
    const css = `background: #ffffff;\nborder: 1px solid ${v.border};\nborder-radius: ${Number(v.radius) || 0}px;\npadding: ${Number(v.pad) || 0}px;\nbox-shadow: 0 8px 24px rgb(22 24 29 / 0.08);`;
    return { css, style: { borderRadius: `${Number(v.radius) || 0}px`, padding: `${Number(v.pad) || 0}px`, border: `1px solid ${v.border}`, boxShadow: "0 8px 24px rgb(22 24 29 / 0.08)" } };
  }
  if (family === "badge") {
    const css = `background: ${v.bg};\ncolor: ${v.text};\nborder-radius: ${Number(v.radius) || 0}px;\npadding: ${Number(v.py) || 0}px ${Number(v.px) || 0}px;\ndisplay: inline-block;`;
    return { css, style: { background: v.bg, color: v.text, borderRadius: `${Number(v.radius) || 0}px`, padding: `${Number(v.py) || 0}px ${Number(v.px) || 0}px` } };
  }
  if (family === "input") {
    const css = `border: 1px solid ${v.border};\nborder-radius: ${Number(v.radius) || 0}px;\noutline: none;\nbox-shadow: 0 0 0 3px color-mix(in srgb, ${v.focus} 18%, transparent);`;
    return { css, style: { border: `1px solid ${v.border}`, borderRadius: `${Number(v.radius) || 0}px`, boxShadow: `0 0 0 3px color-mix(in srgb, ${v.focus} 18%, transparent)` } };
  }
  if (family === "avatar") {
    const size = Math.max(24, Number(v.size) || 96);
    const radius = Math.max(0, Math.min(50, Number(v.radius) || 50));
    const css = `width: ${size}px;\nheight: ${size}px;\nbackground: ${v.bg};\nborder-radius: ${radius}%;\nobject-fit: cover;`;
    return { css, style: { width: size, height: size, background: v.bg, borderRadius: `${radius}%` } };
  }
  if (family === "glass") {
    const css = `background: rgb(255 255 255 / ${v.alpha});\nbackdrop-filter: blur(${Number(v.blur) || 0}px);\n-webkit-backdrop-filter: blur(${Number(v.blur) || 0}px);\nborder: 1px solid rgb(255 255 255 / ${v.borderAlpha});`;
    return { css, style: { background: `rgb(255 255 255 / ${v.alpha})`, backdropFilter: `blur(${Number(v.blur) || 0}px)`, border: `1px solid rgb(255 255 255 / ${v.borderAlpha})` } };
  }
  if (family === "neomorph") {
    const d = Math.max(1, Number(v.dist) || 10);
    const css = `border-radius: ${Number(v.radius) || 0}px;\nbox-shadow: ${d}px ${d}px ${d * 2}px #d1d1d1, -${d}px -${d}px ${d * 2}px #ffffff;`;
    return { css, style: { width: `${Number(v.size) || 120}px`, height: `${Number(v.size) || 120}px`, borderRadius: `${Number(v.radius) || 0}px`, boxShadow: `${d}px ${d}px ${d * 2}px #d1d1d1, -${d}px -${d}px ${d * 2}px #ffffff` } };
  }
  if (family === "pattern") {
    const size = Math.max(6, Number(v.size) || 24);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><path d="M0 0L${size} ${size}M${size} 0L0 ${size}" stroke="${v.color}" stroke-opacity="${v.opacity}" stroke-width="1"/></svg>`;
    const data = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    return { css: `background-image: ${data};\nbackground-size: ${size}px ${size}px;`, style: { backgroundImage: data, backgroundSize: `${size}px ${size}px` }, svg };
  }
  if (family === "blob") {
    const seed = Number(v.seed) || 1;
    const points = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      const r = 38 + ((seed * (i + 3) * 13) % 20);
      return `${50 + Math.cos(a) * r} ${50 + Math.sin(a) * r}`;
    }).join(" ");
    const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><polygon fill="#0d9f8a" points="${points}"/></svg>`;
    return { css: svg, style: {}, svg };
  }
  if (family === "wave") {
    const a = Number(v.amp) || 24;
    const svg = `<svg viewBox="0 0 1440 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path fill="#0d9f8a" d="M0,60 C360,${60 - a} 720,${60 + a} 1440,60 L1440,120 L0,120 Z"/></svg>`;
    return { css: svg, style: {}, svg };
  }
  const opacity = Math.max(0, Math.min(1, Number(v.opacity) || 0.06));
  const css = `.noise{position:relative;overflow:hidden}\n.noise::after{content:"";position:absolute;inset:0;opacity:${opacity};background-image:url("data:image/svg+xml,...");pointer-events:none}`;
  return { css, style: { opacity } };
}

export function CssGenEngine({ op }: { op: string }) {
  const { family, workflow } = familyAndWorkflow(op);
  const fields = BASE_FIELDS[family] ?? BASE_FIELDS.gradient;
  const [vals, setVals] = useState(() => initialValues(fields));
  const output = useMemo(() => cssFor(family, vals), [family, vals]);
  const generatedSvg = workflow === "svg" && !output.svg
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240"><rect width="480" height="240" rx="24" fill="#ffffff"/><rect x="40" y="40" width="400" height="160" rx="20" fill="#0d9f8a"/><text x="240" y="132" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="28">enV ${family}</text></svg>`
    : output.svg;
  const code = workflow === "token" && !generatedSvg
    ? `:root {\n  --env-${family}: ${output.css.replace(/\n/g, "\\n")};\n}`
    : generatedSvg ?? output.css;
  const previewStyle = output.style;
  const isText = family === "button" || family === "badge" || family === "input";
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
        {workflow === "preview" ? "Live preview" : workflow === "token" ? "Design token output" : workflow === "preset" ? "Preset-ready CSS" : workflow === "svg" ? "SVG-ready output" : "Live CSS editor"} · processed locally
      </div>
      <FieldGrid fields={fields} values={vals} onChange={(n, v) => setVals((old) => ({ ...old, [n]: v }))} />
      <div className="flex min-h-44 items-center justify-center overflow-hidden rounded-xl bg-surface-2 p-8" style={family === "glass" ? { background: "linear-gradient(135deg,#0d9f8a,#1db87a)" } : undefined}>
        {generatedSvg ? <div className="w-full max-w-xl" dangerouslySetInnerHTML={{ __html: generatedSvg }} /> : isText ? <span style={previewStyle}>{family === "input" ? "Input field" : family === "badge" ? "Badge" : "Button"}</span> : <div className="size-32 bg-surface" style={previewStyle} />}
      </div>
      <CodeResult code={code} filename={`env-${family}-${workflow}.${generatedSvg ? "svg" : "css"}`} />
    </div>
  );
}
