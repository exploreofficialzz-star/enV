import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, Archive, Download,
  FileAudio, FileJson, FileSpreadsheet, LoaderCircle, Pause,
  Upload, X,
} from "lucide-react";
import { strToU8, unzipSync, zipSync } from "fflate";
import { type MusicMetadata } from "@/lib/media/music-metadata";
import { readSongFileMetadata } from "@/lib/media/song-file-metadata";
import { type LocalSongResult } from "@/lib/media/local-song-client";
import { type BrowserSongIntelligence } from "@/lib/media/song-intelligence";
import { createSongIntelligenceWorker, runSongIntelligence } from "@/lib/media/song-intelligence-client";
import { currentDevicePrefersBackend, runBackendSong, songBackendAvailable, type BackendSongJob } from "@/lib/media/song-backend";
import { SongAudioInsights } from "./song-audio-insights";
import { SongBackendInsights } from "./song-backend-insights";
import { SongCopyButton } from "./song-copy-button";
import { SongStemPanel } from "./song-stem-panel";
import { SongLocalModelPanel } from "./song-local-model-panel";
import { SongPlayback } from "./song-playback";
import { MUSIC_AUDIO_EXTENSIONS } from "@/lib/media/music-downloader-policy";
import {
  crc32, inspectSongZip, SONG_ANALYZER_LIMITS, songsToCsv, tempoBandFromBpm,
} from "@/lib/media/song-metadata-analyzer";
import { amplitudeDbfs, estimateBpm, estimateKey, rms } from "@/lib/engines/audio-studio";
import { analyzeMusicDatasetAudio, emptyAnnotations, type MusicDatasetAnalysis, type MusicDatasetAnnotations } from "@/lib/engines/music-dataset-analysis";
import { downloadBlob } from "@/lib/utils";

type Mode = "quick" | "full";
type RowStatus = "queued" | "scanning" | "analyzing" | "done" | "partial" | "failed" | "cancelled";

type SongAnalysisReport = {
  schema_version: "1.2";
  filename: string;
  genre: string | null;
  sub_style: string | null;
  language: string[];
  tempo_bpm: number | null;
  tempo_band: string;
  tempo_source: string | null;
  key: string | null;
  energy: string;
  mood: string[];
  theme: string[];
  setting: string[];
  vocals: string[];
  instruments: string[];
  descriptions: string[];
  identity: Record<string, unknown>;
  technical: Record<string, unknown>;
  embedded_metadata: Record<string, unknown>;
  analysis: Record<string, unknown>;
  lyric_evidence: string;
  warnings: string[];
  dataset_analysis: MusicDatasetAnalysis | null;
  review_annotations: MusicDatasetAnnotations;
  local_model?: LocalSongResult;
  backend_model?: LocalSongResult;
  browser_intelligence?: BrowserSongIntelligence;
  vocal_intelligence?: BrowserSongIntelligence;
};
type SongRow = { id: string; file: File; status: RowStatus; progress: number; report?: SongAnalysisReport; backendJobId?: string; error?: string };

type ClientLimits = {
  maxTrackBytes: number;
  maxBatchBytes: number;
  maxZipBytes: number;
  maxExpandedBytes: number;
};

function getClientLimits(): ClientLimits {
  const memory = typeof navigator !== "undefined"
    ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    : undefined;
  if (memory !== undefined && memory <= 4) {
    return { maxTrackBytes: 30 * 1024 * 1024, maxBatchBytes: 60 * 1024 * 1024, maxZipBytes: 40 * 1024 * 1024, maxExpandedBytes: 80 * 1024 * 1024 };
  }
  if (memory !== undefined && memory <= 8) {
    return { maxTrackBytes: 50 * 1024 * 1024, maxBatchBytes: 120 * 1024 * 1024, maxZipBytes: 75 * 1024 * 1024, maxExpandedBytes: 150 * 1024 * 1024 };
  }
  if (memory !== undefined && memory > 8) {
    return { maxTrackBytes: SONG_ANALYZER_LIMITS.maxTrackBytes, maxBatchBytes: SONG_ANALYZER_LIMITS.maxBatchBytes, maxZipBytes: SONG_ANALYZER_LIMITS.maxZipBytes, maxExpandedBytes: SONG_ANALYZER_LIMITS.maxExpandedBytes };
  }
  return { maxTrackBytes: 40 * 1024 * 1024, maxBatchBytes: 75 * 1024 * 1024, maxZipBytes: 50 * 1024 * 1024, maxExpandedBytes: 100 * 1024 * 1024 };
}

function extensionOf(name: string): string {
  return name.split(/[?#]/, 1)[0]?.split(".").pop()?.toLowerCase() ?? "";
}
function mimeForExtension(ext: string): string {
  const types: Record<string, string> = {
    mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav",
    flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/opus",
    aiff: "audio/aiff", aif: "audio/aiff", wma: "audio/x-ms-wma", webm: "audio/webm",
  };
  return types[ext] ?? "application/octet-stream";
}
function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let amount = bytes / 1024, unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit++; }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[unit]}`;
}
function durationLabel(seconds: unknown): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
function compactNumber(value: unknown, digits = 1): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}
function signalLevels(samples: Float32Array): { peakDbfs: number | null; rmsDbfs: number | null } {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
  const peakDb = amplitudeDbfs(peak);
  const rmsDb = amplitudeDbfs(rms(samples));
  return {
    peakDbfs: Number.isFinite(peakDb) ? compactNumber(peakDb, 2) : null,
    rmsDbfs: Number.isFinite(rmsDb) ? compactNumber(rmsDb, 2) : null,
  };
}

function metadataTags(metadata: MusicMetadata): Record<string, unknown> {
  return {
    title: metadata.title ?? null,
    artist: metadata.artist ?? null,
    album: metadata.album ?? null,
    album_artist: metadata.albumArtist ?? null,
    year: metadata.year ?? null,
    genre: metadata.genre ?? null,
    embedded_bpm: metadata.bpm ?? null,
    track_number: metadata.trackNumber ?? null,
    disc_number: metadata.discNumber ?? null,
    composer: metadata.composer ?? null,
    publisher: metadata.publisher ?? null,
    copyright: metadata.copyright ?? null,
    comment: metadata.comment ?? null,
    artwork_available: Boolean(metadata.artwork),
  };
}
function outputCsvRow(report: SongAnalysisReport): Record<string, unknown> {
  const analysis = report.dataset_analysis;
  const annotations = report.review_annotations;
  return {
    filename: report.filename,
    title: report.identity.title,
    artist: report.identity.artist,
    album: report.identity.album,
    genre: report.genre,
    sub_style: report.sub_style,
    style_influences: annotations?.style_influences ?? [],
    language: report.language,
    tempo_bpm: report.tempo_bpm,
    tempo_band: report.tempo_band,
    key: report.key,
    energy: annotations?.energy ?? [],
    mood: report.mood,
    theme: report.theme,
    setting: report.setting,
    source_role: annotations?.source_role ?? [],
    vocals: report.vocals,
    vocal_delivery: annotations?.vocal_delivery ?? [],
    vocal_register: annotations?.vocal_register ?? [],
    vocal_harmony: annotations?.vocal_harmony ?? [],
    performance_technique: annotations?.performance_technique ?? [],
    instruments: report.instruments,
    production_traits: annotations?.production_traits ?? [],
    arrangement: annotations?.arrangement ?? [],
    duration_seconds: report.technical.duration_seconds,
    file_size_bytes: report.technical.file_size_bytes,
    codec: report.technical.codec,
    sample_rate_hz: report.technical.sample_rate_hz,
    channels: report.technical.channels,
    pitch_lowest_note: analysis?.pitch.lowest_detected_note ?? null,
    pitch_highest_note: analysis?.pitch.highest_detected_note ?? null,
    pitch_range_semitones: analysis?.pitch.pitch_range_semitones ?? null,
    transient_density_per_second: analysis?.rhythm.transient_density_per_second ?? null,
    spectral_centroid_mean_hz: analysis?.timbre.mean_spectral_centroid_hz ?? null,
    low_energy_ratio_mean: analysis?.timbre.mean_low_frequency_energy_ratio ?? null,
    mid_energy_ratio_mean: analysis?.timbre.mean_mid_frequency_energy_ratio ?? null,
    high_energy_ratio_mean: analysis?.timbre.mean_high_frequency_energy_ratio ?? null,
    chord_estimates: analysis?.tonality.chord_estimates.map((item) => `${item.start_seconds}-${item.end_seconds}s:${item.chord ?? "unknown"}`).join(" | ") ?? "",
    section_boundaries: analysis?.structure.change_points.map((item) => `${item.time_seconds}s(${item.change_score})`).join(" | ") ?? "",
    labels_reviewed: annotations?.reviewed ?? false,
    reviewer: annotations?.reviewer ?? "",
    annotation_notes: annotations?.notes ?? "",
    recognized_instruments: report.browser_intelligence?.sound.candidates.instruments.length ? report.browser_intelligence.sound.candidates.instruments.map((item) => item.label) : report.backend_model?.candidates.instruments?.map((item) => item.label) ?? [],
    recognized_genres: report.browser_intelligence?.sound.candidates.genre.length ? report.browser_intelligence.sound.candidates.genre.map((item) => item.label) : report.backend_model?.candidates.genre?.map((item) => item.label) ?? [],
    recognized_speech: report.browser_intelligence?.speech.text || report.backend_model?.lyrics.segments.map((item) => item.text).join(" ") || "",
    vocal_transcript: report.vocal_intelligence?.speech.text ?? "",
    sound_coverage_seconds: report.browser_intelligence?.sound.coverage_seconds ?? null,
    speech_coverage_seconds: report.browser_intelligence?.speech.coverage_seconds ?? null,
    uses_remote_api: report.analysis.uses_remote_api ?? analysis?.processing.uses_remote_api ?? false,
    uses_hosted_model: report.analysis.uses_hosted_model ?? analysis?.processing.uses_hosted_model ?? false,
    analysis_status: report.analysis.status,
    warnings: report.warnings,
  };
}

async function analyzeLocal(
  file: File,
  mode: Mode,
  signal: AbortSignal,
  onDeepProgress?: (fraction: number) => void,
): Promise<{ report: SongAnalysisReport; status: RowStatus }> {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const { metadata, header, fullTags, warnings: parserWarnings } = await readSongFileMetadata(file);
  const warnings: string[] = [...parserWarnings];
  let durationSeconds = header.durationSeconds ?? metadata.durationSeconds ?? null;
  let sampleRateHz = header.sourceSampleRateHz;
  let channels = header.channels;
  let analysisSampleRate: number | null = null;
  let peakDbfs: number | null = null;
  let rmsDbfs: number | null = null;
  let tempoBpm: number | null = null;
  let key: string | null = null;
  let datasetAnalysis: MusicDatasetAnalysis | null = null;
  const bpmTag = metadata.bpm && Number.isFinite(Number(metadata.bpm)) ? Number(metadata.bpm) : null;
  let decodedSuccessfully = false;

  if (!header.container && !file.type.startsWith("audio/")) warnings.push("The file type could not be confirmed from its header.");
  const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const conservativeBitrate = Math.max(32_000, Math.min(header.encodedBitrateBps ?? 64_000, 128_000));
  const preflightDuration = durationSeconds ?? (file.size * 8 / conservativeBitrate);
  const preflightSampleRate = Math.max(header.sourceSampleRateHz ?? 48_000, 48_000);
  const preflightChannels = channels ?? 2;
  const fullRateBytes = preflightDuration * preflightSampleRate * (preflightChannels + 1) * 4;
  const analysisRate = fullRateBytes > 180 * 1024 * 1024 ? 16_000 : undefined;
  const projectedMemoryBytes = preflightDuration * (analysisRate ?? preflightSampleRate) * (preflightChannels + 1) * 4;
  const shouldSkipDecode = !Number.isFinite(projectedMemoryBytes) ||
    preflightDuration > 15 * 60 ||
    projectedMemoryBytes > 180 * 1024 * 1024;
  if (shouldSkipDecode) {
    warnings.push("Estimated decoded audio exceeds the local memory budget; detailed signal analysis was skipped.");
  } else if (!AudioContextConstructor) {
    warnings.push("This browser cannot decode audio for local signal analysis.");
  } else {
    let context: AudioContext | null = null;
    try {
      context = new AudioContextConstructor(analysisRate ? { sampleRate: analysisRate } : undefined);
      if (preflightDuration * context.sampleRate * (preflightChannels + 1) * 4 > 180 * 1024 * 1024) {
        throw new Error("This browser cannot decode the full track within the local memory budget.");
      }
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const data = await file.arrayBuffer();
      const decoded = await context.decodeAudioData(data);
      decodedSuccessfully = true;
      durationSeconds = decoded.duration;
      analysisSampleRate = decoded.sampleRate;
      // The decoder may resample. Unknown source rates must remain unknown.
      if (decoded.duration > 15 * 60) {
        warnings.push("Track is longer than 15 minutes; detailed signal analysis was skipped to protect device memory.");
      } else {
        const memoryBytes = decoded.length * (decoded.numberOfChannels + 1) * 4;
        if (memoryBytes > 180 * 1024 * 1024) {
          warnings.push("Decoded audio exceeds the local memory budget; detailed signal analysis was skipped.");
        } else {
          const decodedChannels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
          const mono = new Float32Array(decoded.length);
          for (const channel of decodedChannels) {
            for (let frame = 0; frame < channel.length; frame += 1) mono[frame] += channel[frame]! / decodedChannels.length;
          }
          const levels = signalLevels(mono);
          peakDbfs = levels.peakDbfs;
          rmsDbfs = levels.rmsDbfs;
          if (mode === "full") {
            datasetAnalysis = await analyzeMusicDatasetAudio(
              { channels: decodedChannels, sampleRate: decoded.sampleRate, fileName: file.name },
              { signal, onProgress: onDeepProgress },
            );
            tempoBpm = datasetAnalysis.rhythm.tempo_bpm;
            key = datasetAnalysis.tonality.key_estimate;
          } else {
            tempoBpm = estimateBpm(mono, decoded.sampleRate);
            key = estimateKey(mono, decoded.sampleRate);
          }
        }
      }
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw new DOMException("Cancelled", "AbortError");
      const message = error instanceof Error ? error.message : "";
      warnings.push(message ? `Audio decode or DSP analysis failed: ${message.slice(0, 180)}` : "Audio decode failed; only embedded tags were read.");
    } finally {
      await context?.close().catch(() => undefined);
    }
  }

  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (!decodedSuccessfully) warnings.push("Embedded tags may still be available, but tempo, key, pitch, chord and timeline analysis need a decodable audio file.");
  const bpmFromTag = bpmTag !== null && bpmTag > 0 && bpmTag <= 300 ? bpmTag : null;
  const finalTempo = tempoBpm ?? bpmFromTag;
  if (tempoBpm !== null && bpmFromTag !== null && Math.abs(tempoBpm - bpmFromTag) > 8) warnings.push("Estimated tempo differs from the embedded BPM tag.");
  const averageBitrate = durationSeconds && durationSeconds > 0 ? (file.size * 8) / durationSeconds : null;
  const embeddedGenre = metadata.genre?.trim() || null;
  const reviewAnnotations = { ...(datasetAnalysis?.annotations ?? emptyAnnotations()), genre: embeddedGenre ? embeddedGenre.split(";").map((value) => value.trim()).filter(Boolean).slice(0, 30) : [] };
  if (datasetAnalysis) datasetAnalysis = { ...datasetAnalysis, annotations: reviewAnnotations };
  const annotations = datasetAnalysis?.annotations;
  const report: SongAnalysisReport = {
    schema_version: "1.2",
    filename: file.name,
    genre: embeddedGenre,
    sub_style: null,
    language: [],
    tempo_bpm: finalTempo === null ? null : Math.round(finalTempo),
    tempo_band: tempoBandFromBpm(finalTempo),
    tempo_source: tempoBpm !== null ? "audio_estimate" : bpmFromTag !== null ? "embedded_tag" : null,
    key,
    energy: "unknown",
    mood: [],
    theme: [],
    setting: [],
    vocals: [],
    instruments: [],
    descriptions: datasetAnalysis?.style_cues.map((cue) => cue.evidence) ?? [],
    lyric_evidence: "",
    identity: {
      title: metadata.title ?? null,
      artist: metadata.artist ?? null,
      album: metadata.album ?? null,
      album_artist: metadata.albumArtist ?? null,
      release_date: metadata.year ?? null,
      artwork_available: Boolean(metadata.artwork),
    },
    technical: {
      container: header.container,
      codec: header.codec,
      extension: extensionOf(file.name),
      mime_type: file.type || mimeForExtension(extensionOf(file.name)),
      duration_seconds: compactNumber(durationSeconds, 3),
      file_size_bytes: file.size,
      bitrate_bps: header.encodedBitrateBps !== null
        ? header.encodedBitrateBps
        : (averageBitrate ? Math.round(averageBitrate) : null),
      bitrate_source: header.encodedBitrateBps !== null
        ? "stream_header"
        : averageBitrate ? "file_size_duration_estimate" : null,
      bitrate_mode: null,
      sample_rate_hz: sampleRateHz,
      analysis_sample_rate_hz: analysisSampleRate,
      bit_depth: header.bitDepth,
      channels,
      channel_layout: channels === 1 ? "mono" : channels === 2 ? "stereo" : channels ? `${channels} channels` : null,
      peak_dbfs: peakDbfs,
      rms_dbfs: rmsDbfs,
    },
    embedded_metadata: { ...metadataTags(metadata), ...fullTags },
    analysis: {
      status: datasetAnalysis ? (annotations?.reviewed ? "full_local_reviewed" : "full_local_needs_review") : mode === "quick" ? "quick_local" : "partial",
      local_audio_decoded: decodedSuccessfully,
      semantic_analysis: "not_run_local_only",
      genre_source: embeddedGenre ? "embedded_tag_unverified" : "manual_annotation_required",
      excerpt_seconds_sent_to_ai: null,
      ai_request_id: null,
      tempo_source: tempoBpm !== null ? "audio_estimate" : bpmFromTag !== null ? "embedded_tag" : "unavailable",
      key_source: key ? "audio_estimate" : "unavailable",
      local_dsp_analysis: datasetAnalysis ? "completed" : "not_completed",
      uses_remote_api: false,
      uses_hosted_model: false,
    },
    dataset_analysis: datasetAnalysis,
    review_annotations: reviewAnnotations,
    warnings: [...new Set(warnings)],
  };
  const status: RowStatus = mode === "quick"
    ? (warnings.length ? "partial" : "done")
    : datasetAnalysis && datasetAnalysis.annotations.reviewed
      ? (warnings.length ? "partial" : "done")
      : "partial";
  return { report, status };
}

function statusLabel(status: RowStatus): string {
  const labels: Record<RowStatus, string> = {
    queued: "Queued", scanning: "Reading tags", analyzing: "Analyzing", done: "Done",
    partial: "Partial", failed: "Failed", cancelled: "Cancelled",
  };
  return labels[status];
}
function statusClass(status: RowStatus): string {
  if (status === "done") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "partial" || status === "failed") return "bg-amber-500/10 text-amber-800 dark:text-amber-300";
  if (status === "analyzing" || status === "scanning") return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return "bg-surface-2 text-muted";
}
function reportTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

type AnnotationListKey = Exclude<keyof MusicDatasetAnnotations, "notes" | "reviewed" | "reviewer">;

const DATASET_ANNOTATION_FIELDS: Array<{ key: AnnotationListKey; label: string; placeholder: string }> = [
  { key: "genre", label: "Genre", placeholder: "Afrobeats, R&B" },
  { key: "sub_style", label: "Sub-style", placeholder: "Afro-pop, Amapiano" },
  { key: "style_influences", label: "Style influences", placeholder: "Highlife, dancehall, soul" },
  { key: "language", label: "Language", placeholder: "Nigerian Pidgin, Yoruba" },
  { key: "energy", label: "Energy", placeholder: "Low, medium, high" },
  { key: "mood", label: "Mood", placeholder: "Celebratory, soulful" },
  { key: "source_role", label: "Audio part / stem role", placeholder: "Full mix, vocals, drums, bass, melody" },
  { key: "vocals", label: "Vocal content", placeholder: "Lead vocal, backing vocals, ad-libs" },
  { key: "vocal_delivery", label: "Vocal delivery", placeholder: "Melodic singing, rap, chant" },
  { key: "vocal_register", label: "Vocal pitch / register", placeholder: "High pitch, low pitch, soprano, alto, tenor, baritone" },
  { key: "vocal_harmony", label: "Vocal harmonies", placeholder: "Doubles, thirds, call-and-response" },
  { key: "performance_technique", label: "Performance techniques", placeholder: "Vibrato, falsetto, melisma, breathy" },
  { key: "instruments", label: "Instruments", placeholder: "Log drum, shakers, synth bass" },
  { key: "themes", label: "Themes", placeholder: "Love, celebration" },
  { key: "listening_scene", label: "Listening scene", placeholder: "Club, road trip" },
  { key: "production_traits", label: "Production traits", placeholder: "Reverb, saturation, sidechain" },
  { key: "arrangement", label: "Arrangement", placeholder: "Intro build, drum drop, instrumental break" },
];

export function SongMetadataAnalyzerEngine() {
  const pickerRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [tracks, setTracks] = useState<SongRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("full");
  const [recognizeAudio, setRecognizeAudio] = useState(true);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [annotationDrafts, setAnnotationDrafts] = useState<Record<string, string>>({});
  const limits = useMemo(getClientLimits, []);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const selected = tracks.find((track) => track.id === selectedId) ?? tracks.find((track) => track.report) ?? tracks[0];
  const readyCount = tracks.filter((track) => track.report).length;

  function saveBackendResult(id: string, job: BackendSongJob) {
    setTracks((previous) => previous.map((item) => {
      if (item.id !== id || !item.report) return item;
      const report = item.report;
      const tempo = report.tempo_bpm ?? job.result.signal.tempo_bpm;
      const key = report.key ?? job.result.signal.key;
      const format = job.result.metadata.format as { tags?: Record<string, unknown> } | undefined;
      const tags = format?.tags ?? {};
      return {
        ...item, status: "partial", progress: 100, backendJobId: job.id,
        report: {
          ...report, tempo_bpm: tempo, tempo_band: tempoBandFromBpm(tempo), tempo_source: report.tempo_source ?? (tempo === null ? null : "backend_audio_estimate"), key,
          identity: { ...report.identity, title: report.identity.title || tags.title || tags.TITLE || null, artist: report.identity.artist || tags.artist || tags.ARTIST || null, album: report.identity.album || tags.album || tags.ALBUM || null },
          technical: { ...report.technical, duration_seconds: report.technical.duration_seconds ?? job.result.signal.duration_seconds },
          embedded_metadata: { ...report.embedded_metadata, backend_ffprobe: job.result.metadata },
          backend_model: job.result, analysis: { ...report.analysis, key_source: report.key ? report.analysis.key_source : key ? "backend_audio_estimate" : "unavailable", semantic_analysis: "backend_audio_models_unreviewed", uses_hosted_model: true, uses_remote_api: true },
        },
      };
    }));
  }

  async function importFiles(items: readonly File[]) {
    if (!items.length || busy || importing) return;
    setImporting(true);
    setError("");
    setNotice("");
    const additions: File[] = [];
    const warnings: string[] = [];
    try {
      for (const file of items) {
        const ext = extensionOf(file.name);
        if (ext === "zip") {
          if (file.size > limits.maxZipBytes) {
            warnings.push(`${file.name}: ZIP exceeds ${bytesLabel(limits.maxZipBytes)}.`);
            continue;
          }
          try {
            const zipBytes = new Uint8Array(await file.arrayBuffer());
            const zipAdditions: File[] = [];
            const inspection = inspectSongZip(zipBytes, {
              maxZipBytes: limits.maxZipBytes,
              maxExpandedBytes: limits.maxExpandedBytes,
              maxTrackBytes: limits.maxTrackBytes,
              maxEntries: SONG_ANALYZER_LIMITS.maxZipEntries,
            });
            const inflated = unzipSync(zipBytes);
            let extractedBytes = 0;
            let accepted = 0;
            for (const entry of inspection.entries) {
              if (entry.isDirectory || !MUSIC_AUDIO_EXTENSIONS.has(extensionOf(entry.name))) continue;
              if (entry.uncompressedSize <= 0) throw new Error("ZIP contains an empty audio track: " + entry.name);
              const data = inflated[entry.name];
              if (!data || data.byteLength !== entry.uncompressedSize) throw new Error("An archive entry failed its size check.");
              if (crc32(data) !== entry.crc32) throw new Error("An archive entry failed its CRC checksum.");
              if (data.byteLength > limits.maxTrackBytes) throw new Error(`${entry.name} exceeds the per-track limit.`);
              extractedBytes += data.byteLength;
              if (extractedBytes > limits.maxExpandedBytes) throw new Error("Expanded audio exceeds the batch limit.");
              if (accepted >= SONG_ANALYZER_LIMITS.maxTracks) throw new Error("A ZIP may contain at most 50 audio tracks.");
              const safeName = entry.name.replace(/\\/g, "/").split("/").filter(Boolean).join(" — ");
              const fileBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
              zipAdditions.push(new File([fileBuffer], safeName, { type: mimeForExtension(extensionOf(entry.name)) }));
              accepted += 1;
            }
            if (!accepted) warnings.push(`${file.name}: no supported audio tracks found.`);
            else {
              additions.push(...zipAdditions);
              warnings.push(`${file.name}: added ${accepted} audio track${accepted === 1 ? "" : "s"}.`);
            }
          } catch (zipError) {
            warnings.push(`${file.name}: ${zipError instanceof Error ? zipError.message : "ZIP could not be read"}`);
          }
          continue;
        }
        if (!MUSIC_AUDIO_EXTENSIONS.has(ext)) {
          warnings.push(`${file.name}: unsupported file type.`);
          continue;
        }
        if (file.size <= 0) {
          warnings.push(`${file.name}: empty file.`);
          continue;
        }
        if (file.size > limits.maxTrackBytes) {
          warnings.push(`${file.name}: file exceeds ${bytesLabel(limits.maxTrackBytes)}.`);
          continue;
        }
        additions.push(file);
      }
      const candidate = [...tracks.map((track) => track.file), ...additions];
      const bytes = candidate.reduce((sum, file) => sum + file.size, 0);
      if (candidate.length > SONG_ANALYZER_LIMITS.maxTracks) {
        throw new Error("A batch can contain at most 50 tracks. Remove a few and try again.");
      }
      if (bytes > limits.maxBatchBytes) {
        throw new Error(`Batch exceeds ${bytesLabel(limits.maxBatchBytes)} on this device.`);
      }
      if (additions.length) {
        const rows = additions.map((file, index): SongRow => ({
          id: `${Date.now().toString(36)}-${index.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          file, status: "queued", progress: 0,
        }));
        setTracks((previous) => [...previous, ...rows]);
        setSelectedId((current) => current ?? rows[0]?.id ?? null);
      }
      setNotice(warnings.slice(0, 3).join(" "));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Files could not be added.");
    } finally {
      setImporting(false);
    }
  }

  async function startAnalysis() {
    if (busy || !tracks.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    setProgress(0);
    setAnnotationDrafts({});
    const controller = new AbortController();
    controllerRef.current = controller;
    let finished = 0;
    let modelWorker: Worker | null = null;
    const queue = [...tracks];
    const backendReady = mode === "full" && recognizeAudio ? await songBackendAvailable(controller.signal) : false;
    setTracks((previous) => previous.map((track) => ({ ...track, status: "queued", progress: 0 })));
    for (const track of queue) {
      if (controller.signal.aborted) break;
      setTracks((previous) => previous.map((item) => item.id === track.id ? { ...item, status: "scanning", progress: 12, error: undefined } : item));
      try {
        setStage("Reading tags and measuring the track");
        setTracks((previous) => previous.map((item) => item.id === track.id ? { ...item, status: "analyzing", progress: 35 } : item));
        const analysis = await analyzeLocal(track.file, mode, controller.signal, (fraction) => {
          const share = mode === "full" && recognizeAudio ? fraction * 0.5 : fraction;
          setTracks((previous) => previous.map((item) => item.id === track.id ? { ...item, progress: 15 + Math.round(share * 80) } : item));
          setProgress(Math.round(((finished + share) / Math.max(1, queue.length)) * 100));
        });
        setTracks((previous) => previous.map((item) => item.id === track.id
          ? { ...item, status: mode === "full" && recognizeAudio ? "analyzing" : analysis.status, progress: mode === "full" && recognizeAudio ? 55 : 100, report: analysis.report }
          : item));
        if (mode === "full" && recognizeAudio) {
          let backendCompleted = false;
          const runBackend = async () => {
            const job = await runBackendSong(track.file, { tagging: true, transcription: true, stems: false, pieces: false, llm: false }, controller.signal, (currentStage, fraction) => {
              setStage(currentStage);
              setTracks((previous) => previous.map((item) => item.id === track.id ? { ...item, progress: 55 + Math.round(fraction * 44) } : item));
              setProgress(Math.round(((finished + 0.5 + fraction * 0.5) / Math.max(1, queue.length)) * 100));
            });
            saveBackendResult(track.id, job);
            backendCompleted = job.result.processing.tagging_coverage === "full_track_10_second_windows" && job.result.lyrics.status === "candidate_transcript";
            if (!backendCompleted) setNotice("Backend processing was partial; trying this device for missing results.");
          };
          if (backendReady && currentDevicePrefersBackend()) {
            try { await runBackend(); }
            catch (backendError) {
              if (controller.signal.aborted) throw backendError;
              setNotice("Backend processing was unavailable; trying this device.");
            }
          }
          if (!backendCompleted) {
          try {
            modelWorker ??= createSongIntelligenceWorker();
            const duration = typeof analysis.report.technical.duration_seconds === "number" ? analysis.report.technical.duration_seconds : null;
            const modelResult = await runSongIntelligence(modelWorker, track.file, duration, controller.signal, (currentStage, fraction) => {
              setStage(currentStage);
              setTracks((previous) => previous.map((item) => item.id === track.id ? { ...item, progress: 55 + Math.round(fraction * 44) } : item));
              setProgress(Math.round(((finished + 0.5 + fraction * 0.5) / Math.max(1, queue.length)) * 100));
            });
            setTracks((previous) => previous.map((item) => item.id === track.id && item.report ? {
              ...item, status: "partial", progress: 100, report: {
                ...item.report, browser_intelligence: modelResult,
                warnings: [...new Set([...item.report.warnings, ...modelResult.warnings])],
                analysis: { ...item.report.analysis, semantic_analysis: "browser_audio_models_unreviewed", uses_browser_audio_models: true },
              },
            } : item));
            if (modelResult.warnings.length) setNotice((current) => current || modelResult.warnings[0]);
            if (backendReady && (modelResult.sound.status === "unavailable" || modelResult.speech.status === "unavailable")) {
              try { await runBackend(); }
              catch (backendError) { if (controller.signal.aborted) throw backendError; setNotice("Some local models and backend processing were unavailable."); }
            }
          } catch (modelError) {
            modelWorker?.terminate();
            modelWorker = null;
            if (controller.signal.aborted || (modelError instanceof Error && modelError.name === "AbortError")) throw modelError;
            if (backendReady) {
              try { await runBackend(); }
              catch (backendError) { if (controller.signal.aborted) throw backendError; }
            }
            if (backendCompleted) continue;
            const warning = modelError instanceof Error ? modelError.message : "On-device speech and sound recognition failed.";
            setTracks((previous) => previous.map((item) => item.id === track.id && item.report ? {
              ...item, status: "partial", progress: 100, report: { ...item.report, warnings: [...new Set([...item.report.warnings, warning])], analysis: { ...item.report.analysis, semantic_analysis: "browser_audio_models_unavailable" } },
            } : item));
            setNotice((current) => current || warning);
          }
          }
        }
        if (analysis.report.warnings.length) {
          setNotice((current) => current || analysis.report.warnings[0] || "");
        }
      } catch (processingError) {
        const cancelled = controller.signal.aborted || (processingError instanceof Error && processingError.name === "AbortError");
        setTracks((previous) => previous.map((item) => item.id === track.id
          ? { ...item, status: cancelled ? "cancelled" : "failed", progress: 100, error: cancelled ? "Cancelled" : processingError instanceof Error ? processingError.message : "This track could not be analyzed." }
          : item));
        if (!cancelled) setNotice((current) => current || `${track.file.name}: track failed; other songs can continue.`);
      } finally {
        finished += 1;
        setProgress(Math.round((finished / queue.length) * 100));
      }
    }
    if (controller.signal.aborted) {
      setTracks((previous) => previous.map((item) => item.status === "queued" ? { ...item, status: "cancelled" } : item));
    }
    modelWorker?.terminate();
    controllerRef.current = null;
    setBusy(false);
    setStage("");
  }

  function cancelAnalysis() {
    controllerRef.current?.abort();
  }
  function removeTrack(id: string) {
    if (busy) return;
    setTracks((previous) => previous.filter((track) => track.id !== id));
    if (selectedId === id) setSelectedId(null);
  }
  function clearAll() {
    if (busy || importing) return;
    setTracks([]);
    setSelectedId(null);
    setNotice("");
    setError("");
    setProgress(0);
    setAnnotationDrafts({});
  }

  function exportJson() {
    const reports = tracks.flatMap((track) => track.report ? [track.report] : []);
    if (!reports.length) return;
    downloadBlob(new Blob([JSON.stringify({ schema_version: "env.song-analysis-export.v2", tracks: reports }, null, 2)], { type: "application/json;charset=utf-8" }), "song-analysis.json");
  }
  function exportCsv() {
    const reports = tracks.flatMap((track) => track.report ? [outputCsvRow(track.report)] : []);
    if (!reports.length) return;
    downloadBlob(new Blob([songsToCsv(reports)], { type: "text/csv;charset=utf-8" }), "song-analysis.csv");
  }
  function exportZip() {
    const reports = tracks.flatMap((track) => track.report ? [track.report] : []);
    if (!reports.length) return;
    const failed = tracks.filter((track) => track.error || track.status === "failed").map((track) => ({ filename: track.file.name, error: track.error ?? "Failed" }));
    const archive: Record<string, Uint8Array> = {
      "song-analysis.json": strToU8(JSON.stringify({ schema_version: "env.song-analysis-export.v2", tracks: reports }, null, 2)),
      "song-analysis.csv": strToU8(songsToCsv(reports.map(outputCsvRow))),
      "processing-issues.json": strToU8(JSON.stringify(failed, null, 2)),
    };
    const zip = zipSync(archive, { level: 6 });
    const zipBuffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    downloadBlob(new Blob([zipBuffer], { type: "application/zip" }), "song-analysis-report.zip");
  }

  const selectedReport = selected?.report;
  const styleTags = selectedReport ? [selectedReport.genre, selectedReport.sub_style, ...reportTags(selectedReport.language)].filter((value): value is string => typeof value === "string" && value.length > 0) : [];
  const progressLabel = busy ? `${progress}%` : `${readyCount} of ${tracks.length} analyzed`;

  function updateSelectedAnnotationList(key: AnnotationListKey, value: string) {
    const targetId = selected?.id;
    if (!targetId) return;
    if (busy) return;
    setAnnotationDrafts((current) => ({ ...current, [`${targetId}:${key}`]: value }));
    const tags = value.split(",").map((tag) => tag.trim().slice(0, 100)).filter(Boolean).slice(0, 30);
    setTracks((previous) => previous.map((track) => {
      if (track.id !== targetId || !track.report) return track;
      const report = track.report;
      const datasetAnalysis = report.dataset_analysis;
      const annotations: MusicDatasetAnnotations = { ...report.review_annotations, [key]: tags, reviewed: false };
      const primaryPatch: Partial<SongAnalysisReport> = {};
      if (key === "genre") primaryPatch.genre = tags[0] ?? null;
      if (key === "sub_style") primaryPatch.sub_style = tags[0] ?? null;
      if (key === "language") primaryPatch.language = tags;
      if (key === "mood") primaryPatch.mood = tags;
      if (key === "vocals") primaryPatch.vocals = tags;
      if (key === "instruments") primaryPatch.instruments = tags;
      if (key === "themes") primaryPatch.theme = tags;
      if (key === "listening_scene") primaryPatch.setting = tags;
      if (key === "energy") primaryPatch.energy = tags[0] ?? "unknown";
      return {
        ...track,
        status: "partial",
        report: {
          ...report,
          ...primaryPatch,
          review_annotations: annotations,
          dataset_analysis: datasetAnalysis ? { ...datasetAnalysis, annotations } : null,
          analysis: { ...report.analysis, status: datasetAnalysis ? "full_local_needs_review" : "tags_needs_review", semantic_analysis: "manual_annotation", [`${key}_source`]: "manual_annotation" },
        },
      };
    }));
  }

  function updateSelectedAnnotationText(key: "notes" | "reviewer", value: string) {
    if (busy) return;
    const targetId = selected?.id;
    if (!targetId) return;
    setTracks((previous) => previous.map((track) => {
      if (track.id !== targetId || !track.report) return track;
      const report = track.report;
      const datasetAnalysis = report.dataset_analysis;
      const annotations = {
        ...report.review_annotations,
        [key]: value,
        reviewed: false,
      };
      return {
        ...track,
        status: "partial",
        report: {
          ...report,
          review_annotations: annotations,
          dataset_analysis: datasetAnalysis ? { ...datasetAnalysis, annotations } : null,
          analysis: { ...report.analysis, status: datasetAnalysis ? "full_local_needs_review" : "tags_needs_review" },
        },
      };
    }));
  }

  function markSelectedReviewed(reviewed: boolean) {
    if (busy) return;
    const targetId = selected?.id;
    if (!targetId) return;
    setTracks((previous) => previous.map((track) => {
      if (track.id !== targetId || !track.report) return track;
      const report = track.report;
      const currentDatasetAnalysis = report.dataset_analysis;
      const annotations = { ...report.review_annotations, reviewed };
      const datasetAnalysis = currentDatasetAnalysis ? {
        ...currentDatasetAnalysis,
        annotations,
      } : null;
      return {
        ...track,
        status: reviewed && !report.warnings.length ? "done" : "partial",
        report: {
          ...report,
          review_annotations: annotations,
          dataset_analysis: datasetAnalysis,
          analysis: { ...report.analysis, status: reviewed ? (datasetAnalysis ? "full_local_reviewed" : "tags_reviewed") : (datasetAnalysis ? "full_local_needs_review" : "tags_needs_review") },
        },
      };
    }));
  }

  function attachLocalResult(result: LocalSongResult) {
    const id = selected?.id;
    setTracks((previous) => previous.map((track) => track.id === id && track.report ? {
      ...track, report: { ...track.report, local_model: result, analysis: { ...track.report.analysis, semantic_analysis: "local_model_unreviewed", uses_local_companion: true, uses_hosted_model: false } },
    } : track));
  }

  function attachVocalResult(result: BrowserSongIntelligence) {
    const id = selected?.id;
    setTracks((previous) => previous.map((track) => track.id === id && track.report ? { ...track, report: { ...track.report, vocal_intelligence: result } } : track));
  }

  function applyLocalSuggestions(tags: Record<string, string[]>, source = "local_model") {
    if (busy) return;
    const id = selected?.id;
    setAnnotationDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${id}:`))));
    setTracks((previous) => previous.map((track) => {
      if (track.id !== id || !track.report) return track;
      const report = track.report;
      const dataset = report.dataset_analysis;
      const valid = Object.fromEntries(Object.entries(tags).filter(([key]) => DATASET_ANNOTATION_FIELDS.some((field) => field.key === key)));
      const annotations = { ...report.review_annotations, ...valid, reviewed: false };
      return { ...track, status: "partial", report: {
        ...report, genre: "genre" in valid ? annotations.genre[0] ?? null : report.genre, sub_style: "sub_style" in valid ? annotations.sub_style[0] ?? null : report.sub_style,
        language: annotations.language, mood: annotations.mood, vocals: annotations.vocals, instruments: annotations.instruments,
        theme: annotations.themes, setting: annotations.listening_scene, energy: annotations.energy[0] ?? "unknown",
        review_annotations: annotations,
        dataset_analysis: dataset ? { ...dataset, annotations } : null,
        analysis: { ...report.analysis, status: dataset ? "full_local_needs_review" : "tags_needs_review", semantic_analysis: `${source}_unreviewed`, ...Object.fromEntries(Object.keys(valid).map((key) => [`${key}_source`, `${source}_suggestion_unreviewed`])) },
      } };
    }));
  }
  return (
    <div className="@container/song mx-auto min-w-0 w-full max-w-6xl space-y-4 overflow-x-clip">
      <div className="grid gap-4 @min-[760px]/song:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="min-w-0 space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div
            role="button" tabIndex={0} aria-label="Add songs or ZIP" aria-disabled={busy || importing}
            onClick={() => !busy && pickerRef.current?.click()}
            onKeyDown={(event) => { if (event.target === event.currentTarget && !busy && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); pickerRef.current?.click(); } }}
            onDragOver={(event) => { event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}
            className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-2/60 px-4 py-6 text-center transition hover:border-accent/60 hover:bg-accent/5"
          >
            <Upload size={23} className="mb-2 text-accent" />
            <strong className="text-sm">Drop songs or a ZIP here</strong>
            <span className="mt-1 text-xs text-muted">MP3, WAV, FLAC, M4A, OGG · browser support varies</span>
            <span className="mt-3 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-fg">{importing ? "Adding…" : "Choose files"}</span>
          </div>
          <input
            ref={pickerRef} type="file" multiple tabIndex={-1}
            accept=".mp3,.m4a,.aac,.wav,.flac,.ogg,.oga,.opus,.aiff,.aif,.wma,.webm,.zip,audio/*,application/zip"
            className="sr-only" aria-label="Audio files"
            disabled={busy || importing}
            onChange={(event) => { void importFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }}
          />

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1">
            <button type="button" disabled={busy} aria-pressed={mode === "quick"} onClick={() => setMode("quick")} className={`rounded-lg px-3 py-2 text-left transition ${mode === "quick" ? "bg-surface shadow-sm" : "text-muted"}`}>
              <span className="block text-sm font-semibold">Quick Scan</span>
              <span className="mt-0.5 block text-[11px]">Tags, BPM, key</span>
            </button>
            <button type="button" disabled={busy} aria-pressed={mode === "full"} onClick={() => setMode("full")} className={`rounded-lg px-3 py-2 text-left transition ${mode === "full" ? "bg-surface shadow-sm" : "text-muted"}`}>
              <span className="block text-sm font-semibold">Full Analysis</span>
              <span className="mt-0.5 block text-[11px]">Pitch, chords, spectrum, structure</span>
            </button>
          </div>

          {mode === "full" && (
            <div className="rounded-xl border border-border bg-surface-2/50 p-3 text-xs leading-5 text-muted">
              <label className="flex items-center gap-2 text-fg"><input type="checkbox" checked={recognizeAudio} disabled={busy} onChange={(event) => setRecognizeAudio(event.currentTarget.checked)} />Recognize speech, instruments and sounds</label>
              <p className="mt-1">Uses this device or the backend automatically. Backend processing uploads the audio; local models download on first use.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void startAnalysis()} disabled={!tracks.length || busy || importing} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <LoaderCircle className="animate-spin" size={16} /> : mode === "full" ? <FileJson size={16} /> : <Activity size={16} />}
              {busy ? "Analyzing…" : mode === "full" ? "Analyze songs" : "Scan songs"}
            </button>
            {busy
              ? <button type="button" onClick={cancelAnalysis} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm"><Pause size={15} /> Stop</button>
              : tracks.length > 0 && <button type="button" onClick={clearAll} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-3 text-sm" aria-label="Clear batch"><X size={16} /></button>}
          </div>
          <p className="text-[11px] text-muted">Results show where each stage was processed.</p>
        </section>

        <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Batch results</h2>
            <span className="text-xs text-muted">{progressLabel}</span>
          </div>
          {busy && stage && <p role="status" className="mt-2 break-words text-xs text-muted">{stage}</p>}
          {busy && <div role="progressbar" aria-label="Batch analysis" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} /></div>}
          {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div>}
          {notice && !error && <div role="status" className="mt-3 rounded-lg bg-surface-2 p-3 text-xs text-muted">{notice}</div>}

          {tracks.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center text-muted">
              <Archive size={25} className="mb-2 opacity-60" />
              <p className="text-sm">Your songs will appear here.</p>
              <p className="mt-1 text-xs">Add files or a ZIP collection to begin.</p>
            </div>
          ) : (
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
              {tracks.map((track) => (
                <div key={track.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${selected?.id === track.id ? "border-accent/50 bg-accent/5" : "border-transparent hover:bg-surface-2"}`}>
                  <button type="button" onClick={() => setSelectedId(track.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <FileAudio size={17} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{track.file.name}</span>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] ${statusClass(track.status)}`}>{statusLabel(track.status)}</span>
                    </span>
                  </button>
                  <span className="shrink-0 text-[10px] text-muted">{bytesLabel(track.file.size)}</span>
                  {!busy && <button type="button" onClick={() => removeTrack(track.id)} aria-label={`Remove ${track.file.name}`} className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"><X size={14} /></button>}
                </div>
              ))}
            </div>
          )}
          {readyCount > 0 && <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
            <button type="button" onClick={exportJson} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-border px-2 text-xs"><FileJson size={14} /> JSON</button>
            <button type="button" onClick={exportCsv} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-border px-2 text-xs"><FileSpreadsheet size={14} /> CSV</button>
            <button type="button" onClick={exportZip} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-border px-2 text-xs"><Download size={14} /> ZIP report</button>
          </div>}
          <p className="mt-2 text-[10px] text-muted">Batch cap: 50 tracks. File and ZIP limits adapt to device memory.</p>
        </section>
      </div>

      {selectedReport && (
        <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">TRACK ANALYSIS</p>
              <h2 className="mt-1 break-words text-base font-semibold">{String(selectedReport.identity.title || selected?.file.name || "Untitled track")}</h2>
              <p className="mt-0.5 truncate text-sm text-muted">{String(selectedReport.identity.artist || "Unknown artist")}{selectedReport.identity.album ? ` · ${String(selectedReport.identity.album)}` : ""}</p>
            </div>
            <SongCopyButton label="track title" value={String(selectedReport.identity.title || selected?.file.name || "")} />
            <SongCopyButton label="track analysis" value={() => JSON.stringify(selectedReport, null, 2)} />
            <span className={`rounded-full px-2.5 py-1 text-xs ${statusClass(selected?.status ?? "queued")}`}>{statusLabel(selected?.status ?? "queued")}</span>
          </div>

          {selected && <SongPlayback key={selected.id} file={selected.file} sections={selectedReport.dataset_analysis?.structure.sections ?? []} />}
          {selected && <SongStemPanel key={`stems-${selected.id}`} file={selected.file} duration={typeof selectedReport.technical.duration_seconds === "number" ? selectedReport.technical.duration_seconds : null} vocalResult={selectedReport.vocal_intelligence} onVocalResult={attachVocalResult} onBackendResult={(job) => saveBackendResult(selected.id, job)} disabled={busy} />}
          {selected && selectedReport.browser_intelligence && <SongAudioInsights result={selectedReport.browser_intelligence} filename={selected.file.name} onApply={(tags) => applyLocalSuggestions(tags, "browser_audio_model")} disabled={busy} />}
          {selected && selectedReport.backend_model && <SongBackendInsights result={selectedReport.backend_model} jobId={selected.backendJobId} onApply={(tags) => applyLocalSuggestions(tags, "backend_audio_model")} disabled={busy} />}
          {selected && <SongLocalModelPanel key={`local-${selected.id}`} file={selected.file} annotations={selectedReport.review_annotations} result={selectedReport.local_model} onResult={attachLocalResult} onApply={(tags) => applyLocalSuggestions(tags)} disabled={busy} />}

          <div className="grid grid-cols-2 gap-2 @min-[600px]/song:grid-cols-4">
            {[
              { label: selectedReport.tempo_source === "audio_estimate" ? "Est. BPM" : selectedReport.tempo_source === "embedded_tag" ? "Tag BPM" : "Tempo", value: selectedReport.tempo_bpm ? `${selectedReport.tempo_bpm} BPM` : "—" },
              { label: selectedReport.analysis.key_source === "audio_estimate" ? "Est. key" : "Key", value: selectedReport.key || "—" },
              { label: "Duration", value: durationLabel(selectedReport.technical.duration_seconds) },
              { label: "Energy", value: selectedReport.energy === "unknown" ? "—" : selectedReport.energy },
            ].map((item) => <div key={item.label} className="min-w-0 rounded-xl bg-surface-2 p-3"><div className="flex items-center justify-between gap-1"><span className="text-[11px] text-muted">{item.label}</span><SongCopyButton label={item.label.toLowerCase()} value={item.value} disabled={item.value === "—"} /></div><strong className="mt-1 block break-words text-sm capitalize">{item.value}</strong></div>)}
          </div>

          <div className="grid gap-4 @min-[680px]/song:grid-cols-2">
            <div className="space-y-3">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-muted">STYLE</p><SongCopyButton label="style" value={styleTags.join(", ")} disabled={!styleTags.length} /></div>
                <div className="flex flex-wrap gap-1.5">
                  {styleTags.map((tag) => <span key={tag} className="max-w-full break-words rounded-full border border-border px-2.5 py-1 text-xs">{tag}</span>)}
                  {!selectedReport.genre && !selectedReport.sub_style && reportTags(selectedReport.language).length === 0 && <span className="text-xs text-muted">No reliable style tags yet.</span>}
                </div>
              </div>
              {([
                ["Mood", selectedReport.mood], ["Themes", selectedReport.theme], ["Listening scene", selectedReport.setting],
                ["Vocals", selectedReport.vocals], ["Instruments", selectedReport.instruments],
              ] as Array<[string, unknown]>).map(([label, value]) => {
                const tags = reportTags(value);
                return <div key={label} className="min-w-0 rounded-lg bg-surface-2 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-muted">{label.toUpperCase()}</p><SongCopyButton label={label.toLowerCase()} value={tags.join(", ")} disabled={!tags.length} /></div><p className="mt-1 break-words text-sm leading-6">{tags.length ? tags.join(" · ") : "—"}</p></div>;
              })}
            </div>
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-semibold text-muted">DESCRIPTIONS</p>
                {selectedReport.descriptions.length
                  ? <div className="space-y-2">{selectedReport.descriptions.map((description, index) => <div key={index} className="flex min-w-0 items-start gap-2 rounded-lg bg-surface-2 p-3"><p className="min-w-0 flex-1 break-words text-sm leading-5">{description}</p><SongCopyButton label={`description ${index + 1}`} value={description} /></div>)}</div>
                  : <p className="text-sm text-muted">Run Full Analysis for local signal descriptions.</p>}
              </div>
              {selectedReport.lyric_evidence && <div><p className="mb-1.5 text-xs font-semibold text-muted">LYRIC NOTES</p><p className="text-sm leading-5">{selectedReport.lyric_evidence}</p></div>}
            </div>
          </div>

          {selectedReport.dataset_analysis ? (
            <>
              <details className="space-y-3 rounded-xl border border-border p-3 sm:p-4">
                <summary className="cursor-pointer text-sm font-semibold">Signal details</summary>
                <div>
                  <p className="text-xs text-muted">Signal estimates · overlapping sounds can affect pitch and chord detection.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 @min-[600px]/song:grid-cols-4">
                  {[
                    ["Pitch span", selectedReport.dataset_analysis.pitch.lowest_detected_note && selectedReport.dataset_analysis.pitch.highest_detected_note ? `${selectedReport.dataset_analysis.pitch.lowest_detected_note}–${selectedReport.dataset_analysis.pitch.highest_detected_note}` : "Unknown"],
                    ["Pitch observations", String(selectedReport.dataset_analysis.pitch.points.length)],
                    ["Chord windows", String(selectedReport.dataset_analysis.tonality.chord_estimates.filter((item) => item.chord).length)],
                    ["Transient rate", selectedReport.dataset_analysis.rhythm.transient_density_per_second == null ? "—" : `${selectedReport.dataset_analysis.rhythm.transient_density_per_second}/s`],
                    ["Crest factor", selectedReport.dataset_analysis.technical.crest_factor_db == null ? "—" : `${selectedReport.dataset_analysis.technical.crest_factor_db} dB`],
                    ["Dynamic range estimate", selectedReport.dataset_analysis.technical.dynamic_range_estimate_db == null ? "—" : `${selectedReport.dataset_analysis.technical.dynamic_range_estimate_db} dB`],
                    ["Low-band energy", selectedReport.dataset_analysis.timbre.mean_low_frequency_energy_ratio == null ? "—" : `${Math.round(selectedReport.dataset_analysis.timbre.mean_low_frequency_energy_ratio * 100)}%`],
                    ["Mid-band energy", selectedReport.dataset_analysis.timbre.mean_mid_frequency_energy_ratio == null ? "—" : `${Math.round(selectedReport.dataset_analysis.timbre.mean_mid_frequency_energy_ratio * 100)}%`],
                    ["High-band energy", selectedReport.dataset_analysis.timbre.mean_high_frequency_energy_ratio == null ? "—" : `${Math.round(selectedReport.dataset_analysis.timbre.mean_high_frequency_energy_ratio * 100)}%`],
                    ["Stereo side/mid", selectedReport.dataset_analysis.technical.stereo_side_to_mid_ratio == null ? "—" : String(selectedReport.dataset_analysis.technical.stereo_side_to_mid_ratio)],
                    ["Feature changes", String(selectedReport.dataset_analysis.structure.change_points.length)],
                    ["Pitch class / key", selectedReport.dataset_analysis.tonality.key_estimate ?? "Unknown"],
                  ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-surface-2 p-2.5"><div className="flex items-center justify-between gap-1"><span className="text-[10px] text-muted">{label}</span><SongCopyButton label={label.toLowerCase()} value={value} disabled={value === "—" || value === "Unknown"} /></div><strong className="mt-1 block break-words text-xs">{value}</strong></div>)}
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-muted">CHORD ESTIMATES</p><SongCopyButton label="chord estimates" value={selectedReport.dataset_analysis.tonality.chord_estimates.map((item) => `${item.start_seconds}–${item.end_seconds}s: ${item.chord ?? "?"}`).join("\n")} disabled={!selectedReport.dataset_analysis.tonality.chord_estimates.length} /></div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedReport.dataset_analysis.tonality.chord_estimates.slice(0, 40).map((item) => <span key={`${item.start_seconds}-${item.chord}`} className="rounded-md border border-border px-2 py-1 text-[11px]">{Math.floor(item.start_seconds)}–{Math.floor(item.end_seconds)}s: {item.chord ?? "?"} {item.confidence == null ? "" : `· score ${item.confidence.toFixed(2)}`}</span>)}
                    {!selectedReport.dataset_analysis.tonality.chord_estimates.length && <span className="text-xs text-muted">No chord windows available.</span>}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-muted">DETECTED PITCHES (FULL MIX ESTIMATE)</p><SongCopyButton label="detected pitches" value={selectedReport.dataset_analysis.pitch.points.map((item) => `${item.time_seconds}s: ${item.note} (${item.frequency_hz} Hz)`).join("\n")} disabled={!selectedReport.dataset_analysis.pitch.points.length} /></div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedReport.dataset_analysis.pitch.points.slice(0, 32).map((item) => <span key={`${item.time_seconds}-${item.note}`} className="rounded-md border border-border px-2 py-1 text-[11px]">{item.time_seconds}s · {item.note} · {item.frequency_hz} Hz</span>)}
                    {!selectedReport.dataset_analysis.pitch.points.length && <span className="text-xs text-muted">No stable dominant pitch was detected.</span>}
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-muted">{selectedReport.dataset_analysis.pitch.note}</p>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-muted">AUTOMATIC SECTION BOUNDARIES</p><SongCopyButton label="section boundaries" value={selectedReport.dataset_analysis.structure.sections.map((section) => `${section.label}: ${durationLabel(section.start_seconds)}–${durationLabel(section.end_seconds)}`).join("\n")} disabled={!selectedReport.dataset_analysis.structure.sections.length} /></div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedReport.dataset_analysis.structure.sections.slice(0, 30).map((section) => <span key={section.label} className="rounded-md border border-border px-2 py-1 text-[11px]">{section.label}: {durationLabel(section.start_seconds)}–{durationLabel(section.end_seconds)}</span>)}
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-muted">{selectedReport.dataset_analysis.structure.note}</p>
                </div>
                <details className="rounded-lg border border-border p-2.5">
                  <summary className="cursor-pointer text-xs font-medium">Time-aligned signal timeline ({selectedReport.dataset_analysis.timeline.length} frames)</summary>
                  <div className="mt-2 flex justify-end"><SongCopyButton label="signal timeline" value={() => JSON.stringify(selectedReport.dataset_analysis?.timeline ?? [], null, 2)} /></div>
                  <div className="mt-2 max-h-72 min-w-0 max-w-full overflow-auto">
                    <table className="w-full min-w-[620px] text-left text-[11px]">
                      <thead><tr className="border-b border-border text-muted"><th className="p-2">Time</th><th className="p-2">RMS dBFS</th><th className="p-2">Centroid Hz</th><th className="p-2">Low</th><th className="p-2">Mid</th><th className="p-2">High</th><th className="p-2">Flux</th></tr></thead>
                      <tbody>{selectedReport.dataset_analysis.timeline.slice(0, 48).map((frame) => <tr key={frame.start_seconds} className="border-b border-border/60"><td className="p-2">{frame.start_seconds}–{frame.end_seconds}s</td><td className="p-2">{frame.rms_dbfs ?? "—"}</td><td className="p-2">{frame.spectral_centroid_hz ?? "—"}</td><td className="p-2">{frame.low_frequency_energy_ratio ?? "—"}</td><td className="p-2">{frame.mid_frequency_energy_ratio ?? "—"}</td><td className="p-2">{frame.high_frequency_energy_ratio ?? "—"}</td><td className="p-2">{frame.spectral_flux ?? "—"}</td></tr>)}</tbody>
                    </table>
                    {selectedReport.dataset_analysis.timeline.length > 48 && <p className="p-2 text-[10px] text-muted">Showing the first 48 frames here. JSON export contains the complete timeline.</p>}
                  </div>
                </details>
                <details className="rounded-lg border border-border p-2.5">
                  <summary className="cursor-pointer text-xs font-medium">Method notes and limitations</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-4 text-muted">{selectedReport.dataset_analysis.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
                  {selectedReport.dataset_analysis.style_cues.map((cue) => <p key={cue.tag} className="mt-2 text-[11px] leading-4"><strong>{cue.tag.replace(/-/g, " ")}</strong> — {cue.evidence}</p>)}
                </details>
              </details>


            </>
          ) : mode === "full" ? (
            <p className="rounded-xl border border-border p-3 text-xs leading-5 text-muted">Detailed browser measurements are unavailable. Review file details or use local AI.</p>
          ) : null}

              <section className="space-y-3 rounded-xl border border-border p-3 sm:p-4">
                <div>
              <h3 className="text-sm font-semibold">Review tags</h3>
                  <p className="mt-1 text-xs text-muted">Comma-separated labels · verify suggestions by listening.</p>
                </div>
                <fieldset disabled={busy} className="grid min-w-0 gap-3 @min-[520px]/song:grid-cols-2 @min-[850px]/song:grid-cols-3">
                  {DATASET_ANNOTATION_FIELDS.filter((field) => ["genre", "sub_style", "language", "energy", "mood", "vocals", "instruments"].includes(field.key)).map((field) => <label key={field.key} className="block min-w-0"><span className="mb-1.5 block text-[11px] font-semibold">{field.label}</span><input className="w-full min-w-0 rounded-lg border border-border bg-bg px-2.5 py-2 text-base outline-none focus:border-accent @min-[520px]/song:text-xs" value={annotationDrafts[`${selected?.id}:${field.key}`] ?? selectedReport.review_annotations[field.key].join(", ")} maxLength={4000} placeholder={field.placeholder} onChange={(event) => updateSelectedAnnotationList(field.key, event.currentTarget.value)} /></label>)}
                </fieldset>
                <details>
                  <summary className="cursor-pointer text-xs font-medium">More tags</summary>
                  <fieldset disabled={busy} className="mt-3 grid min-w-0 gap-3 @min-[520px]/song:grid-cols-2 @min-[850px]/song:grid-cols-3">
                    {DATASET_ANNOTATION_FIELDS.filter((field) => !["genre", "sub_style", "language", "energy", "mood", "vocals", "instruments"].includes(field.key)).map((field) => <label key={field.key} className="block min-w-0"><span className="mb-1.5 block text-[11px] font-semibold">{field.label}</span><input className="w-full min-w-0 rounded-lg border border-border bg-bg px-2.5 py-2 text-base outline-none focus:border-accent @min-[520px]/song:text-xs" value={annotationDrafts[`${selected?.id}:${field.key}`] ?? selectedReport.review_annotations[field.key].join(", ")} maxLength={4000} placeholder={field.placeholder} onChange={(event) => updateSelectedAnnotationList(field.key, event.currentTarget.value)} /></label>)}
                  </fieldset>
                </details>
                <label className="block min-w-0"><span className="mb-1.5 block text-[11px] font-semibold">Annotation notes</span><textarea className="min-h-16 w-full min-w-0 rounded-lg border border-border bg-bg px-2.5 py-2 text-base outline-none focus:border-accent @min-[520px]/song:text-xs" value={selectedReport.review_annotations.notes} maxLength={4000} placeholder="Notes for another reviewer" onChange={(event) => updateSelectedAnnotationText("notes", event.currentTarget.value)} /></label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={busy} checked={selectedReport.review_annotations.reviewed} onChange={(event) => markSelectedReviewed(event.currentTarget.checked)} />Tags reviewed</label>
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">Reviewer <input className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 py-2 text-base text-fg @min-[520px]/song:text-xs" value={selectedReport.review_annotations.reviewer ?? ""} maxLength={100} placeholder="Name or initials" onChange={(event) => updateSelectedAnnotationText("reviewer", event.currentTarget.value)} /></label>
                </div>
              </section>

          <details className="rounded-xl border border-border px-3 py-2.5">
            <summary className="cursor-pointer text-sm font-medium">Embedded tags</summary>
            <div className="mt-2 flex items-center justify-between gap-2"><p className="text-xs text-muted">File tags are unverified. Binary artwork is omitted from JSON.</p><SongCopyButton label="embedded tags" value={() => JSON.stringify(selectedReport.embedded_metadata, null, 2)} /></div>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px]">{JSON.stringify(selectedReport.embedded_metadata, null, 2)}</pre>
          </details>
          <details className="rounded-xl border border-border px-3 py-2.5">
            <summary className="cursor-pointer text-sm font-medium">File details</summary>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs @min-[520px]/song:grid-cols-3">
              {([
                ["Format", selectedReport.technical.container || selectedReport.technical.extension || "—"],
                ["Codec", selectedReport.technical.codec || "Unknown"],
                ["Size", bytesLabel(Number(selectedReport.technical.file_size_bytes) || 0)],
                ["Sample rate", selectedReport.technical.sample_rate_hz ? `${Math.round(Number(selectedReport.technical.sample_rate_hz) / 100) / 10} kHz` : "Unknown"],
                ["Bit depth", selectedReport.technical.bit_depth ? `${selectedReport.technical.bit_depth}-bit` : "Unknown"],
                ["Channels", selectedReport.technical.channel_layout || "Unknown"],
                ["Average bitrate", selectedReport.technical.bitrate_bps ? `${Math.round(Number(selectedReport.technical.bitrate_bps) / 1000)} kbps` : "Unknown"],
                ["Peak", selectedReport.technical.peak_dbfs != null ? `${selectedReport.technical.peak_dbfs} dBFS` : "—"],
                ["RMS", selectedReport.technical.rms_dbfs != null ? `${selectedReport.technical.rms_dbfs} dBFS` : "—"],
              ] as Array<[string, unknown]>).map(([label, value]) => <div key={label} className="min-w-0"><div className="flex items-center justify-between gap-1"><span className="text-muted">{label}</span><SongCopyButton label={label.toLowerCase()} value={String(value)} disabled={value === "—" || value === "Unknown"} /></div><span className="mt-1 block break-words font-medium">{String(value)}</span></div>)}
            </div>
            {selectedReport.warnings.length > 0 && <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"><p className="font-semibold">Notes</p><ul className="mt-1 list-disc space-y-1 pl-4">{selectedReport.warnings.slice(0, 5).map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
          </details>
        </section>
      )}
    </div>
  );
}
