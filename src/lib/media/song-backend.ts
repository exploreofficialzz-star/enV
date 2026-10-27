import { apiUrl } from "../api/base.ts";
import { localHealthSchema, localJobSchema, type LocalSongResult } from "./local-song-client.ts";

const base = () => apiUrl("/api/song");
export type BackendSongJob = { id: string; result: LocalSongResult };
export type BackendSongOptions = { tagging: boolean; transcription: boolean; stems: boolean; pieces: boolean; llm: false };

/** Prefer the server for phones and devices with limited memory when it is available. */
export function prefersSongBackend(device: { userAgent?: string; deviceMemory?: number; mobile?: boolean }): boolean {
  return device.mobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(device.userAgent ?? "") || (typeof device.deviceMemory === "number" && device.deviceMemory <= 4);
}

export function currentDevicePrefersBackend(): boolean {
  if (typeof navigator === "undefined") return false;
  const device = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  return prefersSongBackend({ userAgent: device.userAgent, deviceMemory: device.deviceMemory, mobile: device.userAgentData?.mobile });
}

export async function songBackendAvailable(signal?: AbortSignal): Promise<boolean> {
  try {
    const timeout = AbortSignal.timeout(8_000);
    const response = await fetch(`${base()}/v1/health`, { cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!response.ok) return false;
    const health = localHealthSchema.parse(await response.json());
    return health.location === "remote_backend" && health.ffmpeg && health.tagger_installed && health.transcription_configured && health.stems_configured;
  } catch { return false; }
}

export function songBackendArtifact(id: string, name: string): string {
  if (!/^[a-f0-9]{32}$/.test(id) || !name || name.split("/").some((part) => part === "." || part === ".." || !/^[a-zA-Z0-9_.-]+$/.test(part))) throw new Error("Invalid backend audio artifact.");
  return `${base()}/v1/jobs/${id}/artifacts/${name.split("/").map(encodeURIComponent).join("/")}`;
}

function pause(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Upload only after this path is selected. Job IDs are unguessable capabilities and are not exported. */
export async function runBackendSong(file: File, options: BackendSongOptions, signal: AbortSignal, onProgress: (stage: string, fraction: number) => void): Promise<BackendSongJob> {
  if (file.size > 50 * 1024 * 1024) throw new Error("Backend processing accepts files up to 50 MB.");
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const form = new FormData(); form.append("audio", file); form.append("options", JSON.stringify(options));
  onProgress("Sending audio to the backend", 0);
  const createdResponse = await fetch(`${base()}/v1/jobs`, { method: "POST", body: form, signal });
  if (!createdResponse.ok) throw new Error(`Backend song processing is unavailable (HTTP ${createdResponse.status}).`);
  const created = await createdResponse.json() as { id?: unknown };
  if (typeof created.id !== "string" || !/^[a-f0-9]{32}$/.test(created.id)) throw new Error("The backend returned an invalid job.");
  const id = created.id;
  try {
    while (!signal.aborted) {
      const response = await fetch(`${base()}/v1/jobs/${id}`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
      if (!response.ok) throw new Error(`Backend song processing returned HTTP ${response.status}.`);
      const job = localJobSchema.parse(await response.json());
      onProgress(`Backend: ${job.stage}`, job.progress / 100);
      if ((job.state === "completed" || job.state === "partial") && job.result) {
        if (job.result.processing.location !== "remote_backend" || !job.result.processing.hosted_inference) throw new Error("The backend returned an invalid processing location.");
        return { id, result: job.result };
      }
      if (job.state === "failed" || job.state === "cancelled") throw new Error(job.error || "Backend analysis failed.");
      await pause(signal, 2_000);
    }
    throw new DOMException("Cancelled", "AbortError");
  } finally {
    if (signal.aborted) void fetch(`${base()}/v1/jobs/${id}/cancel`, { method: "POST", keepalive: true }).catch(() => undefined);
  }
}
