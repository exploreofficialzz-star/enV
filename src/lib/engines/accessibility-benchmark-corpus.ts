/** Curated static-analysis benchmark. Findings are review leads, not conformance verdicts. */
export interface AccessibilityBenchmarkCase {
  id: string;
  category: string;
  input: string;
  expectedRule: string;
  rationale: string;
}

export const accessibilityBenchmarkCorpus: AccessibilityBenchmarkCase[] = [
  { id: "aria-empty-button", category: "aria-checker", input: '<button aria-label=""></button>', expectedRule: "button-name", rationale: "Empty name must not be treated as an accessible name." },
  { id: "aria-generic-label", category: "aria-checker", input: '<div aria-label="Loading"></div>', expectedRule: "aria-prohibited-attr", rationale: "A generic element cannot be named by aria-label without a suitable role." },
  { id: "aria-stale-reference", category: "aria-checker", input: '<button aria-labelledby="missing">Go</button>', expectedRule: "aria-labelledby", rationale: "Reference does not resolve in the supplied source." },
  { id: "form-unlabelled", category: "form-checker", input: '<input id="email" type="email">', expectedRule: "label", rationale: "No detectable programmatic label is present." },
  { id: "keyboard-click-only", category: "keyboard-navigation-checker", input: '<div onclick="run()">Run</div>', expectedRule: "keyboard-operable", rationale: "Clickable non-native element has no detectable keyboard support." },
  { id: "focus-hidden", category: "focus-state-checker", input: 'button:focus { outline: none; }', expectedRule: "focus-not-hidden", rationale: "Focus styling is removed without a detectable replacement." },
  { id: "motion-no-reduce", category: "motion-checker", input: '.x { animation: spin 2s infinite; } @keyframes spin { to { transform: rotate(360deg); } }', expectedRule: "reduced-motion", rationale: "Animation has no detected reduced-motion handling." },
  { id: "motion-reduce-incomplete", category: "motion-checker", input: '.x { animation: spin 2s infinite; } @media (prefers-reduced-motion: reduce) { .x { color: red; } }', expectedRule: "reduced-motion-incomplete", rationale: "Preference block exists but does not mitigate the detected animation." },
  { id: "document-no-language", category: "aria-checker", input: '<html><head><title>Example</title></head><body>Hello</body></html>', expectedRule: "document-language", rationale: "Document root has no detectable language declaration." },
  { id: "document-heading-jump", category: "aria-checker", input: '<html lang="en"><head><title>Example</title></head><body><h1>Title</h1><h3>Section</h3></body></html>', expectedRule: "heading-order", rationale: "Heading-level jump requires contextual review." },
  { id: "target-size-small", category: "keyboard-navigation-checker", input: '<style>.tiny { width: 12px; height: 12px; }</style><button class="tiny">X</button>', expectedRule: "target-size-risk", rationale: "Explicit dimensions are below the WCAG 2.2 minimum target-size threshold; exceptions and spacing need review." },
  { id: "image-missing-alt", category: "alt-text-checker", input: '<img src="chart.png">', expectedRule: "image-alt", rationale: "Image has no detectable alt attribute." },
];
