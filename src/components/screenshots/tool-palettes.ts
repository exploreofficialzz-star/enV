import type { AnnotationKind } from "@/lib/screenshots/annotations";

export const ANNOTATE_TOOLS: { kind: AnnotationKind; label: string }[] = [
  { kind: "arrow", label: "Arrow" }, { kind: "line", label: "Line" }, { kind: "rect", label: "Box" }, { kind: "ellipse", label: "Oval" }, { kind: "pen", label: "Pen" }, { kind: "highlighter", label: "Marker" },
  { kind: "text", label: "Text" }, { kind: "step", label: "Step" }, { kind: "callout", label: "Callout" }, { kind: "spotlight", label: "Spotlight" }, { kind: "measure", label: "Measure" },
];
export const REDACT_TOOLS: { kind: AnnotationKind; label: string }[] = [{ kind: "redact", label: "Solid" }, { kind: "blur", label: "Blur" }, { kind: "pixelate", label: "Pixelate" }];

export const PALETTE_LABELS: Partial<Record<AnnotationKind, string>> = Object.fromEntries([...ANNOTATE_TOOLS, ...REDACT_TOOLS].map((t) => [t.kind, t.label]));
