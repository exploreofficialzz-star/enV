import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = join(root, "src/lib/game-studio/godot");
const destination = join(root, "apps/android/app/src/main/assets/env-game-runtime.pck");
const temporary = mkdtempSync(join(tmpdir(), "env-game-pack-"));
const godot = process.env.GODOT_BIN || "godot";
try {
  const version = spawnSync(godot, ["--version"], { encoding: "utf8" });
  if (version.error) throw version.error;
  if (version.status !== 0 || !version.stdout.startsWith("4.6.3."))
    throw new Error("Use Godot 4.6.3 to match the Android runtime library.");
  for (const file of ["project.godot", "main.tscn", "game.gd"])
    copyFileSync(join(source, file), join(temporary, file));
  writeFileSync(join(temporary, "export_presets.cfg"), `[preset.0]
name="Android"
platform="Android"
runnable=true
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path=""
[preset.0.options]
gradle_build/use_gradle_build=false
`);
  const pack = join(temporary, "runtime.pck");
  const result = spawnSync(godot, ["--headless", "--path", temporary, "--export-pack", "Android", pack], { encoding: "utf8", timeout: 60000 });
  if (result.error) throw result.error;
  if (result.status !== 0 || /(^|\n)ERROR:/m.test(result.stderr))
    throw new Error(`Godot could not package the runtime.\n${result.stdout}\n${result.stderr}`);
  const verify = spawnSync(godot, ["--headless", "--main-pack", pack, "--quit-after", "30", "--", `--env-project=${join(root, "tests/fixtures/game-studio-project-v1.json")}`], { encoding: "utf8", timeout: 30000 });
  if (verify.error) throw verify.error;
  if (verify.status !== 0 || !verify.stdout.includes("ENV_GAME_READY objects=4") || /(^|\n)ERROR:/m.test(verify.stderr))
    throw new Error(`The packaged runtime did not load the shared project.\n${verify.stdout}\n${verify.stderr}`);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(pack, destination);
  console.log("Android runtime pack created and verified against the shared project.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
