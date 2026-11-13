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
const authRoute = read("src/routes/api/auth/$.ts");
const verify = read("src/lib/auth/verify.server.ts");
const account = read("src/routes/account.tsx");
const profileMedia = read("server/routes/api/account/profile-media.ts");
const worldLabJobs = read("src/lib/world-lab/jobs-http.server.ts");
const worldLabBackups = read("src/lib/world-lab/project-backups-http.server.ts");
const worldLabCompute = read("server/routes/api/world-lab/calculate.post.ts");
const errorBoundary = read("src/lib/error-component.tsx");
const database = read("src/lib/db.ts");
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
assert.ok(server.includes("emailPasswordUiRequested && !emailPasswordAuthEnabled"), "Email UI/provider mismatch must be diagnosed.");
assert.ok(server.includes("googleUiRequested && !googleConfigured"), "Google UI/provider mismatch must be diagnosed.");
assert.ok(server.includes("requireLocalEmailVerified: true"), "OAuth account linking must require an already verified local email.");
assert.ok(server.includes("appleClientSecret && appleGeneratedSecretConfigured"), "Reject conflicting manual/generated Apple client-secret configuration.");
assert.ok(!server.includes("requireLocalEmailVerified: false"), "Do not allow OAuth to link into an unverified local account.");
assert.ok(server.includes("appleUiRequested && !appleConfigured"), "Apple UI/provider mismatch must be diagnosed.");
assert.ok(server.includes("export const authInfrastructureError"), "Only core infrastructure faults may block session verification.");
assert.ok(server.includes("authProviderConfigurationErrors"), "Optional provider problems must be diagnosed separately.");
assert.ok(server.includes("authInfrastructureError ?? authProviderConfigurationErrors[0] ?? null"), "Compatibility diagnostics must not control session availability.");
assert.ok(server.includes('console.error("[enV auth] Authentication infrastructure unavailable:"'), "Infrastructure failures must be logged without credential values.");
assert.ok(server.includes('console.warn("[enV auth] Sign-in providers unavailable:"'), "Optional provider failures must be warnings, not global outages.");
assert.ok(server.includes("!authInfrastructureError) void ensureDbReady()"), "Optional provider errors must not prevent database initialization.");
assert.ok(authRoute.includes("authInfrastructureError"), "Auth API must gate only on critical infrastructure.");
assert.ok(!authRoute.includes("authConfigurationError"), "Optional provider errors must not block get-session.");
assert.ok(authRoute.includes("AUTH_INFRASTRUCTURE_UNAVAILABLE") && authRoute.includes("AUTH_REQUEST_FAILED"), "Auth API must return stable actionable failure codes.");
assert.ok(authRoute.includes("requestId") && authRoute.includes("Retry-After"), "Auth API failures must include a support reference and retry guidance.");
assert.ok(verify.includes("if (!authConfigured || authInfrastructureError) return null;"), "Critical infrastructure errors must fail closed.");
assert.ok(account.includes("getAccountSessionFailureMessage(sessionError, sessionTimedOut)"), "Account session errors must distinguish offline, timeout and server failures.");
assert.ok(profileMedia.includes("authInfrastructureError"), "Profile media must retain critical auth infrastructure checks.");
for (const source of [worldLabJobs, worldLabBackups, worldLabCompute]) {
  assert.ok(source.includes("authInfrastructureError"), "Authenticated World Lab endpoints must keep core infrastructure checks.");
  assert.ok(!source.includes("authConfigurationError"), "Optional auth providers must not disable existing sessions.");
}
assert.ok(errorBoundary.includes("router.invalidate()") && errorBoundary.includes("useRouter"), "The global error screen must re-run failed route loaders when retrying.");
assert.ok(errorBoundary.includes("ENV-PAGE-") && errorBoundary.includes("Reference:"), "The global error screen must expose a support reference.");
assert.ok(errorBoundary.includes("status === 429") && errorBoundary.includes("status >= 500"), "The global error screen must explain common HTTP failure classes.");
assert.ok(database.includes("ssl: { ca, rejectUnauthorized: true }"), "Supabase PostgreSQL TLS must verify its CA certificate.");

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
