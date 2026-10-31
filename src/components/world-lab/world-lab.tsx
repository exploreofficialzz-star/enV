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
import { deriveDropInput, runDropExperiment, sampleDrop, type DropRun } from "@/lib/world-lab/physical-motion";
import { deriveActuatorInput, runActuatorExperiment, sampleActuator, type ActuatorRun } from "@/lib/world-lab/electromechanical";
import { starterDcNetwork, solveDcNetwork, type DcNetworkResult } from "@/lib/world-lab/network";
import {addCircuitNode,addCircuitResistor,rewireCircuitPart,removeUnusedCircuitNode}
  from "@/lib/world-lab/network-graph";
import {WorldLabCircuitDiagram} from "./circuit-diagram";
import {createWorldLabAssembly,moveWorldLabAssembly,ungroupWorldLabAssembly,
  summarizeWorldLabAssembly} from "@/lib/world-lab/assemblies";
import {emptyWorldLabEditHistory,recordWorldLabEdit,travelWorldLabEdit,
  snapSolidPosition,measureSolidCenters} from "@/lib/world-lab/edit-history";
import { runNetworkMotorExperiment,type NetworkMotorRun } from "@/lib/world-lab/network-motor";
import {runChemicalThermal,sampleChemicalThermal,
  type ReactionThermalInput,type ReactionThermalRun} from "@/lib/world-lab/chemical-thermal";
import { calculateHydrostatics,type HydrostaticResult } from "@/lib/world-lab/hydrostatics";
import {runFluidMotion,sampleFluidMotion,type FluidMotionRun}
  from "@/lib/world-lab/fluid-motion";
import { WorldLabFluidCutaway } from "./fluid-cutaway";
import { verifyActuatorNumerics, type ActuatorNumericalAudit } from "@/lib/world-lab/actuator-verification";
import { buildScientificTimeTrace } from "@/lib/world-lab/time-trace";
import { illustrativeLayerForDepth, observerTravelMetres, OBSERVER_BOUNDS_METRES } from "@/lib/world-lab/observer";
import {
  advancePlayback, DEMO_DURATION_SECONDS, runExperiment, sampleRun, validateNovelMaterial,
  HEAT_CELLS, type AssumedMassSource, type DampedOscillator, type HeatRod, type LabRun, type ModelInput, type RCCircuit,
} from "@/lib/world-lab/model";

type RemoteWorldLabJob=Readonly<{
  id:string;status:"queued"|"running"|"succeeded"|"failed"|"cancelled";
  projectId:string;projectRevision:number;kind:string;
  result:unknown|null;errorCode:string|null;
}>;
type RemoteJobReply=Readonly<{
  ok?:boolean;code?:string;error?:string;job?:RemoteWorldLabJob;
}>;
const remoteJobsEnabled=import.meta.env.VITE_WORLD_LAB_JOBS_ENABLED==="true";
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
  const [project, setProjectState] = useState<WorldLabProject | null>(null);
  const projectForEdits=useRef<WorldLabProject|null>(null);
  const editHistory=useRef(emptyWorldLabEditHistory());
  const [editEpoch,setEditEpoch]=useState(0);
  const [gridStep,setGridStep]=useState(0.5);
  const [measureTargetId,setMeasureTargetId]=useState("");
  const [assemblyName,setAssemblyName]=useState("My invention");
  const [assemblySecondId,setAssemblySecondId]=useState("");
  const [assemblyStep,setAssemblyStep]=useState(0.5);
  function setProject(value:WorldLabProject|null|
    ((current:WorldLabProject|null)=>WorldLabProject|null)){
    const next=typeof value==="function"?value(projectForEdits.current):value;
    projectForEdits.current=next;setProjectState(next);
  }
  function clearEditHistory(){
    editHistory.current=emptyWorldLabEditHistory();
    setEditEpoch(x=>x+1);
  }
  const [savedProjects, setSavedProjects] = useState<WorldLabProject[]>([]);
  const [remoteKind,setRemoteKind]=useState<"hydrostatics"|"dc-network"|"wired-motor"|"chemical-thermal">("hydrostatics");
  const [remoteJob,setRemoteJob]=useState<RemoteWorldLabJob|null>(null);
  const [remoteError,setRemoteError]=useState("");
  const [remoteBusy,setRemoteBusy]=useState(false);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [fluidRun,setFluidRun]=useState<HydrostaticResult|null>(null);
  const [chemicalInput,setChemicalInput]=useState<ReactionThermalInput>({
    initialReactantMol:1,initialTemperatureK:300,ambientTemperatureK:300,
    preExponentialPerS:0.5,activationEnergyJPerMol:10000,
    reactionHeatReleasedJPerMol:50000,heatCapacityJPerK:500,
    coolingConductanceWPerK:5,externalHeatingW:0,durationSeconds:6,
  });
  const [chemicalRun,setChemicalRun]=useState<ReactionThermalRun|null>(null);
  const [chemicalTime,setChemicalTime]=useState(0);
  const [chemicalPlaying,setChemicalPlaying]=useState(false);
  const [fluidDensity,setFluidDensity]=useState(1000);
  const [fluidDepth,setFluidDepth]=useState(0.5);
  const [fluidMotionRun,setFluidMotionRun]=useState<FluidMotionRun|null>(null);
  const [fluidMotionTime,setFluidMotionTime]=useState(0);
  const [fluidMotionPlaying,setFluidMotionPlaying]=useState(false);
  const [fluidMotionRate,setFluidMotionRate]=useState(1);
  const [fluidSurfaceHeight,setFluidSurfaceHeight]=useState(1);
  const [fluidDrag,setFluidDrag]=useState(200);
  const [dropRun, setDropRun] = useState<DropRun | null>(null);
  const [dropTime, setDropTime] = useState(0);
  const [dropPlaying, setDropPlaying] = useState(false);
  const [dropHeight, setDropHeight] = useState(5);
  const [dropBounce, setDropBounce] = useState(0.3);
  const [dropPlaybackRate, setDropPlaybackRate] = useState(1);
  const [dcRun,setDcRun]=useState<DcNetworkResult|null>(null);
  const [wiredMotorRun,setWiredMotorRun]=useState<NetworkMotorRun|null>(null);
  const [newCircuitNodeLabel,setNewCircuitNodeLabel]=useState("");
  const [wirePositive,setWirePositive]=useState("supply");
  const [wireNegative,setWireNegative]=useState("ground");
  const [wireResistance,setWireResistance]=useState(200);
  const [inventedDeviceName,setInventedDeviceName]=useState("");
  const [inventedDeviceAssumption,setInventedDeviceAssumption]=useState("");
  const [inventedDeviceResistance,setInventedDeviceResistance]=useState("");
  const [actuatorRun, setActuatorRun] = useState<ActuatorRun | null>(null);
  const [actuatorAudit, setActuatorAudit] = useState<ActuatorNumericalAudit | null>(null);
  const [actuatorTime, setActuatorTime] = useState(0);
  const [actuatorPlaying, setActuatorPlaying] = useState(false);
  const [actuatorRate, setActuatorRate] = useState(1);
  const [actuatorVoltage, setActuatorVoltage] = useState(24);
  const [actuatorConstant, setActuatorConstant] = useState(8);
  const [actuatorHeatEnabled,setActuatorHeatEnabled] = useState(false);
  const [coilHeatCapacity,setCoilHeatCapacity] = useState(80);
  const [coilCooling,setCoilCooling] = useState(0.3);
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
  const chemicalSample=chemicalRun?sampleChemicalThermal(chemicalRun,chemicalTime):null;
  const measurementTarget=project?.entities.find(e=>e.id===measureTargetId)??null;
  const measurement=selectedEntity&&measurementTarget&&selectedEntity.id!==measurementTarget.id
    ?measureSolidCenters(selectedEntity,measurementTarget):null;
  const canUndo=editHistory.current.past.length>0,canRedo=editHistory.current.future.length>0;
  void editEpoch;
  const selectedDrop = dropRun && selectedEntity?.id === dropRun.source.entityId
    && project?.id === dropRun.source.projectId
    && project?.revision === dropRun.source.projectRevision ? dropRun : null;
  const dropSample = selectedDrop ? sampleDrop(selectedDrop, Math.min(dropTime, selectedDrop.input.durationSeconds)) : null;
  const selectedFluidMotion=fluidMotionRun &&
    fluidMotionRun.source.projectId===project?.id &&
    fluidMotionRun.source.projectRevision===project?.revision &&
    fluidMotionRun.source.entityId===selectedEntity?.id ?fluidMotionRun:null;
  const fluidMotionSample=selectedFluidMotion
    ?sampleFluidMotion(selectedFluidMotion,fluidMotionTime):null;
  const selectedActuator = actuatorRun && selectedEntity?.id === actuatorRun.source.entityId
    && project?.id === actuatorRun.source.projectId
    && project?.revision === actuatorRun.source.projectRevision ? actuatorRun : null;
  const actuatorSample = selectedActuator
    ? sampleActuator(selectedActuator, Math.min(actuatorTime, selectedActuator.input.durationSeconds)) : null;
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
    if (!actuatorPlaying || !actuatorRun) return;
    let frame=0;
    let previous=0;
    const tick=(now:number)=>{
      if(previous) {
        const elapsed=Math.min(0.05,(now-previous)/1000);
        setActuatorTime(t=>Math.min(actuatorRun.input.durationSeconds,t+elapsed*actuatorRate));
      }
      previous=now;
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  },[actuatorPlaying,actuatorRun,actuatorRate]);
  useEffect(()=>{
    if(actuatorRun && actuatorTime>=actuatorRun.input.durationSeconds)setActuatorPlaying(false);
  },[actuatorRun,actuatorTime]);
  useEffect(()=>{
    const scene=sceneRef.current;
    if(!scene || !selectedActuator || !actuatorSample)return;
    const mesh=scene.addedShapes.get(selectedActuator.source.entityId);
    const entity=project?.entities.find(x=>x.id===selectedActuator.source.entityId);
    if(mesh && entity) {
      mesh.position.y=entity.dimensionsMeters[1]/2+actuatorSample.heightM;
    }
  },[selectedActuator,actuatorSample,project]);

  useEffect(()=>{
    if(!fluidMotionPlaying||!fluidMotionRun)return;
    let frame=0,previous=0;
    const tick=(now:number)=>{
      if(previous){
        const elapsed=Math.min(0.05,(now-previous)/1000);
        setFluidMotionTime(t=>Math.min(fluidMotionRun.input.durationSeconds,
          t+elapsed*fluidMotionRate));
      }
      previous=now;frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  },[fluidMotionPlaying,fluidMotionRun,fluidMotionRate]);
  useEffect(()=>{
    if(fluidMotionRun && fluidMotionTime>=fluidMotionRun.input.durationSeconds)
      setFluidMotionPlaying(false);
  },[fluidMotionRun,fluidMotionTime]);
  useEffect(()=>{
    const scene=sceneRef.current;
    if(!scene||!selectedFluidMotion||!fluidMotionSample)return;
    const mesh=scene.addedShapes.get(selectedFluidMotion.source.entityId);
    const entity=project?.entities.find(x=>x.id===selectedFluidMotion.source.entityId);
    if(mesh&&entity)
      mesh.position.y=fluidMotionSample.bottomHeightM+entity.dimensionsMeters[1]/2;
  },[selectedFluidMotion,fluidMotionSample,project]);
  useEffect(()=>{
    const scene=sceneRef.current?.scene;
    if(!scene||!selectedFluidMotion)return;
    const water=B.MeshBuilder.CreateGround("fluid-motion-assumed-surface",
      {width:12,height:12},scene);
    water.position.y=selectedFluidMotion.input.waterSurfaceHeightM;
    const color=new B.StandardMaterial("fluid-motion-assumed-water",scene);
    color.diffuseColor=new B.Color3(0.05,0.55,0.9);
    color.alpha=0.25;
    color.backFaceCulling=false;
    water.material=color;
    water.isPickable=false;
    return ()=>{water.dispose();color.dispose();};
  },[selectedFluidMotion]);
  useEffect(()=>{
    if(!chemicalPlaying||!chemicalRun)return;
    let frame=0,previous=0;
    const tick=(now:number)=>{
      if(previous){
        const elapsed=Math.min(0.05,(now-previous)/1000);
        setChemicalTime(t=>Math.min(chemicalRun.input.durationSeconds,t+elapsed));
      }
      previous=now;
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  },[chemicalPlaying,chemicalRun]);
  useEffect(()=>{
    if(chemicalRun&&chemicalTime>=chemicalRun.input.durationSeconds)
      setChemicalPlaying(false);
  },[chemicalTime,chemicalRun]);
  useEffect(() => {
    if (!dropPlaying || !dropRun) return;
    let frame = 0;
    let previous = 0;
    const tick = (now: number) => {
      if (previous) {
        const elapsed = Math.min(0.05, (now - previous) / 1000);
        setDropTime(t => Math.min(dropRun.input.durationSeconds, t + elapsed * dropPlaybackRate));
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dropPlaying, dropRun, dropPlaybackRate]);
  useEffect(() => {
    if (dropRun && dropTime >= dropRun.input.durationSeconds) setDropPlaying(false);
  }, [dropRun, dropTime]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !selectedDrop || !dropSample) return;
    const mesh = scene.addedShapes.get(selectedDrop.source.entityId);
    if (mesh) {
      mesh.position.y = selectedDrop.input.supportingHalfHeightM + dropSample.heightAboveGroundM;
    }
  }, [selectedDrop, dropSample, project]);

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
    setDropPlaying(false);
    setActuatorPlaying(false);
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
  function startDropWithSelectedSolid() {
    if (!project || !selectedEntity) return;
    setError("");
    try {
      const derived = deriveDropInput(project, selectedEntity.id, {
        heightM: dropHeight, restitution: dropBounce,
      });
      const result = runDropExperiment(derived.input, derived.source);
      setPlaying(false);
      setActuatorPlaying(false);
      setActuatorRun(null);
      setDropRun(result);
      setDropTime(0);
      setDropPlaying(true);
      setMessage("Calculated a free-fall and flat-ground contact experiment using assumed density. " +
        "The 3D motion is a solver visualization, not proof of material strength.");
    } catch (cause) {
      setDropPlaying(false);
      setError(cause instanceof Error ? cause.message : "This solid cannot yet be tested.");
    }
  }

  function startActuatorWithSelectedSolid(wired=false) {
    if(!project || !selectedEntity)return;
    setError("");
    try {
      const thermal=actuatorHeatEnabled?{thermal:{
        initialTemperatureK:293.15,ambientTemperatureK:293.15,
        heatCapacityJPerK:coilHeatCapacity,coolingWPerK:coilCooling,
        resistanceTemperatureCoefficientPerK:0.004}}:{};
      const wiredRun=wired?runNetworkMotorExperiment(project,selectedEntity.id,{
        forceConstantNPerA:actuatorConstant,...thermal,
      }):null;
      const derived=wiredRun?null:deriveActuatorInput(project,selectedEntity.id,{
        supplyVoltageV:actuatorVoltage,forceConstantNPerA:actuatorConstant,...thermal,
      });
      const result=wiredRun?.motor??runActuatorExperiment(
        derived!.input,derived!.source);
      setWiredMotorRun(wiredRun);
      const numericalAudit=verifyActuatorNumerics(result);
      setActuatorAudit(numericalAudit);
      setPlaying(false);
      setDropPlaying(false);
      setDropRun(null);
      setActuatorRun(result);
      setActuatorTime(0);
      setActuatorPlaying(true);
      setMessage("Calculated electrical energy, coil current, back-EMF, gravity and actuator motion together. " +
        "All material and motor values remain hypothetical user assumptions.");
    } catch(cause) {
      setActuatorPlaying(false);
      setError(cause instanceof Error?cause.message:"The electromechanical model cannot run with these parameters.");
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
  function invalidateWorldLabResults(){
    setDropPlaying(false);setDropRun(null);setFluidRun(null);
    setFluidMotionPlaying(false);setFluidMotionRun(null);
    setActuatorPlaying(false);setActuatorRun(null);setActuatorAudit(null);
    setWiredMotorRun(null);setDcRun(null);setRemoteJob(null);
  }
  function mutateProject(transform:(current:WorldLabProject)=>WorldLabProject){
    const current=projectForEdits.current;
    if(!current)return;
    try{
      const edit=recordWorldLabEdit(editHistory.current,current,transform(current));
      if(!edit.changed)return;
      editHistory.current=edit.history;setEditEpoch(n=>n+1);
      invalidateWorldLabResults();
      setProject(edit.project);setWorkspaceDirty(true);setError("");
    }catch(err){setError(err instanceof Error?err.message:"Edit rejected.");}
  }
  function travelEdit(direction:"undo"|"redo"){
    const current=projectForEdits.current;
    if(!current)return;
    try{
      const step=travelWorldLabEdit(editHistory.current,current,direction);
      if(!step)return;
      editHistory.current=step.history;setEditEpoch(n=>n+1);
      invalidateWorldLabResults();
      setProject(step.project);
      setSelectedEntityId(id=>step.project.entities.some(e=>e.id===id)?id:"");
      setWorkspaceDirty(true);
      setMessage(direction==="undo"?"Undid invention edit. Save to keep this version.":
        "Redid invention edit. Save to keep this version.");
      setError("");
    }catch(err){setError(err instanceof Error?err.message:"Cannot restore edit.");}
  }
  async function submitRemoteJob(){
    if(!remoteJobsEnabled||!project||remoteBusy)return;
    setRemoteBusy(true);setRemoteError("");
    try{
      if(remoteKind!=="dc-network"&&remoteKind!=="chemical-thermal"&&!selectedEntityId)
        throw new Error("Select an invented solid before submitting this experiment.");
      const body=remoteKind==="dc-network"?{kind:remoteKind,project}:
        remoteKind==="chemical-thermal"?{kind:remoteKind,project,chemicalInput}:
        remoteKind==="hydrostatics"?{
          kind:remoteKind,project,entityId:selectedEntityId,
          fluidDensityKgM3:fluidDensity,
          immersionDepthM:Math.min(fluidDepth,selectedEntity?.dimensionsMeters[1]??0),
        }:{
          kind:remoteKind,project,entityId:selectedEntityId,
          forceConstantNPerA:actuatorConstant,thermal:actuatorHeatEnabled,
        };
      const response=await fetch("/api/world-lab/jobs",{
        method:"POST",credentials:"same-origin",
        headers:{"content-type":"application/json",
          "idempotency-key":crypto.randomUUID()},
        body:JSON.stringify(body),
      });
      const data=await response.json() as RemoteJobReply;
      if(!response.ok||!data.job)
        throw new Error(data.error||data.code||"Server calculation is unavailable.");
      setRemoteJob(data.job);
    }catch(cause){
      setRemoteJob(null);
      setRemoteError(cause instanceof Error?cause.message:"Could not submit server calculation.");
    }finally{setRemoteBusy(false);}
  }
  async function cancelRemoteJob(){
    if(!remoteJob||!remoteJobsEnabled)return;
    setRemoteError("");
    try{
      const response=await fetch("/api/world-lab/jobs/"+encodeURIComponent(remoteJob.id)+"/cancel",{
        method:"POST",credentials:"same-origin",
      });
      const data=await response.json() as RemoteJobReply;
      if(!response.ok||!data.job)throw new Error(data.error||data.code||"Cancellation failed.");
      setRemoteJob(data.job);
    }catch(cause){
      setRemoteError(cause instanceof Error?cause.message:"Cancellation could not be confirmed.");
    }
  }
  useEffect(()=>{
    const jobId=remoteJob?.id;
    if(!remoteJobsEnabled||!jobId)return;
    let disposed=false;
    let pending:ReturnType<typeof setTimeout>|undefined;
    const poll=async()=>{
      let retry=false;
      try{
        const response=await fetch("/api/world-lab/jobs/"+encodeURIComponent(jobId),{
          credentials:"same-origin",cache:"no-store",
        });
        const data=await response.json() as RemoteJobReply;
        if(!response.ok||!data.job)throw new Error(data.error||data.code||"Job status unavailable.");
        if(disposed)return;
        setRemoteJob(previous=>previous?.id===jobId?data.job!:previous);
        retry=data.job.status==="queued"||data.job.status==="running";
      }catch(cause){
        if(!disposed){
          setRemoteError(cause instanceof Error?cause.message:"Job status could not be retrieved.");
        }
      }
      if(!disposed&&retry)pending=setTimeout(()=>{void poll();},2000);
    };
    void poll();
    return ()=>{disposed=true;if(pending)clearTimeout(pending);};
  },[remoteJob?.id]);
  function simulateFluidMotion(){
    if(!project||!selectedEntity)return;
    setError("");
    try {
      const result=runFluidMotion(project,selectedEntity.id,{
        fluidDensityKgM3:fluidDensity,
        waterSurfaceHeightM:fluidSurfaceHeight,
        startingBottomHeightM:Math.max(0,selectedEntity.positionMeters[1]-
          selectedEntity.dimensionsMeters[1]/2),
        linearDragNsPerM:fluidDrag,
        gravityMps2:9.80665,durationSeconds:4,
      });
      setDropPlaying(false);setActuatorPlaying(false);
      setFluidMotionRun(result);setFluidMotionTime(0);setFluidMotionPlaying(true);
      setMessage("Calculated real time-dependent buoyancy and vertical motion for the assumed material; this is a bounded static-water model.");
    }catch(cause){
      setFluidMotionPlaying(false);setFluidMotionRun(null);
      setError(cause instanceof Error?cause.message:"Fluid trajectory exceeds this solver's limits.");
    }
  }
  function calculateChemicalReaction(){
    setError("");
    try{
      const run=runChemicalThermal(chemicalInput);
      setChemicalRun(run);setChemicalTime(0);setChemicalPlaying(true);
      setMessage("Calculated coupled chemical conversion and temperature from user-supplied assumptions; no real substance is identified.");
    }catch(cause){
      setChemicalPlaying(false);setChemicalRun(null);
      setError(cause instanceof Error?cause.message:"Unsupported chemical assumptions.");
    }
  }
  function runFluidTest(){
    if(!project||!selectedEntity)return;
    setError("");
    try {
      setFluidRun(calculateHydrostatics(project,selectedEntity.id,{
        fluidDensityKgM3:fluidDensity,gravityMps2:9.80665,
        immersionDepthM:Math.min(fluidDepth,selectedEntity.dimensionsMeters[1]),
      }));
    }catch(cause){
      setFluidRun(null);
      setError(cause instanceof Error?cause.message:"Fluid experiment is outside its limits.");
    }
  }
  function createCircuit(){
    if(!project || (project.networks?.length??0)>=12)return;
    mutateProject(p=>({...p,networks:[...(p.networks??[]),starterDcNetwork(crypto.randomUUID())]}));
    setMessage("Circuit added. Change the source and resistor, then calculate its connected current.");
  }
  function updateCircuitValue(componentId:string,value:number){
    if(!Number.isFinite(value))return;
    mutateProject(p=>({...p,networks:(p.networks??[]).map((net,index)=>index!==0?net:{
      ...net,components:net.components.map(c=>c.id!==componentId?c:
        c.kind==="dc-source"?{...c,voltageV:value}:
        c.kind==="resistor"?{...c,resistanceOhm:value}:c),
    })}));
  }
  function calculateCircuit(){
    if(!project?.networks?.[0])return;
    setError("");
    try{setDcRun(solveDcNetwork(project.networks[0],project));}
    catch(cause){setDcRun(null);setError(cause instanceof Error?cause.message:"Cannot calculate this circuit.");}
  }
  function inventDevice(){
    if(!project?.networks?.[0] || !project.networks[0].components.some(c=>c.kind==="dc-source") ||
      !inventedDeviceName.trim() || !inventedDeviceAssumption.trim())return;
    mutateProject(p=>({...p,networks:(p.networks??[]).map((net,index)=>index!==0?net:{
      ...net,components:[...net.components,{id:crypto.randomUUID(),kind:"hypothetical-device" as const,
        name:inventedDeviceName.trim(),assumption:inventedDeviceAssumption.trim(),
        ...(inventedDeviceResistance.trim()?{assumedResistanceOhm:Number(inventedDeviceResistance)}:{}),
        positiveNodeId:net.components.find(c=>c.kind==="dc-source")?.positiveNodeId??net.groundNodeId,
        negativeNodeId:net.components.find(c=>c.kind==="dc-source")?.negativeNodeId??net.groundNodeId,
        evidence:"hypothetical-user-assumed" as const}],
    })}));
    setInventedDeviceName("");setInventedDeviceAssumption("");setInventedDeviceResistance("");
    setMessage(inventedDeviceResistance.trim()
      ?"Invented component connected using your assumed equivalent Ohmic resistance; the invention is not physically verified."
      :"Invented device connected without fabricated properties; enter an explicit model before solving.");
  }
  function addShape(shape: WorldLabEntity["shape"]) {
    if (!project || shapeCount >= 200) return;
    const item = newSolid(crypto.randomUUID(),shape,shapeCount);
    mutateProject(current=>({...current,entities:[...current.entities,item]}));
    setSelectedEntityId(item.id);
  }
  function editSelected(patch: Partial<WorldLabEntity>) {
    if (!selectedEntity) return;
    setDropPlaying(false);
    setDropRun(null);
    mutateProject(current=>({...current, entities:current.entities.map(e=>
      e.id===selectedEntity.id?{...e,...patch}:e)}));
  }
  async function save() {
    if (!project) return;
    setError("");
    try {
      const saved=await putLocalWorldLabProject(project,savedRevision);
      setProject(saved);
      clearEditHistory();
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
      clearEditHistory();
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
    setProject(saved);clearEditHistory();setSavedRevision(saved.revision);setWorkspaceDirty(false);
    setSelectedEntityId("");setRuns([]);setRunId("");setComparisonRunId("");setPlaying(false);setTimeSeconds(0);
    restoreRunsForProject(saved.id);
    setMessage("Opened saved project "+saved.title+".");
  }
  function newProject(){
    if((workspaceDirty || (savedRevision === null && runs.length > 0)) &&
       !window.confirm("Discard unsaved local edits or recorded experiments and create a new project?"))return;
    restoreRunsEpoch.current++;
    setProject(blankWorldLabProject(crypto.randomUUID(),new Date().toISOString()));
    clearEditHistory();
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
      {remoteJobsEnabled && <section className="mb-3 rounded-xl border border-border p-3"
        aria-label="Authenticated remote World Lab calculations">
        <h3 className="text-sm font-semibold">Run on your account's science worker</h3>
        <p className="text-xs text-muted-foreground">
          Advanced account-owned calculations. Only supported bounded models are submitted;
          your locally saved projects remain available offline.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <select className={inputLabel} value={remoteKind}
            aria-label="Remote calculation type"
            onChange={e=>{setRemoteKind(e.target.value as typeof remoteKind);setRemoteJob(null);setRemoteError("");}}>
            <option value="hydrostatics">Floating and buoyancy</option>
            <option value="dc-network">Connected DC circuit</option>
            <option value="wired-motor">Circuit-powered lifting machine</option>
            <option value="chemical-thermal">Hypothetical chemical heating</option>
          </select>
          <button type="button" className={buttonClass} disabled={remoteBusy||!project||
              (remoteKind!=="dc-network"&&remoteKind!=="chemical-thermal"&&!selectedEntity)||
              (remoteKind!=="hydrostatics"&&!project?.networks?.[0])}
            onClick={()=>{void submitRemoteJob();}}>
            {remoteBusy?"Submitting calculation…":"Submit authenticated job"}
          </button>
          {remoteJob&&(remoteJob.status==="queued"||remoteJob.status==="running")&&
            <button type="button" className={buttonClass}
              onClick={()=>{void cancelRemoteJob();}}>Cancel job</button>}
        </div>
        {remoteError&&<p role="alert" className="mt-2 text-xs">{remoteError}</p>}
        {remoteJob&&remoteJob.projectId===project?.id&&
          remoteJob.projectRevision===project?.revision&&
          <div role="status" aria-live="polite" className="mt-2 text-xs">
            <p>Job {remoteJob.id}: {remoteJob.status}</p>
            {remoteJob.errorCode&&<p>Solver status: {remoteJob.errorCode}</p>}
            {remoteJob.status==="succeeded"&&remoteJob.result!==null&&
              <button type="button" className={buttonClass} onClick={()=>
                downloadJson("world-lab-owned-computation-evidence.json",remoteJob.result)}>
                Export authenticated calculation evidence
              </button>}
          </div>}
      </section>}
      <section className="mb-3 rounded-xl border border-border p-3"
        aria-label="Chemical reaction and temperature experiment">
        <h3 className="text-sm font-semibold">See how an imagined reaction makes heat</h3>
        <p className="text-xs text-muted-foreground">
          Invent a hypothetical reaction. Temperature changes its rate;
          released reaction heat changes temperature. These are your assumptions,
          not proven chemical identities or real safety predictions.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([
            ["initialReactantMol","Starting substance (mol)",0.001,10000,0.1],
            ["preExponentialPerS","Assumed reaction factor (1/s)",0,100000,0.1],
            ["activationEnergyJPerMol","Activation energy (J/mol)",0,200000,1000],
            ["reactionHeatReleasedJPerMol","Heat released (+) or absorbed (−) (J/mol)",-1000000,1000000,1000],
            ["heatCapacityJPerK","Total heat capacity (J/K)",1,1000000,50],
            ["coolingConductanceWPerK","Cooling (W/K)",0,10000,1],
            ["initialTemperatureK","Starting temperature (K)",200,1200,10],
            ["ambientTemperatureK","Surrounding temperature (K)",200,1200,10],
            ["externalHeatingW","External heating (+) or cooling (−) (W)",-10000,10000,10],
          ] as const).map(([field,label,min,max,step])=>
            <label key={field} className="text-xs">{label}
              <input className={inputLabel} type="number" min={min} max={max}
                step={step} aria-label={label} value={chemicalInput[field]}
                onChange={e=>{
                  setChemicalPlaying(false);setChemicalRun(null);
                  setChemicalInput(p=>({...p,[field]:Number(e.target.value)}));
                }}/>
            </label>)}
        </div>
        <button type="button" className={buttonClass+" mt-2"}
          onClick={calculateChemicalReaction}>Calculate reaction and temperature</button>
        {chemicalRun&&chemicalSample&&<div className="mt-2 rounded-lg border border-border p-2 text-xs"
          aria-label="Computed reaction rate and thermal energy">
          <p>Time: {chemicalSample.timeSeconds.toFixed(3)} s</p>
          <p>Conversion: {(100*chemicalSample.productFormedMol/
            chemicalRun.input.initialReactantMol).toFixed(2)}%</p>
          <p>Temperature: {chemicalSample.temperatureK.toFixed(3)} K</p>
          <p>Reaction rate: {chemicalSample.reactionRateMolPerS.toExponential(3)} mol/s</p>
          <p>Reaction thermal power: {chemicalSample.reactionPowerW.toFixed(3)} W</p>
          <p>Stored heat change: {chemicalSample.storedThermalEnergyChangeJ.toFixed(4)} J</p>
          <p>Energy balance residual: {chemicalSample.energyResidualJ.toExponential(3)} J</p>
          <div className="mt-1 h-2 overflow-hidden rounded bg-slate-200"
            role="img" aria-label="Computed fraction of assumed reactant converted">
            <div className="h-full bg-blue-600" style={{
              width:(100*chemicalSample.productFormedMol/
                chemicalRun.input.initialReactantMol)+"%",
            }}/>
          </div>
          <label className="mt-2 block">Explore reaction time
            <input className="w-full" type="range" min={0}
              max={chemicalRun.input.durationSeconds}
              step={chemicalRun.solverStepSeconds} value={chemicalTime}
              aria-label="Explore chemical time"
              onChange={e=>{setChemicalPlaying(false);setChemicalTime(Number(e.target.value));}}/>
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={buttonClass}
              onClick={()=>setChemicalPlaying(v=>!v)}>
              {chemicalPlaying?"Pause reaction":"Play reaction"}
            </button>
            <button type="button" className={buttonClass} onClick={()=>{
              setChemicalPlaying(false);setChemicalTime(t=>
                Math.min(chemicalRun.input.durationSeconds,t+chemicalRun.solverStepSeconds));
            }}>Step reaction</button>
            <button type="button" className={buttonClass} onClick={()=>{
              setChemicalPlaying(false);setChemicalTime(0);
            }}>Reset reaction</button>
            <button type="button" className={buttonClass}
              onClick={()=>downloadJson("world-lab-hypothetical-reaction-evidence.json",chemicalRun)}>
              Export reaction evidence
            </button>
          </div>
          <p className="mt-1 text-muted-foreground">{chemicalRun.validity}</p>
        </div>}
      </section>
      <section className="mb-3 rounded-xl border border-border p-3" aria-label="Connected inventions and DC circuit">
        <h3 className="text-sm font-semibold">Connect electricity</h3>
        <p className="text-xs text-muted-foreground">Build a small connected circuit. Current and power are calculated from the wires (shared nodes), not animated guesses.</p>
        {(project?.networks?.length??0)===0 && <button className={buttonClass+" mt-2"} type="button" onClick={createCircuit}>Build first circuit</button>}
        {project?.networks?.[0] && <>
          <WorldLabCircuitDiagram network={project.networks[0]}
            result={dcRun?.projectId===project.id &&
              dcRun.projectRevision===project.revision?dcRun:null}/>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {project.networks[0].components.filter(c=>c.kind==="dc-source" || c.kind==="resistor").map(c=>
              <label key={c.id} className="text-xs">
                {c.kind==="dc-source"?"Battery voltage (V)":"Resistor ("+c.id+") (Ω)"}
                <input className={inputLabel} type="number" aria-label={c.kind==="dc-source"?"Battery voltage":"Resistance "+c.id}
                  min={c.kind==="dc-source"?-1000:0.01} max={c.kind==="dc-source"?1000:1000000000}
                  step={c.kind==="dc-source"?1:10}
                  value={c.kind==="dc-source"?c.voltageV:c.kind==="resistor"?c.resistanceOhm:0}
                  onChange={e=>updateCircuitValue(c.id,Number(e.target.value))}/>
              </label>)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={()=>{
              const net=project.networks?.[0];
              if(!net||net.components.length>=48||
                !net.components.some(c=>c.kind==="dc-source"))return;
              mutateProject(p=>({...p,networks:(p.networks??[]).map((n,i)=>i? n:{
                ...n,components:[...n.components,{id:crypto.randomUUID(),kind:"resistor" as const,
                  positiveNodeId:n.components.find(c=>c.kind==="dc-source")?.positiveNodeId??n.groundNodeId,
                  negativeNodeId:n.components.find(c=>c.kind==="dc-source")?.negativeNodeId??n.groundNodeId,
                  resistanceOhm:200}],
              })}));
            }}>Add parallel resistor</button>
            <button type="button" className={buttonClass} onClick={calculateCircuit}>Calculate circuit</button>
          </div>
          <details className="mt-2 rounded-lg border border-border p-2" aria-label="Advanced circuit wiring">
            <summary className="cursor-pointer text-xs font-medium">Connect more parts and wires</summary>
            <p className="mt-2 text-xs text-muted-foreground">
              A wire is a shared named node. Place components between two different
              nodes; unconnected nodes cannot be calculated until wired.
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs">New wire junction name
                <input className={inputLabel} aria-label="New electrical node label"
                  maxLength={80} value={newCircuitNodeLabel}
                  onChange={e=>setNewCircuitNodeLabel(e.target.value)}/>
              </label>
              <button type="button" className={buttonClass}
                disabled={!newCircuitNodeLabel.trim()||project.networks[0].nodes.length>=24}
                onClick={()=>{
                  mutateProject(p=>({...p,networks:(p.networks??[]).map((n,i)=>i?n:
                    addCircuitNode(n,crypto.randomUUID(),newCircuitNodeLabel))}));
                  setNewCircuitNodeLabel("");
                }}>Add wire junction</button>
            </div>
            <div className="mt-2 space-y-1">
              {project.networks[0].nodes.map(node=><div className="flex items-center justify-between gap-2 text-xs"
                key={node.id}>
                <span>{node.label}{node.id===project.networks![0].groundNodeId?" (ground)":""}</span>
                <button type="button" className={buttonClass}
                  disabled={node.id===project.networks![0].groundNodeId||
                    project.networks![0].nodes.length<=2||
                    project.networks![0].components.some(c=>
                      c.positiveNodeId===node.id||c.negativeNodeId===node.id)}
                  onClick={()=>mutateProject(p=>({...p,
                    networks:(p.networks??[]).map((n,i)=>i?n:removeUnusedCircuitNode(n,node.id)),
                  }))}>Remove unused</button>
              </div>)}
            </div>
            <p className="mt-2 text-xs font-medium">Add resistor between two chosen junctions</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <label className="text-xs">Positive-side junction
                <select className={inputLabel} aria-label="New resistor positive node"
                  value={project.networks[0].nodes.some(n=>n.id===wirePositive)?wirePositive:""}
                  onChange={e=>setWirePositive(e.target.value)}>
                  <option value="">Choose node</option>
                  {project.networks[0].nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </label>
              <label className="text-xs">Negative-side junction
                <select className={inputLabel} aria-label="New resistor negative node"
                  value={project.networks[0].nodes.some(n=>n.id===wireNegative)?wireNegative:""}
                  onChange={e=>setWireNegative(e.target.value)}>
                  <option value="">Choose node</option>
                  {project.networks[0].nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </label>
              <label className="text-xs">Assumed resistance (Ω)
                <input className={inputLabel} aria-label="New wired resistor ohms"
                  type="number" min={0.01} max={1000000000}
                  value={wireResistance} onChange={e=>setWireResistance(Number(e.target.value))}/>
              </label>
              <button type="button" className={buttonClass}
                disabled={project.networks[0].components.length>=48||
                  !project.networks[0].nodes.some(n=>n.id===wirePositive)||
                  !project.networks[0].nodes.some(n=>n.id===wireNegative)||
                  wirePositive===wireNegative||!Number.isFinite(wireResistance)||
                  wireResistance<0.01||wireResistance>1e9}
                onClick={()=>mutateProject(p=>({...p,networks:(p.networks??[]).map((n,i)=>i?n:
                  addCircuitResistor(n,crypto.randomUUID(),wirePositive,wireNegative,wireResistance))}))}>
                Connect resistor
              </button>
            </div>
            <p className="mt-3 text-xs font-medium">Rewire existing components</p>
            {project.networks[0].components.map(part=><div key={part.id}
              className="mt-2 rounded border border-border p-2">
              <p className="text-xs font-medium">
                {part.kind==="dc-source"?"Source":part.kind==="resistor"?"Resistor":part.name}
              </p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <label className="text-xs">Positive terminal
                  <select className={inputLabel} aria-label={"Positive node for "+part.id}
                    value={part.positiveNodeId}
                    onChange={e=>mutateProject(p=>({...p,networks:(p.networks??[]).map((n,i)=>i?n:
                      rewireCircuitPart(n,part.id,e.target.value,part.negativeNodeId))}))}>
                    {project.networks[0].nodes.map(node=>
                      <option key={node.id} value={node.id}>{node.label}</option>)}
                  </select>
                </label>
                <label className="text-xs">Negative terminal
                  <select className={inputLabel} aria-label={"Negative node for "+part.id}
                    value={part.negativeNodeId}
                    onChange={e=>mutateProject(p=>({...p,networks:(p.networks??[]).map((n,i)=>i?n:
                      rewireCircuitPart(n,part.id,part.positiveNodeId,e.target.value))}))}>
                    {project.networks[0].nodes.map(node=>
                      <option key={node.id} value={node.id}>{node.label}</option>)}
                  </select>
                </label>
              </div>
            </div>)}
            <p className="mt-2 text-xs text-muted-foreground">
              Calculations use these node connections and conservation equations.
              This is a bounded DC reference, not a general transient circuit solver.
            </p>
          </details>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs">Invent an unknown electrical device</summary>
            <label className="block text-xs">Name
              <input className={inputLabel} maxLength={120} aria-label="Invented device name"
                value={inventedDeviceName} onChange={e=>setInventedDeviceName(e.target.value)}/>
            </label>
            <label className="block text-xs">Assumed behavior or unknown property
              <input className={inputLabel} maxLength={500} aria-label="Invented device assumption"
                value={inventedDeviceAssumption} onChange={e=>setInventedDeviceAssumption(e.target.value)}/>
            </label>
            <label className="block text-xs">Optional assumed equivalent resistance (Ω)
              <input className={inputLabel} type="number" min={0.01} max={1000000000}
                aria-label="Invented component assumed resistance" value={inventedDeviceResistance}
                placeholder="Leave blank if unknown"
                onChange={e=>setInventedDeviceResistance(e.target.value)}/>
            </label>
            <p className="text-xs text-muted-foreground">Only a declared Ohmic approximation can be calculated; this does not establish how an unknown invention really behaves.</p>
            <button type="button" className={buttonClass} onClick={inventDevice}
              disabled={!inventedDeviceName.trim()||!inventedDeviceAssumption.trim()||
                (inventedDeviceResistance.trim()!==""
                  && (!Number.isFinite(Number(inventedDeviceResistance))||
                      Number(inventedDeviceResistance)<0.01||Number(inventedDeviceResistance)>1e9))||
                project.networks[0].components.length>=48}>Add hypothetical device</button>
            <p className="text-xs text-muted-foreground">Unknown parts do not receive fabricated electronic behavior.</p>
            {project.networks[0].components.filter(c=>c.kind==="hypothetical-device"||c.kind==="resistor").map(c=>
              <div key={c.id} className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span>{c.kind==="hypothetical-device"
                  ? c.name+(c.assumedResistanceOhm===undefined?" (unknown)": " (assumed "+c.assumedResistanceOhm+" Ω)")
                  :"Resistor ("+c.id+")"}</span>
                <button type="button" className={buttonClass}
                  aria-label={"Remove circuit part "+c.id}
                  onClick={()=>mutateProject(p=>({...p,networks:(p.networks??[]).map((n,i)=>i?n:{
                    ...n,components:n.components.filter(x=>x.id!==c.id),
                  })}))}>Remove</button>
              </div>)}
          </details>
          {dcRun && dcRun.projectId===project.id&&dcRun.projectRevision===project.revision&&
            dcRun.networkId===project.networks[0].id && <div className="mt-2 text-xs" aria-label="Calculated circuit results">
              <p>Positive source node: {dcRun.nodeVoltagesV[
                project.networks[0].components.find(c=>c.kind==="dc-source")?.positiveNodeId??project.networks[0].groundNodeId
              ]?.toFixed(3)} V</p>
              <p>Delivered power: {dcRun.sourcePowerSuppliedW.toFixed(4)} W</p>
              <p>Resistor and assumed-Ohmic-device heating: {dcRun.resistivePowerW.toFixed(4)} W</p>
              {dcRun.assumedOhmicDeviceIds.length>0 && <p>Hypothetical equivalent resistors used:
                {" "+dcRun.assumedOhmicDeviceIds.join(", ")}. Their properties are not measured.</p>}
              <p>Conservation residual: {dcRun.powerResidualW.toExponential(2)} W</p>
              {Object.entries(dcRun.branchCurrentsA).map(([id,current])=><p key={id}>{id}: {current.toFixed(5)} A</p>)}
              <button type="button" className={buttonClass} onClick={()=>downloadJson("world-lab-dc-evidence.json",dcRun)}>Export DC evidence</button>
              <p className="text-muted-foreground">{dcRun.validity}</p>
            </div>}
        </>}
      </section>
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
          <section className="mt-3 rounded-lg border border-border p-3" aria-label="Build interconnected visual assemblies">
            <h3 className="text-sm font-semibold">Build an invention from parts</h3>
            <p className="text-xs text-muted-foreground">
              Group two created solids and move them together. This links their layout,
              but does not invent a physical joint or certified rigidity.
            </p>
            {selectedEntity&&<div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs">Assembly name
                <input className={inputLabel} maxLength={120}
                  aria-label="Assembly name" value={assemblyName}
                  onChange={e=>setAssemblyName(e.target.value)}/>
              </label>
              <label className="text-xs">Second part
                <select className={inputLabel} aria-label="Assembly second solid"
                  value={assemblySecondId}
                  onChange={e=>setAssemblySecondId(e.target.value)}>
                  <option value="">Choose another solid</option>
                  {project?.entities.filter(e=>e.id!==selectedEntity.id &&
                    !(project?.assemblies??[]).some(a=>a.entityIds.includes(e.id))).map(e=>
                      <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
              <button className={buttonClass} type="button"
                disabled={!assemblyName.trim()||!assemblySecondId||
                  (project?.assemblies?.length??0)>=50||
                  (project?.assemblies??[]).some(a=>a.entityIds.includes(selectedEntity.id))}
                onClick={()=>mutateProject(p=>createWorldLabAssembly(p,crypto.randomUUID(),
                  assemblyName,[selectedEntity.id,assemblySecondId]))}>
                Connect these visual parts
              </button>
            </div>}
            {project?.assemblies?.map(a=>{
              const details=summarizeWorldLabAssembly(project,a.id);
              return <div key={a.id} className="mt-2 rounded border border-border p-2 text-xs">
                <p className="font-medium">{a.name} · {details.count} solids</p>
                <p>Combined shape volumes: {details.volumeM3.toFixed(4)} m³</p>
                <p>Assumed combined mass: {details.assumedMassKg===null?"Unknown":
                  details.assumedMassKg.toFixed(3)+" kg"}</p>
                <p className="text-muted-foreground">{details.validity}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {(["X","Y","Z"] as const).map((axis,index)=><span key={axis}
                    className="flex flex-wrap items-center gap-1">
                    <button type="button" className={buttonClass}
                      aria-label={"Move "+a.name+" negative "+axis}
                      onClick={()=>mutateProject(p=>moveWorldLabAssembly(p,a.id,
                        ([0,1,2] as const).map(i=>i===index?-assemblyStep:0) as [number,number,number]))}>
                      −{axis}
                    </button>
                    <button type="button" className={buttonClass}
                      aria-label={"Move "+a.name+" positive "+axis}
                      onClick={()=>mutateProject(p=>moveWorldLabAssembly(p,a.id,
                        ([0,1,2] as const).map(i=>i===index?assemblyStep:0) as [number,number,number]))}>
                      +{axis}
                    </button>
                  </span>)}
                  <button type="button" className={buttonClass}
                    onClick={()=>mutateProject(p=>ungroupWorldLabAssembly(p,a.id))}>
                    Disconnect group
                  </button>
                </div>
              </div>;
            })}
            <label className="mt-2 block text-xs">Group movement increment (m)
              <select className={inputLabel} aria-label="Assembly movement increment"
                value={assemblyStep} onChange={e=>setAssemblyStep(Number(e.target.value))}>
                <option value={0.1}>0.1</option><option value={0.5}>0.5</option>
                <option value={1}>1</option><option value={5}>5</option>
              </select>
            </label>
          </section>
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
              onClick={() => {if(selectedEntity)mutateProject(p=>({...p,
                entities:p.entities.filter(e=>e.id!==selectedEntity.id),
                assemblies:(p.assemblies??[]).map(a=>({...a,entityIds:a.entityIds.filter(id=>
                  id!==selectedEntity.id)})).filter(a=>a.entityIds.length>=2),
              }));
                setSelectedEntityId("");}}>Remove selected</button>
              <button type="button" className={buttonClass} disabled={!canUndo}
                aria-label="Undo World Lab edit" onClick={()=>travelEdit("undo")}>Undo</button>
              <button type="button" className={buttonClass} disabled={!canRedo}
                aria-label="Redo World Lab edit" onClick={()=>travelEdit("redo")}>Redo</button>
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
                <div className="sm:col-span-2 rounded-lg border border-border p-2">
                  <p className="text-xs font-semibold">Position and measure</p>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="text-xs">Snap spacing (metres)
                      <select className={inputLabel} aria-label="Grid snap spacing"
                        value={gridStep} onChange={e=>setGridStep(Number(e.target.value))}>
                        <option value={0.1}>0.1 m</option><option value={0.5}>0.5 m</option>
                        <option value={1}>1 m</option><option value={5}>5 m</option>
                      </select>
                    </label>
                    <button type="button" className={buttonClass}
                      onClick={()=>editSelected(snapSolidPosition(selectedEntity,gridStep))}>
                      Snap selected to grid
                    </button>
                  </div>
                  <label className="mt-2 block text-xs">Measure to another solid
                    <select className={inputLabel} aria-label="Measure distance to solid"
                      value={measurementTarget?.id??""}
                      onChange={e=>setMeasureTargetId(e.target.value)}>
                      <option value="">Choose second solid</option>
                      {project?.entities.filter(e=>e.id!==selectedEntity.id).map(e=>
                        <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </label>
                  {measurement&&<div role="status" className="mt-2 text-xs"
                    aria-label="Measured geometric distance">
                    <p>Center-to-center: {measurement.centerDistanceMeters.toFixed(4)} m</p>
                    <p>Horizontal distance: {measurement.horizontalDistanceMeters.toFixed(4)} m</p>
                    <p>Offset X/Y/Z: {measurement.deltaMeters.map(v=>v.toFixed(3)).join(" / ")} m</p>
                    <p className="text-muted-foreground">Geometry only, not surface clearance or collision measurement.</p>
                  </div>}
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
                <div className="sm:col-span-2 rounded-xl border border-border p-3" aria-label="Fluid displacement and buoyancy experiment">
                  <h3 className="text-sm font-semibold">Try floating an invention</h3>
                  <p className="text-xs text-muted-foreground">
                    Calculate liquid displacement, upward force and possible floating depth from this solid's geometry.
                    An unknown invented density stays unknown.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-xs">Assumed liquid density (kg/m³)
                      <input type="number" className={inputLabel} aria-label="Liquid density"
                        min={0.01} max={25000} step={50} value={fluidDensity}
                        onChange={e=>{setFluidDensity(Number(e.target.value));setFluidRun(null);}} />
                    </label>
                    <label className="text-xs">Depth under liquid surface (m)
                      <input type="number" className={inputLabel} aria-label="Immersion depth"
                        min={0} max={selectedEntity.dimensionsMeters[1]} step={0.1}
                        value={fluidDepth} onChange={e=>{setFluidDepth(Number(e.target.value));setFluidRun(null);}} />
                    </label>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-xs">Level of liquid above ground (m)
                      <input className={inputLabel} type="number" min={0} max={20} step={0.1}
                        aria-label="Fluid surface height" value={fluidSurfaceHeight}
                        onChange={e=>{setFluidSurfaceHeight(Number(e.target.value));setFluidMotionPlaying(false);setFluidMotionRun(null);}}/>
                    </label>
                    <label className="text-xs">Assumed drag (N·s/m)
                      <input className={inputLabel} type="number" min={0} max={10000} step={10}
                        aria-label="Fluid linear drag" value={fluidDrag}
                        onChange={e=>{setFluidDrag(Number(e.target.value));setFluidMotionPlaying(false);setFluidMotionRun(null);}}/>
                    </label>
                  </div>
                  <button type="button" className={buttonClass+" mt-2"} onClick={simulateFluidMotion}>
                    Simulate floating or sinking over time
                  </button>
                  {selectedFluidMotion&&fluidMotionSample&&
                    <div className="mt-2 rounded-lg border border-border p-2 text-xs"
                      aria-label="Time-dependent fluid mechanics results">
                      <p>Simulated time: {fluidMotionSample.timeSeconds.toFixed(3)} seconds</p>
                      <p>Bottom height: {fluidMotionSample.bottomHeightM.toFixed(4)} m</p>
                      <p>Vertical velocity: {fluidMotionSample.velocityMps.toFixed(4)} m/s</p>
                      <p>Submerged depth: {fluidMotionSample.immersionDepthM.toFixed(4)} m</p>
                      <p>Calculated buoyancy: {fluidMotionSample.buoyancyForceN.toFixed(3)} N</p>
                      <p>Assumed viscous drag: {fluidMotionSample.dragForceN.toFixed(3)} N</p>
                      <p>Energy residual: {fluidMotionSample.energyResidualJ.toExponential(3)} J</p>
                      <label className="block">Explore fluid time
                        <input className="w-full" type="range" aria-label="Explore fluid motion time"
                          min={0} max={selectedFluidMotion.input.durationSeconds}
                          step={selectedFluidMotion.stepSeconds} value={fluidMotionTime}
                          onChange={e=>{setFluidMotionPlaying(false);setFluidMotionTime(Number(e.target.value));}}/>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={buttonClass}
                          onClick={()=>setFluidMotionPlaying(v=>!v)}>
                          {fluidMotionPlaying?"Pause fluid":"Play fluid"}
                        </button>
                        <button type="button" className={buttonClass}
                          onClick={()=>{setFluidMotionPlaying(false);setFluidMotionTime(0);}}>Reset fluid</button>
                        <button type="button" className={buttonClass}
                          onClick={()=>{setFluidMotionPlaying(false);setFluidMotionTime(t=>
                            Math.min(selectedFluidMotion.input.durationSeconds,
                              t+selectedFluidMotion.stepSeconds));}}>Step fluid</button>
                        <select className={inputLabel} aria-label="Fluid playback speed"
                          value={fluidMotionRate} onChange={e=>setFluidMotionRate(Number(e.target.value))}>
                          <option value={0.1}>0.1× slow</option>
                          <option value={1}>1× normal</option>
                          <option value={4}>4× fast</option>
                        </select>
                        <button type="button" className={buttonClass}
                          onClick={()=>downloadJson("world-lab-fluid-motion-evidence.json",selectedFluidMotion)}>
                          Export fluid trajectory evidence
                        </button>
                      </div>
                      <p className="mt-2 text-muted-foreground">{selectedFluidMotion.validity}</p>
                      <p className="text-muted-foreground">The blue 3D plane is an illustrative assumed fluid surface; vertical position follows the calculated trajectory.</p>
                    </div>}
                  <button type="button" className={buttonClass+" mt-2"} onClick={runFluidTest}>
                    Calculate buoyancy
                  </button>
                  {fluidRun && fluidRun.projectId===project?.id &&
                    fluidRun.projectRevision===project?.revision &&
                    fluidRun.entityId===selectedEntity.id && (
                    <div className="mt-2 space-y-1 text-xs" aria-label="Calculated buoyancy results">
                      <WorldLabFluidCutaway entity={selectedEntity} result={fluidRun}/>
                      <p>Displaced liquid: {fluidRun.immersedVolumeM3.toFixed(5)} m³</p>
                      <p>Upward buoyancy: {fluidRun.buoyancyForceN.toFixed(3)} N</p>
                      <p>Bottom gauge pressure: {fluidRun.bottomGaugePressurePa.toFixed(1)} Pa</p>
                      <p>Status: {fluidRun.floatingStatus.replaceAll("-"," ")}</p>
                      <p>Net upward force: {fluidRun.netUpwardForceN===null?"Unknown material mass":fluidRun.netUpwardForceN.toFixed(3)+" N"}</p>
                      <p>Equilibrium draft: {fluidRun.equilibriumDraftM===null?"Unknown":fluidRun.equilibriumDraftM.toFixed(4)+" m"}</p>
                      <button type="button" className={buttonClass} onClick={()=>
                        downloadJson("world-lab-buoyancy-evidence.json",fluidRun)}>Export fluid evidence</button>
                      <p className="text-muted-foreground">{fluidRun.validity}</p>
                    </div>
                  )}
                </div>
                <div className="sm:col-span-2 rounded-xl border border-border p-3" aria-label="Electrical and mechanical actuator experiment">
                  <h3 className="text-sm font-semibold">Power a lifting machine</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Design a simple electric actuator. Electricity builds coil current, creates lifting force,
                    moves your object and generates back-EMF and resistance heat. The same equations exchange
                    energy between the electrical and physical systems.
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input aria-label="Include coil heating feedback" type="checkbox"
                      checked={actuatorHeatEnabled} onChange={e=>{setActuatorHeatEnabled(e.target.checked);setActuatorRun(null);setActuatorPlaying(false);setActuatorAudit(null);}} />
                    Include calculated coil heating and resistance feedback
                  </label>
                  {actuatorHeatEnabled && <details className="mt-2">
                    <summary className="cursor-pointer text-xs">Adjust thermal assumptions</summary>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs">Coil heat capacity (J/K)
                        <input aria-label="Coil heat capacity" type="number" className={inputLabel}
                          min={1} max={1000000} value={coilHeatCapacity}
                          onChange={e=>{setCoilHeatCapacity(Number(e.target.value));setActuatorRun(null);setActuatorPlaying(false);}} />
                      </label>
                      <label className="text-xs">Cooling (W/K)
                        <input aria-label="Coil cooling conductance" type="number" className={inputLabel}
                          min={0} max={10000} step={0.1} value={coilCooling}
                          onChange={e=>{setCoilCooling(Number(e.target.value));setActuatorRun(null);setActuatorPlaying(false);}} />
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">These are hypothetical thermal properties, not measurements.</p>
                  </details>}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs">Adjust electrical power and force</summary>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="text-xs">Voltage (V)
                        <input aria-label="Actuator supply voltage" type="number" className={inputLabel}
                          min={0} max={1000} step={1} value={actuatorVoltage}
                          onChange={e=>{setActuatorPlaying(false);setActuatorRun(null);setActuatorVoltage(Number(e.target.value));}} />
                      </label>
                      <label className="text-xs">Actuator strength (N/A)
                        <input aria-label="Actuator force constant" type="number" className={inputLabel}
                          min={0} max={10000} step={0.5} value={actuatorConstant}
                          onChange={e=>{setActuatorPlaying(false);setActuatorRun(null);setActuatorConstant(Number(e.target.value));}} />
                      </label>
                    </div>
                  </details>
                  <button type="button" className={buttonClass+" mt-2"}
                    disabled={selectedQuantities.massKg===null} onClick={()=>startActuatorWithSelectedSolid(false)}>
                    Power this solid
                  </button>
                  {project?.networks?.[0] && <button type="button" className={buttonClass+" mt-2 ml-2"}
                    disabled={selectedQuantities.massKg===null}
                    onClick={()=>startActuatorWithSelectedSolid(true)}>
                    Wire motor to circuit
                  </button>}
                  {selectedActuator && actuatorSample && (
                    <div className="mt-3 space-y-2" aria-label="Coupled electromechanical results">
                      <p className="text-xs text-muted-foreground">
                        Computed hypothetical electromechanical system · not measured
                      </p>
                      <dl className="grid grid-cols-2 gap-2 text-xs">
                        <div><dt>Height above ground</dt><dd>{actuatorSample.heightM.toFixed(3)} m</dd></div>
                        <div><dt>Coil current</dt><dd>{actuatorSample.coilCurrentA.toFixed(3)} A</dd></div>
                        <div><dt>Upward force</dt><dd>{actuatorSample.motorForceN.toFixed(3)} N</dd></div>
                        <div><dt>Back-EMF</dt><dd>{actuatorSample.backEmfV.toFixed(3)} V</dd></div>
                        <div><dt>Coil heat</dt><dd>{actuatorSample.resistiveHeatW.toFixed(3)} W</dd></div>
                        {actuatorSample.coilTemperatureK !== undefined && actuatorSample.coilTemperatureK !== null && <>
                          <div><dt>Coil temperature</dt><dd>{actuatorSample.coilTemperatureK.toFixed(2)} K</dd></div>
                          <div><dt>Hot resistance</dt><dd>{actuatorSample.coilResistanceOhm?.toFixed(3)} Ω</dd></div>
                          <div><dt>Stored coil heat</dt><dd>{actuatorSample.thermalEnergyJ?.toFixed(3)} J</dd></div>
                          <div><dt>Cooling loss</dt><dd>{actuatorSample.coolingPowerW?.toFixed(3)} W</dd></div>
                        </>}
                        <div><dt>Energy balance difference</dt><dd>{actuatorSample.energyResidualJ.toFixed(4)} J</dd></div>
                      </dl>
                      {wiredMotorRun && wiredMotorRun.projectRevision===project?.revision &&
                        wiredMotorRun.entityId===selectedEntity?.id && (
                        <div className="text-xs" aria-label="Connected motor and source results">
                          <p>Connected source voltage: {wiredMotorRun.motor.input.supplyVoltageV.toFixed(3)} V</p>
                          <p>Total source current: {wiredMotorRun.samples[
                            Math.min(wiredMotorRun.samples.length-1,Math.round(actuatorTime/wiredMotorRun.motor.solverStepSeconds))
                          ].sourceBranchCurrentA.toFixed(4)} A (source convention)</p>
                          <p>Parallel resistor heating: {wiredMotorRun.dc.resistivePowerW.toFixed(3)} W</p>
                          <p>This motor is wired across an ideal voltage source; its dynamic current is counted alongside the passive loads.</p>
                          <button type="button" className={buttonClass} onClick={()=>
                            downloadJson("world-lab-wired-motor-evidence.json",wiredMotorRun)}>
                            Export connected evidence
                          </button>
                        </div>
                      )}
                      {actuatorAudit && (
                        <p className="text-xs text-muted-foreground" role={actuatorAudit.status === "outside-internal-tolerance" ? "alert" : undefined}>
                          Numerical self-check: {actuatorAudit.status === "within-internal-tolerance"
                            ? "within internal tolerance" : actuatorAudit.status === "unavailable"
                              ? "not available" : "outside internal tolerance"}.
                          {" "}{actuatorAudit.explanation}
                          {actuatorAudit.maximumRelativeStateDifference !== null && (
                            <> Step-refinement difference: {(100 * actuatorAudit.maximumRelativeStateDifference).toFixed(3)}%.
                            Energy residual fraction: {(100 * (actuatorAudit.maximumEnergyResidualFraction ?? 0)).toFixed(3)}%.</>
                          )}
                        </p>
                      )}
                      <label className="block text-xs">Explore motor time
                        <input aria-label="Explore motor time" type="range" min={0} className="w-full"
                          max={selectedActuator.input.durationSeconds} step={selectedActuator.solverStepSeconds}
                          value={actuatorTime}
                          onChange={e=>{setActuatorPlaying(false);setActuatorTime(Number(e.target.value));}} />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={buttonClass}
                          onClick={()=>setActuatorPlaying(v=>!v)}>
                          {actuatorPlaying?"Pause motor":"Play motor"}
                        </button>
                        <button type="button" className={buttonClass}
                          onClick={()=>{setActuatorPlaying(false);setActuatorTime(0);}}>Reset motor</button>
                        <select className={inputLabel} aria-label="Motor playback speed"
                          value={actuatorRate} onChange={e=>setActuatorRate(Number(e.target.value))}>
                          <option value={0.1}>0.1× slow</option>
                          <option value={1}>1× normal</option>
                          <option value={4}>4× fast</option>
                        </select>
                        <button type="button" className={buttonClass}
                          onClick={()=>downloadJson("world-lab-electric-actuator-evidence.json",selectedActuator)}>
                          Export motor evidence
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">{selectedActuator.validity}</p>
                    </div>
                  )}
                </div>
                <div className="sm:col-span-2 rounded-xl border border-border p-3" aria-label="Physical drop experiment">
                  <h3 className="text-sm font-semibold">Drop & bounce experiment</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Release this object, predict gravity and contact, and watch its modeled motion.
                    Density is your assumption; air drag and the ground are simplified.
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs">Change test conditions</summary>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="text-xs">Height (m)
                        <input className={inputLabel} aria-label="Drop release height in metres"
                          type="number" min="0" max="100" step="0.5"
                          value={dropHeight} onChange={e => {setDropPlaying(false);setDropRun(null);setDropHeight(Number(e.target.value));}} />
                      </label>
                      <label className="text-xs">Bounciness
                        <input className={inputLabel} aria-label="Drop restitution"
                          type="number" min="0" max="1" step="0.05"
                          value={dropBounce} onChange={e => {setDropPlaying(false);setDropRun(null);setDropBounce(Number(e.target.value));}} />
                      </label>
                    </div>
                  </details>
                  <button type="button" className={buttonClass + " mt-2"}
                    disabled={selectedQuantities.massKg === null} onClick={startDropWithSelectedSolid}>
                    Drop this solid
                  </button>
                  {selectedDrop && dropSample && (
                    <div className="mt-3 space-y-2" aria-label="Computed drop results">
                      <p className="text-xs">Model result · {selectedDrop.inputEvidence.replaceAll("-", " ")} · not measured</p>
                      <dl className="grid grid-cols-2 gap-2 text-xs">
                        <div><dt>Time</dt><dd>{dropSample.timeSeconds.toFixed(2)} s</dd></div>
                        <div><dt>Height above surface</dt><dd>{dropSample.heightAboveGroundM.toFixed(2)} m</dd></div>
                        <div><dt>Vertical speed</dt><dd>{dropSample.speedMps.toFixed(2)} m/s</dd></div>
                        <div><dt>Estimated impacts</dt><dd>{selectedDrop.impactCount}</dd></div>
                      </dl>
                      <label className="block text-xs">Explore drop time
                        <input type="range" aria-label="Explore drop time" className="w-full" min="0"
                          max={selectedDrop.input.durationSeconds} step={selectedDrop.stepSeconds}
                          value={dropTime} onChange={e=>{setDropPlaying(false);setDropTime(Number(e.target.value));}} />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={buttonClass}
                          onClick={()=>setDropPlaying(v=>!v)}>{dropPlaying ? "Pause drop" : "Play drop"}</button>
                        <button type="button" className={buttonClass}
                          onClick={()=>{setDropPlaying(false);setDropTime(0);}}>Reset drop</button>
                        <button type="button" className={buttonClass}
                          onClick={()=>downloadJson("the-world-lab-drop-evidence.json",selectedDrop)}>
                          Export drop evidence
                        </button>
                        <select className={inputLabel} aria-label="Drop playback speed" value={dropPlaybackRate}
                          onChange={e=>setDropPlaybackRate(Number(e.target.value))}>
                          <option value={0.1}>0.1× slow</option>
                          <option value={1}>1× normal</option>
                          <option value={4}>4× fast</option>
                        </select>
                      </div>
                      <p className="text-xs text-muted-foreground">{selectedDrop.validity}</p>
                    </div>
                  )}
                </div>
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
