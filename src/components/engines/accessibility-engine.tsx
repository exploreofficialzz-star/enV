import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/tools/copy-button";
import { ResultPanel } from "@/components/engines/result-panel";

import { type Action, type Kind, parseToolId } from "./accessibility-engine-utils";
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
const VALID_ARIA_ROLES = new Set([
  "alert", "alertdialog", "application", "article", "banner", "blockquote", "button",
  "caption", "cell", "checkbox", "code", "columnheader", "combobox", "complementary",
  "contentinfo", "definition", "dialog", "directory", "document", "feed", "figure",
  "form", "generic", "grid", "gridcell", "group", "heading", "img", "link", "list",
  "listbox", "listitem", "log", "main", "marquee", "math", "menu", "menubar",
  "menuitem", "menuitemcheckbox", "menuitemradio", "meter", "navigation", "none",
  "note", "option", "presentation", "progressbar", "radio", "radiogroup", "region",
  "row", "rowgroup", "rowheader", "scrollbar", "search", "searchbox", "separator",
  "slider", "spinbutton", "status", "strong", "subscript", "superscript", "switch",
  "tab", "table", "tabpanel", "term", "textbox", "timer", "toolbar", "tooltip", "tree",
  "treegrid", "treeitem",
]);

function analyzeHtml(html: string, kind: Kind) {
  if (!html.trim()) return "Paste HTML/CSS in the field above to run the local check.";
  if (typeof DOMParser === "undefined") return "This browser does not provide DOMParser, so this check cannot run here.";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const issues: string[] = [];
  if (kind === "alt-text") {
    const images = [...doc.querySelectorAll("img")];
    const missing = images.filter((img) => !img.hasAttribute("alt"));
    const empty = images.filter((img) => img.getAttribute("alt") === "");
    return `Images found: ${images.length}\nMissing alt attribute: ${missing.length}\nEmpty alt attribute: ${empty.length}\n\n${missing.length ? "Add alt text to informative images. Decorative images can use alt=\"\"." : "Every image has an alt attribute."}`;
  }
  if (kind === "aria") {
    const elements = [...doc.querySelectorAll("[aria-label], [aria-labelledby], [role], [aria-describedby]")];
    const invalidRoles = elements.filter((el) => {
      const role = el.getAttribute("role")?.trim().split(/\s+/)[0].toLowerCase();
      return Boolean(role) && !VALID_ARIA_ROLES.has(role!);
    });
    const labelledBy = new Set([...doc.querySelectorAll("[id]")].map((el) => el.id));
    const interactive = [...doc.querySelectorAll("a[href], button, input, select, textarea, [role]")];
    const unnamed = interactive.filter((el) => {
      const label = el.getAttribute("aria-label")?.trim();
      const labelled = el.getAttribute("aria-labelledby")?.trim().split(/\s+/).filter(Boolean) ?? [];
      const native = el.textContent?.trim();
      const placeholder = el.getAttribute("placeholder")?.trim();
      return !label && !(labelled.length && labelled.every((id) => labelledBy.has(id))) && !native && !placeholder;
    });
    return `ARIA-bearing elements: ${elements.length}\nInvalid ARIA roles: ${invalidRoles.length}\nPotentially unnamed interactive controls: ${unnamed.length}\n\n${invalidRoles.length ? invalidRoles.map((x) => `Check role on <${x.tagName.toLowerCase()}>`).join("\n") : "No invalid ARIA roles detected."}${unnamed.length ? `\n\n${unnamed.map((x) => `<${x.tagName.toLowerCase()}> may need an accessible name`).join("\n")}` : "\n\nNo potentially unnamed interactive controls detected."}`;
  }
  if (kind === "form") {
    const controls = [...doc.querySelectorAll("input, select, textarea")];
    const missing = controls.filter((el) => {
      const id = el.getAttribute("id");
      return !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && !(id && [...doc.querySelectorAll("label")].some((label) => label.htmlFor === id)) && !el.closest("label");
    });
    return `Form controls: ${controls.length}\nControls without an explicit/associated label: ${missing.length}\nButtons: ${doc.querySelectorAll("button, input[type=submit], input[type=button]").length}\n\n${missing.length ? missing.map((x) => `<${x.tagName.toLowerCase()} name="${x.getAttribute("name") ?? ""}"> needs an accessible label`).join("\n") : "No unlabeled form controls detected by this local check."}`;
  }
  if (kind === "keyboard-navigation") {
    const interactive = [...doc.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")];
    const positiveTab = interactive.filter((el) => Number(el.getAttribute("tabindex")) > 0);
    const unnamed = interactive.filter((el) => !el.textContent?.trim() && !el.getAttribute("aria-label") && !el.getAttribute("title") && !el.getAttribute("aria-labelledby"));
    return `Potential keyboard-interactive elements: ${interactive.length}\nPositive tabindex values: ${positiveTab.length}\nPotentially unnamed controls: ${unnamed.length}\n\n${positiveTab.length ? "Avoid positive tabindex values; prefer the document's natural order." : "No positive tabindex values detected."}`;
  }
  if (kind === "motion") {
    const hasAnimation = /\banimation(?:-name)?\s*:|@keyframes|\btransition\s*:/i.test(html);
    const reduced = /prefers-reduced-motion/i.test(html);
    return `Motion declarations detected: ${hasAnimation ? "YES" : "NO"}\nReduced-motion media query detected: ${reduced ? "YES" : "NO"}\n\n${hasAnimation && !reduced ? "Add a prefers-reduced-motion path for non-essential motion." : "The supplied code includes a basic reduced-motion consideration or no motion declaration was found."}`;
  }
  return `Elements parsed: ${doc.body.querySelectorAll("*").length}\nHeadings: ${doc.querySelectorAll("h1,h2,h3,h4,h5,h6").length}\nLinks: ${doc.querySelectorAll("a").length}\nButtons: ${doc.querySelectorAll("button").length}\nImages: ${doc.querySelectorAll("img").length}\n\nNo severe issue was inferred; use the relevant specialized checker for detailed analysis.`;
}

function buildOutput(kind: Kind, action: Action, values: { fg: string; bg: string; text: string; size: string; lineHeight: string; html: string; role: string }) {
  const { fg, bg, text, size, lineHeight, html, role } = values;
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
    const ratio = Number.isFinite(lh) && px ? lh / px : Number.parseFloat(lineHeight);
    return `LINE HEIGHT ${action.toUpperCase()}\n\nFont size: ${size || "16px"}\nLine height: ${lineHeight || "1.5"}\nRatio: ${Number.isFinite(ratio) ? ratio.toFixed(2) : "invalid"}\n\n${Number.isFinite(ratio) && ratio >= 1.5 ? "At or above 1.5× font size; verify the final layout." : "For paragraphs, consider around 1.5× font size or greater."}`;
  }
  if (kind === "text-readability") {
    const r = readability(text);
    if (action === "generator") return `READABLE TEXT CHECKLIST\n\n• Prefer short sentences and concrete words.\n• Use headings and lists to expose structure.\n• Keep one main idea per paragraph.\n• Avoid unexplained abbreviations.\n• Test with real users and assistive technology.`;
    if (!r) return "Paste text to calculate a Flesch Reading Ease estimate and approximate grade level.";
    return `TEXT READABILITY\n\nWords: ${r.words}\nSentences: ${r.sentences}\nSyllables: ${r.syllables}\nFlesch Reading Ease: ${r.ease.toFixed(1)}\nApprox. Flesch-Kincaid grade: ${r.grade.toFixed(1)}\n\nHigher Reading Ease generally indicates easier text. This is an English-language estimate and should not replace user testing.`;
  }
  if (["alt-text", "aria", "form", "keyboard-navigation", "motion"].includes(kind)) {
    if (action === "generator") {
      if (kind === "alt-text") return "ALT TEXT TEMPLATE\n\nDescribe the meaningful subject or function of the image, not its visual file details.\n\nExample structure:\n[Subject] + [important context/action] + [relevant outcome].";
      if (kind === "aria") return `ARIA STARTER\n\nRole: ${role || "button"}\nAccessible name: [Describe the control's purpose]\nState/value: [Only when applicable]\n\nPrefer native HTML semantics before adding ARIA.`;
      if (kind === "form") return "ACCESSIBLE FORM CHECKLIST\n\n• Associate every control with a visible label.\n• Provide useful error text.\n• Preserve keyboard access.\n• Group related controls with fieldset/legend when appropriate.\n• Do not rely on color alone for required/error state.";
      if (kind === "keyboard-navigation") return "KEYBOARD NAVIGATION CHECKLIST\n\n• All interactive controls reachable with Tab/Shift+Tab.\n• Logical focus order.\n• Visible focus indicator.\n• Enter/Space behavior matches the control.\n• Escape closes dismissible overlays where appropriate.\n• No keyboard trap.";
      return "REDUCED MOTION CHECKLIST\n\n• Respect prefers-reduced-motion.\n• Remove or reduce non-essential animation.\n• Avoid flashing content.\n• Preserve essential information when animation is disabled.";
    }
    if (action === "helper") return buildOutput(kind, "checker", values);
    return analyzeHtml(html, kind);
  }
  if (kind === "focus-state") return `FOCUS STATE ${action.toUpperCase()}\n\nRecommended CSS:\n:focus-visible {\n  outline: 3px solid currentColor;\n  outline-offset: 3px;\n}\n\nDo not remove focus indicators without providing an equally visible replacement.`;
  return "Accessibility utility ready.";
}

export function AccessibilityEngine({ toolId }: { toolId: string }) {
  const { kind, action } = parseToolId(toolId);
  const [fg, setFg] = useState("#000000"); const [bg, setBg] = useState("#ffffff");
  const [text, setText] = useState(""); const [size, setSize] = useState("16px"); const [lineHeight, setLineHeight] = useState("1.5");
  const [html, setHtml] = useState(""); const [role, setRole] = useState("button");
  const output = useMemo(() => buildOutput(kind, action, { fg, bg, text, size, lineHeight, html, role }), [action, bg, fg, html, kind, lineHeight, role, size, text]);
  const needsHtml = ["alt-text", "aria", "form", "keyboard-navigation", "motion"].includes(kind) && action !== "generator";
  const reset = () => {
    setFg("#000000");
    setBg("#ffffff");
    setText("");
    setSize("16px");
    setLineHeight("1.5");
    setHtml("");
    setRole("button");
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
  </div>;
}
