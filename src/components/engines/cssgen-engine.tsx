import { useMemo, useState } from "react";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { initialValues } from "@/components/engines/initial-values";
import { CodeResult } from "@/components/engines/result-panel";
import { parseCssColor } from "@/lib/engines/accessibility-color";
import { Button } from "@/components/ui/button";

const BASE_FIELDS: Record<string, UiField[]> = {
  gradient: [
    { name: "kind", label: "Gradient type", type: "select", defaultValue: "linear", options: [{ value: "linear", label: "Linear" }, { value: "radial", label: "Radial" }, { value: "conic", label: "Conic" }] },
    { name: "from", label: "Start color", type: "color", defaultValue: "#0d9f8a" },
    { name: "via", label: "Middle color", type: "color", defaultValue: "#5a9ee8" },
    { name: "to", label: "End color", type: "color", defaultValue: "#7c4dff" },
    { name: "angle", label: "Angle", type: "number", defaultValue: 135, min: 0, max: 360, suffix: "deg" },
  ],
  shadow: [
    { name: "preset", label: "Shadow preset", type: "select", defaultValue: "soft", options: [{ value: "subtle", label: "Subtle" }, { value: "soft", label: "Soft elevation" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }, { value: "glow", label: "Glow" }, { value: "inset", label: "Inset" }, { value: "custom", label: "Custom" }] },
    { name: "layers", label: "Layers", type: "select", defaultValue: "2", options: [{ value: "1", label: "1 layer" }, { value: "2", label: "2 layers" }, { value: "3", label: "3 layers" }] },
    { name: "x", label: "Horizontal offset", type: "number", defaultValue: 0, min: -80, max: 80, suffix: "px" },
    { name: "y", label: "Vertical offset", type: "number", defaultValue: 8, min: -80, max: 80, suffix: "px" },
    { name: "blur", label: "Blur", type: "number", defaultValue: 24, min: 0, max: 160, suffix: "px" },
    { name: "spread", label: "Spread", type: "number", defaultValue: 0, min: -40, max: 80, suffix: "px" },
    { name: "color", label: "Shadow color", type: "color", defaultValue: "#202a3b" },
  ],
  "text-shadow": [
    { name: "x", label: "Horizontal offset", type: "number", defaultValue: 2, min: -40, max: 40, suffix: "px" },
    { name: "y", label: "Vertical offset", type: "number", defaultValue: 3, min: -40, max: 40, suffix: "px" },
    { name: "blur", label: "Blur", type: "number", defaultValue: 8, min: 0, max: 80, suffix: "px" },
    { name: "color", label: "Shadow color", type: "color", defaultValue: "#202a3b" },
    { name: "textColor", label: "Text color", type: "color", defaultValue: "#ffffff" },
  ],
  border: [
    { name: "style", label: "Border style", type: "select", defaultValue: "solid", options: [{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }, { value: "double", label: "Double" }] },
    { name: "width", label: "Width", type: "number", defaultValue: 1, min: 0, max: 24, suffix: "px" },
    { name: "radius", label: "Corner radius", type: "number", defaultValue: 16, min: 0, max: 120, suffix: "px" },
    { name: "color", label: "Border color", type: "color", defaultValue: "#b9c5d5" },
  ],
  button: [
    { name: "bg", label: "Background", type: "color", defaultValue: "#0d9f8a" },
    { name: "hover", label: "Hover background", type: "color", defaultValue: "#087f70" },
    { name: "text", label: "Text color", type: "color", defaultValue: "#ffffff" },
    { name: "radius", label: "Corner radius", type: "number", defaultValue: 10, min: 0, max: 48, suffix: "px" },
    { name: "px", label: "Horizontal padding", type: "number", defaultValue: 16, min: 0, max: 64, suffix: "px" },
    { name: "py", label: "Vertical padding", type: "number", defaultValue: 10, min: 0, max: 40, suffix: "px" },
  ],
  card: [
    { name: "bg", label: "Card background", type: "color", defaultValue: "#ffffff" },
    { name: "border", label: "Border color", type: "color", defaultValue: "#e7e5e4" },
    { name: "radius", label: "Corner radius", type: "number", defaultValue: 20, min: 0, max: 64, suffix: "px" },
    { name: "pad", label: "Padding", type: "number", defaultValue: 20, min: 0, max: 80, suffix: "px" },
    { name: "shadow", label: "Shadow strength", type: "select", defaultValue: "soft", options: [{ value: "none", label: "None" }, { value: "soft", label: "Soft" }, { value: "strong", label: "Strong" }] },
  ],
  badge: [
    { name: "bg", label: "Background", type: "color", defaultValue: "#e8f7f3" },
    { name: "text", label: "Text color", type: "color", defaultValue: "#087f6d" },
    { name: "radius", label: "Corner radius", type: "number", defaultValue: 999, min: 0, max: 999, suffix: "px" },
    { name: "px", label: "Horizontal padding", type: "number", defaultValue: 10, min: 0, max: 48, suffix: "px" },
    { name: "py", label: "Vertical padding", type: "number", defaultValue: 5, min: 0, max: 24, suffix: "px" },
  ],
  input: [
    { name: "bg", label: "Input background", type: "color", defaultValue: "#ffffff" },
    { name: "border", label: "Border color", type: "color", defaultValue: "#d6d3d1" },
    { name: "radius", label: "Corner radius", type: "number", defaultValue: 10, min: 0, max: 48, suffix: "px" },
    { name: "focus", label: "Focus ring color", type: "color", defaultValue: "#0d9f8a" },
  ],
  avatar: [
    { name: "size", label: "Size", type: "number", defaultValue: 96, min: 24, max: 400, suffix: "px" },
    { name: "bg", label: "Background", type: "color", defaultValue: "#e7f7f3" },
    { name: "radius", label: "Roundness", type: "number", defaultValue: 50, min: 0, max: 50, suffix: "%" },
  ],
  glass: [
    { name: "tint", label: "Tint color", type: "color", defaultValue: "#ffffff" },
    { name: "blur", label: "Backdrop blur", type: "number", defaultValue: 18, min: 0, max: 48, suffix: "px" },
    { name: "alpha", label: "Tint opacity", type: "number", defaultValue: 0.16, min: 0, max: 1, step: 0.01 },
    { name: "borderAlpha", label: "Border opacity", type: "number", defaultValue: 0.35, min: 0, max: 1, step: 0.01 },
  ],
  neomorph: [
    { name: "bg", label: "Surface color", type: "color", defaultValue: "#e8edf4" },
    { name: "light", label: "Light shadow", type: "color", defaultValue: "#ffffff" },
    { name: "dark", label: "Dark shadow", type: "color", defaultValue: "#b7c0cc" },
    { name: "mode", label: "Surface style", type: "select", defaultValue: "raised", options: [{ value: "raised", label: "Raised" }, { value: "pressed", label: "Pressed / inset" }] },
    { name: "size", label: "Size", type: "number", defaultValue: 120, min: 48, max: 320, suffix: "px" },
    { name: "radius", label: "Corner radius", type: "number", defaultValue: 24, min: 0, max: 120, suffix: "px" },
    { name: "dist", label: "Shadow distance", type: "number", defaultValue: 10, min: 1, max: 40, suffix: "px" },
  ],
  pattern: [
    { name: "color", label: "Pattern color", type: "color", defaultValue: "#0d9f8a" },
    { name: "size", label: "Pattern size", type: "number", defaultValue: 24, min: 6, max: 160, suffix: "px" },
    { name: "opacity", label: "Opacity", type: "number", defaultValue: 0.14, min: 0, max: 1, step: 0.01 },
  ],
  blob: [
    { name: "seed", label: "Shape variation", type: "number", defaultValue: 7, min: 1, max: 999, step: 1 },
    { name: "points", label: "Shape detail", type: "select", defaultValue: "12", options: [{ value: "8", label: "Simple" }, { value: "12", label: "Balanced" }, { value: "18", label: "Detailed" }] },
    { name: "color", label: "Fill color", type: "color", defaultValue: "#0d9f8a" },
  ],
  wave: [
    { name: "amp", label: "Wave height", type: "number", defaultValue: 24, min: 0, max: 58, suffix: "px" },
    { name: "fill", label: "Fill color", type: "color", defaultValue: "#0d9f8a" },
    { name: "background", label: "Canvas color", type: "color", defaultValue: "#ffffff" },
  ],
  noise: [
    { name: "opacity", label: "Grain strength", type: "number", defaultValue: 0.08, min: 0, max: 1, step: 0.01 },
    { name: "density", label: "Grain detail", type: "number", defaultValue: 1.1, min: 0.1, max: 3, step: 0.1 },
    { name: "color", label: "Grain color", type: "color", defaultValue: "#111827" },
  ],
};

function familyAndWorkflow(op: string, toolId?: string) {
  const [familyFromOp, workflow = "tool"] = op.split(":");
  const family = toolId === "text-shadow-generator" ? "text-shadow" : familyFromOp;
  return { family: family === "neumorphism" ? "neomorph" : family, workflow };
}

function numberValue(values: Record<string, string>, key: string, fallback: number, min: number, max: number): number {
  const parsed = Number(values[key]);
  return clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeNoiseDataUrl(color: string, density: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${density}" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)" fill="${color}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function cssFor(family: string, values: Record<string, string>) {
  if (family === "gradient") {
    const kind = values.kind ?? "linear";
    const angle = numberValue(values, "angle", 135, 0, 360);
    const stops = `${values.from ?? "#0d9f8a"} 0%, ${values.via ?? "#5a9ee8"} 50%, ${values.to ?? "#7c4dff"} 100%`;
    const background = kind === "radial"
      ? `radial-gradient(circle at center, ${stops})`
      : kind === "conic"
        ? `conic-gradient(from ${angle}deg, ${stops})`
        : `linear-gradient(${angle}deg, ${stops})`;
    return { css: `background: ${background};`, style: { background } };
  }
  if (family === "shadow") {
    const preset = values.preset ?? "soft";
    const count = Number(values.layers ?? 2);
    const presets: Record<string, { x: number; y: number; blur: number; spread: number; alpha: number; inset?: boolean }> = {
      subtle: { x: 0, y: 1, blur: 3, spread: 0, alpha: 0.12 },
      soft: { x: 0, y: 7, blur: 24, spread: -4, alpha: 0.14 },
      medium: { x: 0, y: 12, blur: 32, spread: -5, alpha: 0.18 },
      hard: { x: 0, y: 10, blur: 0, spread: 0, alpha: 0.24 },
      glow: { x: 0, y: 0, blur: 28, spread: 2, alpha: 0.36 },
      inset: { x: 0, y: 3, blur: 9, spread: -3, alpha: 0.22, inset: true },
      custom: { x: 0, y: 8, blur: 24, spread: 0, alpha: 0.18 },
    };
    const presetValues = presets[preset] ?? presets.soft;
    const x = numberValue(values, "x", presetValues.x, -80, 80);
    const y = numberValue(values, "y", presetValues.y, -80, 80);
    const blur = numberValue(values, "blur", presetValues.blur, 0, 160);
    const spread = numberValue(values, "spread", presetValues.spread, -40, 80);
    const color = values.color ?? "#202a3b";
    const parsedColor = parseCssColor(color);
    const layers = Array.from({ length: clamp(count, 1, 3) }, (_, index) => {
      const scale = 1 + index * 0.55;
      const alpha = Math.max(0.02, presetValues.alpha / (index + 1));
      const inset = presetValues.inset ? "inset " : "";
      const shadowColor = parsedColor
        ? `rgba(${Math.round(parsedColor.r)}, ${Math.round(parsedColor.g)}, ${Math.round(parsedColor.b)}, ${alpha.toFixed(3)})`
        : color;
      return `${inset}${x * scale}px ${y * scale}px ${blur * scale}px ${spread * scale}px ${shadowColor}`;
    });
    const boxShadow = layers.join(", ");
    return { css: `box-shadow: ${boxShadow};`, style: { boxShadow } };
  }
  if (family === "text-shadow") {
    const x = numberValue(values, "x", 2, -40, 40);
    const y = numberValue(values, "y", 3, -40, 40);
    const blur = numberValue(values, "blur", 8, 0, 80);
    const color = values.color ?? "#202a3b";
    const textShadow = `${x}px ${y}px ${blur}px ${color}`;
    return { css: `text-shadow: ${textShadow};\ncolor: ${values.textColor ?? "#ffffff"};`, style: { textShadow, color: values.textColor ?? "#ffffff" } };
  }
  if (family === "border") {
    const width = numberValue(values, "width", 1, 0, 24);
    const radius = numberValue(values, "radius", 16, 0, 120);
    const style = values.style ?? "solid";
    const color = values.color ?? "#b9c5d5";
    return {
      css: `border: ${width}px ${style} ${color};\nborder-radius: ${radius}px;`,
      style: { border: `${width}px ${style} ${color}`, borderRadius: `${radius}px` },
    };
  }
  if (family === "button") {
    const radius = numberValue(values, "radius", 10, 0, 48);
    const px = numberValue(values, "px", 16, 0, 64);
    const py = numberValue(values, "py", 10, 0, 40);
    const css = `.env-button {\n  background: ${values.bg};\n  color: ${values.text};\n  border: 0;\n  border-radius: ${radius}px;\n  padding: ${py}px ${px}px;\n  cursor: pointer;\n}\n.env-button:hover { background: ${values.hover}; }\n.env-button:focus-visible { outline: 3px solid ${values.hover}; outline-offset: 3px; }`;
    return { css, style: { background: values.bg, color: values.text, borderRadius: `${radius}px`, padding: `${py}px ${px}px` } };
  }
  if (family === "card") {
    const radius = numberValue(values, "radius", 20, 0, 64);
    const pad = numberValue(values, "pad", 20, 0, 80);
    const shadow = values.shadow === "none" ? "none" : values.shadow === "strong" ? "0 14px 36px rgb(22 24 29 / 0.18)" : "0 8px 24px rgb(22 24 29 / 0.08)";
    const css = `.env-card {\n  background: ${values.bg};\n  border: 1px solid ${values.border};\n  border-radius: ${radius}px;\n  padding: ${pad}px;\n  box-shadow: ${shadow};\n}`;
    return { css, style: { background: values.bg, border: `1px solid ${values.border}`, borderRadius: `${radius}px`, padding: `${pad}px`, boxShadow: shadow } };
  }
  if (family === "badge") {
    const radius = numberValue(values, "radius", 999, 0, 999);
    const px = numberValue(values, "px", 10, 0, 48);
    const py = numberValue(values, "py", 5, 0, 24);
    const css = `background: ${values.bg};\ncolor: ${values.text};\nborder-radius: ${radius}px;\npadding: ${py}px ${px}px;\ndisplay: inline-block;`;
    return { css, style: { background: values.bg, color: values.text, borderRadius: `${radius}px`, padding: `${py}px ${px}px`, display: "inline-block" } };
  }
  if (family === "input") {
    const radius = numberValue(values, "radius", 10, 0, 48);
    const css = `.env-input {\n  background: ${values.bg};\n  border: 1px solid ${values.border};\n  border-radius: ${radius}px;\n  outline: none;\n}\n.env-input:focus-visible { outline: 3px solid ${values.focus}; outline-offset: 2px; }`;
    return { css, style: { background: values.bg, border: `1px solid ${values.border}`, borderRadius: `${radius}px`, outline: `2px solid ${values.focus}` } };
  }
  if (family === "avatar") {
    const size = numberValue(values, "size", 96, 24, 400);
    const radius = numberValue(values, "radius", 50, 0, 50);
    const css = `width: ${size}px;\nheight: ${size}px;\nbackground: ${values.bg};\nborder-radius: ${radius}%;\nobject-fit: cover;`;
    return { css, style: { width: size, height: size, background: values.bg, borderRadius: `${radius}%` } };
  }
  if (family === "glass") {
    const blur = numberValue(values, "blur", 18, 0, 48);
    const alpha = numberValue(values, "alpha", 0.16, 0, 1);
    const borderAlpha = numberValue(values, "borderAlpha", 0.35, 0, 1);
    const tint = values.tint ?? "#ffffff";
    const background = `color-mix(in srgb, ${tint} ${Math.round(alpha * 100)}%, transparent)`;
    const border = `1px solid color-mix(in srgb, ${tint} ${Math.round(borderAlpha * 100)}%, transparent)`;
    const css = `background: ${background};\nbackdrop-filter: blur(${blur}px);\n-webkit-backdrop-filter: blur(${blur}px);\nborder: ${border};`;
    return { css, style: { background, backdropFilter: `blur(${blur}px)`, border, borderRadius: "16px" } };
  }
  if (family === "neomorph") {
    const dist = numberValue(values, "dist", 10, 1, 40);
    const radius = numberValue(values, "radius", 24, 0, 120);
    const size = numberValue(values, "size", 120, 48, 320);
    const inset = values.mode === "pressed";
    const shadows = inset
      ? `inset ${dist}px ${dist}px ${dist * 2}px ${values.dark}, inset -${dist}px -${dist}px ${dist * 2}px ${values.light}`
      : `${dist}px ${dist}px ${dist * 2}px ${values.dark}, -${dist}px -${dist}px ${dist * 2}px ${values.light}`;
    const css = `background: ${values.bg};\nborder-radius: ${radius}px;\nbox-shadow: ${shadows};`;
    return { css, style: { width: `${size}px`, height: `${size}px`, background: values.bg, borderRadius: `${radius}px`, boxShadow: shadows } };
  }
  if (family === "pattern") {
    const size = numberValue(values, "size", 24, 6, 160);
    const opacity = numberValue(values, "opacity", 0.14, 0, 1);
    const color = values.color ?? "#0d9f8a";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><path d="M0 0L${size} ${size}M${size} 0L0 ${size}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1"/></svg>`;
    const backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    return { css: `background-image: ${backgroundImage};\nbackground-size: ${size}px ${size}px;`, style: { backgroundImage, backgroundSize: `${size}px ${size}px` }, svg };
  }
  if (family === "blob") {
    const seed = numberValue(values, "seed", 7, 1, 999);
    const count = Number(values.points ?? 12);
    const points = Array.from({ length: clamp(count, 8, 18) }, (_, index) => {
      const angle = (index / count) * Math.PI * 2;
      const radius = 34 + ((seed * (index + 3) * 13) % 20);
      return `${50 + Math.cos(angle) * radius} ${50 + Math.sin(angle) * radius}`;
    }).join(" ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon fill="${values.color ?? "#0d9f8a"}" points="${points}"/></svg>`;
    return { css: svg, style: {}, svg };
  }
  if (family === "wave") {
    const amplitude = numberValue(values, "amp", 24, 0, 58);
    const fill = values.fill ?? "#0d9f8a";
    const background = values.background ?? "#ffffff";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 160" preserveAspectRatio="none"><rect width="1440" height="160" fill="${background}"/><path fill="${fill}" d="M0 80 C240 ${80 - amplitude}, 480 ${80 + amplitude}, 720 80 S1200 ${80 - amplitude}, 1440 80 L1440 160 L0 160 Z"/></svg>`;
    return { css: svg, style: {}, svg };
  }
  const opacity = numberValue(values, "opacity", 0.08, 0, 1);
  const density = numberValue(values, "density", 1.1, 0.1, 3);
  const dataUrl = makeNoiseDataUrl(values.color ?? "#111827", density);
  const css = `.env-noise {\n  position: relative;\n  isolation: isolate;\n}\n.env-noise::after {\n  content: "";\n  position: absolute;\n  inset: 0;\n  pointer-events: none;\n  opacity: ${opacity};\n  background-image: ${dataUrl};\n}`;
  return { css, style: { backgroundImage: dataUrl, backgroundSize: "160px 160px", opacity } };
}

export function CssGenEngine({ op, toolId }: { op: string; toolId?: string }) {
  const { family, workflow } = familyAndWorkflow(op, toolId);
  const fields = BASE_FIELDS[family] ?? BASE_FIELDS.gradient;
  const [values, setValues] = useState(() => initialValues(fields));
  const [sampleText, setSampleText] = useState("A little detail makes a big difference.");
  const output = useMemo(() => cssFor(family, values), [family, values]);
  const generatedSvg = output.svg;
  const code = generatedSvg ?? output.css;
  const isText = family === "button" || family === "badge" || family === "input" || family === "text-shadow";

  function randomizeShape() {
    setValues((previous) => ({ ...previous, seed: String(Math.floor(Math.random() * 999) + 1) }));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-surface-2 p-3">
        <div>
          <p className="text-sm font-semibold text-fg">Design controls</p>
          <p className="mt-1 text-xs leading-5 text-muted">Change a setting to update the preview and export automatically. Processing stays in your browser.</p>
        </div>
        {family === "blob" ? <Button type="button" size="sm" variant="outline" onClick={randomizeShape}>Randomize shape</Button> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <FieldGrid fields={fields} values={values} onChange={(name, value) => setValues((previous) => {
            const next = { ...previous, [name]: value };
            if (name === "preset") {
              const presets: Record<string, { x: number; y: number; blur: number; spread: number }> = {
                subtle: { x: 0, y: 1, blur: 3, spread: 0 },
                soft: { x: 0, y: 7, blur: 24, spread: -4 },
                medium: { x: 0, y: 12, blur: 32, spread: -5 },
                hard: { x: 0, y: 10, blur: 0, spread: 0 },
                glow: { x: 0, y: 0, blur: 28, spread: 2 },
                inset: { x: 0, y: 3, blur: 9, spread: -3 },
                custom: { x: 0, y: 8, blur: 24, spread: 0 },
              };
              const selected = presets[value];
              if (selected) {
                next.x = String(selected.x);
                next.y = String(selected.y);
                next.blur = String(selected.blur);
                next.spread = String(selected.spread);
              }
            }
            return next;
          })} />
          {isText ? (
            <label className="block space-y-1.5">
              <Label htmlFor="design-preview-text">Preview text</Label>
              <Input id="design-preview-text" value={sampleText} onChange={(event) => setSampleText(event.target.value)} />
            </label>
          ) : null}
          {family === "neomorph" ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-muted">Neumorphic surfaces can make boundaries and controls harder to distinguish. Keep labels visible and check contrast before using this style for important actions.</p> : null}
        </div>

        <div className="min-w-0 space-y-3 lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-fg">Live preview</p>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">Updates as you edit</span>
          </div>
          <div
            className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl border border-border p-8"
            style={family === "glass" ? { background: "linear-gradient(135deg,#0d9f8a,#1d3557)" } : family === "wave" ? { background: values.background } : undefined}
          >
            {generatedSvg ? (
              <div className="w-full max-w-xl" dangerouslySetInnerHTML={{ __html: generatedSvg }} />
            ) : family === "card" ? (
              <div className="w-full max-w-xs" style={output.style}>
                <p className="text-base font-semibold text-slate-900">A card preview</p>
                <p className="mt-2 text-sm text-slate-600">See how spacing, surface and depth work together in a real component.</p>
                <span className="mt-4 inline-flex rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Learn more</span>
              </div>
            ) : family === "input" ? (
              <input readOnly value="Input field preview" className="w-full max-w-xs px-3 py-2 text-sm text-slate-800" style={output.style} />
            ) : family === "button" ? (
              <button type="button" className="font-semibold" style={output.style}>{sampleText.length > 26 ? "Continue" : sampleText}</button>
            ) : family === "badge" ? (
              <span style={output.style}>{sampleText.length > 18 ? "New feature" : sampleText}</span>
            ) : family === "text-shadow" ? (
              <p className="max-w-full break-words text-center text-2xl font-bold" style={output.style}>{sampleText}</p>
            ) : family === "avatar" ? (
              <div className="flex items-center justify-center font-semibold text-slate-800" style={output.style}>enV</div>
            ) : family === "noise" ? (
              <div className="h-40 w-full max-w-sm rounded-xl bg-gradient-to-br from-slate-100 to-slate-300" style={output.style} />
            ) : (
              <div className="size-36 bg-white" style={output.style} />
            )}
          </div>
          <p className="text-xs leading-5 text-muted">The preview shows the main visual treatment. Check the exported code in your target browser and project before shipping.</p>
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-fg">Export</p>
            <p className="mt-1 text-xs text-muted">{generatedSvg ? "Scalable vector artwork (SVG)." : "Copy or download the generated CSS."}</p>
          </div>
        </div>
        <CodeResult code={code} filename={`env-${family}-design.${generatedSvg ? "svg" : "css"}`} />
      </div>
    </div>
  );
}
