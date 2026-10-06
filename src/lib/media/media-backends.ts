import type { MediaJobRequest, MediaRuntimeAdapter } from "./media-runtime";

export interface FfmpegExecutionRequest {
  input: Blob;
  outputName: string;
  outputMime: string;
  args: string[];
  toolId: string;
  operation: string;
  params?: Record<string, unknown>;
}

export interface FfmpegRunner {
  run(request: FfmpegExecutionRequest, signal: AbortSignal, onProgress: (progress: number) => void): Promise<Blob>;
}

let ffmpegRunner: FfmpegRunner | null = null;

export function configureFfmpegRunner(runner: FfmpegRunner | null) {
  ffmpegRunner = runner;
}

export function isFfmpegConfigured() {
  return ffmpegRunner !== null;
}

export function createFfmpegAdapter(): MediaRuntimeAdapter {
  return {
    kind: "browser",
    canHandle: (request: MediaJobRequest) => Boolean(ffmpegRunner) && request.operation.startsWith("ffmpeg:"),
    execute: async (request, signal, onProgress) => {
      if (!ffmpegRunner) throw new Error("FFmpeg runtime is not configured on this device.");
      const input = request.params?.input;
      if (!(input instanceof Blob)) throw new Error("An input media file is required.");
      const outputName = String(request.params?.outputName ?? "output.bin");
      const outputMime = String(request.params?.outputMime ?? "application/octet-stream");
      const args = Array.isArray(request.params?.args) ? request.params.args.map(String) : [];
      return ffmpegRunner.run({ input, outputName, outputMime, args, toolId: request.toolId, operation: request.operation, params: request.params }, signal, onProgress);
    },
  };
}

export interface ServerMediaConfig {
  endpoint: string;
  configured: boolean;
}

export function getServerMediaConfig(): ServerMediaConfig {
  const viteEndpoint = typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_MEDIA_PROCESSOR_URL === "string"
    ? String(import.meta.env.VITE_MEDIA_PROCESSOR_URL).trim()
    : "";
  const nodeEndpoint = typeof process !== "undefined" && typeof process.env?.VITE_MEDIA_PROCESSOR_URL === "string"
    ? String(process.env.VITE_MEDIA_PROCESSOR_URL).trim()
    : "";
  const endpoint = viteEndpoint || nodeEndpoint || "/api/backend/media";
  return { endpoint, configured: true };
}

export function createServerMediaAdapter(): MediaRuntimeAdapter {
  return {
    kind: "server",
    canHandle: (request) => getServerMediaConfig().configured && request.operation.startsWith("server-media:"),
    execute: async (request, signal, onProgress) => {
      const { endpoint } = getServerMediaConfig();
      if (!endpoint) throw new Error("No media processing service is configured.");
      const input = request.params?.input;
      const inputs = Array.isArray(request.params?.inputs) ? request.params.inputs.filter((value): value is Blob => value instanceof Blob) : [];
      if (!(input instanceof Blob) && inputs.length === 0) throw new Error("At least one input media file is required.");
      const safeParams = { ...(request.params ?? {}) };
      delete safeParams.input;
      delete safeParams.file;
      delete safeParams.fileName;
      delete safeParams.inputs;
      delete safeParams.fileNames;
      onProgress(5);
      const fileNames = Array.isArray(request.params?.fileNames) ? request.params.fileNames.map(String) : [];
      const sourceFiles = input instanceof Blob ? [{ value: input, name: String(request.params?.fileName ?? "input") }] : inputs.map((value, index) => ({ value, name: fileNames[index] ?? `input-${index + 1}` }));
      const gatewayLimit = 4 * 1024 * 1024;
      if (endpoint === "/api/backend/media" && sourceFiles.reduce((total, file) => total + file.value.size, 0) > gatewayLimit) {
        throw new Error("This deployment's same-origin media gateway accepts files up to 4 MB. Configure a direct MEDIA_PROCESSOR_URL for larger files.");
      }
      let response: Response;
      const form = new FormData();
      if (input instanceof Blob) form.append("file", input, String(request.params?.fileName ?? "input"));
      inputs.forEach((value, index) => form.append("files", value, fileNames[index] ?? `input-${index + 1}`));
      form.append("toolId", request.toolId);
      form.append("operation", request.operation.replace(/^server-media:/, ""));
      form.append("outputName", String(request.params?.outputName ?? "output.bin"));
      form.append("params", JSON.stringify(safeParams));
      onProgress(35);
      response = await fetch(endpoint, { method: "POST", body: form, signal });
      if (!response.ok) throw new Error(`Media service returned HTTP ${response.status}.`);
      onProgress(90);
      const blob = await response.blob();
      onProgress(100);
      return blob;
    },
  };
}
