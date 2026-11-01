import { contrastRatio, parseCssColor } from "./accessibility-color";

export type DesignComponentContrast = {
  label: string;
  ratio: number;
  threshold: number;
  passes: boolean;
  criterion: "text" | "non-text";
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function blendWithWhite(value: string, ratio: number): string {
  const color = parseCssColor(value) ?? parseCssColor("#0d9f8a")!;
  const mix = clamp(ratio, 0, 1);
  const channels = [color.r, color.g, color.b].map((channel) => Math.round(channel + (255 - channel) * mix));
  return "#" + channels.map((channel) => channel.toString(16).padStart(2, "0")).join("");
}

function inspectPair(
  label: string,
  foregroundValue: string | undefined,
  backgroundValue: string | undefined,
  threshold: number,
  criterion: DesignComponentContrast["criterion"],
): DesignComponentContrast | null {
  const foreground = parseCssColor(foregroundValue ?? "");
  const background = parseCssColor(backgroundValue ?? "");
  if (!foreground || !background) return null;
  const ratio = contrastRatio(foreground, background);
  return { label, ratio, threshold, passes: ratio >= threshold, criterion };
}

/** Evaluate the actual foreground/background pairs used by generated component variants. */
export function inspectDesignComponentContrast(
  family: string,
  values: Record<string, string>,
): DesignComponentContrast[] {
  const checks: Array<DesignComponentContrast | null> = [];
  const add = (
    label: string,
    foreground: string | undefined,
    background: string | undefined,
    threshold: number,
    criterion: DesignComponentContrast["criterion"] = "text",
  ) => checks.push(inspectPair(label, foreground, background, threshold, criterion));

  if (family === "button") {
    const variant = values.variant ?? "solid";
    const accent = values.bg ?? "#0d9f8a";
    const surface = variant === "outline" || variant === "ghost"
      ? "#ffffff"
      : variant === "soft" ? blendWithWhite(accent, 0.12) : accent;
    const foreground = variant === "solid" ? values.text ?? "#ffffff" : accent;
    add("Button label", foreground, surface, 4.5);
    const hoverSurface = variant === "outline" || variant === "ghost"
      ? blendWithWhite(accent, 0.12)
      : variant === "soft" ? blendWithWhite(accent, 0.2) : values.hover ?? accent;
    add("Button label · hover", foreground, hoverSurface, 4.5);
    add("Focus indicator / surface", values.focus ?? "#7c4dff", "#ffffff", 3, "non-text");
  } else if (family === "card") {
    const surface = values.bg ?? "#ffffff";
    add("Card title", values.text ?? "#111827", surface, 4.5);
    add("Card body copy", values.muted ?? "#475569", surface, 4.5);
    add("Card border / surface", values.border ?? "#e7e5e4", surface, 3, "non-text");
  } else if (family === "badge") {
    add("Badge label", values.text ?? "#087f6d", values.bg ?? "#e8f7f3", 4.5);
  } else if (family === "input") {
    const surface = values.bg ?? "#ffffff";
    add("Input text / surface", "#1f2937", surface, 4.5);
    add("Input border / surface", values.border ?? "#d6d3d1", surface, 3, "non-text");
    add("Input focus ring / surface", values.focus ?? "#0d9f8a", surface, 3, "non-text");
  }

  return checks.filter((item): item is DesignComponentContrast => item !== null);
}
