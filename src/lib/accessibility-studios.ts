import type { ToolMeta } from "@/types/tool";

export type AccessibilityStudio = {
  id: string;
  sourceId: string;
  slug: string;
  name: string;
  description: string;
  aliases: string[];
  keywords: string[];
};

/** Canonical information architecture; old generated checker/generator/etc. IDs remain routable aliases. */
export const ACCESSIBILITY_STUDIOS: AccessibilityStudio[] = [
  { id: "contrast-checker", sourceId: "contrast-checker", slug: "color-contrast-studio", name: "Color Contrast Studio", description: "WCAG 2.2 + APCA side-by-side, one-click color fixes, full color-vision simulation, multi-surface preview, and CSS/Tailwind export — all local, no upload.", aliases: ["contrast", "accessible-color", "color-blindness"], keywords: ["wcag", "wcag 2.2", "apca", "contrast ratio", "colour", "color", "alpha", "transparency", "protanopia", "deuteranopia", "tritanopia", "achromatopsia", "tailwind", "css variables", "fix color", "color blindness", "local", "privacy"] },
  { id: "alt-text-checker", sourceId: "alt-text-checker", slug: "alt-text-studio", name: "Alt Text Studio", description: "Severity-based alt checks, writing coach drafts, announcement-style preview, bulk triage, and JSON/CSV export — runs entirely on your device.", aliases: ["alt-text"], keywords: ["image description", "alternative text", "screen reader", "bulk images", "decorative", "alt attribute", "CSV export", "JSON report", "local"] },
  { id: "focus-state-checker", sourceId: "focus-state-checker", slug: "focus-state-studio", name: "Focus State Studio", description: "Generate modern :focus-visible CSS, live keyboard playground, dark and forced-colors previews — free features others often lock behind paywalls.", aliases: ["focus-state"], keywords: ["focus visible", "focus ring", "keyboard focus", "high contrast", "forced colors", "tab playground", "CSV export", "JSON report", "local"] },
  { id: "text-readability-checker", sourceId: "text-readability-checker", slug: "text-readability-studio", name: "Text & Readability Studio", description: "Multiple readability scores, plain-language simplify drafts, type-scale and spacing checks — private and instant in the browser.", aliases: ["text-readability", "font-size", "line-height"], keywords: ["readability", "plain language", "simplify", "flesch", "gunning fog", "font size", "line height", "text spacing", "zoom", "local"] },
  { id: "aria-checker", sourceId: "aria-checker", slug: "aria-studio", name: "ARIA Studio", description: "Name and state inspection, common pattern snippets, local accessibility-tree approximation, and source-evidence export.", aliases: ["aria"], keywords: ["accessible name", "button name", "link purpose", "custom control name", "role", "state", "aria-label", "aria-labelledby", "accessibility tree", "dialog", "tabs", "disclosure", "CSV export", "JSON report"] },
  { id: "motion-checker", sourceId: "motion-checker", slug: "motion-reduced-motion-studio", name: "Motion & Reduced Motion Studio", description: "Motion CSS review and reduced-motion alternatives on-device; export stable findings without uploading your markup.", aliases: ["motion"], keywords: ["animation", "transition", "prefers-reduced-motion", "vestibular", "flash", "CSV export", "JSON report", "local"] },
  { id: "keyboard-navigation-checker", sourceId: "keyboard-navigation-checker", slug: "keyboard-navigation-studio", name: "Keyboard Navigation Studio", description: "Keyboard-operability risks, logical focus order practice, and trap detection with copyable source-evidence reports.", aliases: ["keyboard-navigation"], keywords: ["tab order", "keyboard only", "tabindex", "keyboard trap", "enter", "space", "escape", "CSV export", "JSON report"] },
  { id: "form-checker", sourceId: "form-checker", slug: "form-accessibility-studio", name: "Form Accessibility Studio", description: "Label and error-description review, accessible validation flow practice, and local export of findings.", aliases: ["form"], keywords: ["form labels", "validation", "error message", "aria-invalid", "aria-describedby", "input", "CSV export", "JSON report"] },
];

const ACTIONS = new Set(["checker", "generator", "helper", "preview", "simulator"]);
export function accessibilityKindFromToolId(toolId: string): string {
  const base = toolId.replace(/-(checker|generator|helper|preview|simulator)$/, "");
  return ACCESSIBILITY_STUDIOS.find((studio) => studio.aliases.includes(base))?.aliases[0] ?? base;
}
export function accessibilityStudioForKind(kind: string): AccessibilityStudio | undefined {
  return ACCESSIBILITY_STUDIOS.find((studio) => studio.aliases.includes(kind));
}
export function accessibilityModeFromToolId(toolId: string): string {
  const suffix = toolId.match(/-(checker|generator|helper|preview|simulator)$/)?.[1];
  return suffix && ACTIONS.has(suffix) ? suffix : "checker";
}
export function makeAccessibilityStudioTools(allTools: ToolMeta[]): ToolMeta[] {
  const byId = new Map(allTools.map((tool) => [tool.id, tool]));
  return ACCESSIBILITY_STUDIOS.flatMap((studio) => {
    const source = byId.get(studio.sourceId);
    if (!source) return [];
    return [{
      ...source,
      id: studio.id,
      category: "accessibility",
      slug: studio.slug,
      name: studio.name,
      description: studio.description,
      keywords: [...new Set([...studio.keywords, ...source.keywords])],
      tags: ["accessibility", "studio", ...studio.aliases],
      featured: true,
      related: ACCESSIBILITY_STUDIOS.filter((item) => item.id !== studio.id).map((item) => item.id),
    }];
  });
}
export function isAccessibilityLegacyVariant(toolId: string): boolean {
  if (!toolId.includes("-")) return false;
  const suffix = toolId.match(/-(checker|generator|helper|preview|simulator)$/)?.[1];
  if (!suffix) return false;
  const base = toolId.slice(0, -(suffix.length + 1));
  const studio = ACCESSIBILITY_STUDIOS.find((item) => item.aliases.includes(base));
  return Boolean(studio && `${studio.aliases[0]}-checker` !== toolId);
}
export function studioToolForLegacy(tool: ToolMeta, allTools: ToolMeta[]): ToolMeta {
  const kind = accessibilityKindFromToolId(tool.id);
  const studio = accessibilityStudioForKind(kind);
  return studio ? makeAccessibilityStudioTools(allTools).find((item) => item.id === studio.id) ?? tool : tool;
}
