import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../../src/components/layout/cookie-consent.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../../src/components/layout/app-shell.tsx", import.meta.url), "utf8");
const privacyControls = readFileSync(new URL("../../src/components/layout/privacy-controls.tsx", import.meta.url), "utf8");
const accountPage = readFileSync(new URL("../../src/routes/account.tsx", import.meta.url), "utf8");
const profileMediaRoute = readFileSync(new URL("../../server/routes/api/account/profile-media.ts", import.meta.url), "utf8");
const profileMigration = readFileSync(new URL("../../migrations/0021_account_profile_media.sql", import.meta.url), "utf8");
const authServer = readFileSync(new URL("../../src/lib/auth/server.ts", import.meta.url), "utf8");
const tokenDashboard = readFileSync(new URL("../../src/components/billing/token-dashboard.tsx", import.meta.url), "utf8");

test("cookie preferences are a compact popup rather than a full explanatory page", () => {
  assert.match(component, /Cookie preferences/);
  assert.match(component, /fixed inset-0[\s\S]*items-center justify-center/);
  assert.match(component, /max-w-md/);
  assert.match(component, /bg-black\/45/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /onKeyDown=\{trapFocus\}/);
  assert.match(component, /returnFocusRef\.current\?\.focus\(\)/);
  assert.match(component, /essential browser storage/);
  assert.match(component, />Continue</);
  assert.doesNotMatch(component, /min-h-dvh w-screen|max-w-3xl|Product analytics|analyticsAllowed|type="checkbox"|Decline analytics|chooseAnalyticsConsent/);
});

test("cookie popup does not offer analytics as a checkbox or yes/no choice", () => {
  assert.doesNotMatch(component, /Product analytics|Allow product analytics|Decline analytics|Save preferences|env-analytics-toggle/);
  assert.match(privacyControls, /Allow analytics/);
  assert.match(privacyControls, /Decline \/ withdraw consent/);
});

test("cookie acknowledgement is versioned and remembered locally", () => {
  assert.match(component, /env\.cookie-preferences\.seen\.v1/);
  assert.match(component, /window\.localStorage\.getItem\(NOTICE_KEY\) !== "1"/);
  assert.match(component, /window\.localStorage\.setItem\(NOTICE_KEY, "1"\)/);
});

test("popup is mounted globally and can be reopened from Privacy", () => {
  assert.match(appShell, /import \{ CookieConsent \} from "@\/components\/layout\/cookie-consent"/);
  assert.match(appShell, /<CookieConsent \/>/);
  assert.match(privacyControls, /env:open-cookie-preferences/);
  assert.match(privacyControls, /Open cookie preferences/);
  assert.match(component, /addEventListener\(OPEN_EVENT, reopen\)/);
});

test("account profile is server-session aware and renders without a textual loading state", () => {
  assert.match(accountPage, /createServerFn\(\{ method: "GET" \}\)/);
  assert.match(accountPage, /loadAccountProfile/);
  assert.match(accountPage, /loader: \(\) => loadAccountProfile\(\)/);
  assert.doesNotMatch(accountPage, /Loading your profile|Good to see you|enV · Profile|Welcome to your personal enV space|Account status|Your enV shortcuts|Jump straight to the things you use most|Need to leave\?/);
  assert.match(accountPage, /if \(!user\) return <AuthPage mode="sign-in" \/>/);
  assert.match(accountPage, /user\.profileImageUrl/);
  assert.match(accountPage, /initials/);
  assert.match(accountPage, /coverInput/);
  assert.match(accountPage, /avatarInput/);
  assert.match(accountPage, /aria-label="Change cover photo"/);
  assert.match(accountPage, /aria-label="Change profile photo"/);
  assert.match(accountPage, /authClient\.updateUser\(\{ name \}\)/);
  assert.match(accountPage, /authClient\.changeEmail\(\{ newEmail, callbackURL: "\/account" \}\)/);
  assert.match(accountPage, /aria-label="Edit name"/);
  assert.match(accountPage, /aria-label="Edit email"/);
  assert.match(accountPage, /bg-red-600[\s\S]*Sign out/);
  assert.match(accountPage, /to: "\/wallet" as const/);
  assert.match(accountPage, /to: "\/token-dashboard" as const/);
  assert.match(accountPage, /to: "\/settings" as const/);
  assert.match(accountPage, /text-fg/);
  assert.match(accountPage, /signOut\("\/"/);
});

test("profile photos are stored server-side per authenticated account with bounded image validation", () => {
  assert.match(profileMediaRoute, /auth\.api\.getSession/);
  assert.match(profileMediaRoute, /account_profile_media/);
  assert.match(profileMediaRoute, /AVATAR_LIMIT/);
  assert.match(profileMediaRoute, /COVER_LIMIT/);
  assert.match(profileMediaRoute, /matchesImageSignature/);
  assert.match(profileMediaRoute, /same-origin/);
  assert.match(profileMigration, /REFERENCES public\."user" \("id"\) ON DELETE CASCADE/);
  assert.match(profileMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(profileMigration, /REVOKE ALL PRIVILEGES/);
  assert.match(authServer, /changeEmail:/);
  assert.match(authServer, /sendChangeEmailConfirmation/);
});

test("token dashboard hides its loading placeholders and has no redundant sign-in card", () => {
  assert.doesNotMatch(tokenDashboard, /Sign in to load your real enV balance|>Sign in<\/Link>/);
  assert.doesNotMatch(tokenDashboard, /Sign in to load token history|Loading token activity|Loading your tokens/);
  assert.match(tokenDashboard, /loadState === "loading" \? null/);
  assert.match(tokenDashboard, /loadState === "signed-out" \|\| loadState === "loading" \? null/);
  assert.match(tokenDashboard, /wallet \? tokenLabel\(wallet\.availableTokens\) : "—"/);
});
