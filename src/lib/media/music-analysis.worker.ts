/// <reference lib="webworker" />
import { analyzeMusicAudio, type MusicAnalysisInput, type MusicAnalysisResult } from "../engines/music-analysis.ts";
import { analyzeMusicDatasetAudio, type MusicDatasetAnalysis } from "../engines/music-dataset-analysis.ts";

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
    const analysis = analyzeMusicAudio(input);
    const datasetAnalysis = await analyzeMusicDatasetAudio(
      {
        channels,
        sampleRate: input.sampleRate,
        fileName: input.fileName,
        sourceSha256: input.sourceSha256,
      },
      { onProgress: (fraction) => send({ type: "progress", requestId: request.requestId, fraction }) },
    );
    send({ type: "result", requestId: request.requestId, analysis, datasetAnalysis });
  } catch (error) {
    send({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message.slice(0, 500) : "Audio analysis failed in the worker.",
    });
  }
};

export {};
