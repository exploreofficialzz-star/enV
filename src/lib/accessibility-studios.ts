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
  { id: "contrast-checker", sourceId: "contrast-checker", slug: "color-contrast-studio", name: "Color Contrast Studio", description: "Evaluate WCAG 2.2 contrast, correct color pairs, preview color-vision differences, and export tokens locally.", aliases: ["contrast", "accessible-color", "color-blindness"], keywords: ["wcag", "wcag 2.2", "apca", "contrast ratio", "colour", "color", "alpha", "transparency", "protanopia", "deuteranopia", "tritanopia", "achromatopsia", "tailwind", "css variables", "fix color", "color blindness"] },
  { id: "alt-text-checker", sourceId: "alt-text-checker", slug: "alt-text-studio", name: "Alt Text Studio", description: "Review image alternatives, draft concise descriptions, preview announcements, and triage batches on-device.", aliases: ["alt-text"], keywords: ["image description", "alternative text", "screen reader", "bulk images", "decorative", "alt attribute"] },
  { id: "focus-state-checker", sourceId: "focus-state-checker", slug: "focus-state-studio", name: "Focus State Studio", description: "Build and test visible keyboard focus styles, dark themes, and forced-colors behavior.", aliases: ["focus-state"], keywords: ["focus visible", "focus ring", "keyboard focus", "high contrast", "forced colors", "tab playground"] },
  { id: "text-readability-checker", sourceId: "text-readability-checker", slug: "text-readability-studio", name: "Text & Readability Studio", description: "Estimate reading difficulty, create reviewable plain-language drafts, and test type scale and spacing.", aliases: ["text-readability", "font-size", "line-height"], keywords: ["readability", "plain language", "simplify", "flesch", "gunning fog", "font size", "line height", "text spacing", "zoom"] },
  { id: "aria-checker", sourceId: "aria-checker", slug: "aria-studio", name: "ARIA Studio", description: "Inspect ARIA names and states, generate common patterns, and preview a local approximation of the accessibility tree.", aliases: ["aria"], keywords: ["accessible name", "role", "state", "aria-label", "aria-labelledby", "accessibility tree", "dialog", "tabs", "disclosure"] },
  { id: "motion-checker", sourceId: "motion-checker", slug: "motion-reduced-motion-studio", name: "Motion & Reduced Motion Studio", description: "Review motion CSS and exercise reduced-motion alternatives without leaving your device.", aliases: ["motion"], keywords: ["animation", "transition", "prefers-reduced-motion", "vestibular", "flash"] },
  { id: "keyboard-navigation-checker", sourceId: "keyboard-navigation-checker", slug: "keyboard-navigation-studio", name: "Keyboard Navigation Studio", description: "Find keyboard-operability risks and practice logical, visible, trap-free navigation.", aliases: ["keyboard-navigation"], keywords: ["tab order", "keyboard only", "tabindex", "keyboard trap", "enter", "space", "escape"] },
  { id: "form-checker", sourceId: "form-checker", slug: "form-accessibility-studio", name: "Form Accessibility Studio", description: "Review field labels and error descriptions, then practice an accessible local validation flow.", aliases: ["form"], keywords: ["form labels", "validation", "error message", "aria-invalid", "aria-describedby", "input"] },
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
