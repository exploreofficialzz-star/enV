import { useEffect, useMemo, useState } from "react";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { initialValues } from "@/components/engines/initial-values";
import { CodeResult } from "@/components/engines/result-panel";
import { CopyButton } from "@/components/tools/copy-button";
import { parseCssColor } from "@/lib/engines/accessibility-color";
import { buildCssGradient, moveGradientStop, normalizeGradientStops, type GradientStop } from "@/lib/engines/css-gradient";
import { buildBlobSvg, buildNoiseDataUrl, buildPatternSvg, buildWaveSvg } from "@/lib/engines/svg-generators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEFAULT_GRADIENT_STOPS: GradientStop[] = [
  { id: "start", color: "#0d9f8a", position: 0 },
  { id: "middle", color: "#5a9ee8", position: 50 },
  { id: "end", color: "#7c4dff", position: 100 },
];

const GRADIENT_PRESETS: Array<{ name: string; stops: GradientStop[]; angle: number }> = [
  { name: "Aurora", angle: 135, stops: [{ id: "a", color: "#0f766e", position: 0 }, { id: "b", color: "#38bdf8", position: 48 }, { id: "c", color: "#8b5cf6", position: 100 }] },
  { name: "Sunset", angle: 120, stops: [{ id: "a", color: "#f97316", position: 0 }, { id: "b", color: "#ec4899", position: 52 }, { id: "c", color: "#7c3aed", position: 100 }] },
  { name: "Ocean", angle: 135, stops: [{ id: "a", color: "#0f172a", position: 0 }, { id: "b", color: "#0369a1", position: 52 }, { id: "c", color: "#67e8f9", position: 100 }] },
  { name: "Candy", angle: 135, stops: [{ id: "a", color: "#f9a8d4", position: 0 }, { id: "b", color: "#c4b5fd", position: 50 }, { id: "c", color: "#93c5fd", position: 100 }] },
  { name: "Midnight", angle: 145, stops: [{ id: "a", color: "#020617", position: 0 }, { id: "b", color: "#312e81", position: 55 }, { id: "c", color: "#0f766e", position: 100 }] },
];

const BASE_FIELDS: Record<string, UiField[]> = {
  gradient: [
    { name: "kind", label: "Gradient type", type: "select", defaultValue: "linear", options: [{ value: "linear", label: "Linear" }, { value: "radial", label: "Radial" }, { value: "conic", label: "Conic" }] },
    { name: "angle", label: "Angle", type: "number", defaultValue: 135, min: 0, max: 360, suffix: "deg" },
    { name: "shape", label: "Radial shape", type: "select", defaultValue: "circle", options: [{ value: "circle", label: "Circle" }, { value: "ellipse", label: "Ellipse" }] },
    { name: "radialSize", label: "Radial size", type: "select", defaultValue: "farthest-corner", options: [{ value: "closest-side", label: "Closest side" }, { value: "farthest-side", label: "Farthest side" }, { value: "closest-corner", label: "Closest corner" }, { value: "farthest-corner", label: "Farthest corner" }] },
    { name: "centerX", label: "Center horizontal", type: "number", defaultValue: 50, min: 0, max: 100, suffix: "%" },
    { name: "centerY", label: "Center vertical", type: "number", defaultValue: 50, min: 0, max: 100, suffix: "%" },
    { name: "colorSpace", label: "Color interpolation", type: "select", defaultValue: "srgb", options: [{ value: "srgb", label: "Standard sRGB" }, { value: "srgb-linear", label: "Linear sRGB" }, { value: "oklab", label: "OKLab · perceptual" }, { value: "oklch", label: "OKLCH · perceptual" }, { value: "lab", label: "CIELAB" }, { value: "lch", label: "CIELCH" }, { value: "display-p3", label: "Display P3" }, { value: "hsl", label: "HSL" }, { value: "hwb", label: "HWB" }] },
    { name: "hueMethod", label: "Hue direction", type: "select", defaultValue: "shorter", options: [{ value: "shorter", label: "Shorter hue" }, { value: "longer", label: "Longer hue" }, { value: "increasing", label: "Increasing hue" }, { value: "decreasing", label: "Decreasing hue" }] },
    { name: "repeating", label: "Repeat gradient", type: "select", defaultValue: "no", options: [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }] },
  ],
  shadow: [
    { name: "preset", label: "Shadow preset", type: "select", defaultValue: "soft", options: [{ value: "subtle", label: "Subtle" }, { value: "soft", label: "Soft elevation" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }, { value: "glow", label: "Glow" }, { value: "inset", label: "Inset" }, { value: "custom", label: "Custom" }] },
    { name: "layers", label: "Layers", type: "select", defaultValue: "2", options: [{ value: "1", label: "1 layer" }, { value: "2", label: "2 layers" }, { value: "3", label: "3 layers" }] },
    { name: "x", label: "Horizontal offset", type: "number", defaultValue: 0, min: -80, max: 80, suffix: "px" },
    { name: "y", label: "Vertical offset", type: "number", defaultValue: 8, min: -80, max: 80, suffix: "px" },
    { name: "blur", label: "Blur", type: "number", defaultValue: 24, min: 0, max: 160, suffix: "px" },
    { name: "spread", label: "Spread", type: "number", defaultValue: 0, min: -40, max: 80, suffix: "px" },
    { name: "color", label: "Shadow color", type: "color", defaultValue: "#202a3b" },
    { name: "opacity", label: "Shadow opacity", type: "number", defaultValue: 0.14, min: 0, max: 1, step: 0.01 },
  ],
  "text-shadow": [
    { name: "layers", label: "Shadow layers", type: "select", defaultValue: "1", options: [{ value: "1", label: "1 layer" }, { value: "2", label: "2 layers" }, { value: "3", label: "3 layers" }, { value: "4", label: "4 layers" }] },
    { name: "x", label: "Horizontal offset", type: "number", defaultValue: 2, min: -40, max: 40, suffix: "px" },
    { name: "y", label: "Vertical offset", type: "number", defaultValue: 3, min: -40, max: 40, suffix: "px" },
    { name: "blur", label: "Blur", type: "number", defaultValue: 8, min: 0, max: 80, suffix: "px" },
    { name: "opacity", label: "Shadow opacity", type: "number", defaultValue: 0.72, min: 0, max: 1, step: 0.01 },
    { name: "color", label: "Shadow color", type: "color", defaultValue: "#202a3b" },
    { name: "textColor", label: "Text color", type: "color", defaultValue: "#ffffff" },
  ],
  border: [
    { name: "style", label: "Border style", type: "select", defaultValue: "solid", options: [{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }, { value: "double", label: "Double" }] },
    { name: "width", label: "Width", type: "number", defaultValue: 1, min: 0, max: 24, suffix: "px" },
    { name: "radius", label: "Uniform radius", type: "number", defaultValue: 16, min: 0, max: 120, suffix: "px" },
    { name: "topLeft", label: "Top left radius", type: "number", defaultValue: 16, min: 0, max: 120, suffix: "px" },
    { name: "topRight", label: "Top right radius", type: "number", defaultValue: 16, min: 0, max: 120, suffix: "px" },
    { name: "bottomRight", label: "Bottom right radius", type: "number", defaultValue: 16, min: 0, max: 120, suffix: "px" },
    { name: "bottomLeft", label: "Bottom left radius", type: "number", defaultValue: 16, min: 0, max: 120, suffix: "px" },
    { name: "color", label: "Border color", type: "color", defaultValue: "#b9c5d5" },
  ],
  button: [
    { name: "bg", label: "Background", type: "color", defaultValue: "#0d9f8a" },
    { name: "hover", label: "Hover background", type: "color", defaultValue: "#087f70" },
    { name: "focus", label: "Focus ring color", type: "color", defaultValue: "#7c4dff" },
    { name: "text", label: "Text color", type: "color", defaultValue: "#ffffff" },
    { name: "radius", label: "Corner radius", type: "number", defaultValue: 10, min: 0, max: 48, suffix: "px" },
    { name: "px", label: "Horizontal padding", type: "number", defaultValue: 16, min: 0, max: 64, suffix: "px" },
    { name: "py", label: "Vertical padding", type: "number", defaultValue: 10, min: 0, max: 40, suffix: "px" },
  ],
  card: [
    { name: "bg", label: "Card background", type: "color", defaultValue: "#ffffff" },
    { name: "border", label: "Border color", type: "color", defaultValue: "#e7e5e4" },
    { name: "text", label: "Heading color", type: "color", defaultValue: "#111827" },
    { name: "muted", label: "Body text color", type: "color", defaultValue: "#475569" },
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
    { name: "pattern", label: "Pattern style", type: "select", defaultValue: "diagonal", options: [{ value: "dots", label: "Dots" }, { value: "grid", label: "Grid" }, { value: "diagonal", label: "Diagonal" }, { value: "cross", label: "Cross" }, { value: "horizontal", label: "Horizontal lines" }] },
    { name: "color", label: "Pattern color", type: "color", defaultValue: "#0d9f8a" },
    { name: "size", label: "Pattern size", type: "number", defaultValue: 24, min: 6, max: 160, suffix: "px" },
    { name: "opacity", label: "Opacity", type: "number", defaultValue: 0.14, min: 0, max: 1, step: 0.01 },
  ],
  blob: [
    { name: "seed", label: "Shape variation", type: "number", defaultValue: 7, min: 1, max: 999, step: 1 },
    { name: "points", label: "Shape detail", type: "select", defaultValue: "12", options: [{ value: "8", label: "Simple" }, { value: "12", label: "Balanced" }, { value: "18", label: "Detailed" }] },
    { name: "rotation", label: "Rotation", type: "number", defaultValue: 0, min: 0, max: 360, suffix: "deg" },
    { name: "color", label: "Fill color", type: "color", defaultValue: "#0d9f8a" },
    { name: "stroke", label: "Outline color", type: "color", defaultValue: "#ffffff" },
    { name: "strokeWidth", label: "Outline width", type: "number", defaultValue: 0, min: 0, max: 8, suffix: "px" },
  ],
  wave: [
    { name: "amp", label: "Wave height", type: "number", defaultValue: 24, min: 0, max: 58, suffix: "px" },
    { name: "layers", label: "Wave layers", type: "select", defaultValue: "2", options: [{ value: "1", label: "1 layer" }, { value: "2", label: "2 layers" }, { value: "3", label: "3 layers" }] },
    { name: "frequency", label: "Wave frequency", type: "number", defaultValue: 2, min: 1, max: 5, suffix: "cycles" },
    { name: "phase", label: "Wave phase", type: "number", defaultValue: 0, min: 0, max: 360, suffix: "deg" },
    { name: "baseline", label: "Wave vertical position", type: "number", defaultValue: 76, min: 30, max: 140, suffix: "%" },
    { name: "fill", label: "Front wave", type: "color", defaultValue: "#0d9f8a" },
    { name: "secondary", label: "Back wave", type: "color", defaultValue: "#7c4dff" },
    { name: "backgroundMode", label: "Canvas background", type: "select", defaultValue: "solid", options: [{ value: "solid", label: "Solid background" }, { value: "transparent", label: "Transparent" }] },
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

function downloadSvgAsPng(svg: string, filename: string): void {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  const image = new Image();
  image.onload = () => {
    const viewBox = svg.match(/viewBox="([\d.\-\s]+)"/)?.[1].trim().split(/\s+/).map(Number);
    const sourceWidth = viewBox?.[2] && Number.isFinite(viewBox[2]) ? viewBox[2] : image.naturalWidth || 512;
    const sourceHeight = viewBox?.[3] && Number.isFinite(viewBox[3]) ? viewBox[3] : image.naturalHeight || 512;
    const width = Math.min(2048, Math.max(256, Math.round(sourceWidth)));
    const height = Math.min(2048, Math.max(1, Math.round(width * sourceHeight / sourceWidth)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(svgUrl);
      return;
    }
    context.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob((png) => {
      if (!png) return;
      const pngUrl = URL.createObjectURL(png);
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
    }, "image/png");
  };
  image.onerror = () => URL.revokeObjectURL(svgUrl);
  image.src = svgUrl;
}

function cssFor(
  family: string,
  values: Record<string, string>,
  gradientStops: GradientStop[] = [],
  gradientOverlay: { enabled: boolean; color: string; x: number; y: number } = { enabled: false, color: "#ffffff", x: 24, y: 20 },
) {
  if (family === "gradient") {
    const kind = values.kind === "radial" || values.kind === "conic" ? values.kind : "linear";
    const angle = numberValue(values, "angle", 135, 0, 360);
    const normalized = normalizeGradientStops(gradientStops);
    const position = `${numberValue(values, "centerX", 50, 0, 100)}% ${numberValue(values, "centerY", 50, 0, 100)}%`;
    const gradientOptions = {
      kind,
      angle,
      shape: values.shape === "ellipse" ? "ellipse" as const : "circle" as const,
      size: values.radialSize as "closest-side" | "farthest-side" | "closest-corner" | "farthest-corner" | undefined,
      position,
      repeating: values.repeating === "yes",
      colorSpace: values.colorSpace as import("@/lib/engines/css-gradient").GradientColorSpace,
      hueMethod: values.hueMethod as import("@/lib/engines/css-gradient").GradientHueMethod,
      stops: normalized,
    };
    const enhanced = buildCssGradient(gradientOptions);
    const fallbackGradient = buildCssGradient({ ...gradientOptions, colorSpace: "srgb" });
    const fallback = normalized[0]?.color ?? "#0d9f8a";
    const glow = gradientOverlay.enabled
      ? `radial-gradient(circle at ${gradientOverlay.x}% ${gradientOverlay.y}%, ${gradientOverlay.color} 0%, transparent 58%)`
      : "";
    const fallbackImage = [glow, fallbackGradient].filter(Boolean).join(", ");
    const enhancedImage = [glow, enhanced].filter(Boolean).join(", ");
    const css = `background: ${fallback};\nbackground-image: ${fallbackImage};${enhanced === fallbackGradient ? "" : `\nbackground-image: ${enhancedImage}; /* Modern browsers: perceptual color interpolation */`}`;
    return { css, style: { background: fallback, backgroundImage: enhancedImage } };
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
    const opacity = numberValue(values, "opacity", presetValues.alpha, 0, 1);
    const x = numberValue(values, "x", presetValues.x, -80, 80);
    const y = numberValue(values, "y", presetValues.y, -80, 80);
    const blur = numberValue(values, "blur", presetValues.blur, 0, 160);
    const spread = numberValue(values, "spread", presetValues.spread, -40, 80);
    const color = values.color ?? "#202a3b";
    const parsedColor = parseCssColor(color);
    const layers = Array.from({ length: clamp(count, 1, 3) }, (_, index) => {
      const scale = 1 + index * 0.55;
      const alpha = opacity / (index + 1);
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
    const opacity = numberValue(values, "opacity", 0.72, 0, 1);
    const color = parseCssColor(values.color ?? "#202a3b") ?? { r: 32, g: 42, b: 59, a: 1 };
    const rgba = (alpha: number) => `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${clamp(alpha, 0, 1).toFixed(3)})`;
    const layerCount = Math.round(numberValue(values, "layers", 1, 1, 4));
    const shadows = Array.from({ length: layerCount }, (_, index) => {
      const multiplier = index + 1;
      const layerOpacity = opacity * (1 - index * 0.16);
      const layerBlur = Math.max(0, blur * (1 - index * 0.2));
      return `${x * multiplier}px ${y * multiplier}px ${layerBlur.toFixed(1)}px ${rgba(layerOpacity)}`;
    });
    const textShadow = shadows.join(", ");
    const textColor = values.textColor ?? "#ffffff";
    return { css: `text-shadow: ${textShadow};\ncolor: ${textColor};`, style: { textShadow, color: textColor } };
  }
  if (family === "border") {
    const width = numberValue(values, "width", 1, 0, 24);
    const radius = numberValue(values, "radius", 16, 0, 120);
    const radii = ["topLeft", "topRight", "bottomRight", "bottomLeft"].map((key) => numberValue(values, key, radius, 0, 120));
    const style = values.style ?? "solid";
    const color = values.color ?? "#b9c5d5";
    const borderRadius = radii.map((value) => `${value}px`).join(" ");
    return {
      css: `border: ${width}px ${style} ${color};\nborder-radius: ${borderRadius};`,
      style: { border: `${width}px ${style} ${color}`, borderRadius },
    };
  }
  if (family === "button") {
    const radius = numberValue(values, "radius", 10, 0, 48);
    const px = numberValue(values, "px", 16, 0, 64);
    const py = numberValue(values, "py", 10, 0, 40);
    const css = `.env-button {\n  background: ${values.bg};\n  color: ${values.text};\n  border: 0;\n  border-radius: ${radius}px;\n  padding: ${py}px ${px}px;\n  cursor: pointer;\n  transition: background-color 160ms ease, transform 160ms ease;\n}\n.env-button:hover { background: ${values.hover}; }\n.env-button:focus-visible { outline: 3px solid ${values.focus ?? "#7c4dff"}; outline-offset: 3px; }\n@media (prefers-reduced-motion: reduce) { .env-button { transition: none; } }`;
    return { css, style: { background: values.bg, color: values.text, borderRadius: `${radius}px`, padding: `${py}px ${px}px` } };
  }
  if (family === "card") {
    const radius = numberValue(values, "radius", 20, 0, 64);
    const pad = numberValue(values, "pad", 20, 0, 80);
    const shadow = values.shadow === "none" ? "none" : values.shadow === "strong" ? "0 14px 36px rgb(22 24 29 / 0.18)" : "0 8px 24px rgb(22 24 29 / 0.08)";
    const css = `.env-card {\n  background: ${values.bg};\n  color: ${values.text ?? "#111827"};\n  border: 1px solid ${values.border};\n  border-radius: ${radius}px;\n  padding: ${pad}px;\n  box-shadow: ${shadow};\n}\n.env-card__description { color: ${values.muted ?? "#475569"}; }`;
    return { css, style: { background: values.bg, color: values.text ?? "#111827", border: `1px solid ${values.border}`, borderRadius: `${radius}px`, padding: `${pad}px`, boxShadow: shadow } };
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
    return { css, style: { background: values.bg, border: `1px solid ${values.border}`, borderRadius: `${radius}px` } };
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
    const parsedTint = parseCssColor(tint);
    const rgba = (opacity: number) => parsedTint
      ? `rgba(${Math.round(parsedTint.r)}, ${Math.round(parsedTint.g)}, ${Math.round(parsedTint.b)}, ${opacity.toFixed(3)})`
      : `rgba(255, 255, 255, ${opacity.toFixed(3)})`;
    const background = rgba(alpha);
    const border = `1px solid ${rgba(borderAlpha)}`;
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
    const svg = buildPatternSvg(size, opacity, values.color ?? "#0d9f8a", (values.pattern ?? "diagonal") as import("@/lib/engines/svg-generators").PatternStyle);
    const backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    return { css: `background-image: ${backgroundImage};\nbackground-size: ${size}px ${size}px;`, style: { backgroundImage, backgroundSize: `${size}px ${size}px` }, svg };
  }
  if (family === "blob") {
    const svg = buildBlobSvg({
      seed: numberValue(values, "seed", 7, 1, 999),
      points: Number(values.points ?? 12),
      color: values.color ?? "#0d9f8a",
      rotation: numberValue(values, "rotation", 0, 0, 360),
      stroke: values.stroke ?? "#ffffff",
      strokeWidth: numberValue(values, "strokeWidth", 0, 0, 8),
    });
    return { css: svg, style: {}, svg };
  }
  if (family === "wave") {
    const svg = buildWaveSvg({
      amplitude: numberValue(values, "amp", 24, 0, 58),
      layers: numberValue(values, "layers", 2, 1, 3),
      frequency: numberValue(values, "frequency", 2, 1, 5),
      phase: numberValue(values, "phase", 0, 0, 360),
      baseline: numberValue(values, "baseline", 76, 30, 140),
      fill: values.fill ?? "#0d9f8a",
      secondary: values.secondary ?? "#7c4dff",
      background: values.background ?? "#ffffff",
      transparent: values.backgroundMode === "transparent",
    });
    return { css: svg, style: {}, svg };
  }
  const opacity = numberValue(values, "opacity", 0.08, 0, 1);
  const density = numberValue(values, "density", 1.1, 0.1, 3);
  const dataUrl = buildNoiseDataUrl(values.color ?? "#111827", density);
  const previewDataUrl = buildNoiseDataUrl(values.color ?? "#111827", density, opacity);
  const css = `.env-noise {\n  position: relative;\n  isolation: isolate;\n}\n.env-noise::after {\n  content: "";\n  position: absolute;\n  inset: 0;\n  pointer-events: none;\n  opacity: ${opacity};\n  background-image: ${dataUrl};\n}`;
  return { css, style: { backgroundColor: "#e2e8f0", backgroundImage: previewDataUrl, backgroundSize: "160px 160px" } };
}

export function CssGenEngine({ op, toolId }: { op: string; toolId?: string }) {
  const { family } = familyAndWorkflow(op, toolId);
  const allFields = BASE_FIELDS[family] ?? BASE_FIELDS.gradient;
  const [values, setValues] = useState(() => initialValues(allFields));
  const fields = useMemo(() => family !== "gradient" ? allFields : allFields.filter((field) => {
    if (field.name === "angle" && values.kind === "radial") return false;
    if ((field.name === "shape" || field.name === "radialSize") && values.kind !== "radial") return false;
    if ((field.name === "centerX" || field.name === "centerY") && values.kind === "linear") return false;
    if (field.name === "hueMethod" && !["hsl", "hwb", "lch", "oklch"].includes(values.colorSpace ?? "srgb")) return false;
    return true;
  }), [allFields, family, values.colorSpace, values.kind]);
  const [gradientStops, setGradientStops] = useState<GradientStop[]>(DEFAULT_GRADIENT_STOPS);
  const [gradientGlow, setGradientGlow] = useState(false);
  const [glowColor, setGlowColor] = useState("#ffffff");
  const [glowX, setGlowX] = useState(24);
  const [glowY, setGlowY] = useState(20);
  const [sampleText, setSampleText] = useState("Continue");
  useEffect(() => {
    setValues(initialValues(allFields));
    setGradientStops(DEFAULT_GRADIENT_STOPS.map((stop) => ({ ...stop })));
    setGradientGlow(false);
    setGlowColor("#ffffff");
    setGlowX(24);
    setGlowY(20);
    setSampleText("Continue");
  }, [family, allFields]);
  const gradientOverlay = { enabled: gradientGlow, color: glowColor, x: glowX, y: glowY };
  const output = useMemo(() => cssFor(family, values, gradientStops, gradientOverlay), [family, gradientGlow, glowColor, glowX, glowY, gradientStops, values]);
  const generatedSvg = output.svg;
  const code = generatedSvg ?? output.css;
  const isText = family === "button" || family === "badge" || family === "text-shadow";

  function randomizeShape() {
    setValues((previous) => ({ ...previous, seed: String(Math.floor(Math.random() * 999) + 1) }));
  }
  const sortedGradientStops = useMemo(() => normalizeGradientStops(gradientStops), [gradientStops]);

  function addGradientStop() {
    if (gradientStops.length >= 8) return;
    let bestStart = 0;
    let bestEnd = 100;
    let largestGap = -1;
    for (let index = 0; index < sortedGradientStops.length - 1; index += 1) {
      const start = sortedGradientStops[index].position;
      const end = sortedGradientStops[index + 1].position;
      if (end - start > largestGap) {
        largestGap = end - start;
        bestStart = start;
        bestEnd = end;
      }
    }
    const position = Math.round((bestStart + bestEnd) / 2);
    const colors = ["#f59e0b", "#22c55e", "#ec4899", "#38bdf8"];
    setGradientStops((previous) => [...previous, {
      id: `stop-${Date.now()}-${previous.length}`,
      color: colors[previous.length % colors.length],
      position,
    }]);
  }

  function loadGradientPreset(name: string) {
    const preset = GRADIENT_PRESETS.find((item) => item.name === name);
    if (!preset) return;
    setGradientStops(preset.stops.map((stop) => ({ ...stop })));
    setValues((previous) => ({ ...previous, kind: "linear", angle: String(preset.angle), repeating: "no" }));
  }

  function distributeGradientStops() {
    setGradientStops((previous) => normalizeGradientStops(previous).map((stop, index, list) => ({
      ...stop,
      position: list.length < 2 ? 0 : Math.round((index / (list.length - 1)) * 100),
    })));
  }

  function reverseGradientStops() {
    setGradientStops((previous) => normalizeGradientStops(previous)
      .map((stop) => ({ ...stop, position: 100 - stop.position }))
      .sort((a, b) => a.position - b.position));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-surface-2 p-3">
        <div>
          <p className="text-sm font-semibold text-fg">Design controls</p>
          <p className="mt-1 text-xs leading-5 text-muted">Change a setting to update the preview and export automatically. Processing stays in your browser.</p>
        </div>
        {family === "blob" ? <Button type="button" size="sm" variant="outline" onClick={randomizeShape}>Randomize shape</Button> : null}
        {family === "gradient" ? <Button type="button" size="sm" variant="outline" onClick={() => { setGradientStops(DEFAULT_GRADIENT_STOPS.map((stop) => ({ ...stop }))); setGradientGlow(false); setGlowColor("#ffffff"); setGlowX(24); setGlowY(20); setValues((previous) => ({ ...previous, kind: "linear", angle: "135", shape: "circle", radialSize: "farthest-corner", centerX: "50", centerY: "50", colorSpace: "srgb", hueMethod: "shorter", repeating: "no" })); }}>Reset gradient</Button> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          {family === "gradient" ? (
            <section className="space-y-3 rounded-xl border border-border bg-surface p-3" aria-labelledby="gradient-stops-heading">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="gradient-stops-heading" className="text-sm font-semibold text-fg">Color stops</h3>
                  <p className="mt-1 text-xs text-muted">Add, recolor and position each stop. The preview updates instantly.</p>
                </div>
                <Button type="button" size="sm" onClick={addGradientStop} disabled={gradientStops.length >= 8}>Add stop ({gradientStops.length}/8)</Button>
              </div>
              <div className="h-4 rounded-full border border-border" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${sortedGradientStops.map((stop) => `${stop.color} ${stop.position}%`).join(", ")})` }} />
              <div className="space-y-2">
                {sortedGradientStops.map((stop, index) => (
                  <div key={stop.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg bg-surface-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_5.5rem_auto] sm:items-center">
                    <label className="flex min-w-0 items-center gap-2">
                      <Input type="color" value={stop.color} onChange={(event) => setGradientStops((previous) => previous.map((item) => item.id === stop.id ? { ...item, color: event.target.value } : item))} className="h-10 w-12 shrink-0 p-1" aria-label={`Color for stop ${index + 1}`} />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-fg">Stop {index + 1}</span>
                        <span className="block truncate font-mono text-[10px] text-muted">{stop.color.toUpperCase()}</span>
                      </span>
                    </label>
                    <label className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
                      <span className="w-14 shrink-0 text-[11px] text-muted">Position</span>
                      <input type="range" min="0" max="100" step="1" value={stop.position} onChange={(event) => setGradientStops((previous) => previous.map((item) => item.id === stop.id ? { ...item, position: Number(event.target.value) } : item))} className="min-w-0 flex-1 accent-accent" aria-label={`Position for stop ${index + 1}`} />
                    </label>
                    <Input type="number" min={0} max={100} value={stop.position} onChange={(event) => setGradientStops((previous) => previous.map((item) => item.id === stop.id ? { ...item, position: clamp(Number(event.target.value) || 0, 0, 100) } : item))} className="h-10 font-mono text-xs" aria-label={`Stop ${index + 1} position percentage`} />
                    <Button type="button" size="sm" variant="ghost" onClick={() => setGradientStops((previous) => previous.filter((item) => item.id !== stop.id))} disabled={gradientStops.length <= 2} aria-label={`Remove stop ${index + 1}`}>Remove</Button>
                    <div className="col-span-2 flex justify-end gap-1 sm:col-span-4">
                      <Button type="button" size="sm" variant="ghost" disabled={index === 0} aria-label={`Move stop ${index + 1} earlier`} onClick={() => setGradientStops((previous) => moveGradientStop(previous, stop.id, -1))}>Move earlier</Button>
                      <Button type="button" size="sm" variant="ghost" disabled={index === sortedGradientStops.length - 1} aria-label={`Move stop ${index + 1} later`} onClick={() => setGradientStops((previous) => moveGradientStop(previous, stop.id, 1))}>Move later</Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={distributeGradientStops}>Distribute evenly</Button>
                  <Button type="button" size="sm" variant="outline" onClick={reverseGradientStops}>Reverse</Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {GRADIENT_PRESETS.map((preset) => <Button key={preset.name} type="button" size="sm" variant="ghost" onClick={() => loadGradientPreset(preset.name)}>{preset.name}</Button>)}
                </div>
              </div>
              <section className="space-y-3 rounded-lg bg-surface-2 p-3" aria-labelledby="gradient-overlay-heading">
                <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-fg">
                  <input type="checkbox" checked={gradientGlow} onChange={(event) => setGradientGlow(event.target.checked)} className="size-4 accent-accent" />
                  Add a second soft gradient layer
                </label>
                {gradientGlow ? <>
                  <div className="flex items-center justify-between gap-3"><Label htmlFor="gradient-glow-color">Overlay color</Label><Input id="gradient-glow-color" type="color" value={glowColor} onChange={(event) => setGlowColor(event.target.value)} className="h-10 w-16 p-1" /></div>
                  <label className="block space-y-1 text-xs text-muted">Horizontal position · {glowX}%<input type="range" min="0" max="100" value={glowX} onChange={(event) => setGlowX(Number(event.target.value))} className="min-h-9 w-full accent-accent" /></label>
                  <label className="block space-y-1 text-xs text-muted">Vertical position · {glowY}%<input type="range" min="0" max="100" value={glowY} onChange={(event) => setGlowY(Number(event.target.value))} className="min-h-9 w-full accent-accent" /></label>
                </> : <p className="text-xs text-muted">Layer a soft radial glow over the main gradient for richer hero and background treatments.</p>}
              </section>
            </section>
          ) : null}
          <FieldGrid fields={fields} values={values} onChange={(name, value) => setValues((previous) => {
            const next = { ...previous, [name]: value };
            if (family === "border" && name === "radius") {
              next.topLeft = value;
              next.topRight = value;
              next.bottomRight = value;
              next.bottomLeft = value;
            }
            if (name === "preset") {
              const presets: Record<string, { x: number; y: number; blur: number; spread: number; alpha: number }> = {
                subtle: { x: 0, y: 1, blur: 3, spread: 0, alpha: 0.12 },
                soft: { x: 0, y: 7, blur: 24, spread: -4, alpha: 0.14 },
                medium: { x: 0, y: 12, blur: 32, spread: -5, alpha: 0.18 },
                hard: { x: 0, y: 10, blur: 0, spread: 0, alpha: 0.24 },
                glow: { x: 0, y: 0, blur: 28, spread: 2, alpha: 0.36 },
                inset: { x: 0, y: 3, blur: 9, spread: -3, alpha: 0.22 },
                custom: { x: 0, y: 8, blur: 24, spread: 0, alpha: 0.18 },
              };
              const selected = presets[value];
              if (selected) {
                next.x = String(selected.x);
                next.y = String(selected.y);
                next.blur = String(selected.blur);
                next.spread = String(selected.spread);
                next.opacity = String(selected.alpha);
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
          {family === "button" ? <style>{`.env-live-button:hover { background: ${values.hover ?? values.bg}; } .env-live-button:focus-visible { outline: 3px solid ${values.focus ?? "#7c4dff"}; outline-offset: 3px; }`}</style> : null}
          {family === "input" ? <style>{`.env-live-input:focus-visible { outline: 3px solid ${values.focus ?? "#0d9f8a"}; outline-offset: 2px; }`}</style> : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-fg">Live preview</p>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">Updates as you edit</span>
          </div>
          <div
            className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl border border-border p-8"
            style={family === "glass" ? { background: "linear-gradient(135deg,#0d9f8a,#1d3557)" } : family === "wave" ? { background: values.backgroundMode === "transparent" ? "transparent" : values.background } : undefined}
          >
            {generatedSvg ? (
              <div className="w-full max-w-xl [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: generatedSvg }} />
            ) : family === "card" ? (
              <div className="w-full max-w-xs" style={output.style}>
                <p className="text-base font-semibold" style={{ color: values.text ?? "#111827" }}>A card preview</p>
                <p className="env-card__description mt-2 text-sm" style={{ color: values.muted ?? "#475569" }}>See how spacing, surface and depth work together in a real component.</p>
                <span className="mt-4 inline-flex rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Learn more</span>
              </div>
            ) : family === "input" ? (
              <input readOnly value="Input field preview" className="env-live-input w-full max-w-xs px-3 py-2 text-sm text-slate-800" style={output.style} />
            ) : family === "button" ? (
              <button type="button" className="env-live-button max-w-full whitespace-normal break-words font-semibold transition-colors motion-reduce:transition-none" style={output.style}>{sampleText}</button>
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
          {family === "neomorph" ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-muted">Neumorphic effects can make controls and boundaries difficult to distinguish. Keep labels visible, retain clear focus indicators and verify text and control contrast before using this treatment in an interface.</p> : null}
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
        {generatedSvg ? <div className="mb-3 flex flex-wrap gap-2"><CopyButton text={generatedSvg} label="Copy SVG" /><Button type="button" variant="outline" size="sm" onClick={() => downloadSvgAsPng(generatedSvg, `env-${family}-design.png`)}>Download PNG</Button></div> : null}
        <CodeResult code={code} filename={`env-${family}-design.${generatedSvg ? "svg" : "css"}`} />
      </div>
    </div>
  );
}
