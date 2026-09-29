export type MediaRuntimeKind = "browser" | "native" | "server" | "unavailable";

export type MediaJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface MediaJobRequest {
  id: string;
  toolId: string;
  operation: string;
  inputBytes?: number;
  inputMime?: string;
  preferredRuntime?: Exclude<MediaRuntimeKind, "unavailable">;
  params?: Record<string, unknown>;
}

export interface MediaRuntimeInfo {
  kind: MediaRuntimeKind;
  available: boolean;
  reason?: string;
}

export interface MediaJobSnapshot {
  id: string;
  status: MediaJobStatus;
  progress: number;
  runtime: MediaRuntimeKind;
  error?: string;
}

export interface MediaRuntimeAdapter {
  readonly kind: Exclude<MediaRuntimeKind, "unavailable">;
  canHandle(request: MediaJobRequest): boolean | Promise<boolean>;
  execute(request: MediaJobRequest, signal: AbortSignal, onProgress: (progress: number) => void): Promise<Blob>;
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function detectMediaRuntimes(): MediaRuntimeInfo[] {
  const browserAvailable = typeof window !== "undefined" && typeof document !== "undefined";
  const nativeAvailable = typeof window !== "undefined" && Boolean((window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView);
  const serverAvailable = typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_MEDIA_PROCESSOR_URL === "string" && Boolean(String(import.meta.env.VITE_MEDIA_PROCESSOR_URL).trim());
  return [
    { kind: "browser", available: browserAvailable, reason: browserAvailable ? "Browser media APIs are available." : "No browser runtime detected." },
    { kind: "native", available: nativeAvailable, reason: nativeAvailable ? "The enV native WebView bridge is available." : "Native media bridge is not connected." },
    { kind: "server", available: serverAvailable, reason: serverAvailable ? "A media processing service endpoint is configured." : "No media processing service is configured in this runtime." },
  ];
}

export function chooseMediaRuntime(request: MediaJobRequest, adapters: MediaRuntimeAdapter[]): MediaRuntimeKind {
  const runtimes = detectMediaRuntimes();
  const preferred = request.preferredRuntime;
  if (preferred && runtimes.some((item) => item.kind === preferred && item.available) && adapters.some((adapter) => adapter.kind === preferred)) return preferred;
  for (const adapter of adapters) {
    const runtime = runtimes.find((item) => item.kind === adapter.kind);
    if (runtime?.available) return adapter.kind;
  }
  return "unavailable";
}

export class MediaJobController {
  private readonly adapters: MediaRuntimeAdapter[];
  private readonly jobs = new Map<string, MediaJobSnapshot>();
  private readonly controllers = new Map<string, AbortController>();

  constructor(adapters: MediaRuntimeAdapter[] = []) {
    this.adapters = adapters;
  }

  get(id: string) {
    return this.jobs.get(id);
  }

  cancel(id: string) {
    const controller = this.controllers.get(id);
    if (!controller) return false;
    controller.abort();
    const current = this.jobs.get(id);
    if (current) this.jobs.set(id, { ...current, status: "cancelled" });
    return true;
  }

  async run(request: Omit<MediaJobRequest, "id">): Promise<{ id: string; blob: Blob; runtime: MediaRuntimeKind }> {
    const id = createId();
    const fullRequest = { ...request, id };
    const runtime = chooseMediaRuntime(fullRequest, this.adapters);
    if (runtime === "unavailable") {
      this.jobs.set(id, { id, status: "failed", progress: 0, runtime, error: "No compatible media processing runtime is available." });
      throw new Error("No compatible media processing runtime is available on this device.");
    }
    const adapter = this.adapters.find((item) => item.kind === runtime);
    if (!adapter) throw new Error("The selected media runtime is not configured.");
    const canHandle = await adapter.canHandle(fullRequest);
    if (!canHandle) {
      this.jobs.set(id, { id, status: "failed", progress: 0, runtime, error: "The selected media runtime cannot handle this operation." });
      throw new Error("The selected media runtime cannot handle this operation.");
    }
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.jobs.set(id, { id, status: "running", progress: 0, runtime });
    try {
      const blob = await adapter.execute(fullRequest, controller.signal, (progress) => {
        const current = this.jobs.get(id);
        if (current) this.jobs.set(id, { ...current, progress: Math.max(0, Math.min(100, progress)) });
      });
      this.jobs.set(id, { id, status: "completed", progress: 100, runtime });
      return { id, blob, runtime };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Media processing failed.";
      this.jobs.set(id, { id, status: controller.signal.aborted ? "cancelled" : "failed", progress: this.jobs.get(id)?.progress ?? 0, runtime, error: message });
      throw error;
    } finally {
      this.controllers.delete(id);
    }
  }
}
