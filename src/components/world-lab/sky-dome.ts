import * as B from "babylonjs";
import { approximateSolarPosition, representativeSite, skyLighting, skyPalette, sunDirection } from "@/lib/world-lab/sky";

/** Sky radius stays inside the eye-level far plane (see HORIZON_FAR_PLANE_METRES). */
export const SKY_RADIUS_METRES = 5000;
/** Far plane used at eye level so the ground reaches the horizon and fades into haze. */
export const HORIZON_FAR_PLANE_METRES = 8000;
/** Beyond this observer range the surface view hands over to the orbital/scale views. */
export const SURFACE_VIEW_MAX_RANGE_METRES = 400;
const FOG_DENSITY = 0.00045;

export type WorldLabSky = {
  /** Recompute sun, sky colours, haze and daylight for the given instant. */
  update(now: Date): void;
  /** Fit haze and visibility to the observer: surface view shows sky + haze, other scales do not. */
  setObserver(rangeMetres: number, depthMetres: number): void;
  dispose(): void;
};

export function createWorldLabSky(scene: B.Scene, ambient: B.HemisphericLight, sunlight: B.DirectionalLight): WorldLabSky {
  const dome = B.MeshBuilder.CreateSphere(
    "representative-sky",
    { diameter: SKY_RADIUS_METRES * 2, segments: 64, sideOrientation: B.Mesh.BACKSIDE, updatable: true },
    scene,
  );
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.applyFog = false;
  const domeMaterial = new B.StandardMaterial("representative-sky-material", scene);
  domeMaterial.disableLighting = true;
  domeMaterial.diffuseColor = B.Color3.Black();
  domeMaterial.specularColor = B.Color3.Black();
  domeMaterial.emissiveColor = B.Color3.White();
  domeMaterial.backFaceCulling = false;
  domeMaterial.disableDepthWrite = true;
  domeMaterial.fogEnabled = false;
  dome.material = domeMaterial;

  const sun = B.MeshBuilder.CreateDisc("representative-sun", { radius: 70, tessellation: 48 }, scene);
  sun.infiniteDistance = true;
  sun.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
  sun.isPickable = false;
  sun.applyFog = false;
  const sunMaterial = new B.StandardMaterial("representative-sun-material", scene);
  sunMaterial.disableLighting = true;
  sunMaterial.diffuseColor = B.Color3.Black();
  sunMaterial.specularColor = B.Color3.Black();
  sunMaterial.emissiveColor = new B.Color3(1, 0.96, 0.84);
  sunMaterial.fogEnabled = false;
  sunMaterial.backFaceCulling = false;
  sun.material = sunMaterial;

  const positions = dome.getVerticesData(B.VertexBuffer.PositionKind) ?? [];
  const vertexCount = positions.length / 3;
  const directions = new Float32Array(positions.length);
  for (let i = 0; i < vertexCount; i += 1) {
    const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    const length = Math.hypot(x, y, z) || 1;
    directions[3 * i] = x / length;
    directions[3 * i + 1] = y / length;
    directions[3 * i + 2] = z / length;
  }
  const colors = new Float32Array(vertexCount * 4);

  const paint = (altitudeDegrees: number, sunDir: [number, number, number]) => {
    const palette = skyPalette(altitudeDegrees);
    for (let i = 0; i < vertexCount; i += 1) {
      const dx = directions[3 * i], dy = directions[3 * i + 1], dz = directions[3 * i + 2];
      const up = Math.max(0, dy);
      const t = Math.pow(up, 0.5);
      let r = palette.horizon[0] + (palette.zenith[0] - palette.horizon[0]) * t;
      let g = palette.horizon[1] + (palette.zenith[1] - palette.horizon[1]) * t;
      let b = palette.horizon[2] + (palette.zenith[2] - palette.horizon[2]) * t;
      const cosine = dx * sunDir[0] + dy * sunDir[1] + dz * sunDir[2];
      const glow = palette.glowStrength * Math.exp(-Math.pow(Math.acos(Math.min(1, Math.max(-1, cosine))) / 0.42, 2)) * (1 - 0.6 * t);
      r += (palette.glow[0] - r) * glow;
      g += (palette.glow[1] - g) * glow;
      b += (palette.glow[2] - b) * glow;
      if (dy < 0) { const fade = Math.min(1, -dy * 4); r *= 1 - 0.25 * fade; g *= 1 - 0.25 * fade; b *= 1 - 0.25 * fade; }
      colors[4 * i] = r; colors[4 * i + 1] = g; colors[4 * i + 2] = b; colors[4 * i + 3] = 1;
    }
    if (dome.getVerticesData(B.VertexBuffer.ColorKind)) dome.updateVerticesData(B.VertexBuffer.ColorKind, colors);
    else dome.setVerticesData(B.VertexBuffer.ColorKind, colors, true);
    const horizon = new B.Color3(palette.horizon[0], palette.horizon[1], palette.horizon[2]);
    scene.fogColor = horizon;
    scene.clearColor = new B.Color4(horizon.r, horizon.g, horizon.b, 1);
  };

  let lastPaintAltitude = Number.NaN;
  let lastPaintAzimuth = Number.NaN;
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogDensity = FOG_DENSITY;

  return {
    update(now) {
      const site = representativeSite(now);
      const position = approximateSolarPosition(now, site.latitudeDegrees, site.longitudeDegrees);
      const dir = sunDirection(position);
      const light = skyLighting(position.altitudeDegrees);
      ambient.intensity = light.ambient;
      sunlight.intensity = light.sun;
      sunlight.direction = new B.Vector3(-dir[0], -Math.max(0.05, dir[1]), -dir[2]);
      sun.position = new B.Vector3(dir[0] * 4200, dir[1] * 4200, dir[2] * 4200);
      sun.setEnabled(light.sunVisible && dome.isEnabled());
      if (Math.abs(position.altitudeDegrees - lastPaintAltitude) > 0.15 || Math.abs(position.azimuthDegrees - lastPaintAzimuth) > 0.4 || Number.isNaN(lastPaintAltitude)) {
        lastPaintAltitude = position.altitudeDegrees;
        lastPaintAzimuth = position.azimuthDegrees;
        paint(position.altitudeDegrees, dir);
      }
    },
    setObserver(rangeMetres, depthMetres) {
      const surface = rangeMetres <= SURFACE_VIEW_MAX_RANGE_METRES;
      dome.setEnabled(surface);
      if (!surface) sun.setEnabled(false);
      scene.fogMode = surface && depthMetres <= 0 ? B.Scene.FOGMODE_EXP2 : B.Scene.FOGMODE_NONE;
    },
    dispose() {
      dome.dispose(false, true);
      sun.dispose(false, true);
    },
  };
}

/** Deterministic grass-and-soil texture so ground gives scale and motion cues without implying a mapped site. */
export function createGroundTexture(scene: B.Scene, groundSizeMetres: number): B.DynamicTexture {
  const size = 256;
  const tileMetres = 8;
  const texture = new B.DynamicTexture("representative-ground-texture", { width: size, height: size }, scene, true);
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.fillStyle = "#6d8e72";
  context.fillRect(0, 0, size, size);
  let seed = 20260109;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 3200; i += 1) {
    const v = Math.round(random() * 30 - 15);
    context.fillStyle = `rgb(${109 + v},${142 + v},${114 + v})`;
    context.fillRect(Math.floor(random() * size), Math.floor(random() * size), 2, 2);
  }
  context.strokeStyle = "rgba(255,255,255,0.07)";
  context.lineWidth = 1;
  const step = size / tileMetres;
  for (let i = 0; i <= tileMetres; i += 1) {
    context.beginPath();
    context.moveTo(i * step, 0); context.lineTo(i * step, size);
    context.moveTo(0, i * step); context.lineTo(size, i * step);
    context.stroke();
  }
  texture.update(true);
  texture.uScale = groundSizeMetres / tileMetres;
  texture.vScale = groundSizeMetres / tileMetres;
  texture.anisotropicFilteringLevel = 8;
  return texture;
}
