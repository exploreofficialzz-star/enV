import { spawnSync } from "node:child_process";
import { mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "env-godot-runtime-"));
try {
  for (const file of ["project.godot", "main.tscn", "game.gd"])
    copyFileSync(join(root, "src/lib/game-studio/godot", file), join(temporary, file));
  copyFileSync(join(root, "scripts/test-game-studio-godot.gd"), join(temporary, "test_runner.gd"));
  const result = spawnSync(
    process.env.GODOT_BIN || "godot",
    ["--headless", "--path", temporary, "--script", "res://test_runner.gd"],
    {
      encoding: "utf8",
      timeout: 30000,
      env: {
        ...process.env,
        ENV_GAME_FIXTURE: join(root, "tests/fixtures/game-studio-project-v1.json"),
      },
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0 || !result.stdout.includes("GODOT_RUNTIME_PASS"))
    throw new Error("Godot runtime verification failed.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
