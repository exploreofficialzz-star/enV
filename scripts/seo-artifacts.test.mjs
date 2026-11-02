import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("generated SEO discovery artifacts satisfy platform indexing and AI crawler policy", () => {
  const output = execFileSync(process.execPath, [
    "--experimental-strip-types",
    "--import",
    "./scripts/register-ts-alias.mjs",
    "scripts/check-seo-artifacts.mjs",
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.match(output, /SEO artifact checks passed/);
});
