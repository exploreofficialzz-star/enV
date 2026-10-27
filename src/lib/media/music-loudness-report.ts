export type MusicLoudnessReport = {
  schema_version: "env.music-loudness-report.v1";
  generated_at: string;
  execution: {
    provider: string;
    upload_consent_required_by_client: true;
  };
  source: {
    file_name: string;
    file_size_bytes: number;
    file_sha256: string;
    file_sha256_verified: true;
    verification_method: string;
    duration_seconds: number;
    codec_name: string | null;
    container_format: string | null;
    sample_rate_hz: number;
    channels: number;
    channel_layout: string | null;
    sample_format: string | null;
  };
  measurement: {
    status: "measured" | "unavailable";
    integrated_loudness_lufs: number | null;
    loudness_range_lu: number | null;
    sample_peak_dbfs: number | null;
    true_peak_dbtp: number | null;
    unavailable_reason: string | null;
    method: string;
    method_id: string;
    standards_reference: string;
    scope_seconds: number;
    units: {
      integrated_loudness: "LUFS";
      loudness_range: "LU";
      sample_peak: "dBFS";
      true_peak: "dBTP";
    };
  };
  engine: {
    binary_version: string;
    filter: "ebur128";
    binary_path: string;
  };
  result_checksum: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isText(value: unknown, maximum = 2_000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

export function parseMusicLoudnessReport(value: unknown): MusicLoudnessReport {
  const root = record(value);
  const source = record(root?.source);
  const measurement = record(root?.measurement);
  const engine = record(root?.engine);
  const execution = record(root?.execution);
  const units = record(measurement?.units);

  if (!root || root.schema_version !== "env.music-loudness-report.v1") {
    throw new Error("The processor returned an unsupported loudness-report schema.");
  }
  if (!source || !measurement || !engine || !execution || !units) {
    throw new Error("The processor returned an incomplete loudness report.");
  }
  if (execution.upload_consent_required_by_client !== true || !isText(execution.provider, 160)) {
    throw new Error("The report is missing its execution/privacy provenance.");
  }
  if (!isText(root.generated_at, 80) || !isText(source.file_name, 500) ||
      !Number.isSafeInteger(source.file_size_bytes) || Number(source.file_size_bytes) <= 0 ||
      !/^[a-f0-9]{64}$/i.test(String(source.file_sha256 ?? "")) ||
      source.file_sha256_verified !== true ||
      !isText(source.verification_method, 180) ||
      typeof source.duration_seconds !== "number" || !Number.isFinite(source.duration_seconds) || source.duration_seconds <= 0 ||
      typeof source.sample_rate_hz !== "number" || !Number.isSafeInteger(source.sample_rate_hz) || source.sample_rate_hz < 1000 ||
      typeof source.channels !== "number" || !Number.isSafeInteger(source.channels) || source.channels < 1 || source.channels > 64) {
    throw new Error("The report's input identity or audio metadata is invalid.");
  }
  if (measurement.status !== "measured" && measurement.status !== "unavailable") {
    throw new Error("The report has an invalid measurement status.");
  }
  for (const field of ["integrated_loudness_lufs", "loudness_range_lu", "sample_peak_dbfs", "true_peak_dbtp"]) {
    if (!finiteOrNull(measurement[field])) throw new Error("The report contains a non-finite or invalid measurement: " + field + ".");
  }
  if ((measurement.status === "measured") !== (typeof measurement.integrated_loudness_lufs === "number")) {
    throw new Error("The report's loudness status does not match its integrated-loudness value.");
  }
  if (measurement.status === "unavailable" && !isText(measurement.unavailable_reason, 500)) {
    throw new Error("An unavailable reading must include its reason.");
  }
  if (!isText(measurement.method, 500) || measurement.method_id !== "ffmpeg-ebur128-peak-sample-plus-true" ||
      !isText(measurement.standards_reference, 1_000) ||
      typeof measurement.scope_seconds !== "number" || !Number.isFinite(measurement.scope_seconds) || measurement.scope_seconds <= 0 ||
      units.integrated_loudness !== "LUFS" || units.loudness_range !== "LU" ||
      units.sample_peak !== "dBFS" || units.true_peak !== "dBTP") {
    throw new Error("The report is missing its measurement method, scope, or units.");
  }
  if (!isText(engine.binary_version, 500) || engine.filter !== "ebur128" || !isText(engine.binary_path, 500)) {
    throw new Error("The report is missing the actual meter engine/version provenance.");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(root.result_checksum ?? ""))) {
    throw new Error("The report result checksum is missing or malformed.");
  }
  return value as MusicLoudnessReport;
}
