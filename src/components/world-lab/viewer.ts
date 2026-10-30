import * as B from "babylonjs";
import type { WorldLabProject, WorldLabObject } from "@/lib/world-lab/model";

type ViewerOptions = {
  select: (id: string) => void;
  error: (message: string) => void;
};

function geometryFor(item: WorldLabObject, scene: B.Scene): B.Mesh {
  if (item.kind === "sphere") return B.MeshBuilder.CreateSphere(item.id, { diameter: 1, segments: 24 }, scene);
  if (item.kind === "cylinder") return B.MeshBuilder.CreateCylinder(item.id, { height: 1, diameter: 1, tessellation: 28 }, scene);
  return B.MeshBuilder.CreateBox(item.id, { size: 1 }, scene);
}

export class WorldLabViewer {
  private engine: B.Engine;
  private scene: B.Scene;
  private camera: B.UniversalCamera;
  private meshes = new Map<string, B.Mesh>();
  private fieldLines: B.LinesMesh | null = null;
  private surface: B.StandardMaterial;
  private strata: B.StandardMaterial[] = [];
  private observer: ResizeObserver | null = null;
  private disposed = false;
  private touches = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;

  constructor(private canvas: HTMLCanvasElement, private callbacks: ViewerOptions) {
    if (!B.Engine.isSupported()) throw new Error("WebGL is unavailable. Try a current browser with graphics acceleration.");
    this.engine = new B.Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, true);
    this.scene = new B.Scene(this.engine);
    this.scene.clearColor = new B.Color4(0.66, 0.79, 0.87, 1);
    this.scene.fogMode = B.Scene.FOGMODE_LINEAR;
    this.scene.fogStart = 90;
    this.scene.fogEnd = 190;
    this.scene.fogColor = new B.Color3(0.66, 0.79, 0.87);
    this.camera = new B.UniversalCamera("observer-eye", new B.Vector3(0, 1.65, -9), this.scene);
    this.camera.setTarget(new B.Vector3(0, 1.2, 2));
    this.camera.speed = 0.28;
    this.camera.angularSensibility = 3400;
    this.camera.minZ = 0.015;
    this.camera.maxZ = 1000;
    this.camera.keysUp = [87, 38];
    this.camera.keysDown = [83, 40];
    this.camera.keysLeft = [65, 37];
    this.camera.keysRight = [68, 39];
    this.camera.attachControl(canvas, true);
    this.scene.activeCamera = this.camera;
    new B.HemisphericLight("ambient", new B.Vector3(0, 1, 0), this.scene).intensity = 0.85;
    const sun = new B.DirectionalLight("sample-sun", new B.Vector3(-0.6, -1, -0.4), this.scene);
    sun.intensity = 0.65;

    const ground = B.MeshBuilder.CreateGround("representative-surface", { width: 200, height: 200 }, this.scene);
    this.surface = new B.StandardMaterial("surface-green", this.scene);
    this.surface.diffuseColor = B.Color3.FromHexString("#668b6b");
    this.surface.specularColor = B.Color3.Black();
    ground.material = this.surface;
    ground.isPickable = false;
    for (const [y, thickness, color] of [
      [-0.45, 0.9, "#795c3e"], [-1.75, 1.7, "#a17e54"], [-4.3, 3.4, "#717f86"], [-8.9, 5.8, "#5d666f"],
    ] as const) {
      const stratum = B.MeshBuilder.CreateBox("representative-stratum", { width: 200, height: thickness, depth: 200 }, this.scene);
      stratum.position.y = y;
      const material = new B.StandardMaterial("stratum", this.scene);
      material.diffuseColor = B.Color3.FromHexString(color);
      material.specularColor = B.Color3.Black();
      stratum.material = material;
      stratum.isPickable = false;
      this.strata.push(material);
    }
    this.scene.onPointerObservable.add((info) => {
      if (info.type !== B.PointerEventTypes.POINTERDOWN) return;
      const id = info.pickInfo?.pickedMesh?.metadata?.labObjectId as string | undefined;
      if (id) this.callbacks.select(id);
    });
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.engine.resize());
      this.observer.observe(canvas);
    }
    this.engine.runRenderLoop(() => { if (!this.disposed) this.scene.render(); });
  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.callbacks.error("The 3D graphics context was lost. Restore the page to continue; save a backup regularly.");
  };

  /** Wheel/pinch navigation changes the observer's position continuously, even through layers. */
  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch") this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || !this.touches.has(event.pointerId)) return;
    this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.touches.size !== 2) { this.pinchDistance = 0; return; }
    const [a, b] = [...this.touches.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (this.pinchDistance > 0) {
      const forward = this.camera.getForwardRay().direction;
      this.camera.position.addInPlace(forward.scale(Math.max(-2, Math.min(2, (distance - this.pinchDistance) * 0.018))));
    }
    this.pinchDistance = distance;
  };
  private onPointerUp = (event: PointerEvent) => {
    this.touches.delete(event.pointerId);
    this.pinchDistance = 0;
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const direction = this.camera.getForwardRay().direction;
    const metres = Math.sign(event.deltaY) * Math.min(8, Math.max(0.1, Math.abs(event.deltaY) * 0.012));
    this.camera.position.addInPlace(direction.scale(metres));
  };

  move(direction: "forward" | "back" | "up" | "down") {
    const forward = this.camera.getForwardRay().direction;
    const offset = direction === "up" ? new B.Vector3(0, 0.8, 0)
      : direction === "down" ? new B.Vector3(0, -0.8, 0)
      : forward.scale(direction === "forward" ? 0.8 : -0.8);
    this.camera.position.addInPlace(offset);
  }

  resetCamera() {
    this.camera.position.set(0, 1.65, -9);
    this.camera.setTarget(new B.Vector3(0, 1.2, 2));
  }

  sync(project: WorldLabProject, selected: string, seeInside: number, showVectors: boolean) {
    if (this.disposed) return;
    this.surface.alpha = Math.max(0.05, 1 - seeInside / 100);
    this.strata.forEach((material, index) => { material.alpha = Math.max(0.08, 0.88 - seeInside / 105 + index * 0.07); });
    const seen = new Set<string>();
    for (const item of project.objects) {
      seen.add(item.id);
      let mesh = this.meshes.get(item.id);
      if (!mesh) {
        mesh = geometryFor(item, this.scene);
        mesh.metadata = { labObjectId: item.id };
        const material = new B.StandardMaterial("material-" + item.id, this.scene);
        material.specularColor = new B.Color3(0.2, 0.2, 0.2);
        mesh.material = material;
        this.meshes.set(item.id, mesh);
      }
      mesh.position.set(item.positionM.x, item.positionM.y, item.positionM.z);
      mesh.scaling.set(item.dimensionsM.x, item.dimensionsM.y, item.dimensionsM.z);
      const material = mesh.material as B.StandardMaterial;
      material.diffuseColor = B.Color3.FromHexString(item.color);
      material.alpha = Math.max(0.05, item.opacity * (1 - seeInside * 0.007));
      mesh.renderOutline = selected === item.id;
      mesh.outlineColor = new B.Color3(0.98, 0.82, 0.42);
      mesh.outlineWidth = 0.045;
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      mesh.material?.dispose();
      mesh.dispose();
      this.meshes.delete(id);
    }
    this.fieldLines?.dispose();
    this.fieldLines = null;
    const item = project.objects.find(o => o.id === selected);
    if (item && showVectors) {
      const f = item.forceN;
      const length = Math.hypot(f.x, f.y, f.z);
      if (length > 0) {
        const start = new B.Vector3(item.positionM.x, item.positionM.y, item.positionM.z);
        const scale = Math.min(3, length / Math.max(1, item.material.densityKgM3));
        const end = start.add(new B.Vector3(f.x, f.y, f.z).normalize().scale(scale));
        this.fieldLines = B.MeshBuilder.CreateLines("applied-force-vector", { points: [start, end] }, this.scene);
        this.fieldLines.color = new B.Color3(0.99, 0.7, 0.22);
        this.fieldLines.isPickable = false;
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.touches.clear();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.camera.detachControl();
    this.scene.dispose();
    this.engine.dispose();
  }
}
