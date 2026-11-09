import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../../src/components/layout/cookie-consent.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../../src/components/layout/app-shell.tsx", import.meta.url), "utf8");
const privacyControls = readFileSync(new URL("../../src/components/layout/privacy-controls.tsx", import.meta.url), "utf8");
const analyticsClient = readFileSync(new URL("../../src/lib/analytics/client.ts", import.meta.url), "utf8");

test("the first-visit prompt is a centered cookie dialog, not a floating analytics card", () => {
  assert.match(component, /Cookie preferences/);
  assert.match(component, /showModal\(\)/);
  assert.match(component, /aria-labelledby="env-cookie-title"/);
  assert.match(component, /Essential cookies and storage/);
  assert.doesNotMatch(component, /Help improve enV|Help train enV|Privacy choices/);
  assert.doesNotMatch(component, /fixed bottom-/);
  assert.match(component, /max-h-\[min\(90dvh,760px\)\]/);
});

test("optional analytics starts off unless the person previously granted consent", () => {
  assert.match(component, /setAnalyticsAllowed\(savedChoice === "granted"\)/);
  assert.match(component, /checked=\{analyticsAllowed\}/);
  assert.match(component, /analyticsEnabled\\s+\\?\\s*"Allow limited tool usage/);
  assert.match(component, /if \(analyticsEnabled\) \{\s*await chooseAnalyticsConsent\(granted\)/);
  assert.match(component, /No optional analytics events will be collected/);
  assert.match(analyticsClient, /getAnalyticsConsent\(\)!=="granted"\)return/);
});

test("cookie acknowledgement is versioned and remembered locally", () => {
  assert.match(component, /env\.cookie-preferences\.seen\.v1/);
  assert.match(component, /window\.localStorage\.getItem\(NOTICE_KEY\) !== "1"/);
  assert.match(component, /window\.localStorage\.setItem\(NOTICE_KEY, "1"\)/);
});

test("the old persistent privacy chip is not mounted and the dialog can be reopened from Privacy", () => {
  assert.match(appShell, /import \{ CookieConsent \} from "@\/components\/layout\/cookie-consent"/);
  assert.match(appShell, /<CookieConsent \/>/);
  assert.doesNotMatch(appShell, /AnalyticsConsent|analytics-consent/);
  assert.match(privacyControls, /env:open-cookie-preferences/);
  assert.match(privacyControls, /Open cookie preferences/);
  assert.match(component, /addEventListener\(OPEN_EVENT, reopen\)/);
});
