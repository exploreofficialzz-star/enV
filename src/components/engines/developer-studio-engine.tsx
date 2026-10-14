import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, ShieldCheck, Sparkles, ScanSearch } from "lucide-react";
import { DeveloperEngine } from "@/components/engines/developer-engine";
import { DeveloperRecipeWorkbench } from "@/components/engines/developer-recipe-workbench";
import { Button } from "@/components/ui/button";
import { DEVELOPER_STUDIOS, type DeveloperStudioDefinition } from "@/lib/developer-studios-catalog";
import { detectDeveloperInputKind } from "@/lib/engines/developer-utils";
import { getAllTools } from "@/lib/registry";
import type { ToolMeta } from "@/types/tool";

type Props = { tool: ToolMeta; initialMode?: string; initialAction?: "encode" | "decode"; initialOp?: string };
const DEVOPS_PRESETS = [
  { value: "node", label: "Node.js" }, { value: "python", label: "Python" }, { value: "go", label: "Go" },
  { value: "java", label: "Java" }, { value: "rust", label: "Rust" }, { value: "swift", label: "Swift" },
  { value: "android", label: "Android" }, { value: "static", label: "Static site" }, { value: "generic", label: "Generic" },
];

function studioForTool(tool: ToolMeta): DeveloperStudioDefinition {
  return DEVELOPER_STUDIOS.find((studio) => studio.slug === tool.slug) ?? DEVELOPER_STUDIOS[0];
}

/** Multi-mode Developer workspace; each mode delegates to an established deterministic local engine. */
export function DeveloperStudioEngine({ tool, initialMode, initialAction, initialOp }: Props) {
  const studio = useMemo(() => studioForTool(tool), [tool.slug]);
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState(() => studio.modes.some((mode) => mode.key === initialMode) ? initialMode! : studio.modes[0].key);
  const [preset, setPreset] = useState("node");
  const [encodingAction, setEncodingAction] = useState<"encode" | "decode">(initialAction ?? "encode");
  const [opOverride, setOpOverride] = useState<string | undefined>(initialOp);
  const [detectHint, setDetectHint] = useState<ReturnType<typeof detectDeveloperInputKind>>(null);
  const knownDeveloperOp = useMemo(() => initialOp && getAllTools().some((candidate) => candidate.category === "developer" && "op" in candidate.engine && candidate.engine.op === initialOp) ? initialOp : undefined, [initialOp]);
  useEffect(() => {
    const nextMode = initialMode && studio.modes.some((item) => item.key === initialMode) ? initialMode : studio.modes[0].key;
    setSelectedMode(nextMode);
    setEncodingAction(initialAction ?? "encode");
    setOpOverride(knownDeveloperOp);
  }, [initialMode, initialAction, knownDeveloperOp, studio]);
  const mode = studio.modes.find((candidate) => candidate.key === selectedMode) ?? studio.modes[0];
  const defaultOp = studio.id === "encoding-studio" && encodingAction === "decode" ? (mode.decodeOp ?? mode.op) : mode.op;
  const activeOp = opOverride ?? defaultOp;
  const isPresetMode = studio.id === "devops-studio" && ["gitignore", "dockerfile"].includes(mode.key);
  const presetInput = isPresetMode ? preset : undefined;

  const selectMode = (nextMode: string) => {
    setSelectedMode(nextMode);
    // A legacy deep-link op is only an initial override. Once the user switches modes,
    // the selected Studio mode must control the active operation.
    setOpOverride(undefined);
    // Put the selected mode in the address bar so the workspace can be bookmarked/shared.
    void navigate({
      to: "/tools/$category/$slug",
      params: { category: "developer", slug: studio.slug },
      search: { mode: nextMode, action: studio.id === "encoding-studio" ? encodingAction : undefined, op: undefined },
      replace: true,
    });
  };

  const selectEncodingAction = (nextAction: "encode" | "decode") => {
    setEncodingAction(nextAction);
    setOpOverride(undefined);
    void navigate({
      to: "/tools/$category/$slug",
      params: { category: "developer", slug: studio.slug },
      search: { mode: selectedMode, action: nextAction, op: undefined },
      replace: true,
    });
  };

  return (
    <section className="space-y-5" aria-labelledby="developer-studio-heading">
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Sparkles className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="developer-studio-heading" className="text-xl font-semibold">{studio.name}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">{studio.description}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted" role="note">
          <ShieldCheck className="size-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
          <span className="font-medium text-foreground">Local-first processing</span>
          <span aria-hidden="true">·</span>
          <span>Text and file inputs are processed in this app; no tool input is intentionally uploaded.</span>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Choose a mode</h3>
        {/* Horizontal scroll on narrow screens; wrap on sm+ — Accessibility-style touch-friendly modes */}
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible touch-pan-x"
          role="group"
          aria-label={`${studio.name} modes`}
        >
          {studio.modes.map((item) => (
            <Button
              key={item.key}
              type="button"
              size="sm"
              className="min-h-10 shrink-0 px-3"
              variant={selectedMode === item.key ? "default" : "outline"}
              aria-pressed={selectedMode === item.key}
              onClick={() => selectMode(item.key)}
            >{item.label}</Button>
          ))}
        </div>
      </div>

      {studio.id === "encoding-studio" ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Encoding direction">
          <span className="text-sm font-medium">Direction</span>
          <Button type="button" size="sm" variant={encodingAction === "encode" ? "default" : "outline"} aria-pressed={encodingAction === "encode"} onClick={() => selectEncodingAction("encode")}>Encode</Button>
          <Button type="button" size="sm" variant={encodingAction === "decode" ? "default" : "outline"} aria-pressed={encodingAction === "decode"} onClick={() => selectEncodingAction("decode")}>Decode</Button>
        </div>
      ) : null}

      {studio.id === "devops-studio" && isPresetMode ? (
        <label className="block max-w-sm space-y-1.5">
          <span className="text-sm font-medium">Stack preset</span>
          <select value={preset} onChange={(event) => setPreset(event.target.value)} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
            {DEVOPS_PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <span className="block text-xs text-muted">The preset seeds the generator. Review and adapt output before using it in a real deployment.</span>
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-medium text-foreground">Active mode:</span> {mode.label}{studio.id === "encoding-studio" ? ` · ${encodingAction === "decode" ? "Decode" : "Encode"}` : ""}
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <span>Deterministic local engine</span>
      </div>

      {/* Smart detection (DevToys-style): paste sample text to jump to the best Studio mode — fully local */}
      <details className="rounded-lg border border-border bg-surface/60 p-3 sm:p-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
          <ScanSearch className="size-4 shrink-0 text-accent" aria-hidden="true" />
          Smart detect from paste
          <span className="font-normal text-muted">· local only, nothing uploaded</span>
        </summary>
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-10"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setDetectHint(detectDeveloperInputKind(text));
                } catch {
                  setDetectHint(null);
                }
              }}
            >
              Detect from clipboard
            </Button>
            <span className="text-xs text-muted">User-initiated only · no background monitoring</span>
          </div>
          <label className="block space-y-1.5">
            <span className="sr-only">Paste sample text to detect tool</span>
            <textarea
              className="min-h-[4.5rem] w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-5"
              placeholder="Paste a JWT, JSON, Base64, UUID, cron, timestamp, or digest…"
              onChange={(event) => setDetectHint(detectDeveloperInputKind(event.target.value))}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          {detectHint ? (
            <div className="flex flex-col gap-2 rounded-md border border-emerald-600/30 bg-emerald-500/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 text-muted">
                <span className="font-medium text-foreground">{detectHint.kind}</span>
                {" · "}
                {detectHint.reason}
              </p>
              <Button
                type="button"
                size="sm"
                className="min-h-10 shrink-0"
                onClick={() => {
                  if (detectHint.studioSlug === studio.slug) {
                    selectMode(detectHint.modeKey);
                  } else {
                    void navigate({
                      to: "/tools/$category/$slug",
                      params: { category: "developer", slug: detectHint.studioSlug },
                      search: { mode: detectHint.modeKey, action: undefined, op: undefined },
                    });
                  }
                }}
              >
                Open {detectHint.studioSlug.replace(/-studio$/, "")} · {detectHint.modeKey}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted">Detection runs only in this browser. No network request is made.</p>
          )}
        </div>
      </details>

      {activeOp === "developer-recipe-runner"
        ? <DeveloperRecipeWorkbench />
        : <DeveloperEngine key={`${studio.id}:${activeOp}:${presetInput ?? "default"}`} op={activeOp} tool={tool} initialInput={presetInput} />}
    </section>
  );
}
