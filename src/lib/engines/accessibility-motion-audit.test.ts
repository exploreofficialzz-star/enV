import test from "node:test";
import assert from "node:assert/strict";
import { inspectMotionMarkup } from "./accessibility-motion-audit.ts";

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
    @media (prefers-reduced-motion: reduce) {
      * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
    }
  </style>
  <script>
    window.addEventListener("scroll", () => {
      document.querySelector(".orb").style.transform = 'rotate(' + window.scrollY + 'deg) scale(1.2)';
    });
  </script>
`;

test("finds several distinct motion risks in the stress-test snippet", () => {
  const findings = inspectMotionMarkup(stressTest);
  const rules = new Set(findings.map((finding) => finding.rule));
  for (const rule of [
    "rapid-contrast-flash",
    "auto-moving-content",
    "loop-without-pause",
    "smooth-scroll-not-reduced",
    "script-driven-motion",
    "script-motion-not-preference-aware",
    "competing-transform-animations",
  ]) {
    assert.ok(rules.has(rule), `Expected ${rule}; actual rules: ${[...rules].join(", ")}`);
  }
  assert.ok(findings.some((finding) => finding.severity === "serious" && finding.rule === "rapid-contrast-flash"));
  assert.match(findings.find((finding) => finding.rule === "rapid-contrast-flash")!.message, /not a measured WCAG flash test/);
});

test("does not treat an empty reduced-motion media query as sufficient coverage", () => {
  const findings = inspectMotionMarkup(`
    .ticker { animation: move 5s linear infinite; animation-play-state: running; }
    @keyframes move { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
    @media (prefers-reduced-motion: reduce) { .other { color: inherit; } }
  `);
  const rules = new Set(findings.map((finding) => finding.rule));
  assert.ok(rules.has("reduced-motion-incomplete"));
  assert.ok(rules.has("auto-moving-content"));
  assert.ok(rules.has("loop-without-pause"));
});

test("recognizes hex-based flash candidates and separate infinite iteration declarations", () => {
  const findings = inspectMotionMarkup(`
    .flash { animation-name: flash; animation-duration: 300ms; animation-iteration-count: infinite; }
    @keyframes flash { 0% { background-color: #ff0000; } 50% { background-color: #000000; } 100% { background-color: #ff0000; } }
  `);
  const rules = new Set(findings.map((finding) => finding.rule));
  assert.ok(rules.has("rapid-contrast-flash"));
  assert.ok(rules.has("loop-without-pause"));
});

test("reports missing reduced-motion support when no preference query exists", () => {
  const findings = inspectMotionMarkup(".card { animation: pulse 1s infinite; } @keyframes pulse { to { transform: scale(1.1); } }");
  assert.ok(findings.some((finding) => finding.rule === "reduced-motion" && finding.severity === "serious"));
});
