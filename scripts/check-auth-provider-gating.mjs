#!/usr/bin/env node
/**
 * Prevent production auth UI from advertising methods that are disabled and
 * keep Apple signing material on the server.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const client = read("src/lib/auth/client.ts");
const page = read("src/components/auth/auth-page.tsx");
const server = read("src/lib/auth/server.ts");
const envExample = read(".env.example");
const localEnv = JSON.parse(read(".enV/app-env.json"));
const packageJson = JSON.parse(read("package.json"));

for (const [name, declaration] of [
  ["Google", 'VITE_AUTH_GOOGLE_ENABLED === "true"'],
  ["Apple", 'VITE_AUTH_APPLE_ENABLED === "true"'],
]) {
  assert.ok(client.includes(declaration), `${name} must have an explicit public UI flag.`);
}
assert.ok(client.includes('VITE_AUTH_ENABLED === "true"'), "Global auth must remain explicitly gated.");
assert.ok(page.includes("googleAuthAvailable && ("), "Google button must be hidden unless enabled.");
assert.ok(page.includes("appleAuthAvailable && ("), "Apple button must be hidden unless enabled.");
assert.ok(page.includes("emailAuthAvailable && ("), "Email/password form must be hidden unless enabled.");
assert.ok(page.includes("!hasAnyAuthMethod"), "Disabled account screens need a truthful, non-interactive state.");
assert.ok(server.includes("async function getAppleClientSecret"), "Apple client secrets should be generated server-side.");
assert.ok(server.includes("importPKCS8") && server.includes("setExpirationTime"), "Apple JWT must be signed with ES256 and expire.");
assert.ok(server.includes("APPLE_PRIVATE_KEY"), "Apple private key must only be read by the server auth module.");

for (const flag of [
  "VITE_AUTH_ENABLED",
  "VITE_AUTH_EMAIL_ENABLED",
  "VITE_AUTH_GOOGLE_ENABLED",
  "VITE_AUTH_APPLE_ENABLED",
]) {
  assert.equal(localEnv[flag], "false", `Local auth flag ${flag} must stay off until credentials are supplied.`);
  assert.ok(envExample.includes(`${flag}=false`), `.env.example must document ${flag} as off by default.`);
}
for (const secretName of [
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
  "GOOGLE_CLIENT_SECRET",
  "APPLE_PRIVATE_KEY",
  "APPLE_CLIENT_SECRET",
  "RESEND_API_KEY",
]) {
  assert.ok(envExample.includes(`${secretName}=`), `.env.example must document server-only ${secretName}.`);
  assert.ok(!envExample.includes(`VITE_${secretName}`), `${secretName} must not be exposed as a VITE_ value.`);
}
assert.ok(packageJson.scripts?.test?.includes("check:auth-providers"), "Auth provider checks must run in npm test.");

console.log("Auth provider gating passed: disabled providers stay hidden; Apple signing material remains server-side.");
