import { useMemo, useState } from "react";
import { CopyButton } from "@/components/tools/copy-button";
import { CodeResult } from "@/components/engines/result-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  contrastRatio,
  evaluateContrast,
  getContrastTargets,
  parseCssColor,
  rgbToHsl,
  suggestContrastCorrections,
  toHex,
  toHslString,
  toRgbString,
  type ContrastTarget,
  type RgbaColor,
} from "@/lib/engines/accessibility-color";
import { simulateColorVision, type ColorVisionMode } from "@/lib/engines/color-vision";

type Harmony = "analogous" | "complementary" | "triadic" | "split" | "tetradic" | "monochromatic";

const CONVERTER_DEFAULTS: Record<string, string> = {
  "hex-converter": "#0d9f8a",
  "rgb-converter": "rgb(13, 159, 138)",
  "hsl-converter": "hsl(172 85% 34%)",
  "hsv-converter": "hsv(172 92% 62%)",
  "cmyk-converter": "cmyk(92%, 0%, 13%, 38%)",
};
const TARGETS = getContrastTargets();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hsvToRgb(h: number, s: number, v: number): RgbaColor {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - chroma;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255, a: 1 };
}

function rgbToHsv(color: Pick<RgbaColor, "r" | "g" | "b">) {
  const r = color.r / 255, g = color.g / 255, b = color.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

function parseDesignColor(input: string): RgbaColor | null {
  const cssColor = parseCssColor(input);
  if (cssColor) return cssColor;
  const hsv = input.trim().match(/^hs[ vb]\(\s*([+-]?[\d.]+)(?:deg)?[ ,]+([\d.]+)%?[ ,]+([\d.]+)%?\s*\)$/i);
  if (hsv) {
    const usesPercent = input.includes("%");
    const h = Number(hsv[1]), s = Number(hsv[2]) / (usesPercent ? 100 : 1), v = Number(hsv[3]) / (usesPercent ? 100 : 1);
    if ([h, s, v].every(Number.isFinite) && s >= 0 && s <= 1 && v >= 0 && v <= 1) return hsvToRgb(h, s, v);
  }
  const cmyk = input.trim().match(/^cmyk\(\s*([\d.]+)%?\s*[, ]+([\d.]+)%?\s*[, ]+([\d.]+)%?\s*[, ]+([\d.]+)%?\s*\)$/i);
  if (cmyk) {
    const values = cmyk.slice(1).map(Number);
    if (values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
      const [c, m, y, k] = values.map((value) => value / 100);
      return { r: 255 * (1 - c) * (1 - k), g: 255 * (1 - m) * (1 - k), b: 255 * (1 - y) * (1 - k), a: 1 };
    }
  }
  return null;
}

function formatHsv(color: RgbaColor): string {
  const hsv = rgbToHsv(color);
  return `hsv(${Math.round(hsv.h)} ${Math.round(hsv.s * 100)}% ${Math.round(hsv.v * 100)}%)`;
}

function formatCmyk(color: RgbaColor): string {
  const r = clamp(color.r / 255, 0, 1), g = clamp(color.g / 255, 0, 1), b = clamp(color.b / 255, 0, 1);
  const k = 1 - Math.max(r, g, b);
  if (k >= 0.999999) return "cmyk(0%, 0%, 0%, 100%)";
  const c = ((1 - r - k) / (1 - k)) * 100;
  const m = ((1 - g - k) / (1 - k)) * 100;
  const y = ((1 - b - k) / (1 - k)) * 100;
  return `cmyk(${Math.round(c)}%, ${Math.round(m)}%, ${Math.round(y)}%, ${Math.round(k * 100)}%)`;
}

function makePalette(color: RgbaColor, harmony: Harmony): RgbaColor[] {
  const hsl = rgbToHsl(color);
  const stops: Record<Exclude<Harmony, "monochromatic">, number[]> = {
    analogous: [-40, -20, 0, 20, 40],
    complementary: [-15, 0, 180, 195, 210],
    triadic: [0, 120, 240, 120, 0],
    split: [0, 150, 210, 150, 210],
    tetradic: [0, 90, 180, 270, 90],
  };
  const fromHsl = (h: number, s: number, l: number): RgbaColor => {
    const hue = ((h % 360) + 360) % 360 / 360;
    const sat = clamp(s, 0, 1), light = clamp(l, 0, 1);
    if (sat === 0) return { r: light * 255, g: light * 255, b: light * 255, a: 1 };
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    const channel = (t: number) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return { r: channel(hue + 1 / 3) * 255, g: channel(hue) * 255, b: channel(hue - 1 / 3) * 255, a: 1 };
  };
  if (harmony === "monochromatic") {
    return [-0.32, -0.16, 0, 0.16, 0.3].map((offset) => fromHsl(hsl.h, hsl.s, clamp(hsl.l + offset, 0.06, 0.94)));
  }
  return stops[harmony].map((offset) => fromHsl(hsl.h + offset, hsl.s, hsl.l));
}

function colorInputValue(color: RgbaColor): string {
  return toHex({ ...color, a: 1 }).slice(0, 7);
}

function ContrastStatus({ passes, label }: { passes: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${passes ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}>
      <span className={`size-1.5 rounded-full ${passes ? "bg-emerald-500" : "bg-rose-500"}`} aria-hidden="true" />
      {label}: {passes ? "Pass" : "Needs work"}
    </span>
  );
}

export function ColorEngine({ op, toolId }: { op: string; toolId?: string }) {
  const [colorValue, setColorValue] = useState("#0d9f8a");
  const [foregroundValue, setForegroundValue] = useState("#16181d");
  const [backgroundValue, setBackgroundValue] = useState("#ffffff");
  const [harmony, setHarmony] = useState<Harmony>("analogous");
  const [target, setTarget] = useState<ContrastTarget>("normal-aa");
  const [visionMode, setVisionMode] = useState<ColorVisionMode>("deuteranopia");
  const [converterValue, setConverterValue] = useState(() => CONVERTER_DEFAULTS[toolId ?? ""] ?? "#0d9f8a");

  const color = useMemo(() => parseDesignColor(colorValue), [colorValue]);
  const foreground = useMemo(() => parseDesignColor(foregroundValue), [foregroundValue]);
  const background = useMemo(() => parseDesignColor(backgroundValue), [backgroundValue]);
  const converted = useMemo(() => parseDesignColor(converterValue), [converterValue]);
  const palette = useMemo(() => color ? makePalette(color, harmony) : [], [color, harmony]);
  const paletteCss = useMemo(() => `:root {
${palette.map((swatch, index) => `  --env-palette-${index + 1}: ${toHex(swatch)};`).join("\n")}
  --env-primary: ${toHex(palette[2] ?? { r: 13, g: 159, b: 138, a: 1 })};
  --env-secondary: ${toHex(palette[1] ?? { r: 90, g: 158, b: 232, a: 1 })};
  --env-accent: ${toHex(palette[4] ?? { r: 124, g: 77, b: 255, a: 1 })};
}`, [palette]);
  const contrastChecks = useMemo(() => foreground && background
    ? TARGETS.map((item) => ({ ...item, result: evaluateContrast(foreground, background, item.value) }))
    : [], [foreground, background]);
  const activeCheck = contrastChecks.find((item) => item.value === target);
  const correction = foreground && background
    ? suggestContrastCorrections(foreground, background, target)
    : null;

  const converterIds = ["hex-converter", "rgb-converter", "hsl-converter", "hsv-converter", "cmyk-converter"];
  if (toolId && converterIds.includes(toolId)) {
    const format = toolId.startsWith("hex") ? "HEX" : toolId.startsWith("rgb") ? "RGB" : toolId.startsWith("hsl") ? "HSL" : toolId.startsWith("hsv") ? "HSV / HSB" : "CMYK";
    return (
      <div className="space-y-5">
        <div className="rounded-xl bg-surface-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-fg">Convert {format} color</p>
              <p className="mt-1 text-xs leading-5 text-muted">Enter a value. All supported color formats are converted live as you type.</p>
            </div>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">Live</span>
          </div>
          <Label htmlFor="design-color-converter" className="mt-4 block">Color value</Label>
          <Input id="design-color-converter" value={converterValue} onChange={(event) => setConverterValue(event.target.value)} placeholder="HEX, RGB, HSL, HSV or CMYK" className="mt-1.5 font-mono" />
          {converterValue && !converted ? <p className="mt-2 text-xs text-danger">Enter a valid HEX, RGB, HSL, HSV or CMYK value.</p> : null}
        </div>
        {converted ? (
          <>
            <div className="flex items-center gap-4 rounded-xl border border-border p-4">
              <div className="size-16 shrink-0 rounded-xl shadow-[var(--shadow-border)]" style={{ background: toHex(converted) }} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">Converted color</p>
                <p className="mt-1 font-mono text-sm text-muted">{toHex(converted).toUpperCase()}</p>
                <p className="mt-1 text-xs text-muted">Alpha: {Math.round(converted.a * 100)}%</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["HEX", toHex(converted)],
                ["RGB", toRgbString(converted)],
                ["HSL", toHslString(converted)],
                ["HSV / HSB", formatHsv(converted)],
                ["CMYK · screen estimate", formatCmyk(converted)],
              ].map(([label, value]) => (
                <div key={label} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
                    <p className="mt-1 break-all font-mono text-xs text-fg">{value}</p>
                  </div>
                  <CopyButton text={value} label="Copy" />
                </div>
              ))}
            </div>
            {toolId === "cmyk-converter" ? <p className="text-xs leading-5 text-muted">CMYK is estimated from sRGB for screen use. Print output varies by printer, ink and ICC color profile.</p> : null}
          </>
        ) : null}
      </div>
    );
  }

  if (op === "contrast") {
    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contrast-foreground">Text / foreground color</Label>
            <div className="flex gap-2">
              <Input type="color" aria-label="Choose foreground color" value={foreground ? colorInputValue(foreground) : "#16181d"} onChange={(event) => setForegroundValue(event.target.value)} className="h-11 w-14 shrink-0 p-1" />
              <Input id="contrast-foreground" value={foregroundValue} onChange={(event) => setForegroundValue(event.target.value)} className="font-mono" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contrast-background">Background color</Label>
            <div className="flex gap-2">
              <Input type="color" aria-label="Choose background color" value={background ? colorInputValue(background) : "#ffffff"} onChange={(event) => setBackgroundValue(event.target.value)} className="h-11 w-14 shrink-0 p-1" />
              <Input id="contrast-background" value={backgroundValue} onChange={(event) => setBackgroundValue(event.target.value)} className="font-mono" />
            </div>
          </div>
        </div>
        {!foreground || !background ? <p className="text-sm text-danger">Enter valid CSS colors, including HEX with alpha, RGB or HSL.</p> : null}
        {foreground && background ? (
          <>
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="px-5 py-8 text-center" style={{ background: toHex(background), color: toHex(foreground) }}>
                <p className="text-2xl font-semibold">The quick brown fox</p>
                <p className="mt-2 text-sm">Normal body text · 16px</p>
                <p className="mt-4 text-3xl font-bold">Aa</p>
                <p className="mt-1 text-xs">Large bold text · 24px</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2 px-4 py-3">
                <span className="text-xs font-medium text-muted">Contrast ratio</span>
                <strong className="text-lg tabular-nums text-fg">{contrastRatio(foreground, background).toFixed(2)}:1</strong>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {contrastChecks.map((item) => <ContrastStatus key={item.value} passes={item.result.passes} label={item.label.replace(" · ", " ")} />)}
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-fg">Check a specific requirement</p>
                  <p className="mt-1 text-xs text-muted">Choose the content type you are validating.</p>
                </div>
                <Select value={target} onChange={(event) => setTarget(event.target.value as ContrastTarget)} className="min-w-48">
                  {TARGETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </Select>
              </div>
              {activeCheck ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-fg">{activeCheck.result.passes ? "This combination passes" : "This combination needs adjustment"}</p>
                    <p className="mt-1 text-xs text-muted">Required: {activeCheck.result.threshold.toFixed(1)}:1 · WCAG {activeCheck.result.criterion}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${activeCheck.result.passes ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}>
                    {activeCheck.result.passes ? "PASS" : "FAIL"}
                  </span>
                </div>
              ) : null}
              {correction?.foreground && !activeCheck?.result.passes ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-2 p-3">
                  <div>
                    <p className="text-xs font-semibold text-fg">Suggested foreground</p>
                    <p className="mt-1 font-mono text-xs text-muted">{toHex(correction.foreground)}</p>
                  </div>
                  <Button type="button" size="sm" onClick={() => setForegroundValue(toHex(correction.foreground!))}>Apply suggestion</Button>
                </div>
              ) : null}
            </div>
            <p className="text-xs leading-5 text-muted">Alpha is composited before contrast is evaluated. This checks the selected color pair only; it does not automatically inspect every element on a website.</p>
          </>
        ) : null}
      </div>
    );
  }

  if (op === "colorblind") {
    const examples = [["Error", "#D94B4B"], ["Success", "#229968"], ["Warning", "#E4AA32"], ["Information", "#347FC4"], ["Accent", "#8B5BC7"], ["Neutral", "#697386"]];
    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-fg">Preview a sample interface palette</p>
          <p className="mt-1 text-xs leading-5 text-muted">Compare common color-vision deficiency simulations. Labels remain visible so meaning is not communicated by color alone.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="vision-mode">Simulate</Label>
          <Select id="vision-mode" value={visionMode} onChange={(event) => setVisionMode(event.target.value as ColorVisionMode)} className="min-w-52">
            <option value="protanopia">Protanopia · red-cone</option>
            <option value="deuteranopia">Deuteranopia · green-cone</option>
            <option value="tritanopia">Tritanopia · blue-cone</option>
            <option value="achromatopsia">Achromatopsia · grayscale</option>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {examples.map(([label, source]) => {
            const simulated = simulateColorVision(source, visionMode) ?? source;
            return (
              <div key={label} className="overflow-hidden rounded-xl border border-border">
                <div className="grid grid-cols-2">
                  <div className="min-w-0 p-3">
                    <div className="h-16 rounded-lg" style={{ background: source }} />
                    <p className="mt-2 text-xs font-semibold text-fg">Original</p>
                    <p className="mt-1 font-mono text-[10px] text-muted">{source}</p>
                  </div>
                  <div className="min-w-0 border-l border-border p-3">
                    <div className="h-16 rounded-lg" style={{ background: simulated }} />
                    <p className="mt-2 text-xs font-semibold text-fg">{visionMode[0].toUpperCase() + visionMode.slice(1)}</p>
                    <p className="mt-1 font-mono text-[10px] text-muted">{simulated}</p>
                  </div>
                </div>
                <p className="border-t border-border px-3 py-2 text-xs font-medium text-muted">{label}</p>
              </div>
            );
          })}
        </div>
        <p className="rounded-lg bg-surface-2 p-3 text-xs leading-5 text-muted">This is an illustrative simulation using published color-vision deficiency models, not a clinical representation of an individual's vision. Always pair color with labels, icons or patterns and test with people who use the interface.</p>
      </div>
    );
  }

  if (op === "palette") {
    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-2">
            <Label htmlFor="palette-base">Starting color</Label>
            <div className="flex gap-2">
              <Input type="color" aria-label="Choose base palette color" value={color ? colorInputValue(color) : "#0d9f8a"} onChange={(event) => setColorValue(event.target.value)} className="h-11 w-14 shrink-0 p-1" />
              <Input id="palette-base" value={colorValue} onChange={(event) => setColorValue(event.target.value)} className="font-mono" />
            </div>
            {!color ? <p className="text-xs text-danger">Enter a valid color value.</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="palette-harmony">Color harmony</Label>
            <Select id="palette-harmony" value={harmony} onChange={(event) => setHarmony(event.target.value as Harmony)}>
              <option value="analogous">Analogous</option>
              <option value="complementary">Complementary</option>
              <option value="triadic">Triadic</option>
              <option value="split">Split complementary</option>
              <option value="tetradic">Tetradic</option>
              <option value="monochromatic">Monochromatic</option>
            </Select>
          </div>
        </div>
        {color ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {palette.map((swatch, index) => {
                const value = toHex(swatch);
                return (
                  <div key={`${value}-${index}`} className="overflow-hidden rounded-xl border border-border">
                    <button type="button" onClick={() => setColorValue(value)} className="block h-24 w-full sm:h-32" style={{ background: value }} aria-label={`Set base color to ${value}`} />
                    <div className="flex items-center justify-between gap-1 bg-surface p-2">
                      <span className="truncate font-mono text-[11px] text-fg">{value.toUpperCase()}</span>
                      <CopyButton text={value} label="Copy" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="rounded-xl bg-surface-2 p-4">
              <p className="text-sm font-semibold text-fg">See the colors in context</p>
              <div className="mt-3 overflow-hidden rounded-lg border border-border bg-white">
                <div className="flex h-2">{palette.map((swatch, index) => <span key={index} className="flex-1" style={{ background: toHex(swatch) }} />)}</div>
                <div className="p-4">
                  <div className="h-3 w-1/3 rounded bg-slate-200" />
                  <div className="mt-2 h-2 w-2/3 rounded bg-slate-100" />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-md px-3 py-2 text-xs font-semibold text-white" style={{ background: toHex(palette[2] ?? color) }}>Primary action</span>
                    <span className="rounded-md border px-3 py-2 text-xs font-semibold text-slate-700" style={{ borderColor: toHex(palette[1] ?? color) }}>Secondary</span>
                  </div>
                </div>
              </div>
            </div>
            <CodeResult code={paletteCss} filename="env-color-palette.css" />
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-2">
          <Label htmlFor="design-color">Color value</Label>
          <Input id="design-color" value={colorValue} onChange={(event) => setColorValue(event.target.value)} className="font-mono" />
          {!color ? <p className="text-xs text-danger">Enter a valid HEX, RGB, HSL, HSV or CMYK color.</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="design-color-picker">Pick a color</Label>
          <Input id="design-color-picker" type="color" value={color ? colorInputValue(color) : "#0d9f8a"} onChange={(event) => setColorValue(event.target.value)} className="h-11 w-20 p-1" />
        </div>
      </div>
      {color ? (
        <>
          <div className="flex items-center gap-4 rounded-xl border border-border p-4">
            <div className="size-20 shrink-0 rounded-xl shadow-[var(--shadow-border)]" style={{ background: toHex(color) }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">Selected color</p>
              <p className="mt-1 font-mono text-sm text-muted">{toHex(color).toUpperCase()}</p>
              <p className="mt-1 text-xs text-muted">Alpha: {Math.round(color.a * 100)}%</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["HEX", toHex(color)],
              ["RGB", toRgbString(color)],
              ["HSL", toHslString(color)],
              ["HSV / HSB", formatHsv(color)],
              ["CMYK · screen estimate", formatCmyk(color)],
            ].map(([label, value]) => (
              <div key={label} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
                  <p className="mt-1 break-all font-mono text-xs text-fg">{value}</p>
                </div>
                <CopyButton text={value} label="Copy" />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
