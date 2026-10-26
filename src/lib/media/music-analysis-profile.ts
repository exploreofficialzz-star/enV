import type { MusicAnalysisResult } from "../engines/music-analysis.ts";

type SemanticSource = "unknown";
type SignalSource = "signal_estimate" | "unavailable";
type MetadataSource = "embedded_metadata" | "unknown";

/**
 * Compact, machine-friendly song profile for the Analyzer's profile export.
 *
 * Signal-derived metrics and embedded tags retain separate fields. Semantic label
 * provenance is reported as unknown unless an allowed source is explicitly recorded;
 * this deterministic Analyzer does not run a classifier.
 */
export type MusicAnalysisProfile = {
  schema_version: "env.music-profile.v2";
  genre: string | null;
  sub_style: string | null;
  language: string[];
  tempo_bpm: number | null;
  key: string | null;
  mood: string[];
  instruments: string[];
  vocal_style: string | null;
  genre_candidates: MusicAnalysisResult["classification"]["genre_candidates"];
  title: string | null;
  artist: string | null;
  album: string | null;
  duration_seconds: number;
  source: MusicAnalysisResult["source"];
  metadata: MusicAnalysisResult["metadata"];
  audio_metrics: MusicAnalysisResult["audio"];
  timbre: MusicAnalysisResult["timbre"];
  analysis_status: {
    classification: MusicAnalysisResult["classification"]["status"];
    genre: SemanticSource;
    sub_style: SemanticSource;
    language: SemanticSource;
    mood: SemanticSource;
    instruments: SemanticSource;
    vocal_style: SemanticSource;
    tempo_bpm: SignalSource;
    key: SignalSource;
    file_metadata: MetadataSource;
  };
  notes: {
    classification: string;
    tempo: string;
    key: string;
    loudness: string;
  };
};

export function createMusicAnalysisProfile(result: MusicAnalysisResult): MusicAnalysisProfile {
  const classification = result.classification;
  const hasEmbeddedMetadata = Boolean(
    result.metadata.title ||
    result.metadata.artist ||
    result.metadata.album ||
    result.metadata.embedded_genre ||
    result.metadata.album_artist,
  );

  return {
    schema_version: "env.music-profile.v2",
    genre: classification.genre,
    sub_style: classification.sub_style,
    language: [...classification.language],
    tempo_bpm: result.rhythm.tempo_bpm,
    key: result.tonality.key,
    mood: [...classification.mood],
    instruments: [...classification.instruments],
    vocal_style: classification.vocal_style,
    genre_candidates: classification.genre_candidates.map((candidate) => ({ ...candidate })),
    title: result.metadata.title,
    artist: result.metadata.artist,
    album: result.metadata.album,
    duration_seconds: result.audio.duration_seconds,
    source: { ...result.source },
    metadata: { ...result.metadata },
    audio_metrics: { ...result.audio },
    timbre: { ...result.timbre },
    analysis_status: {
      classification: classification.status,
      genre: "unknown",
      sub_style: "unknown",
      language: "unknown",
      mood: "unknown",
      instruments: "unknown",
      vocal_style: "unknown",
      tempo_bpm: result.rhythm.status === "estimated" ? "signal_estimate" : "unavailable",
      key: result.tonality.status === "estimated" ? "signal_estimate" : "unavailable",
      file_metadata: hasEmbeddedMetadata ? "embedded_metadata" : "unknown",
    },
    notes: {
      classification: classification.note,
      tempo: "Tempo is a best-effort signal estimate, not a model-verified ground-truth value.",
      key: "Key is a best-effort tonal estimate and may be ambiguous for short, noisy, or modal audio.",
      loudness: "The loudness value is an RMS-based proxy, not standards-compliant integrated LUFS.",
    },
  };
}
