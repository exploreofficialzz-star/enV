import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, Archive, AudioLines, CheckCircle2, Download,
  FileAudio, FileJson, FileSpreadsheet, LoaderCircle, Music2, Pause, Sparkles,
  Upload, X,
} from "lucide-react";
import { strToU8, unzipSync, zipSync } from "fflate";
import { extractMusicMetadata, type MusicMetadata } from "@/lib/media/music-metadata";
import { MUSIC_AUDIO_EXTENSIONS } from "@/lib/media/music-downloader-policy";
import {
  inspectAudioHeader, inspectSongZip, SONG_ANALYZER_LIMITS, songsToCsv, tempoBandFromBpm,
} from "@/lib/media/song-metadata-analyzer";
import { amplitudeDbfs, estimateBpm, estimateKey, rms } from "@/lib/engines/audio-studio";
import { bytesToBase64, fetchAiAvailability, runAiTask } from "@/lib/ai/client/ai-client";
import type { MusicAnalysisResult } from "@/lib/ai/contracts";
import { downloadBlob } from "@/lib/utils";

type Mode = "quick" | "full";
type RowStatus = "queued" | "scanning" | "analyzing" | "done" | "partial" | "failed" | "cancelled";

type SongAnalysisReport = {
  schema_version: "1.0";
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
};
type SongRow = { id: string; file: File; status: RowStatus; progress: number; report?: SongAnalysisReport; error?: string };

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

function createMusicSampleWav(buffer: AudioBuffer): { bytes: Uint8Array; durationSeconds: number } {
  const targetRate = 16_000;
  const sectionSeconds = Math.min(20, Math.max(1, buffer.duration / 3));
  const starts = [
    0,
    Math.max(0, buffer.duration / 2 - sectionSeconds / 2),
    Math.max(0, buffer.duration - sectionSeconds),
  ];
  const sectionSamples = Math.max(1, Math.floor(sectionSeconds * targetRate));
  const gapSamples = Math.floor(targetRate * 0.25);
  const frameCount = sectionSamples * starts.length + gapSamples * (starts.length - 1);
  const dataBytes = frameCount * 2;
  const wav = new Uint8Array(44 + dataBytes);
  const view = new DataView(wav.buffer);
  const writeText = (offset: number, text: string) => { for (let i = 0; i < text.length; i += 1) wav[offset + i] = text.charCodeAt(i); };
  writeText(0, "RIFF"); view.setUint32(4, 36 + dataBytes, true); writeText(8, "WAVE");
  writeText(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); writeText(36, "data"); view.setUint32(40, dataBytes, true);

  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  let outIndex = 0;
  for (let section = 0; section < starts.length; section += 1) {
    const startFrame = Math.floor(starts[section] * buffer.sampleRate);
    for (let i = 0; i < sectionSamples; i += 1) {
      const sourceOffset = startFrame + (i * buffer.sampleRate) / targetRate;
      const a = Math.min(buffer.length - 1, Math.max(0, Math.floor(sourceOffset)));
      const b = Math.min(buffer.length - 1, a + 1);
      const fraction = sourceOffset - a;
      let sample = 0;
      for (const channel of channels) sample += channel[a] + (channel[b] - channel[a]) * fraction;
      sample /= channels.length || 1;
      const clipped = Math.max(-1, Math.min(1, sample));
      view.setInt16(44 + outIndex * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
      outIndex += 1;
    }
    if (section < starts.length - 1) outIndex += gapSamples;
  }
  return { bytes: wav, durationSeconds: frameCount / targetRate };
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
  return {
    filename: report.filename,
    title: report.identity.title,
    artist: report.identity.artist,
    album: report.identity.album,
    genre: report.genre,
    sub_style: report.sub_style,
    language: report.language,
    tempo_bpm: report.tempo_bpm,
    tempo_band: report.tempo_band,
    key: report.key,
    energy: report.energy,
    mood: report.mood,
    theme: report.theme,
    setting: report.setting,
    vocals: report.vocals,
    instruments: report.instruments,
    duration_seconds: report.technical.duration_seconds,
    file_size_bytes: report.technical.file_size_bytes,
    codec: report.technical.codec,
    sample_rate_hz: report.technical.sample_rate_hz,
    channels: report.technical.channels,
    analysis_status: report.analysis.status,
    warnings: report.warnings,
  };
}

async function analyzeLocal(
  file: File,
  mode: Mode,
  includeAi: boolean,
  signal: AbortSignal,
): Promise<{ report: SongAnalysisReport; status: RowStatus }> {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  let metadata: MusicMetadata;
  let header: ReturnType<typeof inspectAudioHeader>;
  {
    const bytes = new Uint8Array(await file.arrayBuffer());
    metadata = extractMusicMetadata(bytes, file.name);
    header = inspectAudioHeader(bytes);
  }
  const warnings: string[] = [];
  let durationSeconds = header.durationSeconds ?? metadata.durationSeconds ?? null;
  let sampleRateHz = header.sourceSampleRateHz;
  let channels = header.channels;
  let analysisSampleRate: number | null = null;
  let peakDbfs: number | null = null;
  let rmsDbfs: number | null = null;
  let tempoBpm: number | null = null;
  let key: string | null = null;
  let bpmTag = metadata.bpm && Number.isFinite(Number(metadata.bpm)) ? Number(metadata.bpm) : null;
  let semantic: MusicAnalysisResult | null = null;
  let aiRequestId: string | null = null;
  let aiWarning: string | null = null;
  let decodedSuccessfully = false;
  let sampleDurationSeconds: number | null = null;

  if (!header.container && !file.type.startsWith("audio/")) warnings.push("The file type could not be confirmed from its header.");
  const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    warnings.push("This browser cannot decode audio for tempo/key analysis.");
  } else {
    const context = new AudioContextConstructor();
    try {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const data = await file.arrayBuffer();
      const decoded = await context.decodeAudioData(data);
      decodedSuccessfully = true;
      durationSeconds = decoded.duration;
      analysisSampleRate = decoded.sampleRate;
      channels ??= decoded.numberOfChannels;
      if (decoded.duration > 15 * 60) {
        warnings.push("Track is longer than 15 minutes; signal analysis was skipped to protect device memory.");
      } else {
        const memoryBytes = decoded.length * decoded.numberOfChannels * 4;
        if (memoryBytes > 180 * 1024 * 1024) {
          warnings.push("Decoded audio exceeds the local memory budget; tempo/key analysis was skipped.");
        } else {
          const primaryChannel = decoded.getChannelData(0);
          const levels = signalLevels(primaryChannel);
          peakDbfs = levels.peakDbfs;
          rmsDbfs = levels.rmsDbfs;
          tempoBpm = estimateBpm(primaryChannel, decoded.sampleRate);
          key = estimateKey(primaryChannel, decoded.sampleRate);
          if (includeAi && mode === "full") {
            const excerpt = createMusicSampleWav(decoded);
            sampleDurationSeconds = excerpt.durationSeconds;
            if (excerpt.bytes.byteLength > 2_800_000) {
              aiWarning = "The sampled audio is too large for the current AI request limit.";
            } else {
              try {
                const response = await runAiTask("audio.music.analyze", {
                  audioBase64: bytesToBase64(excerpt.bytes),
                  mimeType: "audio/wav",
                  filename: file.name.slice(0, 120),
                  sampledSeconds: excerpt.durationSeconds,
                }, { signal, timeoutMs: 90_000 });
                semantic = response.result;
                aiRequestId = response.meta.requestId || null;
                warnings.push(...response.meta.warnings);
              } catch (error) {
                if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
                aiWarning = error instanceof Error ? error.message : "AI analysis could not be completed.";
              }
            }
          }
        }
      }
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw new DOMException("Cancelled", "AbortError");
      const message = error instanceof Error ? error.message : "";
      warnings.push(message ? `Audio decode failed: ${message.slice(0, 180)}` : "Audio decode failed; only available tags were read.");
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  if (mode === "full" && includeAi && !semantic && !aiWarning) aiWarning = "Full AI analysis did not return a result.";
  if (mode === "full" && !includeAi) aiWarning = "AI analysis was not enabled.";
  if (aiWarning) warnings.push(aiWarning);
  if (!decodedSuccessfully) warnings.push("Technical and embedded tags may still be available, but BPM/key and semantic audio analysis need a decodable file.");
  const bpmFromTag = bpmTag !== null && bpmTag > 0 && bpmTag <= 300 ? bpmTag : null;
  const finalTempo = tempoBpm ?? bpmFromTag;
  if (tempoBpm !== null && bpmFromTag !== null && Math.abs(tempoBpm - bpmFromTag) > 8) {
    warnings.push("Estimated tempo differs from the embedded BPM tag.");
  }
  const averageBitrate = durationSeconds && durationSeconds > 0 ? (file.size * 8) / durationSeconds : null;
  const embeddedGenre = metadata.genre?.trim() || null;
  const report: SongAnalysisReport = {
    schema_version: "1.0",
    filename: file.name,
    genre: semantic?.genre ?? embeddedGenre,
    sub_style: semantic?.sub_style ?? null,
    language: semantic?.language ?? [],
    tempo_bpm: finalTempo === null ? null : Math.round(finalTempo),
    tempo_band: tempoBandFromBpm(finalTempo),
    tempo_source: tempoBpm !== null ? "audio_estimate" : bpmFromTag !== null ? "embedded_tag" : null,
    key,
    energy: semantic?.energy ?? "unknown",
    mood: semantic?.mood ?? [],
    theme: semantic?.theme ?? [],
    setting: semantic?.setting ?? [],
    vocals: semantic?.vocals ?? [],
    instruments: semantic?.instruments ?? [],
    descriptions: semantic?.descriptions ?? [],
    lyric_evidence: semantic?.lyric_evidence ?? "",
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
      bitrate_bps: header.encodedBitrateBps ?? (averageBitrate ? Math.round(averageBitrate) : null),
      bitrate_source: header.encodedBitrateBps !== null ? "stream_header" : averageBitrate ? "file_size_duration_estimate" : null,
      bitrate_mode: null,
      sample_rate_hz: sampleRateHz,
      analysis_sample_rate_hz: analysisSampleRate,
      bit_depth: header.bitDepth,
      channels,
      channel_layout: channels === 1 ? "mono" : channels === 2 ? "stereo" : channels ? `${channels} channels` : null,
      peak_dbfs: peakDbfs,
      rms_dbfs: rmsDbfs,
    },
    embedded_metadata: metadataTags(metadata),
    analysis: {
      status: semantic ? "full" : mode === "quick" ? "quick" : "partial",
      local_audio_decoded: decodedSuccessfully,
      semantic_analysis: semantic ? "completed" : mode === "quick" ? "skipped_by_choice" : "unavailable",
      excerpt_seconds_sent_to_ai: sampleDurationSeconds,
      ai_request_id: aiRequestId,
      tempo_source: tempoBpm !== null ? "audio_estimate" : bpmFromTag !== null ? "embedded_tag" : "unavailable",
      key_source: key ? "audio_estimate" : "unavailable",
    },
    warnings: [...new Set(warnings)],
  };
  const status: RowStatus = semantic || mode === "quick" ? (warnings.length ? "partial" : "done") : "partial";
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
  if (status === "partial" || status === "failed") return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "analyzing" || status === "scanning") return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return "bg-surface-2 text-muted-foreground";
}
function reportTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function SongMetadataAnalyzerEngine() {
  const pickerRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [tracks, setTracks] = useState<SongRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("quick");
  const [aiConsent, setAiConsent] = useState(false);
  const [aiAvailability, setAiAvailability] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const limits = useMemo(getClientLimits, []);

  useEffect(() => {
    let alive = true;
    fetchAiAvailability().then((availability) => {
      if (alive) setAiAvailability(availability["audio.music.analyze"] === true);
    }).catch(() => { if (alive) setAiAvailability(false); });
    return () => { alive = false; };
  }, []);

  const selected = tracks.find((track) => track.id === selectedId) ?? tracks.find((track) => track.report) ?? tracks[0];
  const readyCount = tracks.filter((track) => track.report).length;
  const totalBytes = tracks.reduce((sum, track) => sum + track.file.size, 0);

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
              const data = inflated[entry.name];
              if (!data || data.byteLength !== entry.uncompressedSize) throw new Error("An archive entry failed its size check.");
              if (data.byteLength > limits.maxTrackBytes) throw new Error(`${entry.name} exceeds the per-track limit.`);
              extractedBytes += data.byteLength;
              if (extractedBytes > limits.maxExpandedBytes) throw new Error("Expanded audio exceeds the batch limit.");
              const safeName = entry.name.replace(/\\/g, "/").split("/").filter(Boolean).join(" — ");
              additions.push(new File([data], safeName, { type: mimeForExtension(extensionOf(entry.name)) }));
              accepted += 1;
              if (accepted > SONG_ANALYZER_LIMITS.maxTracks) throw new Error("A ZIP may contain at most 50 audio tracks.");
            }
            if (!accepted) warnings.push(`${file.name}: no supported audio tracks found.`);
            else warnings.push(`${file.name}: added ${accepted} audio track${accepted === 1 ? "" : "s"}.`);
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
    if (mode === "full" && !aiConsent) {
      setError("Confirm AI processing before Full Analysis.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setProgress(0);
    const controller = new AbortController();
    controllerRef.current = controller;
    let finished = 0;
    const queue = [...tracks];
    for (const track of queue) {
      if (controller.signal.aborted) break;
      setTracks((previous) => previous.map((item) => item.id === track.id ? { ...item, status: "scanning", progress: 12, error: undefined } : item));
      try {
        setTracks((previous) => previous.map((item) => item.id === track.id ? { ...item, status: "analyzing", progress: 35 } : item));
        const includeAi = mode === "full" && aiConsent && aiAvailability === true;
        const analysis = await analyzeLocal(track.file, mode, includeAi, controller.signal);
        setTracks((previous) => previous.map((item) => item.id === track.id
          ? { ...item, status: analysis.status, progress: 100, report: analysis.report }
          : item));
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
    controllerRef.current = null;
    setBusy(false);
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
  }

  function exportJson() {
    const reports = tracks.flatMap((track) => track.report ? [track.report] : []);
    if (!reports.length) return;
    downloadBlob(new Blob([JSON.stringify({ schema_version: "1.0", tracks: reports }, null, 2)], { type: "application/json;charset=utf-8" }), "song-analysis.json");
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
      "song-analysis.json": strToU8(JSON.stringify({ schema_version: "1.0", tracks: reports }, null, 2)),
      "song-analysis.csv": strToU8(songsToCsv(reports.map(outputCsvRow))),
      "processing-issues.json": strToU8(JSON.stringify(failed, null, 2)),
    };
    zipSync(archive, { level: 6 });
    const zip = zipSync(archive, { level: 6 });
    downloadBlob(new Blob([zip], { type: "application/zip" }), "song-analysis-report.zip");
  }

  const selectedReport = selected?.report;
  const progressLabel = busy ? `${progress}%` : `${readyCount} of ${tracks.length} analyzed`;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Music2 size={23} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Song Metadata Analyzer</h1>
          <p className="text-sm text-muted-foreground">Understand the sound behind each track.</p>
        </div>
        {tracks.length > 0 && <span className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted-foreground">{tracks.length} track{tracks.length === 1 ? "" : "s"}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div
            role="button" tabIndex={0}
            onClick={() => !busy && pickerRef.current?.click()}
            onKeyDown={(event) => { if (!busy && (event.key === "Enter" || event.key === " ")) pickerRef.current?.click(); }}
            onDragOver={(event) => { event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}
            className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-2/60 px-4 py-6 text-center transition hover:border-primary/60 hover:bg-primary/5"
          >
            <Upload size={23} className="mb-2 text-primary" />
            <strong className="text-sm">Drop songs or a ZIP here</strong>
            <span className="mt-1 text-xs text-muted-foreground">MP3, WAV, FLAC, M4A, OGG and more</span>
            <input
              ref={pickerRef} type="file" multiple
              accept=".mp3,.m4a,.aac,.wav,.flac,.ogg,.oga,.opus,.aiff,.aif,.wma,.webm,.zip,audio/*,application/zip"
              className="sr-only"
              disabled={busy || importing}
              onChange={(event) => { void importFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }}
            />
            <span className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">{importing ? "Adding…" : "Choose files"}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1">
            <button type="button" disabled={busy} onClick={() => setMode("quick")} className={`rounded-lg px-3 py-2 text-left transition ${mode === "quick" ? "bg-surface shadow-sm" : "text-muted-foreground"}`}>
              <span className="block text-sm font-semibold">Quick Scan</span>
              <span className="mt-0.5 block text-[11px]">Tags, BPM, key</span>
            </button>
            <button type="button" disabled={busy} onClick={() => setMode("full")} className={`rounded-lg px-3 py-2 text-left transition ${mode === "full" ? "bg-surface shadow-sm" : "text-muted-foreground"}`}>
              <span className="block text-sm font-semibold">Full Analysis</span>
              <span className="mt-0.5 block text-[11px]">Genre, mood, vocals</span>
            </button>
          </div>

          {mode === "full" && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 accent-primary" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} disabled={busy} />
                <span>Send short song excerpts to AI for music understanding.</span>
              </label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`size-2 rounded-full ${aiAvailability === true ? "bg-emerald-500" : aiAvailability === false ? "bg-amber-500" : "bg-muted-foreground/50"}`} />
                {aiAvailability === true ? "AI available" : aiAvailability === false ? "AI not configured · Quick Scan still works" : "Checking AI setup…"}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void startAnalysis()} disabled={!tracks.length || busy || importing || (mode === "full" && !aiConsent)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <LoaderCircle className="animate-spin" size={16} /> : mode === "full" ? <Sparkles size={16} /> : <Activity size={16} />}
              {busy ? "Analyzing…" : mode === "full" ? "Analyze with AI" : "Scan songs"}
            </button>
            {busy
              ? <button type="button" onClick={cancelAnalysis} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm"><Pause size={15} /> Stop</button>
              : tracks.length > 0 && <button type="button" onClick={clearAll} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-3 text-sm" title="Clear batch"><X size={16} /></button>}
          </div>
          <p className="text-[11px] text-muted-foreground">Files stay on your device unless you enable Full Analysis.</p>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Batch results</h2>
            <span className="text-xs text-muted-foreground">{progressLabel}</span>
          </div>
          {busy && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>}
          {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div>}
          {notice && !error && <div role="status" className="mt-3 rounded-lg bg-surface-2 p-3 text-xs text-muted-foreground">{notice}</div>}

          {tracks.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center text-muted-foreground">
              <Archive size={25} className="mb-2 opacity-60" />
              <p className="text-sm">Your songs will appear here.</p>
              <p className="mt-1 text-xs">Add files or a ZIP collection to begin.</p>
            </div>
          ) : (
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
              {tracks.map((track) => (
                <div key={track.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${selected?.id === track.id ? "border-primary/50 bg-primary/5" : "border-transparent hover:bg-surface-2"}`}>
                  <button type="button" onClick={() => setSelectedId(track.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <FileAudio size={17} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{track.file.name}</span>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] ${statusClass(track.status)}`}>{statusLabel(track.status)}</span>
                    </span>
                  </button>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{bytesLabel(track.file.size)}</span>
                  {!busy && <button type="button" onClick={() => removeTrack(track.id)} aria-label={`Remove ${track.file.name}`} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"><X size={14} /></button>}
                </div>
              ))}
            </div>
          )}
          {readyCount > 0 && <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
            <button type="button" onClick={exportJson} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-border px-2 text-xs"><FileJson size={14} /> JSON</button>
            <button type="button" onClick={exportCsv} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-border px-2 text-xs"><FileSpreadsheet size={14} /> CSV</button>
            <button type="button" onClick={exportZip} className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-border px-2 text-xs"><Download size={14} /> ZIP report</button>
          </div>}
          <p className="mt-2 text-[10px] text-muted-foreground">Batch cap: 50 tracks. File and ZIP limits adapt to device memory.</p>
        </section>
      </div>

      {selectedReport && (
        <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">TRACK ANALYSIS</p>
              <h2 className="mt-1 break-words text-base font-semibold">{String(selectedReport.identity.title || selected?.file.name || "Untitled track")}</h2>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{String(selectedReport.identity.artist || "Unknown artist")}{selectedReport.identity.album ? ` · ${String(selectedReport.identity.album)}` : ""}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs ${statusClass(selected?.status ?? "queued")}`}>{statusLabel(selected?.status ?? "queued")}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Tempo", value: selectedReport.tempo_bpm ? `${selectedReport.tempo_bpm} BPM` : "—" },
              { label: "Key", value: selectedReport.key || "—" },
              { label: "Duration", value: durationLabel(selectedReport.technical.duration_seconds) },
              { label: "Energy", value: selectedReport.energy === "unknown" ? "—" : selectedReport.energy },
            ].map((item) => <div key={item.label} className="rounded-xl bg-surface-2 p-3"><span className="block text-[11px] text-muted-foreground">{item.label}</span><strong className="mt-1 block truncate text-sm capitalize">{item.value}</strong></div>)}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">STYLE</p>
                <div className="flex flex-wrap gap-1.5">
                  {[selectedReport.genre, selectedReport.sub_style, ...reportTags(selectedReport.language)].filter((v): v is string => typeof v === "string" && v.length > 0).map((tag) => <span key={tag} className="rounded-full border border-border px-2.5 py-1 text-xs">{tag}</span>)}
                  {!selectedReport.genre && !selectedReport.sub_style && reportTags(selectedReport.language).length === 0 && <span className="text-xs text-muted-foreground">No reliable style tags yet.</span>}
                </div>
              </div>
              {([
                ["Mood", selectedReport.mood], ["Themes", selectedReport.theme], ["Listening scene", selectedReport.setting],
                ["Vocals", selectedReport.vocals], ["Instruments", selectedReport.instruments],
              ] as Array<[string, unknown]>).map(([label, value]) => {
                const tags = reportTags(value);
                return <div key={label}><p className="mb-1.5 text-xs font-semibold text-muted-foreground">{label.toUpperCase()}</p><p className="text-sm leading-6">{tags.length ? tags.join(" · ") : "—"}</p></div>;
              })}
            </div>
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">DESCRIPTIONS</p>
                {selectedReport.descriptions.length
                  ? <div className="space-y-2">{selectedReport.descriptions.map((description, index) => <p key={index} className="rounded-lg bg-surface-2 p-3 text-sm leading-5">{description}</p>)}</div>
                  : <p className="text-sm text-muted-foreground">Run Full Analysis to generate song descriptions.</p>}
              </div>
              {selectedReport.lyric_evidence && <div><p className="mb-1.5 text-xs font-semibold text-muted-foreground">LYRIC NOTES</p><p className="text-sm leading-5">{selectedReport.lyric_evidence}</p></div>}
            </div>
          </div>

          <details className="rounded-xl border border-border px-3 py-2.5">
            <summary className="cursor-pointer text-sm font-medium">File details</summary>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3">
              {[
                ["Format", selectedReport.technical.container || selectedReport.technical.extension || "—"],
                ["Codec", selectedReport.technical.codec || "Unknown"],
                ["Size", bytesLabel(Number(selectedReport.technical.file_size_bytes) || 0)],
                ["Sample rate", selectedReport.technical.sample_rate_hz ? `${Math.round(Number(selectedReport.technical.sample_rate_hz) / 100) / 10} kHz` : "Unknown"],
                ["Bit depth", selectedReport.technical.bit_depth ? `${selectedReport.technical.bit_depth}-bit` : "Unknown"],
                ["Channels", selectedReport.technical.channel_layout || "Unknown"],
                ["Average bitrate", selectedReport.technical.bitrate_bps ? `${Math.round(Number(selectedReport.technical.bitrate_bps) / 1000)} kbps` : "Unknown"],
                ["Peak", selectedReport.technical.peak_dbfs != null ? `${selectedReport.technical.peak_dbfs} dBFS` : "—"],
                ["RMS", selectedReport.technical.rms_dbfs != null ? `${selectedReport.technical.rms_dbfs} dBFS` : "—"],
              ].map(([label, value]) => <div key={label}><span className="block text-muted-foreground">{label}</span><span className="mt-1 block break-words font-medium">{String(value)}</span></div>)}
            </div>
            {selectedReport.warnings.length > 0 && <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"><p className="font-semibold">Notes</p><ul className="mt-1 list-disc space-y-1 pl-4">{selectedReport.warnings.slice(0, 5).map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
          </details>
        </section>
      )}
    </div>
  );
}
