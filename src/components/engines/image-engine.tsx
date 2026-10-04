/**
 * Entry point for every Image tool. Tools in the Images category open on the new shared studios; tools from other
 * categories that reuse this component (PDF, social, screenshots…) keep the original engine untouched.
 */
import { ImageToolError } from "@/lib/image/canvas";
import { ErrorBanner } from "@/components/tools/error-banner";
import { LegacyImageEngine } from "./image-engine-legacy";
import { EffectStudio } from "./image/effect-studio";
import { ResizeStudio } from "./image/resize-studio";
import { CompressStudio } from "./image/compress-studio";
import { MetadataStudio } from "./image/metadata-studio";
import { PlatformStudio } from "./image/platform-studio";
import { CropStudio } from "./image/crop-studio";
import { FaviconStudio } from "./image/favicon-studio";
import { AnalysisStudio } from "./image/analysis-studio";
import { CalculatorStudio } from "./image/calculator-studio";
import { WatermarkStudio } from "./image/watermark-studio";
import { MaskStudio } from "./image/mask-studio";
import { ComposeStudio } from "./image/compose-studio";
import { AnnotateStudio } from "./image/annotate-studio";
import { studioKindFor } from "./image/tool-map";

type Studio = (props: { op: string; toolId: string }) => React.ReactNode;

/** op → studio. Ops not implemented yet fall back to the original engine (the audit lists them). */
export function studioFor(op: string): Studio | null {
  switch (studioKindFor(op)) {
    case "effect": return (p) => <EffectStudio key={p.op} {...p} />;
    case "resize": return (p) => <ResizeStudio key={p.op} {...p} />;
    case "compress": return (p) => <CompressStudio key={p.op} {...p} />;
    case "metadata": return (p) => <MetadataStudio key={p.op} {...p} />;
    case "platform": return (p) => <PlatformStudio key={p.op} {...p} />;
    case "crop": return (p) => <CropStudio key={p.op} {...p} />;
    case "favicon": return (p) => <FaviconStudio key={p.op} {...p} />;
    case "analysis": return (p) => <AnalysisStudio key={p.op} {...p} />;
    case "calc": return (p) => <CalculatorStudio key={p.op} {...p} />;
    case "watermark": return (p) => <WatermarkStudio key={p.op} {...p} />;
    case "mask": return (p) => <MaskStudio key={p.op} {...p} />;
    case "compose": return (p) => <ComposeStudio key={p.op} {...p} />;
    case "annotate": return (p) => <AnnotateStudio key={p.op} {...p} />;
    default: return null;
  }
}

export function ImageEngine({ op, category, toolId }: { op: string; category?: string; toolId?: string }) {
  const studio = category === "image" ? studioFor(op) : null;
  if (!studio) return <LegacyImageEngine op={op} />;
  try { return <>{studio({ op, toolId: toolId ?? op })}</>; }
  catch (e) { return <ErrorBanner message={e instanceof ImageToolError ? e.message : "This tool couldn't start."} />; }
}
