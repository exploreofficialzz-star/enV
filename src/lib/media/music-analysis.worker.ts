/// <reference lib="webworker" />
import type { MusicAnalysisInput, MusicAnalysisResult } from "../engines/music-analysis.ts";
import type { MusicDatasetAnalysis } from "../engines/music-dataset-analysis.ts";
import { runMusicAnalysisWorkerCore } from "./music-analysis-worker-core.ts";

type AnalyzeRequest = {
  type: "analyze";
  requestId: string;
  input: Omit<MusicAnalysisInput, "channels"> & { channels: ArrayBuffer[] };
};

type WorkerRequest = AnalyzeRequest;
type WorkerResponse =
  | { type: "progress"; requestId: string; fraction: number }
  | { type: "result"; requestId: string; analysis: MusicAnalysisResult; datasetAnalysis: MusicDatasetAnalysis }
  | { type: "error"; requestId: string; message: string };

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (!request || request.type !== "analyze" || typeof request.requestId !== "string") return;
  const send = (message: WorkerResponse) => workerScope.postMessage(message);
  try {
    const channels = request.input.channels.map((buffer) => new Float32Array(buffer));
    const input = { ...request.input, channels };
    const result = await runMusicAnalysisWorkerCore(
      input,
      (fraction) => send({ type: "progress", requestId: request.requestId, fraction }),
    );
    send({ type: "result", requestId: request.requestId, ...result });
  } catch (error) {
    send({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message.slice(0, 500) : "Audio analysis failed in the worker.",
    });
  }
};

export {};
