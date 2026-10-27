import type { MusicAnalysisResult } from "../engines/music-analysis.ts";
import type { MusicDatasetAnalysis, MusicDatasetAnnotations } from "../engines/music-dataset-analysis.ts";

export const MUSIC_LOCAL_BATCH_SCHEMA_VERSION = "env.music-analysis-batch.v1" as const;
export const MUSIC_LOCAL_BATCH_LIMITS = {
  maxItems: 20,
  maxFileBytes: 25 * 1024 * 1024,
  maxTotalBytes: 200 * 1024 * 1024,
  maxDurationSeconds: 120,
  retainedBatchList: 10,
} as const;

export type LocalMusicBatchStatus = "created" | "running" | "paused" | "completed" | "completed_with_errors" | "canceled";
export type LocalMusicBatchItemStatus = "queued" | "validating" | "decoding" | "analyzing" | "waiting_for_file" | "completed" | "failed" | "canceled";
export type LocalMusicBatchStage = "queued" | "validation" | "decode" | "dsp" | "persist" | "complete";

export type LocalMusicFileDescriptor = {
  name: string;
  sizeBytes: number;
  lastModified: number;
  mimeType?: string;
  relativePath?: string;
};

export type LocalMusicBatchItem = LocalMusicFileDescriptor & {
  id: string;
  status: LocalMusicBatchItemStatus;
  stage: LocalMusicBatchStage;
  progress: number;
  createdAt: string;
  updatedAt: string;
  sourceSha256: string | null;
  error: string | null;
  warnings: string[];
  result: {
    analysis: MusicAnalysisResult;
    datasetAnalysis: MusicDatasetAnalysis;
    annotations: MusicDatasetAnnotations;
  } | null;
};

export type LocalMusicBatch = {
  schemaVersion: typeof MUSIC_LOCAL_BATCH_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  updatedAt: string;
  status: LocalMusicBatchStatus;
  executionMode: "browser_local";
  totalBytes: number;
  items: LocalMusicBatchItem[];
};

export type LocalMusicBatchCounts = {
  total: number;
  queued: number;
  running: number;
  waitingForFile: number;
  completed: number;
  failed: number;
  canceled: number;
};

export type LocalMusicBatchOptions = {
  id?: string;
  now?: string;
};

const SUPPORTED_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "flac", "webm"]);
const TERMINAL_ITEM_STATES = new Set<LocalMusicBatchItemStatus>(["completed", "failed", "canceled"]);
const ACTIVE_ITEM_STATES = new Set<LocalMusicBatchItemStatus>(["validating", "decoding", "analyzing"]);

const NEXT_STATES: Record<LocalMusicBatchItemStatus, readonly LocalMusicBatchItemStatus[]> = {
  queued: ["validating", "waiting_for_file", "canceled", "failed"],
  validating: ["decoding", "failed", "canceled", "waiting_for_file"],
  decoding: ["analyzing", "failed", "canceled", "waiting_for_file"],
  analyzing: ["completed", "failed", "canceled", "waiting_for_file"],
  waiting_for_file: ["queued", "canceled"],
  completed: [],
  failed: ["queued"],
  canceled: ["queued"],
};

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  throw new Error("Secure random ID generation is unavailable in this environment.");
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function duplicateKey(file: LocalMusicFileDescriptor): string {
  const path = (file.relativePath || file.name).normalize("NFC").replace(/\\/g, "/");
  return [path, file.sizeBytes, file.lastModified].join("\u0000");
}

export function createLocalMusicBatch(
  files: readonly LocalMusicFileDescriptor[],
  options: LocalMusicBatchOptions = {},
): LocalMusicBatch {
  if (!files.length) throw new Error("Select at least one audio file for a batch.");
  if (files.length > MUSIC_LOCAL_BATCH_LIMITS.maxItems) {
    throw new Error("A local batch can contain at most 20 files. Split the selection into smaller batches.");
  }
  for (const file of files) {
    if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0) throw new Error("A selected file has an invalid size.");
    if (!Number.isSafeInteger(file.lastModified) || file.lastModified < 0) throw new Error("A selected file has invalid file metadata.");
  }
  const totalBytes = files.reduce((total, file) => total + file.sizeBytes, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > MUSIC_LOCAL_BATCH_LIMITS.maxTotalBytes) {
    throw new Error("The selection exceeds the 200 MiB total batch limit. Split it into smaller batches.");
  }

  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? makeId();
  const seen = new Set<string>();
  const items: LocalMusicBatchItem[] = files.map((file, index) => {
    const key = duplicateKey(file);
    const duplicate = seen.has(key);
    seen.add(key);
    const ext = extension(file.name);
    let error: string | null = null;
    if (duplicate) error = "This exact file selection appears more than once in the batch.";
    else if (!SUPPORTED_EXTENSIONS.has(ext)) error = "Unsupported file type. Choose MP3, WAV, M4A, OGG, FLAC or WebM.";
    else if (file.sizeBytes <= 0) error = "The selected file is empty.";
    else if (file.sizeBytes > MUSIC_LOCAL_BATCH_LIMITS.maxFileBytes) error = "This file exceeds the 25 MiB on-device limit.";
    return {
      ...file,
      id: id + "-" + String(index + 1).padStart(3, "0"),
      status: error ? "failed" : "queued",
      stage: error ? "validation" : "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      sourceSha256: null,
      error,
      warnings: [],
      result: null,
    };
  });

  return {
    schemaVersion: MUSIC_LOCAL_BATCH_SCHEMA_VERSION,
    id,
    createdAt: now,
    updatedAt: now,
    status: "created",
    executionMode: "browser_local",
    totalBytes,
    items,
  };
}

export function countLocalMusicBatchItems(batch: LocalMusicBatch): LocalMusicBatchCounts {
  const counts: LocalMusicBatchCounts = {
    total: batch.items.length,
    queued: 0,
    running: 0,
    waitingForFile: 0,
    completed: 0,
    failed: 0,
    canceled: 0,
  };
  for (const item of batch.items) {
    if (item.status === "queued") counts.queued += 1;
    else if (ACTIVE_ITEM_STATES.has(item.status)) counts.running += 1;
    else if (item.status === "waiting_for_file") counts.waitingForFile += 1;
    else if (item.status === "completed") counts.completed += 1;
    else if (item.status === "failed") counts.failed += 1;
    else if (item.status === "canceled") counts.canceled += 1;
  }
  return counts;
}

export function updateLocalMusicBatchItem(
  batch: LocalMusicBatch,
  itemId: string,
  patch: Partial<Pick<LocalMusicBatchItem, "status" | "stage" | "progress" | "updatedAt" | "sourceSha256" | "error" | "warnings" | "result">>,
  now = new Date().toISOString(),
): LocalMusicBatch {
  let found = false;
  const items = batch.items.map((item) => {
    if (item.id !== itemId) return item;
    found = true;
    const progress = patch.progress === undefined ? item.progress : Math.max(item.progress, Math.max(0, Math.min(1, patch.progress)));
    return { ...item, ...patch, progress, updatedAt: now };
  });
  if (!found) throw new Error("The batch item was not found.");
  return { ...batch, items, updatedAt: now };
}

export function transitionLocalMusicBatchItem(
  batch: LocalMusicBatch,
  itemId: string,
  nextStatus: LocalMusicBatchItemStatus,
  patch: Partial<Pick<LocalMusicBatchItem, "stage" | "progress" | "sourceSha256" | "error" | "warnings" | "result">> = {},
  now = new Date().toISOString(),
): LocalMusicBatch {
  const item = batch.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("The batch item was not found.");
  if (item.status !== nextStatus && !NEXT_STATES[item.status].includes(nextStatus)) {
    throw new Error("Illegal local batch item transition: " + item.status + " -> " + nextStatus + ".");
  }
  const statusPatch: Partial<Pick<LocalMusicBatchItem, "stage" | "progress" | "sourceSha256" | "error" | "warnings" | "result">> = { ...patch };
  if (nextStatus === "completed") {
    statusPatch.stage = "complete";
    statusPatch.progress = 1;
    statusPatch.error = null;
  }
  if (nextStatus === "queued") {
    statusPatch.stage = "queued";
    statusPatch.progress = 0;
    statusPatch.error = null;
    statusPatch.result = null;
    statusPatch.sourceSha256 = null;
    statusPatch.warnings = [];
  }
  const updated = updateLocalMusicBatchItem(batch, itemId, { ...statusPatch, status: nextStatus }, now);
  const status: LocalMusicBatchStatus = nextStatus === "validating" || nextStatus === "decoding" || nextStatus === "analyzing"
    ? "running"
    : updated.status;
  return { ...updated, status, updatedAt: now };
}

export function finalizeLocalMusicBatch(batch: LocalMusicBatch, now = new Date().toISOString()): LocalMusicBatch {
  const counts = countLocalMusicBatchItems(batch);
  if (counts.running > 0) return { ...batch, status: "running", updatedAt: now };
  if (batch.status === "canceled") return { ...batch, status: "canceled", updatedAt: now };
  if (counts.queued > 0 || counts.waitingForFile > 0) return { ...batch, status: "paused", updatedAt: now };
  if (counts.failed > 0 || counts.canceled > 0) return { ...batch, status: "completed_with_errors", updatedAt: now };
  return { ...batch, status: "completed", updatedAt: now };
}

/** After a reload, an in-flight browser job is not claimed as complete or resumable without its source file. */
export function recoverLocalMusicBatch(batch: LocalMusicBatch, now = new Date().toISOString()): LocalMusicBatch {
  const items = batch.items.map((item) => {
    if (ACTIVE_ITEM_STATES.has(item.status) || item.status === "queued") {
      return {
        ...item,
        status: "waiting_for_file" as const,
        stage: "queued" as const,
        progress: 0,
        error: "The browser session ended before this item finished. Select the original file again to resume.",
        updatedAt: now,
      };
    }
    return item;
  });
  const recovered = { ...batch, items, status: "paused" as const, updatedAt: now };
  return recovered;
}

export function localMusicBatchExport(batch: LocalMusicBatch, exportedAt = new Date().toISOString()) {
  const counts = countLocalMusicBatchItems(batch);
  return {
    schema_version: MUSIC_LOCAL_BATCH_SCHEMA_VERSION,
    execution_mode: "browser_local" as const,
    batch_id: batch.id,
    created_at: batch.createdAt,
    exported_at: exportedAt,
    status: batch.status,
    counts,
    items: batch.items.map((item) => ({
      id: item.id,
      file_name: item.name,
      file_size_bytes: item.sizeBytes,
      last_modified_ms: item.lastModified,
      status: item.status,
      stage: item.stage,
      progress: item.progress,
      source_sha256: item.sourceSha256,
      source_sha256_scope: item.sourceSha256 ? "exact-original-file-bytes-local-unverified" : "not-computed",
      error: item.error,
      warnings: item.warnings,
      result_path: item.status === "completed" && item.result ? "tracks/" + item.id + ".json" : null,
      updated_at: item.updatedAt,
    })),
    note: "This batch ran in the browser on this device. No source audio was uploaded. Jobs interrupted by a browser close require the original file to be selected again. SHA-256 values are locally computed exact-file hashes, not server-verified identities.",
  };
}

const DB_NAME = "env-music-analyzer-local-batches";
const DB_VERSION = 1;
const STORE_NAME = "batches";
let databasePromise: Promise<IDBDatabase> | null = null;

function openBatchDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Local batch persistence is unavailable in this browser. Use single-track analysis or export results manually."));
  }
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open local batch storage."));
    request.onblocked = () => reject(new Error("Local batch storage is blocked by another tab. Close older enV tabs and retry."));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

export async function saveLocalMusicBatch(batch: LocalMusicBatch): Promise<void> {
  const database = await openBatchDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(batch);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not persist batch progress."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local batch persistence was aborted."));
  });
}

export async function listLocalMusicBatches(): Promise<LocalMusicBatch[]> {
  const database = await openBatchDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const batches = (request.result as LocalMusicBatch[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      resolve(batches.slice(0, MUSIC_LOCAL_BATCH_LIMITS.retainedBatchList));
    };
    request.onerror = () => reject(request.error ?? new Error("Could not read local batch history."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Could not read local batch history."));
  });
}

export async function deleteLocalMusicBatch(batchId: string): Promise<void> {
  const database = await openBatchDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(batchId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not delete local batch history."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Could not delete local batch history."));
  });
}
