import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const child = spawn(process.execPath, ["scripts/transcription-processor.mjs"], { env: { ...process.env, TRANSCRIBE_PORT: "8799", WHISPER_BIN: "missing-whisper-for-test", WHISPER_MODEL: "/missing/model.bin" }, stdio: "ignore" });
await new Promise((resolve) => setTimeout(resolve, 500));
try {
  const health = await fetch("http://127.0.0.1:8799/health").then((r) => r.json());
  assert.equal(health.ok, false);
  assert.equal(health.executableAvailable, false);
  const form = new FormData();
  form.append("file", new Blob(["test"]), "test.txt");
  const response = await fetch("http://127.0.0.1:8799/transcribe", { method: "POST", body: form });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /model|Whisper executable/i);
  console.log("Transcription processor tests: 2/2 passed");
} finally {
  child.kill("SIGTERM");
}
