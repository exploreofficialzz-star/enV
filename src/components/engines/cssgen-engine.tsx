import { useState } from "react";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { initialValues } from "@/components/engines/initial-values";
import { CodeResult } from "@/components/engines/result-panel";

const FIELDS: Record<string, UiField[]> = {
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
  glass: [
    { name: "blur", label: "Blur", type: "number", defaultValue: 16 },
    { name: "alpha", label: "Tint alpha", type: "number", defaultValue: 0.12 },
  ],
  neomorph: [
    { name: "size", label: "Size", type: "number", defaultValue: 120 },
    { name: "radius", label: "Radius", type: "number", defaultValue: 24 },
    { name: "dist", label: "Distance", type: "number", defaultValue: 10 },
  ],
  button: [
    { name: "bg", label: "Background", type: "text", defaultValue: "#0d9f8a" },
    { name: "radius", label: "Radius", type: "number", defaultValue: 8 },
    { name: "px", label: "Padding X", type: "number", defaultValue: 16 },
    { name: "py", label: "Padding Y", type: "number", defaultValue: 10 },
  ],
  card: [
    { name: "radius", label: "Radius", type: "number", defaultValue: 24 },
    { name: "pad", label: "Padding", type: "number", defaultValue: 20 },
  ],
  "text-shadow": [
    { name: "x", label: "X", type: "number", defaultValue: 0 },
    { name: "y", label: "Y", type: "number", defaultValue: 2 },
    { name: "blur", label: "Blur", type: "number", defaultValue: 8 },
    { name: "color", label: "Color", type: "text", defaultValue: "rgba(0,0,0,.35)" },
  ],
  blob: [{ name: "seed", label: "Seed", type: "number", defaultValue: 7 }],
  wave: [{ name: "amp", label: "Amplitude", type: "number", defaultValue: 24 }],
  noise: [{ name: "opacity", label: "Opacity", type: "number", defaultValue: 0.06 }],
};

function cssFor(op: string, v: Record<string, string>): { css: string; style: React.CSSProperties; svg?: string } {
  if (op === "gradient") {
    const css = `background: linear-gradient(${v.angle || 135}deg, ${v.from}, ${v.to});`;
    return { css, style: { background: `linear-gradient(${v.angle || 135}deg, ${v.from}, ${v.to})` } };
  }
  if (op === "shadow") {
    const sh = `${v.x}px ${v.y}px ${v.blur}px ${v.spread}px ${v.color}`;
    return { css: `box-shadow: ${sh};`, style: { boxShadow: sh } };
  }
  if (op === "border") {
    const css = `border: ${v.width}px solid ${v.color};\nborder-radius: ${v.radius}px;`;
    return { css, style: { border: `${v.width}px solid ${v.color}`, borderRadius: `${v.radius}px` } };
  }
  if (op === "glass") {
    const css = `background: rgb(255 255 255 / ${v.alpha});\nbackdrop-filter: blur(${v.blur}px);\nborder: 1px solid rgb(255 255 255 / 0.4);`;
    return {
      css,
      style: {
        background: `rgb(255 255 255 / ${v.alpha})`,
        backdropFilter: `blur(${v.blur}px)`,
        border: "1px solid rgb(255 255 255 / 0.4)",
      },
    };
  }
  if (op === "neomorph") {
    const d = v.dist;
    const css = `border-radius: ${v.radius}px;\nbox-shadow: ${d}px ${d}px ${Number(d) * 2}px #d1d1d1, -${d}px -${d}px ${Number(d) * 2}px #ffffff;`;
    return {
      css,
      style: {
        width: `${v.size}px`,
        height: `${v.size}px`,
        borderRadius: `${v.radius}px`,
        boxShadow: `${d}px ${d}px ${Number(d) * 2}px #d1d1d1, -${d}px -${d}px ${Number(d) * 2}px #ffffff`,
      },
    };
  }
  if (op === "button") {
    const css = `background: ${v.bg};\ncolor: white;\nborder-radius: ${v.radius}px;\npadding: ${v.py}px ${v.px}px;`;
    return { css, style: { background: v.bg, color: "#fff", borderRadius: `${v.radius}px`, padding: `${v.py}px ${v.px}px` } };
  }
  if (op === "card") {
    const css = `border-radius: ${v.radius}px;\npadding: ${v.pad}px;\nbox-shadow: 0 0 0 1px rgb(22 24 29 / 0.06), 0 8px 24px rgb(22 24 29 / 0.06);`;
    return { css, style: { borderRadius: `${v.radius}px`, padding: `${v.pad}px` } };
  }
  if (op === "text-shadow") {
    const sh = `${v.x}px ${v.y}px ${v.blur}px ${v.color}`;
    return { css: `text-shadow: ${sh};`, style: { textShadow: sh } };
  }
  if (op === "blob") {
    const s = Number(v.seed) || 1;
    const d = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      const r = 40 + ((s * (i + 3) * 13) % 20);
      return `${50 + Math.cos(a) * r} ${50 + Math.sin(a) * r}`;
    }).join(" ");
    const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><polygon fill="#0d9f8a" points="${d}"/></svg>`;
    return { css: svg, style: {}, svg };
  }
  if (op === "wave") {
    const a = Number(v.amp) || 24;
    const svg = `<svg viewBox="0 0 1440 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path fill="#0d9f8a" d="M0,60 C360,${60 - a} 720,${60 + a} 1440,60 L1440,120 L0,120 Z"/></svg>`;
    return { css: svg, style: {}, svg };
  }
  const css = `.noise{position:relative}\n.noise::after{content:"";position:absolute;inset:0;opacity:${v.opacity};background-image:url("data:image/svg+xml,...");pointer-events:none}`;
  return { css, style: { opacity: Number(v.opacity) } };
}

export function CssGenEngine({ op }: { op: string }) {
  const fields = FIELDS[op] ?? FIELDS.gradient;
  const [vals, setVals] = useState(() => initialValues(fields));
  const { css, style, svg } = cssFor(op, vals);
  return (
    <div className="space-y-4">
      <FieldGrid fields={fields} values={vals} onChange={(n, v) => setVals((o) => ({ ...o, [n]: v }))} />
      <div
        className="flex min-h-36 items-center justify-center rounded-xl bg-surface-2 p-6"
        style={op === "glass" ? { background: "linear-gradient(135deg,#0d9f8a,#1db87a)" } : undefined}
      >
        {svg ? (
          <div className="w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : op === "text-shadow" ? (
          <p className="text-3xl font-semibold" style={style}>
            enV
          </p>
        ) : op === "button" ? (
          <span style={style}>Button</span>
        ) : (
          <div className="size-32 bg-surface" style={style} />
        )}
      </div>
      <CodeResult code={css} filename={`env-${op}.css`} />
    </div>
  );
}
