import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("generated SEO discovery artifacts satisfy platform indexing and AI crawler policy", () => {
  let output = "";
  try {
    output = execFileSync(process.execPath, [
      "--experimental-strip-types",
      "--import",
      "./scripts/register-ts-alias.mjs",
      "scripts/check-seo-artifacts.mjs",
    ], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (error.stdout) process.stdout.write(String(error.stdout));
    if (error.stderr) process.stderr.write(String(error.stderr));
    throw error;
  }
  assert.match(output, /SEO artifact checks passed/);
});
