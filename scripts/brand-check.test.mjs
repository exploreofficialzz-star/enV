import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { MAX_CARD_BYTES, computeBrandWarnings, parseBrandCheckArgs, siteDeclaresOgTypeGame } from "./brand-check.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "brand-check.mjs");
function workspace({ site = { title: "enV", card: "custom" }, card = "og.jpg", bytes = 20_000, banner = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "env-brand-check-"));
  mkdirSync(join(root, "src/lib/og"), { recursive: true });
  mkdirSync(join(root, "public"), { recursive: true });
  writeFileSync(join(root, "src/lib/og/site.json"), JSON.stringify(site));
  if (card) writeFileSync(join(root, "public", card), Buffer.alloc(bytes));
  if (banner) writeFileSync(join(root, "public/x-banner.jpg"), Buffer.from("banner"));
  return root;
}

test("a utility with its custom enV share card passes", () => {
  assert.deepEqual(computeBrandWarnings({ workspaceRoot: workspace() }), []);
});

test("missing share image is a note for a utility and a warning for a canvas app", () => {
  const root = workspace({ card: null, site: { title: "enV" } });
  assert.match(computeBrandWarnings({ workspaceRoot: root })[0], /^BRAND NOTE:/);
  assert.match(computeBrandWarnings({ workspaceRoot: root, hasCanvas: true })[0], /^BRAND WARNING:/);
});

test("oversized cards and missing custom-card declarations are reported", () => {
  const tooLarge = workspace({ bytes: MAX_CARD_BYTES + 1 });
  assert.match(computeBrandWarnings({ workspaceRoot: tooLarge })[0], /600 KB/);
  const undeclared = workspace({ site: { title: "enV" } });
  assert.match(computeBrandWarnings({ workspaceRoot: undeclared })[0], /card/);
});

test("canvas apps need game metadata and a social banner", () => {
  const root = workspace({ site: { title: "enV", card: "custom" } });
  const messages = computeBrandWarnings({ workspaceRoot: root, hasCanvas: true });
  assert.equal(messages.length, 2);
  assert.match(messages.join("\n"), /x:game/);
  assert.match(messages.join("\n"), /x-banner/);
  assert.equal(siteDeclaresOgTypeGame({ type: "x:game" }), true);
  assert.equal(siteDeclaresOgTypeGame({ type: "website" }), false);
});

test("CLI arguments and JSON output are deterministic", () => {
  assert.deepEqual(parseBrandCheckArgs([]), { game: false, root: null });
  assert.deepEqual(parseBrandCheckArgs(["--game", "--root", "/tmp/site"]), { game: true, root: "/tmp/site" });
  assert.match(parseBrandCheckArgs(["--root"]).error, /needs a directory/);
  const root = workspace();
  const result = spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
});
