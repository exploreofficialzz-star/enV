import { useEffect, useRef, useState } from "react";
import * as B from "babylonjs";
import { AlertTriangle, Play, RotateCcw } from "lucide-react";
import {
  frameTime,
  parseSceneJson,
  valueAtTime,
  type SceneDocument,
  type SceneObject,
} from "@/lib/scene-studio/scene";

const EXAMPLE = `{
  "version": "1.0",
  "settings": { "width": 1080, "height": 1920, "fps": 30, "duration": 8, "background": "#101826" },
  "objects": [
    { "id": "hero", "type": "sphere", "name": "Hero", "position": [0, 1, 0], "color": "#f4b942" }
  ],
  "animations": [
    { "target": "hero", "property": "position", "easing": "easeInOut", "keyframes": [
      { "time": 0, "value": [-2, 1, 0] },
      { "time": 4, "value": [2, 1, 0] }
    ] }
  ]
}`;

function makeMesh(object: SceneObject, scene: B.Scene): { mesh: B.Mesh; warning?: string } {
  let mesh: B.Mesh;
  let warning: string | undefined;
  switch (object.type.toLowerCase()) {
    case "box":
    case "cube":
      mesh = B.MeshBuilder.CreateBox(object.id, { size: 1 }, scene);
      break;
    case "sphere":
      mesh = B.MeshBuilder.CreateSphere(object.id, { diameter: 1, segments: 20 }, scene);
      break;
    case "cylinder":
      mesh = B.MeshBuilder.CreateCylinder(object.id, { diameter: 1, height: 1, tessellation: 24 }, scene);
      break;
    case "plane":
      mesh = B.MeshBuilder.CreateGround(object.id, { width: 1, height: 1 }, scene);
      break;
    case "text": {
      mesh = B.MeshBuilder.CreatePlane(object.id, { size: 1 }, scene);
      const texture = new B.DynamicTexture(`${object.id}-label`, { width: 1024, height: 256 }, scene, true);
      texture.hasAlpha = true;
      texture.drawText(object.text || object.name || "Text", null, 160, "bold 96px sans-serif", object.color, "transparent", true);
      const material = new B.StandardMaterial(`${object.id}-label-material`, scene);
      material.diffuseTexture = texture;
      material.emissiveColor = B.Color3.White();
      material.backFaceCulling = false;
      mesh.material = material;
      mesh.scaling.set(3, 0.75, 1);
      break;
    }
    default:
      mesh = B.MeshBuilder.CreateBox(object.id, { size: 1 }, scene);
      warning = `“${object.type}” is not in the first builder set yet; showing a simple placeholder.`;
  }
  mesh.position = B.Vector3.FromArray(object.position);
  mesh.rotation = B.Vector3.FromArray(object.rotation.map((degrees) => degrees * Math.PI / 180));
  if (object.type.toLowerCase() !== "text") mesh.scaling = B.Vector3.FromArray(object.scale);
  const material = new B.StandardMaterial(`${object.id}-material`, scene);
  material.diffuseColor = B.Color3.FromHexString(object.color);
  material.specularColor = new B.Color3(0.12, 0.12, 0.12);
  if (object.type.toLowerCase() !== "text") mesh.material = material;
  return { mesh, warning };
}

function setVector(target: B.Vector3, value: [number, number, number]) {
  target.set(value[0], value[1], value[2]);
}

export function SceneStudioEngine() {
  const [source, setSource] = useState(EXAMPLE);
  const [sceneDocument, setSceneDocument] = useState<SceneDocument | null>(null);
  const [frame, setFrame] = useState(0);
  const [error, setError] = useState<{ path: string; problem: string; fixHint: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [engineError, setEngineError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<B.Scene | null>(null);
  const objectMeshesRef = useRef(new Map<string, B.Mesh>());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sceneDocument) return;

    let engine: B.Engine | null = null;
    let scene: B.Scene | null = null;
    try {
      if (!B.Engine.isSupported()) throw new Error("This browser or device does not support 3D preview.");
      engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true });
      scene = new B.Scene(engine);
      scene.useRightHandedSystem = true;
      scene.clearColor = B.Color4.FromHexString(`${sceneDocument.settings.background}ff`);
      const camera = new B.ArcRotateCamera(
        "scene-studio-camera",
        -Math.PI / 2,
        Math.PI / 2.7,
        9,
        B.Vector3.FromArray(sceneDocument.camera.lookAt),
        scene,
      );
      camera.position = B.Vector3.FromArray(sceneDocument.camera.position);
      camera.fov = sceneDocument.camera.fieldOfView * Math.PI / 180;
      camera.attachControl(canvas, true);

      const lights = sceneDocument.lights.length ? sceneDocument.lights : [{ type: "hemispheric", intensity: 1, color: "#ffffff", position: [0, 5, 5] as [number, number, number] }];
      for (const [index, lightSpec] of lights.entries()) {
        const color = B.Color3.FromHexString(lightSpec.color);
        const light = lightSpec.type === "sun"
          ? new B.DirectionalLight(`scene-light-${index}`, new B.Vector3(-0.5, -1, -0.5), scene)
          : lightSpec.type === "point"
            ? new B.PointLight(`scene-light-${index}`, B.Vector3.FromArray(lightSpec.position), scene)
            : new B.HemisphericLight(`scene-light-${index}`, new B.Vector3(0, 1, 0), scene);
        light.intensity = lightSpec.intensity;
        light.diffuse = color;
      }

      const nextMeshes = new Map<string, B.Mesh>();
      const builderWarnings: string[] = [];
      for (const object of sceneDocument.objects) {
        const built = makeMesh(object, scene);
        nextMeshes.set(object.id, built.mesh);
        if (built.warning) builderWarnings.push(built.warning);
      }
      objectMeshesRef.current = nextMeshes;
      sceneRef.current = scene;
      setWarnings((current) => [...current, ...builderWarnings].slice(0, 30));
      engine.runRenderLoop(() => scene?.render());
      const resize = () => engine?.resize();
      window.addEventListener("resize", resize);
      setEngineError("");
      return () => {
        window.removeEventListener("resize", resize);
        sceneRef.current = null;
        objectMeshesRef.current.clear();
        scene?.dispose();
        engine?.dispose();
      };
    } catch (cause) {
      scene?.dispose();
      engine?.dispose();
      setEngineError(cause instanceof Error ? cause.message : "The 3D preview could not be opened.");
    }
  }, [sceneDocument]);

  useEffect(() => {
    if (!sceneDocument || !sceneRef.current) return;
    const time = frameTime(frame, sceneDocument.settings.fps);
    for (const object of sceneDocument.objects) {
      const mesh = objectMeshesRef.current.get(object.id);
      if (!mesh) continue;
      setVector(mesh.position, object.position);
      setVector(mesh.rotation, object.rotation.map((degrees) => degrees * Math.PI / 180) as [number, number, number]);
      if (object.type.toLowerCase() !== "text") setVector(mesh.scaling, object.scale);
    }
    for (const animation of sceneDocument.animations) {
      const mesh = objectMeshesRef.current.get(animation.target);
      if (!mesh) continue;
      const value = valueAtTime(animation, time);
      if (animation.property === "position") setVector(mesh.position, value);
      else if (animation.property === "rotation") setVector(mesh.rotation, value.map((degrees) => degrees * Math.PI / 180) as [number, number, number]);
      else setVector(mesh.scaling, value);
    }
  }, [frame, sceneDocument]);

  function preview() {
    const result = parseSceneJson(source);
    if (!result.ok) {
      setSceneDocument(null);
      setError(result.error);
      setWarnings([]);
      setEngineError("");
      return;
    }
    setError(null);
    setWarnings(result.warnings);
    setEngineError("");
    setSceneDocument(result.scene);
    setFrame(0);
  }

  const frameCount = sceneDocument ? Math.max(1, Math.ceil(sceneDocument.settings.duration * sceneDocument.settings.fps)) : 1;
  const currentTime = sceneDocument ? frameTime(frame, sceneDocument.settings.fps) : 0;

  return (
    <section className="space-y-4" aria-label="Scene Studio">
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Scene Studio · preview build</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">Paste declarative scene JSON. Scene Studio never runs code from the scene.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="min-h-10 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2" onClick={() => { setSource(EXAMPLE); setError(null); setSceneDocument(null); setWarnings([]); }}>
              <span className="inline-flex items-center gap-2"><RotateCcw size={15} aria-hidden="true" /> Load example</span>
            </button>
            <button type="button" className="min-h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:opacity-90" onClick={preview}>
              <span className="inline-flex items-center gap-2"><Play size={15} aria-hidden="true" /> Preview scene</span>
            </button>
          </div>
        </div>
        <label htmlFor="scene-studio-json" className="mb-2 block text-sm font-medium">Scene JSON</label>
        <textarea
          id="scene-studio-json"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="min-h-64 w-full rounded-xl border border-border bg-surface-2 p-3 font-mono text-xs leading-5 text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-describedby="scene-studio-json-help"
        />
        <p id="scene-studio-json-help" className="mt-2 text-xs text-muted">First preview supports boxes, spheres, cylinders, planes, and text. Unknown builder types appear as a simple placeholder.</p>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm">
          <div className="flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" /><div>
            <p className="font-semibold">We couldn’t preview this scene yet.</p>
            <p className="mt-1"><span className="font-mono">{error.path}</span>: {error.problem}</p>
            <p className="mt-2 text-muted">{error.fixHint}</p>
          </div></div>
        </div>
      ) : null}

      {warnings.length ? (
        <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p className="font-semibold">A few things were ignored or shown as placeholders.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
        </div>
      ) : null}

      {sceneDocument ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div><h3 className="font-semibold">Scene preview</h3><p className="text-xs text-muted">Frame {frame + 1} of {frameCount} · {currentTime.toFixed(2)} s · fixed {sceneDocument.settings.fps} fps</p></div>
            <label className="flex min-w-56 flex-1 items-center gap-3 sm:max-w-md">
              <span className="text-xs text-muted">Frame</span>
              <input aria-label="Scene frame" type="range" min={0} max={Math.max(0, frameCount - 1)} value={Math.min(frame, frameCount - 1)} onChange={(event) => setFrame(Number(event.target.value))} className="w-full accent-current" />
            </label>
          </div>
          {engineError ? <div role="alert" className="p-5 text-sm text-red-700">{engineError}</div> : <canvas ref={canvasRef} className="block h-[min(65vh,640px)] min-h-72 w-full touch-none bg-black" aria-label="Scene preview canvas" />}
        </div>
      ) : null}
    </section>
  );
}
