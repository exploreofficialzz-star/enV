import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AudioLines, FileAudio, FileJson, FolderArchive, LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { strToU8, zipSync } from "fflate";
import { downloadBlob } from "@/lib/utils";
import type { MusicAnalysisResult } from "@/lib/engines/music-analysis";
import { createLocalSignalLayers, encodeMonoPcm16Wav, type MusicDatasetAnalysis, type MusicDatasetAnnotations } from "@/lib/engines/music-dataset-analysis";
import { extractMusicMetadata } from "@/lib/media/music-metadata";
import { createMusicAnalysisProfile } from "@/lib/media/music-analysis-profile";
import { analyzeMusicInWorker } from "@/lib/media/music-analysis.worker-client";
import { createServerMediaAdapter, getServerMediaConfig } from "@/lib/media/media-backends";
import type { MediaJobRequest } from "@/lib/media/media-runtime";
import { apiUrl } from "@/lib/api/base";
import { parseMusicLoudnessReport, verifyMusicLoudnessReportChecksum, type MusicLoudnessReport } from "@/lib/media/music-loudness-report";
import {
  assertLocalDecodedPcmBudget,
  createLocalMusicBatch,
  countLocalMusicBatchItems,
  deleteLocalMusicBatch,
  finalizeLocalMusicBatch,
  listLocalMusicBatches,
  localMusicBatchExport,
  recoverLocalMusicBatch,
  saveLocalMusicBatch,
  transitionLocalMusicBatchItem,
  updateLocalMusicBatchItem,
  type LocalMusicBatch,
  type LocalMusicFileDescriptor,
} from "@/lib/media/music-analysis-batch";

const LOCAL_FILE_LIMIT = 25 * 1024 * 1024;
const MAX_AUDIO_DURATION_SECONDS = 2 * 60;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return hours > 0
    ? [hours, String(minutes).padStart(2, "0"), String(secs).padStart(2, "0")].join(":")
    : [minutes, String(secs).padStart(2, "0")].join(":");
}

function displayNumber(value: number | null, suffix = ""): string {
  return value === null || !Number.isFinite(value) ? "Not available" : String(value) + suffix;
}

async function probeAudioDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  const media = document.createElement("audio");
  media.preload = "metadata";
  let timeout: number | undefined;
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const finish = (callback: (value: number | Error) => void, value: number | Error) => {
        if (timeout !== undefined) window.clearTimeout(timeout);
        media.onloadedmetadata = null;
        media.onerror = null;
        callback(value);
      };
      media.onloadedmetadata = () => {
        const durationSeconds = media.duration;
        if (Number.isFinite(durationSeconds) && durationSeconds > 0) finish((value) => resolve(value as number), durationSeconds);
        else finish((value) => reject(value as Error), new Error("The browser could not determine this file's duration safely before decoding."));
      };
      media.onerror = () => finish((value) => reject(value as Error), new Error("The browser could not read this audio file's metadata. Try MP3, WAV or M4A."));
      timeout = window.setTimeout(() => finish((value) => reject(value as Error), new Error("Reading audio metadata timed out. Try a shorter or more compatible audio file.")), 10000);
      media.src = url;
      media.load();
    });
    return duration;
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
    media.pause();
    media.removeAttribute("src");
    media.load();
    URL.revokeObjectURL(url);
  }
}

type AnnotationListKey = Exclude<keyof MusicDatasetAnnotations, "notes" | "reviewed" | "reviewer">;

const ANNOTATION_FIELDS: Array<{ key: AnnotationListKey; label: string; placeholder: string }> = [
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
  { key: "vocal_harmony", label: "Vocal harmony", placeholder: "Doubles, thirds, call-and-response" },
  { key: "performance_technique", label: "Performance techniques", placeholder: "Vibrato, falsetto, melisma, breathy" },
  { key: "instruments", label: "Instruments", placeholder: "Log drum, shakers, synth bass" },
  { key: "themes", label: "Themes", placeholder: "Love, celebration" },
  { key: "listening_scene", label: "Listening scene", placeholder: "Club, road trip" },
  { key: "production_traits", label: "Production traits", placeholder: "Reverb, sidechain, saturation" },
  { key: "arrangement", label: "Arrangement", placeholder: "Intro build, drum drop, instrumental break" },
];

function blankAnnotations(): MusicDatasetAnnotations {
  return { genre: [], sub_style: [], style_influences: [], language: [], energy: [], mood: [], source_role: [], vocals: [], vocal_delivery: [], vocal_register: [], vocal_harmony: [], performance_technique: [], instruments: [], themes: [], listening_scene: [], production_traits: [], arrangement: [], notes: "", reviewed: false, reviewer: null };
}

function layerExportLimitSeconds(): number {
  const memory = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
  if (memory !== undefined && memory <= 4) return 15;
  if (memory !== undefined && memory <= 8) return 30;
  return 60;
}

async function exactFileSha256(bytes: ArrayBuffer): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

type SavedDatasetTrack = {
  id: string;
  file_name: string;
  file_size_bytes: number;
  duration_seconds: number | null;
  source_sha256: string | null;
  normalized_metadata: { title?: string | null; artist?: string | null; album?: string | null } | null;
  created_at: string;
  analysis_run_count: number | string;
  latest_run: { id: string; run_number: number; status: string } | null;
};

type SavedDatasetRun = {
  id: string;
  run_number: number;
  analysis_schema_version: string;
  dataset_schema_version: string;
  engine_version: string;
  processing_route: string;
  status: string;
  source_sha256: string | null;
  warnings: string[];
  result_checksum: string;
  created_at: string;
  completed_at: string | null;
  analysis_summary: {
    audio?: { duration_seconds?: number };
    rhythm?: { tempo_bpm?: number | null };
    tonality?: { key?: string | null };
    classification?: { status?: string };
  };
  dataset_summary: {
    technical?: { rms_dbfs?: number | null; peak_dbfs?: number | null };
    tonality?: { key_estimate?: string | null };
  };
};
type SavedDatasetDetail = {
  track: { id: string; file_name: string; duration_seconds: number | null; source_sha256: string | null; created_at: string };
  runs: SavedDatasetRun[];
  latest_annotation_revisions: Array<{ field_key: string; field_value: unknown; source: string; review_state: string; reviewer_id: string | null; notes: string | null; created_at: string }>;
  source_audio_available: false;
};


export function MusicAnalyzerStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analysis, setAnalysis] = useState<MusicAnalysisResult | null>(null);
  const [datasetAnalysis, setDatasetAnalysis] = useState<MusicDatasetAnalysis | null>(null);
  const [annotations, setAnnotations] = useState<MusicDatasetAnnotations>(blankAnnotations);
  const [busy, setBusy] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [layersBusy, setLayersBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingCloud, setSavingCloud] = useState(false);
  const [cloudSaveError, setCloudSaveError] = useState("");
  const [cloudSaveNotice, setCloudSaveNotice] = useState("");
  const [rightsStatus, setRightsStatus] = useState("unknown");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryItems, setLibraryItems] = useState<SavedDatasetTrack[]>([]);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [selectedTrackDetail, setSelectedTrackDetail] = useState<SavedDatasetDetail | null>(null);
  const [trackDetailLoading, setTrackDetailLoading] = useState(false);
  const [trackDetailError, setTrackDetailError] = useState("");
  const [standardLoudnessReport, setStandardLoudnessReport] = useState<MusicLoudnessReport | null>(null);
  const [loudnessUploadConsent, setLoudnessUploadConsent] = useState(false);
  const [loudnessBusy, setLoudnessBusy] = useState(false);
  const [loudnessStage, setLoudnessStage] = useState("");
  const [loudnessError, setLoudnessError] = useState("");
  const loudnessControllerRef = useRef<AbortController | null>(null);
  const [batchSelection, setBatchSelection] = useState<File[]>([]);
  const [localBatch, setLocalBatch] = useState<LocalMusicBatch | null>(null);
  const [batchHistory, setBatchHistory] = useState<LocalMusicBatch[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchCloudBusy, setBatchCloudBusy] = useState(false);
  const [batchCloudProgress, setBatchCloudProgress] = useState(0);
  const [batchCloudMessage, setBatchCloudMessage] = useState("");
  const [batchCloudError, setBatchCloudError] = useState("");
  const [batchRightsStatus, setBatchRightsStatus] = useState("unknown");
  const [batchMessage, setBatchMessage] = useState("");
  const [expandedBatchItemId, setExpandedBatchItemId] = useState<string | null>(null);
  const [batchError, setBatchError] = useState("");
  const batchControllerRef = useRef<AbortController | null>(null);
  const activeBatchItemRef = useRef<string | null>(null);
  const cancelBatchRequestedRef = useRef(false);
  const cancelOnlyItemRef = useRef<string | null>(null);
  const batchPauseRequestedRef = useRef(false);
  const analysisControllerRef = useRef<AbortController | null>(null);
  const saveAttemptRef = useRef<{ signature: string; key: string } | null>(null);
  const lastSavedSignatureRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    analysisControllerRef.current?.abort();
  }, []);
  useEffect(() => () => {
    loudnessControllerRef.current?.abort();
  }, []);
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const saved = await listLocalMusicBatches();
        const recovered = saved.map((entry) => recoverLocalMusicBatch(entry));
        await Promise.all(recovered.map((entry) => saveLocalMusicBatch(entry)));
        if (!disposed) {
          setBatchHistory(recovered);
          if (recovered[0]) {
            setLocalBatch(recovered[0]);
            setBatchMessage("Local batch history restored. Re-select any source files needed to resume interrupted work.");
          }
        }
      } catch {
        if (!disposed) setBatchMessage("Local batch history is unavailable in this browser. Single-track local analysis is still available.");
      }
    })();
    return () => { disposed = true; };
  }, []);


  const metricCards = useMemo(() => {
    if (!analysis) return [];
    return [
      { label: "Tempo", value: displayNumber(analysis.rhythm.tempo_bpm, " BPM"), hint: "Estimate from first 90 seconds max" },
      { label: "Key", value: analysis.tonality.key ?? "Not available", hint: "Estimate from first 30 seconds max" },
      { label: "Duration", value: formatDuration(analysis.audio.duration_seconds), hint: "Decoded audio length" },
      { label: "Loudness proxy", value: displayNumber(analysis.audio.rms_loudness_proxy_db, " dB proxy"), hint: "RMS proxy across full track; not standard LUFS" },
      { label: "Peak", value: displayNumber(analysis.audio.peak_dbfs, " dBFS"), hint: "Highest decoded sample across full track" },
      { label: "RMS", value: displayNumber(analysis.audio.rms_dbfs, " dBFS"), hint: "Mean signal energy across full track" },
      { label: "Silence", value: displayNumber(analysis.audio.silence_percent, "%"), hint: "100 ms windows under −60 dBFS across full track" },
      { label: "Clipping", value: displayNumber(analysis.audio.clipped_sample_percent, "%"), hint: "Samples at/above 0.999 magnitude across full track" },
    ];
  }, [analysis]);

  function localBatchDescriptor(selected: File): LocalMusicFileDescriptor {
    const path = (selected as File & { webkitRelativePath?: string }).webkitRelativePath;
    return {
      name: selected.name,
      sizeBytes: selected.size,
      lastModified: selected.lastModified,
      mimeType: selected.type,
      relativePath: path || selected.name,
    };
  }

  function localBatchFileKey(selected: LocalMusicFileDescriptor): string {
    return [(selected.relativePath || selected.name).normalize("NFC").replace(/\\\\/g, "/"), selected.sizeBytes, selected.lastModified].join("\\u0000");
  }

  async function persistBatch(next: LocalMusicBatch) {
    await saveLocalMusicBatch(next);
    setLocalBatch(next);
    setBatchHistory((current) => [next, ...current.filter((item) => item.id !== next.id)].slice(0, 10));
  }

  function selectBatchFiles(files: File[]) {
    setBatchSelection(files);
    setBatchError("");
    setBatchMessage(files.length
      ? `${files.length} source file(s) selected. Batch processing stays on this device; source audio is not uploaded.`
      : "No source files selected.");
  }

  async function createBatchFromSelection() {
    if (loudnessBusy || batchBusy || batchCloudBusy) return;
    try {
      setBatchError("");
      const next = createLocalMusicBatch(batchSelection.map(localBatchDescriptor));
      await persistBatch(next);
      batchPauseRequestedRef.current = false;
      setBatchMessage("Batch created locally. Start it to analyze supported tracks one at a time. Failed tracks do not stop other tracks.");
    } catch (cause) {
      setBatchError(cause instanceof Error ? cause.message : "Could not create the local batch.");
    }
  }

  function exportLocalBatch(kind: "zip" | "jsonl" | "csv") {
    if (!localBatch) return;
    const manifest = localMusicBatchExport(localBatch);
    if (kind === "zip") {
      const files: Record<string, Uint8Array> = {
        "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      };
      for (const item of localBatch.items) {
        if (item.status === "completed" && item.result) {
          files[`tracks/${item.id}.json`] = strToU8(JSON.stringify({
            schema_version: "env.music-analysis-batch-track.v1",
            batch_id: localBatch.id,
            track_id: item.id,
            file_name: item.name,
            source_sha256: item.sourceSha256,
            analysis: item.result.analysis,
            dataset_analysis: item.result.datasetAnalysis,
            annotations: item.result.annotations,
          }, null, 2));
        }
      }
      downloadBlob(new Blob([zipSync(files)], { type: "application/zip" }), `env-music-batch-${localBatch.id}.zip`);
      return;
    }
    if (kind === "jsonl") {
      const records = [
        JSON.stringify({ record_type: "manifest", manifest }),
        ...localBatch.items.map((item) => JSON.stringify({
          record_type: "track",
          id: item.id,
          file_name: item.name,
          file_size_bytes: item.sizeBytes,
          status: item.status,
          stage: item.stage,
          source_sha256: item.sourceSha256,
          error: item.error,
          warnings: item.warnings,
          result: item.result,
        })),
      ];
      downloadBlob(new Blob([records.join("\\n") + "\\n"], { type: "application/x-ndjson;charset=utf-8" }), `env-music-batch-${localBatch.id}.jsonl`);
      return;
    }
    const headers = ["track_id", "file_name", "status", "stage", "file_size_bytes", "duration_seconds", "tempo_bpm", "key_estimate", "peak_dbfs", "rms_dbfs", "source_sha256", "error"];
    const csvCell = (value: unknown) => {
      const raw = value === null || value === undefined ? "" : String(value);
      return /[",\\r\\n]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw;
    };
    const rows = localBatch.items.map((item) => [
      item.id, item.name, item.status, item.stage, item.sizeBytes,
      item.result?.analysis.audio.duration_seconds ?? "",
      item.result?.analysis.rhythm.tempo_bpm ?? "",
      item.result?.analysis.tonality.key ?? "",
      item.result?.analysis.audio.peak_dbfs ?? "",
      item.result?.analysis.audio.rms_dbfs ?? "",
      item.sourceSha256,
      item.error,
    ].map(csvCell).join(","));
    downloadBlob(new Blob([[headers.join(","), ...rows].join("\\r\\n") + "\\r\\n"], { type: "text/csv;charset=utf-8" }), `env-music-batch-${localBatch.id}.csv`);
  }

  async function cancelLocalBatchItem(itemId: string) {
    if (!localBatch || batchCloudBusy) return;
    if (activeBatchItemRef.current === itemId) {
      cancelOnlyItemRef.current = itemId;
      batchControllerRef.current?.abort();
      setBatchMessage("Cancel requested for the active track. Completed tracks will be preserved.");
      return;
    }
    const item = localBatch.items.find((candidate) => candidate.id === itemId);
    if (!item || (item.status !== "queued" && item.status !== "waiting_for_file")) return;
    try {
      const next = transitionLocalMusicBatchItem(localBatch, itemId, "canceled", { error: "Canceled by the user." });
      await persistBatch(finalizeLocalMusicBatch(next));
    } catch (cause) {
      setBatchError(cause instanceof Error ? cause.message : "Could not cancel this batch item.");
    }
  }

  async function cancelLocalBatch() {
    if (!localBatch || batchCloudBusy) return;
    cancelBatchRequestedRef.current = true;
    cancelOnlyItemRef.current = null;
    batchControllerRef.current?.abort();
    if (!batchBusy) {
      try {
        let next = localBatch;
        for (const item of next.items) {
          if (item.status === "queued" || item.status === "waiting_for_file") {
            next = transitionLocalMusicBatchItem(next, item.id, "canceled", { error: "Batch canceled by the user." });
          }
        }
        next = finalizeLocalMusicBatch({ ...next, status: "canceled" });
        await persistBatch(next);
        setBatchMessage("Batch canceled. Completed results remain available for export.");
      } catch (cause) {
        setBatchError(cause instanceof Error ? cause.message : "Could not cancel the batch.");
      }
    } else {
      setBatchMessage("Cancel requested. The active local track is stopping; completed results will remain available.");
    }
  }

  async function saveCompletedBatchToCloud() {
    if (!localBatch || batchBusy || batchCloudBusy) return;
    const pending = localBatch.items.filter((item) => item.status === "completed" && item.result && !item.cloudSavedTrackId);
    if (!pending.length) {
      setBatchCloudMessage("All completed results in this batch are already saved to your private dataset.");
      setBatchCloudError("");
      return;
    }
    setBatchCloudBusy(true);
    setBatchCloudProgress(0);
    setBatchCloudMessage("");
    setBatchCloudError("");
    let working = localBatch;
    let savedCount = 0;
    let failedCount = 0;
    let stopReason = "";
    let lastTrackError = "";

    const persistCloudState = async (next: LocalMusicBatch) => {
      await saveLocalMusicBatch(next);
      working = next;
      setLocalBatch(next);
      setBatchHistory((current) => [next, ...current.filter((entry) => entry.id !== next.id)].slice(0, 10));
    };

    try {
      for (let index = 0; index < pending.length; index += 1) {
        const pendingItem = pending[index]!;
        const item = working.items.find((candidate) => candidate.id === pendingItem.id);
        if (!item || item.status !== "completed" || !item.result || item.cloudSavedTrackId) {
          setBatchCloudProgress((index + 1) / pending.length);
          continue;
        }

        // Persist the idempotency key before the request. If the response is lost,
        // a retry replays the same key rather than creating another cloud record.
        let idempotencyKey = item.cloudSaveIdempotencyKey;
        if (!idempotencyKey) {
          idempotencyKey = crypto.randomUUID();
          working = updateLocalMusicBatchItem(working, item.id, { cloudSaveIdempotencyKey: idempotencyKey });
          await persistCloudState(working);
        }

        const analysis = item.result.analysis;
        const datasetAnalysis = { ...item.result.datasetAnalysis, annotations: item.result.annotations };
        let response: Response;
        let body: { ok?: boolean; data?: { track_id?: string; already_saved?: boolean }; message?: string; error?: string } | null;
        try {
          response = await fetch("/api/music-dataset/tracks", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              file: {
                name: item.name,
                size_bytes: item.sizeBytes,
                mime_type: item.mimeType || analysis.source.mime_type || "application/octet-stream",
                source_sha256: item.sourceSha256,
                source_metadata: analysis.metadata,
                normalized_metadata: analysis.metadata,
                rights_status: batchRightsStatus,
              },
              analysis,
              dataset_analysis: datasetAnalysis,
              idempotency_key: idempotencyKey,
            }),
          });
          body = await response.json().catch(() => null) as typeof body;
        } catch (cause) {
          failedCount += 1;
          lastTrackError = `${item.name}: ${cause instanceof Error ? cause.message : "Network request failed"}`;
          setBatchCloudProgress((index + 1) / pending.length);
          continue;
        }

        if (!response.ok || !body?.ok || !body.data?.track_id) {
          failedCount += 1;
          lastTrackError = `${item.name}: ${body?.message || body?.error || `HTTP ${response.status}`}`;
          setBatchCloudProgress((index + 1) / pending.length);
          if ([401, 403, 429, 503].includes(response.status)) {
            stopReason = body?.message || (
              response.status === 401 ? "Sign in to save results to your private dataset." :
              response.status === 429 ? "The private dataset rate limit was reached. Retry after the current window." :
              "The private dataset service is unavailable or not configured."
            );
            break;
          }
          continue;
        }

        working = updateLocalMusicBatchItem(working, item.id, { cloudSavedTrackId: body.data.track_id });
        await persistCloudState(working);
        savedCount += 1;
        setBatchCloudProgress((index + 1) / pending.length);
      }

      const remainingUnsaved = working.items.filter((item) => item.status === "completed" && item.result && !item.cloudSavedTrackId).length;
      setBatchCloudMessage(
        `Private dataset save: ${savedCount} saved in this pass, ${remainingUnsaved} still unsaved. The original audio was not uploaded.`
      );
      if (stopReason) setBatchCloudError(stopReason);
      else if (lastTrackError && failedCount > 0) setBatchCloudError(`${failedCount} result(s) could not be saved. ${lastTrackError} Retry the unsaved results; already saved records are protected by idempotency keys.`);
      if (savedCount > 0 && libraryOpen) void refreshCloudLibrary(1, "");
    } catch (cause) {
      setBatchCloudError(cause instanceof Error ? cause.message : "The private dataset save could not be completed. Completed local results remain available.");
    } finally {
      setBatchCloudBusy(false);
    }
  }

  async function deleteCurrentLocalBatch() {
    if (!localBatch || batchBusy || batchCloudBusy) return;
    if (!window.confirm("Delete this local batch, its saved analysis results, and its progress history from this browser? Original audio files were not stored here.")) return;
    try {
      const deletedId = localBatch.id;
      await deleteLocalMusicBatch(deletedId);
      const remaining = batchHistory.filter((entry) => entry.id !== deletedId);
      setBatchHistory(remaining);
      setLocalBatch(remaining[0] ?? null);
      setBatchError("");
      setBatchMessage("Local batch and its saved results were deleted from this browser.");
    } catch (cause) {
      setBatchError(cause instanceof Error ? cause.message : "Could not delete local batch data.");
    }
  }

  async function retryLocalBatchItems(failedOnly = true) {
    if (!localBatch || batchBusy || batchCloudBusy) return;
    try {
      let next = localBatch;
      let count = 0;
      for (const item of next.items) {
        const retryable = failedOnly ? item.status === "failed" : item.status === "failed" || item.status === "canceled";
        if (!retryable) continue;
        next = transitionLocalMusicBatchItem(next, item.id, "queued");
        count += 1;
      }
      if (!count) {
        setBatchMessage("There are no failed or canceled tracks to retry.");
        return;
      }
      next = { ...next, status: "paused" };
      await persistBatch(next);
      setBatchError("");
      setBatchMessage(`${count} track(s) queued for retry. Select the original source files again, then resume.`);
    } catch (cause) {
      setBatchError(cause instanceof Error ? cause.message : "Could not retry batch items.");
    }
  }

  async function retryLocalBatchItem(itemId: string) {
    if (!localBatch || batchBusy || batchCloudBusy) return;
    const item = localBatch.items.find((candidate) => candidate.id === itemId);
    if (!item || (item.status !== "failed" && item.status !== "canceled")) return;
    try {
      let next = transitionLocalMusicBatchItem(localBatch, itemId, "queued");
      next = { ...next, status: "paused" };
      await persistBatch(next);
      setBatchError("");
      setBatchMessage(`"${item.name}" is queued for retry. Re-select its original file if needed, then resume.`);
    } catch (cause) {
      setBatchError(cause instanceof Error ? cause.message : "Could not retry this track.");
    }
  }

  async function prioritizeLocalBatchItem(itemId: string) {
    if (!localBatch || batchBusy || batchCloudBusy) return;
    const item = localBatch.items.find((candidate) => candidate.id === itemId);
    if (!item || (item.status !== "queued" && item.status !== "waiting_for_file")) return;
    const next: LocalMusicBatch = {
      ...localBatch,
      items: [item, ...localBatch.items.filter((candidate) => candidate.id !== itemId)],
      status: "paused",
      updatedAt: new Date().toISOString(),
    };
    try {
      await persistBatch(next);
      setBatchMessage(`"${item.name}" is now first in the local batch queue.`);
    } catch (cause) {
      setBatchError(cause instanceof Error ? cause.message : "Could not prioritize this track.");
    }
  }

  async function runLocalBatch() {
    if (!localBatch || batchBusy || batchCloudBusy || loudnessBusy) return;
    setBatchError("");
    setBatchMessage("");
    const selected = new Map(batchSelection.map((item) => [localBatchFileKey(localBatchDescriptor(item)), item]));
    let working = localBatch;
    let controller = new AbortController();
    batchControllerRef.current = controller;
    cancelBatchRequestedRef.current = false;
    cancelOnlyItemRef.current = null;
    batchPauseRequestedRef.current = false;
    setBatchBusy(true);

    const persist = async (next: LocalMusicBatch) => {
      await saveLocalMusicBatch(next);
      working = next;
      setLocalBatch(next);
      setBatchHistory((current) => [next, ...current.filter((item) => item.id !== next.id)].slice(0, 10));
    };
    const stopRequested = () => controller.signal.aborted;
    try {
      for (const initialItem of [...working.items]) {
        if (stopRequested() && !cancelOnlyItemRef.current) break;
        if (batchPauseRequestedRef.current) {
          working = { ...working, status: "paused", updatedAt: new Date().toISOString() };
          await persist(working);
          setBatchMessage("Batch paused after the current track. Resume to continue the remaining items.");
          break;
        }
        let item = working.items.find((candidate) => candidate.id === initialItem.id);
        if (!item || (item.status !== "queued" && item.status !== "waiting_for_file")) continue;
        const file = selected.get(localBatchFileKey(item));
        if (!file) {
          if (item.status === "queued") {
            working = transitionLocalMusicBatchItem(working, item.id, "waiting_for_file", {
              error: "Select this original file again before resuming the batch.",
              stage: "queued",
              progress: 0,
            });
            await persist(working);
          }
          continue;
        }
        if (item.status === "waiting_for_file") {
          working = transitionLocalMusicBatchItem(working, item.id, "queued");
          await persist(working);
        }
        const currentId = item.id;
        activeBatchItemRef.current = currentId;
        cancelOnlyItemRef.current = null;
        let resumeAfterSingleCancel = false;
        let progressWriteChain: Promise<void> = Promise.resolve();
        let progressWriteFailed = false;
        try {
          if (file.size <= 0) throw new Error("The selected file is empty.");
          if (file.size > LOCAL_FILE_LIMIT) throw new Error("This file exceeds the 25 MiB on-device limit.");
          working = transitionLocalMusicBatchItem(working, currentId, "validating", { stage: "validation", progress: 0.05, error: null });
          await persist(working);
          setBatchMessage(`Checking ${file.name}…`);
          const probedDuration = await probeAudioDuration(file);
          if (stopRequested()) throw new DOMException("Cancelled", "AbortError");
          if (probedDuration > MAX_AUDIO_DURATION_SECONDS) throw new Error("This track exceeds the two-minute on-device analysis limit.");
          let bytes: ArrayBuffer | null = await file.arrayBuffer();
          if (stopRequested()) throw new DOMException("Cancelled", "AbortError");
          if (!bytes) throw new Error("The file bytes are unavailable.");
          const sourceSha256 = await exactFileSha256(bytes);
          const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Ctx) throw new Error("This browser does not support Web Audio decoding.");
          working = transitionLocalMusicBatchItem(working, currentId, "decoding", { stage: "decode", progress: 0.15, sourceSha256 });
          await persist(working);
          const context = new Ctx();
          let buffer: AudioBuffer | null;
          try {
            buffer = await context.decodeAudioData(bytes.slice(0));
          } finally {
            await context.close().catch(() => undefined);
          }
          if (stopRequested()) throw new DOMException("Cancelled", "AbortError");
          if (!buffer || buffer.duration <= 0 || buffer.length <= 0) throw new Error("The file did not decode to usable audio.");
          if (buffer.duration > MAX_AUDIO_DURATION_SECONDS) throw new Error("Decoded duration exceeds the two-minute on-device limit.");
          assertLocalDecodedPcmBudget(buffer.length, buffer.numberOfChannels);
          const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer!.getChannelData(index));
          const sampleRate = buffer.sampleRate;
          const metadata = extractMusicMetadata(new Uint8Array(bytes), file.name);
          bytes = null;
          working = transitionLocalMusicBatchItem(working, currentId, "analyzing", { stage: "dsp", progress: 0.2 });
          await persist(working);
          let lastPersistedProgress = 0.2;
          const analysisTask = analyzeMusicInWorker({
            channels,
            sampleRate,
            fileName: file.name,
            fileSizeBytes: file.size,
            mimeType: file.type,
            metadata,
            sourceSha256,
          }, {
            signal: controller.signal,
            onProgress: (fraction) => {
              if (batchControllerRef.current !== controller || controller.signal.aborted) return;
              const progress = Math.max(0.2, Math.min(0.95, 0.2 + fraction * 0.75));
              working = updateLocalMusicBatchItem(working, currentId, {
                progress,
                stage: "dsp",
                status: "analyzing",
              });
              setLocalBatch(working);
              if (progress - lastPersistedProgress >= 0.05 || progress >= 0.95) {
                lastPersistedProgress = progress;
                const checkpoint = working;
                progressWriteChain = progressWriteChain.then(() => saveLocalMusicBatch(checkpoint)).catch(() => {
                  progressWriteFailed = true;
                  setBatchError("Local storage stopped accepting progress updates. Completed tracks are preserved only if their last save succeeded.");
                });
              }
            },
          });
          channels.length = 0;
          buffer = null;
          const { analysis: result, datasetAnalysis } = await analysisTask;
          await progressWriteChain;
          if (progressWriteFailed) throw new Error("Could not persist batch progress to this browser's local storage.");
          if (stopRequested()) throw new DOMException("Cancelled", "AbortError");
          working = transitionLocalMusicBatchItem(working, currentId, "completed", {
            stage: "complete",
            progress: 1,
            sourceSha256,
            error: null,
            warnings: sourceSha256 ? [] : ["SHA-256 could not be computed in this browser."],
            result: { analysis: result, datasetAnalysis, annotations: datasetAnalysis.annotations },
          });
          await persist(finalizeLocalMusicBatch(working));
        } catch (cause) {
          await progressWriteChain;
          const wasSingleItemCancellation = cancelOnlyItemRef.current === currentId && !cancelBatchRequestedRef.current;
          resumeAfterSingleCancel = wasSingleItemCancellation;
          const aborted = cause instanceof Error && cause.name === "AbortError";
          const canceledByUser = aborted || wasSingleItemCancellation || (cancelBatchRequestedRef.current && stopRequested());
          const current = working.items.find((candidate) => candidate.id === currentId);
          if (current && current.status !== "completed" && current.status !== "failed" && current.status !== "canceled") {
            working = transitionLocalMusicBatchItem(working, currentId, canceledByUser ? "canceled" : "failed", {
              error: canceledByUser ? "Canceled by the user." : cause instanceof Error ? cause.message : "Analysis failed.",
              stage: current.stage,
            });
            await persist(working);
          }
          if (!canceledByUser) {
            setBatchError(`${file.name}: ${cause instanceof Error ? cause.message : "Analysis failed."}`);
          }
          if (cancelBatchRequestedRef.current) break;
        } finally {
          activeBatchItemRef.current = null;
          if (cancelOnlyItemRef.current === currentId) cancelOnlyItemRef.current = null;
          if (resumeAfterSingleCancel && !cancelBatchRequestedRef.current) {
            controller = new AbortController();
            batchControllerRef.current = controller;
          }
        }
      }

      if (cancelBatchRequestedRef.current) {
        for (const item of working.items) {
          if (item.status === "queued" || item.status === "waiting_for_file") {
            working = transitionLocalMusicBatchItem(working, item.id, "canceled", { error: "Batch canceled by the user." });
          }
        }
        working = finalizeLocalMusicBatch({ ...working, status: "canceled" });
        await persist(working);
        setBatchMessage("Batch canceled. Completed results remain available for export.");
      } else if (batchPauseRequestedRef.current) {
        working = { ...working, status: "paused", updatedAt: new Date().toISOString() };
        await persist(working);
      } else {
        working = finalizeLocalMusicBatch(working);
        await persist(working);
        const counts = countLocalMusicBatchItems(working);
        setBatchMessage(`Batch ${working.status.replace(/_/g, " ")}: ${counts.completed} complete, ${counts.failed} failed, ${counts.waitingForFile} waiting for source files. Results are kept locally on this device.`);
      }
    } catch (cause) {
      setBatchError(cause instanceof Error ? cause.message : "Could not continue the local batch.");
      setBatchMessage("");
    } finally {
      batchControllerRef.current = null;
      activeBatchItemRef.current = null;
      setBatchBusy(false);
      if (working.id) {
        setLocalBatch(working);
        setBatchHistory((current) => [working, ...current.filter((item) => item.id !== working.id)].slice(0, 10));
      }
    }
  }

  async function pauseLocalBatchAfterCurrent() {
    batchPauseRequestedRef.current = true;
    if (!batchBusy && localBatch) {
      await persistBatch({ ...localBatch, status: "paused", updatedAt: new Date().toISOString() });
      setBatchMessage("Batch paused. Resume when ready.");
    } else {
      setBatchMessage("Pause requested. The current track will finish before new work is admitted.");
    }
  }

  function chooseFile(selected: File | null) {
    analysisControllerRef.current?.abort();
    analysisControllerRef.current = null;
    loudnessControllerRef.current?.abort();
    loudnessControllerRef.current = null;
    setLoudnessBusy(false);
    setLoudnessStage("");
    setLoudnessError("");
    setStandardLoudnessReport(null);
    setLoudnessUploadConsent(false);
    setBusy(false);
    setAnalysisProgress(0);
    setError("");
    setNotice("");
    setAnalysis(null);
    setDatasetAnalysis(null);
    setAnnotations(blankAnnotations());
    setFile(selected);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return selected ? URL.createObjectURL(selected) : "";
    });
    if (selected && selected.size > LOCAL_FILE_LIMIT) {
      setError("Choose a file smaller than 25 MB for predictable on-device analysis, especially on phones.");
    }
  }

  function exportStandardLoudnessReport() {
    if (!standardLoudnessReport) return;
    const blob = new Blob([JSON.stringify(standardLoudnessReport, null, 2)], { type: "application/json;charset=utf-8" });
    const baseName = file?.name.replace(/\\.[^.]+$/, "").trim() || "env-audio";
    downloadBlob(blob, baseName + "-standards-loudness-report.json");
  }

  async function runStandardsLoudnessMeasurement() {
    if (!file || loudnessBusy || busy || batchBusy || batchCloudBusy) return;
    if (!loudnessUploadConsent) {
      setLoudnessError("Confirm the separate source-audio upload permission before starting this measurement.");
      return;
    }
    if (file.size <= 0) {
      setLoudnessError("The selected file is empty.");
      return;
    }
    const mediaConfig = getServerMediaConfig();
    if (mediaConfig.endpoint === apiUrl("/api/backend/media") && file.size > 4 * 1024 * 1024) {
      setLoudnessError("The same-origin media gateway accepts up to 4 MiB per upload. Configure a direct MEDIA_PROCESSOR_URL for larger files, or choose a smaller file.");
      return;
    }

    loudnessControllerRef.current?.abort();
    const controller = new AbortController();
    loudnessControllerRef.current = controller;
    setLoudnessBusy(true);
    setLoudnessStage("Preparing the separately authorized processor request…");
    setLoudnessError("");
    setStandardLoudnessReport(null);
    try {
      const adapter = createServerMediaAdapter();
      const request: MediaJobRequest = {
        id: crypto.randomUUID(),
        toolId: "audio-analyze-studio",
        operation: "server-media:audio-loudness-report",
        inputBytes: file.size,
        inputMime: file.type || "application/octet-stream",
        preferredRuntime: "server",
        params: {
          input: file,
          fileName: file.name,
          outputName: "env-music-loudness-report.json",
          outputMime: "application/json",
          explicitAudioUploadConsent: true,
        },
      };
      if (!(await adapter.canHandle(request))) {
        throw new Error("The configured media adapter cannot run a standards-based loudness report.");
      }
      setLoudnessStage("Uploading the selected file to the configured enV processor; measuring with its FFmpeg ebur128 meter…");
      const responseBlob = await adapter.execute(request, controller.signal, (progress) => {
        if (loudnessControllerRef.current !== controller || controller.signal.aborted) return;
        if (progress >= 90) setLoudnessStage("Measurement response received; validating report and integrity checksum…");
        else if (progress >= 35) setLoudnessStage("The selected audio is being processed by the configured service…");
      });
      if (controller.signal.aborted || loudnessControllerRef.current !== controller) return;
      let raw: unknown;
      try {
        raw = JSON.parse(await responseBlob.text()) as unknown;
      } catch {
        throw new Error("The processor did not return a valid JSON loudness report. No measurement was saved in the UI.");
      }
      const report = parseMusicLoudnessReport(raw);
      const verified = await verifyMusicLoudnessReportChecksum(report);
      if (controller.signal.aborted || loudnessControllerRef.current !== controller) return;
      setStandardLoudnessReport(verified);
      setLoudnessStage("Report verified. The original file was sent only for this separately selected loudness measurement; no AI model was used.");
      setLoudnessUploadConsent(false);
    } catch (cause) {
      if (loudnessControllerRef.current !== controller) return;
      if (cause instanceof Error && cause.name === "AbortError") {
        setLoudnessError("");
        setLoudnessStage("Loudness measurement canceled. The local analysis and local batch paths remain on-device.");
      } else {
        setLoudnessError(cause instanceof Error ? cause.message : "Could not complete the standards-based loudness measurement.");
        setLoudnessStage("");
      }
    } finally {
      if (loudnessControllerRef.current === controller) {
        loudnessControllerRef.current = null;
        setLoudnessBusy(false);
      }
    }
  }

  async function runLocalAnalysis() {
    if (!file) {
      setError("Choose an audio file first.");
      return;
    }
    if (busy || loudnessBusy || batchBusy || batchCloudBusy) return;
    if (file.size > LOCAL_FILE_LIMIT) {
      setError("This file is larger than the 25 MB on-device analysis limit. Choose a smaller file.");
      return;
    }
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      setError("This browser does not support Web Audio decoding. Try an up-to-date browser.");
      return;
    }
    analysisControllerRef.current?.abort();
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    const ensureCurrent = () => {
      if (analysisControllerRef.current !== controller) return false;
      if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      return true;
    };
    setBusy(true);
    setAnalysisProgress(0);
    setAnalysis(null);
    setDatasetAnalysis(null);
    setAnnotations(blankAnnotations());
    setError("");
    setNotice("Checking file duration, then measuring the audio on this device. Nothing is uploaded for local analysis.");
    try {
      const probedDuration = await probeAudioDuration(file);
      if (!ensureCurrent()) return;
      if (probedDuration > MAX_AUDIO_DURATION_SECONDS) throw new Error("For device memory safety, analyze clips up to 2 minutes. Split longer files into sections first.");
      let bytes: ArrayBuffer | null = await file.arrayBuffer();
      if (!ensureCurrent()) return;
      if (!bytes) throw new Error("The file bytes are unavailable.");
      const sourceSha256 = await exactFileSha256(bytes);
      if (!ensureCurrent()) return;
      const context = new Ctx();
      let buffer: AudioBuffer | null;
      try {
        buffer = await context.decodeAudioData(bytes.slice(0));
      } finally {
        await context.close().catch(() => undefined);
      }
      if (!ensureCurrent()) return;
      if (!buffer || buffer.duration <= 0 || buffer.length <= 0) throw new Error("The selected file did not decode to usable audio.");
      if (buffer.duration > MAX_AUDIO_DURATION_SECONDS) throw new Error("For device memory safety, analyze clips up to 2 minutes. Split longer files into sections first.");
      assertLocalDecodedPcmBudget(buffer.length, buffer.numberOfChannels);
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer!.getChannelData(index));
      const sampleRate = buffer.sampleRate;
      const metadata = extractMusicMetadata(new Uint8Array(bytes), file.name);
      bytes = null;
      const analysisTask = analyzeMusicInWorker({
        channels,
        sampleRate,
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type,
        metadata,
        sourceSha256,
      }, {
        signal: controller.signal,
        onProgress: (fraction) => {
          if (analysisControllerRef.current === controller && !controller.signal.aborted) setAnalysisProgress(fraction);
        },
      });
      channels.length = 0;
      buffer = null;
      const result = await analysisTask;
      if (!ensureCurrent()) return;
      setAnalysis(result.analysis);
      setDatasetAnalysis(result.datasetAnalysis);
      setAnnotations(result.datasetAnalysis.annotations);
      setNotice("Local DSP analysis finished on this device. No AI model or remote API was used. Add and review semantic labels below before exporting training data.");
    } catch (cause) {
      if (analysisControllerRef.current !== controller) return;
      if (cause instanceof Error && cause.name === "AbortError") {
        setError("");
        setNotice("Analysis cancelled.");
      } else {
        setAnalysis(null);
        setDatasetAnalysis(null);
        setError(cause instanceof Error ? cause.message : "Could not analyze this audio file.");
        setNotice("");
      }
    } finally {
      if (analysisControllerRef.current === controller) {
        analysisControllerRef.current = null;
        setBusy(false);
      }
    }
  }

  function exportJson() {
    if (!analysis || !datasetAnalysis) return;
    const payload = {
      schema_version: "env.music-training-example.v1",
      exported_at: new Date().toISOString(),
      measurements: analysis,
      dataset_analysis: { ...datasetAnalysis, annotations },
      standards_loudness_report: standardLoudnessReport,
      labeling_policy: "DSP-derived measurements are estimates; semantic labels are supplied and reviewed by a human. No hosted model or remote API was used.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, file ? file.name.replace(/\.[^.]+$/, "") + "-env-music-dataset.json" : "env-music-dataset.json");
  }

  function exportSongProfile() {
    if (!analysis || !datasetAnalysis) return;
    const profile = {
      ...createMusicAnalysisProfile(analysis),
      schema_version: "env.music-training-profile.v2",
      dataset_analysis: { ...datasetAnalysis, annotations },
      standards_loudness_report: standardLoudnessReport,
    };
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json;charset=utf-8" });
    const baseName = file?.name.replace(/\.[^.]+$/, "").trim() || "env-song";
    downloadBlob(blob, baseName + "-song-profile.json");
  }

  function updateAnnotationList(key: AnnotationListKey, value: string) {
    const tags = value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 80);
    setAnnotations((current) => ({ ...current, [key]: tags, reviewed: false }));
  }

  async function refreshCloudLibrary(page = libraryPage, query = libraryQuery) {
    setLibraryLoading(true);
    setCloudSaveError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "10", q: query.trim() });
      const response = await fetch("/api/music-dataset/tracks?" + params.toString(), { headers: { Accept: "application/json" } });
      const result = await response.json().catch(() => null) as { ok?: boolean; data?: { items?: SavedDatasetTrack[]; pagination?: { page: number; total: number } }; message?: string; error?: string } | null;
      if (!response.ok || !result?.ok || !result.data) {
        throw new Error(result?.message || (response.status === 401 ? "Sign in to load your private music library." : response.status === 503 ? "Cloud dataset access is not configured for this deployment. Local analysis and export still work." : "Could not load the private music library."));
      }
      setLibraryItems(result.data.items ?? []);
      setLibraryPage(result.data.pagination?.page ?? page);
      setLibraryTotal(result.data.pagination?.total ?? 0);
    } catch (cause) {
      setCloudSaveError(cause instanceof Error ? cause.message : "Could not load the private music library.");
    } finally {
      setLibraryLoading(false);
    }
  }

  async function loadSavedTrackDetail(trackId: string) {
    setTrackDetailLoading(true);
    setTrackDetailError("");
    try {
      const response = await fetch("/api/music-dataset/tracks/" + encodeURIComponent(trackId), { headers: { Accept: "application/json" } });
      const result = await response.json().catch(() => null) as { ok?: boolean; data?: SavedDatasetDetail; message?: string } | null;
      if (!response.ok || !result?.ok || !result.data) {
        throw new Error(result?.message || "Could not load this saved track's analysis history.");
      }
      setSelectedTrackDetail(result.data);
    } catch (cause) {
      setTrackDetailError(cause instanceof Error ? cause.message : "Could not load this saved track's analysis history.");
    } finally {
      setTrackDetailLoading(false);
    }
  }

  async function saveAnalysisToCloud() {
    if (!file || !analysis || !datasetAnalysis || savingCloud) return;
    setCloudSaveError("");
    setCloudSaveNotice("");
    try {
      const payloadWithoutKey = {
        file: {
          name: file.name,
          size_bytes: file.size,
          mime_type: file.type || null,
          source_sha256: analysis.fingerprint.file_sha256,
          source_metadata: analysis.metadata,
          normalized_metadata: analysis.metadata,
          rights_status: rightsStatus,
        },
        analysis,
        dataset_analysis: { ...datasetAnalysis, annotations },
      };
      const signature = JSON.stringify(payloadWithoutKey);
      if (lastSavedSignatureRef.current === signature) {
        setCloudSaveNotice("These exact results are already saved. Review the library or change the annotations before saving a new record.");
        setLibraryOpen(true);
        await refreshCloudLibrary(1, "");
        return;
      }
      // Reuse one idempotency key when a network response is lost, but create a new one if the reviewed payload changes.
      if (!saveAttemptRef.current || saveAttemptRef.current.signature !== signature) {
        saveAttemptRef.current = { signature, key: crypto.randomUUID() };
      }
      const payload = { ...payloadWithoutKey, idempotency_key: saveAttemptRef.current.key };
      setSavingCloud(true);
      // Only structured analysis results are sent. The audio File/ArrayBuffer is never attached.
      const response = await fetch("/api/music-dataset/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; data?: { track_id?: string; analysis_run_id?: string; already_saved?: boolean; duplicate_candidates?: unknown[] }; message?: string; error?: string; note?: string } | null;
      if (!response.ok || !result?.ok || !result.data?.track_id) {
        throw new Error(result?.message || (response.status === 401 ? "Sign in to save to your private music library." : response.status === 503 ? "Cloud dataset access is not configured for this deployment. Your local results remain available." : "Could not save this analysis."));
      }
      lastSavedSignatureRef.current = signature;
      saveAttemptRef.current = null;
      const duplicates = result.data.duplicate_candidates?.length ?? 0;
      const duplicateNote = duplicates
        ? ` ${duplicates} possible SHA-256 match candidate(s) were found. The hashes are not server-verified and records were not merged; review them separately.`
        : "";
      setCloudSaveNotice((result.data.already_saved ? "This save was already recorded." : "Analysis saved to your private dataset.") + " Original audio was not uploaded." + duplicateNote);
      setLibraryOpen(true);
      await refreshCloudLibrary(1, "");
    } catch (cause) {
      setCloudSaveError(cause instanceof Error ? cause.message : "Could not save this analysis.");
    } finally {
      setSavingCloud(false);
    }
  }

  async function deleteSavedTrack(trackId: string) {
    if (!window.confirm("Delete this track's saved metadata, analysis history, feature data and annotations? The original audio was not stored here.")) return;
    setCloudSaveError("");
    try {
      const response = await fetch("/api/music-dataset/tracks/" + encodeURIComponent(trackId), { method: "DELETE", headers: { Accept: "application/json" } });
      const result = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Could not delete this dataset record.");
      setCloudSaveNotice("Saved dataset record and its derived rows deleted.");
      await refreshCloudLibrary(libraryPage);
    } catch (cause) {
      setCloudSaveError(cause instanceof Error ? cause.message : "Could not delete this dataset record.");
    }
  }

  async function exportSignalLayers() {
    if (!file || !datasetAnalysis || layersBusy) return;
    setLayersBusy(true);
    setError("");
    setNotice("Preparing local frequency/spatial layers. These are not isolated vocal, drum, or instrument stems.");
    let context: AudioContext | null = null;
    try {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) throw new Error("This browser cannot decode audio for layer export.");
      context = new Ctx();
      const decoded = await context.decodeAudioData((await file.arrayBuffer()).slice(0));
      const maxSeconds = layerExportLimitSeconds();
      const sampleCount = Math.min(decoded.length, Math.round(decoded.sampleRate * maxSeconds));
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index).subarray(0, sampleCount));
      const layers = createLocalSignalLayers(channels, decoded.sampleRate);
      const safeBase = (file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "audio");
      const archive: Record<string, Uint8Array> = {};
      for (const layer of layers) archive[`layers/${layer.id}.wav`] = encodeMonoPcm16Wav(layer.samples, decoded.sampleRate);
      archive["README.json"] = strToU8(JSON.stringify({
        schema_version: "env.local-signal-layers.v1",
        source_file: file.name,
        exported_seconds: Number((sampleCount / decoded.sampleRate).toFixed(3)),
        sample_rate_hz: decoded.sampleRate,
        channel_count: decoded.numberOfChannels,
        method: "Local digital filters and stereo mid/side arithmetic. No AI model or network call.",
        warning: "These outputs are frequency/spatial layers, not source-separated vocals/drums/bass. Do not label them as true source stems.",
        layers: layers.map(({ id, label, channels: channelCount, meaning }) => ({ id, label, channels: channelCount, meaning })),
        dataset_annotations: annotations,
      }, null, 2));
      const zipped = zipSync(archive, { level: 0 });
      const blob = new Blob([zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer], { type: "application/zip" });
      downloadBlob(blob, safeBase + "-local-signal-layers.zip");
      setNotice(`Local signal-layer ZIP exported (${(sampleCount / decoded.sampleRate).toFixed(0)} seconds). These layers are not clean instrument or vocal stems.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export local signal layers.");
      setNotice("");
    } finally {
      if (context) await context.close().catch(() => undefined);
      setLayersBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Activity size={22} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">enV · Audio intelligence</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Music Analyzer</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Analyze on this device, review estimated features and human-supplied labels, then export or save structured results to your private dataset. Cloud save never uploads the source audio.</p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Private dataset library</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Search saved measurements, history, feature timelines and reviewed labels. Sign-in and a configured database are required.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={libraryLoading}
            onClick={() => {
              const open = !libraryOpen;
              setLibraryOpen(open);
              if (open) void refreshCloudLibrary(1, "");
            }}
          >
            {libraryOpen ? "Hide library" : "Open library"}
          </Button>
        </div>
        {libraryOpen ? (
          <div className="mt-4 space-y-3">
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void refreshCloudLibrary(1, libraryQuery); }}>
              <input
                aria-label="Search private music dataset"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.currentTarget.value)}
                placeholder="Search filename, title, artist…"
                maxLength={100}
              />
              <Button type="submit" variant="outline" disabled={libraryLoading}>
                {libraryLoading ? <><LoaderCircle size={15} className="mr-2 animate-spin" />Loading…</> : "Search"}
              </Button>
            </form>
            {libraryItems.length ? (
              <div className="divide-y divide-border rounded-lg border border-border">
                {libraryItems.map((item) => {
                  const metadata = item.normalized_metadata ?? {};
                  const title = metadata.title || item.file_name;
                  const artist = metadata.artist;
                  return (
                    <div key={item.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{title}</p>
                        {artist ? <p className="mt-0.5 text-xs text-muted-foreground">{artist}</p> : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatBytes(Number(item.file_size_bytes))} · {item.duration_seconds ? formatDuration(item.duration_seconds) : "Duration unavailable"} · {Number(item.analysis_run_count)} run{Number(item.analysis_run_count) === 1 ? "" : "s"}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {item.source_sha256 ? "Exact-file hash recorded" : "No exact-file hash"} · {new Date(item.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Button type="button" variant="outline" onClick={() => void loadSavedTrackDetail(item.id)} disabled={trackDetailLoading}>
                          {trackDetailLoading ? "Loading…" : "View history"}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => void deleteSavedTrack(item.id)} aria-label={`Delete saved track ${item.file_name}`}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                {libraryLoading ? "Loading your saved tracks…" : "No saved tracks in this result page."}
              </p>
            )}
            {trackDetailError ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{trackDetailError}</p> : null}
            {selectedTrackDetail ? (
              <div className="space-y-3 rounded-xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold">{selectedTrackDetail.track.file_name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedTrackDetail.runs.length} saved run{selectedTrackDetail.runs.length === 1 ? "" : "s"} · source audio not stored
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedTrackDetail(null)}>Close</Button>
                </div>
                {selectedTrackDetail.runs.length ? (
                  <div className="space-y-2">
                    {selectedTrackDetail.runs.map((run) => {
                      const audio = run.analysis_summary?.audio ?? {};
                      const rhythm = run.analysis_summary?.rhythm ?? {};
                      const tonality = run.analysis_summary?.tonality ?? {};
                      const key = tonality.key ?? run.dataset_summary?.tonality?.key_estimate ?? null;
                      return (
                        <div key={run.id} className="rounded-lg border border-border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">Run {run.run_number}</p>
                            <span className="text-xs text-muted-foreground">{run.status} · {new Date(run.created_at).toLocaleString()}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{run.analysis_schema_version} · {run.dataset_schema_version} · {run.processing_route}</p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs">
                            <span>Duration: {audio.duration_seconds ? formatDuration(audio.duration_seconds) : "—"}</span>
                            <span>Tempo: {rhythm.tempo_bpm == null ? "—" : `${rhythm.tempo_bpm} BPM`}</span>
                            <span>Key: {key || "—"}</span>
                            <span>RMS: {displayNumber(run.dataset_summary?.technical?.rms_dbfs ?? null, " dBFS")}</span>
                          </div>
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-muted-foreground">Warnings and checksum</summary>
                            {run.warnings?.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{run.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No warnings saved.</p>}
                            <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">SHA-256 result checksum: {run.result_checksum}</p>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No analysis runs were returned for this track.</p>}
                <div>
                  <h4 className="text-xs font-semibold">Latest annotation revisions</h4>
                  {selectedTrackDetail.latest_annotation_revisions.length ? (
                    <div className="mt-2 space-y-1.5">
                      {selectedTrackDetail.latest_annotation_revisions.map((annotation) => (
                        <div key={`${annotation.field_key}-${annotation.created_at}`} className="flex flex-col gap-1 rounded-lg border border-border p-2 sm:flex-row sm:items-start sm:justify-between">
                          <span className="text-xs font-medium">{annotation.field_key}</span>
                          <span className="break-words text-xs text-muted-foreground">{JSON.stringify(annotation.field_value)} · {annotation.review_state} · {annotation.source}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="mt-1 text-xs text-muted-foreground">No annotation revisions saved.</p>}
                </div>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{libraryTotal} saved track{libraryTotal === 1 ? "" : "s"} · page {libraryPage}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={libraryLoading || libraryPage <= 1} onClick={() => void refreshCloudLibrary(libraryPage - 1)}>
                  Previous
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={libraryLoading || libraryPage * 10 >= libraryTotal} onClick={() => void refreshCloudLibrary(libraryPage + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {cloudSaveError ? <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{cloudSaveError}</p> : null}
        {cloudSaveNotice ? <p className="mt-3 rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground" role="status" aria-live="polite">{cloudSaveNotice}</p> : null}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="music-batch-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="music-batch-heading" className="text-base font-semibold">Batch analysis</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Analyze up to 20 tracks sequentially on this device. Audio is not uploaded. Interrupted work needs the original files selected again.</p>
          </div>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">{localBatch ? localBatch.status.replace(/_/g, " ") : "not started"}</span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:border-accent">
            Select tracks
            <input className="sr-only" type="file" multiple accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm" onChange={(event) => { selectBatchFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:border-accent">
            Select a folder (supported browsers)
            <input
              className="sr-only"
              type="file"
              multiple
              ref={(node) => {
                if (node) (node as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true;
              }}
              onChange={(event) => { selectBatchFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }}
            />
          </label>
        </div>
        <div
          className="mt-2 rounded-lg border border-dashed border-border bg-background px-3 py-4 text-center text-xs text-muted-foreground"
          aria-label="Drop audio files to add them to the local batch"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            selectBatchFiles(Array.from(event.dataTransfer.files));
          }}
        >
          Drop audio files here to add them to this local batch
        </div>
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <p className="text-sm font-medium">{batchSelection.length} selected file(s)</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatBytes(batchSelection.reduce((sum, item) => sum + item.size, 0))} total · each file up to 25 MiB · total selection up to 200 MiB · 2 minutes per track</p>
          {batchSelection.length ? <div className="mt-2 max-h-28 space-y-1 overflow-auto text-xs text-muted-foreground">{batchSelection.slice(0, 30).map((item, index) => <p key={index} className="break-all">{item.name} · {formatBytes(item.size)}</p>)}{batchSelection.length > 30 ? <p>…and {batchSelection.length - 30} more</p> : null}</div> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={batchBusy || batchCloudBusy || loudnessBusy || batchSelection.length === 0} onClick={() => void createBatchFromSelection()}>Create batch</Button>
          <Button type="button" disabled={!localBatch || batchBusy || batchCloudBusy || loudnessBusy || (localBatch.status === "completed" && countLocalMusicBatchItems(localBatch).queued === 0)} onClick={() => void runLocalBatch()}>{batchBusy ? <><LoaderCircle size={16} className="mr-2 animate-spin" />Analyzing batch…</> : "Start / resume"}</Button>
          <Button type="button" variant="outline" disabled={!localBatch || batchBusy || batchCloudBusy} onClick={() => void retryLocalBatchItems(true)}>Retry failed</Button>
          {batchBusy ? <Button type="button" variant="outline" onClick={() => void pauseLocalBatchAfterCurrent()}>Pause after track</Button> : null}
          {localBatch ? <Button type="button" variant="outline" disabled={batchCloudBusy} onClick={() => void cancelLocalBatch()}>Cancel batch</Button> : null}
        </div>
        {localBatch ? (() => {
          const counts = countLocalMusicBatchItems(localBatch);
          const cloudPending = localBatch.items.filter((item) => item.status === "completed" && item.result && !item.cloudSavedTrackId).length;
          return <div className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[["Total", counts.total], ["Queued", counts.queued], ["Running", counts.running], ["Complete", counts.completed], ["Failed", counts.failed], ["Need files", counts.waitingForFile]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border bg-background p-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-base font-semibold tabular-nums">{value}</p></div>)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => exportLocalBatch("zip")}>Export ZIP + manifest</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => exportLocalBatch("jsonl")}>Export JSONL</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => exportLocalBatch("csv")}>Export CSV summary</Button>
              <Button type="button" size="sm" variant="outline" disabled={batchBusy || batchCloudBusy || cloudPending === 0} onClick={() => void saveCompletedBatchToCloud()}>{batchCloudBusy ? `Saving dataset results ${Math.round(batchCloudProgress * 100)}%…` : `Save ${cloudPending} results to private dataset`}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => void retryLocalBatchItems(false)}>Retry failed / canceled</Button>
              <Button type="button" size="sm" variant="ghost" disabled={batchBusy} onClick={() => {
                const prior = batchHistory.find((entry) => entry.id !== localBatch.id);
                if (prior) { setLocalBatch(prior); setBatchError(""); setBatchMessage("Viewing a previous local batch. Re-select its source files to resume incomplete items."); }
              }}>Open previous batch</Button>
              <Button type="button" size="sm" variant="ghost" disabled={batchBusy || batchCloudBusy} onClick={() => void deleteCurrentLocalBatch()}>Delete local batch data</Button>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground sm:max-w-sm">
                Rights declaration for cloud result records
                <select className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground" value={batchRightsStatus} onChange={(event) => setBatchRightsStatus(event.currentTarget.value)}>
                  <option value="unknown">Not specified</option>
                  <option value="user_owned">I own these recordings</option>
                  <option value="permission_granted">Permission granted</option>
                  <option value="licensed">Licensed for this use</option>
                  <option value="public_domain">Public domain</option>
                  <option value="restricted">Restricted / do not redistribute</option>
                  <option value="not_applicable">Not applicable</option>
                </select>
              </label>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Saving sends structured reports and metadata only. It does not upload audio or verify ownership. Each result is saved independently; failures do not remove local or already-saved results.</p>
              {batchCloudMessage ? <p className="mt-2 text-xs" role="status" aria-live="polite">{batchCloudMessage}</p> : null}
              {batchCloudError ? <p className="mt-2 text-xs text-destructive" role="alert">{batchCloudError}</p> : null}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">The percentage is stage progress, not an ETA or a precise measure of CPU work; DSP progress comes from the worker callbacks and stage milestones are coarse. Completed results remain available after cancellation. Local batch history is browser storage, not a cloud backup.</p>
            <div className="space-y-2">
              {localBatch.items.map((item) => <div key={item.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm font-medium">{item.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatBytes(item.sizeBytes)} · {item.status.replace(/_/g, " ")} · {item.stage} · stage progress {Math.round(item.progress * 100)}%</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={item.name + " analysis stage progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}>
                      <div className="h-full rounded-full bg-accent" style={{ width: Math.round(item.progress * 100) + "%" }} />
                    </div>
                    {item.error ? <p className="mt-1 break-words text-xs text-destructive">{item.error}</p> : null}
                    {item.warnings.length ? <p className="mt-1 text-xs text-muted-foreground">{item.warnings.join(" · ")}</p> : null}
                    {item.status === "completed" && item.result ? <p className="mt-1 text-xs text-muted-foreground">Tempo {displayNumber(item.result.analysis.rhythm.tempo_bpm, " BPM")} · Key {item.result.analysis.tonality.key ?? "not available"} · source hash {item.sourceSha256 ? "computed locally" : "not computed"}</p> : null}
                    {item.cloudSavedTrackId ? <p className="mt-1 text-xs text-muted-foreground">Saved to private dataset</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {(item.status === "queued" || item.status === "waiting_for_file") && !batchBusy && !batchCloudBusy ? <Button type="button" size="sm" variant="ghost" onClick={() => void prioritizeLocalBatchItem(item.id)}>Run next</Button> : null}
                    {(item.status === "failed" || item.status === "canceled") && !batchBusy && !batchCloudBusy ? <Button type="button" size="sm" variant="ghost" onClick={() => void retryLocalBatchItem(item.id)}>Retry</Button> : null}
                    {item.status === "completed" && item.result ? <Button type="button" size="sm" variant="ghost" onClick={() => setExpandedBatchItemId((current) => current === item.id ? null : item.id)}>{expandedBatchItemId === item.id ? "Hide report" : "View report"}</Button> : null}
                    {(item.status === "queued" || item.status === "waiting_for_file" || item.status === "analyzing" || item.status === "decoding" || item.status === "validating") ? <Button type="button" size="sm" variant="ghost" disabled={batchCloudBusy} onClick={() => void cancelLocalBatchItem(item.id)}>{activeBatchItemRef.current === item.id ? "Cancel track" : "Skip track"}</Button> : null}
                  </div>
                </div>
                {expandedBatchItemId === item.id && item.status === "completed" && item.result ? <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface p-3 text-[11px] leading-4">{JSON.stringify({ track_id: item.id, file_name: item.name, source_sha256: item.sourceSha256, analysis: item.result.analysis, dataset_analysis: item.result.datasetAnalysis, annotations: item.result.annotations }, null, 2)}</pre> : null}
              </div>)}
            </div>
          </div>;
        })() : null}
        {batchHistory.length > 1 ? <div className="mt-3 flex flex-wrap gap-2">{batchHistory.slice(0, 5).map((entry) => <Button key={entry.id} type="button" size="sm" variant={entry.id === localBatch?.id ? "default" : "ghost"} onClick={() => { setLocalBatch(entry); setBatchError(""); setBatchMessage("Selected saved local batch. Original files may need to be reselected."); }}>{new Date(entry.createdAt).toLocaleString()} · {entry.status.replace(/_/g, " ")}</Button>)}</div> : null}
        {batchError ? <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{batchError}</p> : null}
        {batchMessage ? <p className="mt-3 rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground" role="status" aria-live="polite">{batchMessage}</p> : null}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><FileAudio size={18} aria-hidden="true" /> Audio source</div>
        <label className="mt-3 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-4 py-5 text-center transition hover:border-accent">
          <Upload size={24} className="mb-2 text-accent" aria-hidden="true" />
          <span className="text-sm font-medium">{file ? "Choose a different audio file" : "Select an audio file"}</span>
          <span className="mt-1 text-xs text-muted-foreground">MP3 · WAV · M4A · OGG · FLAC · WebM · up to 25 MB, 2 minutes and 64 MiB decoded PCM · processed locally</span>
          <input className="sr-only" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm" onChange={(event) => { chooseFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
        </label>
        {file ? (
          <div className="mt-3 rounded-xl border border-border bg-background p-3">
            <div className="flex items-start gap-3">
              <AudioLines size={20} className="mt-1 shrink-0 text-accent" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-semibold">{file.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatBytes(file.size)} · {file.type || "Audio format detected by browser"}</p>
              </div>
              <Button type="button" variant="ghost" onClick={() => chooseFile(null)}>Clear</Button>
            </div>
            {previewUrl ? <audio className="mt-3 w-full" controls preload="metadata" src={previewUrl} aria-label="Preview selected audio" /> : null}
          </div>
        ) : null}
        {busy ? <div className="mt-4" role="status" aria-live="polite"><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Local analysis</span><span>{Math.round(analysisProgress * 100)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(analysisProgress * 100)}%` }} /></div></div> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={!file || busy || loudnessBusy || batchBusy || batchCloudBusy || file.size > LOCAL_FILE_LIMIT} onClick={() => void runLocalAnalysis()}>{busy ? <><LoaderCircle size={16} className="mr-2 animate-spin" />Analyzing…</> : "Analyze on this device"}</Button>
          {busy ? <Button type="button" variant="outline" onClick={() => analysisControllerRef.current?.abort()}>Cancel analysis</Button> : null}
          <Button type="button" variant="outline" disabled={!analysis || !datasetAnalysis} onClick={exportSongProfile}><FileJson size={16} className="mr-2" />Song profile JSON</Button>
          <Button type="button" variant="ghost" disabled={!analysis || !datasetAnalysis} onClick={exportJson}><FileJson size={16} className="mr-2" />Training metadata JSON</Button>
          <Button type="button" variant="outline" disabled={!file || !datasetAnalysis || layersBusy} onClick={() => void exportSignalLayers()}>{layersBusy ? <><LoaderCircle size={16} className="mr-2 animate-spin" />Preparing layers…</> : <><FolderArchive size={16} className="mr-2" />Signal layers ZIP ({layerExportLimitSeconds()}s max)</>}</Button>
          <Button type="button" disabled={!analysis || !datasetAnalysis || savingCloud} onClick={() => void saveAnalysisToCloud()}>
            {savingCloud ? <><LoaderCircle size={16} className="mr-2 animate-spin" />Saving results…</> : "Save results to private dataset"}
          </Button>
        </div>
        <div className="mt-4 rounded-xl border border-border bg-background p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">FFmpeg ebur128 loudness report (optional)</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Separate from local analysis. This uses the configured enV FFmpeg processor’s ebur128 meter for integrated LUFS, loudness range, sample peak and true peak. No AI model is used. The measurement implementation still needs the full licensed reference-sequence benchmark before it can be treated as broadcast-compliance verification. Your selected audio is uploaded only after you give permission below and press Measure.</p>
            </div>
            <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">Optional upload</span>
          </div>
          <label className="mt-3 flex items-start gap-2 text-xs leading-5">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={loudnessUploadConsent}
              disabled={loudnessBusy || !file}
              onChange={(event) => { setLoudnessUploadConsent(event.currentTarget.checked); setLoudnessError(""); }}
            />
            <span>I explicitly authorize sending this selected audio file to the configured enV media processor for this loudness measurement. This is not the local-only path.</span>
          </label>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">The processor limit is 15 minutes and its configured upload-size limit applies; the default same-origin gateway is limited to 4 MiB. Processing uses temporary per-request files and attempts cleanup. The verified server hash identifies the bytes received by that processor. Do not use this mode for audio you are not authorized to upload.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!file || !loudnessUploadConsent || loudnessBusy || busy || batchBusy || batchCloudBusy} onClick={() => void runStandardsLoudnessMeasurement()}>
              {loudnessBusy ? <><LoaderCircle size={16} className="mr-2 animate-spin" />Measuring…</> : "Measure with FFmpeg ebur128"}
            </Button>
            {loudnessBusy ? <Button type="button" variant="ghost" onClick={() => loudnessControllerRef.current?.abort()}>Cancel meter</Button> : null}
            {standardLoudnessReport ? <Button type="button" variant="ghost" onClick={exportStandardLoudnessReport}><FileJson size={16} className="mr-2" />Export meter JSON</Button> : null}
          </div>
          {loudnessStage ? <p className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">{loudnessStage}</p> : null}
          {loudnessError ? <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive" role="alert">{loudnessError}</p> : null}
          {standardLoudnessReport ? <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Integrated loudness", value: displayNumber(standardLoudnessReport.measurement.integrated_loudness_lufs, " LUFS") },
                { label: "Loudness range", value: displayNumber(standardLoudnessReport.measurement.loudness_range_lu, " LU") },
                { label: "Sample peak", value: displayNumber(standardLoudnessReport.measurement.sample_peak_dbfs, " dBFS") },
                { label: "True peak", value: displayNumber(standardLoudnessReport.measurement.true_peak_dbtp, " dBTP") },
              ].map((metric) => <div key={metric.label} className="rounded-lg border border-border bg-surface p-3">
                <p className="text-[11px] text-muted-foreground">{metric.label}</p>
                <p className="mt-1 break-words text-lg font-semibold">{metric.value}</p>
              </div>)}
            </div>
            {standardLoudnessReport.measurement.status === "unavailable" ? <p className="text-xs text-muted-foreground">Loudness unavailable: {standardLoudnessReport.measurement.unavailable_reason}</p> : null}
            <div className="rounded-lg border border-border p-3 text-[11px] leading-5 text-muted-foreground">
              <p>Engine: {standardLoudnessReport.engine.binary_version} · {standardLoudnessReport.engine.filter}</p>
              <p>Measured scope: {standardLoudnessReport.measurement.scope_seconds.toFixed(3)} seconds · {standardLoudnessReport.source.sample_rate_hz.toLocaleString()} Hz · {standardLoudnessReport.source.channels} channel(s)</p>
              <p>SHA-256 verified by processor: {standardLoudnessReport.source.file_sha256.slice(0, 12)}… · checksum verified</p>
              <p className="mt-1">{standardLoudnessReport.measurement.standards_reference}</p>
            </div>
          </div> : null}
        </div>
        {analysis && datasetAnalysis ? (
          <div className="mt-3 rounded-xl border border-border bg-background p-3">
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground sm:max-w-sm">
              Rights / permission status
              <select
                className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
                value={rightsStatus}
                onChange={(event) => setRightsStatus(event.currentTarget.value)}
              >
                <option value="unknown">Not specified</option>
                <option value="user_owned">I own this recording</option>
                <option value="permission_granted">Permission granted</option>
                <option value="licensed">Licensed for this use</option>
                <option value="public_domain">Public domain</option>
                <option value="restricted">Restricted / do not redistribute</option>
                <option value="not_applicable">Not applicable</option>
              </select>
            </label>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Only JSON analysis results, metadata, feature frames, and labels are sent for cloud saving. The original audio file is not attached or stored by this save action. This records your rights declaration; it does not verify ownership.</p>
          </div>
        ) : null}
        {error ? <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p> : null}
        {notice ? <p className="mt-3 rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground" role="status" aria-live="polite">{notice}</p> : null}
      </section>

      {analysis ? (
        <>
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div><h2 className="text-lg font-semibold">Audio measurements</h2><p className="mt-1 text-xs text-muted-foreground">Computed from decoded samples, not guessed from the filename.</p></div>
              <span className="rounded-full border border-border px-2.5 py-1 text-xs">{analysis.audio.channels} channel{analysis.audio.channels === 1 ? "" : "s"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {metricCards.map((card) => <div key={card.label} className="min-w-0 rounded-xl border border-border bg-surface p-3 sm:p-4"><p className="text-xs text-muted-foreground">{card.label}</p><p className="mt-2 break-words text-xl font-semibold tracking-tight sm:text-2xl">{card.value}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{card.hint}</p></div>)}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Local feature analysis</h2>
            <p className="mt-1 text-sm text-muted-foreground">These measurements are computed from the decoded samples. They are not AI-generated classifications.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[
                { label: "Dominant pitch range", value: datasetAnalysis?.pitch.lowest_detected_note && datasetAnalysis.pitch.highest_detected_note ? `${datasetAnalysis.pitch.lowest_detected_note}–${datasetAnalysis.pitch.highest_detected_note}` : "Not enough stable pitch" },
                { label: "Pitch observations", value: String(datasetAnalysis?.pitch.points.length ?? 0) },
                { label: "Chord estimates", value: String(datasetAnalysis?.tonality.chord_estimates.filter((chord) => chord.chord).length ?? 0) },
                { label: "Transient density", value: displayNumber(datasetAnalysis?.rhythm.transient_density_per_second ?? null, " / sec") },
                { label: "Crest factor", value: displayNumber(datasetAnalysis?.technical.crest_factor_db ?? null, " dB") },
                { label: "Dynamic range estimate", value: displayNumber(datasetAnalysis?.technical.dynamic_range_estimate_db ?? null, " dB") },
                { label: "Low-band energy", value: displayNumber(datasetAnalysis?.timbre.mean_low_frequency_energy_ratio === null || datasetAnalysis?.timbre.mean_low_frequency_energy_ratio === undefined ? null : datasetAnalysis.timbre.mean_low_frequency_energy_ratio * 100, "%") },
                { label: "Mid-band energy", value: displayNumber(datasetAnalysis?.timbre.mean_mid_frequency_energy_ratio === null || datasetAnalysis?.timbre.mean_mid_frequency_energy_ratio === undefined ? null : datasetAnalysis.timbre.mean_mid_frequency_energy_ratio * 100, "%") },
                { label: "High-band energy", value: displayNumber(datasetAnalysis?.timbre.mean_high_frequency_energy_ratio === null || datasetAnalysis?.timbre.mean_high_frequency_energy_ratio === undefined ? null : datasetAnalysis.timbre.mean_high_frequency_energy_ratio * 100, "%") },
                { label: "Stereo side/mid ratio", value: displayNumber(datasetAnalysis?.technical.stereo_side_to_mid_ratio ?? null) },
                { label: "Detected feature changes", value: String(datasetAnalysis?.structure.change_points.length ?? 0) },
                { label: "Signal frames", value: String(datasetAnalysis?.timeline.length ?? 0) },
              ].map((item) => <div key={item.label} className="min-w-0 rounded-lg border border-border bg-background p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 break-words text-sm font-semibold">{item.value}</p></div>)}
            </div>
            {datasetAnalysis ? <div className="mt-4 space-y-3">
              <div><h3 className="text-sm font-semibold">Estimated chord timeline</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Approximate triad guesses based on spectral chroma, not confirmed note transcription.</p><div className="mt-2 flex flex-wrap gap-1.5">{datasetAnalysis.tonality.chord_estimates.slice(0, 30).map((chord) => <span key={`${chord.start_seconds}-${chord.chord}`} className="rounded-md border border-border px-2 py-1 text-xs">{Math.floor(chord.start_seconds)}–{Math.floor(chord.end_seconds)}s: {chord.chord ?? "Unknown"}</span>)}</div></div>
              <div><h3 className="text-sm font-semibold">Automatic section boundaries</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{datasetAnalysis.structure.note}</p><div className="mt-2 flex flex-wrap gap-1.5">{datasetAnalysis.structure.sections.slice(0, 24).map((section) => <span key={section.label} className="rounded-md border border-border px-2 py-1 text-xs">{section.label}: {Math.floor(section.start_seconds)}–{Math.floor(section.end_seconds)}s</span>)}</div></div>
              <div>
                <h3 className="text-sm font-semibold">Repeated passage candidates</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{datasetAnalysis.structure.repetition_note}</p>
                {datasetAnalysis.structure.repetition_candidates.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {datasetAnalysis.structure.repetition_candidates.slice(0, 12).map((candidate) => (
                      <span key={`${candidate.start_seconds}-${candidate.match_start_seconds}`} className="rounded-md border border-border px-2 py-1 text-xs">
                        {Math.floor(candidate.start_seconds)}–{Math.floor(candidate.end_seconds)}s ↔ {Math.floor(candidate.match_start_seconds)}–{Math.floor(candidate.match_end_seconds)}s · similarity {Math.round(candidate.similarity_score * 100)}%
                      </span>
                    ))}
                  </div>
                ) : <p className="mt-2 text-xs text-muted-foreground">No strong repeated passage candidates found in this clip.</p>}
              </div>
              <div><h3 className="text-sm font-semibold">Measured style clues</h3><div className="mt-2 space-y-2">{datasetAnalysis.style_cues.map((cue) => <div key={cue.tag} className="rounded-lg bg-background p-3"><p className="text-sm font-medium">{cue.tag.replace(/-/g, " ")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{cue.evidence}</p></div>)}</div></div>
              <p className="rounded-lg border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">{datasetAnalysis.pitch.note} {datasetAnalysis.separation.note}</p>
            </div> : null}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Training labels</h2>
            <p className="mt-1 text-sm text-muted-foreground">Semantic labels are deliberately human-supplied in this no-model workflow. Separate measurable facts from listening judgments; these labels will be included in the exported dataset.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ANNOTATION_FIELDS.map((field) => <label key={field.key} className="block min-w-0"><span className="mb-1.5 block text-xs font-semibold">{field.label}</span><input className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" value={annotations[field.key].join(", ")} placeholder={field.placeholder} onChange={(event) => updateAnnotationList(field.key, event.currentTarget.value)} /></label>)}
            </div>
            <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold">Annotation notes</span><textarea className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" value={annotations.notes} placeholder="Describe the musical parts, changes, uncertainty, or what another annotator should verify." onChange={(event) => setAnnotations((current) => ({ ...current, notes: event.currentTarget.value.slice(0, 4000), reviewed: false }))} /></label>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={annotations.reviewed} onChange={(event) => setAnnotations((current) => ({ ...current, reviewed: event.currentTarget.checked }))} />Reviewed for dataset use</label>
              <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">Reviewer <input className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" value={annotations.reviewer ?? ""} placeholder="Reviewer initials or team ID" onChange={(event) => setAnnotations((current) => ({ ...current, reviewer: event.currentTarget.value.slice(0, 100), reviewed: false }))} /></label>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h2 className="text-lg font-semibold">File tags and signal detail</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Tagged title", value: analysis.metadata.title },
                { label: "Artist", value: analysis.metadata.artist },
                { label: "Album", value: analysis.metadata.album },
                { label: "Embedded genre", value: analysis.metadata.embedded_genre },
                { label: "Spectral centroid", value: displayNumber(analysis.timbre.spectral_centroid_hz, " Hz") },
                { label: "Spectral rolloff (85%)", value: displayNumber(analysis.timbre.spectral_rolloff_85_hz, " Hz") },
                { label: "Spectral flatness", value: displayNumber(analysis.timbre.spectral_flatness) },
                { label: "Zero-crossing rate", value: displayNumber(analysis.timbre.zero_crossing_rate) },
                { label: "Windowed RMS spread", value: displayNumber(analysis.audio.windowed_rms_spread_db, " dB") },
                { label: "Tagged BPM", value: displayNumber(analysis.metadata.tagged_bpm, " BPM") },
                { label: "Sample rate", value: analysis.audio.sample_rate_hz.toLocaleString() + " Hz" },
                { label: "Analyzed section", value: analysis.audio.metric_scope_seconds + " sec for timbre features" },
              ].map((item) => <div key={item.label} className="min-w-0 rounded-lg border border-border bg-background p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 break-words text-sm font-medium">{item.value ?? "No embedded tag"}</p></div>)}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
