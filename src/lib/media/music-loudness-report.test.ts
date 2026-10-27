import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { parseMusicLoudnessReport, verifyMusicLoudnessReportChecksum, type MusicLoudnessReport } from "./music-loudness-report.ts";

function report(): MusicLoudnessReport {
  return {
    schema_version: "env.music-loudness-report.v1",
    generated_at: "2026-10-27T08:00:00.000Z",
    execution: { provider: "enV-configured-ffmpeg-processor", upload_consent_required_by_client: true },
    source: {
      file_name: "reference-tone.wav",
      file_size_bytes: 960044,
      file_sha256: "ab".repeat(32),
      file_sha256_verified: true,
      verification_method: "sha-256-computed-over-uploaded-original-file-bytes",
      duration_seconds: 10,
      codec_name: "pcm_s16le",
      container_format: "wav",
      sample_rate_hz: 48000,
      channels: 1,
      channel_layout: "mono",
      sample_format: "s16",
    },
    measurement: {
      status: "measured",
      integrated_loudness_lufs: -23,
      loudness_range_lu: 0,
      sample_peak_dbfs: -23,
      true_peak_dbtp: -23,
      unavailable_reason: null,
      method: "FFmpeg ebur128 with sample+true peak modes; K-weighted and gated programme loudness measurement",
      method_id: "ffmpeg-ebur128-peak-sample-plus-true",
      standards_reference: "ITU-R BS.1770 / EBU R 128 implementation in the recorded FFmpeg build; broadcast compliance still requires reference-sequence validation of this build.",
      scope_seconds: 10,
      units: { integrated_loudness: "LUFS", loudness_range: "LU", sample_peak: "dBFS", true_peak: "dBTP" },
    },
    engine: { binary_version: "ffmpeg version 8.0", filter: "ebur128", binary_path: "ffmpeg" },
    result_checksum: "cd".repeat(32),
  };
}

test("music loudness parser accepts a finite standards-meter report with provenance", () => {
  const parsed = parseMusicLoudnessReport(report());
  assert.equal(parsed.measurement.integrated_loudness_lufs, -23);
  assert.equal(parsed.measurement.true_peak_dbtp, -23);
  assert.equal(parsed.source.file_sha256_verified, true);
  assert.equal(parsed.measurement.units.true_peak, "dBTP");
});

test("music loudness checksum verifies the exact serialized result and rejects tampering", async () => {
  const value = report();
  const { result_checksum: _oldChecksum, ...payload } = value;
  value.result_checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const verified = await verifyMusicLoudnessReportChecksum(parseMusicLoudnessReport(value));
  assert.equal(verified.measurement.integrated_loudness_lufs, -23);

  const tampered = { ...value, measurement: { ...value.measurement, integrated_loudness_lufs: -12 } };
  await assert.rejects(() => verifyMusicLoudnessReportChecksum(parseMusicLoudnessReport(tampered)), /integrity checksum/);
});

test("music loudness parser accepts honest unavailable readings with explicit reasons", () => {
  const input = report();
  input.measurement = {
    ...input.measurement,
    status: "unavailable",
    integrated_loudness_lufs: null,
    loudness_range_lu: null,
    sample_peak_dbfs: null,
    true_peak_dbtp: null,
    unavailable_reason: "Integrated loudness was below the meter's measurable/gated range or the input was silent.",
  };
  assert.equal(parseMusicLoudnessReport(input).measurement.status, "unavailable");
});

test("music loudness parser rejects unverified hashes, invalid units and fabricated zero defaults", () => {
  const unverified = report();
  unverified.source.file_sha256_verified = false as true;
  assert.throws(() => parseMusicLoudnessReport(unverified), /input identity or audio metadata/);

  const wrongUnits = report();
  wrongUnits.measurement.units.true_peak = "dBFS" as "dBTP";
  assert.throws(() => parseMusicLoudnessReport(wrongUnits), /method, scope, or units/);

  const invalidStatus = report();
  invalidStatus.measurement.integrated_loudness_lufs = null;
  assert.throws(() => parseMusicLoudnessReport(invalidStatus), /status does not match/);

  const malformed = report();
  malformed.measurement.true_peak_dbtp = Number.NaN;
  assert.throws(() => parseMusicLoudnessReport(malformed), /non-finite or invalid measurement/);
});
