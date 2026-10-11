import axe from "axe-core";

export type A11ySeverity = "critical" | "serious" | "moderate" | "minor";
export interface A11yFinding {
  severity: A11ySeverity;
  rule: string;
  message: string;
  element: string;
  fix: string;
}

export interface A11yAudit {
  kind: string;
  inspected: number;
  findings: A11yFinding[];
  passed: boolean;
  report: string;
}

interface AxeReportNode { target: string[]; html: string }
interface AxeReportRule { id: string; impact: string | null; help: string; helpUrl: string; tags: string[]; nodes: AxeReportNode[] }
interface AxeReportResults { violations: AxeReportRule[]; incomplete: AxeReportRule[]; passes: AxeReportRule[] }

interface MarkupElement {
  tag: string;
  attributes: Record<string, string>;
  source: string;
  innerMarkup: string;
  textContent: string;
  wrappedByLabel: boolean;
}

const KNOWN_ROLES = new Set((
  "alert alertdialog application article banner blockquote button caption cell checkbox code " +
  "columnheader combobox complementary contentinfo definition dialog directory document feed " +
  "figure form generic grid gridcell group heading img link list listbox listitem log main marquee " +
  "math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option " +
  "presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search " +
  "searchbox separator slider spinbutton status strong subscript superscript switch tab tabpanel " +
  "table term textbox timer toolbar tooltip tree treegrid treeitem"
).split(/\s+/));
const INTERACTIVE = new Set(["a", "button", "input", "select", "textarea", "summary"]);
const CONTROL = new Set(["input", "select", "textarea"]);
const severityRank: Record<A11ySeverity, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function parseElements(input: string): MarkupElement[] {
  const source = input.replace(/<!--[\s\S]*?-->/g, "");
  const elements: MarkupElement[] = [];
  const labelRanges: Array<{ start: number; end: number }> = [];
  const tokenPattern = /<\/?([a-z][\w:-]*)\b[^>]*>/gi;
  const labels: number[] = [];
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(source))) {
    if (token[1].toLowerCase() !== "label") continue;
    if (/^<\//.test(token[0])) {
      const start = labels.pop();
      if (start !== undefined) labelRanges.push({ start, end: tokenPattern.lastIndex });
    } else if (!/\/\s*>$/.test(token[0])) labels.push(token.index);
  }
  const tagPattern = /<([a-z][\w:-]*)\b([^<>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(source))) {
    const attributes: Record<string, string> = {};
    const attrText = match[2] ?? "";
    const attrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let attr: RegExpExecArray | null;
    while ((attr = attrPattern.exec(attrText))) {
      attributes[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? "";
    }
    const tag = match[1].toLowerCase();
    const closeTag = new RegExp(`</${tag}\\s*>`, "ig");
    closeTag.lastIndex = tagPattern.lastIndex;
    const close = closeTag.exec(source);
    const closeAt = close?.index ?? tagPattern.lastIndex;
    const innerMarkup = source.slice(tagPattern.lastIndex, closeAt);
    elements.push({
      tag,
      attributes,
      source: match[0].slice(0, 180),
      innerMarkup,
      textContent: innerMarkup.replace(/<[^>]*>/g, " ").trim(),
      wrappedByLabel: labelRanges.some((range) => match!.index >= range.start && match!.index < range.end),
    });
  }
  return elements;
}

function elementName(element: MarkupElement): string {
  return `<${element.tag}${element.attributes.id ? `#${element.attributes.id}` : ""}>`;
}

function hasAccessibleName(element: MarkupElement, knownIds: Set<string>): boolean {
  const a = element.attributes;
  if ((a["aria-label"] ?? "").trim()) return true;
  if ((a["aria-labelledby"] ?? "").trim().split(/\s+/).filter(Boolean).every((id) => knownIds.has(id)) && (a["aria-labelledby"] ?? "").trim()) return true;
  if ((a.title ?? "").trim()) return true;
  if ((a.alt ?? "").trim()) return true;
  return Boolean(element.tag === "button" && element.textContent);
}

function push(findings: A11yFinding[], severity: A11ySeverity, rule: string, message: string, element: string, fix: string) {
  findings.push({ severity, rule, message, element, fix });
}

function inspectMarkup(kind: string, markup: string, elements: MarkupElement[]): A11yFinding[] {
  const findings: A11yFinding[] = [];
  const ids = elements.map((el) => el.attributes.id).filter(Boolean);
  const idSet = new Set(ids);
  const duplicates = new Set(ids.filter((id, i) => ids.indexOf(id) !== i));
  const html = markup;

  if (kind === "alt-text") {
    for (const el of elements.filter((x) => x.tag === "img" || (x.tag === "input" && x.attributes.type?.toLowerCase() === "image"))) {
      const alt = el.attributes.alt;
      if (alt === undefined) push(findings, "serious", "image-alt", "Image has no alt attribute; assistive technology may announce a filename or nothing.", elementName(el), "Add concise alt text, or alt=\"\" only when the image is decorative.");
      else if (!alt.trim() && !el.attributes["aria-hidden"]) push(findings, "minor", "decorative-image", "Empty alt marks this image decorative. Confirm that it conveys no information or function.", elementName(el), "Keep alt=\"\" for decorative images; provide a text alternative for informative images.");
      else if (/\.(?:png|jpe?g|gif|webp|svg)$/i.test(alt.trim())) push(findings, "moderate", "filename-alt", "Alt text appears to be a filename rather than a useful text alternative.", elementName(el), "Describe the image's meaning or function in context.");
    }
    for (const el of elements.filter((x) => x.tag === "svg" && (x.attributes.role === "img" || x.attributes["aria-label"]))) {
      if (!el.attributes["aria-label"]?.trim() && !el.attributes["aria-labelledby"]?.trim() && !/<title\b/i.test(el.innerMarkup)) push(findings, "serious", "svg-name", "SVG is exposed as an image but has no accessible name.", elementName(el), "Add a visible <title> referenced by aria-labelledby, or an aria-label.");
    }
  }

  if (kind === "aria") {
    for (const el of elements) {
      const role = el.attributes.role?.trim().split(/\s+/)[0]?.toLowerCase();
      if (role && !KNOWN_ROLES.has(role)) push(findings, "serious", "aria-valid-role", `Unknown ARIA role “${role}”.`, elementName(el), "Use a role from WAI-ARIA or remove the redundant role and use native HTML semantics.");
      if (Object.hasOwn(el.attributes, "aria-label") && !el.attributes["aria-label"].trim()) push(findings, "moderate", "aria-label", "aria-label is present but empty.", elementName(el), "Provide a concise accessible name or remove the empty attribute.");
      const refs = (el.attributes["aria-labelledby"] ?? "").trim().split(/\s+/).filter(Boolean);
      for (const ref of refs) if (!idSet.has(ref)) push(findings, "serious", "aria-labelledby", `aria-labelledby references missing id “${ref}”.`, elementName(el), "Point to an element with a unique, existing id.");
      if (el.attributes["aria-hidden"]?.toLowerCase() === "true" && (INTERACTIVE.has(el.tag) || el.attributes.tabindex !== undefined)) push(findings, "serious", "aria-hidden-focus", "Focusable content is hidden from the accessibility tree.", elementName(el), "Do not put aria-hidden=true on a focusable element; remove it or make the entire subtree non-interactive.");
      if (el.attributes["aria-checked"] && !["true", "false", "mixed"].includes(el.attributes["aria-checked"].toLowerCase())) push(findings, "moderate", "aria-checked", "aria-checked has an invalid value.", elementName(el), "Use true, false, or mixed where the role supports it.");
    }
    for (const id of duplicates) push(findings, "serious", "duplicate-id", `The id “${id}” is used more than once.`, `#${id}`, "Make every id unique so labels and ARIA references resolve unambiguously.");
  }

  if (kind === "form") {
    for (const el of elements.filter((x) => CONTROL.has(x.tag) && !(x.tag === "input" && ["hidden", "submit", "button", "reset", "image"].includes((x.attributes.type ?? "text").toLowerCase())))) {
      const id = el.attributes.id;
      const explicit = Boolean((el.attributes["aria-label"] ?? "").trim() || (el.attributes["aria-labelledby"] ?? "").trim());
      const associated = Boolean(elements.some((label) => label.tag === "label" && label.attributes.for === id) || el.wrappedByLabel);
      if (!explicit && !associated) push(findings, "serious", "label", "Form control has no detectable programmatic label.", elementName(el), "Add a visible <label for=\"…\"> or an aria-label/aria-labelledby name.");
      if (el.attributes["aria-invalid"] === "true" && !(el.attributes["aria-describedby"] ?? "").trim()) push(findings, "moderate", "error-description", "Invalid form control has no detectable description reference for its error.", elementName(el), "Associate concise error text with aria-describedby and expose the error state.");
    }
    for (const el of elements.filter((x) => x.tag === "button" || (x.tag === "input" && ["submit", "button"].includes((x.attributes.type ?? "").toLowerCase())))) {
      if (!hasAccessibleName(el, idSet)) push(findings, "serious", "button-name", "Button has no detectable accessible name.", elementName(el), "Give the button meaningful text or an aria-label that describes its action.");
    }
  }

  if (kind === "keyboard-navigation") {
    for (const el of elements) {
      const tabindex = el.attributes.tabindex;
      if (tabindex !== undefined && Number(tabindex) > 0) push(findings, "moderate", "tabindex", `Positive tabindex (${tabindex}) can create a confusing focus order.`, elementName(el), "Use tabindex=\"0\" only when needed and keep DOM order aligned with visual order.");
      if (["div", "span", "li"].includes(el.tag) && (el.attributes.onclick !== undefined || /onClick\s*=/.test(el.source)) && !el.attributes.role && !el.attributes.tabindex) push(findings, "serious", "keyboard-operable", "Click handler on a non-interactive element may not be keyboard operable.", elementName(el), "Prefer a native button/link. If custom behavior is essential, provide a role, focusability, and Enter/Space handling.");
      if ((el.attributes.role === "button" || el.attributes.role === "link") && !INTERACTIVE.has(el.tag) && el.attributes.tabindex === undefined) push(findings, "serious", "custom-control-focus", `Custom role=${el.attributes.role} is not in the sequential keyboard order.`, elementName(el), "Use a native button/link, or add tabindex=\"0\" and implement expected keyboard behavior.");
    }
    if (!/:focus(?:-visible)?\b/i.test(html) && /<style\b|\.css\b|:focus/i.test(html)) push(findings, "moderate", "visible-focus", "No focus selector was found in the supplied markup/styles.", "CSS focus styles", "Provide a clearly visible focus indicator, preferably with :focus-visible; test contrast and obscuration.");
  }

  if (kind === "focus-state") {
    const focusRules = html.match(/[^{}]*:focus(?:-visible)?[^{}]*\{[^}]*\}/gi) ?? [];
    if (!focusRules.length) push(findings, "serious", "focus-visible", "No :focus or :focus-visible rule was found in the supplied code.", "CSS focus styles", "Add a visible :focus-visible indicator with sufficient contrast and offset.");
    for (const rule of focusRules) {
      if (/outline\s*:\s*(?:none|0)(?:\s|;|$)/i.test(rule) && !/box-shadow\s*:\s*(?!none|0)/i.test(rule) && !/border\s*:\s*(?!0|none)/i.test(rule)) push(findings, "serious", "focus-not-hidden", "Focus rule removes the outline without a detectable replacement indicator.", rule.split("{")[0].trim(), "Keep the browser outline or replace it with a clearly visible, high-contrast indicator.");
    }
  }

  if (kind === "motion") {
    const animated = /\banimation(?:-name)?\s*:|@keyframes|\btransition(?:-property)?\s*:/i.test(html);
    const reduced = /prefers-reduced-motion\s*:\s*reduce/i.test(html);
    if (animated && !reduced) push(findings, "serious", "reduced-motion", "Motion CSS is present but no prefers-reduced-motion: reduce path was found.", "CSS animation/transition", "Provide a reduced-motion alternative that removes non-essential motion without hiding information.");
    if (/animation(?:-duration)?\s*:\s*[^;]*(?:infinite|\d+(?:\.\d+)?s)/i.test(html) && !/prefers-reduced-motion/i.test(html)) push(findings, "moderate", "motion-duration", "Long-running or looping motion may need a pause/stop mechanism and reduced-motion handling.", "CSS animation", "Avoid unnecessary looping, allow users to pause it, and respect reduced-motion preferences.");
    if (/\bblink\s*\(|<marquee\b/i.test(html)) push(findings, "serious", "flashing-motion", "Blinking or marquee-like content can distract and may create safety concerns.", "animated content", "Remove the effect or ensure it does not flash above safe limits and can be stopped.");
  }

  return findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.rule.localeCompare(b.rule));
}

export function auditAccessibilityMarkup(toolId: string, markup: string): A11yAudit {
  const withoutAction = toolId.replace(/-(?:checker|generator|helper|preview|simulator)$/, "");
  const kind = withoutAction.replace(/-/g, " ");
  const elements = parseElements(markup);
  const findings = inspectMarkup(withoutAction, markup, elements);
  const counts = ["critical", "serious", "moderate", "minor"].map((level) => `${level}: ${findings.filter((f) => f.severity === level).length}`).join(" · ");
  const details = findings.length
    ? findings.map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.rule} — ${f.message}\n   Element: ${f.element}\n   Fix: ${f.fix}`).join("\n")
    : "No matching issues were detected in the supplied snippet. A clean snippet is not proof of WCAG conformance.";
  const report = `${kind.toUpperCase()} LOCAL REVIEW\nElements inspected: ${elements.length}\nFindings: ${findings.length} (${counts})\n\n${details}\n\nScope: This report covers selected static patterns only; use the separate axe-core scan for browser rules. Neither scan inspects the full live page or certifies conformance. Verify interaction states, keyboard, and screen-reader behavior manually.`;
  return { kind: withoutAction, inspected: elements.length, findings, passed: findings.length === 0, report };
}

export async function scanMarkupWithAxe(markup: string): Promise<string> {
  if (typeof document === "undefined") return "axe-core requires a browser document.";
  const frame = document.createElement("iframe");
  frame.title = "Temporary local accessibility test document";
  // Scripts run only in this opaque-origin frame: user markup cannot access the
  // app's origin, and the CSP below permits only the nonce-bearing scanner.
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1280px;height:800px;border:0;visibility:hidden";
  const nonce = crypto.randomUUID();
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-${nonce}';">`;
  let source = /^\s*<!doctype|^\s*<html\b/i.test(markup)
    ? markup
    : `<!doctype html><html lang="en"><head>${csp}<meta charset="utf-8"><title>Accessibility snippet test</title></head><body>${markup}</body></html>`;
  if (/^\s*<!doctype|^\s*<html\b/i.test(markup)) {
    if (/<head\b[^>]*>/i.test(source)) source = source.replace(/<head\b[^>]*>/i, (opening) => `${opening}${csp}`);
    else source = source.replace(/<html\b[^>]*>/i, (opening) => `${opening}<head>${csp}<title>Accessibility snippet test</title></head>`);
  }
  const runner = `window.addEventListener('load',async()=>{try{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']},resultTypes:['violations','incomplete','passes']});const pick=a=>a.map(x=>({id:x.id,impact:x.impact,help:x.help,helpUrl:x.helpUrl,tags:x.tags,nodes:x.nodes.map(n=>({target:n.target,html:n.html}))}));parent.postMessage({nonce:${JSON.stringify(nonce)},results:{violations:pick(r.violations),incomplete:pick(r.incomplete),passes:pick(r.passes)}},'*')}catch(e){parent.postMessage({nonce:${JSON.stringify(nonce)},error:String(e&&e.message||e)},'*')}})`;
  const axeSource = axe.source.replace(
    "if (typeof window.getComputedStyle === 'function') {\n    window.axe = axe;\n  }",
    "window.axe = axe;",
  );
  if (axeSource === axe.source) return "axe-core scan failed: bundled axe global bootstrap did not match the expected version.";
  const scannerScripts = `<script nonce="${nonce}">${axeSource.replace(/<\/script/gi, "<\\/script")}</script><script nonce="${nonce}">${runner}</script>`;
  if (/<\/body\s*>/i.test(source)) source = source.replace(/<\/body\s*>/i, `${scannerScripts}</body>`);
  else if (/<\/html\s*>/i.test(source)) source = source.replace(/<\/html\s*>/i, `${scannerScripts}</html>`);
  else source += scannerScripts;
  let timeoutId = 0;
  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.data?.nonce !== nonce) return;
    window.clearTimeout(timeoutId);
    window.removeEventListener("message", onMessage);
    resolveResults(event.data);
  };
  let resolveResults!: (value: { error?: string; results?: AxeReportResults }) => void;
  let rejectResults!: (reason: Error) => void;
  const resultsReady = new Promise<{ error?: string; results?: AxeReportResults }>((resolve, reject) => { resolveResults = resolve; rejectResults = reject; });
  window.addEventListener("message", onMessage);
  timeoutId = window.setTimeout(() => rejectResults(new Error("Timed out running axe-core in the isolated snippet.")), 15000);
  try {
    frame.srcdoc = source;
    document.body.appendChild(frame);
    const results = await resultsReady;
    if (results?.error) return `axe-core scan failed: ${results.error}`;
    if (!results?.results) return "axe-core scan could not read the isolated scan results.";
    const scanResults = results.results;
    const format = (group: AxeReportRule[], heading: string) => {
      if (!group.length) return `${heading}: 0`;
      const lines = group.map((rule) => {
        const targets = rule.nodes.slice(0, 5).map((node) => {
          const target = node.target.join(", ") || "(target unavailable)";
          const html = node.html.replace(/\s+/g, " ").slice(0, 180);
          return `    ${target}${html ? `\n      ${html}` : ""}`;
        }).join("\n");
        const more = rule.nodes.length > 5 ? `\n    …and ${rule.nodes.length - 5} more affected node(s)` : "";
        return `- ${rule.id} [${rule.impact ?? "needs review"}] · ${rule.help}\n  WCAG tags: ${rule.tags.filter((tag) => tag.startsWith("wcag")).join(", ") || "best practice / review"}\n  ${rule.helpUrl}\n${targets}${more}`;
      });
      return `${heading}: ${group.length}\n${lines.join("\n")}`;
    };
    return [
      `AXE-CORE ${axe.version} · local snippet scan`,
      `Automated violations: ${scanResults.violations.length}`,
      `Manual review / incomplete rules: ${scanResults.incomplete.length}`,
      `Passed checks: ${scanResults.passes.length}`,
      "",
      format(scanResults.violations, "Violations"),
      "",
      format(scanResults.incomplete, "Needs human review"),
      "",
      "Scope: This scans only the supplied isolated snippet and active rendered state. axe-core and other automated checks find a subset of accessibility problems; this output does not certify WCAG conformance. Manually test the full page, interaction states, keyboard, and assistive technology.",
    ].join("\n");
  } catch (error) {
    return `axe-core scan failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    window.clearTimeout(timeoutId);
    window.removeEventListener("message", onMessage);
    frame.remove();
  }
}
