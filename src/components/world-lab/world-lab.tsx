import { useEffect, useMemo, useRef, useState } from "react";
import * as B from "babylonjs";
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
  addedShapes: B.Mesh[];
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
  const [shapeCount, setShapeCount] = useState(0);
  const [materialName, setMaterialName] = useState("");
  const [density, setDensity] = useState("");
  const [materials, setMaterials] = useState<NovelMaterial[]>([]);
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
      if (typeof record.shapeCount === "number" && Number.isInteger(record.shapeCount) && record.shapeCount >= 0 && Number(record.shapeCount) <= 20) {
        setShapeCount(Number(record.shapeCount));
      }
    } catch {
      setMessage("The old local workspace was unreadable; a fresh workspace opened without overwriting it.");
    }
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
      sceneRef.current = { engine, scene, device, circuit, deviceMaterial, circuitMaterial, addedShapes: [] };
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
    while (scene.addedShapes.length < shapeCount) {
      const index = scene.addedShapes.length;
      const block = B.MeshBuilder.CreateBox("visual-shape-" + index, { size: 0.65 }, scene.scene);
      block.position = new B.Vector3(-2.5 + (index % 5) * 0.85, 0.5, 1.8 + Math.floor(index / 5) * 0.85);
      const material = new B.StandardMaterial("visual-material-" + index, scene.scene);
      material.diffuseColor = B.Color3.FromHexString("#CFD7D6");
      block.material = material;
      scene.addedShapes.push(block);
    }
    while (scene.addedShapes.length > shapeCount) {
      const block = scene.addedShapes.pop();
      block?.material?.dispose();
      block?.dispose();
    }
  }, [modelKind, mechanical.initialDisplacementM, sample, seeInside, opacity, shapeCount]);

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
  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        format: "env-world-lab-local", version: 1, modelKind, mechanical, circuit, shapeCount,
      }));
      setMessage("Workspace saved on this device only. Cloud synchronization is not available.");
    } catch {
      setError("Unable to save on this device. Export the run JSON instead.");
    }
  }
  function addMaterial() {
    try {
      const proposed = validateNovelMaterial({
        name: materialName.trim(), densityKgM3: density.trim() === "" ? null : Number(density),
        youngModulusPa: null, provenance: "hypothetical-user-assumed",
      });
      setMaterials((existing) => [...existing.slice(-9), proposed]);
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
        <button type="button" className={buttonClass} onClick={save}>Save on this device</button>
      </header>
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
            <button type="button" className={buttonClass} disabled={shapeCount >= 20}
              onClick={() => setShapeCount((value) => Math.min(20, value + 1))}>Add visual shape</button>
            <button type="button" className={buttonClass} disabled={shapeCount === 0}
              onClick={() => setShapeCount((value) => Math.max(0, value - 1))}>Undo visual shape</button>
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
            Drag to look around; keyboard W/A/S/D or arrows to move. The scene is illustrative.
            Added shapes have no physical components and do not change solver results.
          </p>
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
              {materials.map((material, index) => <li key={index}>{material.name}: density {material.densityKgM3 === null ? "Unknown" : metric(material.densityKgM3, "kg/m³")};
                elasticity unknown · Hypothetical / User-assumed</li>)}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
