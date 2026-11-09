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
const rootRoute = readFileSync(new URL("../../src/routes/__root.tsx", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
const storage = readFileSync(new URL("../../src/lib/storage.ts", import.meta.url), "utf8");
const viewMode = readFileSync(new URL("../../src/lib/view-mode.ts", import.meta.url), "utf8");
const settingsPage = readFileSync(new URL("../../src/routes/settings.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../../src/components/layout/header.tsx", import.meta.url), "utf8");

test("cookie preferences are a compact popup rather than a full explanatory page", () => {
  assert.match(component, /Cookie preferences/);
  assert.match(component, /useLocation/);
  assert.match(component, /pathname\.startsWith\("\/tools\/"\)/);
  assert.match(component, /pathname === "\/3d-game-studio"/);
  assert.match(component, /pointer-events-none fixed bottom-4 left-4 right-4/);
  assert.match(component, /pointer-events-auto w-full rounded-2xl/);
  assert.match(component, /sm:w-\[24rem\]/);
  assert.doesNotMatch(component, /fixed inset-0|bg-black|backdrop-blur|min-h-dvh/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="false"/);
  assert.match(component, /if \(event\.key === "Escape"\)/);
  assert.match(component, /focusOnOpenRef\.current = true/);
  assert.match(component, /returnFocusRef\.current\.focus\(\)/);
  assert.match(component, /essential browser storage/);
  assert.match(component, /Continue/);
  assert.doesNotMatch(component, /min-h-dvh w-screen|max-w-3xl|Product analytics|analyticsAllowed|type="checkbox"|Decline analytics|chooseAnalyticsConsent/);
});

test("cookie popup does not offer analytics as a checkbox or yes/no choice", () => {
  assert.doesNotMatch(component, /Product analytics|Allow product analytics|Decline analytics|Save preferences|env-analytics-toggle/);
  assert.match(privacyControls, /Allow analytics/);
  assert.match(privacyControls, /Decline \/ withdraw consent/);
});

test("cookie acknowledgement is versioned and remembered locally", () => {
  assert.match(component, /env\.cookie-preferences\.seen\.v2/);
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
  assert.match(accountPage, /profileImageUrl: session\.user\.image/);
  assert.match(accountPage, /initials/);
  assert.match(accountPage, /coverInput/);
  assert.match(accountPage, /avatarInput/);
  assert.match(accountPage, /aria-label="Change cover photo"/);
  assert.match(accountPage, /aria-label="Change profile photo"/);
  assert.doesNotMatch(accountPage, /capture="(?:environment|user)"/);
  assert.match(accountPage, /aria-label="Select cover image"/);
  assert.match(accountPage, /aria-label="Select profile image"/);
  assert.match(accountPage, /ArrowRight/);
  assert.match(accountPage, /account-shortcut-leading/);
  assert.match(accountPage, /account-shortcut-arrow/);
  assert.match(accountPage, /account-shortcut-title/);
  assert.doesNotMatch(accountPage, /md:hidden|md:justify-center|md:text-center/);
  assert.ok(appStyles.includes('html[data-env-view-mode="mobile"] .env-app-shell .account-shortcut-arrow'));
  assert.ok(appStyles.includes('html[data-env-view-mode="mobile"] .env-app-shell .account-shortcut-leading'));
  assert.ok(appStyles.includes('.env-app-shell .account-shortcut-title'));
  assert.match(accountPage, /truncate whitespace-nowrap/);
  assert.ok(accountPage.includes("max-w-[min(80vw,30rem)] truncate whitespace-nowrap"));
  assert.doesNotMatch(accountPage, /break-all text-sm font-medium|block break-words text-sm font-medium/);
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

test("device view is detected before first paint and manual choices survive refresh", () => {
  assert.match(rootRoute, /VIEW_MODE_BOOTSTRAP_SCRIPT/);
  assert.match(rootRoute, /<HeadContent \/>[\s\S]*VIEW_MODE_BOOTSTRAP_SCRIPT/);
  assert.ok(viewMode.includes('localStorage.getItem("env:view-mode:v2")'));
  assert.ok(viewMode.includes('legacyPreference === "tablet" || legacyPreference === "desktop"'));
  assert.match(viewMode, /localStorage\.getItem\("env:view-mode"\)/);
  assert.match(viewMode, /validPreference && preference !== "auto" \? preference : detected/);
  assert.match(storage, /viewModePreference/);
  assert.match(storage, /detectDefaultViewMode\(\)/);
  assert.match(settingsPage, /value: "auto"/);
  assert.match(header, /chooseViewMode\("auto"\)/);
  assert.doesNotMatch(appShell, /widthClass|viewMode === "mobile"/);
  assert.match(appStyles, /html\[data-env-view-mode="mobile"\] \.env-app-shell/);
  assert.match(appStyles, /html\[data-env-view-mode="tablet"\] \.env-app-shell/);
  assert.match(appStyles, /html\[data-env-view-mode="desktop"\] \.env-app-shell/);
});
