import { env, pipeline } from "@xenova/transformers";
import {
  aggregateSongCandidates, AST_MODEL, AST_REVISION, emptyCandidates, validTranscriptSegments,
  WHISPER_MODEL, WHISPER_REVISION, type BrowserSongIntelligence, type SongCandidateGroup, type SongWindow,
} from "../lib/media/song-intelligence";

type RunRequest = { id: string; samples: Float32Array; sampleRate: number; downmix: BrowserSongIntelligence["downmix"]; sound: boolean; speech: boolean };

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
// Model files are downloaded and cached by the browser; audio stays inside this worker.

const groups: Record<SongCandidateGroup, number[]> = {
  instruments: [139, 140, 141, 142, 143, 144, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 160, 161, 162, 163, 164, 165, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 185, 186, 187, 188, 189, 190, 191, 193, 194, 195, 196, 197, 198, 199, 208, 209, 210, 211, 212, 213, 214],
  genre: Array.from({ length: 60 }, (_, i) => 216 + i).filter((id) => ![218, 266, 267, 268, 269, 270, 271, 272, 273].includes(id)),
  mood: [276, 277, 278, 279, 280, 281, 282],
  vocals: [0, 4, 5, 15, 27, 28, 29, 30, 31, 35, 36, 37, 254, 255],
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "The local model could not run.";
}

self.onmessage = async (event: MessageEvent<RunRequest>) => {
  const { id, samples, sampleRate, downmix, sound, speech } = event.data;
  const duration = samples.length / sampleRate;
  const progress = (stage: string, fraction: number) => self.postMessage({ id, type: "progress", stage, fraction: Math.max(0, Math.min(1, fraction)) });
  const result: BrowserSongIntelligence = {
    schema_version: "env.browser-song-intelligence.v1", duration_seconds: duration, sample_rate_hz: sampleRate, audio_source: "full_mix", downmix,
    sound: { status: "not_requested", model: AST_MODEL, revision: AST_REVISION, coverage_seconds: 0, windows: [], candidates: emptyCandidates(), note: "AudioSet model scores are uncalibrated estimates; review candidates by listening." },
    speech: { status: "not_requested", model: WHISPER_MODEL, revision: WHISPER_REVISION, coverage_seconds: 0, text: "", segments: [], note: "Candidate speech/lyrics from the full mix; singing, background music and code-switching can cause mistakes." },
    warnings: [],
  };
  if (sampleRate !== 16_000 || !samples.length || !Number.isFinite(duration) || duration > 900) {
    self.postMessage({ id, type: "error", error: "The audio must be mono 16 kHz PCM, no longer than 15 minutes." });
    return;
  }
  if (sound) {
    let classifier: any;
    try {
      progress("Loading sound model", 0.02);
      classifier = await pipeline("audio-classification", AST_MODEL, { revision: AST_REVISION, quantized: true,
        progress_callback: (p: { status?: string; progress?: number }) => { if (p.status === "progress" && typeof p.progress === "number") progress("Downloading sound model", 0.03 + p.progress / 100 * 0.12); },
      });
      const windows: SongWindow[] = [];
      const size = sampleRate * 10;
      for (let offset = 0; offset < samples.length; offset += size) {
        const chunk = samples.subarray(offset, Math.min(samples.length, offset + size));
        let power = 0;
        for (const sample of chunk) power += sample * sample;
        const silent = Math.sqrt(power / Math.max(1, chunk.length)) < 0.0001;
        const candidates = emptyCandidates();
        if (!silent) {
          const input = await classifier.processor(chunk);
          const output = await classifier.model(input);
          const logits = output.logits.data as Float32Array;
          for (const group of Object.keys(groups) as SongCandidateGroup[]) {
            candidates[group] = groups[group].flatMap((index) => {
              const label = classifier.model.config.id2label[String(index)];
              const logit = logits[index];
              if (typeof label !== "string" || !Number.isFinite(logit)) return [];
              const score = 1 / (1 + Math.exp(-logit));
              return score >= 0.1 ? [{ label, score: Number(score.toFixed(4)) }] : [];
            }).sort((a, b) => b.score - a.score).slice(0, 5);
          }
        }
        windows.push({ start_seconds: offset / sampleRate, end_seconds: Math.min(samples.length, offset + size) / sampleRate, silent, candidates });
        progress("Recognizing instruments and sounds", 0.15 + 0.3 * Math.min(1, (offset + chunk.length) / samples.length));
      }
      result.sound = { ...result.sound, status: "completed", coverage_seconds: duration, windows, candidates: aggregateSongCandidates(windows) };
    } catch (error) {
      result.sound.status = "unavailable";
      result.warnings.push(`Sound recognition unavailable: ${errorText(error)}`);
    } finally { await classifier?.dispose?.().catch(() => undefined); }
  }
  if (speech) {
    let recognizer: any;
    try {
      progress("Loading speech model", sound ? 0.46 : 0.02);
      recognizer = await pipeline("automatic-speech-recognition", WHISPER_MODEL, { revision: WHISPER_REVISION, quantized: true,
        progress_callback: (p: { status?: string; progress?: number }) => { if (p.status === "progress" && typeof p.progress === "number") progress("Downloading speech model", 0.46 + p.progress / 100 * 0.1); },
      });
      let power = 0;
      for (const sample of samples) power += sample * sample;
      if (Math.sqrt(power / samples.length) >= 0.0001) {
        let completed = 0;
        const expected = Math.ceil(duration / 20);
        const transcript = await recognizer(samples, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true,
          chunk_callback: () => { completed++; progress("Recognizing speech and lyrics", 0.56 + 0.43 * Math.min(1, completed / expected)); },
        });
        const text = String(transcript.text ?? "").trim();
        result.speech.text = text.slice(0, 100_000);
        if (text.length > 100_000) result.warnings.push("The transcript text exceeds 100,000 characters; the displayed text was truncated.");
        result.speech.segments = validTranscriptSegments(Array.isArray(transcript.chunks) ? transcript.chunks : [], duration);
        if (Array.isArray(transcript.chunks) && transcript.chunks.length > 1500) result.warnings.push("The transcript contains more than 1,500 segments; the displayed segment list was truncated.");
      }
      result.speech.status = "completed";
      result.speech.coverage_seconds = duration;
    } catch (error) {
      result.speech.status = "unavailable";
      result.warnings.push(`Speech recognition unavailable: ${errorText(error)}`);
    } finally { await recognizer?.dispose?.().catch(() => undefined); }
  }
  progress("Audio models complete", 1);
  self.postMessage({ id, type: "result", result });
};
