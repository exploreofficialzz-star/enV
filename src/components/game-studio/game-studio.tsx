import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import {
  Box,
  BoxSelect,
  ChevronDown,
  CircleHelp,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  Image,
  LockKeyhole,
  LockKeyholeOpen,
  Maximize2,
  Move3d,
  Pause,
  Play,
  Plus,
  Redo2,
  Rotate3d,
  Save,
  Scaling,
  Square,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  blankProject,
  bytesToDataUrl,
  id,
  makeObject,
  MAX_ASSET_BYTES,
  starterProject,
  validateGlb,
  validateProject,
  type GameAsset,
  type GameObject,
  type GameProject,
  type GameTemplate,
  type ObjectKind,
  type Vector,
} from "@/lib/game-studio/project";
import { listArtboards, listGameProjects, saveGameProject } from "@/lib/game-studio/storage";
import { buildGame, buildGodotProject, previewHtml } from "@/lib/game-studio/package";
import { StudioScene } from "./scene";
import "./game-studio.css";

type Mode = "select" | "move" | "rotate" | "scale";
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function safeName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "env-game"
  );
}
function VectorField({
  label,
  value,
  onChange,
  positive = false,
}: {
  label: string;
  value: Vector;
  onChange: (value: Vector) => void;
  positive?: boolean;
}) {
  return (
    <fieldset className="game-vector">
      <legend>{label}</legend>
      <div>
        {(["x", "y", "z"] as const).map((axis) => (
          <label key={axis}>
            <span>{axis.toUpperCase()}</span>
            <input
              aria-label={`${label} ${axis.toUpperCase()}`}
              type="number"
              step="0.1"
              min={positive ? 0.01 : -10000}
              max="10000"
              value={value[axis]}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next))
                  onChange({
                    ...value,
                    [axis]: Math.max(positive ? 0.01 : -10000, Math.min(10000, next)),
                  });
              }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function GameStudio() {
  const [project, setProject] = useState<GameProject>(blankProject);
  const projectRef = useRef(project);
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<Mode>("select");
  const [dirty, setDirty] = useState(false);
  const [rendererReady, setRendererReady] = useState(false);
  const [notice, setNotice] = useState("Ready to create your world.");
  const [error, setError] = useState("");
  const [side, setSide] = useState<"scene" | "assets">("scene");
  const [mobilePanel, setMobilePanel] = useState<"view" | "scene" | "assets" | "inspector">("view");
  const [inspectorTab, setInspectorTab] = useState<"transform" | "appearance" | "gameplay">(
    "transform",
  );
  const [transformTab, setTransformTab] = useState<"position" | "rotation" | "scale">("position");
  const [assetTab, setAssetTab] = useState<"artboards" | "project">("artboards");
  const [shortView, setShortView] = useState(false);
  const [assetPage, setAssetPage] = useState(0);
  const [scenePage, setScenePage] = useState(0);
  const [projectPage, setProjectPage] = useState(0);
  const [scenePageSize, setScenePageSize] = useState(3);
  const [sceneListElement, setSceneListElement] = useState<HTMLDivElement | null>(null);
  const [artboards, setArtboards] = useState<GameAsset[]>([]);
  const [projects, setProjects] = useState<GameProject[]>([]);
  const [projectMenu, setProjectMenu] = useState(false);
  const [templateMenu, setTemplateMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [playHtml, setPlayHtml] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);
  const undo = useRef<GameProject[]>([]);
  const redo = useRef<GameProject[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<StudioScene | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const templateDialog = useRef<HTMLDivElement>(null);
  const projectOptions = useRef<HTMLButtonElement>(null);
  const modelFile = useRef<HTMLInputElement>(null);
  const projectFile = useRef<HTMLInputElement>(null);
  const object = project.objects.find((item) => item.id === selected);
  const sceneLastPage = Math.max(0, Math.ceil(project.objects.length / scenePageSize) - 1);
  const currentScenePage = Math.min(scenePage, sceneLastPage);
  const visibleObjects = project.objects.slice(
    currentScenePage * scenePageSize,
    (currentScenePage + 1) * scenePageSize,
  );
  const shownAssets = assetTab === "artboards" ? artboards : project.assets;
  const pageSize = shortView ? 1 : 2;
  const assetLastPage = Math.max(0, Math.ceil(shownAssets.length / pageSize) - 1);
  const currentAssetPage = Math.min(assetPage, assetLastPage);
  const visibleAssets = shownAssets.slice(
    currentAssetPage * pageSize,
    (currentAssetPage + 1) * pageSize,
  );
  const projectLastPage = Math.max(0, Math.ceil(projects.length / pageSize) - 1);
  const currentProjectPage = Math.min(projectPage, projectLastPage);
  useEffect(() => {
    const update = () => setShortView(window.innerHeight <= 500);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(() => {
    if (!sceneListElement) return;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height || 0;
      if (height) setScenePageSize(Math.max(1, Math.min(8, Math.floor(height / 34))));
    });
    observer.observe(sceneListElement);
    return () => observer.disconnect();
  }, [sceneListElement]);
  const replace = useCallback((next: GameProject, changed = true) => {
    projectRef.current = next;
    setProject(next);
    setDirty(changed);
  }, []);
  const commit = useCallback(
    (next: GameProject) => {
      undo.current = [...undo.current.slice(-49), projectRef.current];
      redo.current = [];
      setHistoryVersion((v) => v + 1);
      replace(next);
      setError("");
    },
    [replace],
  );
  const patchObject = useCallback(
    (objectId: string, patch: Partial<GameObject>) => {
      const previous = projectRef.current;
      commit({
        ...previous,
        objects: previous.objects.map((item) =>
          item.id === objectId
            ? { ...item, ...patch }
            : patch.player
              ? { ...item, player: false }
              : item,
        ),
      });
    },
    [commit],
  );
  useEffect(() => {
    let cancelled = false;
    const projectAtRestoreStart = projectRef.current;
    Promise.all([listArtboards(), listGameProjects()])
      .then(([assets, saved]) => {
        if (cancelled) return;
        setArtboards(assets);
        setProjects(saved);
        const lastId = localStorage.getItem("env-3d-last-project");
        const last = saved.find((item) => item.id === lastId);
        if (last && projectRef.current === projectAtRestoreStart) {
          try {
            replace(validateProject(last), false);
            setNotice("Opened your last saved project.");
          } catch {
            setError("Your last saved project could not be opened. You can create a new one.");
          }
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Browser storage is unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [replace]);
  useEffect(() => {
    if (!canvas.current) return;
    const element = canvas.current;
    try {
      const renderer = new StudioScene(element, {
        select: (value) => {
          setSelected(value);
          setMobilePanel("inspector");
        },
        transform: (objectId, patch) => patchObject(objectId, patch),
        error: setError,
      });
      scene.current = renderer;
      renderer.sync(projectRef.current, "");
      setRendererReady(true);
      return () => {
        renderer.dispose(element);
        if (scene.current === renderer) scene.current = null;
      };
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The 3D renderer could not start.");
    }
  }, [patchObject]);
  useEffect(() => {
    scene.current?.sync(project, selected);
  }, [project, selected]);
  useEffect(() => {
    scene.current?.setMode(mode);
  }, [mode]);
  useEffect(() => {
    scene.current?.setActive(!playing);
  }, [playing]);
  useEffect(() => {
    if (!templateMenu || !templateDialog.current) return;
    const dialog = templateDialog.current;
    const trigger = projectOptions.current;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    buttons[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setTemplateMenu(false);
      }
      if (event.key === "Tab" && buttons.length) {
        if (event.shiftKey && document.activeElement === buttons[0]) {
          event.preventDefault();
          buttons[buttons.length - 1].focus();
        } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
          event.preventDefault();
          buttons[0].focus();
        }
      }
    };
    dialog.addEventListener("keydown", onKey);
    return () => {
      dialog.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [templateMenu]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== iframe.current?.contentWindow ||
        event.data?.source !== "env-game-runtime"
      )
        return;
      if (event.data.type === "error") setError(String(event.data.message));
      else setNotice(String(event.data.message));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  const runUndo = () => {
    const previous = undo.current.pop();
    if (!previous) return;
    redo.current.push(projectRef.current);
    replace(previous);
    setHistoryVersion((v) => v + 1);
    setNotice("Undid the last change.");
  };
  const runRedo = () => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(projectRef.current);
    replace(next);
    setHistoryVersion((v) => v + 1);
    setNotice("Redid the change.");
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
      )
        return;
      if (playing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? runRedo() : runUndo();
      } else if (!event.metaKey && !event.ctrlKey && !playing) {
        const modes: Record<string, Mode> = { q: "select", w: "move", e: "rotate", r: "scale" };
        if (modes[event.key.toLowerCase()]) setMode(modes[event.key.toLowerCase()]);
        if (event.key.toLowerCase() === "f") scene.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function add(kind: ObjectKind) {
    const item = makeObject(kind);
    commit({ ...projectRef.current, objects: [...projectRef.current.objects, item] });
    setSelected(item.id);
    setScenePage(Math.floor((projectRef.current.objects.length - 1) / scenePageSize));
    setMobilePanel("view");
    setMode("move");
    setNotice(`${item.name} added to the scene.`);
  }
  function addAsset(asset: GameAsset) {
    const previous = projectRef.current;
    const existing = previous.assets.find(
      (item) => item.id === asset.id && item.dataUrl === asset.dataUrl,
    );
    const imported = existing || {
      ...asset,
      id: previous.assets.some((item) => item.id === asset.id) ? id() : asset.id,
    };
    const item = {
      ...makeObject(asset.kind === "glb" ? "model" : "artboard", asset.name),
      assetId: imported.id,
    };
    commit({
      ...previous,
      assets: existing ? previous.assets : [...previous.assets, imported],
      objects: [...previous.objects, item],
    });
    setSelected(item.id);
    setScenePage(Math.floor((projectRef.current.objects.length - 1) / scenePageSize));
    setSide("scene");
    setMobilePanel("view");
    setNotice(`${item.name} added to the scene.`);
  }
  function refreshArtboard(asset: GameAsset) {
    if (!asset.source) return;
    const latest = artboards.find(
      (item) =>
        item.source?.projectId === asset.source?.projectId &&
        item.source?.screenId === asset.source?.screenId,
    );
    if (!latest || latest.dataUrl === asset.dataUrl) return;
    const count = projectRef.current.objects.filter((item) => item.assetId === asset.id).length;
    if (
      !window.confirm(
        `Refresh this Artboard image for ${count} scene instance${count === 1 ? "" : "s"}? Object transforms will be preserved.`,
      )
    )
      return;
    commit({
      ...projectRef.current,
      assets: projectRef.current.assets.map((item) =>
        item.id === asset.id ? { ...latest, id: asset.id } : item,
      ),
    });
    setNotice("Artboard snapshot refreshed. Object transforms were preserved.");
  }
  async function importModel(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    setNotice("Validating and loading model…");
    try {
      if (!file.name.toLowerCase().endsWith(".glb"))
        throw new Error(
          "Choose a .glb model. Separate .gltf files and other formats are not supported.",
        );
      if (file.size > MAX_ASSET_BYTES) throw new Error("Models must be 15 MB or smaller.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      validateGlb(bytes);
      const asset: GameAsset = {
        id: id(),
        name: file.name.slice(0, 160),
        kind: "glb",
        dataUrl: bytesToDataUrl(bytes, "model/gltf-binary"),
      };
      if (!scene.current) throw new Error("The 3D renderer is not ready.");
      await scene.current.preflight(asset);
      addAsset(asset);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The model could not be imported.");
      setNotice("Model import failed; the scene was not changed.");
    } finally {
      setBusy(false);
      if (modelFile.current) modelFile.current.value = "";
    }
  }
  async function save() {
    const current = projectRef.current;
    setBusy(true);
    setError("");
    try {
      const valid = validateProject(current);
      await saveGameProject(valid);
      localStorage.setItem("env-3d-last-project", valid.id);
      setProjects(await listGameProjects());
      if (projectRef.current === current) setDirty(false);
      setNotice("Project saved in this browser.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Project could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  function openProject(next: GameProject) {
    if (dirty && !window.confirm("Discard unsaved changes and open another project?")) return;
    try {
      const valid = validateProject(next);
      replace(valid, false);
      setSelected("");
      setScenePage(0);
      undo.current = [];
      redo.current = [];
      setHistoryVersion((v) => v + 1);
      setProjectMenu(false);
      setNotice("Project opened.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Project could not be opened.");
    }
  }
  function startNew(template?: GameTemplate) {
    if (dirty && !window.confirm("Discard unsaved changes and start a new project?")) return;
    replace(template ? starterProject(template) : blankProject(), true);
    setSelected("");
    setScenePage(0);
    undo.current = [];
    redo.current = [];
    setHistoryVersion((v) => v + 1);
    setProjectMenu(false);
    setTemplateMenu(false);
    setNotice(
      template
        ? "Starter template loaded. Save it as your own project."
        : "New empty project created.",
    );
  }
  async function openFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024)
        throw new Error("Project files must be 100 MB or smaller.");
      openProject(validateProject(JSON.parse(await file.text())));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The project file could not be opened.");
    } finally {
      if (projectFile.current) projectFile.current.value = "";
    }
  }
  function play() {
    try {
      if (!scene.current) throw new Error("The 3D renderer is not ready.");
      scene.current.assertReadyForGame(projectRef.current);
      const valid = validateProject(projectRef.current);
      setPlayHtml(previewHtml(valid));
      setMobilePanel("view");
      setPlaying(true);
      setPaused(false);
      setError("");
      setNotice("Starting game…");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The game could not start.");
    }
  }
  function stop() {
    setPlaying(false);
    setPaused(false);
    setPlayHtml("");
    setNotice("Game stopped. Your editor state is unchanged.");
  }
  function pause() {
    const next = !paused;
    iframe.current?.contentWindow?.postMessage(
      { source: "env-game-editor", action: "pause", paused: next },
      "*",
    );
    setPaused(next);
  }
  async function exportSceneGlb() {
    const current = projectRef.current;
    setBusy(true);
    setError("");
    setNotice("Preparing 3D model…");
    try {
      if (!scene.current) throw new Error("The 3D renderer is not ready.");
      const blob = await scene.current.exportSceneGlb(current);
      if (projectRef.current !== current)
        throw new Error("The scene changed during export. Please try again.");
      download(blob, `${safeName(current.name)}-scene.glb`);
      setNotice("3D model downloaded as GLB.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The 3D model could not be exported.");
      setNotice("Model export failed; the scene was not changed.");
    } finally {
      setBusy(false);
    }
  }
  async function build() {
    setBusy(true);
    setNotice("Preparing browser build…");
    setError("");
    try {
      const current = projectRef.current;
      if (!scene.current) throw new Error("The 3D renderer is not ready.");
      scene.current.assertReadyForGame(current);
      const bytes = await buildGame(current);
      if (projectRef.current !== current)
        throw new Error("The scene changed during the build. Please try again.");
      download(
        new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
        `${safeName(current.name)}-browser.zip`,
      );
      setNotice("Browser package downloaded. Open index.html from the extracted folder.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The browser build failed.");
      setNotice("Build failed; no package was downloaded.");
    } finally {
      setBusy(false);
    }
  }
  function exportGodot() {
    try {
      const current = projectRef.current;
      if (!scene.current) throw new Error("The 3D renderer is not ready.");
      scene.current.assertReadyForGame(current);
      const bytes = buildGodotProject(current);
      download(
        new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
        `${safeName(current.name)}-godot-source.zip`,
      );
      setProjectMenu(false);
      setError("");
      setNotice("Godot source project downloaded. Open project.godot in Godot 4.6.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not export the Godot project.");
    }
  }
  function deleteObject() {
    if (!object || !window.confirm(`Delete “${object.name}” from this scene? You can undo this.`))
      return;
    commit({
      ...projectRef.current,
      objects: projectRef.current.objects.filter((item) => item.id !== object.id),
    });
    setSelected("");
    setNotice("Object deleted. Use Undo to restore it.");
  }
  function duplicate() {
    if (!object) return;
    const copy = {
      ...object,
      id: id(),
      name: `${object.name} copy`.slice(0, 160),
      position: { ...object.position, x: object.position.x + 1 },
      player: false,
    };
    commit({ ...projectRef.current, objects: [...projectRef.current.objects, copy] });
    setSelected(copy.id);
    setScenePage(Math.floor((projectRef.current.objects.length - 1) / scenePageSize));
    setNotice("Object duplicated.");
  }
  void historyVersion;
  return (
    <section
      className="game-studio"
      aria-label="Artboard Studio"
      data-renderer-ready={rendererReady}
    >
      <header className="game-heading">
        <div>
          <div className="game-eyebrow">
            <Logo size="search" className="game-brand-logo" />
            <span>CREATIVE WORKSPACE</span>
            <span className="game-eyebrow-divider">/</span>
            <span>ARTBOARD STUDIO</span>
          </div>
          <h1>
            Make a world of your own<span>.</span>
          </h1>
          <p>Build a scene, bring in your designs, and play what you create.</p>
        </div>
        <a className="game-back-link" href="/tools/developer">
          ← Developer tools
        </a>
      </header>
      <div className="game-window">
        <div className="game-topbar">
          <div className="game-project-title">
            <div className="game-project-icon">
              <Box size={19} />
            </div>
            <div>
              <label htmlFor="game-project-name">PROJECT</label>
              <input
                id="game-project-name"
                aria-label="Project name"
                maxLength={100}
                value={project.name}
                disabled={playing}
                onChange={(event) =>
                  commit({ ...projectRef.current, name: event.target.value || "Untitled world" })
                }
              />
              <span>
                {dirty
                  ? "● Unsaved changes"
                  : projects.some((item) => item.id === project.id)
                    ? "✓ Saved locally"
                    : "Not saved yet"}
              </span>
            </div>
            <button
              ref={projectOptions}
              type="button"
              className="game-icon-button"
              aria-label="Project options"
              aria-expanded={projectMenu}
              disabled={playing}
              onClick={() => setProjectMenu(!projectMenu)}
            >
              <ChevronDown size={17} />
            </button>
            {projectMenu && (
              <div className="game-menu" role="dialog" aria-label="Project options menu">
                <strong>Projects</strong>
                <button onClick={() => startNew()}>
                  <FilePlus2 size={15} /> New empty project
                </button>
                <button
                  onClick={() => {
                    setProjectMenu(false);
                    setTemplateMenu(true);
                  }}
                >
                  <Grid2X2 size={15} /> New from starter template
                </button>
                <button
                  onClick={() => {
                    setProjectMenu(false);
                    projectFile.current?.click();
                  }}
                >
                  <FolderOpen size={15} /> Open project JSON
                </button>
                <button
                  onClick={() => {
                    try {
                      const valid = validateProject(project);
                      download(
                        new Blob([JSON.stringify(valid, null, 2)], { type: "application/json" }),
                        `${safeName(project.name)}.env3d.json`,
                      );
                      setNotice("Project JSON downloaded.");
                      setProjectMenu(false);
                    } catch (reason) {
                      setError(
                        reason instanceof Error ? reason.message : "Could not export project.",
                      );
                    }
                  }}
                >
                  <Download size={15} /> Export project JSON
                </button>
                <button onClick={exportGodot}>
                  <Download size={15} /> Export Godot project
                </button>
                <div className="game-menu-label">SAVED IN THIS BROWSER</div>
                {projects.length ? (
                  projects
                    .slice(currentProjectPage * pageSize, (currentProjectPage + 1) * pageSize)
                    .map((item) => (
                      <button key={item.id} onClick={() => openProject(item)}>
                        <FolderOpen size={15} />
                        <span className="game-object-name">{item.name}</span>
                      </button>
                    ))
                ) : (
                  <p>No saved projects yet.</p>
                )}
                {projectLastPage > 0 && (
                  <div className="game-pager">
                    <button
                      aria-label="Previous saved projects"
                      disabled={currentProjectPage === 0}
                      onClick={() => setProjectPage(currentProjectPage - 1)}
                    >
                      ←
                    </button>
                    <span>
                      {currentProjectPage + 1} / {projectLastPage + 1}
                    </span>
                    <button
                      aria-label="Next saved projects"
                      disabled={currentProjectPage === projectLastPage}
                      onClick={() => setProjectPage(currentProjectPage + 1)}
                    >
                      →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="game-main-actions">
            <div className="game-history">
              <button
                className="game-icon-button"
                aria-label="Undo"
                title="Undo (Ctrl/⌘ Z)"
                disabled={!undo.current.length || playing}
                onClick={runUndo}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="game-icon-button"
                aria-label="Redo"
                title="Redo (Ctrl/⌘ Shift Z)"
                disabled={!redo.current.length || playing}
                onClick={runRedo}
              >
                <Redo2 size={17} />
              </button>
            </div>
            <button
              className="game-button game-button-quiet"
              aria-label="Save"
              title="Save project"
              disabled={busy || playing}
              onClick={() => void save()}
            >
              <Save size={16} />
              <span>Save</span>
            </button>
            {playing ? (
              <>
                <button
                  className="game-button game-button-quiet"
                  aria-label={paused ? "Resume" : "Pause"}
                  title={paused ? "Resume" : "Pause"}
                  onClick={pause}
                >
                  <Pause size={15} />
                  <span>{paused ? "Resume" : "Pause"}</span>
                </button>
                <button
                  className="game-button game-button-stop"
                  aria-label="Stop"
                  title="Stop game"
                  onClick={stop}
                >
                  <Square size={14} fill="currentColor" />
                  <span>Stop</span>
                </button>
              </>
            ) : (
              <button
                className="game-button game-button-play"
                aria-label="Play"
                title="Play game"
                disabled={busy}
                onClick={play}
              >
                <Play size={15} fill="currentColor" />
                <span>Play</span>
              </button>
            )}
            <button
              className="game-button game-button-dark"
              aria-label="Build browser"
              title="Build browser game"
              disabled={busy || playing}
              onClick={() => void build()}
            >
              <Download size={15} />
              <span>Build browser</span>
            </button>
            <button
              className="game-icon-button"
              aria-label="Help"
              aria-expanded={help}
              onClick={() => setHelp(!help)}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </div>
        {help && (
          <div className="game-help" role="dialog" aria-label="Studio help">
            <button
              className="game-icon-button"
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={16} />
            </button>
            <strong>Make your first world</strong>
            <p>
              Add shapes or use the starter template. Select an object to edit it. Drag to orbit;
              scroll to zoom.
            </p>
            <p>
              Send an Artboard or import a GLB. Mark a shape as the player, then press Play. Save
              locally or export project JSON.
            </p>
            <p>Keys: Q / W / E / R switch tools; F focuses selection.</p>
          </div>
        )}
        <div className="game-workspace" data-mobile-panel={mobilePanel}>
          <aside className="game-sidebar game-left" aria-label="Scene and assets">
            <div className="game-tabs">
              <button
                className={side === "scene" ? "active" : ""}
                aria-pressed={side === "scene"}
                onClick={() => {
                  setSide("scene");
                  setMobilePanel("scene");
                }}
              >
                Scene
              </button>
              <button
                className={side === "assets" ? "active" : ""}
                aria-pressed={side === "assets"}
                onClick={() => {
                  setSide("assets");
                  setMobilePanel("assets");
                }}
              >
                Assets
              </button>
              <button
                className="game-drawer-close"
                aria-label="Close panel"
                onClick={() => setMobilePanel("view")}
              >
                <X size={16} />
              </button>
            </div>
            {side === "scene" ? (
              <>
                <div className="game-panel-heading">
                  <div>
                    <span>SCENE HIERARCHY</span>
                    <strong>
                      Objects <small>{project.objects.length}</small>
                    </strong>
                  </div>
                  <button
                    className="game-icon-button"
                    title="Add cube"
                    aria-label="Add cube"
                    disabled={playing}
                    onClick={() => add("box")}
                  >
                    <Plus size={17} />
                  </button>
                </div>
                <div className="game-scene-list">
                  <div className="game-scene-items" ref={setSceneListElement}>
                    {visibleObjects.length ? (
                      visibleObjects.map((item) => (
                        <button
                          key={item.id}
                          className={selected === item.id ? "selected" : ""}
                          onClick={() => {
                            setSelected(item.id);
                            setMobilePanel("inspector");
                          }}
                        >
                          <span className="game-tree-icon">
                            {item.kind === "artboard" ? <Image size={15} /> : <Box size={15} />}
                          </span>
                          <span className="game-object-name">{item.name}</span>
                          {item.player && <span className="game-player-chip">PLAYER</span>}
                          {!item.visible && <EyeOff size={13} />}
                          {item.locked && <LockKeyhole size={13} />}
                        </button>
                      ))
                    ) : (
                      <div className="game-empty">
                        <BoxSelect size={22} />
                        <strong>Your scene is empty</strong>
                        <p>Add a shape below or open a starter template from Project options.</p>
                      </div>
                    )}
                  </div>
                  {sceneLastPage > 0 && (
                    <div className="game-pager">
                      <button
                        aria-label="Previous scene objects"
                        disabled={currentScenePage === 0}
                        onClick={() => setScenePage(currentScenePage - 1)}
                      >
                        ←
                      </button>
                      <span>
                        {currentScenePage + 1} / {sceneLastPage + 1}
                      </span>
                      <button
                        aria-label="Next scene objects"
                        disabled={currentScenePage === sceneLastPage}
                        onClick={() => setScenePage(currentScenePage + 1)}
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>
                <div className="game-add-objects">
                  <span>ADD TO SCENE</span>
                  <div>
                    <button disabled={playing} onClick={() => add("box")}>
                      <Box size={16} /> Cube
                    </button>
                    <button disabled={playing} onClick={() => add("sphere")}>
                      <span className="game-shape-circle" /> Sphere
                    </button>
                    <button disabled={playing} onClick={() => add("cylinder")}>
                      <span className="game-shape-cylinder" /> Cylinder
                    </button>
                    <button disabled={playing} onClick={() => add("ground")}>
                      <Grid2X2 size={16} /> Ground
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="game-panel-heading">
                  <div>
                    <span>YOUR LIBRARY</span>
                    <strong>Assets</strong>
                  </div>
                  <button
                    className="game-icon-button"
                    title="Export scene as GLB"
                    aria-label="Export scene as GLB"
                    disabled={busy || playing || !rendererReady}
                    onClick={() => void exportSceneGlb()}
                  >
                    <Download size={17} />
                  </button>
                </div>
                <div className="game-assets">
                  <button
                    className="game-import"
                    disabled={busy || playing}
                    onClick={() => modelFile.current?.click()}
                  >
                    <Upload size={18} />
                    <strong>Import GLB</strong>
                    <small>Self-contained · up to 15 MB</small>
                  </button>
                  <div className="game-asset-tabs">
                    <button
                      className={assetTab === "artboards" ? "active" : ""}
                      aria-pressed={assetTab === "artboards"}
                      onClick={() => {
                        setAssetTab("artboards");
                        setAssetPage(0);
                      }}
                    >
                      Artboard ({artboards.length})
                    </button>
                    <button
                      className={assetTab === "project" ? "active" : ""}
                      aria-pressed={assetTab === "project"}
                      onClick={() => {
                        setAssetTab("project");
                        setAssetPage(0);
                      }}
                    >
                      In project ({project.assets.length})
                    </button>
                  </div>
                  <div className="game-asset-items">
                    {visibleAssets.length ? (
                      visibleAssets.map((asset) =>
                        assetTab === "artboards" ? (
                          <div className="game-asset" key={asset.id}>
                            <img src={asset.dataUrl} alt="" />
                            <div>
                              <strong>{asset.name}</strong>
                              <small>
                                2D image · {asset.width} × {asset.height}
                              </small>
                            </div>
                            <button
                              disabled={playing}
                              onClick={() => addAsset(asset)}
                              aria-label={`Add ${asset.name} to scene`}
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="game-project-asset" key={asset.id}>
                            <span>
                              {asset.kind === "glb" ? <Box size={15} /> : <Image size={15} />}
                            </span>
                            <div>
                              <strong>{asset.name}</strong>
                              <small>
                                {asset.kind === "glb" ? "GLB model" : "Artboard snapshot"}
                              </small>
                            </div>
                            {asset.kind === "artboard" &&
                              asset.source &&
                              artboards.some(
                                (item) =>
                                  item.source?.projectId === asset.source?.projectId &&
                                  item.source?.screenId === asset.source?.screenId &&
                                  item.dataUrl !== asset.dataUrl,
                              ) && (
                                <button
                                  disabled={playing}
                                  onClick={() => refreshArtboard(asset)}
                                  aria-label={`Refresh ${asset.name} from Artboard`}
                                  title="Refresh from Artboard"
                                >
                                  ↻
                                </button>
                              )}
                            <button
                              disabled={playing}
                              onClick={() => addAsset(asset)}
                              aria-label={`Add another ${asset.name}`}
                            >
                              <Plus size={15} />
                            </button>
                          </div>
                        ),
                      )
                    ) : (
                      <div className="game-asset-empty">
                        {assetTab === "artboards" ? (
                          <>
                            No Artboards sent yet.{" "}
                            <a href="/tools/developer/ux-ui-studio">Open UX/UI Studio ↗</a>
                          </>
                        ) : (
                          "Imported assets appear here."
                        )}
                      </div>
                    )}
                  </div>
                  {assetLastPage > 0 && (
                    <div className="game-pager">
                      <button
                        aria-label="Previous assets"
                        disabled={currentAssetPage === 0}
                        onClick={() => setAssetPage(currentAssetPage - 1)}
                      >
                        ←
                      </button>
                      <span>
                        {currentAssetPage + 1} / {assetLastPage + 1}
                      </span>
                      <button
                        aria-label="Next assets"
                        disabled={currentAssetPage === assetLastPage}
                        onClick={() => setAssetPage(currentAssetPage + 1)}
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>
          <main className="game-center">
            <div className="game-viewport-header">
              <div>
                <strong>Scene view</strong>
                <span>Perspective</span>
              </div>
              <div>
                <span className="game-viewport-hint">Drag to orbit · scroll to zoom</span>
                <button
                  className="game-icon-button"
                  title="Focus selected (F)"
                  aria-label="Focus selected object"
                  disabled={!object || playing}
                  onClick={() => scene.current?.focus()}
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            </div>
            <div className="game-viewport">
              <canvas ref={canvas} aria-label="3D scene viewport" tabIndex={0} />
              <div className="game-toolstrip" role="toolbar" aria-label="Transform tools">
                {(
                  [
                    ["select", BoxSelect, "Select (Q)"],
                    ["move", Move3d, "Move (W)"],
                    ["rotate", Rotate3d, "Rotate (E)"],
                    ["scale", Scaling, "Scale (R)"],
                  ] as const
                ).map(([value, Icon, label]) => (
                  <button
                    key={value}
                    className={mode === value ? "active" : ""}
                    aria-label={label}
                    title={label}
                    aria-pressed={mode === value}
                    disabled={playing}
                    onClick={() => setMode(value)}
                  >
                    <Icon size={18} />
                  </button>
                ))}
              </div>
              <div className="game-view-badge">
                <span className="game-view-dot" /> EDITOR VIEW <span>·</span>{" "}
                {project.objects.length} OBJECTS
              </div>
              {playing && (
                <div className="game-play-frame">
                  <iframe
                    ref={iframe}
                    title="Playable game preview"
                    sandbox="allow-scripts"
                    srcDoc={playHtml}
                  />
                </div>
              )}
            </div>
            <div className="game-status">
              <span className={error ? "game-status-error" : "game-status-dot"} />
              <span role={error ? "alert" : "status"} title={error || notice}>
                {error || notice}
              </span>
              <span className="game-status-right">WEBGL · LOCAL PROJECT</span>
            </div>
          </main>
          <aside className="game-sidebar game-right" aria-label="Object inspector">
            <div className="game-inspector-title">
              <div>
                <span>PROPERTIES</span>
                <strong>Inspector</strong>
              </div>
              <button
                className="game-drawer-close game-icon-button"
                aria-label="Close inspector"
                onClick={() => setMobilePanel("view")}
              >
                <X size={16} />
              </button>
              <Crosshair className="game-inspector-crosshair" size={17} />
            </div>
            {object ? (
              <fieldset className="game-inspector" disabled={playing}>
                <div className="game-selected-object">
                  <span>
                    <Box size={18} />
                  </span>
                  <div>
                    <strong>{object.name}</strong>
                    <small>
                      {object.kind === "artboard"
                        ? "Artboard image plane"
                        : object.kind === "model"
                          ? "GLB model"
                          : object.kind}
                    </small>
                  </div>
                </div>
                <div className="game-inspector-tabs" role="group" aria-label="Property section">
                  <button
                    className={inspectorTab === "transform" ? "active" : ""}
                    aria-pressed={inspectorTab === "transform"}
                    onClick={() => setInspectorTab("transform")}
                  >
                    Transform
                  </button>
                  <button
                    className={inspectorTab === "appearance" ? "active" : ""}
                    aria-pressed={inspectorTab === "appearance"}
                    onClick={() => setInspectorTab("appearance")}
                  >
                    Appearance
                  </button>
                  <button
                    className={inspectorTab === "gameplay" ? "active" : ""}
                    aria-pressed={inspectorTab === "gameplay"}
                    onClick={() => setInspectorTab("gameplay")}
                  >
                    Gameplay
                  </button>
                </div>
                <div className="game-inspector-content">
                  {inspectorTab === "transform" && (
                    <>
                      <div
                        className="game-transform-tabs"
                        role="group"
                        aria-label="Transform property"
                      >
                        <button
                          className={transformTab === "position" ? "active" : ""}
                          aria-pressed={transformTab === "position"}
                          onClick={() => setTransformTab("position")}
                        >
                          Position
                        </button>
                        <button
                          className={transformTab === "rotation" ? "active" : ""}
                          aria-pressed={transformTab === "rotation"}
                          onClick={() => setTransformTab("rotation")}
                        >
                          Rotation
                        </button>
                        <button
                          className={transformTab === "scale" ? "active" : ""}
                          aria-pressed={transformTab === "scale"}
                          onClick={() => setTransformTab("scale")}
                        >
                          Scale
                        </button>
                      </div>
                      <fieldset className="game-transform-fields" disabled={object.locked}>
                        {transformTab === "position" && (
                          <VectorField
                            label="Position"
                            value={object.position}
                            onChange={(value) => patchObject(object.id, { position: value })}
                          />
                        )}
                        {transformTab === "rotation" && (
                          <VectorField
                            label="Rotation (degrees)"
                            value={object.rotation}
                            onChange={(value) => patchObject(object.id, { rotation: value })}
                          />
                        )}
                        {transformTab === "scale" && (
                          <VectorField
                            label="Scale"
                            positive
                            value={object.scale}
                            onChange={(value) => patchObject(object.id, { scale: value })}
                          />
                        )}
                      </fieldset>
                    </>
                  )}
                  {inspectorTab === "appearance" && (
                    <>
                      <label className="game-field">
                        Name
                        <input
                          aria-label="Object name"
                          maxLength={160}
                          value={object.name}
                          onChange={(event) =>
                            patchObject(object.id, { name: event.target.value || "Object" })
                          }
                        />
                      </label>
                      {object.kind !== "model" && object.kind !== "artboard" && (
                        <label className="game-color-field">
                          Color{" "}
                          <span>
                            <input
                              aria-label="Object color"
                              type="color"
                              value={object.color}
                              onChange={(event) =>
                                patchObject(object.id, { color: event.target.value })
                              }
                            />{" "}
                            {object.color.toUpperCase()}
                          </span>
                        </label>
                      )}
                      <div className="game-toggle-row">
                        <span>Visible</span>
                        <button
                          aria-label="Toggle object visibility"
                          aria-pressed={object.visible}
                          onClick={() => patchObject(object.id, { visible: !object.visible })}
                        >
                          {object.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                          {object.visible ? "On" : "Off"}
                        </button>
                      </div>
                      <div className="game-toggle-row">
                        <span>Locked</span>
                        <button
                          aria-label="Toggle object lock"
                          aria-pressed={object.locked}
                          onClick={() => patchObject(object.id, { locked: !object.locked })}
                        >
                          {object.locked ? (
                            <LockKeyhole size={16} />
                          ) : (
                            <LockKeyholeOpen size={16} />
                          )}
                          {object.locked ? "On" : "Off"}
                        </button>
                      </div>
                    </>
                  )}
                  {inspectorTab === "gameplay" && (
                    <>
                      <label className="game-check">
                        <input
                          type="checkbox"
                          checked={object.collider}
                          onChange={(event) =>
                            patchObject(object.id, { collider: event.target.checked })
                          }
                        />{" "}
                        Solid obstacle <small>Player cannot pass through</small>
                      </label>
                      {["box", "sphere", "cylinder"].includes(object.kind) && (
                        <>
                          <label className="game-check">
                            <input
                              type="checkbox"
                              checked={object.player}
                              onChange={(event) =>
                                patchObject(object.id, {
                                  player: event.target.checked,
                                  collider: event.target.checked ? false : object.collider,
                                })
                              }
                            />{" "}
                            Player character <small>One player per scene</small>
                          </label>
                          {object.player && (
                            <label className="game-field">
                              Movement speed
                              <input
                                type="number"
                                min="0.1"
                                max="20"
                                step="0.1"
                                value={object.speed}
                                onChange={(event) =>
                                  patchObject(object.id, {
                                    speed: Math.max(
                                      0.1,
                                      Math.min(20, Number(event.target.value) || 0.1),
                                    ),
                                  })
                                }
                              />
                            </label>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
                <div className="game-object-actions">
                  <button onClick={duplicate}>
                    <Copy size={15} /> Duplicate
                  </button>
                  <button onClick={deleteObject}>
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              </fieldset>
            ) : (
              <div className="game-inspector-empty">
                <div>
                  <Crosshair size={23} />
                </div>
                <strong>Nothing selected</strong>
                <p>Select an object in your scene to adjust its properties.</p>
              </div>
            )}
          </aside>
          <nav className="game-mobile-nav" aria-label="Workspace panels">
            <button
              className={mobilePanel === "view" ? "active" : ""}
              aria-pressed={mobilePanel === "view"}
              onClick={() => setMobilePanel("view")}
            >
              <Grid2X2 size={17} /> View
            </button>
            <button
              disabled={playing}
              className={mobilePanel === "scene" ? "active" : ""}
              aria-pressed={mobilePanel === "scene"}
              onClick={() => {
                setSide("scene");
                setMobilePanel("scene");
              }}
            >
              <Box size={17} /> Objects
            </button>
            <button
              disabled={playing}
              className={mobilePanel === "assets" ? "active" : ""}
              aria-pressed={mobilePanel === "assets"}
              onClick={() => {
                setSide("assets");
                setMobilePanel("assets");
              }}
            >
              <Image size={17} /> Assets
            </button>
            <button
              disabled={playing}
              className={mobilePanel === "inspector" ? "active" : ""}
              aria-pressed={mobilePanel === "inspector"}
              onClick={() => setMobilePanel("inspector")}
            >
              <Crosshair size={17} /> Inspect
            </button>
            <button
              className="game-mobile-history"
              aria-label="Undo"
              title="Undo"
              disabled={!undo.current.length || playing}
              onClick={runUndo}
            >
              <Undo2 size={17} />
            </button>
            <button
              className="game-mobile-history"
              aria-label="Redo"
              title="Redo"
              disabled={!redo.current.length || playing}
              onClick={runRedo}
            >
              <Redo2 size={17} />
            </button>
          </nav>
        </div>
      </div>
      {templateMenu && (
        <div
          ref={templateDialog}
          className="game-template-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-template-title"
        >
          <div className="game-template-heading">
            <div>
              <span>START A PROJECT</span>
              <strong id="game-template-title">Choose a starter world</strong>
            </div>
            <button
              className="game-icon-button"
              aria-label="Close templates"
              onClick={() => setTemplateMenu(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="game-template-list">
            {(
              [
                ["starter", "Starter world", "A player, ground and one obstacle."],
                ["courtyard", "Courtyard explorer", "A larger space with four solid pillars."],
                ["gallery", "Gallery room", "An empty room ready for your artwork."],
              ] as const
            ).map(([key, label, description]) => (
              <button key={key} onClick={() => startNew(key)}>
                <span className="game-template-icon">
                  <Box size={17} />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <input
        ref={modelFile}
        type="file"
        accept=".glb,model/gltf-binary"
        hidden
        onChange={(event) => void importModel(event.target.files?.[0])}
      />
      <input
        ref={projectFile}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => void openFile(event.target.files?.[0])}
      />
    </section>
  );
}
