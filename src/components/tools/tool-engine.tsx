import type { ToolMeta } from "@/types/tool";
import { lazy, Suspense, useEffect, useState } from "react";
import { isOfflineLocalTool } from "@/lib/offline/capabilities";
import { prepareOfflineToolPackage, completeOfflineToolPackage, endOfflineToolPackage } from "@/lib/offline/tool-package-client";
const CalculatorEngine = lazy(() => import("@/components/engines/calculator-engine").then((m) => ({ default: m.CalculatorEngine })));
const ConverterEngine = lazy(() => import("@/components/engines/converter-engine").then((m) => ({ default: m.ConverterEngine })));
const ColorEngine = lazy(() => import("@/components/engines/color-engine").then((m) => ({ default: m.ColorEngine })));
const CssGenEngine = lazy(() => import("@/components/engines/cssgen-engine").then((m) => ({ default: m.CssGenEngine })));
const ImageEngine = lazy(() => import("@/components/engines/image-engine").then((m) => ({ default: m.ImageEngine })));
const MockupEngine = lazy(() => import("@/components/engines/mockup-engine").then((m) => ({ default: m.MockupEngine })));
const PostEngine = lazy(() => import("@/components/engines/mockup-engine").then((m) => ({ default: m.PostEngine })));
const QrEngine = lazy(() => import("@/components/engines/qr-engine").then((m) => ({ default: m.QrEngine })));
const BarcodeEngine = lazy(() => import("@/components/engines/qr-engine").then((m) => ({ default: m.BarcodeEngine })));
const BarcodeReaderEngine = lazy(() => import("@/components/engines/barcode-reader-engine").then((m) => ({ default: m.BarcodeReaderEngine })));
const TextEngine = lazy(() => import("@/components/engines/io-engines").then((m) => ({ default: m.TextEngine })));
const CodecEngine = lazy(() => import("@/components/engines/io-engines").then((m) => ({ default: m.CodecEngine })));
const GeneratorEngine = lazy(() => import("@/components/engines/io-engines").then((m) => ({ default: m.GeneratorEngine })));
const DateTimeEngine = lazy(() => import("@/components/engines/io-engines").then((m) => ({ default: m.DateTimeEngine })));
const SeoEngine = lazy(() => import("@/components/engines/io-engines").then((m) => ({ default: m.SeoEngine })));
import { ComingSoonPanel } from "@/components/tools/coming-soon";
const DocumentEngine = lazy(() => import("@/components/engines/document-engine").then((m) => ({ default: m.DocumentEngine })));
const FileConverterEngine = lazy(() => import("@/components/engines/file-converter-engine").then((m) => ({ default: m.FileConverterEngine })));
const DeveloperEngine = lazy(() => import("@/components/engines/developer-engine").then((m) => ({ default: m.DeveloperEngine })));
const DeveloperStudioEngine = lazy(() => import("@/components/engines/developer-studio-engine").then((m) => ({ default: m.DeveloperStudioEngine })));
const UxUiStudioEngine = lazy(() => import("@/components/engines/ux-ui-studio-engine").then((m) => ({ default: m.UxUiStudioEngine })));
const PdfEngine = lazy(() => import("@/components/engines/pdf-engine").then((m) => ({ default: m.PdfEngine })));
const MimeEngine = lazy(() => import("@/components/engines/mime-engine").then((m) => ({ default: m.MimeEngine })));
const SecurityEngine = lazy(() => import("@/components/engines/security-engine").then((m) => ({ default: m.SecurityEngine })));
const ProductivityEngine = lazy(() => import("@/components/engines/productivity-engine").then((m) => ({ default: m.ProductivityEngine })));
const PersonalEngine = lazy(() => import("@/components/engines/personal-engine").then((m) => ({ default: m.PersonalEngine })));
const CommunicationEngine = lazy(() => import("@/components/engines/communication-engine").then((m) => ({ default: m.CommunicationEngine })));
const StreamingEngine = lazy(() => import("@/components/engines/streaming-engine").then((m) => ({ default: m.StreamingEngine })));
const MarketingEngine = lazy(() => import("@/components/engines/marketing-engine").then((m) => ({ default: m.MarketingEngine })));
const AccessibilityEngine = lazy(() => import("@/components/engines/accessibility-engine").then((m) => ({ default: m.AccessibilityEngine })));
const CreatorEngine = lazy(() => import("@/components/engines/creator-engine").then((m) => ({ default: m.CreatorEngine })));
const BusinessEngine = lazy(() => import("@/components/engines/business-engine").then((m) => ({ default: m.BusinessEngine })));
const AudioEngine = lazy(() => import("@/components/engines/audio-engine").then((m) => ({ default: m.AudioEngine })));
const NetworkEngine = lazy(() => import("@/components/engines/network-engine").then((m) => ({ default: m.NetworkEngine })));
const AiEngine = lazy(() => import("@/components/engines/ai-engine").then((m) => ({ default: m.AiEngine })));
const VideoEngine = lazy(() => import("@/components/engines/video-engine").then((m) => ({ default: m.VideoEngine })));
const UrlMediaEngine = lazy(() => import("@/components/engines/url-media-engine").then((m) => ({ default: m.UrlMediaEngine })));
const UrlMediaInfoEngine = lazy(() => import("@/components/engines/url-media-info-engine").then((m) => ({ default: m.UrlMediaInfoEngine })));
const WebDesignEngine = lazy(() => import("@/components/engines/webdesign-engine").then((m) => ({ default: m.WebDesignEngine })));
const EcommerceEngine = lazy(() => import("@/components/engines/ecommerce-engine").then((m) => ({ default: m.EcommerceEngine })));
const CareerEngine = lazy(() => import("@/components/engines/career-engine").then((m) => ({ default: m.CareerEngine })));
const RelationshipEngine = lazy(() => import("@/components/engines/relationship-engine").then((m) => ({ default: m.RelationshipEngine })));
const InteractiveEngine = lazy(() => import("@/components/engines/interactive-engine").then((m) => ({ default: m.InteractiveEngine })));
const GamingEngine = lazy(() => import("@/components/engines/gaming-engine").then((m) => ({ default: m.GamingEngine })));
const ScreenshotEngine = lazy(() => import("@/components/engines/screenshot-engine").then((m) => ({ default: m.ScreenshotEngine })));
const MockupsCategoryEngine = lazy(() => import("@/components/engines/mockups-category-engine").then((m) => ({ default: m.MockupsCategoryEngine })));
const SocialEngine = lazy(() => import("@/components/engines/social-engine").then((m) => ({ default: m.SocialEngine })));
const PlannedLocalEngine = lazy(() => import("@/components/engines/planned-local-engine").then((m) => ({ default: m.PlannedLocalEngine })));
const TranscriptionEngine = lazy(() => import("@/components/engines/transcription-engine").then((m) => ({ default: m.TranscriptionEngine })));
const ImageToolsEngine = lazy(() => import("@/components/engines/image-tools-engine").then((m) => ({ default: m.ImageToolsEngine })));
const DocumentToolsEngine = lazy(() => import("@/components/engines/document-tools-engine").then((m) => ({ default: m.DocumentToolsEngine })));
const BackendToolEngine = lazy(() => import("@/components/engines/backend-tool-engine").then((m) => ({ default: m.BackendToolEngine })));
const EventTemplateEngine = lazy(() => import("@/components/engines/event-template-engine").then((m) => ({ default: m.EventTemplateEngine })));
const ABookEngine = lazy(() => import("@/components/engines/a-book-engine").then((m) => ({ default: m.ABookEngine })));
const MusicDownloaderEngine = lazy(() => import("@/components/engines/music-downloader-engine").then((m) => ({ default: m.MusicDownloaderEngine })));
const AiMusicDataSandbox = lazy(() => import("@/components/engines/ai-music-data-sandbox").then((m) => ({ default: m.AiMusicDataSandbox })));
const ZipArchiveEngine = lazy(() => import("@/components/engines/zip-archive-engine").then((m) => ({ default: m.ZipArchiveEngine })));
const CameraStudioEngine = lazy(() => import("@/components/engines/camera-studio-engine").then((m) => ({ default: m.CameraStudioEngine })));
import { isEventTemplateTool } from "@/lib/events/event-templates";
import { developerActionForLegacySlug, developerModeForLegacySlug, developerStudioForLegacySlug } from "@/lib/developer-studios-catalog";

type ToolEngineProps = { tool: ToolMeta; initialMode?: string; initialAction?: "encode" | "decode"; initialOp?: string };

function ToolEngineView({ tool, initialMode, initialAction, initialOp }: ToolEngineProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.envToolHydrated = tool.id;
    return () => {
      if (root.dataset.envToolHydrated === tool.id) delete root.dataset.envToolHydrated;
    };
  }, [tool.id]);

  // Mockups are backed by the shared mockup engine, including catalog entries that
  // were previously marked planned. The catalog remains the compatibility index.
  if (tool.id === "camera-studio") return <CameraStudioEngine />;
  if (tool.category === "mockups") return <MockupsCategoryEngine toolId={tool.id} />;
  // Every Screenshot-category tool is rendered by the shared screenshot studio.
  if (tool.category === "screenshots") return <ScreenshotEngine toolId={tool.id} />;
  if (tool.category === "events" && isEventTemplateTool(tool.id)) return <EventTemplateEngine toolId={tool.id} />;
  if (tool.id === "a-book") return <ABookEngine />;
  if (tool.id === "zip-any-file") return <ZipArchiveEngine />;
  if (tool.id === "music-downloader") return <MusicDownloaderEngine />;
  if (tool.id === "song-metadata-analyzer") return <AiMusicDataSandbox />;
  // The reader extends the existing payload inspector route with real QR and barcode decoding.
  if (tool.id === "qr-payload-inspector") return <BarcodeReaderEngine />;
  // The E-commerce family is implemented by its shared local workflow engine.
  if (tool.category === "ecommerce") return <EcommerceEngine toolId={tool.id} />;
  if (tool.status === "planned") return <ComingSoonPanel tool={tool} />;
  if (tool.requiresBackend && tool.engine.type === "custom") return <BackendToolEngine toolId={tool.id} category={tool.category} />;
  // Accessibility Studios must override legacy per-tool engine metadata (for example,
  // contrast-checker was historically a generic color tool).
  if (tool.category === "accessibility") return <AccessibilityEngine toolId={tool.id} />;
  if (tool.category === "developer" && tool.tags.includes("developer-studio")) return tool.slug === "ux-ui-studio" ? <UxUiStudioEngine /> : <DeveloperStudioEngine tool={tool} initialMode={initialMode} initialAction={initialAction} initialOp={initialOp} />;
  if (tool.category === "audio" && ["audio-bitrate-calculator", "audio-file-size-calculator"].includes(tool.id)) return <AudioEngine op={tool.id} toolId={tool.id} initialMode={initialMode} />;

  switch (tool.engine.type) {
    case "calculator":
      return <CalculatorEngine formula={tool.engine.formula} toolId={tool.id} deviceMode={tool.category === "creators"} />;
    case "converter":
      return <ConverterEngine system={tool.engine.system} mode={tool.engine.mode} />;
    case "text":
      return <TextEngine op={tool.engine.op} />;
    case "generator":
      return <GeneratorEngine op={tool.engine.op} deviceMode={tool.category === "creators"} />;
    case "codec":
      return <CodecEngine op={tool.engine.op} />;
    case "color":
      return <ColorEngine op={tool.engine.op} toolId={tool.id} />;
    case "qr":
      return <QrEngine preset={tool.engine.preset} toolId={tool.id} />;
    case "barcode":
      return <BarcodeEngine format={tool.engine.format} toolId={tool.id} />;
    case "image":
      return <ImageEngine op={tool.engine.op} category={tool.category} toolId={tool.id} />;
    case "cssgen":
      return <CssGenEngine op={tool.engine.op} toolId={tool.id} />;
    case "mockup":
      return <MockupEngine variant={tool.engine.variant} />;
    case "post":
      return <PostEngine variant={tool.engine.variant} />;
    case "datetime":
      return <DateTimeEngine op={tool.engine.op} />;
    case "seo":
      return <SeoEngine op={tool.engine.op} />;
    case "file-converter":
      return <FileConverterEngine op={tool.engine.op} toolId={tool.id} />;
    case "developer":
      return <DeveloperEngine op={tool.engine.op} tool={tool} />;
    case "pdf":
      return <PdfEngine op={tool.engine.op} />;
    case "mime":
      return <MimeEngine op={tool.engine.op} />;
    case "security":
      return <SecurityEngine op={tool.engine.op} />;
    case "creator":
      return <CreatorEngine op={tool.engine.op} />;
    case "business":
      return <BusinessEngine tool={tool} initialMode={initialMode} />;
    case "audio":
      return <AudioEngine op={tool.engine.op} toolId={tool.id} initialMode={initialMode} />;
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
      if (tool.category === "webdesign") return <WebDesignEngine toolId={tool.id} />;
      if (tool.category === "career") return <CareerEngine toolId={tool.id} />;
      if (tool.category === "relationships") return <RelationshipEngine toolId={tool.id} />;
      if (tool.category === "interactive") return <InteractiveEngine toolId={tool.id} />;
      if (tool.category === "gaming") return <GamingEngine toolId={tool.id} />;
      if (tool.category === "social") return <SocialEngine toolId={tool.id} />;
      if (["events","celebrations","food","travel","photography"].includes(tool.category)) return <PlannedLocalEngine toolId={tool.id} />;
      return <ComingSoonPanel tool={tool} />;
    case "document":
      return <DocumentEngine op={tool.engine.op} />;
    case "document-backend":
      return <DocumentToolsEngine op={tool.engine.op} />;
    default:
      return <ComingSoonPanel tool={tool} />;
  }
}


/** Compatibility entry-point banner for Developer records whose original engine is
 * codec/text/generator/MIME/date-time rather than the generic Developer dispatcher.
 * Those original pages keep their working native engine and gain a mode-correct route
 * to the consolidated parent Studio. */
function LegacyDeveloperStudioLink({ tool }: { tool: ToolMeta }) {
  const studio = developerStudioForLegacySlug(tool.slug);
  const mode = developerModeForLegacySlug(studio, tool.slug);
  const action = developerActionForLegacySlug(studio, tool.slug);
  const href = `/tools/developer/${studio.slug}?mode=${encodeURIComponent(mode)}${action === "decode" ? "&action=decode" : ""}`;
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-sm">
    <div><p className="font-medium">Part of {studio.name}</p><p className="mt-0.5 text-xs text-muted">Keep this original tool available, or open the grouped Studio for related modes.</p></div>
    <a href={href} className="inline-flex min-h-9 items-center rounded-md border border-border px-3 py-2 font-medium hover:bg-surface-2">Open Studio · {mode}</a>
  </div>;
}

function OfflinePackageReadySignal({ toolId }: { toolId: string }) {
  useEffect(() => {
    void (async () => {
      const additionalAssets: string[] = [];
      if (toolId === "a-book") {
        const pdfWorker = await import("@/lib/a-book/pdf-worker-client");
        additionalAssets.push(await pdfWorker.warmABookPdfWorker());
      }
      await completeOfflineToolPackage(toolId, additionalAssets);
    })().catch(() => undefined);
  }, [toolId]);
  return null;
}

function ToolEngineContent(props: ToolEngineProps & { completePackage: boolean }) {
  return (
    <Suspense fallback={null}>
      <ToolEngineView {...props} />
      {props.completePackage ? <OfflinePackageReadySignal toolId={props.tool.id} /> : null}
    </Suspense>
  );
}

export function ToolEngine(props: ToolEngineProps) {
  const { tool } = props;
  const [completePackage, setCompletePackage] = useState(false);
  const offlineEligible = isOfflineLocalTool(tool.id);
  const needsStudioLink = tool.category === "developer" && tool.engine.type !== "developer" && !tool.tags.includes("developer-studio");

  useEffect(() => {
    let active = true;
    let packageSessionStarted = false;
    setCompletePackage(false);
    if (!offlineEligible) return () => { active = false; };

    // Offline caching runs in the background and never gates tool access.
    void prepareOfflineToolPackage({
      toolId: tool.id,
      pathname: window.location.pathname,
      offlineEligible,
    }).then((result) => {
      packageSessionStarted = result.status === "preparing" || result.status === "ready";
      if (!active) {
        if (packageSessionStarted) void endOfflineToolPackage();
        return;
      }
      setCompletePackage(result.status === "preparing");
    }).catch(() => undefined);

    return () => {
      active = false;
      if (packageSessionStarted) void endOfflineToolPackage();
    };
  }, [tool.id, offlineEligible]);

  const engine = <ToolEngineContent {...props} completePackage={completePackage} />;
  return needsStudioLink
    ? <div className="space-y-4"><LegacyDeveloperStudioLink tool={tool} />{engine}</div>
    : engine;
}
