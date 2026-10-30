import { useEffect, useMemo, useRef, useState } from "react";
import * as B from "babylonjs";
import {
  blankWorldLabProject, importLegacyGameScene, newSolid, parseWorldLabProject,
  readWorldLabProjectJson, serializeWorldLabProject, solidQuantities,
  type WorldLabEntity, type WorldLabProject,
} from "@/lib/world-lab/project";
import { deleteLocalWorldLabRun, listLocalWorldLabProjects, listLocalWorldLabRuns,
  putLocalWorldLabProject, saveLocalWorldLabRun } from "@/lib/world-lab/local-storage";
import { deriveOscillatorFromSolid } from "@/lib/world-lab/coupling";
import { buildScientificTimeTrace } from "@/lib/world-lab/time-trace";
import { illustrativeLayerForDepth, observerTravelMetres, OBSERVER_BOUNDS_METRES } from "@/lib/world-lab/observer";
import {
  advancePlayback, DEMO_DURATION_SECONDS, runExperiment, sampleRun, validateNovelMaterial,
  HEAT_CELLS, type AssumedMassSource, type DampedOscillator, type HeatRod, type LabRun, type ModelInput, type RCCircuit,
} from "@/lib/world-lab/model";

type SceneHandles = {
  engine: B.Engine;
  scene: B.Scene;
  device: B.Mesh;
  circuit: B.Mesh;
  deviceMaterial: B.StandardMaterial;
  circuitMaterial: B.StandardMaterial;
  addedShapes: Map<string, B.Mesh>;
  heatSegments: B.Mesh[];
  groundMaterial: B.StandardMaterial;
  strataMaterials: B.StandardMaterial[];
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
const defaultHeat: HeatRod = {
  kind: "heat-rod", thermalDiffusivityM2PerS: 0.02, lengthMeters: 2,
  ambientTemperatureK: 293.15, centerTemperatureK: 373.15,
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
  const restoreRunsEpoch = useRef(0);
  const [graphicsError, setGraphicsError] = useState("");
  const [modelKind, setModelKind] = useState<ModelInput["kind"]>("damped-oscillator");
  const [mechanical, setMechanical] = useState(defaultMechanical);
  const [circuit, setCircuit] = useState(defaultCircuit);
  const [heat, setHeat] = useState(defaultHeat);
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [runId, setRunId] = useState("");
  const [comparisonRunId, setComparisonRunId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [seeInside, setSeeInside] = useState(false);
  const [observerDepth, setObserverDepth] = useState(0);
  const visualSettings = useRef({ seeInside: false, opacity: 55 });
  const [opacity, setOpacity] = useState(55);
  visualSettings.current = { seeInside, opacity };
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
  const [youngModulus, setYoungModulus] = useState("");
  const materials = project?.materials ?? [];
  const selectedEntity = project?.entities.find(entity => entity.id === selectedEntityId) ?? null;
  const selectedMaterial = materials.find(material => material.id === selectedEntity?.materialId);
  const selectedQuantities = selectedEntity ? solidQuantities(selectedEntity, selectedMaterial) : null;
  const [message, setMessage] = useState("Choose an experiment and press Start to calculate a real reference trajectory.");
  const [error, setError] = useState("");
  const currentRun = useMemo(() => runs.find((run) => run.id === runId) ?? null, [runs, runId]);
  const sample = currentRun ? sampleRun(currentRun, timeSeconds) : null;
  const trace = useMemo(() => currentRun ? buildScientificTimeTrace(currentRun) : null, [currentRun]);
  const compatibleRuns = runs.filter(run => currentRun &&
    run.id !== currentRun.id &&
    run.modelId === currentRun.modelId &&
    run.time.simulatedDurationSeconds === currentRun.time.simulatedDurationSeconds);
  const comparisonRun = compatibleRuns.find(run => run.id === comparisonRunId) ?? null;
  const comparisonSample = comparisonRun ? sampleRun(comparisonRun,
    Math.min(timeSeconds, comparisonRun.time.simulatedDurationSeconds)) : null;
  const currentTraceValue = trace && sample ? sample[trace.metric] : null;
  const comparisonTraceValue = trace && comparisonSample ? comparisonSample[trace.metric] : null;
  const comparedDifference = typeof currentTraceValue === "number" &&
    typeof comparisonTraceValue === "number" ? currentTraceValue - comparisonTraceValue : null;

  useEffect(() => {
    try {
      const json = window.localStorage.getItem(STORAGE_KEY);
      if (!json) return;
      const saved: unknown = JSON.parse(json);
      if (!saved || typeof saved !== "object") return;
      const record = saved as Record<string, unknown>;
      if (record.format !== "env-world-lab-local" || record.version !== 1) return;
      if (record.modelKind === "rc-circuit" || record.modelKind === "damped-oscillator" || record.modelKind === "heat-rod") setModelKind(record.modelKind);
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
      if (record.heat && typeof record.heat === "object") {
        const proposed = record.heat as Partial<HeatRod>;
        if (proposed.kind === "heat-rod" &&
          [proposed.thermalDiffusivityM2PerS, proposed.lengthMeters,
           proposed.ambientTemperatureK, proposed.centerTemperatureK].every(v=>typeof v==="number" && Number.isFinite(v))) {
          setHeat({...defaultHeat,...proposed});
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
        restoreRunsForProject(latest.id);
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
    let observerNavigationCleanup: (() => void) | undefined;
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
      const wheelTravel = (event: WheelEvent) => {
        event.preventDefault();
        const distance = observerTravelMetres(event.deltaY, "wheel");
        const candidate = camera.position.add(camera.getForwardRay().direction.scale(distance));
        if (candidate.length() <= OBSERVER_BOUNDS_METRES.maxRadius && candidate.y >= OBSERVER_BOUNDS_METRES.minHeight)
          camera.position.copyFrom(candidate);
      };
      const touches = new Map<number, { x: number; y: number }>();
      let pinchDistance = 0;
      const onTouchDown = (event: PointerEvent) => {
        if (event.pointerType === "touch") touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      };
      const onTouchMove = (event: PointerEvent) => {
        if (event.pointerType !== "touch" || !touches.has(event.pointerId)) return;
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size !== 2) { pinchDistance = 0; return; }
        const [a, b] = [...touches.values()];
        const distance = Math.hypot(a.x-b.x, a.y-b.y);
        if (pinchDistance > 0) {
          const travel = observerTravelMetres(distance - pinchDistance, "pinch");
          const candidate = camera.position.add(camera.getForwardRay().direction.scale(travel));
          if (candidate.length() <= OBSERVER_BOUNDS_METRES.maxRadius && candidate.y >= OBSERVER_BOUNDS_METRES.minHeight)
            camera.position.copyFrom(candidate);
        }
        pinchDistance = distance;
      };
      const onTouchEnd = (event: PointerEvent) => { touches.delete(event.pointerId); pinchDistance = 0; };
      canvas.addEventListener("wheel", wheelTravel, { passive: false });
      canvas.addEventListener("pointerdown", onTouchDown);
      canvas.addEventListener("pointermove", onTouchMove);
      canvas.addEventListener("pointerup", onTouchEnd);
      canvas.addEventListener("pointercancel", onTouchEnd);
      const onObserverKey = (event: KeyboardEvent) => {
        // Accessible alternative to pointing down and pinching. No scene change.
        if (event.key !== "PageDown" && event.key !== "PageUp") return;
        event.preventDefault();
        const nextY = camera.position.y + (event.key === "PageDown" ? -0.8 : 0.8);
        if (nextY >= OBSERVER_BOUNDS_METRES.minHeight && Math.hypot(camera.position.x, nextY, camera.position.z) <= OBSERVER_BOUNDS_METRES.maxRadius)
          camera.position.y = nextY;
      };
      canvas.addEventListener("keydown", onObserverKey);
      const ambient = new B.HemisphericLight("daylight", new B.Vector3(0, 1, 0), scene);
      ambient.intensity = 0.85;
      const sunlight = new B.DirectionalLight("sunlight", new B.Vector3(-0.4, -1, 0.6), scene);
      sunlight.intensity = 0.55;
      const ground = B.MeshBuilder.CreateGround("representative-ground", { width: 160, height: 160 }, scene);
      const groundMaterial = new B.StandardMaterial("ground", scene);
      groundMaterial.diffuseColor = B.Color3.FromHexString("#6D8E72");
      ground.material = groundMaterial;
      ground.isPickable = false;
      // These large, layered volumes are intentionally illustrative, NOT site measurements.
      const strataMaterials: B.StandardMaterial[] = [];
      for (const layer of [
        { center: -0.3, height: 0.6, color: "#75583C" },
        { center: -1.4, height: 1.6, color: "#A1855F" },
        { center: -3.5, height: 2.6, color: "#72767C" },
        { center: -7.5, height: 5.4, color: "#535B68" },
      ]) {
        const rock = B.MeshBuilder.CreateBox("illustrative-earth-layer", { width: 160, height: layer.height, depth: 160 }, scene);
        rock.position.y = layer.center;
        rock.isPickable = false;
        const material = new B.StandardMaterial("illustrative-rock", scene);
        material.diffuseColor = B.Color3.FromHexString(layer.color);
        material.specularColor = B.Color3.Black();
        material.alpha = 0.65;
        rock.material = material;
        strataMaterials.push(material);
      }
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
      const heatSegments: B.Mesh[] = [];
      for(let i=0;i<HEAT_CELLS;i++){
        const segment=B.MeshBuilder.CreateBox("heat-cell-"+i,{width:0.115,height:0.36,depth:0.5},scene);
        segment.position.set((i-(HEAT_CELLS-1)/2)*0.116,1.05,0);
        const material=new B.StandardMaterial("heat-legend-cell-"+i,scene);
        material.diffuseColor=B.Color3.FromHexString("#3B528B");
        segment.material=material;
        segment.setEnabled(false);
        heatSegments.push(segment);
      }
      let lastDepthLabelAt = 0;
      engine.runRenderLoop(() => {
        // Reveal layers automatically when the observer enters the ground.
        // See Inside is an optional view aid, not a navigation gate.
        const depth = Math.max(0, -camera.position.y);
        const inspection = visualSettings.current;
        groundMaterial.alpha = depth > 0 || camera.position.y < 0.75
          ? 0.12 : inspection.seeInside ? inspection.opacity / 100 : 1;
        for (const material of strataMaterials)
          material.alpha = depth > 0 ? 0.17 : inspection.seeInside ? inspection.opacity / 100 : 0.72;
        const now = performance.now();
        if (now - lastDepthLabelAt > 350) {
          lastDepthLabelAt = now;
          setObserverDepth(old => Math.abs(old - depth) > 0.02 ? depth : old);
        }
        scene?.render();
      });
      observer = new ResizeObserver(() => engine?.resize());
      observer.observe(canvas);
      scene.onPointerObservable.add(info => {
        if (info.type !== B.PointerEventTypes.POINTERDOWN) return;
        const id = info.pickInfo?.pickedMesh?.metadata?.worldLabEntityId;
        if (typeof id === "string") setSelectedEntityId(id);
      });
      sceneRef.current = { engine, scene, device, circuit, deviceMaterial, circuitMaterial, addedShapes: new Map(), heatSegments, groundMaterial, strataMaterials };
      // Callback-scoped cleanup also covers graphics initialization failures.
      observerNavigationCleanup = () => {
        canvas.removeEventListener("wheel", wheelTravel);
        canvas.removeEventListener("pointerdown", onTouchDown);
        canvas.removeEventListener("pointermove", onTouchMove);
        canvas.removeEventListener("pointerup", onTouchEnd);
        canvas.removeEventListener("pointercancel", onTouchEnd);
        canvas.removeEventListener("keydown", onObserverKey);
        touches.clear();
      };
    } catch (cause) {
      setGraphicsError(cause instanceof Error ? cause.message : "The 3D view could not be opened.");
      observer?.disconnect();
      observerNavigationCleanup?.();
      scene?.dispose();
      engine?.dispose();
    }
    return () => {
      observer?.disconnect();
      observerNavigationCleanup?.();
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
    scene.circuit.setEnabled(modelKind === "rc-circuit");
    const heatVisible = modelKind === "heat-rod";
    const profile = sample?.temperaturesK;
    const sourceHeat = currentRun?.inputs.kind === "heat-rod" ? currentRun.inputs : heat;
    const lower=Math.min(sourceHeat.ambientTemperatureK,sourceHeat.centerTemperatureK);
    const upper=Math.max(sourceHeat.ambientTemperatureK,sourceHeat.centerTemperatureK);
    scene.heatSegments.forEach((segment,i)=>{
      segment.setEnabled(heatVisible);
      const temperature=profile?.[i] ?? (i===Math.floor(HEAT_CELLS/2)?heat.centerTemperatureK:heat.ambientTemperatureK);
      const normalized = Math.max(0,Math.min(1,(temperature-lower)/Math.max(upper-lower,1e-9)));
      if(segment.material instanceof B.StandardMaterial){
        segment.material.diffuseColor=B.Color3.Lerp(
          B.Color3.FromHexString("#3B528B"),
          B.Color3.FromHexString("#FDE725"),
          normalized);
        segment.material.alpha=seeInside?opacity/100:1;
      }
    });
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
  }, [modelKind, mechanical.initialDisplacementM, sample, seeInside, opacity, project, currentRun, heat]);

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

  function restoreRunsForProject(projectId: string) {
    const epoch=++restoreRunsEpoch.current;
    void listLocalWorldLabRuns(projectId).then(saved=>{
      if(epoch!==restoreRunsEpoch.current)return;
      setRuns(saved);
      const last=saved.at(-1);
      if(!last) {setRunId("");return;}
      setRunId(last.id);
      setTimeSeconds(0);setPlaying(false);setDirty(false);
      setModelKind(last.inputs.kind);
      if(last.inputs.kind==="damped-oscillator")setMechanical(last.inputs);
      else if(last.inputs.kind==="rc-circuit")setCircuit(last.inputs);
      else setHeat(last.inputs);
    }).catch(cause=>{
      if(epoch===restoreRunsEpoch.current)setError(cause instanceof Error?cause.message:"Saved experiment history is unreadable.");
    });
  }
  function changeMechanical<K extends keyof DampedOscillator>(key: K, value: DampedOscillator[K]) {
    setMechanical((current) => ({ ...current, [key]: value }));
    setDirty(true); setPlaying(false);
  }
  function changeCircuit<K extends keyof RCCircuit>(key: K, value: RCCircuit[K]) {
    setCircuit((current) => ({ ...current, [key]: value }));
    setDirty(true); setPlaying(false);
  }
  function changeHeat<K extends keyof HeatRod>(key: K, value: HeatRod[K]) {
    setHeat(current=>({...current,[key]:value}));
    setDirty(true);setPlaying(false);
  }
  function runModel(input: ModelInput, source: AssumedMassSource | null = null) {
    setError("");
    try {
      const next = runExperiment(input, {
        id: window.crypto.randomUUID(), parentRunId: currentRun?.id ?? null,
        worldDateUTC: new Date().toISOString(), assumedMassSource: source,
      });
      setRuns((previous) => [...previous.slice(-19), next]);
      if (project && savedRevision !== null) {
        void saveLocalWorldLabRun(project.id,next).catch(cause=>
          setError((cause instanceof Error?cause.message:"Could not archive the experiment.")+
            " Export the run JSON to keep it."));
      }
      setRunId(next.id);
      setComparisonRunId("");
      setTimeSeconds(0);
      setDirty(false);
      setPlaying(true);
      setMessage(source
        ? "Simulation uses the selected invented solid's assumed density as a lumped mass. It does not prove real material behavior."
        : "Computed locally with a bounded scientific model. The 3D object is an illustration of solver output.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This experiment could not be calculated.");
    }
  }
  function start() {
    runModel(modelKind === "damped-oscillator" ? mechanical : modelKind === "heat-rod" ? heat : circuit);
  }
  function startWithSelectedSolid() {
    if (!project || !selectedEntity) return;
    try {
      const derived = deriveOscillatorFromSolid(project, selectedEntity.id, mechanical);
      setModelKind("damped-oscillator");
      setMechanical(derived.input);
      runModel(derived.input, derived.source);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This shape cannot be used as a mass yet.");
    }
  }
  function focusSelected() {
    const camera = sceneRef.current?.scene.activeCamera;
    if (!(camera instanceof B.UniversalCamera) || !selectedEntity) return;
    const [x,y,z] = selectedEntity.positionMeters;
    const distance = Math.max(2, Math.max(...selectedEntity.dimensionsMeters) * 3);
    camera.position.copyFromFloats(x, y + 1, z - distance);
    camera.setTarget(new B.Vector3(x,y,z));
  }
  function editPosition(axis: 0 | 1 | 2, numberValue: number) {
    if (!selectedEntity || !Number.isFinite(numberValue) ||
        numberValue < -100000 || numberValue > 100000) return;
    const next = [...selectedEntity.positionMeters] as [number, number, number];
    next[axis] = numberValue;
    editSelected({positionMeters: next});
  }
  function editDimension(axis: 0 | 1 | 2, numberValue: number) {
    if (!selectedEntity || !Number.isFinite(numberValue) ||
        numberValue < 0.001 || numberValue > 10000) return;
    const next = [...selectedEntity.dimensionsMeters] as [number, number, number];
    if (selectedEntity.shape === "sphere") next.fill(numberValue);
    else if (selectedEntity.shape === "cylinder" && axis !== 1) {
      next[0] = numberValue;
      next[2] = numberValue;
    } else next[axis] = numberValue;
    editSelected({dimensionsMeters: next});
  }
  function zoomView(direction: 1 | -1) {
    const scene = sceneRef.current;
    if (!scene) return;
    const camera = scene.scene.activeCamera;
    if (!(camera instanceof B.UniversalCamera)) return;
    const move = camera.getForwardRay().direction.scale(direction * 0.8);
    const next = camera.position.add(move);
    if (next.length() > OBSERVER_BOUNDS_METRES.maxRadius || next.y < OBSERVER_BOUNDS_METRES.minHeight) return;
    camera.position.copyFrom(next);
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
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          format:"env-world-lab-local", version:1,modelKind,mechanical,circuit,heat,
        }));
      } catch {
        // Project and scientific histories are in IndexedDB even if preferences storage is unavailable.
      }
      const archival=await Promise.allSettled(runs.map(run=>saveLocalWorldLabRun(saved.id,run)));
      const rejected=archival.filter(item=>item.status==="rejected");
      if(rejected.length) {
        setMessage("The project was saved locally, but some experiment history could not be archived.");
        setError("Export any missing run JSON before closing this tab. "+
          rejected.map(item=>item.status==="rejected" && item.reason instanceof Error
            ? item.reason.message : "Local storage failed.").join(" "));
      }else{
        setMessage("Project and "+archival.length+
          " scientific runs saved on this device. Cloud synchronization is not yet available.");
      }
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
      if((workspaceDirty || (savedRevision === null && runs.length > 0)) &&
         !window.confirm("Discard unsaved local edits or recorded experiments and import a different project?")) return;
      restoreRunsEpoch.current++;
      const now=new Date().toISOString();
      setProject(parseWorldLabProject({...imported,id:crypto.randomUUID(),title:imported.title,
        revision:0,createdAt:now,updatedAt:now}));
      setSavedRevision(null);
      setWorkspaceDirty(true);
      setSelectedEntityId("");
      setRuns([]);setRunId("");setComparisonRunId("");setPlaying(false);setTimeSeconds(0);
      setImportWarnings(warnings);
      setMessage("Imported a local project copy. Save it to keep it on this device.");
    }catch(cause){setError(cause instanceof Error?cause.message:"This file could not be imported.");}
  }
  function openSavedProject(id:string){
    const saved=savedProjects.find(p=>p.id===id);
    if(!saved)return;
    if((workspaceDirty || (savedRevision === null && runs.length > 0)) &&
       !window.confirm("Discard unsaved local edits or recorded experiments and open another project?"))return;
    setProject(saved);setSavedRevision(saved.revision);setWorkspaceDirty(false);
    setSelectedEntityId("");setRuns([]);setRunId("");setComparisonRunId("");setPlaying(false);setTimeSeconds(0);
    restoreRunsForProject(saved.id);
    setMessage("Opened saved project "+saved.title+".");
  }
  function newProject(){
    if((workspaceDirty || (savedRevision === null && runs.length > 0)) &&
       !window.confirm("Discard unsaved local edits or recorded experiments and create a new project?"))return;
    restoreRunsEpoch.current++;
    setProject(blankWorldLabProject(crypto.randomUUID(),new Date().toISOString()));
    setSavedRevision(null);setWorkspaceDirty(false);setSelectedEntityId("");
    setRuns([]);setRunId("");setComparisonRunId("");setPlaying(false);setTimeSeconds(0);
    setMessage("New local World Lab project created.");
  }
  async function deleteSelectedRun() {
    if(!project || !currentRun)return;
    if(!window.confirm("Delete this recorded experiment from local history? Export its JSON first if you want a backup."))return;
    try {
      if(savedRevision!==null)await deleteLocalWorldLabRun(project.id,currentRun.id);
      setRuns(previous=>previous.filter(item=>item.id!==currentRun.id));
      setRunId("");
      setComparisonRunId("");
      setPlaying(false);setTimeSeconds(0);
      setMessage("Deleted the selected local experiment. Other saved runs were not changed.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not delete the local experiment.");}
  }
  function addMaterial() {
    try {
      const proposed = validateNovelMaterial({
        name: materialName.trim(), densityKgM3: density.trim() === "" ? null : Number(density),
        youngModulusPa: youngModulus.trim() === "" ? null : Number(youngModulus),
        provenance: "hypothetical-user-assumed",
      });
      mutateProject(current=>({...current,materials:[...current.materials,{
        id:crypto.randomUUID(),name:proposed.name,
        densityKgM3:proposed.densityKgM3,youngModulusPa:proposed.youngModulusPa,
        evidence:proposed.provenance,
      }]}));
      setMaterialName(""); setDensity(""); setYoungModulus("");
      setMessage("Hypothetical material saved in the project. Its density can supply an assumed mass to the spring model; other physical behavior is not simulated.");
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
            Explore a representative 3D environment and run three bounded scientific experiments.
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
              {illustrativeLayerForDepth(observerDepth)} · {observerDepth.toFixed(1)} m below surface · not measured
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={buttonClass} aria-expanded={seeInside}
              onClick={() => setSeeInside((value) => !value)}>See Inside</button>
            <button type="button" className={buttonClass} onClick={() => zoomView(1)}
              aria-label="Zoom in">Zoom in</button>
            <button type="button" className={buttonClass} onClick={() => zoomView(-1)}
              aria-label="Zoom out">Zoom out</button>
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
            an assigned density can be used as an assumed mass in the spring model.
            Shape geometry is not a collision or deformation simulation.
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
                <div className="sm:col-span-2 grid grid-cols-3 gap-2" aria-label="Solid dimensions in metres">
                  {(selectedEntity.shape === "box" ? ([0,1,2] as const) :
                    selectedEntity.shape === "cylinder" ? ([0,1] as const) : ([0] as const)).map(axis=>(
                    <label key={axis} className="text-xs">
                      {selectedEntity.shape === "sphere" ? "Diameter" :
                        selectedEntity.shape === "cylinder" ? (axis === 0 ? "Diameter" : "Height") :
                        "Size "+["X","Y","Z"][axis]} (m)
                      <input className={inputLabel} aria-label={selectedEntity.shape === "box"
                        ? "Size "+["X","Y","Z"][axis]+" (m)" :
                        selectedEntity.shape === "sphere" ? "Diameter (m)" :
                        (axis === 0 ? "Diameter (m)" : "Height (m)")}
                        type="number" min="0.001" max="10000" step="0.1"
                        value={selectedEntity.dimensionsMeters[axis]}
                        onChange={event=>editDimension(axis,Number(event.target.value))}/>
                    </label>
                  ))}
                </div>
                <div className="sm:col-span-2 grid grid-cols-3 gap-2" aria-label="Solid position in metres">
                  {([0,1,2] as const).map(axis=>(
                    <label key={axis} className="text-xs">Position {["X","Y","Z"][axis]} (m)
                      <input className={inputLabel} aria-label={"Position "+["X","Y","Z"][axis]+" (m)"}
                        type="number" min="-100000" max="100000" step="0.1"
                        value={selectedEntity.positionMeters[axis]}
                        onChange={event=>editPosition(axis,Number(event.target.value))}/>
                    </label>
                  ))}
                </div>
                <div className="sm:col-span-2">
                  <button type="button" className={buttonClass} onClick={focusSelected}>
                    Focus selected object
                  </button>
                </div>
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
                <div className="sm:col-span-2">
                  <button type="button" className={buttonClass}
                    disabled={selectedQuantities.massKg === null}
                    onClick={startWithSelectedSolid}>Test this solid as spring mass</button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Treat this object's geometry and your invented density as one lumped mass.
                    The spring stiffness remains a separate assumption. This is not deformation,
                    collision or material certification.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        <aside className="rounded-xl border border-border p-4" aria-label="Experiment controls">
          <label htmlFor="worldlab-model" className="mb-1 block text-sm font-medium">Experiment</label>
          <select id="worldlab-model" className={inputLabel} value={modelKind}
            onChange={(event) => {
              setModelKind(event.target.value as ModelInput["kind"]);
              setPlaying(false); setDirty(true); setRunId(""); setComparisonRunId(""); setTimeSeconds(0);
            }}>
            <option value="damped-oscillator">Spring and moving mass</option>
            <option value="rc-circuit">Battery and capacitor (RC)</option>
            <option value="heat-rod">Heat flowing through a rod</option>
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
            ) : modelKind === "rc-circuit" ? (
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
            ) : (
              <>
                <label className="text-sm">Diffusivity (m²/s)<input className={inputLabel} type="number"
                  min="0.0000001" max="100" step="0.01" value={heat.thermalDiffusivityM2PerS}
                  onChange={event=>changeHeat("thermalDiffusivityM2PerS",Number(event.target.value))}/></label>
                <label className="text-sm">Rod length (m)<input className={inputLabel} type="number"
                  min="0.1" max="100" step="0.1" value={heat.lengthMeters}
                  onChange={event=>changeHeat("lengthMeters",Number(event.target.value))}/></label>
                <label className="text-sm">Initial rod temperature (K)<input className={inputLabel} type="number"
                  min="0" max="2000" step="1" value={heat.ambientTemperatureK}
                  onChange={event=>changeHeat("ambientTemperatureK",Number(event.target.value))}/></label>
                <label className="text-sm">Center temperature (K)<input className={inputLabel} type="number"
                  min="0" max="2000" step="1" value={heat.centerTemperatureK}
                  onChange={event=>changeHeat("centerTemperatureK",Number(event.target.value))}/></label>
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
          {runs.length > 0 && (
            <div className="mt-4 rounded-lg border border-border p-3 text-sm">
              <label htmlFor="worldlab-run-history" className="block font-medium">
                Open recorded run (local device)
              </label>
              <select id="worldlab-run-history" className={inputLabel} value={runId}
                onChange={event=>{
                  const chosen=runs.find(run=>run.id===event.target.value);
                  if(!chosen)return;
                  setRunId(chosen.id);setComparisonRunId("");setTimeSeconds(0);
                  setPlaying(false);setDirty(false);setModelKind(chosen.inputs.kind);
                  if(chosen.inputs.kind==="damped-oscillator")setMechanical(chosen.inputs);
                  else if(chosen.inputs.kind==="rc-circuit")setCircuit(chosen.inputs);
                  else setHeat(chosen.inputs);
                }}>
                <option value="">Select a recorded run</option>
                {runs.map((run,index)=><option key={run.id} value={run.id}>
                  {index+1}. {run.modelId}{run.assumedMassSource?" · assumed material":""}
                </option>)}
              </select>
              {currentRun && compatibleRuns.length>0 && (
                <>
                  <label htmlFor="worldlab-compare" className="mt-2 block font-medium">
                    Compare to run
                  </label>
                  <select id="worldlab-compare" className={inputLabel} value={comparisonRunId}
                    onChange={event=>setComparisonRunId(event.target.value)}>
                    <option value="">Choose an earlier run</option>
                    {compatibleRuns.map(run=><option key={run.id} value={run.id}>
                      {run.modelId}{run.assumedMassSource?" · assumed material":""} · {run.id.slice(0,8)}
                    </option>)}
                  </select>
                </>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Up to 20 recorded runs can be stored per project on this device.
                Historical input values and assumptions are kept unchanged.
                Cloud synchronization is not available; export JSON for an independent backup.
              </p>
              {currentRun && <button type="button" className={buttonClass + " mt-2"}
                onClick={() => void deleteSelectedRun()}>Delete selected run</button>}
            </div>
          )}
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
                ) : currentRun.modelId === "rc-circuit" ? (
                  <>
                    <div><dt>Capacitor voltage</dt><dd className="font-medium">{metric(sample.capacitorVoltageV, "V")}</dd></div>
                    <div><dt>Current</dt><dd className="font-medium">{metric(sample.currentA, "A")}</dd></div>
                    <div><dt>Resistor heating</dt><dd className="font-medium">{metric(sample.resistorHeatW, "W")}</dd></div>
                    <div><dt>Stored energy</dt><dd className="font-medium">{metric(sample.storedEnergyJ, "J")}</dd></div>
                  </>
                ) : (
                  <>
                    <div><dt>Mean temperature</dt><dd className="font-medium">{metric(sample.meanTemperatureK,"K")}</dd></div>
                    <div><dt>Hottest cell</dt><dd className="font-medium">{metric(sample.maximumTemperatureK,"K")}</dd></div>
                    <div className="col-span-2"><dt>Internal field (from left to right)</dt>
                      <dd className="font-mono text-xs break-words">{sample.temperaturesK?.map(t=>t.toFixed(1)).join(", ") ?? "No computed field"}</dd>
                    </div>
                  </>
                )}
              </dl>
              {currentRun.modelId === "heat-rod" && <p className="mt-2 text-xs">
                Color scale: <span className="font-medium">blue = cooler, yellow = warmer</span>.
                The 3D rod colors encode calculated temperatures, not visible thermal photons.
                Every color is derived from the selected time sample; inspect numeric temperatures above.
              </p>}
              {trace && (
                <figure className="mt-4" aria-label="Calculated scientific time trace">
                  <figcaption className="mb-1 text-sm font-medium">
                    {trace.label} over simulated time
                  </figcaption>
                  <svg viewBox="0 0 700 200" role="img" className="h-auto w-full max-w-full"
                    aria-label={trace.label+" ("+trace.unit+") between "+trace.minimum.toPrecision(4)+
                      " and "+trace.maximum.toPrecision(4)+" over "+
                      currentRun.time.simulatedDurationSeconds+" seconds"}>
                    <line x1={trace.x0} y1={trace.y1} x2={trace.x1} y2={trace.y1}
                      stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5"/>
                    <line x1={trace.x0} y1={trace.y0} x2={trace.x0} y2={trace.y1}
                      stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5"/>
                    <polyline points={trace.points} fill="none" stroke="#267F9C" strokeWidth="2.6"
                      strokeLinejoin="round" strokeLinecap="round"/>
                    <line x1={trace.x0+(trace.x1-trace.x0)*(timeSeconds/currentRun.time.simulatedDurationSeconds)}
                      y1={trace.y0}
                      x2={trace.x0+(trace.x1-trace.x0)*(timeSeconds/currentRun.time.simulatedDurationSeconds)}
                      y2={trace.y1} stroke="currentColor" strokeOpacity="0.8" strokeDasharray="4 4"/>
                    <text x={trace.x0} y="185" fontSize="13" fill="currentColor">0 s</text>
                    <text x={trace.x1} y="185" fontSize="13" fill="currentColor" textAnchor="end">
                      {currentRun.time.simulatedDurationSeconds} s
                    </text>
                  </svg>
                  <p className="text-xs text-muted-foreground">
                    {trace.label} ({trace.unit}): {trace.minimum.toPrecision(4)} to {trace.maximum.toPrecision(4)}.
                    Plotted {trace.samplesPlotted} recorded samples. Dashed line shows selected time.
                    This is computed state, not a measurement.
                  </p>
                </figure>
              )}
              <p className="mt-3 text-xs">Model {currentRun.modelId} v{currentRun.modelVersion};
                solver Δt {currentRun.time.solverStepSeconds.toPrecision(4)} s;
                simulation date {currentRun.time.worldDateUTC}.</p>
              {comparisonRun && comparedDifference!==null && trace && (
                <div className="mt-3 rounded-lg border border-border p-3 text-sm"
                  aria-label="Experiment comparison">
                  <p className="font-medium">Difference at selected time</p>
                  <p>{trace.label}: current {metric(currentTraceValue as number,trace.unit)};
                    previous {metric(comparisonTraceValue as number,trace.unit)};
                    difference {metric(comparedDifference,trace.unit)}.</p>
                  <p className="text-xs text-muted-foreground">
                    Computed values sampled from each run's recorded solver steps.
                    Compare only the same model and duration; no measurement or interpolation.
                  </p>
                </div>
              )}
              {currentRun.assumedMassSource && (
                <div className="mt-2 rounded-lg border border-border p-3 text-xs" aria-label="Hypothetical material provenance">
                  <p className="font-medium">Derived from an invented solid · user-assumed</p>
                  <p>Object: {currentRun.assumedMassSource.entityName}; material: {currentRun.assumedMassSource.materialName}.</p>
                  <p>Volume {metric(currentRun.assumedMassSource.volumeM3,"m³")} ×
                    assumed density {metric(currentRun.assumedMassSource.assumedDensityKgM3,"kg/m³")} =
                    mass {metric(currentRun.assumedMassSource.derivedMassKg,"kg")}.</p>
                  <p>{currentRun.assumedMassSource.assumption}</p>
                </div>
              )}
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
            <label className="text-sm">Assumed Young's modulus (Pa), optional<input className={inputLabel}
              type="number" min="0" max="1000000000000000" step="any" value={youngModulus}
              onChange={(event) => setYoungModulus(event.target.value)} /></label>
          </div>
          <button type="button" className={buttonClass + " mt-3"} onClick={addMaterial}>Record hypothetical material</button>
          {materials.length > 0 && (
            <ul className="mt-3 list-inside list-disc text-sm">
              {materials.map((material) => <li key={material.id}>{material.name}: density {material.densityKgM3 === null ? "Unknown" : metric(material.densityKgM3, "kg/m³")};
                modulus {material.youngModulusPa === null ? "Unknown" : metric(material.youngModulusPa,"Pa")} · Hypothetical / User-assumed</li>)}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
