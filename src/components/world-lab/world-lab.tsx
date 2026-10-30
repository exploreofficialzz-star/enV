import { useEffect, useMemo, useRef, useState } from "react";
import * as B from "babylonjs";
import {
  blankWorldLabProject, importLegacyGameScene, newSolid, parseWorldLabProject,
  readWorldLabProjectJson, serializeWorldLabProject, solidQuantities,
  type WorldLabEntity, type WorldLabProject,
} from "@/lib/world-lab/project";
import { listLocalWorldLabProjects, putLocalWorldLabProject } from "@/lib/world-lab/local-storage";
import {
  advancePlayback, DEMO_DURATION_SECONDS, runExperiment, sampleRun, validateNovelMaterial,
  type DampedOscillator, type LabRun, type ModelInput, type RCCircuit, type NovelMaterial,
} from "@/lib/world-lab/model";

type SceneHandles = {
  engine: B.Engine;
  scene: B.Scene;
  device: B.Mesh;
  circuit: B.Mesh;
  deviceMaterial: B.StandardMaterial;
  circuitMaterial: B.StandardMaterial;
  addedShapes: Map<string, B.Mesh>;
};
const STORAGE_KEY = "env-world-lab-reference-v1";
const defaultMechanical: DampedOscillator = {
  kind: "damped-oscillator", massKg: 1, springNPerM: 4,
  dampingNsPerM: 0.5, initialDisplacementM: 0.5, initialVelocityMPerS: 0,
};
const defaultCircuit: RCCircuit = {
  kind: "rc-circuit", resistanceOhm: 1000,
  capacitanceF: 0.001, supplyVoltageV: 10, initialVoltageV: 0,
};
function metric(value: number | undefined, unit: string): string {
  return value === undefined ? "Not calculated" : value.toPrecision(5) + " " + unit;
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export default function WorldLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneHandles | null>(null);
  const lastFrame = useRef<number | null>(null);
  const [graphicsError, setGraphicsError] = useState("");
  const [modelKind, setModelKind] = useState<ModelInput["kind"]>("damped-oscillator");
  const [mechanical, setMechanical] = useState(defaultMechanical);
  const [circuit, setCircuit] = useState(defaultCircuit);
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [runId, setRunId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [seeInside, setSeeInside] = useState(false);
  const [opacity, setOpacity] = useState(55);
  const [project, setProject] = useState<WorldLabProject | null>(null);
  const [savedProjects, setSavedProjects] = useState<WorldLabProject[]>([]);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const shapeCount = project?.entities.length ?? 0;
  const [materialName, setMaterialName] = useState("");
  const [density, setDensity] = useState("");
  const materials = project?.materials ?? [];
  const selectedEntity = project?.entities.find(entity => entity.id === selectedEntityId) ?? null;
  const selectedMaterial = materials.find(material => material.id === selectedEntity?.materialId);
  const selectedQuantities = selectedEntity ? solidQuantities(selectedEntity, selectedMaterial) : null;
  const [message, setMessage] = useState("Choose an experiment and press Start to calculate a real reference trajectory.");
  const [error, setError] = useState("");
  const currentRun = useMemo(() => runs.find((run) => run.id === runId) ?? null, [runs, runId]);
  const sample = currentRun ? sampleRun(currentRun, timeSeconds) : null;

  useEffect(() => {
    try {
      const json = window.localStorage.getItem(STORAGE_KEY);
      if (!json) return;
      const saved: unknown = JSON.parse(json);
      if (!saved || typeof saved !== "object") return;
      const record = saved as Record<string, unknown>;
      if (record.format !== "env-world-lab-local" || record.version !== 1) return;
      if (record.modelKind === "rc-circuit" || record.modelKind === "damped-oscillator") setModelKind(record.modelKind);
      if (record.mechanical && typeof record.mechanical === "object") {
        const x = record.mechanical as Partial<DampedOscillator>;
        if (x.kind === "damped-oscillator" && Object.values(x).every((v) => typeof v === "string" || Number.isFinite(v))) {
          setMechanical({ ...defaultMechanical, ...x });
        }
      }
      if (record.circuit && typeof record.circuit === "object") {
        const x = record.circuit as Partial<RCCircuit>;
        if (x.kind === "rc-circuit" && Object.values(x).every((v) => typeof v === "string" || Number.isFinite(v))) {
          setCircuit({ ...defaultCircuit, ...x });
        }
      }
      // Legacy shapeCount is migrated only if no structured project already exists.
    } catch {
      setMessage("The old local workspace was unreadable; a fresh workspace opened without overwriting it.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void listLocalWorldLabProjects().then(items => {
      if (!active) return;
      setSavedProjects(items);
      const latest = [...items].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
      if (latest) {
        setProject(latest);
        setSavedRevision(latest.revision);
        setMessage("Opened the most recently saved local World Lab project.");
      } else {
        const fresh = blankWorldLabProject(crypto.randomUUID(), new Date().toISOString());
        try {
          const old = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {shapeCount?:unknown};
          const count = typeof old.shapeCount === "number" && Number.isInteger(old.shapeCount)
            ? Math.min(Math.max(old.shapeCount,0),20) : 0;
          for (let i = 0; i < count; i++) fresh.entities.push(newSolid(crypto.randomUUID(), "box", i));
          if (count) setMessage("Restored your older visual shapes as a new portable local project.");
        } catch { /* Invalid legacy browser data must not prevent a new project. */ }
        setProject(fresh);
      }
    }).catch(() => {
      if (!active) return;
      setProject(blankWorldLabProject(crypto.randomUUID(), new Date().toISOString()));
      setMessage("Browser project storage is unavailable. You can still export a portable project JSON backup.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: B.Engine | undefined;
    let scene: B.Scene | undefined;
    let observer: ResizeObserver | undefined;
    try {
      if (!B.Engine.isSupported()) throw new Error("3D graphics are not supported on this device.");
      engine = new B.Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, true);
      scene = new B.Scene(engine);
      scene.clearColor = new B.Color4(0.7, 0.83, 0.95, 1);
      const camera = new B.UniversalCamera("observer-eye-level", new B.Vector3(0, 1.65, -8), scene);
      camera.setTarget(new B.Vector3(0, 1.2, 0));
      camera.minZ = 0.03;
      camera.speed = 0.3;
      camera.angularSensibility = 1400;
      camera.keysUp = [87, 38];
      camera.keysDown = [83, 40];
      camera.keysLeft = [65, 37];
      camera.keysRight = [68, 39];
      camera.attachControl(canvas, true);
      const ambient = new B.HemisphericLight("daylight", new B.Vector3(0, 1, 0), scene);
      ambient.intensity = 0.85;
      const sunlight = new B.DirectionalLight("sunlight", new B.Vector3(-0.4, -1, 0.6), scene);
      sunlight.intensity = 0.55;
      const ground = B.MeshBuilder.CreateGround("representative-ground", { width: 160, height: 160 }, scene);
      const groundMaterial = new B.StandardMaterial("ground", scene);
      groundMaterial.diffuseColor = B.Color3.FromHexString("#6D8E72");
      ground.material = groundMaterial;
      ground.isPickable = false;
      const device = B.MeshBuilder.CreateSphere("mechanical-demonstrator", { diameter: 0.85, segments: 24 }, scene);
      device.position = new B.Vector3(0.5, 1, 0);
      const deviceMaterial = new B.StandardMaterial("mechanical", scene);
      deviceMaterial.diffuseColor = B.Color3.FromHexString("#F2B877");
      device.material = deviceMaterial;
      const circuit = B.MeshBuilder.CreateBox("electrical-demonstrator", { size: 1 }, scene);
      circuit.position = new B.Vector3(0, 0.8, 0);
      const circuitMaterial = new B.StandardMaterial("electrical", scene);
      circuitMaterial.diffuseColor = B.Color3.FromHexString("#65B7CD");
      circuit.material = circuitMaterial;
      circuit.setEnabled(false);
      engine.runRenderLoop(() => scene?.render());
      observer = new ResizeObserver(() => engine?.resize());
      observer.observe(canvas);
      scene.onPointerObservable.add(info => {
        if (info.type !== B.PointerEventTypes.POINTERDOWN) return;
        const id = info.pickInfo?.pickedMesh?.metadata?.worldLabEntityId;
        if (typeof id === "string") setSelectedEntityId(id);
      });
      sceneRef.current = { engine, scene, device, circuit, deviceMaterial, circuitMaterial, addedShapes: new Map() };
    } catch (cause) {
      setGraphicsError(cause instanceof Error ? cause.message : "The 3D view could not be opened.");
      observer?.disconnect();
      scene?.dispose();
      engine?.dispose();
    }
    return () => {
      observer?.disconnect();
      sceneRef.current = null;
      scene?.dispose();
      engine?.dispose();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const mechanicalVisible = modelKind === "damped-oscillator";
    scene.device.setEnabled(mechanicalVisible);
    scene.circuit.setEnabled(!mechanicalVisible);
    scene.device.position.x = sample?.positionM ?? mechanical.initialDisplacementM;
    scene.deviceMaterial.alpha = seeInside ? opacity / 100 : 1;
    scene.circuitMaterial.alpha = seeInside ? opacity / 100 : 1;
    for (const [id, mesh] of scene.addedShapes) {
      if (!project?.entities.some(entity => entity.id === id)) {
        mesh.material?.dispose();
        mesh.dispose();
        scene.addedShapes.delete(id);
      }
    }
    for (const entity of project?.entities ?? []) {
      let mesh = scene.addedShapes.get(entity.id);
      if (!mesh || mesh.metadata?.worldLabShape !== entity.shape) {
        if (mesh) { mesh.material?.dispose(); mesh.dispose(); }
        mesh = entity.shape === "box"
          ? B.MeshBuilder.CreateBox(entity.id, { size: 1 }, scene.scene)
          : entity.shape === "sphere"
            ? B.MeshBuilder.CreateSphere(entity.id, { diameter: 1, segments: 18 }, scene.scene)
            : B.MeshBuilder.CreateCylinder(entity.id, { diameter: 1, height: 1, tessellation: 24 }, scene.scene);
        const material = new B.StandardMaterial("visual-material-" + entity.id, scene.scene);
        mesh.material = material;
        mesh.metadata = { worldLabEntityId: entity.id, worldLabShape: entity.shape };
        scene.addedShapes.set(entity.id, mesh);
      }
      mesh.position.copyFromFloats(...entity.positionMeters);
      mesh.scaling.copyFromFloats(...entity.dimensionsMeters);
      if (mesh.material instanceof B.StandardMaterial) {
        mesh.material.diffuseColor = B.Color3.FromHexString(entity.color);
        mesh.material.alpha = (seeInside ? opacity / 100 : 1) * entity.opacity;
      }
    }
  }, [modelKind, mechanical.initialDisplacementM, sample, seeInside, opacity, project]);

  useEffect(() => {
    if (!playing || !currentRun) return;
    let frame = 0;
    lastFrame.current = null;
    const tick = (now: number) => {
      if (lastFrame.current !== null) {
        const elapsed = Math.max(0, Math.min(0.25, (now - lastFrame.current) / 1000));
        setTimeSeconds((value) => advancePlayback(value, elapsed, playbackRate, currentRun.time.simulatedDurationSeconds));
      }
      lastFrame.current = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); lastFrame.current = null; };
  }, [playing, currentRun, playbackRate]);
  useEffect(() => {
    if (currentRun && timeSeconds >= currentRun.time.simulatedDurationSeconds) setPlaying(false);
  }, [currentRun, timeSeconds]);

  function changeMechanical<K extends keyof DampedOscillator>(key: K, value: DampedOscillator[K]) {
    setMechanical((current) => ({ ...current, [key]: value }));
    setDirty(true); setPlaying(false);
  }
  function changeCircuit<K extends keyof RCCircuit>(key: K, value: RCCircuit[K]) {
    setCircuit((current) => ({ ...current, [key]: value }));
    setDirty(true); setPlaying(false);
  }
  function start() {
    setError("");
    try {
      const input = modelKind === "damped-oscillator" ? mechanical : circuit;
      const next = runExperiment(input, {
        id: window.crypto.randomUUID(), parentRunId: currentRun?.id ?? null,
        worldDateUTC: new Date().toISOString(),
      });
      setRuns((previous) => [...previous.slice(-6), next]);
      setRunId(next.id);
      setTimeSeconds(0);
      setDirty(false);
      setPlaying(true);
      setMessage("Computed locally with a bounded scientific model. The 3D object is an illustration of solver output.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This experiment could not be calculated.");
    }
  }
  function mutateProject(transform: (current: WorldLabProject) => WorldLabProject) {
    setProject(current => current ? transform(current) : current);
    setWorkspaceDirty(true);
  }
  function addShape(shape: WorldLabEntity["shape"]) {
    if (!project || shapeCount >= 200) return;
    const item = newSolid(crypto.randomUUID(),shape,shapeCount);
    mutateProject(current=>({...current,entities:[...current.entities,item]}));
    setSelectedEntityId(item.id);
  }
  function editSelected(patch: Partial<WorldLabEntity>) {
    if (!selectedEntity) return;
    mutateProject(current=>({...current, entities:current.entities.map(e=>
      e.id===selectedEntity.id?{...e,...patch}:e)}));
  }
  async function save() {
    if (!project) return;
    setError("");
    try {
      const saved=await putLocalWorldLabProject(project,savedRevision);
      setProject(saved);
      setSavedRevision(saved.revision);
      setWorkspaceDirty(false);
      setSavedProjects(await listLocalWorldLabProjects());
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        format:"env-world-lab-local", version:1,modelKind,mechanical,circuit,
      }));
      setMessage("Saved on this device with revision protection. Cloud synchronization is not yet available.");
    } catch(cause) {
      setError(cause instanceof Error?cause.message:"Could not save this project. Export a JSON backup.");
    }
  }
  function exportProject() {
    if (!project) return;
    try {
      downloadJson("the-world-lab-project.json",JSON.parse(serializeWorldLabProject(project)));
      setMessage("Portable project exported. Run history is a separate scientific result export.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not export this project.");}
  }
  async function importProject(file: File | undefined) {
    if (!file) return;
    setError("");setImportWarnings([]);
    try{
      if (file.size>1024*1024) throw new Error("Import files must be no larger than 1 MB.");
      const json=await file.text();
      const data:unknown=JSON.parse(json);
      let imported:WorldLabProject;
      let warnings:string[]=[];
      if(data && typeof data==="object" && "format" in data && data.format==="env-3d-game"){
        const report=importLegacyGameScene(data,crypto.randomUUID(),new Date().toISOString());
        imported=report.project;
        warnings=report.warnings;
      }else imported=readWorldLabProjectJson(json);
      if(workspaceDirty && !window.confirm("Discard unsaved local edits and import a different project?")) return;
      const now=new Date().toISOString();
      setProject(parseWorldLabProject({...imported,id:crypto.randomUUID(),title:imported.title,
        revision:0,createdAt:now,updatedAt:now}));
      setSavedRevision(null);
      setWorkspaceDirty(true);
      setSelectedEntityId("");
      setRuns([]);setRunId("");setPlaying(false);setTimeSeconds(0);
      setImportWarnings(warnings);
      setMessage("Imported a local project copy. Save it to keep it on this device.");
    }catch(cause){setError(cause instanceof Error?cause.message:"This file could not be imported.");}
  }
  function openSavedProject(id:string){
    const saved=savedProjects.find(p=>p.id===id);
    if(!saved)return;
    if(workspaceDirty && !window.confirm("Discard unsaved local edits and open another project?"))return;
    setProject(saved);setSavedRevision(saved.revision);setWorkspaceDirty(false);
    setSelectedEntityId("");setRuns([]);setRunId("");setPlaying(false);setTimeSeconds(0);
    setMessage("Opened saved project "+saved.title+".");
  }
  function newProject(){
    if(workspaceDirty && !window.confirm("Discard unsaved local edits and create a new project?"))return;
    setProject(blankWorldLabProject(crypto.randomUUID(),new Date().toISOString()));
    setSavedRevision(null);setWorkspaceDirty(false);setSelectedEntityId("");
    setRuns([]);setRunId("");setPlaying(false);setTimeSeconds(0);
    setMessage("New local World Lab project created.");
  }
  function addMaterial() {
    try {
      const proposed = validateNovelMaterial({
        name: materialName.trim(), densityKgM3: density.trim() === "" ? null : Number(density),
        youngModulusPa: null, provenance: "hypothetical-user-assumed",
      });
      mutateProject(current=>({...current,materials:[...current.materials,{
        id:crypto.randomUUID(),name:proposed.name,
        densityKgM3:proposed.densityKgM3,youngModulusPa:proposed.youngModulusPa,
        evidence:proposed.provenance,
      }]}));
      setMaterialName(""); setDensity("");
      setMessage("Material proposal recorded as hypothetical. It is not connected to the solver.");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid material proposal.");
    }
  }
  const inputLabel = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-fg";
  const buttonClass = "rounded-lg border border-border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2";
  return (
    <section className="mx-auto w-full max-w-[1440px] px-3 py-5 sm:px-6" aria-label="The World Lab">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">enV · Scientific exploration</p>
          <h1 className="text-2xl font-semibold">The World Lab</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Explore a representative 3D environment and run two bounded scientific experiments.
            This reference workspace is not yet the complete World Lab or an engineering safety tool.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={newProject}>New project</button>
          <button type="button" className={buttonClass} onClick={() => void save()} disabled={!project}>Save on device</button>
          <button type="button" className={buttonClass} onClick={exportProject} disabled={!project}>Export project</button>
          <input ref={importInput} className="sr-only" type="file" accept=".json,application/json"
            aria-label="Import World Lab or legacy 3D project" onChange={event=>{
              void importProject(event.target.files?.[0]);event.target.value="";
            }}/>
          <button type="button" className={buttonClass} onClick={()=>importInput.current?.click()}>Import JSON</button>
        </div>
      </header>
      {project && (
        <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-border p-3">
          <label className="min-w-[200px] flex-1 text-sm">Project name
            <input className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2"
              value={project.title} maxLength={120}
              onChange={event=>mutateProject(current=>({...current,title:event.target.value}))}/>
          </label>
          <label className="min-w-[180px] text-sm">Saved local projects
            <select className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2"
              value={savedProjects.some(p=>p.id===project.id)?project.id:""}
              onChange={event=>openSavedProject(event.target.value)}>
              <option value="">Unsaved / imported copy</option>
              {savedProjects.map(item=><option key={item.id} value={item.id}>{item.title} (rev {item.revision})</option>)}
            </select>
          </label>
          <p role="status" className="text-xs text-muted-foreground">{workspaceDirty?"Unsaved project changes":"Local-only workspace"}</p>
          {importWarnings.length>0 && <details className="w-full text-xs">
            <summary>Legacy import notices ({importWarnings.length})</summary>
            <ul className="list-disc pl-5">{importWarnings.map((x,i)=><li key={i}>{x}</li>)}</ul>
          </details>}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-xl border border-border bg-slate-200">
            <canvas ref={canvasRef} className="h-[52dvh] min-h-[300px] w-full touch-none"
              aria-label="Interactive 3D illustrative environment. Touch or drag to look around; use WASD or arrow keys to move."
              tabIndex={0} />
            {graphicsError && (
              <div role="alert" className="absolute inset-0 flex items-center justify-center bg-bg p-4 text-center text-sm">
                3D unavailable: {graphicsError}. The scientific controls and values remain accessible below.
              </div>
            )}
            <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-bg/90 px-2 py-1 text-xs text-fg">
              Representative ground · not a measured geographic location
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={buttonClass} aria-expanded={seeInside}
              onClick={() => setSeeInside((value) => !value)}>See Inside</button>
            <button type="button" className={buttonClass} disabled={!project || shapeCount >= 200}
              onClick={() => addShape("box")}>Add cube</button>
            <button type="button" className={buttonClass} disabled={!project || shapeCount >= 200}
              onClick={() => addShape("sphere")}>Add sphere</button>
            <button type="button" className={buttonClass} disabled={!project || shapeCount >= 200}
              onClick={() => addShape("cylinder")}>Add cylinder</button>
            <button type="button" className={buttonClass} disabled={!selectedEntity}
              onClick={() => {if(selectedEntity)mutateProject(p=>({...p,entities:p.entities.filter(e=>e.id!==selectedEntity.id)}));
                setSelectedEntityId("");}}>Remove selected</button>
          </div>
          {seeInside && (
            <div className="mt-2 rounded-lg border border-border p-3">
              <label htmlFor="worldlab-opacity" className="block text-sm">Object opacity: {opacity}%</label>
              <input id="worldlab-opacity" type="range" min="10" max="100" step="5" value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))} className="w-full" />
              <p className="text-xs text-muted-foreground">
                This shows the display object with transparency and numerical internal state.
                It is not X-ray measurement, volumetric imaging or a computed electromagnetic field.
              </p>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Drag to look around; keyboard W/A/S/D or arrows to move. Tap a shape to inspect it.
            Added solids are visual geometry with analytic volume. Without material density, mass is unknown;
            none of these objects is coupled to the demo solvers.
          </p>
          <div className="mt-3 rounded-xl border border-border p-3">
            <h2 className="text-base font-medium">Build and inspect</h2>
            <label className="mt-2 block text-sm">Select a shape
              <select className="mt-1 w-full rounded border border-border bg-bg p-2"
                value={selectedEntityId} onChange={event=>setSelectedEntityId(event.target.value)}>
                <option value="">None selected</option>
                {project?.entities.map(entity=><option key={entity.id} value={entity.id}>{entity.name}</option>)}
              </select>
            </label>
            {selectedEntity && selectedQuantities && (
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <label>Object name
                  <input className={inputLabel} value={selectedEntity.name}
                    onChange={event=>editSelected({name:event.target.value})}/>
                </label>
                <label>Color
                  <input className="mt-1 h-10 w-full" type="color" value={selectedEntity.color}
                    onChange={event=>editSelected({color:event.target.value})}/>
                </label>
                <label>Size (metres, uniform)
                  <input className={inputLabel} type="number" min="0.001" max="10000" step="0.1"
                    value={selectedEntity.dimensionsMeters[0]}
                    onChange={event=>{const n=Number(event.target.value);if(n>0 && n<=10000)
                      editSelected({dimensionsMeters:[n,n,n]});}}/>
                </label>
                <label>Material assumption
                  <select className={inputLabel} value={selectedEntity.materialId??""}
                    onChange={event=>editSelected({materialId:event.target.value||null})}>
                    <option value="">No material: mass unknown</option>
                    {materials.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <p>Volume: <strong>{metric(selectedQuantities.volumeM3,"m³")}</strong></p>
                <p>Mass: <strong>{selectedQuantities.massKg===null?"Unknown":metric(selectedQuantities.massKg,"kg")}</strong></p>
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  {selectedQuantities.massKg===null?"Unknown / Insufficient Evidence":
                    "Computed from geometry × user-assumed density. Not measured or structurally validated."}
                </p>
              </div>
            )}
          </div>
        </div>
        <aside className="rounded-xl border border-border p-4" aria-label="Experiment controls">
          <label htmlFor="worldlab-model" className="mb-1 block text-sm font-medium">Experiment</label>
          <select id="worldlab-model" className={inputLabel} value={modelKind}
            onChange={(event) => {
              setModelKind(event.target.value as ModelInput["kind"]);
              setPlaying(false); setDirty(true);
            }}>
            <option value="damped-oscillator">Spring and moving mass</option>
            <option value="rc-circuit">Battery and capacitor (RC)</option>
          </select>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {modelKind === "damped-oscillator" ? (
              <>
                <label className="text-sm">Mass (kg)<input className={inputLabel} type="number" min="0.001" max="10000" step="0.1"
                  value={mechanical.massKg} onChange={(event) => changeMechanical("massKg", Number(event.target.value))} /></label>
                <label className="text-sm">Spring (N/m)<input className={inputLabel} type="number" min="0.001" max="1000000" step="0.5"
                  value={mechanical.springNPerM} onChange={(event) => changeMechanical("springNPerM", Number(event.target.value))} /></label>
                <label className="text-sm">Damping (N·s/m)<input className={inputLabel} type="number" min="0" max="100000" step="0.1"
                  value={mechanical.dampingNsPerM} onChange={(event) => changeMechanical("dampingNsPerM", Number(event.target.value))} /></label>
                <label className="text-sm">Initial position (m)<input className={inputLabel} type="number" min="-10" max="10" step="0.1"
                  value={mechanical.initialDisplacementM} onChange={(event) => changeMechanical("initialDisplacementM", Number(event.target.value))} /></label>
              </>
            ) : (
              <>
                <label className="text-sm">Resistance (Ω)<input className={inputLabel} type="number" min="0.001" step="100"
                  value={circuit.resistanceOhm} onChange={(event) => changeCircuit("resistanceOhm", Number(event.target.value))} /></label>
                <label className="text-sm">Capacitance (F)<input className={inputLabel} type="number" min="0.000000001" step="0.001"
                  value={circuit.capacitanceF} onChange={(event) => changeCircuit("capacitanceF", Number(event.target.value))} /></label>
                <label className="text-sm">Supply (V)<input className={inputLabel} type="number" min="-1000" max="1000" step="1"
                  value={circuit.supplyVoltageV} onChange={(event) => changeCircuit("supplyVoltageV", Number(event.target.value))} /></label>
                <label className="text-sm">Start voltage (V)<input className={inputLabel} type="number" min="-1000" max="1000" step="1"
                  value={circuit.initialVoltageV} onChange={(event) => changeCircuit("initialVoltageV", Number(event.target.value))} /></label>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={buttonClass + " bg-foreground text-background"}
              onClick={start}>Start / Recalculate</button>
            <button type="button" className={buttonClass} disabled={!currentRun}
              onClick={() => setPlaying((state) => !state)}>{playing ? "Pause" : "Play"}</button>
            <button type="button" className={buttonClass} disabled={!currentRun}
              onClick={() => { setPlaying(false); setTimeSeconds(0); }}>Reset time</button>
            <button type="button" className={buttonClass} disabled={!currentRun}
              onClick={() => { setPlaying(false); setTimeSeconds((t) =>
                Math.min(currentRun?.time.simulatedDurationSeconds ?? 0, t + (currentRun?.time.solverStepSeconds ?? 0))); }}>
              Step
            </button>
          </div>
          <div className="mt-4">
            <label htmlFor="worldlab-speed" className="block text-sm">Playback speed</label>
            <select id="worldlab-speed" className={inputLabel} value={playbackRate}
              onChange={(event) => setPlaybackRate(Number(event.target.value))}>
              <option value={0.01}>0.01× (slow)</option><option value={0.1}>0.1×</option>
              <option value={1}>1× (normal)</option><option value={10}>10× (fast)</option>
            </select>
            <label htmlFor="worldlab-time" className="mt-2 block text-sm">
              Simulated elapsed time: {timeSeconds.toFixed(3)} s
            </label>
            <input id="worldlab-time" className="w-full" type="range" min={0}
              max={currentRun?.time.simulatedDurationSeconds ?? DEMO_DURATION_SECONDS}
              step={currentRun?.time.solverStepSeconds ?? 1 / 240}
              value={timeSeconds} disabled={!currentRun}
              onChange={(event) => { setPlaying(false); setTimeSeconds(Number(event.target.value)); }} />
          </div>
          {dirty && currentRun && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            Inputs have changed; the displayed run uses the old parameters. Press Start to calculate a new branch.
          </p>}
          {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
          <p role="status" className="mt-3 text-sm">{message}</p>
        </aside>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-border p-4" aria-label="Computed observations">
          <h2 className="text-lg font-semibold">What is happening?</h2>
          <p className="mt-1 text-xs text-muted-foreground">Physics Model / Computed · not measured · visual shapes are illustrative</p>
          {sample && currentRun ? (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {currentRun.modelId === "damped-oscillator" ? (
                  <>
                    <div><dt>Position</dt><dd className="font-medium">{metric(sample.positionM, "m")}</dd></div>
                    <div><dt>Velocity</dt><dd className="font-medium">{metric(sample.velocityMPerS, "m/s")}</dd></div>
                    <div><dt>Mechanical energy</dt><dd className="font-medium">{metric(sample.mechanicalEnergyJ, "J")}</dd></div>
                  </>
                ) : (
                  <>
                    <div><dt>Capacitor voltage</dt><dd className="font-medium">{metric(sample.capacitorVoltageV, "V")}</dd></div>
                    <div><dt>Current</dt><dd className="font-medium">{metric(sample.currentA, "A")}</dd></div>
                    <div><dt>Resistor heating</dt><dd className="font-medium">{metric(sample.resistorHeatW, "W")}</dd></div>
                    <div><dt>Stored energy</dt><dd className="font-medium">{metric(sample.storedEnergyJ, "J")}</dd></div>
                  </>
                )}
              </dl>
              <p className="mt-3 text-xs">Model {currentRun.modelId} v{currentRun.modelVersion};
                solver Δt {currentRun.time.solverStepSeconds.toPrecision(4)} s;
                simulation date {currentRun.time.worldDateUTC}.</p>
              <p className="mt-2 text-xs text-muted-foreground">Valid only within: {currentRun.validity}</p>
              <button type="button" className={buttonClass + " mt-3"}
                onClick={() => downloadJson("world-lab-experiment.json", currentRun)}>Export recorded run JSON</button>
            </>
          ) : <p className="mt-3 text-sm">No model results yet. Press Start to run a calculation.</p>}
        </section>
        <section className="rounded-xl border border-border p-4" aria-label="New material proposal">
          <h2 className="text-lg font-semibold">Invent a material</h2>
          <p className="text-xs text-muted-foreground">
            Propose a material not in any catalog. Unknown properties remain unknown;
            no strength, chemistry or physical success is predicted by this reference model.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-sm">Material name<input className={inputLabel} value={materialName}
              maxLength={120} onChange={(event) => setMaterialName(event.target.value)} /></label>
            <label className="text-sm">Assumed density (kg/m³), optional<input className={inputLabel}
              type="number" min="0.001" value={density}
              onChange={(event) => setDensity(event.target.value)} /></label>
          </div>
          <button type="button" className={buttonClass + " mt-3"} onClick={addMaterial}>Record hypothetical material</button>
          {materials.length > 0 && (
            <ul className="mt-3 list-inside list-disc text-sm">
              {materials.map((material) => <li key={material.id}>{material.name}: density {material.densityKgM3 === null ? "Unknown" : metric(material.densityKgM3, "kg/m³")};
                elasticity unknown · Hypothetical / User-assumed</li>)}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
