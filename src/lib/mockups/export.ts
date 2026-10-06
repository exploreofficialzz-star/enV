// @ts-nocheck
import type { DeviceTemplate, MockupProject, ThemeTokens } from "./schema.ts";
import { PLATFORM_ADAPTERS } from "./platforms/registry.ts";
import { createServerMediaAdapter } from "@/lib/media/media-backends";

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
}

import { renderProjectSvg } from "./render.ts";

export function projectToSvg(project: MockupProject, device: DeviceTemplate, tokens: ThemeTokens, atMs = Number.POSITIVE_INFINITY) {
  return renderProjectSvg(project, device, tokens, atMs);
}

async function svgFrameToBlob(svg: string, width: number, height: number): Promise<Blob> {
  const image = await createImageBitmap(new Blob([svg], { type: "image/svg+xml" }));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas export is not supported in this browser.");
  ctx.drawImage(image, 0, 0, width, height); image.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not render an animation frame.")), "image/png"));
}

async function recordWebm(project: MockupProject, device: DeviceTemplate, tokens: ThemeTokens): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") throw new Error("WebM animation export is not supported by this browser.");
  const fps = Math.max(1, Math.min(60, project.exportSettings.fps ?? 12));
  const duration = Math.max(100, project.exportSettings.durationMs ?? 2000);
  const scale = Math.max(1, project.exportSettings.scale);
  const width = (project.exportSettings.width ?? device.width) + device.bezelPx * 2;
  const height = (project.exportSettings.height ?? device.height) + device.bezelPx * 2;
  const canvas = document.createElement("canvas"); canvas.width = width * scale; canvas.height = height * scale;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas export is not supported in this browser.");
  const stream = canvas.captureStream(fps);
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((x) => MediaRecorder.isTypeSupported(x));
  if (!mime) throw new Error("This browser cannot encode WebM animation.");
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = []; recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((resolve, reject) => { recorder.onerror = () => reject(recorder.error ?? new Error("WebM recording failed.")); recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" })); });
  recorder.start();
  const frameCount = Math.max(1, Math.ceil(duration / 1000 * fps));
  for (let i = 0; i < frameCount; i++) {
    const atMs = Math.min(duration, Math.round(i * 1000 / fps));
    const svg = projectToSvg(project, device, tokens, atMs);
    const frame = await svgFrameToBlob(svg, canvas.width, canvas.height);
    const bitmap = await createImageBitmap(frame);
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.round(1000 / fps))));
  }
  recorder.stop(); stream.getTracks().forEach((track) => track.stop());
  return done;
}

async function convertAnimation(input: Blob, format: "gif" | "mp4"): Promise<Blob> {
  const adapter = createServerMediaAdapter();
  const operation = format === "gif" ? "server-media:video-to-gif" : "server-media:video-to-mp4";
  return adapter.execute({ id: crypto.randomUUID(), toolId: "mockups-animation-export", operation, params: { input, file: input, fileName: "mockup-animation.webm", outputName: `mockup-animation.${format}` } }, new AbortController().signal, () => {});
}

export async function exportProject(project: MockupProject, device: DeviceTemplate, tokens: ThemeTokens): Promise<Blob> {
  const format = project.exportSettings.format;
  if (format === "webm" || format === "gif" || format === "mp4") {
    const webm = await recordWebm(project, device, tokens);
    if (format === "webm") return webm;
    return convertAnimation(webm, format);
  }
  const svg = projectToSvg(project, device, tokens);
  if (format === "svg") return new Blob([svg], { type: "image/svg+xml" });
  const image = await createImageBitmap(new Blob([svg], { type: "image/svg+xml" }));
  const scale = Math.max(1, project.exportSettings.scale);
  const width = (project.exportSettings.width ?? device.width) + device.bezelPx * 2;
  const height = (project.exportSettings.height ?? device.height) + device.bezelPx * 2;
  const canvas = document.createElement("canvas"); canvas.width = width * scale; canvas.height = height * scale;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas export is not supported in this browser.");
  if (!project.exportSettings.transparent && format !== "png") { ctx.fillStyle = tokens.background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
  const mime = format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode the mockup export.")), mime, 0.95));
}
