import { evaluateContrast, parseCssColor, type RgbaColor } from "./accessibility-color.ts";

export type UxUiContrastLayer = {
  id?: string;
  kind: string;
  name: string;
  text: string;
  color: string;
  background?: string;
  fill?: string;
  fontSize: number;
  fontWeight?: number;
  opacity?: number;
};

const NON_TEXT_KINDS = new Set([
  "image", "icon", "rect", "ellipse", "divider", "spacer",
  "triangle", "diamond", "hexagon", "star", "line",
]);

function rgba(color: RgbaColor): RgbaColor {
  return { r: color.r, g: color.g, b: color.b, a: color.a };
}

/**
 * Audits text-bearing design layers against WCAG AA contrast thresholds.
 * This is a solid-color estimate, not a full rendered-page conformance audit:
 * gradients, photographs, complex overlaps and platform-specific rendering
 * remain manual-review cases.
 */
export function auditUxUiStudioTextContrast(
  layers: readonly UxUiContrastLayer[],
  canvasBackground: string,
): string[] {
  const textLayers = layers.filter((layer) =>
    !NON_TEXT_KINDS.has(layer.kind) && layer.text.trim().length > 0
  );
  if (textLayers.length === 0) return [];

  const canvas = parseCssColor(canvasBackground);
  if (!canvas) {
    return ["Text contrast could not be evaluated because the canvas background is not a supported solid CSS color; manually review text contrast."];
  }

  const findings: string[] = [];
  for (const layer of textLayers) {
    const name = layer.name.trim() || (layer.id ? "Layer " + layer.id : "Unnamed layer");
    const foreground = parseCssColor(layer.color);
    if (!foreground) {
      findings.push(name + ": text foreground color is not a supported solid CSS color; manually review contrast.");
      continue;
    }

    const rawBackground = (layer.background ?? layer.fill ?? "").trim();
    const transparent = rawBackground.length === 0
      || rawBackground.toLowerCase() === "transparent"
      || rawBackground.toLowerCase() === "none";
    const parsedBackground = transparent ? canvas : parseCssColor(rawBackground);
    if (!parsedBackground) {
      findings.push(name + ": text background is not a supported solid CSS color (for example, it may be a gradient or image); manually review contrast.");
      continue;
    }

    const rawOpacity = layer.opacity ?? 1;
    const opacity = Math.min(1, Math.max(0, Number.isFinite(rawOpacity) ? rawOpacity : 1));
    const renderedForeground = rgba(foreground);
    renderedForeground.a *= opacity;
    const renderedBackground = rgba(parsedBackground);
    renderedBackground.a *= opacity;
    const isLargeText = layer.fontSize >= 24
      || (layer.fontSize >= 18.67 && (layer.fontWeight ?? 400) >= 700);
    const evaluation = evaluateContrast(
      renderedForeground,
      renderedBackground,
      isLargeText ? "large-aa" : "normal-aa",
      rgba(canvas),
    );
    if (!evaluation.passes) {
      findings.push(
        name + ": text contrast is " + evaluation.ratio.toFixed(2) + ":1; WCAG AA "
        + (isLargeText ? "large-text" : "normal-text") + " requires at least "
        + evaluation.threshold.toFixed(1) + ":1 for this solid-color pair."
      );
    }
  }
  return findings;
}
