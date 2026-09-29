export type WebDesignWorkflow = "generator" | "builder" | "preview" | "checklist" | "snippet-generator";

export const WEB_DESIGN_FAMILIES = [
  "responsive-layout", "typography-scale", "spacing-scale", "grid", "flexbox", "css", "tailwind", "html",
  "form", "navigation", "hero-section", "pricing-table", "footer", "modal", "toast", "tooltip", "tabs",
  "accordion", "carousel", "design-token",
] as const;
export type WebDesignFamily = typeof WEB_DESIGN_FAMILIES[number];

export type WebDesignValues = {
  project: string;
  primary: string;
  text: string;
  font: string;
  maxWidth: number;
  spacing: number;
  columns: number;
  radius: number;
};

export function parseWebDesignToolId(toolId: string): { family: WebDesignFamily; workflow: WebDesignWorkflow } {
  const match = /^(.*?)-(generator|builder|preview|checklist|snippet-generator)$/.exec(toolId);
  if (!match) throw new Error(`Unsupported web-design tool: ${toolId}`);
  const family = match[1] as WebDesignFamily;
  if (!WEB_DESIGN_FAMILIES.includes(family)) throw new Error(`Unsupported web-design family: ${family}`);
  return { family, workflow: match[2] as WebDesignWorkflow };
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function values(v: WebDesignValues) {
  const project = v.project.trim() || "enV project";
  if (!/^#[0-9a-f]{6}$/i.test(v.primary)) throw new Error("Primary color must be a 6-digit hex color.");
  if (!/^#[0-9a-f]{6}$/i.test(v.text)) throw new Error("Text color must be a 6-digit hex color.");
  if (!v.font.trim()) throw new Error("Font family is required.");
  if (!Number.isFinite(v.maxWidth) || v.maxWidth < 320 || v.maxWidth > 2400) throw new Error("Max width must be between 320 and 2400px.");
  if (!Number.isFinite(v.spacing) || v.spacing < 2 || v.spacing > 64) throw new Error("Spacing must be between 2 and 64px.");
  if (!Number.isInteger(v.columns) || v.columns < 1 || v.columns > 12) throw new Error("Columns must be an integer from 1 to 12.");
  if (!Number.isFinite(v.radius) || v.radius < 0 || v.radius > 64) throw new Error("Radius must be between 0 and 64px.");
  return { ...v, project, font: v.font.trim() };
}

const CHECKLISTS: Record<WebDesignFamily, string[]> = {
  "responsive-layout": ["Define mobile-first base styles", "Set readable max-width", "Add breakpoints for content, not devices", "Test navigation at narrow widths", "Check overflow and touch targets"],
  "typography-scale": ["Choose a base size", "Use a consistent ratio", "Set readable line heights", "Check heading hierarchy", "Test long text and localization"],
  "spacing-scale": ["Choose a base spacing unit", "Use a limited token scale", "Keep component padding consistent", "Check vertical rhythm", "Avoid one-off spacing values"],
  grid: ["Define column count", "Set a minimum useful column width", "Choose consistent gaps", "Test narrow screens", "Check content alignment"],
  flexbox: ["Define main-axis behavior", "Define wrapping behavior", "Set consistent gaps", "Test long labels", "Check shrink/grow behavior"],
  css: ["Use semantic class names", "Keep declarations grouped", "Prefer tokens for repeated values", "Check focus states", "Test reduced-motion needs"],
  tailwind: ["Map repeated values to theme tokens", "Keep utility groups readable", "Use responsive variants intentionally", "Check focus/hover states", "Avoid unnecessary arbitrary values"],
  html: ["Use semantic elements", "Keep heading hierarchy logical", "Label interactive controls", "Provide accessible names", "Validate document structure"],
  form: ["Label every field", "Mark required fields", "Show validation clearly", "Support keyboard submission", "Preserve user input on errors"],
  navigation: ["Provide a clear current-page state", "Support keyboard navigation", "Keep labels concise", "Provide a mobile pattern", "Ensure sufficient contrast"],
  "hero-section": ["State the value proposition clearly", "Provide one primary action", "Keep supporting copy concise", "Optimize the main visual", "Test mobile stacking"],
  "pricing-table": ["Define plan names and limits", "Highlight meaningful differences", "Show billing terms", "Provide clear actions", "Check comparison accessibility"],
  footer: ["Group links logically", "Include contact/legal links as needed", "Keep link labels descriptive", "Support keyboard navigation", "Check small-screen wrapping"],
  modal: ["Provide a clear title", "Trap focus while open", "Support Escape", "Return focus on close", "Keep actions explicit"],
  toast: ["Use concise messages", "Provide meaningful status", "Avoid blocking content", "Respect reduced motion", "Ensure announcements are accessible"],
  tooltip: ["Use only for supplemental information", "Keep text concise", "Support keyboard/focus", "Avoid critical information only in tooltips", "Allow enough reading time"],
  tabs: ["Use correct tab semantics", "Connect tabs to panels", "Support arrow-key navigation", "Show the active state clearly", "Choose a sensible default tab"],
  accordion: ["Use buttons for headers", "Expose expanded state", "Support keyboard input", "Keep panel content structured", "Avoid hiding essential information"],
  carousel: ["Provide previous/next controls", "Show position information", "Support keyboard navigation", "Avoid forced autoplay", "Respect reduced motion"],
  "design-token": ["Name tokens consistently", "Separate semantic from raw values", "Define color/spacing/type tokens", "Document token intent", "Keep token values reusable"],
};

function cssTokens(v: ReturnType<typeof values>) {
  return `:root {\n  --color-primary: ${v.primary};\n  --color-text: ${v.text};\n  --font-sans: ${v.font};\n  --content-max: ${v.maxWidth}px;\n  --space-unit: ${v.spacing}px;\n  --radius: ${v.radius}px;\n}`;
}

function familyCode(family: WebDesignFamily, v: ReturnType<typeof values>) {
  const gap = v.spacing;
  const radius = v.radius;
  const primary = v.primary;
  const text = v.text;
  const font = v.font;
  const max = v.maxWidth;
  switch (family) {
    case "responsive-layout": return `${cssTokens(v)}\n.container { width: min(100% - ${gap * 2}px, var(--content-max)); margin-inline: auto; }\n@media (min-width: 768px) { .layout { display: grid; grid-template-columns: 2fr 1fr; gap: ${gap * 2}px; } }\n@media (max-width: 767px) { .layout { display: block; } }`;
    case "typography-scale": return `${cssTokens(v)}\n:root { --text-sm: .875rem; --text-base: 1rem; --text-lg: 1.25rem; --text-xl: 1.563rem; --text-2xl: 1.953rem; --text-3xl: 2.441rem; }\nbody { font-family: var(--font-sans); color: var(--color-text); line-height: 1.6; }\nh1 { font-size: var(--text-3xl); line-height: 1.1; }\nh2 { font-size: var(--text-2xl); line-height: 1.2; }`;
    case "spacing-scale": return `${cssTokens(v)}\n:root { --space-1: ${gap}px; --space-2: ${gap * 2}px; --space-3: ${gap * 3}px; --space-4: ${gap * 4}px; --space-6: ${gap * 6}px; --space-8: ${gap * 8}px; }\n.stack > * + * { margin-block-start: var(--space-3); }\n.cluster { display: flex; flex-wrap: wrap; gap: var(--space-2); }`;
    case "grid": return `${cssTokens(v)}\n.grid { display: grid; grid-template-columns: repeat(${v.columns}, minmax(0, 1fr)); gap: ${gap}px; }\n@media (max-width: 768px) { .grid { grid-template-columns: repeat(${Math.min(2, v.columns)}, minmax(0, 1fr)); } }`;
    case "flexbox": return `${cssTokens(v)}\n.flex { display: flex; flex-wrap: wrap; align-items: center; gap: ${gap}px; }\n.flex > .grow { flex: 1 1 18rem; }\n.flex > .shrink { flex: 0 1 auto; }`;
    case "css": return `${cssTokens(v)}\n.component { color: var(--color-text); background: white; border: 1px solid color-mix(in srgb, var(--color-text) 14%, transparent); border-radius: var(--radius); padding: ${gap}px; }\n.component:focus-visible { outline: 3px solid color-mix(in srgb, ${primary} 35%, transparent); outline-offset: 2px; }`;
    case "tailwind": return `<div class="mx-auto w-full max-w-[${max}px] p-[${gap}px] font-[${font}] text-[${text}]">\n  <section class="grid gap-[${gap}px] md:grid-cols-${Math.min(v.columns, 6)}">\n    <div class="rounded-[${radius}px] border p-[${gap}px]">Content</div>\n  </section>\n</div>`;
    case "html": return `<main class="container" aria-labelledby="page-title">\n  <h1 id="page-title">${esc(v.project)}</h1>\n  <p>Semantic, responsive page structure generated locally.</p>\n  <button type="button">Primary action</button>\n</main>`;
    case "form": return `<form class="form" action="#" method="post">\n  <div><label for="name">Name</label><input id="name" name="name" autocomplete="name" required></div>\n  <div><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>\n  <button type="submit">Submit</button>\n</form>\n\n.form { display: grid; gap: ${gap}px; max-width: ${max}px; font-family: ${font}; color: ${text}; }\n.form input { min-height: 2.75rem; padding: .5rem .75rem; border: 1px solid #cbd5e1; border-radius: ${radius}px; }\n.form button { width: fit-content; background: ${primary}; color: white; border: 0; border-radius: ${radius}px; padding: .65rem 1rem; }`;
    case "navigation": return `<nav aria-label="Primary">\n  <a href="/" aria-current="page">Home</a>\n  <a href="/about">About</a>\n  <a href="/contact">Contact</a>\n</nav>\n\nnav { display: flex; flex-wrap: wrap; gap: ${gap}px; align-items: center; font-family: ${font}; }\nnav a { color: ${text}; text-decoration: none; }\nnav a[aria-current="page"] { color: ${primary}; font-weight: 700; }`;
    case "hero-section": return `<section class="hero" aria-labelledby="hero-title">\n  <p class="eyebrow">${esc(v.project)}</p>\n  <h1 id="hero-title">A clear headline for your product</h1>\n  <p>Explain the value in one concise sentence before the primary action.</p>\n  <a class="cta" href="#start">Get started</a>\n</section>\n\n.hero { max-width: ${max}px; padding: ${gap * 4}px ${gap}px; font-family: ${font}; color: ${text}; }\n.cta { display: inline-block; margin-top: ${gap}px; background: ${primary}; color: white; padding: .75rem 1rem; border-radius: ${radius}px; text-decoration: none; }`;
    case "pricing-table": return `<section aria-labelledby="pricing-title">\n  <h2 id="pricing-title">Plans</h2>\n  <div class="pricing">\n    <article><h3>Starter</h3><p>$9/mo</p><a href="#">Choose plan</a></article>\n    <article><h3>Pro</h3><p>$29/mo</p><a href="#">Choose plan</a></article>\n    <article><h3>Business</h3><p>$79/mo</p><a href="#">Choose plan</a></article>\n  </div>\n</section>\n\n.pricing { display: grid; grid-template-columns: repeat(3, 1fr); gap: ${gap}px; }\n.pricing article { border: 1px solid #d1d5db; border-radius: ${radius}px; padding: ${gap}px; }\n.pricing a { color: ${primary}; }`;
    case "footer": return `<footer aria-label="Site footer">\n  <div><strong>${esc(v.project)}</strong><p>Useful footer content.</p></div>\n  <nav aria-label="Footer"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a></nav>\n</footer>\n\nfooter { display: flex; justify-content: space-between; gap: ${gap}px; padding: ${gap * 2}px; font-family: ${font}; color: ${text}; border-top: 1px solid #e5e7eb; }`;
    case "modal": return `<dialog aria-labelledby="dialog-title">\n  <h2 id="dialog-title">Confirm action</h2>\n  <p>Explain what will happen before asking for confirmation.</p>\n  <form method="dialog"><button value="cancel">Cancel</button><button value="confirm">Confirm</button></form>\n</dialog>`;
    case "toast": return `<div role="status" aria-live="polite" class="toast">Saved successfully.</div>\n\n.toast { position: fixed; inset-inline-end: ${gap}px; inset-block-end: ${gap}px; max-width: min(90vw, 24rem); padding: ${gap}px; color: white; background: ${primary}; border-radius: ${radius}px; box-shadow: 0 8px 24px rgb(0 0 0 / .15); }`;
    case "tooltip": return `<button aria-describedby="tip">Help</button>\n<span id="tip" role="tooltip">Additional context appears on hover or focus.</span>`;
    case "tabs": return `<div class="tabs">\n  <div role="tablist" aria-label="Sections"><button role="tab" aria-selected="true" aria-controls="panel-1" id="tab-1">Overview</button><button role="tab" aria-selected="false" aria-controls="panel-2" id="tab-2">Details</button></div>\n  <section role="tabpanel" id="panel-1" aria-labelledby="tab-1">Overview content</section>\n</div>`;
    case "accordion": return `<div class="accordion">\n  <h3><button type="button" aria-expanded="false" aria-controls="panel-1">Question</button></h3>\n  <div id="panel-1" hidden>Answer content.</div>\n</div>`;
    case "carousel": return `<section aria-roledescription="carousel" aria-label="Featured content">\n  <button type="button" aria-label="Previous slide">Previous</button>\n  <div role="group" aria-roledescription="slide" aria-label="1 of 3">Slide 1</div>\n  <button type="button" aria-label="Next slide">Next</button>\n</section>`;
    case "design-token": return `:root {\n  --color-primary: ${primary};\n  --color-text: ${text};\n  --font-family-sans: ${font};\n  --content-max-width: ${max}px;\n  --space-1: ${gap}px;\n  --space-2: ${gap * 2}px;\n  --radius-sm: ${Math.round(radius / 2)}px;\n  --radius-md: ${radius}px;\n}`;
  }
}

export function buildWebDesignOutput(family: WebDesignFamily, workflow: WebDesignWorkflow, input: WebDesignValues): string {
  const v = values(input);
  if (workflow === "checklist") return `${family.replaceAll("-", " ").toUpperCase()} CHECKLIST\n\n${CHECKLISTS[family].map((x, i) => `${i + 1}. [ ] ${x}`).join("\n")}\n\nProject: ${v.project}`;
  const code = familyCode(family, v);
  if (workflow === "snippet-generator") return code.split("\n").slice(0, Math.min(12, code.split("\n").length)).join("\n");
  if (workflow === "builder") return `/* ${v.project} · editable starter */\n${code}`;
  if (workflow === "preview") return `/* Preview-ready ${family.replaceAll("-", " ")} */\n${code}`;
  return `/* Generated locally for ${v.project} */\n${code}`;
}
