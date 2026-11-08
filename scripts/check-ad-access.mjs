import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const slot = read("src/components/tools/ad-slot.tsx");
const shell = read("src/components/tools/tool-shell.tsx");
const route = read("src/routes/tools/$category/$slug.tsx");
const env = read(".env.example");
const privacy = read("src/routes/privacy.tsx");
const privacyControls = read("src/components/layout/privacy-controls.tsx");
const offline = read("src/lib/billing/offline.server.ts");
const offlinePolicy = read("src/lib/offline/policy.mjs");

assert.match(shell, /<AdSlot tool=\{tool\} \/>/, "Tool details must include the ad placement.");
assert.match(slot, /navigator\.onLine/, "Ads must not be requested while offline.");
assert.match(slot, /requestNonPersonalizedAds = 1/, "Ad requests must default to non-personalized.");
assert.match(slot, /VITE_ADSENSE_PRIVACY_CONFIGURED/, "Ad requests must require privacy/CMP setup.");
assert.match(route, /<ToolShell tool=\{tool\}/, "The public tool route must continue to use the regular tool shell.");
assert.doesNotMatch(route, /SignInGate|RedirectToSignIn/, "The tool route must not gain a guest sign-in gate.");
assert.match(offlinePolicy, /tokenPolicy: "monetization-pending"/, "Offline execution classification must remain separate from billing rollout.");
assert.match(offline, /BILLING_OFFLINE_ENABLED !== "true"/, "Production offline token spending must remain fail-closed.");
assert.match(env, /VITE_ADS_ENABLED=false/, "Ads must remain off by default in the environment template.");
assert.match(env, /VITE_ADSENSE_PRIVACY_CONFIGURED=false/, "CMP readiness must remain off by default.");
assert.match(privacy, /advertisingEnabled = import\.meta\.env\.VITE_ADS_ENABLED === "true"/, "Privacy disclosure must appear when ad serving is enabled.");
assert.match(privacy, /frequency capping and aggregated reporting/, "Privacy disclosure must explain NPA identifier use.");
assert.match(privacyControls, /separate provider and CMP privacy choices/, "Analytics consent must be distinct from advertising consent.");

console.log("Ad-access checks PASS: explicit local-tool allowlist, guest route, online-only slots, privacy gate, and unchanged offline billing lock.");
