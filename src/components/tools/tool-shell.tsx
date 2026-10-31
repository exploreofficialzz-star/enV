import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, ChevronDown, Heart, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { disclaimerText } from "@/lib/content";
import { recordAnalyticsEvent } from "@/lib/analytics/client";
import { toolDocumentationPath } from "@/lib/tool-documentation";
import { getRelatedTools, toolPath } from "@/lib/registry";
import { applyViewMode, usePrefs } from "@/lib/storage";
import { CATEGORY_MAP } from "@/data/categories";
import type { ToolMeta } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { ComingSoonBadge } from "@/components/tools/coming-soon";
import { ToolAppIcon } from "@/components/tools/tool-app-icon";
import { AiAssistPanel } from "@/components/ai/ai-assist-panel";
import { ToolCommunityPanel } from "@/components/tools/tool-community-panel";
import { ToolExecutionTelemetryContext, type ToolExecutionTelemetry, type ToolExecutionOutcome } from "@/components/tools/tool-execution-context";
import { UnderProductionDialog } from "@/components/tools/under-production";
import { isToolUnderProduction } from "@/lib/production-notice";

export function ToolShell({
  tool,
  children,
}: {
  tool: ToolMeta;
  children: React.ReactNode;
}) {
  const related = useMemo(() => getRelatedTools(tool, Number.MAX_SAFE_INTEGER), [tool]);
  const [visibleRelatedCount, setVisibleRelatedCount] = useState(6);
  const [productionTool, setProductionTool] = useState<ToolMeta | null>(null);
  const note = disclaimerText(tool);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const favorites = usePrefs((s) => s.favorites);
  const prefsHydrated = usePrefs((s) => s.hydrated);
  const recordRecent = usePrefs((s) => s.recordRecent);
  const storageError = usePrefs((s) => s.storageError);
  const saved = favorites.includes(tool.id);
  const toolInterfaceRef = useRef<HTMLDivElement | null>(null);
  const toolStartedRef = useRef(false);
  const toolFinishedRef = useRef(false);
  const toolAbandonmentRecordedRef = useRef(false);
  const toolStartedAtRef = useRef<number | null>(null);
  const toolViewedAtRef = useRef(Date.now());
  const executionStartedAtRef = useRef<number | null>(null);
  const executionFinishedRef = useRef(false);

  const startToolExecution = (entryPoint: string) => {
    const startedAt = Date.now();
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

  const executionTelemetry: ToolExecutionTelemetry = {
    finish: (outcome: ToolExecutionOutcome, errorCode?: string) => {
      const startedAt = executionStartedAtRef.current;
      if (startedAt === null || executionFinishedRef.current) return;
      executionFinishedRef.current = true;
      recordToolExecutionResult(tool.id, outcome, Date.now() - startedAt, "shared_result", errorCode);
    },
  };
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
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
    toolViewedAtRef.current = Date.now();
  }, [tool.id, recordRecent]);

  useEffect(() => {
    const onExecutionResult = (event: Event) => {
      const detail = (event as CustomEvent<{ toolId?: string; outcome?: string }>).detail;
      if (detail?.toolId === tool.id && ["success", "failure", "cancelled"].includes(detail.outcome ?? "")) {
        toolFinishedRef.current = true;
        executionFinishedRef.current = true;
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
  }, [tool.id]);

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

  return (
    <article className={"mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10" + (isMusicSandbox ? " env-music-sandbox-shell" : "")}>
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

      <header className="mt-6 grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_auto] items-start gap-x-3 gap-y-2 sm:flex sm:justify-between sm:gap-3">
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
            <p className="mt-1 hidden max-w-2xl text-sm text-muted sm:block">{tool.description}</p>
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
        <p className="col-start-2 col-span-2 row-start-2 text-sm leading-6 text-muted sm:hidden">{tool.description}</p>
      </header>

      {storageError ? <p className="mt-3 text-sm text-danger" role="status">{storageError}</p> : null}

      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
      <section
        ref={toolInterfaceRef}
        data-env-tool-id={tool.id}
        className={isFullscreen
          ? "env-tool-interface env-tool-fullscreen"
          : ["song-metadata-analyzer", "audio-analyze-studio"].includes(tool.id) ? "env-tool-interface relative mt-6" : "env-tool-interface relative mt-6 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-6"}
        role={isFullscreen ? "dialog" : undefined}
        aria-modal={isFullscreen || undefined}
        aria-label={isFullscreen ? `${tool.name} working interface` : undefined}
        onClickCapture={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement) || target.closest(".env-tool-fullscreen__toolbar")) return;
          const button = target.closest("button");
          if (!button || button.disabled || button.type === "submit") return;
          const label = [button.getAttribute("aria-label"), button.getAttribute("title"), button.innerText].filter(Boolean).join(" ");
          if (/\b(run|calculate|convert|generate|analy[sz]e|process|format|validate|inspect|scan|encode|decode|resize|compress|extract|transcribe|create|execute|search|lookup|compare|merge|split|apply|build|render)\b/i.test(label)) {
            startToolExecution("action_button");
          }
        }}
        onSubmitCapture={() => startToolExecution("form_submit")}
      >
        <ToolExecutionTelemetryContext.Provider value={executionTelemetry}>
        {isMusicSandbox ? (
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
        ) : children}
        </ToolExecutionTelemetryContext.Provider>
      </section>

      <AiAssistPanel toolId={tool.id} />
      <ToolCommunityPanel toolId={tool.id} />

      <section className="mt-10" aria-labelledby="tool-guide-heading">
        <h2 id="tool-guide-heading" className="text-lg font-semibold">What this tool does</h2>
        <p className="mt-3 text-sm leading-6 text-muted">{tool.description}</p>
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
      <UnderProductionDialog
        open={productionTool !== null}
        toolName={productionTool?.name ?? "This tool"}
        onClose={() => setProductionTool(null)}
      />
    </article>
  );
}
