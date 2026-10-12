import test from "node:test";
import assert from "node:assert/strict";
import { auditAccessibilityMarkup, formatAccessibilityAuditCsv, formatAccessibilityAuditJson } from "./accessibility-audit.ts";

test("reports missing and filename-style alternative text with fixes", () => {
  const result = auditAccessibilityMarkup("alt-text-checker", '<img src="hero.jpg"><img src="logo.png" alt="logo.png"><img src="texture.png" alt="">');
  assert.equal(result.findings.filter((x) => x.rule === "image-alt").length, 1);
  assert.equal(result.findings.filter((x) => x.rule === "filename-alt").length, 1);
  assert.match(result.report, /assistive technology/);
  assert.match(result.report, /decorative/);
});

test("flags invalid roles, broken labelledby references, and duplicate IDs", () => {
  const result = auditAccessibilityMarkup("aria-checker", '<button role="pushbutton" aria-label="" aria-labelledby="missing" id="x"></button><p id="x"></p>');
  assert.deepEqual(new Set(result.findings.map((x) => x.rule)), new Set(["aria-valid-role", "aria-label", "aria-labelledby", "duplicate-id", "button-name"]));
});

test("flags controls lacking a label but accepts a matching explicit label", () => {
  const bad = auditAccessibilityMarkup("form-checker", '<label for="name">Name</label><input id="name"><input id="other">');
  assert.equal(bad.findings.filter((x) => x.rule === "label").length, 1);
  const good = auditAccessibilityMarkup("form-checker", '<label for="name">Name</label><input id="name">');
  assert.equal(good.findings.length, 0);
  const wrapped = auditAccessibilityMarkup("form-checker", '<label>Email <input type="email"></label>');
  assert.equal(wrapped.findings.filter((x) => x.rule === "label").length, 0);
  const button = auditAccessibilityMarkup("form-checker", '<button type="submit">Save</button><button type="button"></button>');
  assert.equal(button.findings.filter((x) => x.rule === "button-name").length, 1);
});

test("flags positive tabindex, click-only custom elements, and motion without reduced mode", () => {
  const keyboard = auditAccessibilityMarkup("keyboard-navigation-checker", '<div tabindex="3">First</div><div tabindex="0" onclick="go()">Focusable but click-only</div><div onclick="go()">Open</div>');
  assert.ok(keyboard.findings.some((x) => x.rule === "tabindex"));
  assert.ok(keyboard.findings.some((x) => x.rule === "keyboard-operable"));
  const motion = auditAccessibilityMarkup("motion-checker", '.card { animation: spin 2s infinite; } @keyframes spin {}');
  assert.ok(motion.findings.some((x) => x.rule === "reduced-motion"));
});

test("reports outline removal without a replacement and makes no conformance claim", () => {
  const result = auditAccessibilityMarkup("focus-state-checker", 'button:focus { outline: none; }');
  assert.ok(result.findings.some((x) => x.rule === "focus-not-hidden"));
  assert.match(result.report, /separate axe-core scan/);
});

test("handles empty input as a clean but explicitly limited static review", () => {
  const result = auditAccessibilityMarkup("aria-checker", "");
  assert.equal(result.inspected, 0);
  assert.match(result.report, /separate axe-core scan/);
});

test("ARIA studio catches prohibited generic naming and invalid state values", () => {
  const result = auditAccessibilityMarkup("aria-checker", '<div aria-label="Loading"></div><button aria-expanded="sometimes" aria-live="urgent">Open</button>');
  const rules = new Set(result.findings.map((finding) => finding.rule));
  assert.ok(rules.has("aria-prohibited-attr"));
  assert.ok(rules.has("aria-value-expanded"));
  assert.ok(rules.has("aria-value-live"));
});

test("ARIA value validation catches empty and invalid tokens", () => {
  const report = auditAccessibilityMarkup("aria-checker", '<button aria-invalid="" aria-expanded="yes" aria-live=""></button>');
  const rules = new Set(report.findings.map((finding) => finding.rule));
  assert.ok(rules.has("aria-value-invalid"));
  assert.ok(rules.has("aria-value-expanded"));
  assert.ok(rules.has("aria-value-live"));
});

test("form and keyboard studios catch stale references and custom button activation gaps", () => {
  const form = auditAccessibilityMarkup("form-checker", '<label for="missing">Name</label><input id="email" aria-invalid="true" aria-describedby="error-missing">');
  assert.ok(form.findings.some((finding) => finding.rule === "label-reference"));
  assert.ok(form.findings.some((finding) => finding.rule === "error-description-reference"));
  const keyboard = auditAccessibilityMarkup("keyboard-navigation-checker", '<div role="button" tabindex="0" onclick="save()">Save</div>');
  assert.ok(keyboard.findings.some((finding) => finding.rule === "custom-button-keyboard-activation"));
});

test("motion checker inspects the contents of reduced-motion rules instead of trusting their presence", () => {
  const result = auditAccessibilityMarkup("motion-checker", `
    html { scroll-behavior: smooth; }
    .ticker { animation: move 5s linear infinite; }
    @keyframes move { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
    @media (prefers-reduced-motion: reduce) { .other { color: inherit; } }
  `);
  const rules = new Set(result.findings.map((finding) => finding.rule));
  assert.ok(rules.has("reduced-motion-incomplete"));
  assert.ok(rules.has("smooth-scroll-not-reduced"));
  assert.ok(rules.has("auto-moving-content"));
  assert.ok(rules.has("loop-without-pause"));
});

test("motion checker catches rapid flashing, competing transforms, and JavaScript-driven motion", () => {
  const stressTest = `
    <style>
      html { scroll-behavior: smooth; }
      .orb { animation: spin 2s linear infinite, pulse 800ms ease-in-out infinite alternate; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes pulse { to { transform: scale(1.5); filter: hue-rotate(180deg); } }
      .ticker span { animation: ticker-scroll 5s linear infinite; }
      @keyframes ticker-scroll { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
      .flash { animation: flash 300ms infinite; }
      @keyframes flash { 0%,49% { background: red; } 50%,100% { background: black; } }
      @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; } }
    </style>
    <script>
      window.addEventListener("scroll", () => { document.querySelector(".orb").style.transform = 'rotate(' + window.scrollY + 'deg) scale(1.2)'; });
    </script>
  `;
  const result = auditAccessibilityMarkup("motion-checker", stressTest);
  const rules = new Set(result.findings.map((finding) => finding.rule));
  assert.ok(rules.has("rapid-contrast-flash"), result.report);
  assert.ok(rules.has("auto-moving-content"), result.report);
  assert.ok(rules.has("loop-without-pause"), result.report);
  assert.ok(rules.has("smooth-scroll-not-reduced"), result.report);
  assert.ok(rules.has("script-driven-motion"), result.report);
  assert.ok(rules.has("script-motion-not-preference-aware"), result.report);
  assert.ok(rules.has("competing-transform-animations"), result.report);
  assert.match(result.report, /not a measured WCAG flash test/);
});


test("portable reports include stable IDs, source evidence, related criteria, and explicit limits", () => {
  const snippet = [
    '<main>',
    '  <img src="hero.jpg">',
    '  <button id="primary-toggle" aria-expanded="sometimes">Open</button>',
    '</main>',
  ].join("\n");
  const first = auditAccessibilityMarkup("aria-checker", snippet);
  const second = auditAccessibilityMarkup("aria-checker", snippet);
  assert.ok(first.findings.length > 0);
  assert.ok(first.findings.every((finding) => finding.id?.startsWith("env-a11y:aria/")));
  assert.deepEqual(first.findings.map((finding) => finding.id), second.findings.map((finding) => finding.id));
  const badState = first.findings.find((finding) => finding.rule === "aria-value-expanded");
  assert.equal(badState?.line, 3);
  assert.match(badState?.evidence ?? "", /aria-expanded/);
  assert.ok((badState?.relatedCriteria ?? []).includes("4.1.2 Name, Role, Value"));
  assert.match(first.report, /not a conformance verdict/);

  const json = JSON.parse(formatAccessibilityAuditJson(first)) as { schemaVersion: number; findings: Array<{ id: string }>; limitations: string[] };
  assert.equal(json.schemaVersion, 1);
  assert.equal(json.findings.length, first.findings.length);
  assert.ok(json.limitations.some((line) => line.includes("not a WCAG conformance verdict")));

  const csv = formatAccessibilityAuditCsv(first);
  assert.match(csv, /"id","severity","rule","element","line"/);
  assert.match(csv, /aria-value-expanded/);
  assert.match(csv, /4\.1\.2 Name, Role, Value/);
});

test("CSV escaping protects commas, quotes, and line breaks in evidence fields", () => {
  const result = auditAccessibilityMarkup("aria-checker", '<div aria-label=""></div>');
  const csv = formatAccessibilityAuditCsv(result);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /aria-label=\"\"/);
  assert.match(csv, /""""/);
});


test("CSV report neutralizes spreadsheet-formula-leading evidence", () => {
  const result = auditAccessibilityMarkup("aria-checker", '<div aria-label=""></div>');
  const csv = formatAccessibilityAuditCsv({
    ...result,
    findings: result.findings.map((finding) => ({ ...finding, evidence: "=HYPERLINK(\"https://example.invalid\")" })),
  });
  assert.match(csv, /'=HYPERLINK/);
});


test("ARIA Studio detects unnamed buttons, links, and custom controls without flagging common named patterns", () => {
  const bad = auditAccessibilityMarkup("aria-checker", [
    '<button id="empty-button"></button>',
    '<a id="empty-link" href="/help"></a>',
    '<div id="custom-switch" role="switch" tabindex="0"></div>',
  ].join("\n"));
  const badRules = new Set(bad.findings.map((finding) => finding.rule));
  assert.ok(badRules.has("button-name"));
  assert.ok(badRules.has("link-name"));
  assert.ok(badRules.has("custom-control-name"));
  assert.equal(bad.findings.filter((finding) => ["button-name", "link-name", "custom-control-name"].includes(finding.rule)).length, 3);
  assert.ok(bad.findings.some((finding) => finding.id === "env-a11y:aria/button-name/button#empty-button"));
  assert.ok(bad.findings.some((finding) => finding.id === "env-a11y:aria/link-name/a#empty-link"));
  assert.ok(bad.findings.some((finding) => finding.id === "env-a11y:aria/custom-control-name/div#custom-switch"));

  const good = auditAccessibilityMarkup("aria-checker", [
    '<button id="save">Save changes</button>',
    '<a href="/help">Help center</a>',
    '<div role="switch" aria-label="Dark mode" tabindex="0"></div>',
    '<button><img src="save.svg" alt="Save"></button>',
    '<input type="submit" value="Submit form">',
  ].join("\n"));
  assert.equal(good.findings.filter((finding) => ["button-name", "link-name", "custom-control-name"].includes(finding.rule)).length, 0, good.report);

  const emptyReference = auditAccessibilityMarkup("aria-checker", '<span id="empty-label"></span><button aria-labelledby="empty-label"></button>');
  assert.ok(emptyReference.findings.some((finding) => finding.rule === "button-name"), emptyReference.report);
  const validReference = auditAccessibilityMarkup("aria-checker", '<span id="label">Launch search</span><button aria-labelledby="label"></button>');
  assert.ok(!validReference.findings.some((finding) => finding.rule === "button-name"), validReference.report);
});


test("keyboard studio flags explicitly undersized interactive targets as review leads", () => {
  const inline = auditAccessibilityMarkup("keyboard-navigation-checker", '<button id="tiny" style="width: 18px; height: 20px">X</button>');
  assert.ok(inline.findings.some((finding) => finding.rule === "target-size-risk"));
  const css = auditAccessibilityMarkup("keyboard-navigation-checker", '<style>.icon-button { inline-size: 20px; min-block-size: 32px; }</style><button class="icon-button">Open</button>');
  assert.ok(css.findings.some((finding) => finding.rule === "target-size-risk"), css.report);
  assert.ok(css.findings.find((finding) => finding.rule === "target-size-risk")?.relatedCriteria?.includes("2.5.8 Target Size (Minimum)"));
  const sufficientlySized = auditAccessibilityMarkup("keyboard-navigation-checker", '<style>button { min-width: 24px; min-height: 24px; width: 18px; height: 20px; }</style><button>Open</button>');
  assert.ok(!sufficientlySized.findings.some((finding) => finding.rule === "target-size-risk"), sufficientlySized.report);
});


test("ARIA studio reviews document language, page title, and heading hierarchy when given a full document", () => {
  const bad = auditAccessibilityMarkup("aria-checker", '<html><head></head><body><h1>Page</h1><h3>Skipped level</h3></body></html>');
  assert.ok(bad.findings.some((finding) => finding.rule === "document-language"), bad.report);
  assert.ok(bad.findings.some((finding) => finding.rule === "document-title"), bad.report);
  assert.ok(bad.findings.some((finding) => finding.rule === "heading-order"), bad.report);
  assert.ok(bad.findings.find((finding) => finding.rule === "document-language")?.relatedCriteria?.includes("3.1.1 Language of Page"));

  const good = auditAccessibilityMarkup("aria-checker", '<html lang="en"><head><title>Account settings</title></head><body><h1>Settings</h1><h2>Profile</h2></body></html>');
  assert.ok(!good.findings.some((finding) => ["document-language", "document-title", "heading-order"].includes(finding.rule)), good.report);

  // Fragments are not falsely treated as full documents.
  const fragment = auditAccessibilityMarkup("aria-checker", '<button>Save</button><h2>Details</h2>');
  assert.ok(!fragment.findings.some((finding) => ["document-language", "document-title"].includes(finding.rule)), fragment.report);
});
