import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../../src/components/layout/cookie-consent.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../../src/components/layout/app-shell.tsx", import.meta.url), "utf8");
const privacyControls = readFileSync(new URL("../../src/components/layout/privacy-controls.tsx", import.meta.url), "utf8");
const analyticsClient = readFileSync(new URL("../../src/lib/analytics/client.ts", import.meta.url), "utf8");
const accountPage = readFileSync(new URL("../../src/routes/account.tsx", import.meta.url), "utf8");
const tokenDashboard = readFileSync(new URL("../../src/components/billing/token-dashboard.tsx", import.meta.url), "utf8");

test("first visit renders a full-screen centered cookie preferences page", () => {
  assert.match(component, /Cookie preferences/);
  assert.match(component, /fixed inset-0[^"]*min-h-dvh[^"]*items-center justify-center/);
  assert.match(component, /max-w-3xl/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /onKeyDown=\{trapFocus\}/);
  assert.match(component, /returnFocusRef\.current\?\.focus\(\)/);
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

test("signed-in visitors get the account profile instead of being sent back to sign-in", () => {
  assert.match(accountPage, /useCurrentUserState\(\)/);
  assert.doesNotMatch(accountPage, /<main\\b|<\\/main>/);
  assert.ok(accountPage.indexOf("if (isPending)") < accountPage.indexOf('if (!user) return <AuthPage mode="sign-in" />'));
  assert.match(accountPage, /Good to see you, \{firstName\}/);
  assert.match(accountPage, /user\.profileImageUrl/);
  assert.match(accountPage, /initials \|\| "E"/);
  assert.match(accountPage, /Profile details/);
  assert.match(accountPage, /Your enV shortcuts/);
  assert.match(accountPage, /to: "\/wallet" as const/);
  assert.match(accountPage, /to: "\/token-dashboard" as const/);
  assert.match(accountPage, /to: "\/settings" as const/);
  assert.match(accountPage, /signOut\("\/"\)/);
});

test("token dashboard has no redundant sign-in card or fabricated zero balance", () => {
  assert.doesNotMatch(tokenDashboard, /Sign in to load your real enV balance|>Sign in<\/Link>/);
  assert.doesNotMatch(tokenDashboard, /Sign in to load token history/);
  assert.match(tokenDashboard, /wallet \? tokenLabel\(wallet\.availableTokens\) : "—"/);
  assert.match(tokenDashboard, /const daily = data\?\.tokenUsage\.weeklyUsage \?\? \[\]/);
});
