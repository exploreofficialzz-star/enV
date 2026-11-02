import { analyzeMusicAudio, type MusicAnalysisInput, type MusicAnalysisResult } from "../engines/music-analysis.ts";
import { analyzeMusicDatasetAudio, type MusicDatasetAnalysis } from "../engines/music-dataset-analysis.ts";

export type MusicAnalysisWorkerInput = Omit<MusicAnalysisInput, "channels"> & {
  channels: readonly Float32Array[];
};

export type MusicAnalysisWorkerResult = {
  analysis: MusicAnalysisResult;
  datasetAnalysis: MusicDatasetAnalysis;
};

/** Pure DSP pipeline shared by the Worker and deterministic integration tests. */
export async function runMusicAnalysisWorkerCore(
  input: MusicAnalysisWorkerInput,
  onProgress?: (fraction: number) => void,
): Promise<MusicAnalysisWorkerResult> {
  const analysis = analyzeMusicAudio(input);
  const datasetAnalysis = await analyzeMusicDatasetAudio(
    {
      channels: input.channels,
      sampleRate: input.sampleRate,
      fileName: input.fileName,
      sourceSha256: input.sourceSha256,
    },
    { onProgress },
  );
  return { analysis, datasetAnalysis };
}
