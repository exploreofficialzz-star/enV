import * as B from "babylonjs";
import "babylonjs-loaders";
import { MAX_ASSET_BYTES, validateGlb, type GameAsset, type GameObject, type GameProject } from "@/lib/game-studio/project";
import { assertGameEntriesReady, visibleExportEntries } from "@/lib/game-studio/export-readiness";

type Mode = "select" | "move" | "rotate" | "scale";
type Callbacks = {
  select: (id: string) => void;
  transform: (id: string, patch: Pick<GameObject, "position" | "rotation" | "scale">) => void;
  error: (message: string) => void;
};
type Entry = {
  root: B.TransformNode;
  object: GameObject;
  assetId?: string;
  assetData?: string;
  material?: B.StandardMaterial;
  signature: string;
};
function urlFor(dataUrl: string) {
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }));
}
export class StudioScene {
  private engine: B.Engine;
  private scene: B.Scene;
  private camera: B.ArcRotateCamera;
  private gizmos: B.GizmoManager;
  private entries = new Map<string, Entry>();
  private pending = new Set<string>();
  private observedGizmos = new WeakSet<object>();
  private current: GameProject | null = null;
  private selected = "";
  private mode: Mode = "select";
  private disposed = false;
  private resize: ResizeObserver;
  private callbacks: Callbacks;
  private render = () => this.scene.render();
  constructor(canvas: HTMLCanvasElement, callbacks: Callbacks) {
    this.callbacks = callbacks;
    if (!B.Engine.isSupported())
      throw new Error(
        "This browser does not support WebGL. Try a current browser with hardware acceleration enabled.",
      );
    this.engine = new B.Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, true);
    this.scene = new B.Scene(this.engine);
    this.scene.clearColor = new B.Color4(0.83, 0.88, 0.92, 1);
    this.camera = new B.ArcRotateCamera(
      "editor camera",
      -Math.PI / 3,
      1.12,
      14,
      new B.Vector3(0, 0, 0),
      this.scene,
    );
    this.camera.lowerRadiusLimit = 2;
    this.camera.upperRadiusLimit = 80;
    this.camera.wheelPrecision = 35;
    this.camera.attachControl(canvas, true);
    new B.HemisphericLight("sky", new B.Vector3(0, 1, 0), this.scene).intensity = 0.85;
    const sun = new B.DirectionalLight("sun", new B.Vector3(-1, -2, -1), this.scene);
    sun.intensity = 0.7;
    const lines: B.Vector3[][] = [];
    for (let n = -20; n <= 20; n++) {
      lines.push([new B.Vector3(n, -0.005, -20), new B.Vector3(n, -0.005, 20)]);
      lines.push([new B.Vector3(-20, -0.005, n), new B.Vector3(20, -0.005, n)]);
    }
    const grid = B.MeshBuilder.CreateLineSystem("editor grid", { lines }, this.scene);
    grid.color = new B.Color3(0.67, 0.73, 0.78);
    grid.alpha = 0.55;
    grid.isPickable = false;
    this.gizmos = new B.GizmoManager(this.scene);
    this.gizmos.usePointerToAttachGizmos = false;
    this.gizmos.positionGizmoEnabled = true;
    this.gizmos.rotationGizmoEnabled = true;
    this.gizmos.scaleGizmoEnabled = true;
    this.setMode("select");
    this.scene.onPointerObservable.add((info) => {
      if (info.type !== B.PointerEventTypes.POINTERDOWN || info.event.button !== 0) return;
      const picked = info.pickInfo?.pickedMesh;
      const id = picked?.metadata?.envObjectId as string | undefined;
      if (id) this.callbacks.select(id);
    });
    this.engine.runRenderLoop(this.render);
    this.resize = new ResizeObserver(() => this.engine.resize());
    this.resize.observe(canvas);
    canvas.addEventListener("webglcontextlost", this.onContextLost);
  }
  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.callbacks.error("The 3D graphics context was lost. Reload the Studio to restore it.");
  };
  async preflight(asset: GameAsset) {
    const scene = new B.Scene(this.engine);
    const url = urlFor(asset.dataUrl);
    try {
      const loaded = await B.SceneLoader.ImportMeshAsync("", "", url, scene, undefined, ".glb");
      if (!loaded.meshes.some((mesh) => mesh.getTotalVertices() > 0))
        throw new Error("The model does not contain any mesh geometry.");
    } catch (error) {
      throw new Error(
        `The GLB could not be loaded: ${error instanceof Error ? error.message : "invalid model data"}`,
      );
    } finally {
      URL.revokeObjectURL(url);
      scene.dispose();
    }
  }
  setMode(mode: Mode) {
    this.mode = mode;
    this.gizmos.positionGizmoEnabled = mode === "move";
    this.gizmos.rotationGizmoEnabled = mode === "rotate";
    this.gizmos.scaleGizmoEnabled = mode === "scale";
    for (const gizmo of [
      this.gizmos.gizmos.positionGizmo,
      this.gizmos.gizmos.rotationGizmo,
      this.gizmos.gizmos.scaleGizmo,
    ]) {
      if (gizmo && !this.observedGizmos.has(gizmo)) {
        this.observedGizmos.add(gizmo);
        gizmo.onDragEndObservable.add(() => this.commitTransform());
      }
    }
    this.attach();
  }
  setActive(active: boolean) {
    if (active) this.engine.runRenderLoop(this.render);
    else this.engine.stopRenderLoop(this.render);
  }
  private attach() {
    const entry = this.entries.get(this.selected);
    this.gizmos.attachToNode(
      entry && !entry.object.locked && this.mode !== "select" ? entry.root : null,
    );
  }
  select(id: string) {
    this.selected = id;
    this.attach();
  }
  focus() {
    const root = this.entries.get(this.selected)?.root;
    if (root) {
      const bounds = root.getHierarchyBoundingVectors(true);
      const center = bounds.min.add(bounds.max).scale(0.5);
      this.camera.setTarget(center);
      this.camera.radius = Math.max(3, B.Vector3.Distance(bounds.min, bounds.max) * 2);
    }
  }
  private commitTransform() {
    const entry = this.entries.get(this.selected);
    if (!entry) return;
    const root = entry.root;
    const rot = root.rotationQuaternion ? root.rotationQuaternion.toEulerAngles() : root.rotation;
    const degrees = (x: number) => Math.round(B.Tools.ToDegrees(x) * 100) / 100;
    const round = (x: number) => Math.round(x * 1000) / 1000;
    this.callbacks.transform(entry.object.id, {
      position: { x: round(root.position.x), y: round(root.position.y), z: round(root.position.z) },
      rotation: { x: degrees(rot.x), y: degrees(rot.y), z: degrees(rot.z) },
      scale: {
        x: Math.max(0.01, round(root.scaling.x)),
        y: Math.max(0.01, round(root.scaling.y)),
        z: Math.max(0.01, round(root.scaling.z)),
      },
    });
  }
  sync(project: GameProject, selected: string) {
    this.current = project;
    this.selected = selected;
    for (const [id, entry] of this.entries) {
      const object = project.objects.find((item) => item.id === id);
      const asset = project.assets.find((item) => item.id === object?.assetId);
      const signature = `${object?.kind}:${object?.assetId || ""}`;
      if (!object || entry.signature !== signature || entry.assetData !== asset?.dataUrl) {
        entry.root.dispose(false, true);
        this.entries.delete(id);
      }
    }
    for (const object of project.objects) {
      const entry = this.entries.get(object.id);
      if (entry) this.update(entry, object);
      else if (!this.pending.has(object.id))
        void this.create(
          object,
          project.assets.find((asset) => asset.id === object.assetId),
        );
    }
    this.attach();
  }
  private update(entry: Entry, object: GameObject) {
    entry.object = object;
    const root = entry.root;
    root.position.set(object.position.x, object.position.y, object.position.z);
    root.rotationQuaternion = null;
    root.rotation.set(
      B.Tools.ToRadians(object.rotation.x),
      B.Tools.ToRadians(object.rotation.y),
      B.Tools.ToRadians(object.rotation.z),
    );
    root.scaling.set(object.scale.x, object.scale.y, object.scale.z);
    root.setEnabled(object.visible);
    if (entry.material && object.kind !== "artboard")
      entry.material.diffuseColor = B.Color3.FromHexString(object.color);
  }
  private async create(object: GameObject, asset?: GameAsset) {
    this.pending.add(object.id);
    const root = new B.TransformNode(object.name, this.scene);
    let material: B.StandardMaterial | undefined;
    let retry = false;
    try {
      if (object.kind === "model") {
        if (!asset) throw new Error(`Missing model for ${object.name}.`);
        const url = urlFor(asset.dataUrl);
        try {
          const loaded = await B.SceneLoader.ImportMeshAsync(
            "",
            "",
            url,
            this.scene,
            undefined,
            ".glb",
          );
          loaded.meshes
            .filter((mesh) => !mesh.parent)
            .forEach((mesh) => {
              mesh.parent = root;
            });
          loaded.transformNodes
            .filter((node) => !node.parent)
            .forEach((node) => {
              node.parent = root;
            });
          root.onDisposeObservable.add(() => {
            loaded.animationGroups.forEach((group) => group.dispose());
            loaded.skeletons.forEach((skeleton) => skeleton.dispose());
          });
        } finally {
          URL.revokeObjectURL(url);
        }
      } else {
        let mesh: B.Mesh;
        if (object.kind === "box")
          mesh = B.MeshBuilder.CreateBox(object.name, { size: 1 }, this.scene);
        else if (object.kind === "sphere")
          mesh = B.MeshBuilder.CreateSphere(object.name, { diameter: 1, segments: 24 }, this.scene);
        else if (object.kind === "cylinder")
          mesh = B.MeshBuilder.CreateCylinder(object.name, { height: 1, diameter: 1 }, this.scene);
        else if (object.kind === "ground")
          mesh = B.MeshBuilder.CreateGround(object.name, { width: 1, height: 1 }, this.scene);
        else {
          if (!asset) throw new Error(`Missing Artboard image for ${object.name}.`);
          mesh = B.MeshBuilder.CreatePlane(
            object.name,
            {
              width: (asset.width || 1) / (asset.height || 1),
              height: 1,
              sideOrientation: B.Mesh.DOUBLESIDE,
            },
            this.scene,
          );
        }
        mesh.parent = root;
        material = new B.StandardMaterial(object.name + " material", this.scene);
        material.specularColor = new B.Color3(0.12, 0.12, 0.12);
        if (object.kind === "artboard" && asset) {
          material.diffuseTexture = new B.Texture(asset.dataUrl, this.scene);
          material.diffuseTexture.hasAlpha = true;
          material.useAlphaFromDiffuseTexture = true;
          material.emissiveColor = B.Color3.White();
        }
        mesh.material = material;
      }
      const latest = this.current?.objects.find((item) => item.id === object.id);
      const latestAsset = this.current?.assets.find((item) => item.id === latest?.assetId);
      if (
        this.disposed ||
        !latest ||
        latest.kind !== object.kind ||
        latest.assetId !== object.assetId ||
        latestAsset?.dataUrl !== asset?.dataUrl
      ) {
        retry = Boolean(latest && !this.disposed);
        root.dispose(false, true);
        return;
      }
      root.getChildMeshes().forEach((mesh) => {
        mesh.metadata = { ...(mesh.metadata || {}), envObjectId: object.id };
      });
      const signature = `${object.kind}:${object.assetId || ""}`;
      const entry: Entry = { root, object, assetId: asset?.id, assetData: asset?.dataUrl, material, signature };
      this.entries.set(object.id, entry);
      this.update(entry, latest);
      this.attach();
    } catch (error) {
      root.dispose(false, true);
      this.callbacks.error(
        error instanceof Error ? error.message : "An object could not be loaded.",
      );
    } finally {
      this.pending.delete(object.id);
      if (retry && this.current) this.sync(this.current, this.selected);
    }
  }
  assertReadyForGame(project: GameProject): void {
    if (this.disposed || this.current !== project)
      throw new Error("The scene is still updating. Try again in a moment.");
    if (this.pending.size) throw new Error("Objects are still loading. Try again in a moment.");
    assertGameEntriesReady(project.objects, this.entries);
  }
  async exportSceneGlb(expectedProject: GameProject): Promise<Blob> {
    if (this.pending.size) throw new Error("Models are still loading. Try exporting again in a moment.");
    const project = this.current;
    if (!project || this.disposed || project !== expectedProject)
      throw new Error("The scene is still updating. Try exporting again in a moment.");
    const roots = visibleExportEntries(project.objects, this.entries).map((entry) => entry.root);

    // Exclude editor helpers, camera and lights. Only scene-object descendants are assets.
    const { GLTF2Export } = await import("babylonjs-serializers");
    const output = await GLTF2Export.GLBAsync(this.scene, "env-scene", {
      shouldExportNode: (node) => roots.some((root) => node === root || node.isDescendantOf(root)),
    });
    if (this.disposed || this.current !== project)
      throw new Error("The scene changed during export. Please try again.");
    const blob = output.files["env-scene.glb"];
    if (!(blob instanceof Blob)) throw new Error("The 3D model could not be generated.");
    if (blob.size > MAX_ASSET_BYTES) throw new Error("Exported models must be 15 MB or smaller.");
    validateGlb(new Uint8Array(await blob.arrayBuffer()));
    return blob;
  }
  dispose(canvas: HTMLCanvasElement) {
    this.disposed = true;
    canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.resize.disconnect();
    this.gizmos.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
