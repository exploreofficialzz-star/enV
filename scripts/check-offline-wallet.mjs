#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const required = [
  "migrations/0003_offline_wallet.sql",
  "migrations/0004_offline_wallet_hardening.sql",
  "migrations/0005_offline_finalization_batch_binding.sql",
  "migrations/0006_offline_native_pairing.sql",
  "src/lib/billing/offline.server.ts",
  "src/lib/billing/offline-client.ts",
  "src/lib/billing/offline-protocol.ts",
  "src/lib/billing/offline-crypto.server.ts",
  "src/lib/billing/offline-crypto.test.ts",
  "src/lib/billing/offline-recovery-policy.ts",
  "src/lib/billing/offline-recovery-policy.test.ts",
  "src/lib/billing/ledger.server.ts",
  "src/data/offline-eligible-tools.json",
  "apps/shared/offline-eligible-tools.json",
  "apps/shared/offline-protocol-v1-fixtures.json",
  "scripts/generate-offline-eligible-tools.mjs",
  "server/routes/api/billing/offline/allowances.post.ts",
  "server/routes/api/billing/offline/allowances.get.ts",
  "server/routes/api/billing/offline/sync.post.ts",
  "server/routes/api/billing/offline/recovery.post.ts",
  "server/routes/api/billing/offline/status.get.ts",
  "server/routes/api/billing/offline/pairing.post.ts",
  "server/routes/api/billing/offline/pairing/redeem.post.ts",
  "server/routes/api/billing/offline/pairing/sessions.get.ts",
  "server/routes/api/billing/offline/pairing/revoke.post.ts",
  "server/routes/api/billing/admin/offline-security.get.ts",
  "server/routes/api/billing/admin/offline-recoveries.get.ts",
  "apps/android/app/src/main/java/com/chastech/env/billing/OfflineWalletDeviceKey.kt",
  "apps/android/app/src/main/java/com/chastech/env/billing/OfflineWalletJournal.kt",
  "apps/android/app/src/main/java/com/chastech/env/billing/OfflineWalletNativeApi.kt",
  "apps/android/app/src/test/java/com/chastech/env/billing/OfflineWalletWireProtocolTest.kt",
  "apps/ios/enV/OfflineWalletDeviceKey.swift",
  "apps/ios/enV/OfflineWalletJournal.swift",
  "apps/ios/enV/OfflineWalletNativeAPI.swift",
  "apps/ios/enVTests/OfflineWalletProtocolTests.swift",
  "apps/ios/enV.xcodeproj/project.pbxproj",
  "docs/billing-offline-wallet-security.md",
  "docs/billing-offline-wallet-integration-phase5.md",
  ".env.example",
];
for (const file of required) assert.ok(existsSync(file), `Missing offline-wallet artifact: ${file}`);

const catalog = JSON.parse(read("apps/shared/catalog.json"));
const catalogById = new Map(catalog.tools.map((tool) => [tool.id, tool]));
const nativeCalculatorIndex = JSON.parse(read("apps/shared/native-calculators.json"));
assert.ok(Array.isArray(nativeCalculatorIndex.tools), "Shared native calculator manifest must be present to prove cross-platform execution coverage.");
const nativeInstrumentedIds = new Set(nativeCalculatorIndex.tools.map((tool) => tool.id));
const billingIndex = JSON.parse(read("src/data/billing-profile-index.json"));
const billingById = new Map(billingIndex.profiles.map((profile) => [profile.toolId, profile]));
const webEligibleText = read("src/data/offline-eligible-tools.json");
const nativeEligibleText = read("apps/shared/offline-eligible-tools.json");
assert.equal(webEligibleText, nativeEligibleText, "Web and native offline eligibility/pricing data must be byte-identical.");
const eligibility = JSON.parse(webEligibleText);
assert.equal(eligibility.pricingVersion, billingIndex.pricingVersion, "Offline price version must match billing registry.");
assert.equal(eligibility.toolCount, eligibility.profiles.length, "Offline eligibility count must match its rows.");
const eligibleIds = new Set();
const allowedBillingKeys = new Set(["local.calculator"]);
for (const item of eligibility.profiles) {
  assert.ok(!eligibleIds.has(item.toolId), `Duplicate offline tool ID: ${item.toolId}`);
  eligibleIds.add(item.toolId);
  assert.ok(Number.isSafeInteger(item.subunitsPerUnit) && item.subunitsPerUnit > 0, `Invalid offline rate: ${item.toolId}`);
  assert.ok(allowedBillingKeys.has(item.billingKey), `Disallowed offline billing class: ${item.toolId}`);
  assert.ok(nativeInstrumentedIds.has(item.toolId), `Offline metering tool lacks matching Android/iOS explicit execution instrumentation: ${item.toolId}`);
  const profile = billingById.get(item.toolId);
  assert.ok(profile, `Offline tool missing from authoritative billing index: ${item.toolId}`);
  assert.equal(profile.billingKey, item.billingKey, `Billing key drift for ${item.toolId}`);
  assert.equal(profile.pricingMode, "per-unit-hypothesis", `Offline tool is not priced by a fixed provisional unit: ${item.toolId}`);
  assert.equal(profile.provisionalSubunitsPerUnit, item.subunitsPerUnit, `Offline rate drift for ${item.toolId}`);
  const tool = catalogById.get(item.toolId);
  assert.ok(tool, `Offline tool missing from the shared catalog: ${item.toolId}`);
  assert.equal(tool.status, "active", `Non-active tool must not be offline billable: ${item.toolId}`);
  assert.equal(tool.clientSide, true, `Non-client-side tool must not be offline billable: ${item.toolId}`);
  assert.equal(tool.requiresBackend, false, `Backend tool must not be offline billable: ${item.toolId}`);
  assert.equal(tool.requiresAuth, false, `Auth-required tool must not be in the offline guest registry: ${item.toolId}`);
  assert.equal(tool.engine?.type, "calculator", `Offline token collection must be instrumented at a discrete Calculate action: ${item.toolId}`);
  assert.equal(typeof tool.engine?.formula, "string", `Offline calculator must resolve an explicit formula: ${item.toolId}`);
  assert.ok(!["mockups", "screenshots", "accessibility"].includes(tool.category), `An engine override must not be exposed as a billable calculator: ${item.toolId}`);
}
assert.ok(eligibility.profiles.length > 0, "Offline allowlist must not be empty.");
assert.equal(eligibility.toolCount, 267, "Offline metering should only cover the currently instrumented cross-platform native calculator core; expand only with execution-boundary tests.");

const fixture = JSON.parse(read("apps/shared/offline-protocol-v1-fixtures.json"));
assert.equal(fixture.version, 1);
const transaction = fixture.transaction;
assert.equal(transaction.unitCount, 1, "Protocol v1 accepts a single fixed-price invocation per record.");
assert.equal(transaction.canonical, JSON.stringify([
  transaction.allowanceId, transaction.transactionId, transaction.sequenceNumber, transaction.toolId,
  transaction.pricingVersion, transaction.unitCount, transaction.outcome, transaction.recordedAt,
]), "Transaction protocol golden vector drifted.");
assert.equal(fixture.checkpoint.canonical, JSON.stringify([
  fixture.checkpoint.allowanceId, fixture.checkpoint.checkpointSequence, fixture.checkpoint.finalized,
]), "Checkpoint protocol golden vector drifted.");

const server = read("src/lib/billing/offline.server.ts");
const crypto = read("src/lib/billing/offline-crypto.server.ts");
const webClient = read("src/lib/billing/offline-client.ts");
const ledger = read("src/lib/billing/ledger.server.ts");
const migration3 = read("migrations/0003_offline_wallet.sql");
const migration4 = read("migrations/0004_offline_wallet_hardening.sql");
const migration5 = read("migrations/0005_offline_finalization_batch_binding.sql");
const migration6 = read("migrations/0006_offline_native_pairing.sql");
assert.ok(server.includes('"OFFLINE_PRODUCTION_LOCKED"') && server.includes("productionRuntime()"), "Production offline billing must fail closed.");
const recoveryPolicy = read("src/lib/billing/offline-recovery-policy.ts");
const recoveryPolicyTests = read("src/lib/billing/offline-recovery-policy.test.ts");
assert.ok(server.includes("matchingVerifiedFinalizationProof") && server.includes("canResumeOfflineSync({") &&
  recoveryPolicy.includes('return input.recoveryReason === "FINALIZATION_PROOF_REQUIRED" && input.matchingVerifiedFinalizationProof') &&
  recoveryPolicyTests.includes('matchingVerifiedFinalizationProof: false') && recoveryPolicyTests.includes('matchingVerifiedFinalizationProof: true'),
  "Finalization recovery must require a separately verified exact-batch proof; a new non-final batch cannot clear the lock.");
const priorBatchLookupIndex = server.indexOf("const priorBatchRows = await tx.query");
const exactFinalProofIndex = server.indexOf("matchingVerifiedFinalizationProof = input.finalized && allowance.status === \"needs_recovery\"");
const recoveryGuardIndex = server.indexOf("!canResumeOfflineSync({");
const syncingMutationIndex = server.indexOf("`update billing_offline_allowances set status = 'syncing'");
assert.ok(priorBatchLookupIndex >= 0 && exactFinalProofIndex > priorBatchLookupIndex &&
  recoveryGuardIndex > exactFinalProofIndex && syncingMutationIndex > recoveryGuardIndex,
  "The server must confirm the exact prior batch and proof, then apply the recovery guard before any transition back to syncing.");
assert.ok(server.includes('process.env.BILLING_OFFLINE_ENABLED !== "true"'), "Offline feature flag must default off.");
assert.ok(server.includes('process.env.BILLING_OFFLINE_PRICING_APPROVED !== "true"'), "Unapproved offline pricing must fail closed.");
assert.ok(server.includes("Boolean(process.env.DATABASE_URL?.trim())"), "Any external database must keep unverified offline billing locked.");
assert.ok(server.includes("export function offlineWalletAvailability()") && server.includes("export async function offlineRecoveryQueue(limit = 50)"), "Offline availability and operator recovery visibility must be implemented.");
assert.ok(server.includes("canResumeOfflineSync({") &&
  recoveryPolicy.includes('input.recoveryReason === "SEQUENCE_GAP"') &&
  recoveryPolicy.includes('input.recoveryReason === "CHECKPOINT_SEQUENCE_MISMATCH"') &&
  webClient.includes("OFFLINE_RECOVERY_RETRY_FAILED") && webClient.includes("allowance.pendingBatch = undefined"),
  "Only allowlisted sequence/checkpoint rejects may retry without deleting transaction records.");
assert.ok(server.includes("record.unitCount !== 1"), "Server must reject unverifiable multi-unit offline claims.");
assert.ok(server.includes("const storedPublicKey = normalizeOfflinePublicJwk(preflight.device_public_key)") &&
  server.includes("sha256Hex(canonicalOfflinePublicKey(storedPublicKey)) !== preflight.device_key_digest"), "Stored public key must match its signed device digest.");
assert.ok(server.indexOf("requireRateLimit({ action: \"offline-sync-device\"") < server.indexOf("verifyDeviceSignature(publicJwk, message, tx.signature)"), "Signature verification must be rate-limited before CPU-heavy ECDSA checks.");
assert.ok(server.includes("const charge = profile.provisionalSubunitsPerUnit * txRecord.unitCount") &&
  server.includes("Every durably started metered operation is charged"), "Client-reported failure must not create an unmetered operation.");
assert.ok(server.includes("billing_offline_finalization_proofs") && server.includes("FINALIZATION_PROOF_REQUIRED") &&
  server.includes("const verifiedFinalization") && (server.match(/batch_digest = \$7/g) ?? []).length >= 2,
  "Unused funds must not be released from a client-only or differently-batched finalization claim.");
assert.ok(migration5.includes("batch_digest SET NOT NULL") && migration5.includes("billing_offline_finalization_batch_digest_check") &&
  migration5.includes("DELETE FROM billing_offline_finalization_proofs WHERE batch_digest IS NULL"),
  "Finalization evidence must bind to exact content, and unbound legacy proofs must be invalidated.");
assert.ok(server.includes("reservedFundsReleased: false"), "Unverified finalization must explicitly preserve the reservation.");
assert.ok(server.includes("billing_security_rate_limits") && server.includes("DUPLICATE_ID_OR_SEQUENCE") &&
  server.includes("TRANSACTION_REPLAY_CONFLICT") && server.includes("SEQUENCE_GAP"), "Server replay/gap controls are missing.");
assert.ok(crypto.includes("Buffer.byteLength(secret, \"utf8\") < 32"), "Server signing secret must have at least 32 bytes.");
assert.ok(ledger.includes("not exists (") && ledger.includes("billing_offline_allowances offline"), "Generic expiry sweep must never release offline reservations.");
assert.ok(migration3.includes("unique (allowance_id, transaction_id)") && migration3.includes("unique (allowance_id, sequence_number)"), "Base schema requires unique transaction/sequence keys.");
for (const phrase of ["billing_offline_sync_batches", "billing_security_rate_limits", "billing_offline_finalization_proofs",
  "billing_offline_allowances_issue_key_unique", "billing_offline_one_active_allowance_per_device"]) {
  assert.ok(migration4.includes(phrase), `Hardening migration missing ${phrase}`);
}
assert.ok(crypto.includes("timingSafeEqual") && crypto.includes("createPublicKey") && crypto.includes("ieee-p1363"), "Token MAC comparison / native and WebCrypto signature verification required.");
const iosProject = read("apps/ios/enV.xcodeproj/project.pbxproj");
assert.ok(iosProject.includes("OfflineWalletNativeAPI.swift in Sources") && iosProject.includes("path = OfflineWalletNativeAPI.swift") &&
  iosProject.includes("D30000000000000000000004); runOnlyForDeploymentPostprocessing = 0; };"),
  "The native iOS transport must be part of the Xcode application Sources build phase, not just present on disk.");
const androidNativeScreen = read("apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt");
assert.ok(androidNativeScreen.includes("import androidx.compose.material3.AlertDialog") &&
  androidNativeScreen.includes("Close allowance") && androidNativeScreen.includes('availabilityCode == "LOCAL_TEST_ONLY"') && !androidNativeScreen.includes("\n                }\n            }\n            if (feedback.isNotBlank())"),
  "Android allowance settlement must compile structurally and remain guarded by the server test-mode code.");
const iosNativeScreen = read("apps/ios/enV/ContentViews.swift");
assert.ok(iosNativeScreen.includes("@State private var availabilityCode") && iosNativeScreen.includes("availabilityCode = state.code") &&
  iosNativeScreen.includes('confirmationDialog("Close allowance?"') && iosNativeScreen.includes('availabilityCode == "LOCAL_TEST_ONLY"') && iosNativeScreen.includes("finalize: true"),
  "iOS allowance settlement must remain guarded by the server test-mode code.");

const calculatorWebSource = read("src/components/engines/calculator-engine.tsx");
const calculatorAndroidSource = read("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
const calculatorIosSource = read("apps/ios/enV/ToolViews.swift");
const webPreflightAt = calculatorWebSource.indexOf("const preparedOutputs = def.compute(values)");
const webJournalAt = calculatorWebSource.indexOf("runOfflineMeteredOperationIfSelected({ toolId }, () => preparedOutputs)");
const androidFormStart = calculatorAndroidSource.indexOf("private fun NativeCalculatorToolForm(");
const androidFormEnd = calculatorAndroidSource.indexOf("@Composable\nprivate fun NativeExpansionCalculatorToolForm", androidFormStart);
const androidForm = calculatorAndroidSource.slice(androidFormStart, androidFormEnd);
const androidPreflightAt = androidForm.indexOf("val rows = NativeCalculatorEngine.run(operation, values.toMap())");
const androidJournalAt = androidForm.indexOf("journal.beginOperation(context, allowanceId, tool.id)");
const iosPreflightAt = calculatorIosSource.indexOf("let rows = try NativeCalculatorEngine.run(op, values: values)", calculatorIosSource.indexOf("private struct NativeCalculatorToolView"));
const iosJournalAt = calculatorIosSource.indexOf("journal.beginOperation(allowanceID: allowanceID, toolID: tool.id)", calculatorIosSource.indexOf("private struct NativeCalculatorToolView"));
assert.ok(webPreflightAt >= 0 && webJournalAt > webPreflightAt && androidPreflightAt >= 0 && androidJournalAt > androidPreflightAt && iosPreflightAt >= 0 && iosJournalAt > iosPreflightAt,
  "Web, Android and iOS calculator execution must validate/compute before committing a metered journal ticket, so ordinary invalid input cannot consume a token; result display must still wait for journal completion.");

const protocol = read("src/lib/billing/offline-protocol.ts");
assert.ok(protocol.includes("isCanonicalBase64Url") && protocol.includes("unused trailing bits") &&
  protocol.includes("normalizeOfflinePublicJwk"), "Public-key/signature encodings must reject non-canonical base64url representations.");
assert.ok(webClient.includes("OFFLINE_JOURNAL_GAP") && webClient.includes("pendingBatch") &&
  webClient.includes('payload.data.status === "needs_recovery"') && webClient.includes("allowance.spentSubunits += row.reservedSubunits"), "Web journal must preserve pending records on gaps/recovery and charge started work.");
assert.ok(webClient.includes("Atomically reserve a stable batch ID") && webClient.includes("current.pendingBatch.batchId !== pending.batchId") &&
  webClient.includes("allowance.pendingBatch?.finalized === true"), "Web cross-tab batch checkpointing and finalize lock are required.");
assert.ok(webClient.includes("ALLOWANCE_REPLAY_CONFLICT") && webClient.includes("A replayed server issue response must never reset a local spent balance") &&
  webClient.includes("OFFLINE_ACKNOWLEDGEMENT_FAILED") && webClient.includes('current.status !== "finishing"'),
  "Web allowance replay, signature persistence, and server acknowledgements must preserve the durable journal state.");
const webSyncMethod = webClient.slice(webClient.indexOf("export async function synchronizeWebOfflineAllowance"), webClient.indexOf("export async function reportWebOfflineAllowanceLost"));
assert.ok(webSyncMethod.includes("safe idempotent retry") && !webSyncMethod.includes("objectStore(\"transactions\").delete"),
  "Web repairable rejections must keep transaction rows intact while rotating only the saved batch envelope.");
assert.ok(!webClient.includes("allowance.spentSubunits += row.reservedSubunits;\n          if (input.outcome === \"succeeded\")"), "Failed-operation outcome must not refund its reservation.");

const syncRoute = read("server/routes/api/billing/offline/sync.post.ts");
const issueRoute = read("server/routes/api/billing/offline/allowances.post.ts");
const offlineStatusRoute = read("server/routes/api/billing/offline/status.get.ts");
const adminRecoveriesRoute = read("server/routes/api/billing/admin/offline-recoveries.get.ts");
assert.ok(offlineStatusRoute.includes("offlineWalletAvailability"), "User-facing offline status must be sourced from server gates.");
const walletRoute = read("src/routes/wallet.tsx");
assert.ok(walletRoute.includes("/api/billing/offline/status") && walletRoute.includes("/api/billing/offline/allowances") &&
  walletRoute.includes("recoveryReason"), "Wallet view must clearly surface offline availability and unresolved recovery state.");
assert.ok(walletRoute.includes("/api/billing/offline/recovery") && walletRoute.includes("window.confirm") &&
  walletRoute.includes("does not automatically refund tokens") && walletRoute.includes('Link to="/help"') &&
  walletRoute.includes('allowance.platform !== "web"') && walletRoute.includes('allowance.platform === "web"'),
  "Missing-record recovery must require explicit user confirmation, explain no automatic refund, and link to Help.");
assert.ok(adminRecoveriesRoute.includes("offlineRecoveryQueue") && adminRecoveriesRoute.includes("BILLING_ADMIN_TOKEN") && adminRecoveriesRoute.includes("timingSafeEqual"),
  "Recovery queue must be read-only and protected with a high-entropy admin secret.");
assert.ok(!adminRecoveriesRoute.includes("releaseReservation") && !adminRecoveriesRoute.includes("settleReservation") &&
  !adminRecoveriesRoute.includes("UPDATE billing_accounts"), "Admin recovery queue must never mutate balances or reservations.");
const recoveryRoute = read("server/routes/api/billing/offline/recovery.post.ts");
for (const [name, route] of [["issue", issueRoute], ["sync", syncRoute], ["recovery", recoveryRoute]]) {
  assert.ok(route.includes("isSameOriginRequest") && (route.includes("requireBillingUser") || route.includes("requireOfflineBillingUser")), `${name} endpoint must enforce same-origin and authenticated account context.`);
}
const offlineHttp = read("src/lib/billing/http.server.ts");
assert.ok(offlineHttp.includes("export async function requireOfflineBillingUser") &&
  offlineHttp.includes("/^Bearer (envnative1_[A-Za-z0-9_-]{43})$/") &&
  offlineHttp.includes("token_digest=$1") && offlineHttp.includes("revoked_at is null and expires_at > now()"),
  "Native wallet bearer sessions must be syntax-bound, hash-looked-up, expiry-checked, revocable, and separate from cookie fallback.");
const pairingCreate = read("server/routes/api/billing/offline/pairing.post.ts");
const pairingRedeem = read("server/routes/api/billing/offline/pairing/redeem.post.ts");
const pairingSessions = read("server/routes/api/billing/offline/pairing/sessions.get.ts");
const pairingRevoke = read("server/routes/api/billing/offline/pairing/revoke.post.ts");
const offlineServer = read("src/lib/billing/offline.server.ts");
const nativeWalletRoute = read("server/routes/api/billing/native-wallet.get.ts");
const nativeDashboard = read("src/routes/wallet.tsx");
const rewardsMigration = read("migrations/0007_wallet_rewards.sql");
const rewardsServer = read("src/lib/billing/rewards.server.ts");
const paystackServer = read("src/lib/billing/paystack.server.ts");
assert.ok(pairingCreate.includes("requireOfflineBillingUser") && pairingCreate.includes("createOfflinePairingCode"), "Only an authenticated web account can issue a one-time pairing code.");
assert.ok(pairingRedeem.includes("redeemOfflinePairingCode") && pairingRedeem.includes("publicKeyJwk") && pairingRedeem.includes("isSameOriginRequest"), "Pairing redemption must validate a native public key and one-time code.");
assert.ok(pairingSessions.includes("listOfflineNativeSessions") && pairingSessions.includes("requireBillingUser"), "Device session inventory must remain account scoped.");
assert.ok(pairingRevoke.includes("revokeOfflineNativeSession") && pairingRevoke.includes("requireBillingUser") && pairingRevoke.includes("isSameOriginRequest"), "Revocation must be authenticated, same-origin, and server enforced.");
const pairingCreateLogic = offlineServer.slice(offlineServer.indexOf("export async function createOfflinePairingCode"), offlineServer.indexOf("export async function redeemOfflinePairingCode"));
const pairingRedeemLogic = offlineServer.slice(offlineServer.indexOf("export async function redeemOfflinePairingCode"), offlineServer.indexOf("export async function", offlineServer.indexOf("export async function redeemOfflinePairingCode") + 30));
assert.ok(pairingCreateLogic.length > 0 && pairingRedeemLogic.length > 0 &&
  !pairingCreateLogic.includes("requireOfflineEnabled()") && !pairingRedeemLogic.includes("requireOfflineEnabled()"),
  "Read-only Wallet pairing must work without turning on offline spending.");
assert.ok(offlineServer.includes("export async function issueOfflineAllowance") && offlineServer.includes("const signingSecret = requireOfflineEnabled();") &&
  offlineServer.includes("export async function syncOfflineAllowance"),
  "Offline allowance issue and sync must remain gated independently from native wallet pairing.");
assert.ok(nativeWalletRoute.includes("requireOfflineBillingUser") && nativeWalletRoute.includes("nativeSessionId") &&
  nativeWalletRoute.includes("readWallet") && nativeWalletRoute.includes("getRewardsSummary"),
  "Native Wallet reads must require a paired session and return shared ledger data only.");
assert.ok(nativeDashboard.includes("Total deposited") && nativeDashboard.includes("Total used") &&
  nativeDashboard.includes("Referral and creator rewards") && nativeDashboard.includes("Fund your wallet"),
  "Web Wallet must expose balance, usage, creator rewards and funding sections.");
assert.ok(rewardsMigration.includes("billing_reward_events") && rewardsServer.includes("SELF_REFERRAL") &&
  paystackServer.includes("verifyAndCreditPaystackReference"),
  "Reward attribution and deposits must use server-side verification and idempotent event records.");
const webIssueFunction = webClient.slice(webClient.indexOf("export async function requestWebOfflineAllowance"), webClient.indexOf("/** Send the persisted, retry-safe batch"));
const webSyncFunction = webClient.slice(webClient.indexOf("export async function synchronizeWebOfflineAllowance"), webClient.indexOf("/** Retry selected local records"));
assert.ok(webIssueFunction.includes("/api/billing/offline/allowances") && webIssueFunction.includes("requestedSubunits: input.requestedSubunits") &&
  webIssueFunction.includes("idempotencyKey: input.idempotencyKey") && webIssueFunction.includes("publicKeyJwk: key.publicKeyJwk"),
  "The Web client must send the server's complete, idempotent allowance-issuance contract.");
assert.ok(webSyncFunction.includes("/api/billing/offline/sync") && webSyncFunction.includes("allowanceToken: batch.allowanceToken") &&
  webSyncFunction.includes("checkpointSignature: batch.checkpointSignature") && webSyncFunction.includes("finalized: batch.finalized"),
  "The Web client must submit the saved batch, signed checkpoint, allowance token and finalization state to the matching server route.");
assert.ok(migration6.includes("code_digest") && migration6.includes("consumed_at") && migration6.includes("token_digest") &&
  migration6.includes("revoked_at") && migration6.includes("device_key_digest"), "Pairing migration must persist only one-time code/token digests and bind sessions to a device key.");
assert.ok(server.includes('process.env.VITE_AUTH_ENABLED !== "true"') && server.includes('code: "AUTH_NOT_CONFIGURED"'),
  "Offline UI availability must fail closed when verified account authentication is not enabled.");
assert.ok(syncRoute.includes("readJsonObject(request, 256_000)"), "Sync endpoint must allow a bounded native/Web batch payload size.");
const admin = read("server/routes/api/billing/admin/offline-security.get.ts");
assert.ok(admin.includes("BILLING_ADMIN_TOKEN") && admin.includes("timingSafeEqual") && admin.includes("Buffer.byteLength(configured, \"utf8\") < 32"), "Admin aggregate needs a high-entropy bearer secret and timing-safe comparison.");

const androidKey = read("apps/android/app/src/main/java/com/chastech/env/billing/OfflineWalletDeviceKey.kt");
const androidJournal = read("apps/android/app/src/main/java/com/chastech/env/billing/OfflineWalletJournal.kt");
const androidApi = read("apps/android/app/src/main/java/com/chastech/env/billing/OfflineWalletNativeApi.kt");
const iosKey = read("apps/ios/enV/OfflineWalletDeviceKey.swift");
const iosJournal = read("apps/ios/enV/OfflineWalletJournal.swift");
const iosApi = read("apps/ios/enV/OfflineWalletNativeAPI.swift");
assert.ok(androidApi.includes("/api/billing/offline/pairing/redeem") && androidApi.includes("/api/billing/offline/allowances") &&
  androidApi.includes("/api/billing/offline/sync") && androidApi.includes("put(\"requestedSubunits\", 5_000)") &&
  androidApi.includes("put(\"publicKeyJwk\", publicKey)"),
  "Android native API should use the server's matching pairing, allowance, and sync request contracts.");
assert.ok(iosApi.includes("api/billing/offline/pairing/redeem") && iosApi.includes("api/billing/offline/allowances") &&
  iosApi.includes("api/billing/offline/sync") && iosApi.includes("requestedSubunits"),
  "iOS native API should use matching pairing, allowance, and sync request contracts.");
assert.ok(androidJournal.includes("Offline finalization has started") && iosJournal.includes("decoded.finalized"), "Native journals must block new operations after finalization starts.");
assert.ok(androidKey.includes("AndroidKeyStore") && androidKey.includes("SHA256withECDSA"), "Android key must remain in the platform keystore.");
assert.ok(androidApi.includes("/api/billing/offline/pairing/redeem") && androidApi.includes("/api/billing/offline/allowances") &&
  androidApi.includes("/api/billing/offline/sync") && androidApi.includes("Authorization") && androidApi.includes("TOKEN_CIPHER"),
  "Android native wallet must connect pairing, allowance issuance, synchronization, and encrypted session storage.");
assert.ok(androidJournal.includes("offline_transactions") && androidJournal.includes("beginTransaction()") && androidJournal.includes("unitCount == 1L") && androidJournal.includes("setOf(\"local.calculator\")"), "Android journal must atomically persist only instrumented calculator operation records.");
assert.ok(androidJournal.includes("allowance.pendingBatch?.let { pending ->") && androidJournal.includes("db.beginTransaction()") &&
  androidJournal.includes("pending_batch_json IS NULL") && androidJournal.includes("changed == 1"), "Android batch ID and sequence allocation must be atomic and idempotent.");
assert.ok(androidJournal.includes("Instant.parse(existing.issuedAt) == Instant.parse(issuedAt)") && androidJournal.includes("pricingVersion == pricingVersion"), "Android allowance replay must match immutable issuance metadata.");
assert.ok(androidJournal.includes("newSpent = Math.addExact(allowance.spentSubunits, row.reservedSubunits)"), "Android failed attempts must not create token refunds.");
assert.ok(iosKey.includes("SecItemCopyMatching") && iosKey.includes("kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly"), "iOS key must use device-bound Keychain storage.");
assert.ok(iosApi.includes("api/billing/offline/pairing/redeem") && iosApi.includes("api/billing/offline/allowances") &&
  iosApi.includes("api/billing/offline/sync") && iosApi.includes("Authorization") && iosApi.includes("kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly"),
  "iOS native wallet must connect pairing, allowance issuance, synchronization, and Keychain session storage.");
assert.ok(iosJournal.includes("PRAGMA synchronous=FULL") && iosJournal.includes("BEGIN IMMEDIATE") && iosJournal.includes("unitCount == 1") && iosJournal.includes("[\"local.calculator\"]"), "iOS journal must persist only instrumented calculator operation records with full-sync transactional semantics.");
assert.ok(iosJournal.includes("try transaction {") && iosJournal.includes("pending_batch_json IS NULL") &&
  iosJournal.includes("storedSchemaVersion == Self.schemaVersion") && iosJournal.includes("parseDate(string(current, \"issued_at\")) == parseDate(allowance.issuedAt)"),
  "iOS batch checkpointing, schema versioning, and allowance replay must fail closed.");
assert.ok(iosJournal.includes("allowance.spentSubunits.addingReportingOverflow(row.reservedSubunits)"), "iOS failed attempts must not create token refunds.");
assert.ok(androidJournal.includes("prepareRetryAfterRecoverableRejection") &&
  androidJournal.includes("isRecoverableBatchRejection(reasonCode)") &&
  androidJournal.includes("pending_batch_json IS NULL") &&
  androidJournal.includes("Only these server rejection codes are safe for local batch-envelope replacement"),
  "Android must allow only bounded retryable batch rejections without deleting transaction rows.");
assert.ok(iosJournal.includes("prepareRetryAfterRecoverableRejection") &&
  iosJournal.includes("isRecoverableBatchRejection(reasonCode)") &&
  iosJournal.includes("pending_batch_json=NULL, status='syncing'") &&
  iosJournal.includes("Other failures remain locked for review"),
  "iOS must allow only bounded retryable batch rejections without deleting transaction rows.");
const androidRetryMethod = androidJournal.slice(androidJournal.indexOf("fun prepareRetryAfterRecoverableRejection"), androidJournal.indexOf("fun markNeedsRecovery"));
const iosRetryMethod = iosJournal.slice(iosJournal.indexOf("func prepareRetryAfterRecoverableRejection"), iosJournal.indexOf("func markNeedsRecovery"));
assert.ok(androidRetryMethod.length > 0 && !androidRetryMethod.includes("db.delete(") &&
  !androidRetryMethod.includes("last_ack_sequence") && !androidRetryMethod.includes("spent_subunits"),
  "Android batch repair must not delete usage rows or change spend/ack counters.");
assert.ok(iosRetryMethod.length > 0 && !iosRetryMethod.includes("DELETE FROM offline_transactions") &&
  !iosRetryMethod.includes("last_ack_sequence") && !iosRetryMethod.includes("spent_subunits"),
  "iOS batch repair must not delete usage rows or change spend/ack counters.");
const androidProtocolTests = read("apps/android/app/src/test/java/com/chastech/env/billing/OfflineWalletWireProtocolTest.kt");
const iosProtocolTests = read("apps/ios/enVTests/OfflineWalletProtocolTests.swift");
assert.ok(androidProtocolTests.includes("isRecoverableBatchRejection") && iosProtocolTests.includes("isRecoverableBatchRejection"),
  "Cross-platform retry reason policy must have native regression tests.");
const androidPricingPage = read("apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt");
const iosContentViews = read("apps/ios/enV/ContentViews.swift");
for (const [platformName, source] of [["Android", androidPricingPage], ["iOS", iosContentViews]]) {
  assert.ok(source.includes("Offline usage and recovery") &&
    source.includes("Keep unsynchronized records until the server confirms receipt.") &&
    source.includes("report them through the wallet recovery flow instead of assuming the allowance was unused."),
    `${platformName} pricing/help copy must accurately describe offline gating and lost-record recovery.`);
}

const env = read(".env.example");
assert.ok(/BILLING_OFFLINE_ENABLED=false/.test(env), "Offline flag must be false in the example environment.");
assert.ok(/BILLING_OFFLINE_PRICING_APPROVED=false/.test(env), "Pricing approval must be false in the example environment.");
assert.ok(/OFFLINE_ALLOWANCE_SIGNING_SECRET=\s*(?:#.*)?$/m.test(env), "Signing secret must not be pre-filled in examples.");
const packageJson = JSON.parse(read("package.json"));
assert.ok(packageJson.scripts["check:offline-wallet"]?.includes("scripts/check-offline-wallet.mjs"), "Offline wallet static audit script is not wired into package scripts.");
assert.ok(packageJson.scripts.verify.includes("check:offline-wallet"), "Full verification must include offline-wallet hardening checks.");

console.log(`Offline-wallet hardening audit PASS: ${required.length} required artifacts; ${eligibility.profiles.length} allowlisted tools cross-checked across billing profiles and shared catalog; Web/Android/iOS calculator preflight-to-journal ordering, protocol fixtures, ledger, server guards, native journal/key storage, routes, and production gates verified.`);
