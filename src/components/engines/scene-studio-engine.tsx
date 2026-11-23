import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Captions, Check, Copy, Download, FolderOpen, Info, Pause, Play, Save, Sparkles, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { libraryLookup } from "@/lib/scene-studio/assets";
import type { AssetManifest } from "@/lib/scene-studio/assets";
import { BUNDLE_LIMITS, checkLooseFile } from "@/lib/scene-studio/bundle";
import { deflateRaw, inflateRaw } from "@/lib/scene-studio/bundle-streams";
import { captionGroups, toSrt } from "@/lib/scene-studio/captions";
import { openProject, saveProject } from "@/lib/scene-studio/project";
import { buildAiInstructions, buildFixRequest } from "@/lib/scene-studio/prompt";
import { analyseScene, downloadName, EXAMPLE_SCENES, extraNotes, fileSizeLabel, frameAtElapsed, issueSummary, previewSize, timeLabel } from "@/lib/scene-studio/studio-session";
import type { SceneAnalysis } from "@/lib/scene-studio/studio-session";
import type { Quality } from "@/lib/scene-studio/types";
import assetManifestJson from "../../../apps/shared/scene-studio/asset-manifest.json";
import { exportSceneVideo, FramePainter } from "./scene-studio-runtime";
import type { VideoExportResult } from "./scene-studio-runtime";

const manifest = assetManifestJson as unknown as AssetManifest;
const library = libraryLookup(manifest);

type Message = { kind: "ok" | "problem"; text: string };

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function saveBytes(bytes: Uint8Array, fileName: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const PICKABLE = ".glb,.png,.jpg,.jpeg,.webp,.hdr,.wav,.mp3,.ogg,.m4a,.txt,.md,.json,.zip";

// ---- preview ---------------------------------------------------------------------------------

function PreviewPanel({ analysis, files, quality }: { analysis: SceneAnalysis; files: ReadonlyMap<string, Uint8Array>; quality: Quality }) {
  const scene = analysis.scene;
  const hostRef = useRef<HTMLDivElement>(null);
  const painterRef = useRef<FramePainter | null>(null);
  const frameRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const fps = scene?.settings.fps ?? 30;
  const frames = Math.max(1, analysis.frameCount);

  const show = useCallback((f: number) => {
    frameRef.current = f;
    setFrame(f);
    try {
      painterRef.current?.paint(f);
    } catch (e) {
      setPlaying(false);
      setError(`The preview stopped: ${errorText(e)}`);
    }
  }, []);

  // build the picture whenever the scene, the added files or the preview quality change
  useEffect(() => {
    setPlaying(false);
    if (!scene || !analysis.ok) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let created: FramePainter | null = null;
    setError(null);
    setLoading(true);
    const host = hostRef.current;
    const size = previewSize(scene.settings.width, scene.settings.height, Math.min(960, host?.clientWidth || 640));
    FramePainter.create({ scene, plans: analysis.plans, files, width: size.width, height: size.height, quality, lines: analysis.spokenLines })
      .then((painter) => {
        if (cancelled) {
          painter.dispose();
          return;
        }
        created = painter;
        painterRef.current = painter;
        painter.canvas.style.cssText = "display:block;width:100%;height:auto;border-radius:0.5rem;background:#000";
        painter.canvas.setAttribute("aria-label", "Scene preview");
        hostRef.current?.replaceChildren(painter.canvas);
        setNotes(painter.notes);
        setLoading(false);
        show(Math.min(frameRef.current, frames - 1));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(`The preview could not be built: ${errorText(e)}`);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      created?.dispose();
      if (painterRef.current === created) painterRef.current = null;
      hostRef.current?.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, files, quality]);

  useEffect(() => {
    if (!playing || !scene) return;
    const startedAt = performance.now() - (frameRef.current / fps) * 1000;
    let raf = 0;
    const tick = (now: number) => {
      const f = frameAtElapsed((now - startedAt) / 1000, fps, frames);
      if (f !== frameRef.current) show(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, scene, fps, frames, show]);

  const ready = !!scene && analysis.ok;
  return (
    <section className="min-w-0 space-y-3" aria-label="Preview">
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-border)]">
        <div className="relative bg-black" style={scene ? { aspectRatio: `${scene.settings.width} / ${scene.settings.height}` } : { aspectRatio: "16 / 9" }}>
          <div ref={hostRef} className="absolute inset-0 [&>canvas]:h-full [&>canvas]:w-full [&>canvas]:rounded-none" />
          {!ready && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/70">Paste a scene on the right and it will play here.</div>}
          {ready && loading && <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-white/80" role="status">Building your scene…</div>}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2.5">
          <Button size="sm" variant="secondary" disabled={!ready || loading} onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause /> : <Play />}
            {playing ? "Pause" : "Play"}
          </Button>
          <input
            type="range"
            className="min-w-0 flex-1 accent-[var(--color-accent)]"
            min={0}
            max={Math.max(0, frames - 1)}
            value={Math.min(frame, frames - 1)}
            disabled={!ready || loading}
            aria-label="Move through the scene"
            onChange={(e) => {
              setPlaying(false);
              show(Number(e.target.value));
            }}
          />
          <span className="text-xs tabular-nums text-muted" aria-live="off">
            {timeLabel(frame / fps)} / {timeLabel(frames / fps)}
          </span>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-surface px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {notes.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- export ----------------------------------------------------------------------------------

function ExportPanel({ analysis, files, projectName }: { analysis: SceneAnalysis; files: ReadonlyMap<string, Uint8Array>; projectName: string }) {
  const scene = analysis.scene;
  const [running, setRunning] = useState<{ stage: string; done: number; total: number } | null>(null);
  const [result, setResult] = useState<(VideoExportResult & { url: string; name: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    },
    [],
  );

  const start = async () => {
    if (!scene || !analysis.ok) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setRunning({ stage: "Starting", done: 0, total: analysis.frameCount });
    try {
      const made = await exportSceneVideo({
        scene,
        plans: analysis.plans,
        files,
        lines: analysis.spokenLines,
        signal: controller.signal,
        onStage: (stage) => setRunning((r) => ({ stage, done: 0, total: r?.total ?? analysis.frameCount })),
        onProgress: (done, total) => setRunning((r) => ({ stage: r?.stage ?? "Making the video", done, total })),
      });
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
      const url = URL.createObjectURL(new Blob([made.bytes as BlobPart], { type: "video/mp4" }));
      resultUrl.current = url;
      setResult({ ...made, url, name: downloadName(projectName, "mp4") });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") setError("The video was cancelled.");
      else setError(errorText(e));
    } finally {
      setRunning(null);
      abortRef.current = null;
    }
  };

  const percent = running && running.total > 0 ? Math.round((running.done / running.total) * 100) : 0;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-border)]" aria-label="Make the video">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">Make the video</h3>
          <p className="text-xs text-muted">
            {scene ? `${scene.settings.width}×${scene.settings.height}, ${scene.settings.fps} frames a second, ${scene.settings.duration} seconds. Made on this device; nothing is uploaded.` : "Paste a scene first."}
          </p>
        </div>
        {running ? (
          <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>
            <X /> Cancel
          </Button>
        ) : (
          <Button size="sm" disabled={!scene || !analysis.ok} onClick={start}>
            <Download /> Make MP4
          </Button>
        )}
      </div>
      {running && (
        <div role="status" aria-live="polite" className="space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-muted">
            {running.stage}
            {running.done > 0 ? ` — ${percent}% (${running.done} of ${running.total} frames)` : "…"}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {result && !running && (
        <div className="space-y-2">
          <video src={result.url} controls className="w-full rounded-lg bg-black" />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => saveBytes(result.bytes, result.name, "video/mp4")}>
              <Download /> Save {result.name} ({fileSizeLabel(result.bytes.length)})
            </Button>
            {result.silent && <span className="text-xs text-muted">This video has no sound.</span>}
          </div>
          {result.notes.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ---- the screen ------------------------------------------------------------------------------

export function SceneStudioEngine() {
  const [text, setText] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [files, setFiles] = useState<ReadonlyMap<string, Uint8Array>>(() => new Map());
  const [projectName, setProjectName] = useState("my-scene");
  const [previewQuality, setPreviewQuality] = useState<Quality>("medium");
  const [message, setMessage] = useState<Message | null>(null);
  const [copied, setCopied] = useState<"ai" | "fix" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // check the scene a moment after typing stops (pasting is checked at once)
  useEffect(() => {
    const wait = text.length > 4000 ? 0 : 500;
    const timer = setTimeout(() => setAnalysisText(text), wait);
    return () => clearTimeout(timer);
  }, [text]);

  const uploadNames = useMemo(() => new Set(files.keys()), [files]);
  const analysis = useMemo(() => (analysisText.trim() === "" ? null : analyseScene(analysisText, { library, uploads: uploadNames })), [analysisText, uploadNames]);
  const empty: SceneAnalysis = useMemo(() => analyseScene("", { library, uploads: uploadNames }), [uploadNames]);
  const shown = analysis ?? empty;

  const flash = (kind: Message["kind"], body: string) => setMessage({ kind, text: body });

  const copy = async (what: "ai" | "fix") => {
    const body = what === "ai" ? buildAiInstructions({ manifest, uploads: [...files.keys()] }) : buildFixRequest(shown.issues, text);
    const ok = await copyText(body);
    if (ok) {
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 2500);
    } else flash("problem", "Your browser blocked copying. Allow clipboard access for this site and try again.");
  };

  const addFiles = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const next = new Map(files);
    let total = [...next.values()].reduce((sum, f) => sum + f.length, 0);
    const problems: string[] = [];
    let added = 0;
    for (const file of Array.from(picked)) {
      const lower = file.name.toLowerCase();
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (lower.endsWith(".zip")) {
          const opened = await openProject(bytes, inflateRaw);
          for (const issue of opened.issues) problems.push(`${issue.message} ${issue.fix}`);
          if (opened.sceneText !== undefined) {
            setText(opened.sceneText);
            setAnalysisText(opened.sceneText);
            if (opened.name) setProjectName(opened.name);
          }
          for (const [name, data] of opened.assets) {
            total += data.length;
            next.set(name, data);
            added++;
          }
        } else if (lower.endsWith(".json")) {
          const body = new TextDecoder().decode(bytes);
          setText(body);
          setAnalysisText(body);
          setProjectName(file.name.replace(/\.json$/i, ""));
          added++;
        } else {
          const checked = checkLooseFile(file.name, bytes);
          if (!checked.ok) problems.push(`${checked.issue.message} ${checked.issue.fix}`);
          else if (total + bytes.length > BUNDLE_LIMITS.maxTotalBytes) problems.push(`"${file.name}" was not added: the project would be larger than ${fileSizeLabel(BUNDLE_LIMITS.maxTotalBytes)}.`);
          else {
            total += bytes.length;
            next.set(checked.name, bytes);
            added++;
          }
        }
      } catch (e) {
        problems.push(`"${file.name}" could not be read: ${errorText(e)}`);
      }
    }
    setFiles(next);
    if (problems.length > 0) flash("problem", problems.join("\n"));
    else if (added > 0) flash("ok", `${added} ${added === 1 ? "file" : "files"} added.`);
    if (fileInput.current) fileInput.current.value = "";
  };

  const saveZip = async () => {
    try {
      const bytes = await saveProject({ name: projectName, sceneText: text, assets: files }, deflateRaw);
      saveBytes(bytes, downloadName(projectName, "zip"), "application/zip");
      flash("ok", "Project saved. Open it again later with “Add files or open a project”.");
    } catch (e) {
      flash("problem", `The project could not be saved: ${errorText(e)}`);
    }
  };

  const saveCaptions = () => {
    const scene = shown.scene;
    if (!scene) return;
    const srt = toSrt(captionGroups(shown.spokenLines, scene.captions.wordsPerGroup));
    saveBytes(new TextEncoder().encode(srt), downloadName(projectName, "srt"), "text/plain");
  };

  const notes = extraNotes(shown);
  const scene = shown.scene;
  const hasDialogue = !!scene && scene.dialogue.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-fg">Scene Studio</h2>
        <p className="max-w-3xl text-sm text-muted">Describe a scene to any AI chatbot, paste what it gives you, watch it play, and save it as a video. Works for 3D, flat 2D and sound, and runs on your own device.</p>
        <ol className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["1", "Copy the AI instructions", "and paste them into your chatbot with your idea."],
            ["2", "Paste the scene it writes", "into the box on this page."],
            ["3", "Watch it play", "and ask the chatbot for changes."],
            ["4", "Make the video", "then save the MP4."],
          ].map(([n, title, rest]) => (
            <li key={n} className="flex gap-3 rounded-lg border border-border bg-surface p-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-fg">{n}</span>
              <span className="text-xs text-muted">
                <strong className="block text-sm font-medium text-fg">{title}</strong>
                {rest}
              </span>
            </li>
          ))}
        </ol>
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <div className="min-w-0 space-y-4">
          <PreviewPanel analysis={shown} files={files} quality={previewQuality} />
          <ExportPanel analysis={shown} files={files} projectName={projectName} />
        </div>

        <div className="min-w-0 space-y-4">
          <section className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-border)]" aria-label="Your scene">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => copy("ai")}>
                {copied === "ai" ? <Check /> : <Sparkles />}
                {copied === "ai" ? "Copied" : "Copy AI instructions"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setText(EXAMPLE_SCENES["3d"]); setAnalysisText(EXAMPLE_SCENES["3d"]); }}>
                3D example
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setText(EXAMPLE_SCENES["2d"]); setAnalysisText(EXAMPLE_SCENES["2d"]); }}>
                2D example
              </Button>
            </div>
            <label className="block text-sm font-medium text-fg" htmlFor="scene-studio-text">
              Paste your scene here
            </label>
            <Textarea
              id="scene-studio-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              rows={14}
              className="font-mono text-xs"
              placeholder='{ "version": "1.0", … }'
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-xs ${shown.errors > 0 ? "text-danger" : shown.warnings > 0 ? "text-warn" : "text-ok"}`} role="status">
                {analysis ? issueSummary(shown.errors, shown.warnings) : "Waiting for a scene"}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={!analysis || shown.issues.length === 0} onClick={() => copy("fix")}>
                  {copied === "fix" ? <Check /> : <Copy />}
                  {copied === "fix" ? "Copied" : "Copy fix request"}
                </Button>
                <Button size="sm" variant="ghost" disabled={text === ""} onClick={() => { setText(""); setAnalysisText(""); }}>
                  <Trash2 /> Clear
                </Button>
              </div>
            </div>
            {analysis && shown.issues.length > 0 && (
              <ul className="max-h-72 space-y-2 overflow-auto" aria-label="Problems and notes">
                {shown.issues.map((issue, i) => (
                  <li key={i} className="rounded-lg border border-border bg-surface-2 p-2.5 text-xs">
                    <p className={`flex items-start gap-1.5 font-medium ${issue.severity === "error" ? "text-danger" : "text-warn"}`}>
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                      <span>{issue.message}</span>
                    </p>
                    <p className="mt-1 text-muted">{issue.fix}</p>
                    <p className="mt-1 font-mono text-[11px] text-subtle">{issue.path}</p>
                  </li>
                ))}
              </ul>
            )}
            {notes.length > 0 && (
              <ul className="space-y-1 text-xs text-muted">
                {notes.map((n, i) => (
                  <li key={i} className="flex gap-1.5">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-border)]" aria-label="Files and projects">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                <Upload /> Add files or open a project
              </Button>
              <Button size="sm" variant="outline" disabled={text.trim() === ""} onClick={saveZip}>
                <Save /> Save project
              </Button>
              <input ref={fileInput} type="file" multiple hidden accept={PICKABLE} onChange={(e) => void addFiles(e.target.files)} />
            </div>
            <p className="text-xs text-muted">Add your own 3D models (.glb), pictures, sounds and lighting images, or a whole project .zip. Files stay on this device.</p>
            {files.size > 0 && (
              <ul className="space-y-1" aria-label="Added files">
                {[...files].map(([name, data]) => (
                  <li key={name} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <FolderOpen className="size-3.5 shrink-0 text-muted" />
                      <span className="truncate font-medium text-fg">{name}</span>
                      <span className="shrink-0 text-muted">{fileSizeLabel(data.length)}</span>
                    </span>
                    <button
                      type="button"
                      className="rounded p-1 text-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      aria-label={`Remove ${name}`}
                      onClick={() => {
                        const next = new Map(files);
                        next.delete(name);
                        setFiles(next);
                      }}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {message && (
              <p role={message.kind === "problem" ? "alert" : "status"} className={`whitespace-pre-line rounded-lg px-3 py-2 text-xs ${message.kind === "problem" ? "border border-danger/40 text-danger" : "bg-surface-2 text-muted"}`}>
                {message.text}
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-border)]" aria-label="Preview, voice and captions">
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <label htmlFor="scene-studio-quality" className="text-sm text-fg">
                Preview quality
                <span className="block text-xs text-muted">Lower is smoother on slower devices. The video uses the scene’s own quality.</span>
              </label>
              <Select id="scene-studio-quality" className="w-32" value={previewQuality} onChange={(e) => setPreviewQuality(e.target.value as Quality)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </div>
            {hasDialogue ? (
              <div className="space-y-2">
                <p className="text-xs text-muted">
                  <Captions className="mr-1 inline size-3.5" />
                  {scene?.captions.enabled ? "Captions are on and timed to the words." : "Captions are off in this scene."} No voice is installed yet, so speech is silent; add a recorded narration file as a sound track to hear it.
                </p>
                <Button size="sm" variant="outline" onClick={saveCaptions}>
                  <Download /> Save captions (.srt)
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted">Add dialogue to the scene and captions appear on their own.</p>
            )}
            <div className="flex items-center gap-2">
              <label htmlFor="scene-studio-name" className="text-xs text-muted">
                Name for saved files
              </label>
              <input
                id="scene-studio-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-md bg-surface px-2.5 text-sm text-fg shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
