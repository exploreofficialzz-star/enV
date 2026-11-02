import type { MusicAnalysisInput, MusicAnalysisResult } from "../engines/music-analysis.ts";
import type { MusicDatasetAnalysis } from "../engines/music-dataset-analysis.ts";

type WorkerResult =
  | { type: "progress"; requestId: string; fraction: number }
  | { type: "result"; requestId: string; analysis: MusicAnalysisResult; datasetAnalysis: MusicDatasetAnalysis }
  | { type: "error"; requestId: string; message: string };

export type MusicWorkerResult = {
  analysis: MusicAnalysisResult;
  datasetAnalysis: MusicDatasetAnalysis;
};

export function analyzeMusicInWorker(
  input: MusicAnalysisInput,
  options: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<MusicWorkerResult> {
  if (options.signal?.aborted) return Promise.reject(new DOMException("Cancelled", "AbortError"));
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("Background audio workers are not supported by this browser. Use a supported modern browser for local DSP analysis."));
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL("./music-analysis.worker.ts", import.meta.url), { type: "module", name: "env-music-analysis" });
  } catch {
    return Promise.reject(new Error("The local audio analysis worker could not start. Check browser worker restrictions and try again."));
  }

  const requestId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
  const channelBuffers: ArrayBuffer[] = [];
  for (const channel of input.channels) {
    const copy = channel.slice();
    if (!(copy.buffer instanceof ArrayBuffer)) {
      worker.terminate();
      return Promise.reject(new Error("The browser could not prepare transferable audio samples."));
    }
    channelBuffers.push(copy.buffer);
  }

  // Embedded artwork can be large; it is not an input to technical DSP.
  let metadata: MusicAnalysisInput["metadata"];
  if (input.metadata) {
    const { artwork: _artwork, ...textMetadata } = input.metadata;
    metadata = textMetadata;
  }
  const payload = {
    type: "analyze" as const,
    requestId,
    input: {
      ...input,
      metadata,
      channels: channelBuffers,
    },
  };

  return new Promise<MusicWorkerResult>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      options.signal?.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => fail(new DOMException("Cancelled", "AbortError"));

    options.signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerResult>) => {
      const message = event.data;
      if (!message || message.requestId !== requestId) return;
      if (message.type === "progress") {
        try {
          options.onProgress?.(Math.max(0, Math.min(1, message.fraction)));
        } catch {
          // Progress rendering must not fail an otherwise valid analysis.
        }
        return;
      }
      if (message.type === "error") {
        fail(new Error(message.message || "Local audio analysis failed."));
        return;
      }
      settled = true;
      cleanup();
      resolve({ analysis: message.analysis, datasetAnalysis: message.datasetAnalysis });
    };
    worker.onerror = () => fail(new Error("The local audio analysis worker stopped unexpectedly. No result was committed."));
    worker.onmessageerror = () => fail(new Error("The local audio worker returned an unreadable result."));

    try {
      worker.postMessage(payload, channelBuffers);
    } catch {
      fail(new Error("The browser could not transfer audio samples to the analysis worker."));
    }
  });
}
