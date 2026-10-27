type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, field: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Invalid music-analysis migration input: ${field} must be an object.`);
  }
  return value as JsonRecord;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function requireDuration(value: unknown): number {
  const duration = finiteNumber(value);
  if (duration === null || duration <= 0) {
    throw new TypeError("Invalid music-analysis migration input: duration_seconds must be a positive finite number.");
  }
  return duration;
}

/**
 * Migrate saved detailed reports without re-running analysis.
 * v1 computed peak/RMS/clipping/silence over the entire decoded file; only spectral,
 * key and tempo estimators used bounded excerpts. Correct the old misleading scope
 * and rename the RMS-derived proxy, preserving unknown values as null.
 */
export function migrateMusicAnalysisV1ToV2(input: unknown): JsonRecord {
  const root = asRecord(input, "root");
  if (root.schema_version === "env.music-analysis.v2") return { ...root };
  if (root.schema_version !== "env.music-analysis.v1") {
    throw new TypeError("Unsupported music-analysis schema; expected env.music-analysis.v1 or v2.");
  }
  const audio = asRecord(root.audio, "audio");
  const duration = requireDuration(audio.duration_seconds);
  const oldProxy = finiteNumber(audio.estimated_loudness_lufs);
  const currentProxy = finiteNumber(audio.rms_loudness_proxy_db);
  const rhythm = asRecord(root.rhythm, "rhythm");
  const tonality = asRecord(root.tonality, "tonality");
  const timbre = asRecord(root.timbre, "timbre");

  return {
    ...root,
    schema_version: "env.music-analysis.v2",
    fingerprint: {
      file_sha256: null,
      exact_match_method: "not-computed",
      note: "Original file bytes were not retained in this v1 export, so exact-file SHA-256 cannot be reconstructed. Acoustic similarity is a separate fingerprinting task.",
    },
    audio: {
      ...audio,
      rms_loudness_proxy_db: currentProxy ?? oldProxy,
      metric_scope_seconds: duration,
    },
    rhythm: {
      ...rhythm,
      analysis_scope_seconds: Math.min(duration, 90),
    },
    tonality: {
      ...tonality,
      analysis_scope_seconds: Math.min(duration, 30),
    },
    timbre: {
      ...timbre,
      spectral_scope_seconds: Math.min(duration, 30),
      zero_crossing_scope_seconds: duration,
    },
  };
}

/**
 * v1 used the vague source label "model_estimate" without recording a verifiable
 * provider/model/run reference. The labels are preserved, but the v2 source status
 * is migrated to "unknown" rather than implying provenance that is no longer present.
 */
export function migrateMusicProfileV1ToV2(input: unknown): JsonRecord {
  const root = asRecord(input, "root");
  if (root.schema_version === "env.music-profile.v2") return { ...root };
  if (root.schema_version !== "env.music-profile.v1") {
    throw new TypeError("Unsupported music-profile schema; expected env.music-profile.v1 or v2.");
  }
  const status = asRecord(root.analysis_status, "analysis_status");
  const migratedStatus: JsonRecord = { ...status };
  for (const key of ["genre", "sub_style", "language", "mood", "instruments", "vocal_style"]) {
    if (migratedStatus[key] === "model_estimate") migratedStatus[key] = "unknown";
  }

  return {
    ...root,
    schema_version: "env.music-profile.v2",
    fingerprint: {
      file_sha256: null,
      exact_match_method: "not-computed",
      note: "Original file bytes were not retained in this v1 export, so exact-file SHA-256 cannot be reconstructed.",
    },
    analysis_status: migratedStatus,
  };
}

/**
 * v1 dataset reports have no repeated-passage calculation. Migrate them to v2 with
 * an explicitly empty candidate list; do not fabricate historic analysis results.
 */
export function migrateMusicDatasetAnalysisV1ToV2(input: unknown): JsonRecord {
  const root = asRecord(input, "root");
  if (root.schema_version === "env.music-dataset-analysis.v2") return { ...root };
  if (root.schema_version !== "env.music-dataset-analysis.v1") {
    throw new TypeError("Unsupported music-dataset-analysis schema; expected v1 or v2.");
  }
  const structure = asRecord(root.structure, "structure");
  return {
    ...root,
    schema_version: "env.music-dataset-analysis.v2",
    fingerprint: {
      file_sha256: null,
      exact_match_method: "not-computed",
      note: "Original file bytes were not retained in this v1 export, so exact-file SHA-256 cannot be reconstructed.",
    },
    structure: {
      ...structure,
      repetition_candidates: [],
      repetition_note: "Not evaluated in this migrated v1 record. Re-run dataset analysis to compute repeated-passage candidates.",
    },
  };
}
