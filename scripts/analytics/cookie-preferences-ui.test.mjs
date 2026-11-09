import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../../src/components/layout/cookie-consent.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../../src/components/layout/app-shell.tsx", import.meta.url), "utf8");
const privacyControls = readFileSync(new URL("../../src/components/layout/privacy-controls.tsx", import.meta.url), "utf8");
const analyticsClient = readFileSync(new URL("../../src/lib/analytics/client.ts", import.meta.url), "utf8");

test("first visit renders a full-screen centered cookie preferences page", () => {
  assert.match(component, /Cookie preferences/);
  assert.match(component, /fixed inset-0[^"]*min-h-dvh[^"]*items-center justify-center/);
  assert.match(component, /max-w-3xl/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /Essential cookies and storage/);
  assert.doesNotMatch(component, /<dialog|showModal\(\)|backdrop:/);
  assert.doesNotMatch(component, /rounded-2xl border border-border bg-surface p-4/);
  assert.doesNotMatch(component, /Help improve enV|Help train enV|Privacy choices|fixed bottom-/);
});

test("the page keeps product analytics disclosure and the existing explicit preference control", () => {
  assert.match(component, /Product analytics/);
  assert.match(component, /checked=\{analyticsAllowed\}/);
  assert.match(component, /chooseAnalyticsConsent\(granted\)/);
  assert.match(analyticsClient, /getAnalyticsConsent\(\)!=="granted"\)return/);
});

test("cookie acknowledgement is versioned and remembered locally", () => {
  assert.match(component, /env\.cookie-preferences\.seen\.v1/);
  assert.match(component, /window\.localStorage\.getItem\(NOTICE_KEY\) !== "1"/);
  assert.match(component, /window\.localStorage\.setItem\(NOTICE_KEY, "1"\)/);
});

test("the page is mounted globally and can be reopened from Privacy", () => {
  assert.match(appShell, /import \{ CookieConsent \} from "@\/components\/layout\/cookie-consent"/);
  assert.match(appShell, /<CookieConsent \/>/);
  assert.doesNotMatch(appShell, /AnalyticsConsent|analytics-consent/);
  assert.match(privacyControls, /env:open-cookie-preferences/);
  assert.match(privacyControls, /Open cookie preferences/);
  assert.match(component, /addEventListener\(OPEN_EVENT, reopen\)/);
});
