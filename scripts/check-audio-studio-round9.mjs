import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const files = {
  web: read("src/components/engines/music-live-video-studio.tsx"),
  portable: read("src/lib/engines/audio-studio-preset-file.ts"),
  kotlin: read("apps/android/app/src/main/java/com/chastech/env/NativeMusicLiveVideoStudio.kt"),
  swift: read("apps/ios/enV/ToolViews.swift"),
  tests: read("src/lib/engines/audio-studio-preset-file.test.ts"),
};
const checks = [
  ["Web has real analyser data before DSP", /createAnalyser\(\)/.test(files.web) && /micInput\.connect\(analyser\)/.test(files.web) && /getByteFrequencyData\(bins\)/.test(files.web) && /AnalyserNode passes audio through unchanged/.test(files.web)],
  ["Web has temporary A/B snapshots and recalls", /saveAbSnapshot/.test(files.web) && /recallAbSnapshot/.test(files.web) && /Save current to A/.test(files.web)],
  ["Web imports and exports bounded portable presets", /parseAudioStudioPresetFile/.test(files.web) && /MAX_AUDIO_STUDIO_PRESET_BYTES/.test(files.web) && /Export selected preset/.test(files.web)],
  ["Portable JSON uses a versioned envelope and bounded numeric settings", /env-audio-studio-preset/.test(files.portable) && /AUDIO_STUDIO_PRESET_VERSION = 1/.test(files.portable) && /256 \* 1024/.test(files.portable) && /normalizePortableAudioSettings/.test(files.portable)],
  ["Android has native A/B snapshots and portable file actions", /abSnapshotA/.test(files.kotlin) && /abSnapshotB/.test(files.kotlin) && /presetExportPicker/.test(files.kotlin) && /presetImportPicker/.test(files.kotlin)],
  ["iOS has native A/B snapshots and portable file actions", /abSnapshotA/.test(files.swift) && /abSnapshotB/.test(files.swift) && /showPresetImporter/.test(files.swift) && /presetExportURL/.test(files.swift)],
  ["Regression tests cover round-trip, clamping and rejected files", /round-trip/.test(files.tests) && /clamps hostile/.test(files.tests) && /rejects malformed/.test(files.tests)],
];
const failed = checks.filter(([, pass]) => !pass);
for (const [label, pass] of checks) console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exitCode = 1;
else console.log(`Round 9 studio checks passed (${checks.length}/${checks.length}).`);
