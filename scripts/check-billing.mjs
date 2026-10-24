#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await read("migrations/0002_billing.sql");
const rewardsMigration = await read("migrations/0007_wallet_rewards.sql");
const rewardsService = await read("src/lib/billing/rewards.server.ts");
const paystackService = await read("src/lib/billing/paystack.server.ts");
const paystackProviderConfig = await read("src/lib/billing/provider-config.ts");
const cryptomusService = await read("src/lib/billing/cryptomus.server.ts");
const cryptomusWebhook = await read("server/routes/api/billing/cryptomus/webhook.post.ts");
const cryptomusVerifyRoute = await read("server/routes/api/billing/cryptomus/verify.post.ts");
const pairNativePage = await read("src/routes/pair-native.tsx");
const envExample = await read(".env.example");
const walletDashboard = await read("src/routes/wallet.tsx");
const homePage = await read("src/routes/index.tsx");
const tokenDashboardPage = await read("src/routes/token-dashboard.tsx");
const tokenDashboardComponent = await read("src/components/billing/token-dashboard.tsx");
const tokensRoute = await read("src/routes/tokens.tsx");
const tokenUsageService = await read("src/lib/billing/token-usage.server.ts");
const tokenUsageRoute = await read("server/routes/api/billing/token-usage.get.ts");
const nativeWalletRoute = await read("server/routes/api/billing/native-wallet.get.ts");
const fundingOptionsRoute = await read("server/routes/api/billing/funding-options.get.ts");
const rewardsSummaryRoute = await read("server/routes/api/billing/rewards/summary.get.ts");
const catalog = await read("src/lib/billing/catalog.ts");
const walletRoute = await read("server/routes/api/billing/wallet.get.ts");
const purchasesRoute = await read("server/routes/api/billing/purchases.post.ts");
const pricingPage = await read("src/routes/pricing.tsx");
const androidPricing = await read("apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt");
const androidToolScreens = await read("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
const iosPricing = await read("apps/ios/enV/ContentViews.swift");
const iosToolScreens = await read("apps/ios/enV/ToolViews.swift");
const quoteRoute = await read("server/routes/api/billing/quote.post.ts");
const ledger = await read("src/lib/billing/ledger.server.ts");
const aiHandler = await read("src/lib/ai/server/handler.ts");
const aiRuntime = await read("src/lib/ai/server/runtime.ts");
const aiHandlerTests = await read("src/lib/ai/server/handler.test.ts");
const adminUsageRoute = await read("server/routes/api/billing/admin/usage.get.ts");
const backendHttp = await read("backend/http.ts");
const proxyMediaRoute = await read("server/routes/api/backend/media.post.ts");
const proxyTranscriptionRoute = await read("server/routes/api/backend/transcribe.post.ts");
const proxyScreenshotRoute = await read("server/routes/api/backend/website-screenshot.post.ts");
const localDocumentRoute = await read("server/routes/api/backend/documents.post.ts");
const localImageRoute = await read("server/routes/api/backend/images.post.ts");
const localPdfRoute = await read("server/routes/api/backend/pdf.post.ts");
const localScreenshotRoute = await read("server/routes/api/backend/screenshots.post.ts");
const localOcrRoute = await read("server/routes/api/backend/ocr.post.ts");
const localBarcodeRoute = await read("server/routes/api/backend/barcodes.post.ts");
const localNetworkRoute = await read("server/routes/api/backend/network.post.ts");
const localMockupRoute = await read("server/routes/api/backend/mockups.post.ts");
const localTemplateRoute = await read("server/routes/api/backend/tool.post.ts");
const toolShell = await read("src/components/tools/tool-shell.tsx");
const tokenGuidePage = await read("src/routes/token-guide.tsx");
const profilesText = await read("src/data/billing-profiles.json");
const profileIndexText = await read("src/data/billing-profile-index.json");
const nativeInventoryText = await read("apps/shared/native-engine-inventory.json");
const profiles = JSON.parse(profilesText);
const profileIndex = JSON.parse(profileIndexText);
const nativeInventory = JSON.parse(nativeInventoryText);
const profileIds = new Set(profiles.profiles.map((profile) => profile.toolId));

for (const table of ["billing_accounts", "billing_credit_ledger", "billing_reservations", "billing_purchase_intents", "billing_entitlements", "billing_entitlement_events", "billing_webhook_events", "billing_usage_events"]) {
  assert.match(migration, new RegExp(`create table if not exists ${table}\\b`, "i"), `missing table ${table}`);
}
assert.match(migration, /unique \(provider, provider_event_id\)/i, "webhook events must be idempotent");
assert.match(migration, /idempotency_key text not null unique/i, "billing mutations must have idempotency keys");
assert.match(migration, /usage_digest text not null/i, "usage events need stable idempotency digests");
assert.match(ledger, /usage, usage_digest\)/i, "usage event insert must store its measurement digest");
assert.match(ledger, /prior\.usage_digest !== usageDigest/, "usage event replays must validate their digest");
assert.match(aiHandler, /deps\.recordUsage\(capture\)/, "successful AI runs must enter the persistent usage capture hook");
assert.match(aiHandler, /Provider failures can still incur upstream cost/i, "failed AI runs must not be assumed free");
assert.match(aiRuntime, /recordUsageEvent\(/, "runtime must persist AI usage events");
assert.match(aiRuntime, /actualCostUsdMicros: null/, "model-registry cost estimates must not be mislabelled as actual provider invoices");
assert.match(aiRuntime, /billedSubunits: 0/, "shadow metering must not charge tokens before production billing is enabled");
assert.match(aiHandlerTests, /successful AI work emits a metrics-only usage event/, "AI usage capture has a metrics-only handler test");
assert.match(aiHandlerTests, /failed provider execution is recorded as unknown cost/, "failed AI requests have an unknown-cost handler test");
assert.match(adminUsageRoute, /BILLING_ADMIN_TOKEN/, "aggregate usage report must require its own server-side admin token");
assert.match(adminUsageRoute, /timingSafeEqual/, "admin token comparison must be timing-safe");
assert.match(adminUsageRoute, /actualProviderCostUsd: actualCostCount > 0 \?/, "missing invoice costs must be reported as unknown, not zero");
assert.match(adminUsageRoute, /usage->>'executionStatus' = 'failed'/, "failed tasks with unknown cost must be separately visible in operational counts");
assert.match(adminUsageRoute, /status = 'succeeded' or usage->>'executionStatus' = 'succeeded'/, "shadow-metered successful events must appear in success counts even when cost is unknown");
assert.match(backendHttp, /captureProxyUsage/, "remote processor proxy calls must capture operational usage");
assert.match(backendHttp, /outputBytes \+= chunk\.value\.byteLength/, "proxy output size must be measured from the streamed body");
assert.match(backendHttp, /signal: request\.signal/, "proxy work must respect client cancellation");
assert.match(backendHttp, /estimatedCostUsdMicros: null/, "server operation measurements must not invent cost from elapsed time or bytes");
assert.match(backendHttp, /export async function measureServerOperation/, "local gateway operations need shared shadow metering");
assert.match(proxyMediaRoute, /cloud\.video_processing/, "media processor requests must be classified");
assert.match(proxyTranscriptionRoute, /cloud\.transcription/, "transcription requests must be classified");
assert.match(proxyScreenshotRoute, /cloud\.image_processing/, "website screenshot requests must be classified");
for (const route of [localDocumentRoute, localImageRoute, localPdfRoute, localScreenshotRoute, localOcrRoute, localBarcodeRoute, localNetworkRoute, localMockupRoute, localTemplateRoute]) {
  assert.match(route, /measureServerOperation/, "local server-side processing routes must capture duration and output size");
}
assert.doesNotMatch(adminUsageRoute, /select[^;]*user_id/i, "admin aggregate report must not query user identities");
assert.match(quoteRoute, /hasActiveEntitlement\(userId, "premium"\)/, "premium access must come from server-side entitlement state");
assert.match(catalog, /TOKEN_SUBUNITS_PER_TOKEN = 1_000/);
assert.match(catalog, /realPaymentsEnabled: false/);
assert.match(walletRoute, /requireBillingUser/);
assert.match(quoteRoute, /getToolBillingProfile/);
assert.match(quoteRoute, /billingActive: false/);
assert.doesNotMatch(toolShell, /ToolTokenEstimate|draft token estimate|Checking this tool/, "tool detail screens must not show a token-estimate card");
assert.doesNotMatch(androidToolScreens, /NativeToolGuideContent/, "Android tool pages must not render the long guide inline");
assert.match(androidToolScreens, /Text\("Read the full guide"\)/, "Android tool pages must retain the separate full-guide link");
assert.match(androidToolScreens, /showDescription = !compact/, "Android mobile headers must put the description below the save row");
assert.match(androidPricing, /"token-guide" -> NativeTokenGuide\(catalog\)/, "Android overflow Token guide must open the documentary page, not the dashboard");
assert.doesNotMatch(iosToolScreens, /NativeToolGuideView|NativeToolGuideSectionView/, "iOS tool pages must not render the long guide inline");
assert.match(iosToolScreens, /Label\("Read the full guide", systemImage: "book"\)/, "iOS tool pages must retain the separate full-guide link");
assert.match(iosToolScreens, /toolHeading\(showsDescription: !compact\)/, "iOS mobile headers must put the description below the save row");
assert.match(iosPricing, /case "token-guide": NativeTokenGuideView\(tools: store\.catalog\.tools/, "iOS overflow Token guide must open the documentary page, not the dashboard");
assert.match(iosPricing, /https:\/\/envtools\.store\/api\/billing\/tool/, "iOS token guide must retrieve the profile for the selected tool");
assert.match(androidPricing, /https:\/\/envtools\.store\/api\/billing\/tool/, "Android token guide must retrieve the profile for the selected tool");
assert.doesNotMatch(toolShell, /getToolDocumentation\(tool\)|documentation\.map/, "Web tool pages must not render the long guide inline");
assert.match(toolShell, /What this tool does/, "tool purpose section must remain visible");
assert.doesNotMatch(toolShell, /section\.steps\?\.length/, "tool detail pages must not render guide steps inline");
assert.doesNotMatch(toolShell, /section\.bullets\?\.length/, "tool detail pages must not render guide lists inline");
assert.match(toolShell, /href=\{toolDocumentationPath\(tool\)\}[\s\S]*?Read the full guide/, "tool purpose section must link to the separate full guide");
assert.ok(toolShell.indexOf("Read the full guide") > toolShell.indexOf("{tool.description}"), "the guide link must follow the tool description");
assert.match(androidToolScreens, /padding\(start = if \(compact\) 56\.dp else 0\.dp\)/, "Android mobile descriptions should align beneath the tool title");
assert.match(iosToolScreens, /\.padding\(\.leading, compact \? 56 : 0\)/, "iOS mobile descriptions should align beneath the tool title");
assert.doesNotMatch(androidToolScreens, /NativeToolGuideContent/, "Android tool detail page must not render long guide content inline");
assert.doesNotMatch(iosToolScreens, /NativeToolGuideView|NativeToolGuideSectionView/, "iOS tool detail page must not render long guide content inline");
assert.match(tokenGuidePage, /createFileRoute\("\/token-guide"\)/, "the token guide must use its own route, separate from the dashboard");
assert.match(tokenGuidePage, /Estimated token guide for every enV tool/, "the overflow Token guide must identify itself as platform-wide documentation");
assert.match(tokenGuidePage, /Number\.MAX_SAFE_INTEGER/, "token guide search must cover the full catalogue");
assert.match(tokenGuidePage, /Show more tools \(/, "token guide must allow users to browse beyond the first results");
assert.match(tokenGuidePage, /token button on the home page/, "guide must direct account-usage reviews to the Home token button");
assert.equal(profiles.toolCount, 10_025, "full catalogue must be profiled");
assert.equal(profiles.profiles.length, profiles.toolCount, "profile count must match generated header");
assert.equal(new Set(profiles.profiles.map((profile) => profile.toolId)).size, profiles.toolCount, "tool billing profiles must have unique IDs");
assert.ok(profiles.profiles.every((profile) => profile.manualAuditRequired === true && profile.adsEligible === false && profile.priceStatus === "provisional"), "every generated row must be provisional, manually audited and ad-free");
assert.equal(profileIndex.toolCount, profiles.toolCount, "runtime index count must match full audit");
assert.equal(profileIndex.profiles.length, profiles.toolCount, "runtime index must include every tool");
assert.equal(new Set(profileIndex.profiles.map((profile) => profile.toolId)).size, profileIndex.toolCount, "runtime tool profile IDs must be unique");
assert.ok(profileIndex.profiles.every((profile) => profile.billingKey && profile.pricingMode), "all runtime profiles require billing classification");
for (const [platform, ids] of [["Android", nativeInventory.androidToolIds], ["iOS", nativeInventory.iosToolIds]]) {
  assert.ok(Array.isArray(ids) && ids.length > 0, `${platform} native inventory must be present`);
  assert.equal(new Set(ids).size, ids.length, `${platform} tool IDs must be unique`);
  const missing = ids.filter((id) => !profileIds.has(id));
  assert.deepEqual(missing, [], `${platform} native tool IDs must all have billing profiles`);
}
assert.match(purchasesRoute, /initializePaystackCheckout/);
assert.match(purchasesRoute, /initializeCryptomusCheckout/);
assert.match(purchasesRoute, /provider !== "paystack" && provider !== "cryptomus"/);
assert.match(purchasesRoute, /No payment was taken/);
assert.match(paystackService, /PAYSTACK_PROVIDER_APPROVED === "true"/, "Paystack checkout must require explicit merchant approval");
assert.match(paystackService, /CRYPTOMUS_PROVIDER_APPROVED === "true"/, "crypto checkout must require explicit merchant approval");
assert.match(paystackService, /CRYPTOMUS_TOKEN_PRICE_USD_CENTS/);
assert.match(cryptomusService, /CRYPTOMUS_PAYMENT_API_KEY/);
assert.match(cryptomusService, /createHash\("md5"\)/);
assert.match(cryptomusService, /timingSafeEqual/);
assert.match(cryptomusService, /readBoundedBytes\(request, 256_000\)/,
  "Cryptomus webhook bodies must be limited while streaming");
assert.doesNotMatch(cryptomusService.slice(cryptomusService.indexOf("export async function handleCryptomusWebhook")), /request\.text\(\)/,
  "Cryptomus webhook must not buffer an unbounded body before enforcing its byte limit");
assert.match(cryptomusService, /verifyAndCreditCryptomusReference/);
assert.match(cryptomusService, /invoice\.is_final !== true/);
assert.match(cryptomusService, /invoice\.order_id !== reference/);
assert.match(cryptomusService, /invoice\.currency\?\.toUpperCase\(\) !== intent\.currency\.toUpperCase\(\)/);
assert.match(cryptomusWebhook, /handleCryptomusWebhook/);
assert.match(cryptomusWebhook, /No payment was taken|could not be verified/);
assert.match(cryptomusVerifyRoute, /requireBillingUser/);
assert.match(cryptomusVerifyRoute, /intent\.user_id !== auth\.userId/);
assert.match(cryptomusVerifyRoute, /verifyAndCreditCryptomusReference/);
assert.match(walletDashboard, /api\/billing\/cryptomus\/verify/);
assert.match(walletDashboard, /The crypto payment is still processing/);
assert.match(walletDashboard, /Choose how you want to pay/);
assert.match(walletDashboard, /Pay with cards/);
assert.match(walletDashboard, /Pay with crypto/);
assert.match(walletDashboard, /option\.enabled/);
assert.match(walletDashboard, /checkout\.hostname !== expectedHost/);
assert.match(pairNativePage, /api\/billing\/offline\/pairing/);
assert.match(pairNativePage, /Generate pairing code/);
assert.match(envExample, /PAYSTACK_PROVIDER_APPROVED=false/);
assert.match(envExample, /CRYPTOMUS_PROVIDER_APPROVED=false/);
assert.match(envExample, /BILLING_LAUNCH_ENABLED=false/);
assert.match(envExample, /BILLING_ENFORCEMENT_ENABLED=false/);
assert.match(envExample, /BILLING_REFUND_DISPUTE_HANDLING_APPROVED=false/,
  "new payments must remain gated until refund/dispute handling has been approved");
assert.match(paystackService, /BILLING_REFUND_DISPUTE_HANDLING_APPROVED === "true"/,
  "Paystack/Cryptomus checkout must require the refund/dispute readiness gate");
assert.match(paystackService, /PAYMENTS_NOT_CONFIGURED/);
assert.match(paystackService, /BILLING_LAUNCH_ENABLED === "true"/);
assert.match(paystackService, /BILLING_ENFORCEMENT_ENABLED === "true"/);
assert.match(paystackService, /createHmac\("sha512", verificationSecret\)/,
  "Paystack webhook HMAC must use the same secret that verifies transactions");
assert.doesNotMatch(envExample, /PAYSTACK_WEBHOOK_SECRET=/,
  "Paystack does not expose a separate webhook-signing secret in this integration");
assert.match(paystackService, /timingSafeEqual/);
assert.match(paystackService, /readBoundedBytes\(request, 256_000\)/,
  "Paystack webhook bodies must be limited while streaming");
assert.doesNotMatch(paystackService.slice(paystackService.indexOf("export async function handlePaystackWebhook")), /request\.text\(\)/,
  "Paystack webhook must not buffer an unbounded body before enforcing its byte limit");
assert.match(paystackService, /verifyAndCreditPaystackReference/);
assert.match(paystackProviderConfig, /requirePaystackVerificationSecret/);
assert.match(paystackProviderConfig, /readSafePackPrice/);
assert.match(paystackService, /readSafePackPrice\(process\.env\.PAYSTACK_TOKEN_PRICE_NGN_KOBO, TOKEN_PACKS\)/,
  "Paystack prices must stay within safe integer bounds for every token pack");
assert.match(paystackService, /readSafePackPrice\(process\.env\.CRYPTOMUS_TOKEN_PRICE_USD_CENTS, TOKEN_PACKS\)/,
  "Cryptomus prices must stay within safe integer bounds for every token pack");
assert.match(paystackService, /PAYSTACK_SECRET_KEY\?\.trim\(\)/,
  "whitespace-only Paystack credentials must not enable checkout");
assert.match(cryptomusService, /CRYPTOMUS_PAYMENT_API_KEY\?\.trim\(\)/,
  "whitespace-only Cryptomus credentials must not enable checkout");
assert.match(paystackService, /process\.env\.VERCEL === "1"/,
  "Vercel deployments must require HTTPS payment callback origins");
assert.match(cryptomusService, /process\.env\.VERCEL === "1"/,
  "Vercel deployments must require HTTPS crypto callback origins");
assert.doesNotMatch(paystackProviderConfig, /BILLING_LAUNCH_ENABLED|BILLING_ENFORCEMENT_ENABLED|PAYSTACK_PROVIDER_APPROVED/,
  "settlement credentials must not inherit the new-checkout kill switch");
const paystackSettlement = paystackService.slice(
  paystackService.indexOf("export async function verifyAndCreditPaystackReference"),
  paystackService.indexOf("export async function handlePaystackWebhook"),
);
assert.match(paystackSettlement, /requirePaystackVerificationSecret\(process\.env\)/,
  "existing Paystack payments must remain verifiable when new checkout is disabled");
assert.doesNotMatch(paystackSettlement, /requireLiveFunding\(/,
  "existing transaction verification must not be blocked by the new-checkout launch gates");
const paystackWebhookSettlement = paystackService.slice(paystackService.indexOf("export async function handlePaystackWebhook"));
assert.match(paystackWebhookSettlement, /requirePaystackVerificationSecret\(process\.env\)/,
  "Paystack webhook verification must remain available during checkout shutdown");
assert.doesNotMatch(paystackWebhookSettlement, /requireLiveFunding\(/,
  "Paystack webhook settlement must not depend on the new-checkout launch gates");
assert.match(rewardsMigration, /billing_referral_profiles/);
assert.match(rewardsMigration, /billing_referrals/);
assert.match(rewardsMigration, /billing_reward_events/);
assert.match(rewardsService, /SELF_REFERRAL/);
assert.match(rewardsService, /createHmac\("sha256"/);
assert.match(rewardsService, /timingSafeEqual/);
assert.match(rewardsService, /INVALID_VIDEO_REFERRAL_SIGNATURE/);
assert.match(walletDashboard, /videoSignature/);
assert.match(walletDashboard, /(?:&amp;|&)sig=/);
assert.match(ledger, /referral_invitee/);
assert.match(ledger, /affiliate_conversion/);
assert.match(walletDashboard, /Total deposited/);
assert.match(walletDashboard, /Total used/);
assert.match(walletDashboard, /function tokenUnitDisplay\(label: string\): React\.ReactNode[\s\S]*?text-\[0\.62em\]/, "web wallet must render enV as a smaller unit suffix");
assert.match(walletDashboard, /Referral and creator rewards/);
assert.match(walletDashboard, /Fund(?: your)? wallet/i);
assert.match(fundingOptionsRoute, /getFundingOptions/);
assert.match(rewardsSummaryRoute, /requireBillingUser/);
assert.match(nativeWalletRoute, /requireOfflineBillingUser/);
assert.match(nativeWalletRoute, /NATIVE_PAIRING_REQUIRED/);
assert.ok(homePage.includes('to="/tokens" aria-label="Open token dashboard"'), "Home token shortcut must use the established token dashboard URL");
assert.ok(tokensRoute.includes('createFileRoute("/tokens")') && tokensRoute.includes("TokenDashboard"), "the established tokens URL must render the token dashboard");
assert.match(tokenDashboardPage, /createFileRoute\("\/token-dashboard"\)/, "the usage dashboard route must be registered");
assert.match(tokenDashboardComponent, /Welcome to your token dashboard/, "dashboard must welcome users directly");
assert.match(tokenDashboardComponent, /function tokenUnitDisplay\(label: string\): React\.ReactNode[\s\S]*?text-\[0\.62em\]/, "web token dashboard must render enV as a smaller unit suffix");
assert.match(tokenDashboardComponent, /Today's token spent/, "dashboard must expose today's token total");
assert.match(tokenDashboardComponent, /Last week token spent/, "dashboard must expose its seven-day token total");
assert.match(tokenDashboardComponent, /Last month token spent/, "dashboard must expose its thirty-day token total");
assert.match(tokenDashboardComponent, /Token usage history/, "dashboard must expose the usage timeline");
assert.doesNotMatch(tokenDashboardComponent, /Token usage could not be loaded/, "the token dashboard must not collapse to a blocking error fallback");
assert.doesNotMatch(tokenDashboardComponent, /Loading your account token data/, "refreshing the token dashboard must not show an account-data loading banner");
assert.match(tokenDashboardComponent, /loadState === "signed-out" \|\| loadState === "unavailable"/, "the account status banner must be reserved for sign-in or actual data failures");
assert.doesNotMatch(tokenDashboardComponent, /loadState === "ready" && wallet && summary \?/, "the full dashboard layout must render even while account data is unavailable");
assert.match(tokenDashboardComponent, /loadState === "auth-disabled"/, "the dashboard must distinguish disabled production auth from a transient API failure");
assert.match(tokenDashboardComponent, /wallet \? tokenLabel\(wallet\.availableTokens\) : tokenLabel\(0\)/, "the empty-wallet preview must show a formatted 0.000 enV balance");
assert.match(tokenDashboardComponent, /formatTimestamp\(item\.createdAt\)/, "usage history must show recorded timestamps");
assert.doesNotMatch(tokenDashboardComponent, /> Home|enV token activity</, "the token dashboard header must not show the Home button or token activity pill");
assert.match(tokenDashboardComponent, /flex items-start justify-between gap-3 sm:gap-5[\s\S]*Welcome to your token dashboard[\s\S]*<Link to="\/wallet"[\s\S]*Open wallet/, "Open wallet must share the welcome heading row");
assert.match(tokenDashboardComponent, /wallet \? tokenLabel\(wallet\.reservedTokens\) : tokenLabel\(0\)/, "reserved tokens must use the same 0.000 enV empty-wallet format");
assert.match(tokenDashboardComponent, /wallet \? tokenLabel\(wallet\.lifetimeConsumedSubunits \/ 1_000\) : tokenLabel\(0\)/, "total used ever must use the same 0.000 enV empty-wallet format");
assert.match(tokenDashboardComponent, /Array\.from\(\{ length: 7 \}/, "the empty-wallet preview must keep seven zero-use chart days visible");
const androidTokenDashboard = androidPricing.split("private fun NativeTokenDashboard(onOpenWallet: () -> Unit)")[1]?.split("private fun NativeWalletDashboard()")[0] ?? "";
assert.match(androidTokenDashboard, /Text\("Open wallet"\)/, "Android token dashboard must place Open wallet beside the welcome heading");
assert.match(androidTokenDashboard, /Row\(Modifier\.fillMaxWidth\(\), verticalAlignment = Alignment\.Top[\s\S]*"Welcome to your token dashboard"[\s\S]*Text\("Open wallet"\)/, "Android Open wallet action must share the welcome row");
assert.match(androidTokenDashboard, /displayDaily = if \(daily\.isEmpty\(\)\)/, "Android empty-wallet preview must render seven zero-use chart bars");
assert.match(androidPricing, /private fun walletTokenUnitDisplay\(label: String\)[\s\S]*?fontSize = 0\.62\.em/, "Android token units must use a smaller proportional suffix");
assert.match(iosPricing, /private func styledEnVUnit\(_ label: String, unitSize: CGFloat\)[\s\S]*?range\(of: " enV", options: \.backwards\)/, "iOS token units must render with a smaller suffix font");
assert.doesNotMatch(iosPricing, /Text\(dashboard == nil \? "Your signed tag link" : videoLink\)[\s\S]{0,180}\.textSelection\(\.enabled\)/, "iOS wallet link text must not create a small text-selection hit target");
assert.match(iosPricing, /\.accessibilityLabel\("Copy video tag link"\)[\s\S]{0,100}\.frame\(width: 44, height: 44\)/, "iOS copy-link hit target must remain at least 44pt");
assert.match(androidTokenDashboard, /dashboard\?\.availableTokens \?: 0\.0/, "Android empty-wallet preview must show zero token balance");
assert.match(androidTokenDashboard, /NativeWalletMetric\("Total deposited"/ , "Android dashboard must show total deposited");
assert.match(androidTokenDashboard, /NativeWalletMetric\("Token deductions"/ , "Android dashboard must show a deductions count");
assert.doesNotMatch(androidTokenDashboard, /Connect your enV account/, "Android token dashboard must not be blocked by a connect-account fallback");
const iosTokenDashboard = iosPricing.split("private struct NativeTokenDashboardView")[1]?.split("private struct NativeWalletSparklineView")[0] ?? "";
assert.match(iosTokenDashboard, /Label\("Open wallet", systemImage: "wallet\.bifold"\)/, "iOS token dashboard must place Open wallet beside the welcome heading");
assert.doesNotMatch(iosTokenDashboard, /connectAccountCard|Connect your enV account/, "iOS token dashboard must not be blocked by a connect-account fallback");
assert.match(iosTokenDashboard, /minimumFractionDigits = 3/, "iOS token amounts must display three decimal places");
assert.match(iosTokenDashboard, /displayDailyUsage/, "iOS empty-wallet preview must show seven zero-use chart days");
assert.match(tokenDashboardComponent, /enV estimated reference value ≈ \$0\.010/, "web token card must show the enV unit reference value as one cent");
assert.doesNotMatch(tokenDashboardComponent, /Available balance · Token name: enV/, "web token card must use the concise enV reference label");
assert.match(androidTokenDashboard, /enV estimated reference value ≈ \$0\.010/, "Android token card must show the enV unit reference value as one cent");
assert.doesNotMatch(androidTokenDashboard, /Available balance · Token name: enV/, "Android token card must use the concise enV reference label");
assert.match(iosTokenDashboard, /enV estimated reference value ≈ \$0\.010/, "iOS token card must show the enV unit reference value as one cent");
assert.doesNotMatch(iosTokenDashboard, /Available balance · Token name: enV/, "iOS token card must use the concise enV reference label");
assert.doesNotMatch(tokenDashboardComponent, /Preview display|preview values|preview history/i, "web token dashboard must not expose preview disclaimers");
assert.doesNotMatch(androidTokenDashboard, /Preview display/i, "Android token dashboard must not expose a preview disclaimer");
assert.doesNotMatch(iosTokenDashboard, /Preview display/i, "iOS token dashboard must not expose a preview disclaimer");
assert.match(tokenDashboardComponent, /resolveToolName\(item\.toolId/, "usage history must resolve recorded tool names");
assert.match(tokenUsageRoute, /requireOfflineBillingUser/, "token history must require an authenticated account or valid paired-device session");
assert.match(tokenUsageRoute, /getTokenUsageDashboard\(auth\.userId/, "the endpoint must scope token history to the authenticated user");
assert.match(tokenUsageService, /where user_id = \$1 and entry_type = 'settlement'/, "spending totals must derive only from confirmed account settlements");
assert.match(tokenUsageService, /ue\.billing_key = r\.operation_id/, "confirmed deduction records must resolve tool identity through billing-operation metadata where necessary");
assert.match(androidPricing, /"token-dashboard" -> NativeTokenDashboard\(onOpenWallet\)/, "Android token dashboard wallet navigation must remain native");
assert.match(iosPricing, /case "token-dashboard": NativeTokenDashboardView\(\)/, "iOS Home shortcut must open its native token dashboard");
assert.match(pricingPage, /No advertising/);
assert.match(pricingPage, /100 tokens = \$1\.00/);
assert.match(androidPricing, /100 tokens ≈ \$1\.00 USD/);
assert.match(iosPricing, /100 tokens ≈ \$1\.00 USD/);
for (const file of [pricingPage, androidPricing, iosPricing]) {
  assert.doesNotMatch(file, /\$0\.30|\$0\.50|\$0\.80|\$1\.20|5,000 tokens/i, "old token-package pricing should not remain in active pricing UI");
}
assert.match(androidPricing, /In-app token purchases are not available in this release/);
assert.match(iosPricing, /native StoreKit purchase flow is not configured/);
assert.match(iosPricing, /informationRouter\.open\("wallet"\)/);
assert.match(androidPricing, /Create pairing code/);
assert.match(iosPricing, /pair-native\?platform=ios/);
console.log(`[billing] schema, ledger idempotency, gated Paystack and Cryptomus checkout, verified payment callbacks, referral/affiliate reward accounting, native-store safety, ${profiles.toolCount} provisional profiles, ${nativeInventory.androidToolIds.length} Android IDs, ${nativeInventory.iosToolIds.length} iOS IDs and pricing-policy checks passed.`);
