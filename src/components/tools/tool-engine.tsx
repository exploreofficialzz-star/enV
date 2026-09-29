import type { ToolMeta } from "@/types/tool";
import { CalculatorEngine } from "@/components/engines/calculator-engine";
import { ConverterEngine } from "@/components/engines/converter-engine";
import { ColorEngine } from "@/components/engines/color-engine";
import { CssGenEngine } from "@/components/engines/cssgen-engine";
import { ImageEngine } from "@/components/engines/image-engine";
import { MockupEngine, PostEngine, DeviceEngine } from "@/components/engines/mockup-engine";
import { QrEngine, BarcodeEngine } from "@/components/engines/qr-engine";
import { TextEngine, CodecEngine, GeneratorEngine, DateTimeEngine, SeoEngine } from "@/components/engines/io-engines";
import { ComingSoonPanel } from "@/components/tools/coming-soon";
import { DocumentEngine } from "@/components/engines/document-engine";
import { FileConverterEngine } from "@/components/engines/file-converter-engine";
import { DeveloperEngine } from "@/components/engines/developer-engine";
import { PdfEngine } from "@/components/engines/pdf-engine";
import { MimeEngine } from "@/components/engines/mime-engine";
import { SecurityEngine } from "@/components/engines/security-engine";
import { ProductivityEngine } from "@/components/engines/productivity-engine";
import { PersonalEngine } from "@/components/engines/personal-engine";
import { CommunicationEngine } from "@/components/engines/communication-engine";
import { StreamingEngine } from "@/components/engines/streaming-engine";
import { MarketingEngine } from "@/components/engines/marketing-engine";
import { AccessibilityEngine } from "@/components/engines/accessibility-engine";
import { CreatorEngine } from "@/components/engines/creator-engine";
import { BusinessEngine } from "@/components/engines/business-engine";
import { AudioEngine } from "@/components/engines/audio-engine";
import { NetworkEngine } from "@/components/engines/network-engine";
import { AiEngine } from "@/components/engines/ai-engine";
import { VideoEngine } from "@/components/engines/video-engine";
import { UrlMediaEngine } from "@/components/engines/url-media-engine";
import { UrlMediaInfoEngine } from "@/components/engines/url-media-info-engine";
import { WebDesignEngine } from "@/components/engines/webdesign-engine";
import { EcommerceEngine } from "@/components/engines/ecommerce-engine";
import { CareerEngine } from "@/components/engines/career-engine";
import { RelationshipEngine } from "@/components/engines/relationship-engine";
import { InteractiveEngine } from "@/components/engines/interactive-engine";
import { GamingEngine } from "@/components/engines/gaming-engine";
import { ScreenshotEngine } from "@/components/engines/screenshot-engine";
import { MockupsCategoryEngine } from "@/components/engines/mockups-category-engine";
import { SocialEngine } from "@/components/engines/social-engine";
import { PlannedLocalEngine } from "@/components/engines/planned-local-engine";
import { TranscriptionEngine } from "@/components/engines/transcription-engine";
import { ImageToolsEngine } from "@/components/engines/image-tools-engine";

export function ToolEngine({ tool }: { tool: ToolMeta }) {
  // Mockups are backed by the shared mockup engine, including catalog entries that
  // were previously marked planned. The catalog remains the compatibility index.
  if (tool.category === "mockups") return <MockupsCategoryEngine toolId={tool.id} />;
  if (tool.status === "planned") return <ComingSoonPanel tool={tool} />;

  switch (tool.engine.type) {
    case "calculator":
      return <CalculatorEngine formula={tool.engine.formula} toolId={tool.id} />;
    case "converter":
      return <ConverterEngine system={tool.engine.system} mode={tool.engine.mode} />;
    case "text":
      return <TextEngine op={tool.engine.op} />;
    case "generator":
      return <GeneratorEngine op={tool.engine.op} />;
    case "codec":
      return <CodecEngine op={tool.engine.op} />;
    case "color":
      return <ColorEngine op={tool.engine.op} />;
    case "qr":
      return <QrEngine preset={tool.engine.preset} />;
    case "barcode":
      return <BarcodeEngine format={tool.engine.format} />;
    case "image":
      return <ImageEngine op={tool.engine.op} />;
    case "cssgen":
      return <CssGenEngine op={tool.engine.op} />;
    case "mockup":
      return <MockupEngine variant={tool.engine.variant} />;
    case "post":
      return <PostEngine variant={tool.engine.variant} />;
    case "device":
      return <DeviceEngine variant={tool.engine.variant} />;
    case "datetime":
      return <DateTimeEngine op={tool.engine.op} />;
    case "seo":
      return <SeoEngine op={tool.engine.op} />;
    case "file-converter":
      return <FileConverterEngine op={tool.engine.op} />;
    case "developer":
      return <DeveloperEngine op={tool.engine.op} />;
    case "pdf":
      return <PdfEngine op={tool.engine.op} />;
    case "mime":
      return <MimeEngine op={tool.engine.op} />;
    case "security":
      return <SecurityEngine op={tool.engine.op} />;
    case "creator":
      return <CreatorEngine op={tool.engine.op} />;
    case "business":
      return <BusinessEngine tool={tool} />;
    case "audio":
      return <AudioEngine op={tool.engine.op} toolId={tool.id} />;
    case "network":
      return <NetworkEngine op={tool.engine.op} />;
    case "ai":
      return <AiEngine op={tool.engine.op} />;
    case "video":
      return <VideoEngine op={tool.engine.op} />;
    case "url-media":
      return <UrlMediaEngine provider={tool.engine.provider} />;
    case "url-media-info":
      return <UrlMediaInfoEngine provider={tool.engine.provider} />;
    case "custom":
      if (["image-comparison", "image-screenshot", "image-print-layout"].includes(tool.engine.id)) return <ImageToolsEngine op={tool.engine.id} />;
      if (tool.engine.id === "transcription") {
        const format = tool.id.endsWith("-subtitles") ? "srt" : "txt";
        return <TranscriptionEngine mode={tool.category === "audio" ? "audio" : "video"} format={format} />;
      }
      if (tool.category === "productivity") return <ProductivityEngine op={tool.engine.id} />;
      if (tool.category === "personal") return <PersonalEngine toolId={tool.id} />;
      if (tool.category === "communication") return <CommunicationEngine toolId={tool.id} />;
      if (tool.category === "streaming") return <StreamingEngine toolId={tool.id} />;
      if (tool.category === "marketing") return <MarketingEngine toolId={tool.id} />;
      if (tool.category === "accessibility") return <AccessibilityEngine toolId={tool.id} />;
      if (tool.category === "webdesign") return <WebDesignEngine toolId={tool.id} />;
      if (tool.category === "ecommerce") return <EcommerceEngine toolId={tool.id} />;
      if (tool.category === "career") return <CareerEngine toolId={tool.id} />;
      if (tool.category === "relationships") return <RelationshipEngine toolId={tool.id} />;
      if (tool.category === "interactive") return <InteractiveEngine toolId={tool.id} />;
      if (tool.category === "gaming") return <GamingEngine toolId={tool.id} />;
      if (tool.category === "screenshots") return <ScreenshotEngine toolId={tool.id} />;
      if (tool.category === "social") return <SocialEngine toolId={tool.id} />;
      if (["events","celebrations","food","travel","photography","video"].includes(tool.category) && tool.engine.id.startsWith("planned-local:")) return <PlannedLocalEngine toolId={tool.id} />;
      return <ComingSoonPanel tool={tool} />;
    case "document":
      return <DocumentEngine op={tool.engine.op} />;
    default:
      return <ComingSoonPanel tool={tool} />;
  }
}
