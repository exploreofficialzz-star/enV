import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, Heart, Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { disclaimerText } from "@/lib/content";
import { recordAnalyticsEvent, recordToolExecutionResult } from "@/lib/analytics/client";
import { toolDocumentationPath } from "@/lib/tool-documentation";
import { getRelatedTools, toolPath } from "@/lib/registry";
import { applyViewMode, usePrefs } from "@/lib/storage";
import { CATEGORY_MAP } from "@/data/categories";
import type { ToolMeta } from "@/types/tool";
import { offlineAwareToolDescription } from "@/lib/offline/capabilities";
import { Button } from "@/components/ui/button";
import { ComingSoonBadge } from "@/components/tools/coming-soon";
import { ToolAppIcon } from "@/components/tools/tool-app-icon";
import { AiAssistPanel } from "@/components/ai/ai-assist-panel";
import { ToolCommunityPanel } from "@/components/tools/tool-community-panel";
import { AdSlot } from "@/components/tools/ad-slot";
import {
  AdsterraBanner,
  AdsterraNativeBanner,
  AdsterraResponsiveBanner,
  type AdsterraDeliveryState,
} from "@/components/ads/adsterra-ad";
import { isAdsterraQualifiedTool } from "@/lib/ads/policy";
import { ADSTERRA_CONSENT_STORAGE_KEY, getAdsterraConsent, openAdsterraSmartlinkFromOutput } from "@/lib/ads/adsterra";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { PublicCommunityFeed } from "@/lib/community/public-feed.functions";
import { ToolExecutionTelemetryContext, type ToolExecutionTelemetry, type ToolExecutionOutcome } from "@/components/tools/tool-execution-context";
import { UnderProductionDialog } from "@/components/tools/under-production";
import { isToolUnderProduction } from "@/lib/production-notice";
import "@/components/engines/creator-engine.css";

export function ToolShell({
  tool,
  children,
  initialCommunityFeed,
}: {
  tool: ToolMeta;
  children: React.ReactNode;
  initialCommunityFeed?: PublicCommunityFeed | null;
}) {
  const related = useMemo(() => getRelatedTools(tool, Number.MAX_SAFE_INTEGER), [tool]);
  const [visibleRelatedCount, setVisibleRelatedCount] = useState(6);
  const [productionTool, setProductionTool] = useState<ToolMeta | null>(null);
  const note = disclaimerText(tool);
  const adsterraQualified =
    import.meta.env.VITE_ADSTERRA_ENABLED === "true" && isAdsterraQualifiedTool(tool);
  const [adsterraConsent, setAdsterraConsentState] = useState(getAdsterraConsent);
  useEffect(() => {
    const syncAdsterraConsent = () => setAdsterraConsentState(getAdsterraConsent());
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === ADSTERRA_CONSENT_STORAGE_KEY) syncAdsterraConsent();
    };
    window.addEventListener("env:adsterra-consent-changed", syncAdsterraConsent);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener("env:adsterra-consent-changed", syncAdsterraConsent);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);
  const adsterraAdsEnabled = adsterraQualified && adsterraConsent === "granted";
  const { user: accessUser, isPending: accessUserPending } = useCurrentUserState();
  const [adDelivery, setAdDelivery] = useState<AdsterraDeliveryState>("blocked");
  const [fallbackAccess, setFallbackAccess] = useState<{
    unitSubunits: number;
    unitTokens: number;
    availableSubunits: number | null;
    availableTokens: number | null;
    billingEnabled: boolean;
  } | null>(null);
  const [fallbackQuoteLoading, setFallbackQuoteLoading] = useState(false);
  const [fallbackQuoteStatus, setFallbackQuoteStatus] = useState<"idle" | "loading" | "ready" | "unavailable" | "error">("idle");
  const [fallbackChargeLoading, setFallbackChargeLoading] = useState(false);
  const [fallbackPromptOpen, setFallbackPromptOpen] = useState(false);
  const [paidExecutionInFlight, setPaidExecutionInFlight] = useState(false);
  const authorizedExecutionRef = useRef(false);
  const pendingExecutionRef = useRef<HTMLElement | null>(null);
  const onAdDelivery = useCallback((state: AdsterraDeliveryState) => {
    setAdDelivery((current) => current === "filled" ? current : state);
    if (state === "filled") setFallbackPromptOpen(false);
  }, []);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const favorites = usePrefs((s) => s.favorites);
  const prefsHydrated = usePrefs((s) => s.hydrated);
  const recordRecent = usePrefs((s) => s.recordRecent);
  const storageError = usePrefs((s) => s.storageError);
  useEffect(() => {
    if (!adsterraQualified || !adsterraAdsEnabled) {
      setAdDelivery("blocked");
      return;
    }
    setAdDelivery("blocked");
    const timeout = window.setTimeout(() => {
      setAdDelivery((current) => current === "filled" ? current : "unfilled");
    }, 15_000);
    return () => window.clearTimeout(timeout);
  }, [tool.id, adsterraQualified, adsterraAdsEnabled]);

  useEffect(() => {
    if (!requiresTokenFallback || accessUserPending || !authenticatedAccount) {
      setFallbackAccess(null);
      setFallbackQuoteLoading(false);
      setFallbackQuoteStatus("idle");
      return;
    }
    const controller = new AbortController();
    setFallbackQuoteLoading(true);
    setFallbackQuoteStatus("loading");
    void fetch(`/api/billing/ad-fallback/access?toolId=${encodeURIComponent(tool.id)}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json() as {
        ok?: boolean;
        data?: {
          unitSubunits?: number;
          unitTokens?: number;
          availableSubunits?: number | null;
          availableTokens?: number | null;
          billingEnabled?: boolean;
        };
      };
      if (response.status === 404) {
        setFallbackAccess(null);
        setFallbackQuoteStatus("unavailable");
        return;
      }
      if (!response.ok || !payload.ok || !payload.data ||
          !Number.isSafeInteger(payload.data.unitSubunits) ||
          typeof payload.data.unitTokens !== "number") {
        throw new Error("AD_FALLBACK_QUOTE_UNAVAILABLE");
      }
      setFallbackAccess({
        unitSubunits: payload.data.unitSubunits!,
        unitTokens: payload.data.unitTokens,
        availableSubunits: payload.data.availableSubunits ?? null,
        availableTokens: payload.data.availableTokens ?? null,
        billingEnabled: payload.data.billingEnabled === true,
      });
      setFallbackQuoteStatus("ready");
    }).catch(() => {
      if (!controller.signal.aborted) {
        setFallbackAccess(null);
        setFallbackQuoteStatus("error");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setFallbackQuoteLoading(false);
    });
    return () => controller.abort();
  }, [tool.id, requiresTokenFallback, accessUserPending, authenticatedAccount]);

  async function chargeFallbackAndRun() {
    if (!fallbackAccess || !fallbackAccess.billingEnabled || fallbackChargeLoading || !pendingExecutionRef.current) return;
    setFallbackChargeLoading(true);
    try {
      const response = await fetch("/api/billing/ad-fallback/consume", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ toolId: tool.id, idempotencyKey: crypto.randomUUID() }),
      });
      const payload = await response.json() as {
        ok?: boolean;
        data?: { availableSubunits?: number; availableTokens?: number };
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.data) {
        if (response.status === 402 || payload.error === "INSUFFICIENT_CREDITS") {
          setFallbackAccess((current) => current ? { ...current, availableSubunits: 0, availableTokens: 0 } : current);
        }
        return;
      }
      authorizedExecutionRef.current = true;
      setPaidExecutionInFlight(true);
      setFallbackPromptOpen(false);
      setFallbackAccess((current) => current ? {
        ...current,
        availableSubunits: payload.data!.availableSubunits ?? null,
        availableTokens: payload.data!.availableTokens ?? null,
      } : current);
      const pending = pendingExecutionRef.current;
      pendingExecutionRef.current = null;
      window.setTimeout(() => {
        if (pending instanceof HTMLFormElement) pending.requestSubmit();
        else if (pending instanceof HTMLElement) pending.click();
      }, 0);
    } catch {
      // A failed charge never authorizes a local execution.
    } finally {
      setFallbackChargeLoading(false);
    }
  }

  const saved = favorites.includes(tool.id);
  const toolInterfaceRef = useRef<HTMLDivElement | null>(null);
  const toolStartedRef = useRef(false);
  const toolFinishedRef = useRef(false);
  const toolAbandonmentRecordedRef = useRef(false);
  const toolStartedAtRef = useRef<number | null>(null);
  const toolViewedAtRef = useRef(Date.now());
  const executionStartedAtRef = useRef<number | null>(null);
  const executionFinishedRef = useRef(false);
  const lastExecutionStartAtRef = useRef(0);

  const startToolExecution = (entryPoint: string) => {
    const startedAt = Date.now();
    // A submit button emits both click and submit events. Count that as one run.
    if (entryPoint === "form_submit" && startedAt - lastExecutionStartAtRef.current < 1000) return;
    lastExecutionStartAtRef.current = startedAt;
    executionStartedAtRef.current = startedAt;
    executionFinishedRef.current = false;
    toolStartedRef.current = true;
    toolFinishedRef.current = false;
    toolAbandonmentRecordedRef.current = false;
    toolStartedAtRef.current = startedAt;
    if (toolInterfaceRef.current) toolInterfaceRef.current.dataset.envToolStartedAt = String(startedAt);
    recordAnalyticsEvent({
      name: "tool_started",
      toolId: tool.id,
      outcome: "unknown",
      durationMs: Math.min(3600000, Math.max(0, startedAt - toolViewedAtRef.current)),
      properties: { entry_point: entryPoint },
    });
  };

  const executionTelemetry = useMemo<ToolExecutionTelemetry>(() => ({
    finish: (outcome: ToolExecutionOutcome, errorCode?: string) => {
      const startedAt = executionStartedAtRef.current;
      if (startedAt === null || executionFinishedRef.current) return;
      executionFinishedRef.current = true;
      recordToolExecutionResult(tool.id, outcome, Date.now() - startedAt, "shared_result", errorCode);
      if (requiresTokenFallback) {
        authorizedExecutionRef.current = false;
        setPaidExecutionInFlight(false);
      }
    },
  }), [tool.id, requiresTokenFallback]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const requiresTokenFallback = adsterraQualified && (adDelivery !== "filled" || isFullscreen);
  const authenticatedAccount = Boolean(accessUser && !accessUser.isDevFallback && !accessUserPending);
  const showAdFallbackGate = requiresTokenFallback && fallbackPromptOpen && !paidExecutionInFlight;
  const isMusicSandbox = ["song-metadata-analyzer", "audio-analyze-studio"].includes(tool.id);



  useEffect(() => {
    if (isFullscreen && isMusicSandbox) window.dispatchEvent(new Event("env-music-sandbox-fullscreen"));
  }, [isFullscreen, isMusicSandbox]);

  useEffect(() => {
    if (!isFullscreen || !isMusicSandbox) return;
    // A desktop/tablet preference can widen a phone's viewport meta tag. Restore
    // the real device viewport for this tool while leaving the preference alone.
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (viewport) viewport.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    return () => applyViewMode(usePrefs.getState().viewMode);
  }, [isFullscreen, isMusicSandbox]);

  useEffect(() => {
    recordRecent(tool.id);
    setVisibleRelatedCount(6);
    toolStartedRef.current = false;
    toolFinishedRef.current = false;
    toolAbandonmentRecordedRef.current = false;
    toolStartedAtRef.current = null;
    executionStartedAtRef.current = null;
    executionFinishedRef.current = false;
    lastExecutionStartAtRef.current = 0;
    toolViewedAtRef.current = Date.now();
  }, [tool.id, recordRecent]);

  useEffect(() => {
    const onExecutionResult = (event: Event) => {
      const detail = (event as CustomEvent<{ toolId?: string; outcome?: string }>).detail;
      if (detail?.toolId === tool.id && ["success", "failure", "cancelled"].includes(detail.outcome ?? "")) {
        toolFinishedRef.current = true;
        executionFinishedRef.current = true;
        if (requiresTokenFallback) {
          authorizedExecutionRef.current = false;
          setPaidExecutionInFlight(false);
          setFallbackPromptOpen(false);
        }
      }
    };
    const reportAbandoned = () => {
      if (!toolStartedRef.current || toolFinishedRef.current || toolAbandonmentRecordedRef.current) return;
      toolAbandonmentRecordedRef.current = true;
      const startedAt = toolStartedAtRef.current ?? toolViewedAtRef.current;
      recordAnalyticsEvent({
        name: "tool_abandoned",
        toolId: tool.id,
        outcome: "abandoned",
        durationMs: Math.min(3600000, Math.max(0, Date.now() - startedAt)),
        properties: { stage: "exit_without_recorded_result" },
      });
    };
    window.addEventListener("env-tool-execution-result", onExecutionResult);
    window.addEventListener("pagehide", reportAbandoned);
    return () => {
      reportAbandoned();
      window.removeEventListener("env-tool-execution-result", onExecutionResult);
      window.removeEventListener("pagehide", reportAbandoned);
    };
  }, [tool.id, requiresTokenFallback]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(isCssFullscreen || document.fullscreenElement === toolInterfaceRef.current);
    };
    const closeFallbackOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isCssFullscreen) {
        setIsCssFullscreen(false);
        setIsFullscreen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    if (isCssFullscreen || isFullscreen) document.body.style.overflow = "hidden";
    document.addEventListener("fullscreenchange", syncFullscreen);
    window.addEventListener("keydown", closeFallbackOnEscape);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      window.removeEventListener("keydown", closeFallbackOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isCssFullscreen, isFullscreen]);

  async function toggleFullscreen() {
    const surface = toolInterfaceRef.current;
    if (!surface) return;

    if (isCssFullscreen) {
      setIsCssFullscreen(false);
      setIsFullscreen(false);
      return;
    }

    try {
      if (document.fullscreenElement === surface) {
        await document.exitFullscreen();
        return;
      }
      if (!surface.requestFullscreen) {
        setIsCssFullscreen(true);
        setIsFullscreen(true);
        return;
      }
      await surface.requestFullscreen();
    } catch {
      // Keep the feature usable in mobile browsers that reject the Fullscreen API.
      setIsCssFullscreen(true);
      setIsFullscreen(true);
    }
  }

  const cat = CATEGORY_MAP[tool.category];
  const toolContent = isMusicSandbox ? (
    <>
      {isFullscreen ? <div className="env-tool-fullscreen__toolbar">
        <button type="button" onClick={() => void toggleFullscreen()} className="env-tool-fullscreen__exit rounded-md border border-border bg-surface text-fg shadow-sm hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label={`Exit full screen for ${tool.name}`} title="Exit full screen"><Minimize2 className="size-4" aria-hidden="true" /></button>
      </div> : null}
      <div className={isFullscreen ? "env-tool-fullscreen__content" : undefined}>{children}</div>
    </>
  ) : isFullscreen ? (
    <>
      <div className="env-tool-fullscreen__toolbar">
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="env-tool-fullscreen__exit rounded-md border border-border bg-surface text-fg shadow-sm hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={`Exit full screen for ${tool.name}`}
          title="Exit full screen"
        >
          <Minimize2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="env-tool-fullscreen__content">{children}</div>
    </>
  ) : children;

  return (
    <article className={tool.category === "creators" ? "env-device-tool-page" : "mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10" + (isMusicSandbox ? " env-music-sandbox-shell" : "")}>
      {tool.category !== "creators" ? (
      <nav className="flex flex-wrap items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-fg">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link to="/tools" search={{ q: "" }} className="hover:text-fg">
          Tools
        </Link>
        <span aria-hidden="true">/</span>
        <Link to="/tools/$category" params={{ category: tool.category }} className="hover:text-fg">
          {cat?.name ?? tool.category}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-fg">{tool.name}</span>
      </nav>
      ) : null}


      <header className={tool.category === "creators" ? "env-device-tool-header" : "mt-6 grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_auto] items-start gap-x-3 gap-y-2 sm:flex sm:justify-between sm:gap-3"}>
        {tool.category === "creators" ? <Link to="/tools/$category" params={{ category: "creators" }} className="env-device-tool-back" aria-label="Back to Creator and Music tools" title="Back"><ArrowLeft aria-hidden="true" /></Link> : null}
        <ToolAppIcon tool={tool} className="row-span-2 size-11 sm:row-span-1" />
        <div className="col-start-2 row-start-1 min-w-0 sm:flex sm:min-w-0 sm:flex-1 sm:gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tool.name}</h1>
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                disabled={isMusicSandbox && !prefsHydrated}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={isFullscreen ? `Exit full screen for ${tool.name}` : `View ${tool.name} in full screen`}
                title={isFullscreen ? "Exit full screen" : "View tool in full screen"}
              >
                {isFullscreen ? <Minimize2 className="size-4" aria-hidden="true" /> : <Maximize2 className="size-4" aria-hidden="true" />}
              </button>
              {tool.status === "planned" ? <ComingSoonBadge /> : null}
            </div>
            {tool.category !== "creators" ? <p className="mt-1 hidden max-w-2xl text-sm text-muted sm:block">{offlineAwareToolDescription(tool)}</p> : null}
          </div>
        </div>
        {!isFullscreen ? <Button
          type="button"
          variant={saved ? "default" : "outline"}
          className="col-start-3 row-start-1 shrink-0"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleFavorite(tool.id);
          }}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${tool.name} from saved tools` : `Save ${tool.name}`}
        >
          <Heart className="size-4" fill={saved ? "currentColor" : "none"} />
          {saved ? "Saved" : "Save"}
        </Button> : null}
        {tool.category !== "creators" ? <p className="col-start-2 col-span-2 row-start-2 text-sm leading-6 text-muted sm:hidden">{offlineAwareToolDescription(tool)}</p> : null}
      </header>

      {!isFullscreen && adsterraAdsEnabled ? <AdsterraResponsiveBanner onDelivery={onAdDelivery} /> : null}

      {storageError ? <p className="mt-3 text-sm text-danger" role="status">{storageError}</p> : null}

      {note && tool.category !== "creators" ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
      <section
        ref={toolInterfaceRef}
        data-env-tool-id={tool.id}
        data-env-ad-eligible={adsterraAdsEnabled ? "true" : undefined}
        className={isFullscreen
          ? "env-tool-interface env-tool-fullscreen"
          : tool.category === "creators" ? "env-device-tool-interface"
          : ["song-metadata-analyzer", "audio-analyze-studio"].includes(tool.id) ? "env-tool-interface relative mt-6" : "env-tool-interface relative mt-6 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-6"}
        role={isFullscreen ? "dialog" : undefined}
        aria-modal={isFullscreen || undefined}
        aria-label={isFullscreen ? `${tool.name} working interface` : undefined}
        onClickCapture={(event) => {
          const target = event.target;
          if (!(target instanceof Element) || target.closest(".env-tool-fullscreen__toolbar")) return;
          const action = target.closest("button,a,[role=button]");
          if (!action || (action instanceof HTMLButtonElement && action.disabled)) return;
          const label = [action.getAttribute("aria-label"), action.getAttribute("title"), action.textContent].filter(Boolean).join(" ");
          const isFileDownload = action instanceof HTMLAnchorElement && action.hasAttribute("download");
          const isExecutionAction =
            /\b(run|calculate|convert|generate|analy[sz]e|process|format|validate|inspect|scan|encode|decode|resize|compress|extract|transcribe|create|execute|search|lookup|find|compare|merge|split|apply|build|render|submit|start|organize|rename|rotate|encrypt|decrypt|optimize|repair|clean|crop|watermark|unzip|archive|sort|deduplicate|ocr|recognize|transform|calculate|check)\b/i.test(label);
          if (requiresTokenFallback && isExecutionAction) {
            if (paidExecutionInFlight && !authorizedExecutionRef.current) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (!authorizedExecutionRef.current) {
              pendingExecutionRef.current = action as HTMLElement;
              setFallbackPromptOpen(true);
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            const form = action instanceof HTMLButtonElement || action instanceof HTMLInputElement
              ? action.form
              : action.closest("form");
            const submitsForm = Boolean(form && (
              (action instanceof HTMLButtonElement && action.type === "submit") ||
              (action instanceof HTMLInputElement && ["submit", "image"].includes(action.type))
            ));
            if (!submitsForm) {
              // Consume the one-use authorization on this click. Only a native
              // submit button may carry it forward into its matching submit event.
              authorizedExecutionRef.current = false;
              setPaidExecutionInFlight(true);
            }
          }
          const isOutputAction =
            isFileDownload ||
            /\b(copy|download|export|save|output|result|calculate|convert|generate|analy[sz]e|process|format|validate|inspect|scan|encode|decode|resize|compress|extract|transcribe|create|execute|compare|merge|split|apply|build|render)\b/i.test(label);
          if (adsterraAdsEnabled && adDelivery === "filled" && isOutputAction) {
            // Open the supplied Smartlink synchronously within the visitor's
            // explicit output-button gesture, before async generation can
            // cause mobile browsers to block the new tab.
            openAdsterraSmartlinkFromOutput();
          }
          if (/\b(run|calculate|convert|generate|analy[sz]e|process|format|validate|inspect|scan|encode|decode|resize|compress|extract|transcribe|create|execute|search|lookup|find|compare|merge|split|apply|build|render|submit|start|organize|rename|rotate|encrypt|decrypt|optimize|repair|clean|crop|watermark|unzip|archive|sort|deduplicate|ocr|recognize|transform|check)\b/i.test(label)) {
            startToolExecution("action_button");
          }
        }}
        onSubmitCapture={(event) => {
          if (requiresTokenFallback) {
            if (paidExecutionInFlight && !authorizedExecutionRef.current) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (!authorizedExecutionRef.current) {
              const submitter = (event.nativeEvent as SubmitEvent).submitter;
              const form = event.target instanceof HTMLFormElement ? event.target : null;
              pendingExecutionRef.current = submitter instanceof HTMLElement ? submitter : form;
              setFallbackPromptOpen(true);
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            authorizedExecutionRef.current = false;
            setPaidExecutionInFlight(true);
          }
          startToolExecution("form_submit");
        }}
      >
        <ToolExecutionTelemetryContext.Provider value={executionTelemetry}>
          {toolContent}
        </ToolExecutionTelemetryContext.Provider>
        {showAdFallbackGate ? (
          <div className="absolute inset-0 z-40 grid place-items-center rounded-2xl bg-bg/90 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Tool access">
            <div className="flex w-full max-w-sm flex-wrap items-center justify-center gap-2 rounded-xl border border-border bg-surface p-4 shadow-lg">
              {!authenticatedAccount ? (
                <>
                  <Link to="/login" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-fg hover:bg-surface-2">Sign in</Link>
                  <Link to="/signup" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90">Create account</Link>
                </>
              ) : (
                <>
                  {fallbackQuoteLoading || fallbackQuoteStatus === "loading" ? (
                    <p className="w-full text-center text-sm text-muted">Checking token access…</p>
                  ) : fallbackQuoteStatus === "unavailable" ? (
                    <p className="w-full text-center text-sm text-muted">An approved enV price is not available for this tool yet.</p>
                  ) : fallbackQuoteStatus === "error" ? (
                    <p className="w-full text-center text-sm text-muted">Token access could not be verified. Please retry the tool.</p>
                  ) : fallbackAccess?.billingEnabled === true ? (
                    fallbackAccess.availableSubunits !== null &&
                    fallbackAccess.availableSubunits >= fallbackAccess.unitSubunits ? (
                      <button type="button" disabled={fallbackChargeLoading} onClick={() => void chargeFallbackAndRun()} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-fg px-4 text-sm font-semibold text-bg disabled:opacity-60">
                        {fallbackChargeLoading ? "…" : `Use ${fallbackAccess.unitTokens.toLocaleString(undefined, { maximumFractionDigits: 3 })} enV`}
                      </button>
                    ) : (
                      <Link to="/wallet" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-fg hover:bg-surface-2">Buy enV</Link>
                    )
                  ) : (
                    <p className="w-full text-center text-sm text-muted">enV fallback access is not enabled for this tool yet.</p>
                  )}
                </>
              )}
            </div>
          </div>
        ) : null}
        {!isFullscreen && tool.category !== "creators" ? <ToolCommunityPanel toolId={tool.id} discussionHref={"/community" + toolPath(tool)} initialFeed={initialCommunityFeed} /> : null}
      </section>

      {!isFullscreen && adsterraAdsEnabled ? (
        <>
          <AdsterraBanner format="300x250" onDelivery={onAdDelivery} />
          <AdsterraNativeBanner onDelivery={onAdDelivery} />
        </>
      ) : null}

      {tool.category !== "creators" ? (
        <>
      {!isFullscreen && import.meta.env.VITE_ADSTERRA_ENABLED !== "true" ? <AdSlot tool={tool} /> : null}
      <AiAssistPanel toolId={tool.id} />

      <section className="mt-10" aria-labelledby="tool-guide-heading">
        <h2 id="tool-guide-heading" className="text-lg font-semibold">What this tool does</h2>
        <p className="mt-3 text-sm leading-6 text-muted">{offlineAwareToolDescription(tool)}</p>
        <a
          href={toolDocumentationPath(tool)}
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-accent underline underline-offset-4"
        >
          <BookOpen className="size-4" aria-hidden="true" />
          Read the full guide
        </a>


      </section>

      {related.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-accent">Related tools</h2>
          {tool.category === "accessibility" ? <p className="mt-2 max-w-3xl text-sm text-muted">These tools have different jobs: checkers flag snippet issues, generators create starting output, helpers guide fixes, previews show examples, and simulators walk through user scenarios.</p> : null}
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {related.slice(0, visibleRelatedCount).map((r) => (
              <li key={r.id}>
                {isToolUnderProduction(r) ? (
                  <button
                    type="button"
                    onClick={() => setProductionTool(r)}
                    aria-haspopup="dialog"
                    className="group flex min-h-24 w-full flex-col rounded-lg bg-surface px-4 py-3 text-left text-sm shadow-[var(--shadow-border)] hover:text-accent"
                  >
                    <span className="flex items-center gap-2 font-medium"><ToolAppIcon tool={r} className="size-8" /><span>{r.name}</span></span>
                    <span className="mt-1 block text-xs text-muted">{r.description}</span>
                    <span className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-subtle">Under production</span>
                    <ArrowRight className="mt-auto ml-auto size-4" aria-hidden="true" />
                  </button>
                ) : (
                  <Link
                    to={toolPath(r)}
                    className="group flex min-h-24 flex-col rounded-lg bg-surface px-4 py-3 text-sm shadow-[var(--shadow-border)] hover:text-accent"
                  >
                    <span className="flex items-center gap-2 font-medium"><ToolAppIcon tool={r} className="size-8" /><span>{r.name}</span></span>
                    <span className="mt-1 block text-xs text-muted">{r.description}</span>
                    <ArrowRight className="mt-auto ml-auto size-4" aria-hidden="true" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {related.length > visibleRelatedCount ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => setVisibleRelatedCount((count) => Math.min(count + 6, related.length))}
                aria-label="See more related tools"
              >
                See more
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
        </>
      ) : null}
      <UnderProductionDialog
        open={productionTool !== null}
        toolName={productionTool?.name ?? "This tool"}
        onClose={() => setProductionTool(null)}
      />
    </article>
  );
}
