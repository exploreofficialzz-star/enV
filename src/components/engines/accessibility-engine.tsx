// @ts-nocheck
import { useMemo, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/tools/copy-button";
import { ResultPanel } from "@/components/engines/result-panel";
import { Select } from "@/components/ui/select";
import {
  type ContrastTarget,
  contrastRatio,
  evaluateContrast,
  formatColorSummary,
  getContrastTargets,
  parseCssColor,
  suggestContrastCorrections,
  targetLabel,
  toHex,
  type RgbaColor,
  resolveRenderedPair,
} from "@/lib/engines/accessibility-color";

import { type Action, type Kind, parseToolId } from "./accessibility-engine-utils";
import { auditAccessibilityMarkup, scanMarkupWithAxe } from "@/lib/engines/accessibility-audit";
const COLORS = ["#000000", "#ffffff", "#1d4ed8", "#047857", "#b91c1c", "#7c3aed", "#92400e"];
function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function clamp(n: number, min = 0, max = 255) { return Math.min(max, Math.max(min, n)); }
function hexRgb(hex: string) {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)] as [number, number, number];
}
function rgbHex(rgb: [number, number, number]) { return `#${rgb.map((v) => clamp(Math.round(v)).toString(16).padStart(2, "0")).join("")}`; }
function linear(v: number) { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
function luminance(hex: string) {
  const rgb = hexRgb(hex); if (!rgb) return null;
  const [r, g, b] = rgb.map(linear); return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const la = luminance(a), lb = luminance(b); if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function contrastText(ratio: number | null) {
  if (ratio === null) return "Invalid color. Use six-digit hexadecimal values such as #112233.";
  return `Contrast ratio: ${ratio.toFixed(2)}:1\nWCAG AA normal text (4.5:1): ${ratio >= 4.5 ? "PASS" : "FAIL"}\nWCAG AA large text (3:1): ${ratio >= 3 ? "PASS" : "FAIL"}\nWCAG AAA normal text (7:1): ${ratio >= 7 ? "PASS" : "FAIL"}`;
}
function syllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, ""); if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^aeiouy]+$)/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}
function readability(text: string) {
  const clean = text.trim();
  const words = clean.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) ?? [];
  const sentences = Math.max(1, clean.split(/[.!?]+/).filter(Boolean).length);
  const syllableCount = words.reduce((n, word) => n + syllables(word), 0);
  if (!words.length) return null;
  const wordsPerSentence = words.length / sentences;
  const syllablesPerWord = syllableCount / words.length;
  const ease = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  const grade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
  return { words: words.length, sentences, syllables: syllableCount, ease, grade };
}
function titleCase(value: string) { return value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function parsePx(value: string) {
  const n = Number.parseFloat(value); if (!Number.isFinite(n)) return null;
  if (/rem$/i.test(value)) return n * 16;
  return /px$/i.test(value) || /^\d+(?:\.\d+)?$/.test(value.trim()) ? n : null;
}
function simulateColor(hex: string, type: "protanopia" | "deuteranopia" | "tritanopia") {
  const rgb = hexRgb(hex); if (!rgb) return null;
  const [r, g, b] = rgb;
  const matrices = {
    protanopia: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
    deuteranopia: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
    tritanopia: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]],
  } as const;
  const m = matrices[type];
  return rgbHex([m[0][0] * r + m[0][1] * g + m[0][2] * b, m[1][0] * r + m[1][1] * g + m[1][2] * b, m[2][0] * r + m[2][1] * g + m[2][2] * b]);
}
function analyzeHtml(html: string, kind: Kind) {
  if (!html.trim()) return "Paste HTML/CSS in the field above to run the local check.";
  return auditAccessibilityMarkup(`${kind}-checker`, html).report;
}

function buildOutput(kind: Kind, action: Action, values: { fg: string; bg: string; text: string; size: string; lineHeight: string; html: string; role: string }) {
  const { fg, bg, text, size, lineHeight, html, role } = values;
  if (action === "helper") {
    const guidance: Partial<Record<Kind, string>> = {
      "alt-text": "WRITING COACH · Describe the image's purpose in context. Keep essential meaning, omit decorative details, and use alt=\"\" only for decorative images.",
      aria: "ARIA MISTAKE FIXER · Prefer native HTML. Give controls a name, keep referenced IDs unique, expose accurate state, and avoid redundant roles.",
      form: "FORM FIXER · Pair each field with a visible label, associate errors with their field, explain corrections, and preserve keyboard focus.",
      "keyboard-navigation": "KEYBOARD FIXER · Use native controls, natural order, visible focus, and avoid positive tabindex and keyboard traps.",
      "focus-state": "FOCUS FIXER · Keep a high-contrast, unclipped keyboard focus indicator; check sticky content and Windows High Contrast Mode.",
      motion: "MOTION FIXER · Respect reduced-motion preferences, remove non-essential movement, and preserve essential feedback.",
      contrast: "GUIDED COLOR FIXER · Change one color at a time, retain intended hue where possible, and recheck in the actual text/UI context.",
      "accessible-color": "GUIDED COLOR FIXER · Change one color at a time, retain intended hue where possible, and recheck in the actual text/UI context.",
      "font-size": "TYPE FIXER · Prefer scalable units; verify 200% text resize, 400% zoom/reflow, and text-spacing overrides without clipping.",
      "line-height": "TYPE FIXER · Prefer scalable units; verify 200% text resize, 400% zoom/reflow, and text-spacing overrides without clipping.",
      "text-readability": "READABILITY COACH · Split long sentences, explain specialist terms, use descriptive headings, and test with intended readers.",
      "color-blindness": "COLOR-SAFETY HELPER · Never communicate status by color alone; pair colors with text, icons, or patterns and inspect the simulated alternatives.",
    };
    return `${guidance[kind] ?? "ACCESSIBILITY FIXER · Apply one change at a time and verify with keyboard and assistive technology."}\n\n${buildOutput(kind, "checker", values)}`;
  }
  if (action === "preview") {
    if (kind === "alt-text") {
      const announcements = [...html.matchAll(/<img\b[^>]*>/gi)].map(([tag]) => {
        const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1];
        return alt === undefined ? "Image (missing alternative)" : alt ? `Image: ${alt}` : "Decorative image (not announced)";
      });
      return `SCREEN-READER ANNOUNCEMENT PREVIEW\n${announcements.join("\n") || "Paste image markup to preview announcements."}\n\nIllustrative text only; real announcements vary by screen reader and context.`;
    }
    if (kind === "aria") return `ACCESSIBILITY TREE PREVIEW\n${analyzeHtml(html, kind)}\n\nInspect the actual browser accessibility tree and test with a screen reader; static markup cannot resolve every computed name or state.`;
    if (kind === "font-size") return `TEXT PREVIEW · 200% RESIZE\nInput size: ${size}\nCompare wrapping, clipping, and overlap at 200% and 400% zoom.`;
    if (kind === "line-height") return `TEXT SPACING PREVIEW\nFont size: ${size} · line-height: ${lineHeight}\nAlso test WCAG text-spacing overrides: 1.5× line height, 2× paragraph spacing, 0.12× letter spacing, and 0.16× word spacing.`;
    if (kind === "text-readability") return `BEFORE / REVIEW\n${buildOutput(kind, "checker", values)}\n\nEstimates only; this preview does not automatically rewrite the text.`;
    if (["contrast", "accessible-color", "color-blindness"].includes(kind)) return `SIDE-BY-SIDE PREVIEW\nOriginal: ${fg} on ${bg}\n\n${buildOutput(kind, "checker", values)}`;
    return `INTERACTIVE PREVIEW\n${analyzeHtml(html, kind)}\n\nStatic preview only; verify with real keyboard and assistive technology.`;
  }
  if (action === "simulator") {
    if (kind === "color-blindness") return `COLOR-VISION SIMULATION (approximate)\n${buildOutput(kind, "checker", values)}\n\nIllustrative only, not clinical or a substitute for user testing.`;
    if (["keyboard-navigation", "focus-state", "aria", "form"].includes(kind)) return `KEYBOARD + ASSISTIVE-TECHNOLOGY WALKTHROUGH\n1. Tab forward and Shift+Tab backward through controls.\n2. Confirm visible focus and logical order.\n3. Activate with Enter/Space; dismiss with Escape where appropriate.\n4. Check names, roles, values, and errors with a screen reader.\n\n${buildOutput(kind, "checker", values)}`;
    if (["font-size", "line-height"].includes(kind)) return `ZOOM SIMULATION CHECKLIST\nAt 200% text resize and 400% viewport zoom, inspect clipping, overlap, horizontal scrolling, and control reachability.\n\n${buildOutput(kind, "preview", values)}`;
    if (kind === "motion") return `REDUCED-MOTION SIMULATION\nEnable the operating-system reduced-motion setting. Confirm non-essential movement stops while essential feedback and meaning remain.\n\n${analyzeHtml(html, kind)}`;
    return `SIMULATION GUIDE\nStatic output cannot reproduce an individual user's assistive technology. Test with real devices and users.\n\n${buildOutput(kind, "checker", values)}`;
  }
  if (kind === "contrast" || kind === "accessible-color") {
    const ratio = contrast(fg, bg);
    if (action === "generator") {
      const base = hexRgb(bg);
      const candidates = COLORS.map((c) => ({ c, ratio: contrast(c, bg) ?? 0 })).filter((x) => x.ratio >= 4.5).sort((a, b) => b.ratio - a.ratio).slice(0, 5);
      return `ACCESSIBLE COLOR SUGGESTIONS\nBackground: ${bg}\n${base ? candidates.map((x) => `${x.c} — ${x.ratio.toFixed(2)}:1`).join("\n") : "Enter a valid #RRGGBB background."}`;
    }
    return `${titleCase(kind)} ${action.toUpperCase()}\n\nForeground: ${fg}\nBackground: ${bg}\n\n${contrastText(ratio)}\n\nTip: check the actual text size and UI context before shipping.`;
  }
  if (kind === "color-blindness") {
    if (!hexRgb(fg)) return "Enter a valid six-digit hexadecimal color such as #3366cc.";
    return `COLOR-BLINDNESS SIMULATION\nOriginal: ${fg}\nProtanopia approximation: ${simulateColor(fg, "protanopia") ?? "invalid"}\nDeuteranopia approximation: ${simulateColor(fg, "deuteranopia") ?? "invalid"}\nTritanopia approximation: ${simulateColor(fg, "tritanopia") ?? "invalid"}\n\nThese are mathematical simulations, not a medical diagnosis.`;
  }
  if (kind === "font-size") {
    const px = parsePx(size);
    if (action === "generator") return `FONT SIZE GUIDE\n\nRecommended starting sizes:\nBody: 16px (1rem)\nSmall supporting text: 14px (0.875rem)\nLarge body: 18px (1.125rem)\nHeading: 32px+ depending on hierarchy\n\nUse relative units where appropriate and test browser zoom.`;
    return `FONT SIZE CHECK\n\nInput: ${size || "(empty)"}\nEquivalent: ${px === null ? "invalid / unsupported unit" : `${px.toFixed(2)}px`}\n\n${px !== null && px >= 16 ? "The size is at least 16px; verify readability at zoom and on the target device." : "Consider increasing small body text and test at 200% zoom."}`;
  }
  if (kind === "line-height") {
    const lh = Number.parseFloat(lineHeight), px = parsePx(size);
    const ratio = /px$/i.test(lineHeight.trim()) ? (Number.isFinite(lh) && px ? lh / px : Number.NaN) : lh;
    if (action === "generator") return `LINE HEIGHT STARTER\n\nbody {\n  font-size: 1rem;\n  line-height: 1.5;\n}\n\nUse a unitless line-height so it scales with the font. Test text-spacing overrides and 200% zoom.`;
    return `LINE HEIGHT ${action.toUpperCase()}\n\nFont size: ${size || "16px"}\nLine height: ${lineHeight || "1.5"}\nRatio: ${Number.isFinite(ratio) ? ratio.toFixed(2) : "invalid"}\n\n${Number.isFinite(ratio) && ratio >= 1.5 ? "At or above 1.5× font size; verify the final layout." : "For paragraphs, consider around 1.5× font size or greater."}`;
  }
  if (kind === "text-readability") {
    const r = readability(text);
    if (action === "generator") return `READABLE TEXT CHECKLIST\n\n• Prefer short sentences and concrete words.\n• Use headings and lists to expose structure.\n• Keep one main idea per paragraph.\n• Avoid unexplained abbreviations.\n• Test with real users and assistive technology.`;
    if (!r) return "Paste text to calculate a Flesch Reading Ease estimate and approximate grade level.";
    return `TEXT READABILITY\n\nWords: ${r.words}\nSentences: ${r.sentences}\nSyllables: ${r.syllables}\nFlesch Reading Ease: ${r.ease.toFixed(1)}\nApprox. Flesch-Kincaid grade: ${r.grade.toFixed(1)}\n\nHigher Reading Ease generally indicates easier text. This is an English-language estimate and should not replace user testing.`;
  }
  if (["alt-text", "aria", "form", "keyboard-navigation", "focus-state", "motion"].includes(kind)) {
    if (action === "generator") {
      if (kind === "alt-text") return "ALT TEXT TEMPLATE\n\nDescribe the meaningful subject or function of the image, not its visual file details.\n\nExample structure:\n[Subject] + [important context/action] + [relevant outcome].";
      if (kind === "aria") return `ARIA STARTER\n\nRole: ${role || "button"}\nAccessible name: [Describe the control's purpose]\nState/value: [Only when applicable]\n\nPrefer native HTML semantics before adding ARIA.`;
      if (kind === "form") return "ACCESSIBLE FORM CHECKLIST\n\n• Associate every control with a visible label.\n• Provide useful error text.\n• Preserve keyboard access.\n• Group related controls with fieldset/legend when appropriate.\n• Do not rely on color alone for required/error state.";
      if (kind === "keyboard-navigation") return "KEYBOARD NAVIGATION CHECKLIST\n\n• All interactive controls reachable with Tab/Shift+Tab.\n• Logical focus order.\n• Visible focus indicator.\n• Enter/Space behavior matches the control.\n• Escape closes dismissible overlays where appropriate.\n• No keyboard trap.";
      if (kind === "focus-state") return "VISIBLE FOCUS CSS STARTER\n\n:focus-visible {\n  outline: 3px solid currentColor;\n  outline-offset: 3px;\n}\n\nDo not remove focus without an equally visible replacement. Check contrast, clipping, and sticky-content obscuration.";
      return "REDUCED MOTION CHECKLIST\n\n• Respect prefers-reduced-motion.\n• Remove or reduce non-essential animation.\n• Avoid flashing content.\n• Preserve essential information when animation is disabled.";
    }
    return analyzeHtml(html, kind);
  }
  return "Accessibility utility ready.";
}


function pickerValue(color: RgbaColor | null): string {
  if (!color || color.a < 0.9995) return "#000000";
  return toHex(color).slice(0, 7);
}

function swatchStyle(color: RgbaColor): CSSProperties {
  return { backgroundColor: toHex(color) };
}

function correctionCard(
  label: string,
  before: RgbaColor,
  after: RgbaColor | null,
  background: RgbaColor,
  canvas: RgbaColor,
) {
  if (!after) return null;
  const beforeRatio = contrastRatio(before, background, canvas);
  const afterRatio = contrastRatio(
    label.startsWith("Foreground") ? after : before,
    label.startsWith("Foreground") ? background : after,
    canvas,
  );
  const summary = formatColorSummary(after);
  return { label, beforeRatio, afterRatio, summary };
}

function AccessibleColorChecker() {
  const [fgInput, setFgInput] = useState("#000000");
  const [bgInput, setBgInput] = useState("#ffffff");
  const [canvasInput, setCanvasInput] = useState("#ffffff");
  const [target, setTarget] = useState<ContrastTarget>("normal-aa");

  const fg = useMemo(() => parseCssColor(fgInput), [fgInput]);
  const bg = useMemo(() => parseCssColor(bgInput), [bgInput]);
  const canvas = useMemo(() => parseCssColor(canvasInput), [canvasInput]);

  const allValid = Boolean(fg && bg && canvas);
  const evaluation = useMemo(
    () => (fg && bg && canvas ? evaluateContrast(fg, bg, target, canvas) : null),
    [bg, canvas, fg, target],
  );
  const targets = useMemo(() => getContrastTargets(), []);
  const suggestions = useMemo(
    () => (fg && bg && canvas ? suggestContrastCorrections(fg, bg, target, canvas) : null),
    [bg, canvas, fg, target],
  );

  const corrections = useMemo(() => {
    if (!fg || !bg || !canvas || !suggestions) return [];
    const items = [
      correctionCard("Foreground lightness", fg, suggestions.foreground, bg, canvas),
      correctionCard("Background lightness", bg, suggestions.background, fg, canvas),
      correctionCard("Foreground opacity", fg, suggestions.foregroundOpacity, bg, canvas),
      correctionCard("Background opacity", bg, suggestions.backgroundOpacity, fg, canvas),
    ];
    const seen = new Set<string>();
    return items.filter((item): item is NonNullable<typeof item> => {
      if (!item) return false;
      const key = `${item.summary.hex}:${item.summary.alpha}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
  }, [bg, canvas, fg, suggestions]);

  const rendered = useMemo(() => {
    if (!fg || !bg || !canvas) return null;
    return resolveRenderedPair(fg, bg, canvas);
  }, [bg, canvas, fg]);

  const report = useMemo(() => {
    if (!fg || !bg || !canvas || !evaluation || !rendered) {
      return `Accessible Color Checker\n\n${!fg ? `Foreground: invalid (${fgInput})` : ""}\n${!bg ? `Background: invalid (${bgInput})` : ""}\n${!canvas ? `Canvas/base: invalid (${canvasInput})` : ""}`.trim();
    }
    const checks = targets.map((item) => {
      const check = evaluateContrast(fg, bg, item.value, canvas);
      return `${item.label} — ${check.ratio.toFixed(2)}:1 — ${check.passes ? "PASS" : "FAIL"} — WCAG 2.2 ${check.criterion}`;
    }).join("\n");
    const correctionText = corrections.length
      ? corrections.map((item) => `${item.label}: ${item.summary.hex} (${item.afterRatio.toFixed(2)}:1)`).join("\n")
      : "No correction is required for the selected target, or no same-parameter correction was found.";
    return [
      "Accessible Color Checker",
      "",
      `Foreground: ${fgInput}`,
      `Background: ${bgInput}`,
      `Canvas/base: ${canvasInput}`,
      `Rendered foreground: ${formatColorSummary(rendered.foreground).hex}`,
      `Rendered background: ${formatColorSummary(rendered.background).hex}`,
      `Selected target: ${targetLabel(target)}`,
      `Selected ratio: ${evaluation.ratio.toFixed(2)}:1`,
      `Selected result: ${evaluation.passes ? "PASS" : "FAIL"}`,
      `WCAG 2.2 criterion: ${evaluation.criterion}`,
      "",
      "WCAG evaluations:",
      checks,
      "",
      "Suggested corrections:",
      correctionText,
      "",
      "Scope note: a two-color contrast calculation cannot determine WCAG 1.4.1 Use of Color or establish full-page WCAG conformance.",
    ].join("\n");
  }, [bgInput, canvasInput, corrections, evaluation, fgInput, fg, bg, canvas, rendered, target, targets]);

  if (!allValid) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted">
          Deterministic local WCAG-oriented contrast calculation. Enter HEX, RGB/RGBA, or HSL/HSLA colors. Alpha is composited before the ratio is calculated.
        </p>
        <ColorInput label="Foreground" value={fgInput} onChange={setFgInput} parsed={fg} />
        <ColorInput label="Background" value={bgInput} onChange={setBgInput} parsed={bg} />
        <ColorInput label="Canvas / underlying color" value={canvasInput} onChange={setCanvasInput} parsed={canvas} />
        <p className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          Correct the invalid color input before running the accessibility check.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Deterministic local calculation based on WCAG 2.2 contrast rules. This evaluates the supplied color pair; it does not prove complete WCAG conformance.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <ColorInput label="Foreground" value={fgInput} onChange={setFgInput} parsed={fg} />
        <ColorInput label="Background" value={bgInput} onChange={setBgInput} parsed={bg} />
        <ColorInput label="Canvas / underlying color" value={canvasInput} onChange={setCanvasInput} parsed={canvas} />
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
        <label className="flex flex-col gap-1.5">
          <Label>Recommended correction target</Label>
          <Select value={target} onChange={(event) => setTarget(event.target.value as ContrastTarget)}>
            {targets.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label} · {item.threshold}:1
              </option>
            ))}
          </Select>
          <span className="text-xs text-muted">
            Large text is the WCAG large-scale category; 1.4.11 applies to qualifying UI components and graphics.
          </span>
        </label>
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Input formats</p>
          <p className="mt-1 font-mono text-xs leading-5">#RGB · #RGBA · #RRGGBB · #RRGGBBAA<br />rgb()/rgba() · hsl()/hsla()</p>
        </div>
      </div>

      {rendered ? (
        <div className="grid overflow-hidden rounded-2xl border border-border sm:grid-cols-2">
          <div className="min-h-40 p-6" style={swatchStyle(rendered.background)}>
            <div className="max-w-md rounded-xl bg-white/10 p-4" style={{ color: rendered.foreground }}>
              <p className="text-2xl font-semibold">Accessible color preview</p>
              <p className="mt-1 text-sm">The rendered pair used for the deterministic contrast calculation.</p>
              <button
                type="button"
                className="mt-4 rounded-md border px-3 py-2 text-sm font-medium"
                style={{ borderColor: rendered.foreground, color: rendered.foreground }}
              >
                Sample action
              </button>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-2 bg-surface p-6">
            <p className="text-sm text-muted">Selected evaluation · {evaluation?.criterion}</p>
            <p className="text-4xl font-semibold tabular-nums">{evaluation?.ratio.toFixed(2)}:1</p>
            <p className={evaluation?.passes ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
              {evaluation?.passes ? "PASS" : "FAIL"} · requires {evaluation?.threshold.toFixed(1)}:1
            </p>
            <p className="text-xs text-muted">
              Rendered foreground {formatColorSummary(rendered.foreground).hex} · rendered background {formatColorSummary(rendered.background).hex}
            </p>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="wcag-evaluations">
        <div className="flex items-center justify-between gap-3">
          <h2 id="wcag-evaluations" className="text-base font-semibold">WCAG 2.2 evaluations</h2>
          <span className="text-xs text-muted">Ratio is deterministic; applicability still depends on context.</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {targets.map((item) => {
            const check = evaluateContrast(fg!, bg!, item.value, canvas!);
            return (
              <div key={item.value} className="rounded-xl border border-border bg-surface-2 p-3">
                <p className="text-xs font-medium text-muted">{item.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{check.ratio.toFixed(2)}:1</p>
                <p className={check.passes ? "text-xs font-medium text-success" : "text-xs font-medium text-danger"}>
                  {check.passes ? "PASS" : "FAIL"} · {item.threshold}:1
                </p>
                <p className="mt-1 text-[12.2px] text-muted">WCAG 2.2 · {item.criterion}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="corrections">
        <h2 id="corrections" className="text-base font-semibold">Suggested corrections</h2>
        <p className="mt-1 text-sm text-muted">
          The engine first searches HSL lightness while preserving hue/saturation, then checks whether increasing opacity can reach the selected threshold.
        </p>
        {corrections.length === 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-surface-2 p-4 text-sm">
            {evaluation?.passes ? "The selected target already passes, so no correction is necessary." : "No same-parameter correction was found for the selected target. Consider changing the hue/saturation or the base color."}
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {corrections.map((item) => (
              <div key={`${item.label}-${item.summary.hex}-${item.summary.alpha}`} className="rounded-xl border border-border bg-surface-2 p-4">
                <div className="flex items-center gap-3">
                  <span className="size-12 rounded-lg border border-black/10" style={swatchStyle(parseCssColor(item.summary.hex) ?? { r: 0, g: 0, b: 0, a: 1 })} />
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="font-mono text-xs text-muted">{item.summary.hex}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted">
                  Before {item.beforeRatio.toFixed(2)}:1 → After <strong>{item.afterRatio.toFixed(2)}:1</strong>
                </p>
                <p className="mt-1 text-xs text-muted">{item.summary.rgb} · {item.summary.hsl} · alpha {item.summary.alpha}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="scope-notes" className="rounded-xl bg-surface-2 p-4">
        <h2 id="scope-notes" className="text-base font-semibold">What this check can and cannot establish</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          <li><strong className="text-fg">1.4.3 Contrast (Minimum):</strong> evaluates text and images of text at 4.5:1 normal and 3:1 large.</li>
          <li><strong className="text-fg">1.4.6 Contrast (Enhanced):</strong> evaluates 7:1 normal and 4.5:1 large.</li>
          <li><strong className="text-fg">1.4.11 Non-text Contrast:</strong> evaluates the 3:1 threshold for qualifying UI components and graphical objects.</li>
          <li><strong className="text-fg">Not evaluated from colors alone:</strong> WCAG 1.4.1 Use of Color, typography/context exceptions, focus-state context, and full-page conformance.</li>
        </ul>
      </section>

      <ResultPanel
        items={[
          { label: "Selected target", value: targetLabel(target) },
          { label: "Contrast ratio", value: `${evaluation?.ratio.toFixed(2)}:1`, primary: true },
          { label: "Result", value: evaluation?.passes ? "PASS" : "FAIL" },
        ]}
        extraText={report}
        filename="env-accessible-color-checker.txt"
      />
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
  parsed,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  parsed: ReturnType<typeof parseCssColor>;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type="color"
          value={pickerValue(parsed)}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-14 shrink-0 p-1"
          aria-label={`${label} color picker`}
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#000000 or rgb(0 0 0)"
          aria-label={`${label} value`}
          spellCheck={false}
        />
      </div>
      {parsed ? (
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          <span className="font-mono">{formatColorSummary(parsed).hex}</span>
          <span className="mx-2">·</span>
          <span>{formatColorSummary(parsed).rgb}</span>
          <span className="mx-2">·</span>
          <span>{formatColorSummary(parsed).hsl}</span>
        </div>
      ) : (
        <span className="text-xs text-danger">Unsupported color syntax. Use HEX, RGB/RGBA, or HSL/HSLA.</span>
      )}
    </label>
  );
}


export function AccessibilityEngine({ toolId }: { toolId: string }) {
  const { kind, action } = parseToolId(toolId);
  if (toolId === "accessible-color-checker") return <AccessibleColorChecker />;
  const [fg, setFg] = useState("#000000"); const [bg, setBg] = useState("#ffffff");
  const [text, setText] = useState(""); const [size, setSize] = useState("16px"); const [lineHeight, setLineHeight] = useState("1.5");
  const [html, setHtml] = useState(""); const [role, setRole] = useState("button");
  const [axeReport, setAxeReport] = useState(""); const [axeRunning, setAxeRunning] = useState(false);
  const output = useMemo(() => buildOutput(kind, action, { fg, bg, text, size, lineHeight, html, role }), [action, bg, fg, html, kind, lineHeight, role, size, text]);
  const needsHtml = ["alt-text", "aria", "form", "keyboard-navigation", "focus-state", "motion"].includes(kind) && action !== "generator";
  const runAxe = async () => {
    setAxeRunning(true);
    setAxeReport(await scanMarkupWithAxe(html));
    setAxeRunning(false);
  };
  const reset = () => {
    setFg("#000000");
    setBg("#ffffff");
    setText("");
    setSize("16px");
    setLineHeight("1.5");
    setHtml("");
    setRole("button");
    setAxeReport("");
  };
  return <div className="space-y-5">
    <p className="text-sm text-muted">Local accessibility utility. Analysis runs in your browser; no accessibility claim is sent to an external service.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      {(kind === "contrast" || kind === "accessible-color" || kind === "color-blindness") && <><label className="flex flex-col gap-1.5"><Label>Foreground / base color</Label><Input value={fg} onChange={(e) => setFg(e.target.value)} placeholder="#000000" /></label><label className="flex flex-col gap-1.5"><Label>Background</Label><Input value={bg} onChange={(e) => setBg(e.target.value)} placeholder="#ffffff" /></label></>}
      {kind === "font-size" && <label className="flex flex-col gap-1.5"><Label>Font size</Label><Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="16px or 1rem" /></label>}
      {kind === "line-height" && <><label className="flex flex-col gap-1.5"><Label>Font size</Label><Input value={size} onChange={(e) => setSize(e.target.value)} /></label><label className="flex flex-col gap-1.5"><Label>Line height</Label><Input value={lineHeight} onChange={(e) => setLineHeight(e.target.value)} placeholder="1.5" /></label></>}
      {kind === "text-readability" && <label className="flex flex-col gap-1.5 sm:col-span-2"><Label>Text</Label><Textarea className="min-h-40" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste English text to analyze…" /></label>}
      {kind === "aria" && <label className="flex flex-col gap-1.5"><Label>Role</Label><Input value={role} onChange={(e) => setRole(e.target.value)} /></label>}
      {needsHtml && <label className="flex flex-col gap-1.5 sm:col-span-2"><Label>HTML / CSS to inspect</Label><Textarea className="min-h-48 font-mono text-xs" value={html} onChange={(e) => setHtml(e.target.value)} placeholder="Paste the relevant HTML or CSS…" /></label>}
    </div>
    <ResultPanel items={[{ label: "Tool", value: `${titleCase(kind)} ${action}` }, { label: "Mode", value: "Local / deterministic", primary: true }]} />
    <div className="flex flex-wrap gap-2"><CopyButton text={output} /><Button type="button" variant="outline" size="sm" onClick={() => downloadText(output, `env-${toolId}.txt`)}>Download</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>Reset</Button></div>
    {(kind === "contrast" || kind === "accessible-color") && <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl p-6" style={{ background: bg, color: fg }}>Accessible color preview</div><div className="rounded-xl border p-4 text-sm">{contrastText(contrast(fg, bg))}</div></div>}
    <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{output}</pre>
    {needsHtml ? <section className="space-y-3 rounded-xl border border-border bg-surface-2 p-4" aria-labelledby="axe-scan-heading">
      <div><h2 id="axe-scan-heading" className="text-sm font-semibold">Automated browser rules (axe-core)</h2><p className="mt-1 text-xs text-muted">Runs locally against an isolated copy of this snippet. It does not send the markup to a server.</p></div>
      <Button type="button" variant="outline" size="sm" onClick={runAxe} disabled={axeRunning || !html.trim()}>{axeRunning ? "Scanning locally…" : "Run axe-core scan"}</Button>
      {axeReport ? <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{axeReport}</pre> : null}
    </section> : null}
  </div>;
}
