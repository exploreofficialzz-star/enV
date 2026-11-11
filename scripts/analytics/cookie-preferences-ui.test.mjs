import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const appShell = readFileSync(new URL("../../src/components/layout/app-shell.tsx", import.meta.url), "utf8");
const cookieConsent = readFileSync(new URL("../../src/components/layout/cookie-consent.tsx", import.meta.url), "utf8");
const rootDocument = readFileSync(new URL("../../src/routes/__root.tsx", import.meta.url), "utf8");
const accountPage = readFileSync(new URL("../../src/routes/account.tsx", import.meta.url), "utf8");
const currentUserState = readFileSync(new URL("../../src/lib/auth/use-current-user.ts", import.meta.url), "utf8");
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

test("one global non-blocking cookie banner controls essential storage, optional analytics and Adsterra advertising", () => {
  assert.match(rootDocument, /<CookieConsent \/>/, "The unified cookie dialog must be mounted once for all Web routes.");
  assert.match(cookieConsent, /Cookie preferences/);
  assert.match(cookieConsent, /Essential storage/);
  assert.match(cookieConsent, /role="region"/);
  assert.doesNotMatch(cookieConsent, /<dialog|showModal|backdrop:/);
  assert.match(cookieConsent, /Always active/);
  assert.match(cookieConsent, /Optional analytics/);
  assert.match(cookieConsent, /Adsterra advertising/);
  assert.match(cookieConsent, /Allow Adsterra advertising/);
  assert.match(cookieConsent, /Accept all/);
  assert.match(cookieConsent, /Reject optional/);
  assert.match(cookieConsent, /Save choices/);
  assert.match(cookieConsent, /chooseAnalyticsConsent/);
  assert.match(cookieConsent, /setAdsterraConsent/);
  assert.match(cookieConsent, /env:open-cookie-preferences/);
});

test("Privacy opens the same cookie dialog instead of showing a second Adsterra consent control", () => {
  const privacyPage = readFileSync(new URL("../../src/routes/privacy.tsx", import.meta.url), "utf8");
  const adsterraControlPath = new URL("../../src/components/layout/adsterra-privacy-controls.tsx", import.meta.url);
  assert.match(privacyPage, /env:open-cookie-preferences/);
  assert.doesNotMatch(privacyPage, /AdsterraPrivacyControls/);
  assert.doesNotMatch(privacyPage, /<PrivacyControls \/>/);
  assert.equal(existsSync(adsterraControlPath), false, "A separate Adsterra consent screen must not remain.");
});

test("account resolves sign-in state reactively and preserves the old server-function ID for cached clients", () => {
  assert.match(accountPage, /const loadAccountProfile = createServerFn\(\{ method: "GET" \}\)\.handler/);
  assert.match(accountPage, /legacyAccountProfileServerFunction = loadAccountProfile/);
  assert.match(accountPage, /getRequest\(\)/);
  assert.match(accountPage, /auth\.api\.getSession\(\{ headers: request\.headers \}\)/);
  assert.doesNotMatch(accountPage, /loader:\s*\(\)\s*=>\s*loadAccountProfile\(\)/);
  assert.match(accountPage, /useCurrentUserState\(\)/);
  assert.match(accountPage, /useCurrentUserState\(\)/);
  assert.match(accountPage, /if \(sessionPending && !sessionTimedOut\) return <AccountProfileSkeleton \/>/);
  assert.match(accountPage, /if \(sessionError \|\| sessionTimedOut\)/);
  assert.match(accountPage, /setTimeout\(\(\) => setSessionTimedOut\(true\), 10_000\)/);
  assert.match(accountPage, /refreshSession\?\.\(\)/);
  assert.match(currentUserState, /authClient\.useSession\(\)/);
  assert.match(currentUserState, /error: error \?\? null/);
  assert.match(currentUserState, /refetch,/);
  assert.match(currentUserState, /profileImageUrl: sessionUserImage/);
  const serverManifestPath = new URL("../../.vercel/output/functions/__server.func/_ssr/ssr.mjs", import.meta.url);
  if (existsSync(serverManifestPath)) {
    const serverManifest = readFileSync(serverManifestPath, "utf8");
    assert.match(serverManifest, /"a2dbc261c9dbc9b2103f8740422ed59d4843b2d1c5fef0c17a2d6c651130f9e3":/);
    assert.match(serverManifest, /functionName: "loadAccountProfile_createServerFn_handler"/);
  }
  assert.doesNotMatch(accountPage, /Good to see you|enV · Profile|Welcome to your personal enV space|Account status|Your enV shortcuts|Jump straight to the things you use most|Need to leave\?/);
  assert.match(accountPage, /if \(!activeUser\) return <AuthPage mode="sign-in" \/>/);
  assert.match(accountPage, /const activeUser = sameLoadedIdentity \? user : loadedUser/);
  assert.match(accountPage, /const activeAvatarUrl = sameLoadedIdentity \? avatarUrl/);
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

test("signed-in user identity stays referentially stable to prevent the account profile layout-effect loop", () => {
  assert.match(currentUserState, /import \{ useMemo \} from "react"/);
  assert.match(currentUserState, /const sessionUser = data\?\.user/);
  assert.match(currentUserState, /const user = useMemo<AppUser \| null>\(/);
  assert.match(currentUserState, /\[sessionUserId, sessionUserName, sessionUserEmail, sessionUserImage\]/);
  assert.match(accountPage, /useAccountMediaLayoutEffect\([\s\S]*?\}, \[loadedUser\]\)/);
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

test("token dashboard uses shimmer for balances while account data is loading", () => {
  assert.ok(!tokenDashboard.includes("Sign in to load your real enV balance"));
  assert.ok(!tokenDashboard.includes(">Sign in</Link>"));
  assert.ok(!tokenDashboard.includes("Sign in to load token history"));
  assert.ok(!tokenDashboard.includes("Loading token activity"));
  assert.ok(!tokenDashboard.includes("Loading your tokens"));
  assert.ok(tokenDashboard.includes('aria-label="Loading token balance"'));
  assert.ok(tokenDashboard.includes('loading={loadState === "loading"}'));
  assert.ok(tokenDashboard.includes("Loading reserved tokens"));
  assert.ok(tokenDashboard.includes("Loading lifetime token usage"));
  assert.ok(tokenDashboard.includes('loadState === "loading" ? null'));
  assert.ok(tokenDashboard.includes('loadState === "signed-out" || loadState === "loading" ? null'));
  assert.ok(tokenDashboard.includes('wallet ? tokenLabel(wallet.availableTokens) : "—"'));
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
  const viewOptionsStart = settingsPage.indexOf("const viewOptions:");
  const viewOptionsEnd = settingsPage.indexOf("\n];", viewOptionsStart);
  const viewOptionsBlock = viewOptionsStart >= 0 && viewOptionsEnd > viewOptionsStart ? settingsPage.slice(viewOptionsStart, viewOptionsEnd) : "";
  const viewChoicePositions = ["mobile", "tablet", "desktop"].map((mode) => viewOptionsBlock.indexOf('value: "' + mode + '"'));
  assert.ok(viewChoicePositions.every((position) => position >= 0));
  assert.ok(viewChoicePositions[0] < viewChoicePositions[1] && viewChoicePositions[1] < viewChoicePositions[2]);
  assert.doesNotMatch(viewOptionsBlock, /Automatic|value: "auto"/i);
  assert.ok(settingsPage.includes("const viewMode = usePrefs((state) => state.viewMode)"));
  assert.ok(settingsPage.includes("const selected = viewMode === option.value"));
  const viewModeStart = header.indexOf('aria-label="View mode"');
  const viewModeEnd = header.indexOf("</section>", viewModeStart);
  const viewModeMenu = viewModeStart >= 0 && viewModeEnd > viewModeStart ? header.slice(viewModeStart, viewModeEnd) : "";
  assert.equal(viewModeMenu.split('<button type="button"').length - 1, 3);
  assert.ok(!viewModeMenu.includes("Automatic view"));
  assert.ok(!viewModeMenu.includes('chooseViewMode("auto")'));
  assert.ok(header.includes('aria-pressed={viewMode === "mobile"}'));
  assert.ok(header.includes('aria-pressed={viewMode === "tablet"}'));
  assert.ok(header.includes('aria-pressed={viewMode === "desktop"}'));
  assert.doesNotMatch(appShell, /widthClass|viewMode === "mobile"/);
  assert.match(appStyles, /html\[data-env-view-mode="mobile"\] \.env-app-shell/);
  assert.match(appStyles, /html\[data-env-view-mode="tablet"\] \.env-app-shell/);
  assert.match(appStyles, /html\[data-env-view-mode="desktop"\] \.env-app-shell/);
});
