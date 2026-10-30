import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import {
  Activity, ArrowDown, ArrowUp, ChevronLeft, CircleHelp, Download,
  Eye, FileUp, FlaskConical, Focus, Layers3, Pause, Play,
  Plus, RotateCcw, Save, StepForward, Trash2, Box, Circle, Cylinder,
} from "lucide-react";
import {
  advanceWorld, createLabObject, createWorldLabProject, describeLabObject,
  LAB_LIMITATIONS, LAB_MODEL, validateWorldLabProject, type LabShape,
  type WorldLabObject, type WorldLabProject,
} from "@/lib/world-lab/model";
import { loadWorldLabProjects, saveWorldLabProject } from "@/lib/world-lab/storage";
import { WorldLabViewer } from "./viewer";
import "./world-lab.css";

type Workspace = "explore" | "build" | "test";
const speedChoices = [0.1, 0.25, 1, 2, 4, 8];
const asNumber = (value: string, min: number, max: number): number | null => {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) && number >= min && number <= max ? number : null;
};
function downloadProject(project: WorldLabProject) {
  const data = JSON.stringify(validateWorldLabProject(project), null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "world-lab-" + project.id + ".json";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function WorldLabStudio() {
  const [project, setProject] = useState<WorldLabProject>(createWorldLabProject);
  const current = useRef(project);
  current.current = project;
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<WorldLabViewer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const baseline = useRef<WorldLabProject>(project);
  const history = useRef<WorldLabProject[]>([]);
  const [selected, setSelected] = useState("");
  const [workspace, setWorkspace] = useState<Workspace>("explore");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [seeInside, setSeeInside] = useState(0);
  const [showVectors, setShowVectors] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("An illustrative Earth-like test site. Nothing here is a measured location.");
  const [help, setHelp] = useState(false);
  const chosen = project.objects.find(item => item.id === selected);
  const diagnostics = chosen ? describeLabObject(chosen, project) : null;

  useEffect(() => {
    if (!canvas.current) return;
    let scene: WorldLabViewer | null = null;
    try {
      scene = new WorldLabViewer(canvas.current, { select: setSelected, error: setError });
      viewer.current = scene;
      setReady(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The 3D environment could not start.");
    }
    return () => {
      viewer.current = null;
      scene?.dispose();
    };
  }, []);

  useEffect(() => {
    viewer.current?.sync(project, selected, seeInside, showVectors);
  }, [project, selected, seeInside, showVectors, ready]);

  useEffect(() => {
    let mounted = true;
    loadWorldLabProjects().then(projects => {
      if (!mounted || projects.length === 0 || current.current.objects.length > 0) return;
      const restored = projects[0];
      setProject(restored);
      baseline.current = restored;
      setNotice("Restored a locally saved experiment. Results are model predictions.");
    }).catch(() => {
      if (mounted) setNotice("Local storage is unavailable. Use Download project to keep a backup.");
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      saveWorldLabProject(current.current).catch(() => {
        setNotice("Automatic save failed. Please download your project as a backup.");
      });
    }, 8000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = 0;
    let lastRecorded = project.elapsedSeconds;
    const update = (now: number) => {
      if (!previous) previous = now;
      const elapsed = Math.min(0.05, (now - previous) / 1000) * speed;
      previous = now;
      if (elapsed > 0) {
        setProject(old => {
          if (old.elapsedSeconds - lastRecorded >= 0.2) {
            history.current.push(old);
            if (history.current.length > 100) history.current.shift();
            lastRecorded = old.elapsedSeconds;
          }
          return advanceWorld(old, Math.min(1, elapsed));
        });
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  const applyEdit = (update: (old: WorldLabProject) => WorldLabProject) => {
    setPlaying(false);
    history.current = [];
    setProject(old => {
      const next = { ...update(old), elapsedSeconds: 0 };
      baseline.current = next;
      return next;
    });
  };
  const editObject = (id: string, mutate: (o: WorldLabObject) => WorldLabObject) => {
    applyEdit(p => ({ ...p, objects: p.objects.map(o => o.id === id ? mutate(o) : o) }));
  };
  const addObject = (kind: LabShape) => {
    const item = createLabObject(kind, { x: (project.objects.length % 5) * 2 - 3, y: 3, z: 5 });
    applyEdit(p => ({ ...p, objects: [...p.objects, item] }));
    setSelected(item.id);
    setWorkspace("build");
    setNotice("Created a physical object with user-assumed material properties.");
  };
  const reset = () => {
    setPlaying(false);
    history.current = [];
    setProject(baseline.current);
    setNotice("Experiment returned to its recorded starting conditions.");
  };
  const save = async () => {
    try {
      await saveWorldLabProject(current.current);
      setNotice("Project saved on this device. Download a copy for portability.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your project.");
    }
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1024 * 1024) { setError("Project file exceeds the 1 MB safety limit."); return; }
    try {
      const imported = validateWorldLabProject(JSON.parse(await file.text()));
      setPlaying(false);
      setProject(imported);
      baseline.current = imported;
      history.current = [];
      setSelected("");
      setNotice("World Lab project imported. Review all assumed parameters before testing.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The file is not a valid World Lab project.");
    }
  };

  return (
    <main className="world-lab" aria-label="The World Lab">
      <header className="world-lab-header">
        <div className="world-lab-identity"><Logo /><div><h1>The World Lab</h1><p>Explore • Create • Experiment</p></div></div>
        <div className="world-lab-header-actions">
          <button type="button" onClick={save} title="Save locally"><Save size={17} /> <span>Save</span></button>
          <button type="button" onClick={() => downloadProject(project)} title="Download project"><Download size={17} /> <span>Export</span></button>
          <button type="button" onClick={() => fileInput.current?.click()} title="Import World Lab JSON"><FileUp size={17} /> <span>Import</span></button>
          <input ref={fileInput} hidden type="file" accept=".json,application/json" aria-label="Import World Lab project" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void importFile(f); }} />
          <button type="button" onClick={() => setHelp(v => !v)} aria-expanded={help} aria-label="Help"><CircleHelp size={18} /></button>
        </div>
      </header>
      {help && <section className="world-lab-message" aria-label="Getting started">
        Drag in the 3D view to look around. Scroll or pinch to move toward what you see—even into the ground. On desktop use WASD and arrow keys. Build adds physical objects; Test runs a bounded mechanics calculation. The geological layers are illustrative, not local survey data.
      </section>}
      {error && <div className="world-lab-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      <div className="world-lab-layout">
        <section className="world-lab-stage" aria-label="Interactive 3D world">
          <canvas ref={canvas} aria-label="3D observer camera world viewport" tabIndex={0} />
          {!ready && !error && <div className="world-lab-loading">Opening 3D world…</div>}
          <div className="world-lab-stage-top">
            <span className="world-lab-location">Earth-like test site · illustrative</span>
            <button type="button" onClick={() => viewer.current?.resetCamera()} title="Reset observer view"><Focus size={17}/> <span>Reset view</span></button>
          </div>
          <div className="world-lab-nav" aria-label="Camera movement">
            <button type="button" onClick={() => viewer.current?.move("forward")} aria-label="Move toward view"><ArrowUp size={18}/></button>
            <button type="button" onClick={() => viewer.current?.move("back")} aria-label="Move backward"><ChevronLeft size={18}/></button>
            <button type="button" onClick={() => viewer.current?.move("down")} aria-label="Move down"><ArrowDown size={18}/></button>
          </div>
          <div className="world-lab-modes" role="group" aria-label="Studio workspace">
            {(["explore", "build", "test"] as Workspace[]).map(key => (
              <button key={key} type="button" aria-pressed={workspace === key} onClick={() => setWorkspace(key)}>{key === "explore" ? <Eye size={16}/> : key === "build" ? <Plus size={16}/> : <FlaskConical size={16}/>} {key[0].toUpperCase() + key.slice(1)}</button>
            ))}
          </div>
        </section>
        <aside className="world-lab-panel">
          {workspace === "explore" && <section>
            <h2><Layers3 size={18}/> See Inside</h2>
            <p>Reveal the illustrated ground and see through objects. Move continuously through layers with the camera.</p>
            <label htmlFor="lab-see-inside">Transparency <strong>{seeInside}%</strong></label>
            <input id="lab-see-inside" type="range" min={0} max={95} value={seeInside} onChange={e => setSeeInside(Number(e.target.value))} />
            <label className="world-lab-check"><input type="checkbox" checked={showVectors} onChange={e => setShowVectors(e.target.checked)}/> Show selected applied force</label>
            <p className="world-lab-note">Soil and rock strata here are representative geometry, not mapped measurements of Earth's interior.</p>
          </section>}
          {workspace === "build" && <section>
            <h2><Box size={18}/> Build Something</h2>
            <p>Choose a shape. Give it your own material and test how it moves.</p>
            <div className="world-lab-build-actions">
              <button type="button" onClick={() => addObject("box")} disabled={project.objects.length >= 100}><Box size={20}/> Block</button>
              <button type="button" onClick={() => addObject("sphere")} disabled={project.objects.length >= 100}><Circle size={20}/> Ball</button>
              <button type="button" onClick={() => addObject("cylinder")} disabled={project.objects.length >= 100}><Cylinder size={20}/> Cylinder</button>
            </div>
          </section>}
          {workspace === "test" && <section>
            <h2><Activity size={18}/> Test & Time</h2>
            <p>Run or slow the experiment. Changing playback speed does not change physical laws.</p>
            <div className="world-lab-time-readout"><strong>{project.elapsedSeconds.toFixed(2)} s</strong><span>simulated time</span></div>
            <div className="world-lab-time-actions">
              <button type="button" onClick={() => setPlaying(v => !v)}><>{playing ? <Pause size={18}/> : <Play size={18}/>}</>{playing ? "Pause" : "Play"}</button>
              <button type="button" onClick={() => setProject(p => advanceWorld(p, 1 / 60))} disabled={playing} title="Step one 60th of a simulated second"><StepForward size={18}/> Step</button>
              <button type="button" onClick={reset}><RotateCcw size={18}/> Reset</button>
              <button type="button" onClick={() => { setPlaying(false); const snapshot = history.current.pop(); if (snapshot) setProject(snapshot); }} disabled={history.current.length === 0} title="Restore an earlier recorded snapshot">Earlier</button>
            </div>
            <label htmlFor="lab-time-speed">Time speed</label>
            <select id="lab-time-speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>
              {speedChoices.map(value => <option value={value} key={value}>{value}× {value < 1 ? "slow motion" : value > 1 ? "faster" : "normal"}</option>)}
            </select>
            <p className="world-lab-note">Earlier restores recorded snapshots; it does not reverse physical dynamics.</p>
          </section>}
          <section className="world-lab-objects">
            <h2>Objects <span>{project.objects.length}</span></h2>
            {project.objects.length === 0 ? <p>Add a block or ball from Build to start an experiment.</p> :
              <div className="world-lab-object-list">{project.objects.map(item =>
                <button key={item.id} type="button" className={selected === item.id ? "active" : ""} onClick={() => setSelected(item.id)} aria-pressed={selected === item.id}>{item.name} <small>{item.kind}</small></button>)}</div>}
          </section>
          {chosen && diagnostics && <section className="world-lab-inspector">
            <h2>Inside: {chosen.name}</h2>
            <p className="world-lab-note">Material properties are user assumptions, not verified measurements.</p>
            <label htmlFor="lab-material-density">Material density · kg/m³</label>
            <input id="lab-material-density" type="number" min={1} max={50000} step={100} value={chosen.material.densityKgM3}
              onChange={e => { const v = asNumber(e.target.value, 1, 50000); if (v !== null) editObject(chosen.id, o => ({ ...o, material: { ...o.material, densityKgM3: v } })); }} />
            <label htmlFor="lab-object-height">Object center height · metres</label>
            <input id="lab-object-height" type="number" step={0.25} min={-10000} max={10000} value={Number(chosen.positionM.y.toFixed(3))}
              onChange={e => { const v = asNumber(e.target.value, 0.1, 10000); if (v !== null) editObject(chosen.id, o => ({ ...o, positionM: { ...o.positionM, y: v }, velocityMps: { x: 0, y: 0, z: 0 } })); }} />
            <label htmlFor="lab-force-y">Applied upward force · newtons</label>
            <input id="lab-force-y" type="number" step={100} min={-100000} max={100000} value={chosen.forceN.y}
              onChange={e => { const v = asNumber(e.target.value, -100000, 100000); if (v !== null) editObject(chosen.id, o => ({ ...o, forceN: { ...o.forceN, y: v } })); }} />
            <div className="world-lab-measurements">
              <span>Mass <strong>{diagnostics.massKg.toFixed(2)} kg</strong></span>
              <span>Speed <strong>{diagnostics.speedMps.toFixed(2)} m/s</strong></span>
              <span>Motion energy <strong>{diagnostics.kineticEnergyJ.toFixed(2)} J</strong></span>
              <span>Height energy <strong>{diagnostics.gravitationalEnergyJ.toFixed(2)} J</strong></span>
            </div>
            <button className="world-lab-delete" type="button" onClick={() => { applyEdit(p => ({ ...p, objects: p.objects.filter(o => o.id !== chosen.id) })); setSelected(""); }}><Trash2 size={16}/> Remove object</button>
          </section>}
          <section className="world-lab-model-notes">
            <strong>Science status: Computed / illustrative</strong>
            <p>Solver: {LAB_MODEL}. {LAB_LIMITATIONS}</p>
          </section>
        </aside>
      </div>
      <footer className="world-lab-status" aria-live="polite">{notice}</footer>
    </main>
  );
}
