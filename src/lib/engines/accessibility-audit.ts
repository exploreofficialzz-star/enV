import { inspectMotionMarkup } from "./accessibility-motion-audit.ts";

export type A11ySeverity = "critical" | "serious" | "moderate" | "minor";
export interface A11yFinding {
  severity: A11ySeverity;
  rule: string;
  message: string;
  element: string;
  fix: string;
  /** Stable, source-independent key for tracking this rule/target across reports. */
  id?: string;
  /** One-based source line when a best-effort static location can be resolved. */
  line?: number | null;
  /** A small excerpt from the submitted snippet, not a rendered DOM snapshot. */
  evidence?: string;
  /** WCAG criteria related to this pattern; this is not a claim that the criterion failed. */
  relatedCriteria?: string[];
  /** Static snippet checks require review in the actual rendered context. */
  review?: "verify-in-context" | "manual-review";
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
  "searchbox separator slider spinbutton status strong subscript superscript switch tab tablist " +
  "tabpanel table term textbox timer toolbar tooltip tree treegrid treeitem"
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

function hasAccessibleName(element: MarkupElement, elements: MarkupElement[]): boolean {
  const a = element.attributes;
  if ((a["aria-label"] ?? "").trim()) return true;
  const byId = new Map(elements.filter((candidate) => candidate.attributes.id).map((candidate) => [candidate.attributes.id, candidate]));
  const labelledBy = (a["aria-labelledby"] ?? "").trim().split(/\s+/).filter(Boolean);
  if (labelledBy.length > 0 && labelledBy.every((id) => byId.has(id))) {
    const referencedText = labelledBy.map((id) => {
      const target = byId.get(id)!;
      const attrs = target.attributes;
      return (target.textContent || attrs["aria-label"] || attrs.title || attrs.alt || attrs.value || "").trim();
    }).join(" ").trim();
    if (referencedText) return true;
  }
  if ((a.title ?? "").trim()) return true;
  if ((a.alt ?? "").trim()) return true;
  const type = (a.type ?? "").toLowerCase();
  if (element.tag === "input" && ["button", "submit", "reset"].includes(type) && (a.value ?? "").trim()) return true;
  if (["button", "a"].includes(element.tag) && element.textContent) return true;
  if (/<img\b[^>]*\balt\s*=\s*(["'][^"']+|[^\s>]+)/i.test(element.innerMarkup)) return true;
  if (/<svg\b[\s\S]*?<title\b[^>]*>[^<]+<\/title>/i.test(element.innerMarkup)) return true;
  // A custom role may use descendant text; an actual accessibility tree is still required to verify computed-name rules.
  return Boolean(element.attributes.role && element.textContent);
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
    for (const el of elements.filter((x) => x.tag === "svg" && (x.attributes.role === "img" || x.attributes["aria-label"] || x.attributes["aria-labelledby"]))) {
      if (!el.attributes["aria-label"]?.trim() && !el.attributes["aria-labelledby"]?.trim() && !/<title\b/i.test(el.innerMarkup)) push(findings, "serious", "svg-name", "SVG is exposed as an image but has no accessible name.", elementName(el), "Add a visible <title> referenced by aria-labelledby, or an aria-label.");
    }
  }

  if (kind === "aria") {
    // Document-level checks are source heuristics; fragments without an <html> root are not treated as missing-language failures.
    const htmlRoot = elements.find((el) => el.tag === "html");
    if (htmlRoot && !(htmlRoot.attributes.lang ?? "").trim()) push(findings, "serious", "document-language", "The HTML root has no detectable language declaration.", "<html>", 'Set a valid BCP 47 language tag such as lang=\"en\" on the html element and verify the actual page language.');
    if (/<html\b|<head\b/i.test(markup)) {
      const titleElement = elements.find((el) => el.tag === "title");
      if (!titleElement || !titleElement.textContent.trim()) push(findings, "moderate", "document-title", "A non-empty document title was not detected in this document-like snippet.", "<head>", "Provide a concise, descriptive <title> for the page. This check does not assess whether the title is useful in context.");
    }
    const headings = elements.filter((el) => /^h[1-6]$/.test(el.tag));
    let previousHeadingLevel = 0;
    for (const heading of headings) {
      const level = Number(heading.tag.slice(1));
      if (previousHeadingLevel && level > previousHeadingLevel + 1) push(findings, "moderate", "heading-order", `Heading level jumps from h${previousHeadingLevel} to h${level}; verify the document outline and heading hierarchy.`, elementName(heading), "Use heading levels that reflect the content structure. A skipped level is a review lead, not automatically a WCAG failure.");
      previousHeadingLevel = level;
    }
    for (const el of elements) {
      const role = el.attributes.role?.trim().split(/\s+/)[0]?.toLowerCase();
      if (role && !KNOWN_ROLES.has(role)) push(findings, "serious", "aria-valid-role", `Unknown ARIA role “${role}”.`, elementName(el), "Use a role from WAI-ARIA or remove the redundant role and use native HTML semantics.");
      if (Object.hasOwn(el.attributes, "aria-label") && !el.attributes["aria-label"].trim()) push(findings, "moderate", "aria-label", "aria-label is present but empty.", elementName(el), "Provide a concise accessible name or remove the empty attribute.");
      if (Object.hasOwn(el.attributes, "aria-label") && ["div", "span", "p", "li"].includes(el.tag) && (!role || ["generic", "none", "presentation"].includes(role)) && !el.attributes["aria-labelledby"]?.trim()) push(findings, "serious", "aria-prohibited-attr", "aria-label is used on a generic container without a role that supports an accessible name.", elementName(el), "Prefer a native semantic element or add a role that accurately describes the content and supports naming; do not add a role just to silence the checker.");
      const refs = (el.attributes["aria-labelledby"] ?? "").trim().split(/\s+/).filter(Boolean);
      for (const ref of refs) if (!idSet.has(ref)) push(findings, "serious", "aria-labelledby", `aria-labelledby references missing id “${ref}”.`, elementName(el), "Point to an element with a unique, existing id.");
      for (const attribute of ["aria-describedby", "aria-controls", "aria-owns", "aria-details", "aria-errormessage", "aria-flowto"]) {
        const references = (el.attributes[attribute] ?? "").trim().split(/\s+/).filter(Boolean);
        for (const ref of references) if (!idSet.has(ref)) push(findings, "moderate", "aria-reference", `${attribute} references missing id “${ref}”. Dynamic content may create this target later, so verify the rendered state.`, elementName(el), `Ensure ${attribute} points to an existing element in every relevant interaction state, or remove the stale reference.`);
      }
      if (el.attributes["aria-hidden"]?.toLowerCase() === "true" && (INTERACTIVE.has(el.tag) || el.attributes.tabindex !== undefined)) push(findings, "serious", "aria-hidden-focus", "Focusable content is hidden from the accessibility tree.", elementName(el), "Do not put aria-hidden=true on a focusable element; remove it or make the entire subtree non-interactive.");
      const validTokens: Record<string, string[]> = {
        "aria-checked": ["true", "false", "mixed"], "aria-pressed": ["true", "false", "mixed"],
        "aria-selected": ["true", "false"], "aria-expanded": ["true", "false"], "aria-hidden": ["true", "false"],
        "aria-disabled": ["true", "false"], "aria-required": ["true", "false"], "aria-readonly": ["true", "false"], "aria-busy": ["true", "false"],
        "aria-invalid": ["true", "false", "grammar", "spelling"],
      };
      for (const [attribute, allowed] of Object.entries(validTokens)) {
        const value = el.attributes[attribute]?.toLowerCase();
        if (value !== undefined && !allowed.includes(value)) push(findings, "moderate", `aria-value-${attribute.slice(5)}`, `${attribute} has invalid value “${value}”.`, elementName(el), `Use one of: ${allowed.join(", ")}, and only use the attribute when it is supported by the element's role.`);
      }
      const liveValue = el.attributes["aria-live"]?.toLowerCase();
      if (liveValue !== undefined && !["off", "polite", "assertive"].includes(liveValue)) push(findings, "moderate", "aria-value-live", `aria-live has invalid value “${liveValue}”.`, elementName(el), "Use off, polite, or assertive and avoid unnecessarily interrupting assistive technology.");
      const controlRoles = new Set(["button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option"]);
      const inputType = (el.attributes.type ?? "").toLowerCase();
      if (el.tag === "button" || (el.tag === "input" && ["button", "submit", "reset"].includes(inputType))) {
        if (!hasAccessibleName(el, elements)) push(findings, "serious", "button-name", "Button has no detectable accessible name in the supplied markup.", elementName(el), "Give the button meaningful visible text, a valid aria-label/aria-labelledby, or a meaningful value for input buttons.");
      } else if (el.tag === "a" && Object.hasOwn(el.attributes, "href")) {
        if (!hasAccessibleName(el, elements)) push(findings, "serious", "link-name", "Link has no detectable accessible name in the supplied markup.", elementName(el), "Provide meaningful link text or an accessible name that communicates the link purpose in context.");
      } else if (role && controlRoles.has(role) && !INTERACTIVE.has(el.tag) && !hasAccessibleName(el, elements)) {
        push(findings, "serious", "custom-control-name", `Custom role=${role} has no detectable accessible name.`, elementName(el), "Prefer a native interactive element or give the custom control a meaningful accessible name and validate its computed name in a browser.");
      }
    }
    for (const id of duplicates) push(findings, "serious", "duplicate-id", `The id “${id}” is used more than once.`, `#${id}`, "Make every id unique so labels and ARIA references resolve unambiguously.");
  }

  if (kind === "form") {
    const formControls = elements.filter((x) => {
      if (!CONTROL.has(x.tag)) return false;
      if (x.tag !== "input") return true;
      const type = (x.attributes.type ?? "text").toLowerCase();
      return !["hidden", "submit", "button", "reset", "image"].includes(type);
    });
    for (const el of formControls) {
      const id = el.attributes.id;
      const explicit = Boolean((el.attributes["aria-label"] ?? "").trim() || (el.attributes["aria-labelledby"] ?? "").trim());
      const associated = Boolean((id && elements.some((label) => label.tag === "label" && label.attributes.for === id)) || el.wrappedByLabel);
      const hasPlaceholder = Boolean((el.attributes.placeholder ?? "").trim());
      const titleOnly = Boolean((el.attributes.title ?? "").trim()) && !explicit && !associated;

      if (!explicit && !associated) {
        push(findings, "serious", "label", "Form control has no detectable programmatic label.", elementName(el), "Add a visible <label for=\"…\"> that matches this control's id, wrap the control in a <label>, or provide aria-label/aria-labelledby.");
        if (hasPlaceholder) {
          push(findings, "moderate", "placeholder-label", "Placeholder text is present but is not a programmatic label and often disappears while typing.", elementName(el), "Keep a persistent visible label; do not rely on placeholder alone for the accessible name.");
        }
        if (titleOnly) {
          push(findings, "moderate", "title-label", "Only a title attribute is present; title is not a reliable visible label for form controls.", elementName(el), "Provide a visible <label> (or aria-label/aria-labelledby) in addition to any title tooltip.");
        }
      }

      if (el.attributes["aria-invalid"] === "true") {
        const describedBy = (el.attributes["aria-describedby"] ?? "").trim();
        if (!describedBy) {
          push(findings, "moderate", "error-description", "Invalid form control has no detectable description reference for its error.", elementName(el), "Associate concise error text with aria-describedby on this control and expose the error state.");
        } else {
          const descriptions = describedBy.split(/\s+/).filter(Boolean);
          if (descriptions.some((ref) => !idSet.has(ref))) {
            push(findings, "moderate", "error-description-reference", "Invalid form control references an error description that is missing from this snippet.", elementName(el), "Ensure the error element exists in the rendered state and its text explains how to correct the issue.");
          }
        }
      }
    }

    // Labels that have text but neither for= nor a wrapped control
    for (const label of elements.filter((x) => x.tag === "label")) {
      const forId = (label.attributes.for ?? "").trim();
      if (forId) {
        if (!idSet.has(forId)) push(findings, "moderate", "label-reference", `Label references missing form-control id “${forId}”.`, elementName(label), "Make the label's for value match a unique control id, or wrap the control inside the label.");
      } else if (!label.innerMarkup.match(/<(input|select|textarea)\b/i) && label.textContent.trim()) {
        push(findings, "moderate", "label-unassociated", "Label text is present but is not associated with a control via for/id or wrapping.", elementName(label), "Add for=\"control-id\" matching a unique control id, or place the control inside the label.");
      }
    }

    // Radio / checkbox groups without fieldset+legend
    const radios = formControls.filter((x) => x.tag === "input" && (x.attributes.type ?? "").toLowerCase() === "radio");
    const radioNames = [...new Set(radios.map((r) => r.attributes.name).filter(Boolean))];
    for (const name of radioNames) {
      const group = radios.filter((r) => r.attributes.name === name);
      if (group.length >= 2) {
        const hasFieldset = /<fieldset\b/i.test(markup) && /<legend\b/i.test(markup);
        if (!hasFieldset) {
          push(findings, "moderate", "radio-group", `Radio group name=\"${name}\" has ${group.length} options but no fieldset/legend grouping was detected.`, elementName(group[0]), "Wrap related radios in <fieldset> with a <legend> that names the group.");
        }
      }
    }
    const checkboxes = formControls.filter((x) => x.tag === "input" && (x.attributes.type ?? "").toLowerCase() === "checkbox");
    if (checkboxes.length >= 2) {
      const hasFieldset = /<fieldset\b/i.test(markup) && /<legend\b/i.test(markup);
      if (!hasFieldset) {
        push(findings, "minor", "checkbox-group", "Multiple checkboxes detected without fieldset/legend grouping.", elementName(checkboxes[0]), "When checkboxes form a related set, wrap them in <fieldset> with a descriptive <legend>.");
      }
    }

    for (const el of elements.filter((x) => x.tag === "button" || (x.tag === "input" && ["submit", "button", "image"].includes((x.attributes.type ?? "").toLowerCase())))) {
      if (!hasAccessibleName(el, elements)) {
        push(findings, "serious", "button-name", "Button has no detectable accessible name.", elementName(el), "Give the button meaningful text or an aria-label that describes its action. Icon-only buttons need an accessible name.");
      }
    }
  }

  if (kind === "keyboard-navigation") {
    const cssSource = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
    const cssRules = [...cssSource.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1].trim(), declarations: match[2] }));
    for (const el of elements) {
      const tabindex = el.attributes.tabindex;
      if (tabindex !== undefined && Number(tabindex) > 0) push(findings, "moderate", "tabindex", `Positive tabindex (${tabindex}) can create a confusing focus order.`, elementName(el), "Use tabindex=\"0\" only when needed and keep DOM order aligned with visual order.");
      const hasClickHandler = el.attributes.onclick !== undefined || /onClick\s*=/.test(el.source);
      const hasKeyboardHandler = /on(?:key(?:down|up|press))\s*=/i.test(el.source);
      const role = el.attributes.role?.toLowerCase();
      if (["div", "span", "li"].includes(el.tag) && hasClickHandler && !["button", "link"].includes(role ?? "") && !hasKeyboardHandler) push(findings, "serious", "keyboard-operable", el.attributes.tabindex !== undefined ? "Focusable custom content has a click handler but no detectable keyboard activation handler." : "Click handler on a non-interactive element may not be focusable or keyboard operable.", elementName(el), "Prefer a native button/link. If custom behavior is essential, expose the correct role, provide sequential focus, and implement expected Enter/Space activation.");
      if ((role === "button" || role === "link") && !INTERACTIVE.has(el.tag) && el.attributes.tabindex === undefined) push(findings, "serious", "custom-control-focus", `Custom role=${role} is not in the sequential keyboard order.`, elementName(el), "Use a native button/link, or add tabindex=\"0\" and implement expected keyboard behavior.");
      if (["button", "link", "checkbox", "radio", "switch", "tab"].includes(role ?? "") && !INTERACTIVE.has(el.tag) && hasClickHandler && !hasKeyboardHandler) push(findings, "serious", role === "button" ? "custom-button-keyboard-activation" : "custom-control-keyboard-activation", `Custom role=${role} has a click handler but no detectable keyboard handler in its opening tag.`, elementName(el), "Prefer a native semantic control. Otherwise, implement the role's expected keyboard interaction and test with keyboard and assistive technology.");

      const interactive = INTERACTIVE.has(el.tag) && (el.tag !== "a" || Object.hasOwn(el.attributes, "href")) || ["button", "link", "checkbox", "radio", "switch", "tab", "slider", "combobox"].includes(role ?? "");
      if (interactive) {
        const classes = new Set((el.attributes.class ?? "").split(/\s+/).filter(Boolean));
        const matchingRules = cssRules.filter(({ selector }) => selector.split(",").some((part) => {
          const simple = part.trim().split(/\s+|>|\+|~/).pop()?.replace(/:[\w-]+(?:\([^)]*\))?/g, "") ?? "";
          if (!simple || simple.includes("[") || simple.includes("*")) return false;
          const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
          const id = simple.match(/#([\w-]+)/)?.[1];
          const ruleClasses = [...simple.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
          return (!tag || tag.toLowerCase() === el.tag) && (!id || id === el.attributes.id) && ruleClasses.every((name) => classes.has(name));
        })).map((rule) => rule.declarations);
        const declarations = [el.attributes.style ?? "", ...matchingRules].join(";");
        const px = (property: string) => {
          const match = declarations.match(new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*(\\d+(?:\\.\\d+)?)px\\b`, "i"));
          return match ? Number(match[1]) : null;
        };
        const width = px("width") ?? px("inline-size");
        const height = px("height") ?? px("block-size");
        const minWidth = px("min-width") ?? px("min-inline-size");
        const minHeight = px("min-height") ?? px("min-block-size");
        if ((width !== null && width < 24 && !(minWidth !== null && minWidth >= 24)) || (height !== null && height < 24 && !(minHeight !== null && minHeight >= 24))) {
          push(findings, "moderate", "target-size-risk", `Explicit target dimensions (${width ?? "auto"} × ${height ?? "auto"} CSS px) may fall below 24 × 24 CSS px. This is a review lead; spacing and other WCAG exceptions may apply.`, elementName(el), "Check the rendered target size and spacing. Meet 24 × 24 CSS px or document an applicable WCAG 2.2 SC 2.5.8 exception; test touch and pointer use.");
        }
      }
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
    findings.push(...inspectMotionMarkup(html));
    if (/<marquee\b|\bblink\s*\(/i.test(html)) push(findings, "serious", "flashing-motion", "Legacy marquee/blink content was detected; its visual and timing behavior needs manual review.", "animated content", "Remove legacy marquee/blink behavior, or provide user controls and verify the actual flash rate/area.");
  }

  return findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.rule.localeCompare(b.rule));
}

const RELATED_CRITERIA: Record<string, string[]> = {
  "image-alt": ["1.1.1 Non-text Content"],
  "decorative-image": ["1.1.1 Non-text Content"],
  "filename-alt": ["1.1.1 Non-text Content"],
  "svg-name": ["1.1.1 Non-text Content", "4.1.2 Name, Role, Value"],
  "aria-valid-role": ["4.1.2 Name, Role, Value"],
  "aria-label": ["4.1.2 Name, Role, Value"],
  "aria-prohibited-attr": ["4.1.2 Name, Role, Value"],
  "aria-labelledby": ["4.1.2 Name, Role, Value"],
  "aria-reference": ["4.1.2 Name, Role, Value"],
  "aria-hidden-focus": ["4.1.2 Name, Role, Value", "2.4.3 Focus Order"],
  "aria-value-expanded": ["4.1.2 Name, Role, Value"],
  "aria-value-live": ["4.1.2 Name, Role, Value"],
  "aria-value-invalid": ["4.1.2 Name, Role, Value"],
  "duplicate-id": ["4.1.2 Name, Role, Value"],
  "label": ["3.3.2 Labels or Instructions", "4.1.2 Name, Role, Value"],
  "label-reference": ["3.3.2 Labels or Instructions", "4.1.2 Name, Role, Value"],
  "label-unassociated": ["3.3.2 Labels or Instructions", "1.3.1 Info and Relationships"],
  "placeholder-label": ["3.3.2 Labels or Instructions"],
  "title-label": ["3.3.2 Labels or Instructions"],
  "radio-group": ["1.3.1 Info and Relationships", "3.3.2 Labels or Instructions"],
  "checkbox-group": ["1.3.1 Info and Relationships", "3.3.2 Labels or Instructions"],
  "button-name": ["4.1.2 Name, Role, Value"],
  "link-name": ["2.4.4 Link Purpose (In Context)", "4.1.2 Name, Role, Value"],
  "custom-control-name": ["4.1.2 Name, Role, Value"],
  "error-description": ["3.3.1 Error Identification", "3.3.3 Error Suggestion"],
  "error-description-reference": ["3.3.1 Error Identification", "3.3.3 Error Suggestion"],
  "keyboard-operable": ["2.1.1 Keyboard", "4.1.2 Name, Role, Value"],
  "custom-button-keyboard-activation": ["2.1.1 Keyboard", "4.1.2 Name, Role, Value"],
  "custom-control-keyboard-activation": ["2.1.1 Keyboard", "4.1.2 Name, Role, Value"],
  "tabindex": ["2.4.3 Focus Order"],
  "target-size-risk": ["2.5.8 Target Size (Minimum)"],
  "document-language": ["3.1.1 Language of Page"],
  "document-title": ["2.4.2 Page Titled"],
  "heading-order": ["1.3.1 Info and Relationships"],
  "focus-not-hidden": ["2.4.7 Focus Visible", "2.4.11 Focus Not Obscured (Minimum)"],
  "visible-focus": ["2.4.7 Focus Visible"],
  "focus-visible": ["2.4.7 Focus Visible"],
  "reduced-motion": ["2.3.3 Animation from Interactions", "2.2.2 Pause, Stop, Hide"],
  "reduced-motion-incomplete": ["2.3.3 Animation from Interactions", "2.2.2 Pause, Stop, Hide"],
  "smooth-scroll-not-reduced": ["2.3.3 Animation from Interactions"],
  "rapid-contrast-flash": ["2.3.1 Three Flashes or Below Threshold"],
  "flashing-motion": ["2.3.1 Three Flashes or Below Threshold", "2.2.2 Pause, Stop, Hide"],
  "auto-moving-content": ["2.2.2 Pause, Stop, Hide"],
  "loop-without-pause": ["2.2.2 Pause, Stop, Hide"],
  "script-driven-motion": ["2.3.3 Animation from Interactions"],
  "script-motion-not-preference-aware": ["2.3.3 Animation from Interactions"],
};

function resolveSourceEvidence(markup: string, finding: A11yFinding): { line: number | null; evidence: string } {
  const lines = markup.split(/\r?\n/);
  const target = finding.element.trim();
  const idMatch = target.match(/^<[^>]+#([^>]+)>$/) ?? target.match(/^#([\w:.-]+)$/);
  const tagMatch = target.match(/^<([a-z][\w:-]*)/i);
  const keyframeMatch = target.match(/@(?:-webkit-)?keyframes\s+([\w-]+)/i);
  let index = -1;

  if (idMatch?.[1]) {
    const escapedId = idMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    index = lines.findIndex((line) => new RegExp(`\\bid\\s*=\\s*[\"']${escapedId}[\"']`, "i").test(line));
  }
  if (index < 0 && keyframeMatch?.[1]) {
    index = lines.findIndex((line) => new RegExp(`@(?:-webkit-)?keyframes\\s+${keyframeMatch[1]}\\b`, "i").test(line));
  }
  if (index < 0 && target && target.length < 100 && !/^</.test(target) && !/^CSS$/.test(target)) {
    const selector = target.replace(/[\s>+~]+$/g, "");
    index = lines.findIndex((line) => line.includes(selector));
  }
  if (index < 0 && tagMatch?.[1]) {
    const tag = tagMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    index = lines.findIndex((line) => new RegExp(`<${tag}(?:\\s|>|/)`, "i").test(line));
  }
  if (index < 0) {
    const propertyPatterns: Record<string, RegExp> = {
      "rapid-contrast-flash": /@(?:-webkit-)?keyframes|background(?:-color)?\s*:/i,
      "auto-moving-content": /@(?:-webkit-)?keyframes|translateX\s*\(/i,
      "loop-without-pause": /animation(?:-iteration-count)?\s*:[^;]*infinite/i,
      "smooth-scroll-not-reduced": /scroll-behavior\s*:\s*smooth/i,
      "script-driven-motion": /addEventListener|requestAnimationFrame|setInterval|\.style\.(?:transform|translate|rotate|scale)\s*=|\.animate\s*\(/i,
      "script-motion-not-preference-aware": /addEventListener|requestAnimationFrame|setInterval|\.style\.(?:transform|translate|rotate|scale)\s*=|\.animate\s*\(/i,
      "reduced-motion": /animation\s*:|transition\s*:|@(?:-webkit-)?keyframes/i,
      "reduced-motion-incomplete": /@media[^\n]*prefers-reduced-motion/i,
      "transition-all": /transition\s*:\s*all/i,
    };
    const pattern = propertyPatterns[finding.rule];
    if (pattern) index = lines.findIndex((line) => pattern.test(line));
  }

  if (index < 0) return { line: null, evidence: "Source location could not be resolved from this snippet; inspect the target manually." };
  const evidence = lines.slice(index, Math.min(lines.length, index + 3)).join("\n").trim().slice(0, 500);
  return { line: index + 1, evidence };
}

function enrichFindings(kind: string, markup: string, findings: A11yFinding[]): A11yFinding[] {
  const idCounts = new Map<string, number>();
  return findings.map((finding) => {
    const targetSlug = finding.element.toLowerCase().replace(/[^a-z0-9._#@-]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "snippet";
    const identity = `${kind}/${finding.rule}/${targetSlug}`;
    const occurrence = (idCounts.get(identity) ?? 0) + 1;
    idCounts.set(identity, occurrence);
    const location = resolveSourceEvidence(markup, finding);
    return {
      ...finding,
      id: `env-a11y:${identity}${occurrence > 1 ? `:${occurrence}` : ""}`,
      line: location.line,
      evidence: location.evidence,
      relatedCriteria: RELATED_CRITERIA[finding.rule] ?? [],
      review: ["image-alt", "aria-valid-role", "duplicate-id", "label-reference", "aria-value-expanded", "aria-value-live", "aria-value-invalid"].includes(finding.rule)
        ? "verify-in-context"
        : "manual-review",
    };
  });
}

export function formatAccessibilityAuditJson(audit: A11yAudit): string {
  return JSON.stringify({
    schemaVersion: 1,
    product: "enV Accessibility Studio",
    kind: audit.kind,
    inspectedElements: audit.inspected,
    findingCount: audit.findings.length,
    severityCounts: Object.fromEntries((["critical", "serious", "moderate", "minor"] as const).map((severity) => [severity, audit.findings.filter((finding) => finding.severity === severity).length])),
    findings: audit.findings,
    limitations: [
      "Static source-snippet analysis only; findings are not a WCAG conformance verdict.",
      "Related WCAG criteria identify areas to review and do not prove that a criterion failed.",
      "Verify rendered states, keyboard interaction, and assistive-technology behavior manually.",
    ],
  }, null, 2);
}

function csvCell(value: unknown): string {
  let text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  // Prevent spreadsheet formula execution when user-supplied evidence begins with a formula marker.
  if (/^[\s\uFEFF]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function formatAccessibilityAuditCsv(audit: A11yAudit): string {
  const columns: Array<keyof A11yFinding> = ["id", "severity", "rule", "element", "line", "message", "fix", "evidence", "relatedCriteria", "review"];
  const rows = [columns.map(csvCell).join(","), ...audit.findings.map((finding) => columns.map((column) => csvCell(finding[column])).join(","))];
  return `\uFEFF${rows.join("\r\n")}`;
}

export function auditAccessibilityMarkup(toolId: string, markup: string): A11yAudit {
  const withoutAction = toolId.replace(/-(?:checker|generator|helper|preview|simulator)$/, "");
  const kind = withoutAction.replace(/-/g, " ");
  const elements = parseElements(markup);
  const findings = enrichFindings(withoutAction, markup, inspectMarkup(withoutAction, markup, elements));
  const counts = ["critical", "serious", "moderate", "minor"].map((level) => `${level}: ${findings.filter((f) => f.severity === level).length}`).join(" · ");
  const details = findings.length
    ? findings.map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.rule} — ${f.message}\n   Finding ID: ${f.id}\n   Target: ${f.element}${f.line ? ` · Source line: ${f.line}` : ""}\n   Evidence: ${f.evidence ?? "Not available"}\n   Related WCAG criteria (review mapping, not a conformance verdict): ${(f.relatedCriteria ?? []).join(", ") || "Manual review; no specific mapping assigned"}\n   Review: ${f.review ?? "manual-review"}\n   Fix: ${f.fix}`).join("\n")
    : "No matching issues were detected in the supplied snippet. A clean snippet is not proof of WCAG conformance.";
  const report = `${kind.toUpperCase()} LOCAL REVIEW\nElements inspected: ${elements.length}\nFindings: ${findings.length} (${counts})\n\n${details}\n\nScope: This report covers selected static patterns only; use the separate axe-core scan for browser rules. Neither scan inspects the full live page or certifies conformance. Verify interaction states, keyboard, and screen-reader behavior manually.`;
  return { kind: withoutAction, inspected: elements.length, findings, passed: findings.length === 0, report };
}

export async function scanMarkupWithAxe(markup: string): Promise<string> {
  if (typeof document === "undefined") return "axe-core requires a browser document.";
  // Lazy-load the Vite raw asset so the deterministic local analyzer and its
  // tests remain importable in plain Node without loading browser-only assets.
  const { default: axeSource } = await import("axe-core/axe.min.js?raw");
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
  // Embed the package's standalone UMD file as raw text. Using axe.source
  // stringifies a bundler-rewritten function in production, which can retain
  // references to module-local variables and fail before axe initializes.
  const bootstrapPattern = /["']function["']\s*==\s*typeof\s+window\.getComputedStyle\s*&&\s*\(\s*window\.axe\s*=\s*axe\s*\)/;
  const standaloneAxeSource = axeSource.replace(bootstrapPattern, "(window.axe=axe)");
  if (standaloneAxeSource === axeSource) return "axe-core scan failed: standalone axe bootstrap did not match the expected version.";
  const scannerScripts = `<script nonce="${nonce}">${standaloneAxeSource.replace(/<\/script/gi, "<\\/script")}</script><script nonce="${nonce}">${runner}</script>`;
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
      "AXE-CORE · local snippet scan",
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
