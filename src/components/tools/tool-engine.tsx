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
import { FileConverterEngine } from "@/components/engines/file-converter-engine";
import { DeveloperEngine } from "@/components/engines/developer-engine";
import { PdfEngine } from "@/components/engines/pdf-engine";
import { MimeEngine } from "@/components/engines/mime-engine";
import { SecurityEngine } from "@/components/engines/security-engine";
import { ProductivityEngine } from "@/components/engines/productivity-engine";
import { CreatorEngine } from "@/components/engines/creator-engine";
import { BusinessEngine } from "@/components/engines/business-engine";
import { AudioEngine } from "@/components/engines/audio-engine";
import { NetworkEngine } from "@/components/engines/network-engine";
import { AiEngine } from "@/components/engines/ai-engine";

export function ToolEngine({ tool }: { tool: ToolMeta }) {
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
    case "custom":
      if (tool.category === "productivity") return <ProductivityEngine op={tool.engine.id} />;
      return <ComingSoonPanel tool={tool} />;
    case "document":
      return <ComingSoonPanel tool={tool} />;
    default:
      return <ComingSoonPanel tool={tool} />;
  }
}
