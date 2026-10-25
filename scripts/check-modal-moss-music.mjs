import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const sourcePath = resolve(root, "infra/modal-moss-music/app.py");
const source = readFileSync(sourcePath, "utf8");
const python = process.platform === "win32" ? "python" : "python3";
const syntax = spawnSync(python, [
  "-c",
  "from pathlib import Path; import sys; p=Path(sys.argv[1]); compile(p.read_text(encoding='utf-8'), str(p), 'exec')",
  sourcePath,
], { encoding: "utf8" });
assert.equal(syntax.error, undefined, \`Python is required to syntax-check the Modal service: \${syntax.error?.message ?? ""}\`);
assert.equal(syntax.status, 0, \`Modal service Python syntax check failed:\n\${syntax.stdout}\n\${syntax.stderr}\`);

const requirements = [
  ["pinned MOSS-Music repository", /OpenMOSS-Team\/MOSS-Music-8B-Instruct/],
  ["pinned model revision", /MODEL_REVISION\s*=\s*"[0-9a-f]{7,40}"/],
  ["pinned OpenMOSS SGLang revision", /SGLANG_REVISION\s*=\s*"[0-9a-f]{40}"/],
  ["persistent weights volume", /modal\.Volume\.from_name\("env-moss-music-models"/],
  ["A100 40GB runtime", /gpu="A100-40GB"/],
  ["single container cost guard", /max_containers=1/],
  ["automatic idle scale-down", /scaledown_window=60/],
  ["server-side Modal bearer secret", /modal\.Secret\.from_name\("env-moss-music-api", required_keys=\["MOSS_MUSIC_TOKEN"\]\)/],
  ["strong shared-token check", /len\(os\.environ\.get\("MOSS_MUSIC_TOKEN", ""\)\) < 32/],
  ["constant-time bearer comparison", /hmac\.compare_digest\(provided, configured\)/],
  ["bounded streaming request body", /async for chunk in request\.stream\(\)/],
  ["audio byte limit", /MAX_AUDIO_BYTES\s*=\s*2_800_000/],
  ["HTTP request byte limit", /MAX_JSON_BYTES\s*=\s*4_000_000/],
  ["internal-only SGLang bind", /"--host",\s*"127\.0\.0\.1"/],
  ["request logging disabled", /"--disable-log-requests"/],
  ["JSON response from local model", /response_format.*json_object/s],
  ["lyrics remain out of scope", /Never transcribe, quote, paraphrase, or guess lyrics or spoken words/],
  ["audio temporary file cleanup", /os\.unlink\(audio_path\)/],
  ["no-store response policy", /response\.headers\["Cache-Control"\]\s*=\s*"no-store"/],
  ["safe health endpoint", /@web_app\.get\("\/healthz"\)/],
  ["analysis endpoint requires bearer authentication", /@web_app\.post\("\/analyze"\)[\s\S]{0,180}?_check_bearer\(request\)/],
];

const failures = [];
for (const [name, pattern] of requirements) {
  try {
    assert.match(source, pattern, name);
    console.log(\`PASS \${name}\`);
  } catch {
    failures.push(name);
    console.error(\`FAIL \${name}\`);
  }
}
if (failures.length) {
  console.error(\`Modal MOSS-Music checks failed (\${failures.length}/\${requirements.length}).\`);
  process.exit(1);
}
console.log(\`Modal MOSS-Music static and Python syntax checks passed (\${requirements.length}/\${requirements.length}).\`);
