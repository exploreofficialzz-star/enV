/**
 * Draws a Scene Studio scene's 3D picture with Babylon.js: camera, lights, shadows, sky, fog, post effects and
 * every object. It only APPLIES values computed elsewhere (frame-state.ts, render-look.ts, camera-math.ts), so what
 * can be tested without a browser is tested there; this file needs WebGL and is not run by the Node tests.
 *
 * Every frame is drawn on its own from a FrameState (no stepping, no clock), so the preview, scrubbing and the video
 * export draw the same picture for the same frame.
 */
import * as B from "babylonjs";
import "babylonjs-loaders";
import { applyCommon, buildObject, makeSoftSprite } from "./babylon-builders.ts";
import type { AssetBytes, BuildContext, BuiltObject, UpdateContext } from "./babylon-builders.ts";
import { cameraBasis, speakerAnchors } from "./camera-math.ts";
import type { FrameState } from "./frame-state.ts";
import type { ObjectPlan } from "./object-plan.ts";
import { ambientFill, planLights, planPost, QUALITY_PLANS, SKY_PRESETS, skyColorAt } from "./render-look.ts";
import type { PostPlan } from "./render-look.ts";
import type { Quality, Scene, Vec3 } from "./types.ts";

const DEG = Math.PI / 180;
const color3 = (hex: string): B.Color3 => B.Color3.FromHexString(/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#808080");
const vec = (v: readonly number[]): B.Vector3 => new B.Vector3(v[0], v[1], v[2]);

export interface RendererOptions {
  scene: Scene;
  /** One plan per object, in scene order (see planObjects). */
  plans: readonly ObjectPlan[];
  assets: AssetBytes;
  /** Pixel size of the 3D picture. Keep the scene's aspect ratio; a smaller size makes a quicker preview. */
  width: number;
  height: number;
  quality: Quality;
  /** The picture must be see-through because something is drawn behind it (the scene has back layers). */
  transparent: boolean;
}

/** True when this browser can make a WebGL picture at all. */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export class SceneRenderer {
  /** The finished 3D picture. Draw it into a 2D canvas right after `renderFrame` returns. */
  readonly canvas: HTMLCanvasElement;
  /** Plain-words things the person should know ("the sky is hidden because...", "the HDRI could not be read"). */
  readonly notes: string[] = [];

  private readonly options: RendererOptions;
  private readonly engine: B.Engine;
  private readonly scene: B.Scene;
  private readonly camera: B.FreeCamera;
  private readonly built = new Map<string, BuiltObject>();
  /** Parents before children, for computing world positions. */
  private order: BuiltObject[] = [];
  private shadows: B.ShadowGenerator | null = null;
  private disposed = false;

  private constructor(options: RendererOptions) {
    this.options = options;
    this.canvas = document.createElement("canvas");
    this.canvas.width = options.width;
    this.canvas.height = options.height;
    this.engine = new B.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true, alpha: options.transparent, premultipliedAlpha: true }, false);
    // compile shaders at once, so the first frame that uses a material is never drawn without it
    this.engine.disableParallelShaderCompile = true;
    this.engine.setSize(options.width, options.height);
    this.scene = new B.Scene(this.engine);
    this.scene.useRightHandedSystem = true;
    this.scene.detachControl();
    const bg = color3(options.scene.settings.background);
    this.scene.clearColor = new B.Color4(bg.r, bg.g, bg.b, options.transparent ? 0 : 1);
    this.camera = new B.FreeCamera("camera", new B.Vector3(0, 1, 5), this.scene);
    this.camera.minZ = 0.05;
    this.camera.maxZ = 4000;
    this.camera.fovMode = B.Camera.FOVMODE_VERTICAL_FIXED;
    this.scene.activeCamera = this.camera;
  }

  /** Builds the whole scene. Missing models, unreadable pictures and the like become notes, not failures. */
  static async create(options: RendererOptions): Promise<SceneRenderer> {
    const renderer = new SceneRenderer(options);
    try {
      await renderer.setup();
    } catch (error) {
      renderer.dispose();
      throw error;
    }
    return renderer;
  }

  private async setup(): Promise<void> {
    const { scene: def, quality } = this.options;
    const qualityPlan = QUALITY_PLANS[quality];
    this.addLights(def, qualityPlan.shadowMapSize);
    await this.addEnvironment(def);
    this.addFog(def);

    const softSprite = makeSoftSprite(this.scene);
    const ctx: BuildContext = { scene: this.scene, quality: qualityPlan, qualityName: quality, seed: def.settings.seed, shadows: this.shadows, assets: this.options.assets, softSprite };
    for (let i = 0; i < def.objects.length; i++) {
      const o = def.objects[i];
      const plan = this.options.plans[i];
      if (!plan) continue;
      try {
        this.built.set(o.id, await buildObject(ctx, o, plan));
      } catch (error) {
        this.notes.push(`"${o.id}" could not be drawn (${error instanceof Error ? error.message : String(error)}), so a stand-in box is shown.`);
        try {
          this.built.set(o.id, await buildObject(ctx, o, { ...plan, type: "box", standIn: true, asset: { kind: "none" } }));
        } catch {
          // nothing more can be done for this object; the rest of the scene still draws
        }
      }
    }
    this.linkParents();
    this.addPostEffects(planPost(def.post));
  }

  // ---- lights, sky, fog ----------------------------------------------------------------------

  private addLights(def: Scene, shadowMapSize: number): void {
    const fill = ambientFill(def);
    const ambient = new B.HemisphericLight("ambient", new B.Vector3(0, 1, 0), this.scene);
    ambient.diffuse = color3(fill.skyColor);
    ambient.groundColor = color3(fill.groundColor);
    ambient.specular = B.Color3.Black();
    ambient.intensity = fill.intensity;

    for (const plan of planLights(def)) {
      if (plan.kind === "ambient") continue; // already part of the ambient fill above
      if (plan.kind === "sun") {
        const sun = new B.DirectionalLight("sun", vec(plan.direction ?? [0, -1, 0]).normalize(), this.scene);
        sun.diffuse = color3(plan.color);
        sun.specular = color3(plan.color);
        sun.intensity = plan.intensity;
        if (plan.castsShadow) {
          const generator = new B.ShadowGenerator(shadowMapSize, sun);
          generator.usePercentageCloserFiltering = true;
          generator.bias = 0.0005;
          generator.normalBias = 0.02;
          this.shadows = generator;
        }
      } else {
        const point = new B.PointLight("point", vec(plan.position ?? [0, 5, 0]), this.scene);
        point.diffuse = color3(plan.color);
        point.specular = color3(plan.color);
        point.intensity = plan.intensity;
        point.range = plan.range ?? 20;
      }
    }
  }

  private async addEnvironment(def: Scene): Promise<void> {
    const env = def.environment;
    const hdriBytes = env.hdri ? await this.options.assets.get(env.hdri) : null;
    if (env.hdri && !hdriBytes) this.notes.push(`The lighting image "${env.hdri}" is not available, so the ${env.preset} sky colours are used instead.`);
    if (hdriBytes) {
      const texture = await this.loadHdri(hdriBytes);
      if (texture) {
        if (env.skybox && !this.options.transparent) {
          const sky = this.scene.createDefaultSkybox(texture, true, 1000, 0, true);
          if (sky?.material) sky.material.fogEnabled = false;
        } else {
          this.scene.environmentTexture = texture;
        }
        this.scene.environmentIntensity = env.intensity;
        return;
      }
      this.notes.push(`The lighting image "${env.hdri}" could not be read (use a .hdr file), so the ${env.preset} sky colours are used instead.`);
    }
    if (env.skybox) {
      if (this.options.transparent) this.notes.push("The scene has layers behind the 3D picture, so the sky is not drawn (it would cover them).");
      else this.addSkyDome(def);
    }
  }

  private loadHdri(bytes: Uint8Array): Promise<B.HDRCubeTexture | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
      let done = false;
      const finish = (texture: B.HDRCubeTexture | null) => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        resolve(texture);
      };
      const holder: { texture: B.HDRCubeTexture | null } = { texture: null };
      try {
        // (the callbacks wait one tick so a picture that is ready at once still has its texture set)
        holder.texture = new B.HDRCubeTexture(url, this.scene, 256, false, true, false, true, () => queueMicrotask(() => finish(holder.texture)), () => queueMicrotask(() => finish(null)));
        setTimeout(() => finish(null), 20000);
      } catch {
        finish(null);
      }
    });
  }

  /** A sky made of colours (no picture file): the preset's horizon, top and ground blended by direction. */
  private addSkyDome(def: Scene): void {
    const preset = SKY_PRESETS[def.environment.preset];
    const radius = 1000;
    const dome = B.MeshBuilder.CreateSphere("sky", { diameter: radius * 2, segments: 24, sideOrientation: B.Mesh.BACKSIDE }, this.scene);
    const positions = dome.getVerticesData(B.VertexBuffer.PositionKind);
    if (!positions) return;
    const colors: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      const [r, g, b] = skyColorAt(preset, positions[i + 1] / radius);
      colors.push(r, g, b, 1);
    }
    dome.setVerticesData(B.VertexBuffer.ColorKind, colors);
    const material = new B.StandardMaterial("sky-material", this.scene);
    material.disableLighting = true;
    material.emissiveColor = B.Color3.White();
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.fogEnabled = false;
    dome.material = material;
    dome.infiniteDistance = true;
    dome.isPickable = false;
    dome.applyFog = false;
  }

  private addFog(def: Scene): void {
    const fog = def.environment.fog;
    if (!(fog.density > 0)) return;
    this.scene.fogMode = B.Scene.FOGMODE_EXP2;
    this.scene.fogColor = color3(fog.color);
    this.scene.fogDensity = fog.density;
  }

  // ---- post effects --------------------------------------------------------------------------

  private addPostEffects(plan: PostPlan): void {
    const make = (hdr: boolean) => {
      const pipeline = new B.DefaultRenderingPipeline("post", hdr, this.scene, [this.camera]);
      const maxSamples = this.engine.getCaps().maxMSAASamples || 1;
      pipeline.samples = Math.min(QUALITY_PLANS[this.options.quality].msaaSamples, maxSamples);
      pipeline.fxaaEnabled = pipeline.samples <= 1;

      // glow and blur can drop the see-through background, so they are skipped when something is drawn behind the picture
      const seeThrough = this.options.transparent;
      if (seeThrough && (plan.bloom || plan.depthOfField)) this.notes.push("Glow and background blur are skipped because the scene has layers behind the 3D picture.");
      pipeline.bloomEnabled = plan.bloom && !seeThrough;
      if (pipeline.bloomEnabled) {
        pipeline.bloomThreshold = plan.bloomThreshold;
        pipeline.bloomWeight = plan.bloomWeight;
        pipeline.bloomKernel = 64;
        pipeline.bloomScale = 0.5;
      }
      pipeline.depthOfFieldEnabled = plan.depthOfField && !seeThrough;
      if (pipeline.depthOfFieldEnabled) {
        pipeline.depthOfFieldBlurLevel = B.DepthOfFieldEffectBlurLevel.Medium;
        pipeline.depthOfField.focusDistance = plan.focusDistanceMm;
        pipeline.depthOfField.fStop = plan.fStop;
        pipeline.depthOfField.focalLength = 50;
      }
      pipeline.grainEnabled = plan.grain;
      if (plan.grain) {
        pipeline.grain.intensity = plan.grainIntensity;
        pipeline.grain.animated = false; // the same grain on every frame, so a frame never depends on the one before
      }
      pipeline.imageProcessingEnabled = true;
      this.applyColourLook(pipeline.imageProcessing, plan);
    };
    try {
      make(this.engine.getCaps().textureHalfFloatRender === true);
    } catch {
      try {
        make(false);
      } catch {
        this.notes.push("Post effects (glow, blur, vignette, grain) are not supported on this device and were skipped.");
      }
    }
  }

  private applyColourLook(ip: B.ImageProcessingPostProcess, plan: PostPlan): void {
    ip.toneMappingEnabled = plan.toneMapping !== "none";
    ip.toneMappingType = plan.toneMapping === "aces" ? B.ImageProcessingConfiguration.TONEMAPPING_ACES : B.ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
    ip.exposure = plan.exposure;
    ip.contrast = plan.contrast;
    if (plan.saturation !== 1) {
      const curves = new B.ColorCurves();
      curves.globalSaturation = Math.max(-100, Math.min(100, (plan.saturation - 1) * 100));
      ip.colorCurves = curves;
      ip.colorCurvesEnabled = true;
    }
    ip.vignetteEnabled = plan.vignette;
    if (plan.vignette) {
      ip.vignetteWeight = plan.vignetteWeight;
      ip.vignetteColor = new B.Color4(0, 0, 0, 0);
      ip.vignetteStretch = 0;
    }
  }

  // ---- objects -------------------------------------------------------------------------------

  private linkParents(): void {
    const defs = this.options.scene.objects;
    for (const o of defs) {
      const child = this.built.get(o.id);
      const parent = o.parent === undefined ? undefined : this.built.get(o.parent);
      if (child && parent && child !== parent) child.root.parent = parent.root;
    }
    // parents before children, whatever order the scene lists them in
    const depthOf = (id: string): number => {
      let depth = 0;
      for (let at = defs.find((d) => d.id === id)?.parent; at !== undefined && depth < defs.length; at = defs.find((d) => d.id === at)?.parent) depth++;
      return depth;
    };
    this.order = defs.map((o) => ({ o, depth: depthOf(o.id) })).sort((a, b) => a.depth - b.depth).flatMap(({ o }) => {
      const b = this.built.get(o.id);
      return b ? [b] : [];
    });
  }

  // ---- frames --------------------------------------------------------------------------------

  /** Draws one frame into `canvas`. Everything on screen comes from `state`. */
  renderFrame(state: FrameState): void {
    if (this.disposed) return;
    const basis = cameraBasis(state.camera);
    this.applyCamera(state, basis.up);
    for (const o of state.objects) {
      const b = this.built.get(o.id);
      if (b) applyCommon(b, o);
    }
    for (const b of this.order) b.root.computeWorldMatrix(true);

    const uc: UpdateContext = { time: state.time, right: vec(basis.right), up: vec(basis.up), position: vec(basis.position) };
    const byId = new Map(state.objects.map((o) => [o.id, o] as const));
    for (const b of this.order) {
      const o = byId.get(b.root.name);
      if (o) b.update(o, uc);
    }
    this.scene.render(true, true);
  }

  /** Renders a first frame and waits until every shader and texture is ready, so no frame is drawn half-finished. */
  async prepare(first: FrameState): Promise<void> {
    this.renderFrame(first);
    await this.scene.whenReadyAsync();
    this.renderFrame(first);
  }

  private applyCamera(state: FrameState, up: Vec3): void {
    const c = state.camera;
    const cam = this.camera;
    cam.position.set(c.position[0], c.position[1], c.position[2]);
    cam.setTarget(vec(c.lookAt));
    cam.upVector.copyFromFloats(up[0], up[1], up[2]); // after setTarget: this is what carries the camera's roll
    const aspect = this.options.width / this.options.height;
    if (c.type === "orthographic") {
      const halfH = c.orthoHeight / 2;
      cam.mode = B.Camera.ORTHOGRAPHIC_CAMERA;
      cam.orthoTop = halfH;
      cam.orthoBottom = -halfH;
      cam.orthoLeft = -halfH * aspect;
      cam.orthoRight = halfH * aspect;
    } else {
      cam.mode = B.Camera.PERSPECTIVE_CAMERA;
      cam.fov = c.fov * DEG;
    }
  }

  /** World position of an object's origin (its feet, for characters), valid after `renderFrame`. */
  worldPositionOf(id: string): Vec3 | undefined {
    const b = this.built.get(id);
    if (!b) return undefined;
    const p = b.root.getAbsolutePosition();
    return [p.x, p.y, p.z];
  }

  /** Where each speaker's feet are on screen, in the scene's own pixels, for captions that sit under the speaker. */
  anchorsFor(state: FrameState): Record<string, { x: number; y: number }> {
    const def = this.options.scene;
    const speakers = [...new Set(def.dialogue.map((d) => d.speaker))];
    return speakerAnchors(speakers, def.objects.map((o) => o.id), (id) => this.worldPositionOf(id), state.camera, def.settings.width, def.settings.height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const b of this.built.values()) b.dispose();
    this.built.clear();
    this.scene.dispose();
    this.engine.dispose();
  }
}
