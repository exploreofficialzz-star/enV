import { useEffect, useMemo, useState } from "react";
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
  resolveRenderedPair,
  rgbToHsl,
  suggestContrastCorrections,
  toHex,
  toHslString,
  toRgbString,
  type ContrastTarget,
  type RgbaColor,
} from "@/lib/engines/accessibility-color";
import { simulateColorVision, type ColorVisionMode } from "@/lib/engines/color-vision";
import { buildDesignPaletteExport, createColorShadeScale, createHarmonyPalette, type PaletteExportFormat, type PaletteHarmony } from "@/lib/engines/design-palette";
import { formatCmyk, formatHsv, parseDesignColor } from "@/lib/engines/design-color";

type Harmony = PaletteHarmony;
const DEFAULT_VISION_COLORS = [
  { label: "Error", color: "#D94B4B" },
  { label: "Success", color: "#229968" },
  { label: "Warning", color: "#E4AA32" },
  { label: "Information", color: "#347FC4" },
  { label: "Accent", color: "#8B5BC7" },
  { label: "Neutral", color: "#697386" },
];

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

function colorInputValue(color: RgbaColor): string {
  return toHex({ ...color, a: 1 }).slice(0, 7);
}

function extractImageColors(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 72;
        canvas.height = 72;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("This browser could not read the selected image.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const counts = new Map<string, number>();
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] < 160) continue;
          const red = Math.min(255, Math.round(pixels[index] / 17) * 17);
          const green = Math.min(255, Math.round(pixels[index + 1] / 17) * 17);
          const blue = Math.min(255, Math.round(pixels[index + 2] / 17) * 17);
          const hex = "#" + [red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("");
          counts.set(hex, (counts.get(hex) ?? 0) + 1);
        }
        const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([hex]) => hex);
        if (!colors.length) throw new Error("No visible colors could be sampled from this image.");
        resolve(colors);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Could not extract colors from this image."));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected image could not be opened."));
    };
    image.src = objectUrl;
  });
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
  const [canvasValue, setCanvasValue] = useState("#ffffff");
  const [harmony, setHarmony] = useState<Harmony>("analogous");
  const [paletteCount, setPaletteCount] = useState(5);
  const [target, setTarget] = useState<ContrastTarget>("normal-aa");
  const [visionMode, setVisionMode] = useState<ColorVisionMode>("deuteranopia");
  const [visionColors, setVisionColors] = useState(DEFAULT_VISION_COLORS);
  const [converterValue, setConverterValue] = useState(() => CONVERTER_DEFAULTS[toolId ?? ""] ?? "#0d9f8a");
  const [lockedSwatches, setLockedSwatches] = useState<Record<number, string>>({});
  const [previewMode, setPreviewMode] = useState<"light" | "dark">("light");
  const [exportFormat, setExportFormat] = useState<PaletteExportFormat>("css");
  const [imagePalette, setImagePalette] = useState<string[]>([]);
  const [paletteError, setPaletteError] = useState("");

  useEffect(() => {
    const initialConverterValue = CONVERTER_DEFAULTS[toolId ?? ""];
    if (initialConverterValue) setConverterValue(initialConverterValue);
  }, [toolId]);

  useEffect(() => {
    if (op !== "palette" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sharedBase = params.get("base");
    const sharedHarmony = params.get("harmony");
    const sharedLocks = params.get("locks");
    if (sharedBase && parseDesignColor(sharedBase)) setColorValue(sharedBase);
    if (sharedHarmony && ["analogous", "complementary", "triadic", "split", "tetradic", "monochromatic"].includes(sharedHarmony)) {
      setHarmony(sharedHarmony as Harmony);
    }
    const sharedCount = Number(params.get("count"));
    if (Number.isInteger(sharedCount) && sharedCount >= 3 && sharedCount <= 8) setPaletteCount(sharedCount);
    if (sharedLocks) {
      try {
        const parsed = JSON.parse(sharedLocks) as Record<string, string>;
        const safeLocks: Record<number, string> = {};
        for (const [index, value] of Object.entries(parsed)) {
          const numericIndex = Number(index);
          if (Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < 8 && typeof value === "string" && parseDesignColor(value)) {
            safeLocks[numericIndex] = value;
          }
        }
        setLockedSwatches(safeLocks);
      } catch {
        setPaletteError("The shared palette lock settings were invalid; generated colors are still available.");
      }
    }
  }, [op]);

  const color = useMemo(() => parseDesignColor(colorValue), [colorValue]);
  const foreground = useMemo(() => parseDesignColor(foregroundValue), [foregroundValue]);
  const background = useMemo(() => parseDesignColor(backgroundValue), [backgroundValue]);
  const canvas = useMemo(() => parseDesignColor(canvasValue), [canvasValue]);
  const converted = useMemo(() => parseDesignColor(converterValue), [converterValue]);
  const palette = useMemo(() => {
    if (!color) return [];
    return createHarmonyPalette(color, harmony, paletteCount).map((swatch, index) => {
      const locked = lockedSwatches[index] ? parseDesignColor(lockedSwatches[index]) : null;
      return locked ?? swatch;
    });
  }, [color, harmony, lockedSwatches, paletteCount]);
  const primaryColor = toHex(palette[2] ?? { r: 13, g: 159, b: 138, a: 1 });
  const shadeScale = useMemo(() => createColorShadeScale(primaryColor), [primaryColor]);
  const roleColors = useMemo(() => ({
    primary: primaryColor,
    secondary: toHex(palette[1] ?? { r: 90, g: 158, b: 232, a: 1 }),
    accent: toHex(palette[4] ?? { r: 124, g: 77, b: 255, a: 1 }),
    success: toHex(palette[3] ?? { r: 34, g: 153, b: 104, a: 1 }),
    info: toHex(palette[0] ?? { r: 52, g: 127, b: 196, a: 1 }),
    background: previewMode === "light" ? "#f8fafc" : "#0f172a",
    surface: previewMode === "light" ? "#ffffff" : "#1e293b",
    text: previewMode === "light" ? "#111827" : "#f8fafc",
    border: previewMode === "light" ? "#e2e8f0" : "#334155",
  }), [palette, previewMode, primaryColor]);
  const paletteExport = useMemo(
    () => buildDesignPaletteExport(roleColors, shadeScale, exportFormat),
    [exportFormat, roleColors, shadeScale],
  );
  const paletteShareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("base", colorValue);
    url.searchParams.set("harmony", harmony);
    url.searchParams.set("count", String(paletteCount));
    url.searchParams.set("locks", JSON.stringify(lockedSwatches));
    return url.toString();
  }, [colorValue, harmony, lockedSwatches, paletteCount]);
  const contrastChecks = useMemo(() => foreground && background && canvas
    ? TARGETS.map((item) => ({ ...item, result: evaluateContrast(foreground, background, item.value, canvas) }))
    : [], [foreground, background, canvas]);
  const activeCheck = contrastChecks.find((item) => item.value === target);
  const previewPair = useMemo(
    () => foreground && background && canvas ? resolveRenderedPair(foreground, background, canvas) : null,
    [foreground, background, canvas],
  );
  const correction = foreground && background && canvas
    ? suggestContrastCorrections(foreground, background, target, canvas)
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
    const isWcagReport = toolId === "wcag-checker";
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-fg">{isWcagReport ? "WCAG contrast report" : "Contrast checker"}</h3>
          <p className="mt-1 text-xs leading-5 text-muted">{isWcagReport ? "Review all five WCAG text and non-text contrast targets for this color pair." : "Check the rendered contrast of a foreground and background color."}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="space-y-2">
            <Label htmlFor="contrast-canvas">Page / canvas behind transparency</Label>
            <div className="flex gap-2">
              <Input type="color" aria-label="Choose canvas color behind transparent colors" value={canvas ? colorInputValue(canvas) : "#ffffff"} onChange={(event) => setCanvasValue(event.target.value)} className="h-11 w-14 shrink-0 p-1" />
              <Input id="contrast-canvas" value={canvasValue} onChange={(event) => setCanvasValue(event.target.value)} className="font-mono" />
            </div>
          </div>
        </div>
        {!foreground || !background || !canvas ? <p className="text-sm text-danger">Enter valid foreground, background and canvas CSS colors, including HEX with alpha, RGB or HSL.</p> : null}
        {foreground && background && canvas ? (
          <>
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="px-5 py-8 text-center" style={{ background: previewPair ? toHex(previewPair.background) : "#ffffff", color: previewPair ? toHex(previewPair.foreground) : "#111827" }}>
                <p className="text-2xl font-semibold">The quick brown fox</p>
                <p className="mt-2 text-sm">Normal body text · 16px</p>
                <p className="mt-4 text-3xl font-bold">Aa</p>
                <p className="mt-1 text-xs">Large bold text · 24px</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2 px-4 py-3">
                <span className="text-xs font-medium text-muted">Contrast ratio</span>
                <strong className="text-lg tabular-nums text-fg">{contrastRatio(foreground, background, canvas).toFixed(2)}:1</strong>
              </div>
            </div>
            {isWcagReport ? (
              <section className="overflow-hidden rounded-xl border border-border" aria-labelledby="wcag-report-heading">
                <div className="border-b border-border bg-surface-2 px-4 py-3">
                  <h4 id="wcag-report-heading" className="text-sm font-semibold text-fg">WCAG 2.2 contrast requirements</h4>
                  <p className="mt-1 text-xs text-muted">Each requirement is evaluated against the same composited color pair.</p>
                </div>
                <div className="divide-y divide-border">
                  {contrastChecks.map((item) => (
                    <div key={item.value} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                      <div><p className="text-sm font-medium text-fg">{item.label}</p><p className="mt-0.5 text-xs text-muted">Success criterion {item.result.criterion}</p></div>
                      <span className="text-xs tabular-nums text-muted">Required {item.result.threshold.toFixed(1)}:1</span>
                      <span className="text-xs tabular-nums text-fg">Actual {item.result.ratio.toFixed(2)}:1</span>
                      <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.result.passes ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}>{item.result.passes ? "PASS" : "FAIL"}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {contrastChecks.map((item) => <ContrastStatus key={item.value} passes={item.result.passes} label={item.label.replace(" · ", " ")} />)}
              </div>
            )}
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
            <p className="text-xs leading-5 text-muted">Foreground and background alpha are composited in order over the selected page/canvas color before the ratio is calculated. This checks the selected pair only; it does not automatically inspect every element on a website. The non-text target is intended for meaningful UI components and graphical objects, not decorative graphics.</p>
          </>
        ) : null}
      </div>
    );
  }

  if (op === "colorblind") {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-fg">Test your own interface colors</p>
          <p className="mt-1 text-xs leading-5 text-muted">Edit the sample roles or paste your own palette. Every change is simulated locally in the selected color-vision mode.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="vision-mode">Simulate</Label>
          <Select id="vision-mode" value={visionMode} onChange={(event) => setVisionMode(event.target.value as ColorVisionMode)} className="min-w-52">
            <option value="protanopia">Protanopia · red-cone</option>
            <option value="deuteranopia">Deuteranopia · green-cone</option>
            <option value="tritanopia">Tritanopia · blue-cone</option>
            <option value="achromatopsia">Achromatopsia · grayscale</option>
          </Select>
          <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => setVisionColors(DEFAULT_VISION_COLORS.map((item) => ({ ...item })))}>Reset sample colors</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visionColors.map((item, index) => (
            <div key={item.label} className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3">
              <Input type="color" value={item.color} onChange={(event) => setVisionColors((previous) => previous.map((color, i) => i === index ? { ...color, color: event.target.value } : color))} className="h-11 w-14 shrink-0 p-1" aria-label={`Choose ${item.label} color`} />
              <div className="min-w-0 flex-1"><Label className="text-xs">{item.label}</Label><p className="mt-1 truncate font-mono text-[11px] text-muted">{item.color.toUpperCase()}</p></div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visionColors.map(({ label, color: source }) => {
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
    const primaryText = color && contrastRatio(parseDesignColor("#ffffff")!, parseDesignColor(roleColors.primary)!) >= 4.5 ? "#ffffff" : "#111827";
    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-2">
            <Label htmlFor="palette-base">Starting color</Label>
            <div className="flex gap-2">
              <Input type="color" aria-label="Choose base palette color" value={color ? colorInputValue(color) : "#0d9f8a"} onChange={(event) => { setColorValue(event.target.value); setPaletteError(""); }} className="h-11 w-14 shrink-0 p-1" />
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
        <section className="space-y-3 rounded-xl border border-border bg-surface p-3" aria-labelledby="image-palette-heading">
          <div>
            <h3 id="image-palette-heading" className="text-sm font-semibold text-fg">Extract colors from an image</h3>
            <p className="mt-1 text-xs leading-5 text-muted">Choose a photo or design file. The image is sampled locally in this browser; it is not uploaded.</p>
          </div>
          <Input type="file" accept="image/*" aria-label="Choose an image to extract a color palette" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 12 * 1024 * 1024) {
              setPaletteError("Choose an image smaller than 12 MB.");
              event.target.value = "";
              return;
            }
            try {
              const extracted = await extractImageColors(file);
              setImagePalette(extracted);
              setColorValue(extracted[0]);
              setLockedSwatches({});
              setPaletteError("");
            } catch (error) {
              setPaletteError(error instanceof Error ? error.message : "Could not read the image.");
            }
            event.target.value = "";
          }} className="min-h-11" />
          {imagePalette.length > 0 ? <div className="flex flex-wrap gap-2" aria-label="Extracted image colors">
            {imagePalette.map((value) => <button key={value} type="button" onClick={() => setColorValue(value)} className="group flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2 text-xs" aria-label={`Use extracted color ${value}`}>
              <span className="size-7 rounded-md border border-black/10" style={{ background: value }} />
              <span className="font-mono">{value.toUpperCase()}</span>
            </button>)}
          </div> : null}
          {paletteError ? <p role="status" className="text-xs text-danger">{paletteError}</p> : null}
        </section>
        {color ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-fg">Your color palette</p>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="palette-count" className="text-xs text-muted">Colors</Label>
                <Select id="palette-count" value={String(paletteCount)} onChange={(event) => setPaletteCount(clamp(Number(event.target.value), 3, 8))} className="w-20">
                  {[3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}</option>)}
                </Select>
                <Button type="button" size="sm" variant="outline" onClick={() => setColorValue("#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"))}>Randomize unlocked</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setLockedSwatches({})} disabled={Object.keys(lockedSwatches).length === 0}>Unlock all</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {palette.map((swatch, index) => {
                const value = toHex(swatch);
                const locked = Boolean(lockedSwatches[index]);
                return (
                  <div key={index} className="overflow-hidden rounded-xl border border-border">
                    <button type="button" onClick={() => setColorValue(value)} className="block h-24 w-full sm:h-32" style={{ background: value }} aria-label={`Use ${value} as the base color`} />
                    <div className="space-y-2 bg-surface p-2">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate font-mono text-[11px] text-fg">{value.toUpperCase()}</span>
                        <CopyButton text={value} label="Copy" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Input type="color" aria-label={`Edit palette color ${index + 1}`} value={colorInputValue(swatch)} onChange={(event) => setLockedSwatches((previous) => ({ ...previous, [index]: event.target.value }))} className="h-9 w-12 shrink-0 p-1" />
                        <span className="min-w-0 text-[10px] text-muted">Edit swatch</span>
                      </div>
                      <Button type="button" size="sm" variant={locked ? "secondary" : "ghost"} className="min-h-9 w-full" aria-pressed={locked} onClick={() => setLockedSwatches((previous) => {
                        const next = { ...previous };
                        if (next[index]) delete next[index];
                        else next[index] = value;
                        return next;
                      })}>{locked ? "Locked · keep color" : "Lock color"}</Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <section className="space-y-3 rounded-xl border border-border p-4" aria-labelledby="semantic-colors-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="semantic-colors-heading" className="text-sm font-semibold text-fg">Interface color roles</h3>
                  <p className="mt-1 text-xs leading-5 text-muted">A palette mapped to practical roles instead of disconnected swatches.</p>
                </div>
                <Select value={previewMode} onChange={(event) => setPreviewMode(event.target.value as "light" | "dark")} aria-label="Preview color theme" className="w-32">
                  <option value="light">Light preview</option>
                  <option value="dark">Dark preview</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(roleColors).map(([role, value]) => <div key={role} className="flex min-w-0 items-center gap-2 rounded-lg bg-surface-2 p-2">
                  <span className="size-8 shrink-0 rounded-md border border-black/10" style={{ background: value }} />
                  <span className="min-w-0"><span className="block text-[11px] font-semibold capitalize text-fg">{role}</span><span className="block truncate font-mono text-[10px] text-muted">{value.toUpperCase()}</span></span>
                </div>)}
              </div>
              <div className="overflow-hidden rounded-xl border" style={{ background: roleColors.background, borderColor: roleColors.border, color: roleColors.text }}>
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: roleColors.border }}>
                  <span className="text-sm font-bold">Acme workspace</span>
                  <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ background: roleColors.accent, color: "#ffffff" }}>PRO</span>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr]">
                  <div className="rounded-lg border p-3" style={{ background: roleColors.surface, borderColor: roleColors.border }}>
                    <p className="text-xs font-medium opacity-70">Overview</p>
                    <p className="mt-2 text-xl font-bold">Design system</p>
                    <p className="mt-1 text-xs opacity-70">Semantic colors, components and states.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-md px-3 py-2 text-xs font-semibold" style={{ background: roleColors.primary, color: primaryText }}>Primary action</span>
                      <span className="rounded-md border px-3 py-2 text-xs font-semibold" style={{ background: roleColors.surface, borderColor: roleColors.secondary, color: roleColors.text }}>Secondary</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3" style={{ background: roleColors.surface, borderColor: roleColors.border }}>
                    <span className="size-9 rounded-full" style={{ background: roleColors.success }} />
                    <span><span className="block text-sm font-semibold">All systems normal</span><span className="block text-xs opacity-70">Status uses a label as well as color.</span></span>
                  </div>
                </div>
              </div>
            </section>
            <section className="space-y-2" aria-labelledby="shade-scale-heading">
              <div><h3 id="shade-scale-heading" className="text-sm font-semibold text-fg">Primary shade scale</h3><p className="mt-1 text-xs text-muted">Useful for hover, borders, backgrounds and emphasis in a real design system.</p></div>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-11">
                {shadeScale.map(({ step, color: shade }) => <div key={step} className="overflow-hidden rounded-md border border-border"><div className="h-10" style={{ background: shade }} /><p className="bg-surface px-1 py-1 text-center text-[10px] text-muted">{step}</p></div>)}
              </div>
            </section>
            <section className="space-y-2 rounded-xl border border-border p-3" aria-labelledby="palette-export-heading">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 id="palette-export-heading" className="text-sm font-semibold text-fg">Export design tokens</h3><p className="mt-1 text-xs text-muted">Use these semantic roles and shade values in your project.</p></div>
                <Select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as PaletteExportFormat)} className="w-36" aria-label="Palette export format">
                  <option value="css">CSS variables</option>
                  <option value="scss">SCSS variables</option>
                  <option value="tailwind">Tailwind config</option>
                  <option value="json">JSON tokens</option>
                  <option value="tokens">W3C tokens</option>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2"><CopyButton text={paletteShareUrl} label="Copy share link" /><span className="self-center text-xs text-muted">Locked swatches and harmony are included.</span></div>
              <CodeResult code={paletteExport} filename={`env-design-tokens.${exportFormat === "css" ? "css" : exportFormat === "scss" ? "scss" : exportFormat === "tailwind" ? "js" : "json"}`} />
            </section>
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
