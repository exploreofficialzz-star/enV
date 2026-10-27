import { createHash, randomUUID } from "node:crypto";

const MAX_FILE_BYTES = 250 * 1024 * 1024;
const MAX_FEATURE_FRAMES = 5_000;
const MAX_EVENTS = 10_000;
const RIGHTS_STATUS = new Set(["unknown", "user_owned", "permission_granted", "licensed", "public_domain", "restricted", "not_applicable"]);
const ANNOTATION_LIST_FIELDS = [
  "genre", "sub_style", "style_influences", "language", "energy", "mood", "source_role",
  "vocals", "vocal_delivery", "vocal_register", "vocal_harmony", "performance_technique",
  "instruments", "themes", "listening_scene", "production_traits", "arrangement",
] as const;

type JsonRecord = Record<string, unknown>;
type EventRow = { event_type: string; event_index: number; start_seconds: number; end_seconds: number | null; payload: JsonRecord };

export class MusicDatasetInputError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 400, code = "INVALID_MUSIC_DATASET_INPUT") {
    super(message);
    this.name = "MusicDatasetInputError";
    this.status = status;
    this.code = code;
  }
}

function object(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}
function string(value: unknown, maximum = 500): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length > 0 && result.length <= maximum ? result : null;
}
function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function integer(value: unknown): number | null {
  const result = finite(value);
  return result !== null && Number.isSafeInteger(result) ? result : null;
}
function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function normalizeHash(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (!isSha256(input)) throw new MusicDatasetInputError("The source SHA-256 must be 64 hexadecimal characters or null.");
  return input.toLowerCase();
}
function boundedStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) return [];
  if (value.length > 80) throw new MusicDatasetInputError("Annotation field " + field + " contains too many values.");
  return value.map((item) => string(item, 160)).filter((item): item is string => item !== null);
}
function cloneWithoutArrays(dataset: JsonRecord): JsonRecord {
  const pitch = object(dataset.pitch) ?? {};
  const tonality = object(dataset.tonality) ?? {};
  const structure = object(dataset.structure) ?? {};
  const annotations = object(dataset.annotations) ?? {};
  const blankAnnotations: JsonRecord = { ...annotations };
  for (const field of ANNOTATION_LIST_FIELDS) blankAnnotations[field] = [];
  blankAnnotations.notes = "";
  blankAnnotations.reviewer = null;
  blankAnnotations.reviewed = false;
  return {
    ...dataset,
    timeline: [],
    pitch: { ...pitch, points: [] },
    tonality: { ...tonality, chord_estimates: [] },
    structure: { ...structure, change_points: [], sections: [], repetition_candidates: [] },
    annotations: blankAnnotations,
  };
}
function buildEvents(dataset: JsonRecord): EventRow[] {
  const pitch = object(dataset.pitch) ?? {};
  const tonality = object(dataset.tonality) ?? {};
  const structure = object(dataset.structure) ?? {};
  const events: EventRow[] = [];
  const append = (eventType: EventRow["event_type"], value: unknown, mode: "interval" | "point") => {
    if (value === undefined || value === null) return;
    if (!Array.isArray(value)) throw new MusicDatasetInputError("A time-aligned result field is not an array.");
    if (events.length + value.length > MAX_EVENTS) throw new MusicDatasetInputError("The analysis contains too many time-aligned events to save in one operation.", 413, "MUSIC_DATASET_EVENTS_TOO_LARGE");
    value.forEach((entry, index) => {
      const row = object(entry);
      if (!row) throw new MusicDatasetInputError("A time-aligned result contains a malformed event.");
      const start = finite(row.start_seconds) ?? finite(row.time_seconds) ?? finite(row.match_start_seconds);
      const end = finite(row.end_seconds) ?? finite(row.match_end_seconds);
      if (start === null || start < 0 || (end !== null && end < start)) throw new MusicDatasetInputError("A time-aligned event has an invalid timestamp.");
      events.push({
        event_type: eventType,
        event_index: index,
        start_seconds: start,
        end_seconds: mode === "point" ? null : end,
        payload: row,
      });
    });
  };
  append("pitch_point", pitch.points, "point");
  append("chord_candidate", tonality.chord_estimates, "interval");
  append("change_point", structure.change_points, "point");
  append("section_candidate", structure.sections, "interval");
  append("repetition_candidate", structure.repetition_candidates, "interval");
  return events;
}
function buildAnnotations(dataset: JsonRecord, userId: string): Array<JsonRecord> {
  const annotations = object(dataset.annotations) ?? {};
  const reviewed = annotations.reviewed === true;
  const note = typeof annotations.notes === "string" ? annotations.notes.slice(0, 2_000) : "";
  const rows: Array<JsonRecord> = [];
  for (const field of ANNOTATION_LIST_FIELDS) {
    const values = boundedStringList(annotations[field], field);
    if (!values.length) continue;
    rows.push({
      id: randomUUID(),
      field_key: field,
      field_value: values,
      source: reviewed ? "human_review" : "user_provided",
      review_state: reviewed ? "confirmed" : "unreviewed",
      reviewer_id: reviewed ? userId : null,
      evidence: { reviewer_label: string(annotations.reviewer, 120) },
      notes: note,
    });
  }
  if (note) {
    rows.push({
      id: randomUUID(),
      field_key: "notes",
      field_value: note,
      source: reviewed ? "human_review" : "user_provided",
      review_state: reviewed ? "confirmed" : "unreviewed",
      reviewer_id: reviewed ? userId : null,
      evidence: {},
      notes: note,
    });
  }
  return rows;
}
export function validateMusicDatasetSaveBody(input: unknown, userId: string) {
  const body = object(input);
  if (!body) throw new MusicDatasetInputError("The dataset save body must be a JSON object.");
  const file = object(body.file);
  const analysis = object(body.analysis);
  const dataset = object(body.dataset_analysis);
  if (!file || !analysis || !dataset) throw new MusicDatasetInputError("Send a file summary, detailed analysis and dataset analysis.");
  if (analysis.schema_version !== "env.music-analysis.v2") throw new MusicDatasetInputError("Only env.music-analysis.v2 reports can be saved.");
  if (dataset.schema_version !== "env.music-dataset-analysis.v2") throw new MusicDatasetInputError("Only env.music-dataset-analysis.v2 reports can be saved.");
  const source = object(analysis.source);
  const audio = object(analysis.audio);
  const datasetSource = object(dataset.source);
  if (!source || !audio || !datasetSource) throw new MusicDatasetInputError("The analysis is missing source or technical measurements.");
  const fileName = string(file.name, 255) ?? string(source.file_name, 255);
  const fileSize = integer(file.size_bytes ?? source.file_size_bytes);
  const duration = finite(audio.duration_seconds);
  const sampleRate = integer(audio.sample_rate_hz ?? datasetSource.sample_rate_hz);
  const channels = integer(audio.channels ?? datasetSource.channels);
  if (!fileName || fileName.includes("\u0000")) throw new MusicDatasetInputError("A valid source filename is required.");
  if (fileSize === null || fileSize < 0 || fileSize > MAX_FILE_BYTES) throw new MusicDatasetInputError("The recorded source file size is outside the supported metadata limit.");
  if (duration === null || duration <= 0 || duration > 900) throw new MusicDatasetInputError("The recorded duration must be greater than zero and no longer than 15 minutes.");
  if (sampleRate === null || sampleRate < 1_000 || sampleRate > 768_000) throw new MusicDatasetInputError("The recorded sample rate is outside the supported range.");
  if (channels === null || channels < 1 || channels > 64) throw new MusicDatasetInputError("The recorded channel count is outside the supported range.");
  const bodyHash = normalizeHash(file.source_sha256);
  const analysisFingerprint = object(analysis.fingerprint) ?? {};
  const datasetFingerprint = object(dataset.fingerprint) ?? {};
  const analysisHash = normalizeHash(analysisFingerprint.file_sha256);
  const datasetHash = normalizeHash(datasetFingerprint.file_sha256);
  const knownHashes = [bodyHash, analysisHash, datasetHash].filter((item): item is string => item !== null);
  if (new Set(knownHashes).size > 1) throw new MusicDatasetInputError("The file, detailed report and dataset report contain different source hashes.");
  const sourceSha256 = knownHashes[0] ?? null;
  const rightsStatus = string(file.rights_status, 40) ?? "unknown";
  if (!RIGHTS_STATUS.has(rightsStatus)) throw new MusicDatasetInputError("The rights status is not recognized.");
  const idempotencyKey = string(body.idempotency_key, 64);
  if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    throw new MusicDatasetInputError("A UUID idempotency_key is required so retrying a save cannot create duplicate records.");
  }
  const timeline = dataset.timeline;
  if (!Array.isArray(timeline) || timeline.length > MAX_FEATURE_FRAMES) throw new MusicDatasetInputError("The timeline is missing or too large to save safely.", 413, "MUSIC_DATASET_FRAMES_TOO_LARGE");
  const frames = timeline.map((item, index) => {
    const row = object(item);
    if (!row) throw new MusicDatasetInputError("A feature frame is malformed.");
    const start = finite(row.start_seconds);
    const end = finite(row.end_seconds);
    if (start === null || end === null || start < 0 || end <= start || end > duration + 1) throw new MusicDatasetInputError("A feature frame has invalid time boundaries.");
    return { frame_index: index, start_seconds: start, end_seconds: end, features: row };
  });
  const events = buildEvents(dataset);
  const annotations = buildAnnotations(dataset, userId);
  const mimeType = string(file.mime_type, 120);
  const sourceMetadata = object(file.source_metadata) ?? object(analysis.metadata) ?? {};
  const normalizedMetadata = object(file.normalized_metadata) ?? sourceMetadata;
  const searchText = [
    fileName,
    sourceMetadata.title, sourceMetadata.artist, sourceMetadata.album, sourceMetadata.album_artist,
    normalizedMetadata.title, normalizedMetadata.artist, normalizedMetadata.album,
  ].filter((value) => typeof value === "string").join(" ").slice(0, 4_000);
  const id = randomUUID();
  const runId = randomUUID();
  const resultJson = JSON.stringify({ analysis, dataset_analysis: dataset });
  const resultChecksum = createHash("sha256").update(resultJson).digest("hex");
  const analysisSummary = analysis;
  const datasetSummary = cloneWithoutArrays(dataset);
  return {
    fileName, fileSize, mimeType, duration, sampleRate, channels, sourceSha256, rightsStatus, idempotencyKey,
    sourceMetadata, normalizedMetadata, searchText, analysis, dataset, frames, events, annotations,
    analysisSummary, datasetSummary, resultChecksum, trackId: id, runId,
  };
}
