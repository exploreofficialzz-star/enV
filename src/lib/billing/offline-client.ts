/** Web offline-wallet primitives. They record-and-sign before a local tool may report success. */
import {
  canonicalOfflineCheckpoint,
  canonicalOfflineTransaction,
  type OfflinePublicJwk,
  type OfflineTransactionRecord,
} from "./offline-protocol";
import eligibleTools from "../../data/offline-eligible-tools.json";

type EligibleToolsIndex = { pricingVersion: string; toolCount: number; profiles: { toolId: string; billingKey: string; subunitsPerUnit: number }[] };
const offlineEligibleTools = eligibleTools as EligibleToolsIndex;
const offlineEligibleById = new Map(offlineEligibleTools.profiles.map((entry) => [entry.toolId, entry]));

const DB_NAME = "env-offline-wallet-v1";
const DB_VERSION = 2;
const MAX_BATCH_RECORDS = 250;

type KeyRecord = { deviceKeyId: string; privateKey: CryptoKey; publicKeyJwk: OfflinePublicJwk; createdAt: string };
type OfflineIssueIntent = { idempotencyKey: string; deviceKeyId: string; requestedSubunits: number; createdAt: string };
type StoredTransaction = { allowanceId: string; sequenceNumber: number; record: OfflineTransactionRecord; reservedSubunits: number; status: "preparing" | "finishing" | "ready"; createdAt: string };
type PendingBatch = { batchId: string; checkpointSequence: number; finalized: boolean; sequenceNumbers: number[]; checkpointSignature?: string };
type StoredAllowance = {
  allowanceId: string; deviceKeyId: string; issueIdempotencyKey: string; allowanceToken: string; allowanceSubunits: number;
  pricingVersion: string; issuedAt: string; expiresAt: string; nextSequence: number; lastAckSequence: number;
  spentSubunits: number; pendingSubunits: number;
  status: "issued" | "syncing" | "reconciled" | "needs_recovery"; pendingBatch?: PendingBatch;
};

export class OfflineClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; this.name = "OfflineClientError"; }
}

function requireBrowser(): void {
  if (typeof window === "undefined" || typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) {
    throw new OfflineClientError("OFFLINE_STORAGE_UNAVAILABLE", "This browser does not support the secure local storage needed for offline token records.");
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

const SELECTED_OFFLINE_ALLOWANCE_KEY = "env-offline-wallet-selected-v1";
const PENDING_OFFLINE_ISSUE_KEY = "env-offline-wallet-pending-issue-v1";

/** Persist one issue idempotency key across retries so a lost HTTP response cannot reserve
 * the same allowance twice. Clear it only after a server-issued allowance is stored locally. */
export function getOrCreateWebOfflineIssueKey(): string {
  requireBrowser();
  try {
    const current = localStorage.getItem(PENDING_OFFLINE_ISSUE_KEY);
    if (current && /^[A-Za-z0-9_-]{8,120}$/.test(current)) return current;
    const next = `offline-${randomId()}`;
    localStorage.setItem(PENDING_OFFLINE_ISSUE_KEY, next);
    return next;
  } catch {
    throw new OfflineClientError("OFFLINE_ISSUE_INTENT_UNAVAILABLE", "A durable idempotency key could not be saved. No allowance request was sent; enable browser storage and retry.");
  }
}

export function clearWebOfflineIssueKey(completedKey: string): void {
  requireBrowser();
  try {
    if (localStorage.getItem(PENDING_OFFLINE_ISSUE_KEY) === completedKey) localStorage.removeItem(PENDING_OFFLINE_ISSUE_KEY);
  } catch {
    // Keeping a completed key is safe: the server's idempotency record prevents a second
    // reservation and requestWebOfflineAllowance will restore the same local allowance.
  }
}

/** Selected allowance is an explicit opt-in: local calculator actions only use tokens when
 * the user reserved an allowance and selected it for offline metering. */
export function getSelectedWebOfflineAllowanceId(): string | null {
  requireBrowser();
  try {
    const value = localStorage.getItem(SELECTED_OFFLINE_ALLOWANCE_KEY);
    return value && /^[A-Za-z0-9-]{16,80}$/.test(value) ? value : null;
  } catch {
    throw new OfflineClientError("OFFLINE_SELECTION_UNAVAILABLE", "The selected offline allowance cannot be read safely. No metered operation was started.");
  }
}

export async function selectWebOfflineAllowanceForMetering(allowanceId: string | null): Promise<void> {
  requireBrowser();
  if (allowanceId === null) {
    try { localStorage.removeItem(SELECTED_OFFLINE_ALLOWANCE_KEY); }
    catch { throw new OfflineClientError("OFFLINE_SELECTION_UNAVAILABLE", "The offline-metering selection could not be cleared safely."); }
    return;
  }
  if (!/^[A-Za-z0-9-]{16,80}$/.test(allowanceId)) throw new OfflineClientError("INVALID_ALLOWANCE", "Select a valid offline allowance.");
  const db = await openDb();
  const allowance = await getRow<StoredAllowance>(db, "allowances", allowanceId);
  db.close();
  if (!allowance || !["issued", "syncing"].includes(allowance.status) || allowance.pricingVersion !== offlineEligibleTools.pricingVersion || Date.parse(allowance.expiresAt) <= Date.now()) {
    throw new OfflineClientError("OFFLINE_ALLOWANCE_UNAVAILABLE", "This allowance is expired or requires recovery. It cannot be activated for new offline operations.");
  }
  try { localStorage.setItem(SELECTED_OFFLINE_ALLOWANCE_KEY, allowanceId); }
  catch { throw new OfflineClientError("OFFLINE_SELECTION_UNAVAILABLE", "The offline-metering selection could not be saved. No operation will be charged until selection is saved."); }
}

export async function listLocalWebOfflineAllowances() {
  const db = await openDb();
  const allowances = await getRows<StoredAllowance>(db, "allowances");
  const transactions = await getRows<StoredTransaction>(db, "transactions");
  db.close();
  return allowances.map((allowance) => {
    const records = transactions.filter((row) => row.allowanceId === allowance.allowanceId);
    return {
      allowanceId: allowance.allowanceId,
      allowanceSubunits: allowance.allowanceSubunits,
      pricingVersion: allowance.pricingVersion,
      status: allowance.status,
      expiresAt: allowance.expiresAt,
      lastAckSequence: allowance.lastAckSequence,
      nextSequence: allowance.nextSequence,
      spentSubunits: allowance.spentSubunits,
      pendingSubunits: allowance.pendingSubunits,
      pendingRecords: records.length,
      preparingRecords: records.filter((row) => row.status === "preparing" || row.status === "finishing").length,
      pendingBatch: Boolean(allowance.pendingBatch),
      issueIdempotencyKey: allowance.issueIdempotencyKey,
    };
  }).sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt));
}

/** Meter an explicitly selected allowance for the small, explicit set of instrumented
 * local calculator actions. Do not use navigator.onLine as an accounting decision: it may be
 * true during a captive portal or failed network path. A selected allowance is an explicit
 * budget on this device; eligible calls are journaled regardless of connectivity, then synced
 * when the browser reports connectivity. Unlisted tools remain local and are not charged by
 * this journal until their execution boundary is explicitly wired and audited. */
export async function runOfflineMeteredOperationIfSelected<T>(input: { toolId: string }, operation: () => T | Promise<T>): Promise<T> {
  const profile = offlineEligibleById.get(input.toolId);
  if (!profile || profile.billingKey !== "local.calculator") return await operation();
  const selectedAllowanceId = getSelectedWebOfflineAllowanceId();
  if (!selectedAllowanceId) return await operation();
  const db = await openDb();
  const allowance = await getRow<StoredAllowance>(db, "allowances", selectedAllowanceId);
  db.close();
  if (!allowance || !["issued", "syncing"].includes(allowance.status) ||
      allowance.pricingVersion !== offlineEligibleTools.pricingVersion || Date.parse(allowance.expiresAt) <= Date.now()) {
    throw new OfflineClientError("OFFLINE_ALLOWANCE_UNAVAILABLE", "The selected calculator budget is expired or requires recovery. This calculator did not run; open the wallet and review the allowance.");
  }
  const result = await runOfflineMeteredOperation({ allowanceId: selectedAllowanceId, toolId: input.toolId, unitCount: 1 }, operation);
  if (typeof navigator !== "undefined" && navigator.onLine) {
    // The signed row is already durable. A network failure is deliberately non-fatal here:
    // keep the local record and retry on the next online event or from the wallet screen.
    void synchronizeSelectedWebOfflineAllowance();
  }
  return result;
}

function openDb(): Promise<IDBDatabase> {
  requireBrowser();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys", { keyPath: "deviceKeyId" });
      if (!db.objectStoreNames.contains("issueIntents")) db.createObjectStore("issueIntents", { keyPath: "idempotencyKey" });
      if (!db.objectStoreNames.contains("allowances")) db.createObjectStore("allowances", { keyPath: "allowanceId" });
      if (!db.objectStoreNames.contains("transactions")) {
        const store = db.createObjectStore("transactions", { keyPath: ["allowanceId", "sequenceNumber"] });
        store.createIndex("byAllowance", "allowanceId", { unique: false });
        store.createIndex("byTransactionId", ["allowanceId", "record.transactionId"], { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new OfflineClientError("OFFLINE_STORAGE_UNAVAILABLE", "enV could not open its offline journal. No token-consuming offline operation should run."));
    request.onblocked = () => reject(new OfflineClientError("OFFLINE_STORAGE_BLOCKED", "Close other enV tabs to finish updating the offline journal."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

/** Creates a non-exportable P-256 private key. The public key is the only key material uploaded. */
export async function createOfflineDeviceKey(): Promise<{ deviceKeyId: string; publicKeyJwk: OfflinePublicJwk }> {
  const db = await openDb();
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
  if (exported.kty !== "EC" || exported.crv !== "P-256" || !exported.x || !exported.y || "d" in exported) {
    db.close();
    throw new OfflineClientError("OFFLINE_KEY_GENERATION_FAILED", "The browser did not create a valid public signing key.");
  }
  const publicKeyJwk: OfflinePublicJwk = { kty: "EC", crv: "P-256", x: exported.x, y: exported.y, ext: true, key_ops: ["verify"] };
  const deviceKeyId = randomId();
  const tx = db.transaction(["keys"], "readwrite");
  tx.objectStore("keys").put({ deviceKeyId, privateKey: pair.privateKey, publicKeyJwk, createdAt: new Date().toISOString() } satisfies KeyRecord);
  await transactionDone(tx);
  db.close();
  return { deviceKeyId, publicKeyJwk };
}

/** Persist a server-issued allowance locally only after the server confirms the reservation. */
export async function saveOfflineAllowance(input: {
  allowanceId: string; deviceKeyId: string; issueIdempotencyKey: string; allowanceToken: string; allowanceSubunits: number;
  pricingVersion: string; issuedAt: string; expiresAt: string;
}): Promise<void> {
  if (!input.allowanceId || !input.allowanceToken || !Number.isSafeInteger(input.allowanceSubunits) || input.allowanceSubunits < 1 ||
      !input.pricingVersion || !Number.isFinite(Date.parse(input.issuedAt)) || !Number.isFinite(Date.parse(input.expiresAt)) ||
      Date.parse(input.expiresAt) <= Date.parse(input.issuedAt)) {
    throw new OfflineClientError("INVALID_ALLOWANCE", "The server returned an invalid offline allowance.");
  }
  const db = await openDb();
  const tx = db.transaction(["keys", "allowances", "issueIntents"], "readwrite");
  const keys = tx.objectStore("keys");
  let localError: OfflineClientError | null = null;
  const keyRequest = keys.get(input.deviceKeyId);
  keyRequest.onsuccess = () => {
    if (!keyRequest.result) {
      localError = new OfflineClientError("OFFLINE_KEY_MISSING", "The device signing key is missing. Do not spend from this allowance; recover it through the wallet screen.");
      tx.abort(); return;
    }
    const store = tx.objectStore("allowances");
    const existingRequest = store.get(input.allowanceId);
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as StoredAllowance | undefined;
      if (existing) {
        // A replayed server issue response must never reset a local spent balance, sequence,
        // pending records, or sync batch. It may only be an exact immutable-claim replay.
        const same = existing.deviceKeyId === input.deviceKeyId && existing.allowanceToken === input.allowanceToken &&
          existing.allowanceSubunits === input.allowanceSubunits && existing.pricingVersion === input.pricingVersion &&
          Date.parse(existing.issuedAt) === Date.parse(input.issuedAt) && Date.parse(existing.expiresAt) === Date.parse(input.expiresAt) &&
          existing.issueIdempotencyKey === input.issueIdempotencyKey;
        if (!same) {
          localError = new OfflineClientError("ALLOWANCE_REPLAY_CONFLICT", "This allowance ID already exists with different claims. Keep current records and contact wallet support.");
          tx.abort(); return;
        }
      } else {
        store.add({ ...input, nextSequence: 1, lastAckSequence: 0,
          spentSubunits: 0, pendingSubunits: 0, status: "issued" } satisfies StoredAllowance);
      }
      tx.objectStore("issueIntents").delete(input.issueIdempotencyKey);
    };
  };
  try { await transactionDone(tx); }
  catch {
    db.close();
    if (localError) throw localError;
    throw new OfflineClientError("OFFLINE_ALLOWANCE_SAVE_FAILED", "The allowance could not be saved safely. Keep your pending issue request and retry.");
  }
  db.close();
}

/**
 * Allocate a sequence and reserve the local price BEFORE the tool runs. The caller must
 * await completeOfflineOperation/failOfflineOperation after execution. A preparing row
 * left by a crash blocks finalization rather than being guessed as success or failure.
 */
export async function beginOfflineOperation(input: {
  allowanceId: string; toolId: string; unitCount?: number;
}): Promise<{ allowanceId: string; sequenceNumber: number; transactionId: string; reservedSubunits: number }> {
  const unitCount = input.unitCount ?? 1;
  // Protocol v1 charges one fixed-price invocation. Client-reported batch sizes or durations
  // are unverifiable offline; each invocation must receive its own sequence and transaction.
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(input.toolId) || unitCount !== 1) {
    throw new OfflineClientError("INVALID_OPERATION", "Offline protocol v1 meters one fixed-price tool invocation at a time.");
  }
  const profile = offlineEligibleById.get(input.toolId);
  if (!profile || !Number.isSafeInteger(profile.subunitsPerUnit) || profile.subunitsPerUnit < 1) {
    throw new OfflineClientError("OFFLINE_TOOL_NOT_ELIGIBLE", "This tool is not approved for offline token metering. Connect to the internet to continue.");
  }
  const reservedSubunits = profile.subunitsPerUnit * unitCount;
  if (!Number.isSafeInteger(reservedSubunits) || reservedSubunits < 1) {
    throw new OfflineClientError("INVALID_OPERATION_COST", "The local token estimate is outside the supported range.");
  }
  const db = await openDb();
  const transaction = db.transaction(["keys", "allowances", "transactions"], "readwrite");
  const allowances = transaction.objectStore("allowances");
  let ticket: { allowanceId: string; sequenceNumber: number; transactionId: string; reservedSubunits: number } | null = null;
  const allowanceRequest = allowances.get(input.allowanceId);
  allowanceRequest.onsuccess = () => {
    const allowance = allowanceRequest.result as StoredAllowance | undefined;
    if (!allowance || !["issued", "syncing"].includes(allowance.status) || allowance.pendingBatch?.finalized === true ||
        Date.now() >= Date.parse(allowance.expiresAt) || allowance.pricingVersion !== offlineEligibleTools.pricingVersion) {
      transaction.abort(); return;
    }
    const keyRequest = transaction.objectStore("keys").get(allowance.deviceKeyId);
    keyRequest.onsuccess = () => {
      const key = keyRequest.result as KeyRecord | undefined;
      if (!key || allowance.spentSubunits + allowance.pendingSubunits + reservedSubunits > allowance.allowanceSubunits) {
        transaction.abort(); return;
      }
      const sequenceNumber = allowance.nextSequence;
      const transactionId = randomId();
      const record: OfflineTransactionRecord = {
        transactionId, sequenceNumber, toolId: input.toolId, pricingVersion: allowance.pricingVersion,
        unitCount, outcome: "succeeded", recordedAt: new Date().toISOString(), signature: "",
      };
      const row: StoredTransaction = {
        allowanceId: allowance.allowanceId, sequenceNumber, record, reservedSubunits,
        status: "preparing", createdAt: new Date().toISOString(),
      };
      allowance.nextSequence += 1;
      allowance.pendingSubunits += reservedSubunits;
      allowances.put(allowance);
      transaction.objectStore("transactions").add(row);
      ticket = { allowanceId: allowance.allowanceId, sequenceNumber, transactionId, reservedSubunits };
    };
  };
  try { await transactionDone(transaction); }
  catch {
    db.close();
    throw new OfflineClientError("OFFLINE_JOURNAL_FAILED", "The offline journal could not reserve the operation. enV must not run this token-metered operation offline.");
  }
  db.close();
  if (!ticket) throw new OfflineClientError("OFFLINE_ALLOWANCE_EXHAUSTED", "The offline allowance is unavailable, expired, or has insufficient reserved balance for this operation.");
  return ticket;
}

/** Commit the operation outcome. A successful result is not returned by the wrapper until this signed record is durable. */
export async function finishOfflineOperation(input: { allowanceId: string; sequenceNumber: number; outcome: "succeeded" | "failed" }): Promise<OfflineTransactionRecord> {
  const db = await openDb();
  const tx = db.transaction(["keys", "allowances", "transactions"], "readwrite");
  const allowanceRequest = tx.objectStore("allowances").get(input.allowanceId);
  let rowForSigning: StoredTransaction | null = null;
  let keyForSigning: KeyRecord | null = null;
  let finishError: OfflineClientError | null = null;
  allowanceRequest.onsuccess = () => {
    const allowance = allowanceRequest.result as StoredAllowance | undefined;
    if (!allowance) { finishError = new OfflineClientError("OFFLINE_ALLOWANCE_MISSING", "The offline allowance was not found."); tx.abort(); return; }
    const keyRequest = tx.objectStore("keys").get(allowance.deviceKeyId);
    keyRequest.onsuccess = () => {
      const key = keyRequest.result as KeyRecord | undefined;
      const recordRequest = tx.objectStore("transactions").get([input.allowanceId, input.sequenceNumber]);
      recordRequest.onsuccess = () => {
        const row = recordRequest.result as StoredTransaction | undefined;
        if (!key || !row) { finishError = new OfflineClientError("OFFLINE_OPERATION_MISSING", "The offline operation ticket could not be recovered."); tx.abort(); return; }
        if (row.status === "ready") {
          if (row.record.outcome !== input.outcome) { finishError = new OfflineClientError("OFFLINE_OUTCOME_CONFLICT", "This offline operation already has a different committed outcome."); tx.abort(); return; }
          rowForSigning = row; keyForSigning = key; return;
        }
        if (row.status === "preparing") {
          row.record.outcome = input.outcome;
          row.status = "finishing";
          allowance.pendingSubunits = Math.max(0, allowance.pendingSubunits - row.reservedSubunits);
          // Charge attempts regardless of client-reported outcome. A modified client can sign
          // its own "failed" claim, so that flag must never create free execution or a refund.
          allowance.spentSubunits += row.reservedSubunits;
          tx.objectStore("allowances").put(allowance);
          tx.objectStore("transactions").put(row);
          rowForSigning = row; keyForSigning = key;
          return;
        }
        if (row.status === "finishing" && row.record.outcome === input.outcome) {
          rowForSigning = row; keyForSigning = key; return;
        }
        finishError = new OfflineClientError("OFFLINE_OUTCOME_CONFLICT", "This offline operation is already being committed with a different outcome.");
        tx.abort();
      };
    };
  };
  try { await transactionDone(tx); }
  catch (error) { db.close(); if (finishError) throw finishError; throw error; }
  const row = rowForSigning as StoredTransaction | null;
  const key = keyForSigning as KeyRecord | null;
  if (!row || !key) { db.close(); throw new OfflineClientError("OFFLINE_OPERATION_MISSING", "The offline outcome could not be committed."); }
  if (row.status === "ready") { db.close(); return row.record; }
  const message = canonicalOfflineTransaction({ allowanceId: input.allowanceId, ...row.record });
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, new TextEncoder().encode(message));
  const proposedSignature = bytesToBase64Url(new Uint8Array(signature));
  const save = db.transaction(["transactions"], "readwrite");
  const currentRequest = save.objectStore("transactions").get([input.allowanceId, input.sequenceNumber]);
  let savedRecord: OfflineTransactionRecord | null = null;
  let saveError: OfflineClientError | null = null;
  currentRequest.onsuccess = () => {
    const current = currentRequest.result as StoredTransaction | undefined;
    if (!current || current.record.outcome !== input.outcome) {
      saveError = new OfflineClientError("OFFLINE_OUTCOME_CONFLICT", "The durable operation changed while its signature was being saved.");
      save.abort(); return;
    }
    if (current.status === "ready") {
      savedRecord = current.record;
      return;
    }
    if (current.status !== "finishing") {
      saveError = new OfflineClientError("OFFLINE_OPERATION_MISSING", "The operation is not in a signable journal state.");
      save.abort(); return;
    }
    current.record.signature = proposedSignature;
    current.status = "ready";
    save.objectStore("transactions").put(current);
    savedRecord = current.record;
  };
  try { await transactionDone(save); }
  catch {
    db.close();
    if (saveError) throw saveError;
    throw new OfflineClientError("OFFLINE_SIGNATURE_SAVE_FAILED", "The signed operation record was not persisted. Preserve the journal and retry.");
  }
  db.close();
  if (!savedRecord) throw new OfflineClientError("OFFLINE_SIGNATURE_SAVE_FAILED", "The signed operation record could not be recovered.");
  return savedRecord;
}

export async function runOfflineMeteredOperation<T>(input: { allowanceId: string; toolId: string; unitCount?: number }, operation: () => T | Promise<T>): Promise<T> {
  const ticket = await beginOfflineOperation(input);
  try {
    const result = await operation();
    await finishOfflineOperation({ allowanceId: ticket.allowanceId, sequenceNumber: ticket.sequenceNumber, outcome: "succeeded" });
    return result;
  } catch (error) {
    await finishOfflineOperation({ allowanceId: ticket.allowanceId, sequenceNumber: ticket.sequenceNumber, outcome: "failed" }).catch(() => undefined);
    throw error;
  }
}

/** Re-signs only outcomes already committed as finishing. Unknown/preparing outcomes are never guessed. */
export async function repairFinishingOfflineRecords(allowanceId: string): Promise<{ repaired: number; unresolvedPreparing: number }> {
  const db = await openDb();
  const allowance = await getRow<StoredAllowance>(db, "allowances", allowanceId);
  if (!allowance) { db.close(); return { repaired: 0, unresolvedPreparing: 0 }; }
  const key = await getRow<KeyRecord>(db, "keys", allowance.deviceKeyId);
  if (!key) { db.close(); throw new OfflineClientError("OFFLINE_KEY_MISSING", "The signing key is missing. This allowance requires recovery; it cannot be automatically refunded."); }
  const rows = (await getRows<StoredTransaction>(db, "transactions"))
    .filter((row) => row.allowanceId === allowanceId)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  let repaired = 0;
  for (const row of rows.filter((item) => item.status === "finishing")) {
    const message = canonicalOfflineTransaction({ allowanceId, ...row.record });
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, new TextEncoder().encode(message));
    row.record.signature = bytesToBase64Url(new Uint8Array(signature)); row.status = "ready";
    const tx = db.transaction(["transactions"], "readwrite"); tx.objectStore("transactions").put(row); await transactionDone(tx); repaired += 1;
  }
  const unresolvedPreparing = rows.filter((row) => row.status === "preparing").length;
  db.close();
  return { repaired, unresolvedPreparing };
}

async function getRow<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const tx = db.transaction([storeName], "readonly");
  const result = await requestResult(tx.objectStore(storeName).get(key)) as T | undefined;
  await transactionDone(tx);
  return result;
}

async function getRows<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  const tx = db.transaction([storeName], "readonly");
  const result = await requestResult(tx.objectStore(storeName).getAll()) as T[];
  await transactionDone(tx);
  return result;
}

/** Create or reuse a persisted batch so network retries are byte-for-byte idempotent. */
export async function buildOfflineSyncBatch(allowanceId: string, finalize: boolean) {
  const db = await openDb();
  type Plan = { allowance: StoredAllowance; pending: PendingBatch; records: StoredTransaction[] };
  let plan: Plan | null = null;
  let planError: OfflineClientError | null = null;
  const tx = db.transaction(["allowances", "transactions"], "readwrite");
  const allowances = tx.objectStore("allowances");
  const allowanceRequest = allowances.get(allowanceId);
  allowanceRequest.onsuccess = () => {
    const allowance = allowanceRequest.result as StoredAllowance | undefined;
    if (!allowance) {
      planError = new OfflineClientError("OFFLINE_ALLOWANCE_MISSING", "The local allowance was not found.");
      tx.abort(); return;
    }
    const rowsRequest = tx.objectStore("transactions").getAll();
    rowsRequest.onsuccess = () => {
      const rows = (rowsRequest.result as StoredTransaction[])
        .filter((row) => row.allowanceId === allowanceId)
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      if (allowance.pendingBatch) {
        const pending = allowance.pendingBatch;
        const records = rows.filter((row) => pending.sequenceNumbers.includes(row.sequenceNumber));
        if (records.length !== pending.sequenceNumbers.length || records.some((row) => row.status !== "ready")) {
          planError = new OfflineClientError("OFFLINE_JOURNAL_GAP", "The saved sync batch is incomplete. Keep the reservation protected and use wallet recovery.");
          tx.abort(); return;
        }
        plan = { allowance, pending, records };
        return;
      }
      if (!(["issued", "syncing"].includes(allowance.status)) || Date.now() >= Date.parse(allowance.expiresAt) ||
          allowance.pricingVersion !== offlineEligibleTools.pricingVersion) {
        planError = new OfflineClientError("OFFLINE_ALLOWANCE_UNAVAILABLE", "This allowance is expired, unresolved, or uses a different pricing version.");
        tx.abort(); return;
      }
      const all = rows.filter((row) => row.sequenceNumber > allowance.lastAckSequence);
      if (all.some((row) => row.status !== "ready")) {
        planError = new OfflineClientError("OFFLINE_JOURNAL_INCOMPLETE", "An offline operation is still being journaled. Repair the local journal before syncing or finalizing.");
        tx.abort(); return;
      }
      let expected = allowance.lastAckSequence + 1;
      for (const row of all) {
        if (row.sequenceNumber !== expected) {
          planError = new OfflineClientError("OFFLINE_JOURNAL_GAP", "A local transaction is missing. enV will not finalize or release the reservation; use wallet recovery.");
          tx.abort(); return;
        }
        expected += 1;
      }
      if (allowance.nextSequence - 1 !== expected - 1) {
        planError = new OfflineClientError("OFFLINE_JOURNAL_GAP", "The local journal tail is incomplete. Keep the reservation protected until recovery.");
        tx.abort(); return;
      }
      const chosen = all.slice(0, MAX_BATCH_RECORDS);
      const actualFinalize = finalize && all.length <= MAX_BATCH_RECORDS;
      const checkpointSequence = chosen.length ? chosen[chosen.length - 1]!.sequenceNumber : allowance.lastAckSequence;
      // Atomically reserve a stable batch ID and immutable sequence set before doing async
      // WebCrypto work. Other tabs will reuse this intent instead of overwriting it.
      const pending: PendingBatch = {
        batchId: randomId(), checkpointSequence, finalized: actualFinalize,
        sequenceNumbers: chosen.map((row) => row.sequenceNumber), checkpointSignature: "",
      };
      allowance.pendingBatch = pending;
      allowance.status = "syncing";
      allowances.put(allowance);
      plan = { allowance, pending, records: chosen };
    };
  };
  try { await transactionDone(tx); }
  catch {
    db.close();
    if (planError) throw planError;
    throw new OfflineClientError("OFFLINE_BATCH_CHECKPOINT_FAILED", "The offline sync intent could not be committed atomically. Keep local records and retry.");
  }
  const prepared = plan as Plan | null;
  if (!prepared) { db.close(); throw new OfflineClientError("OFFLINE_BATCH_CHECKPOINT_FAILED", "The offline sync intent was not saved. Keep local records and retry."); }
  const allowance = prepared.allowance;
  let pending = prepared.pending;
  if (pending.checkpointSignature) {
    const result = { allowanceToken: allowance.allowanceToken, batchId: pending.batchId,
      transactions: prepared.records.map((row) => row.record), checkpointSequence: pending.checkpointSequence,
      checkpointSignature: pending.checkpointSignature, finalized: pending.finalized };
    db.close(); return result;
  }
  const key = await getRow<KeyRecord>(db, "keys", allowance.deviceKeyId);
  if (!key) {
    db.close(); throw new OfflineClientError("OFFLINE_KEY_MISSING", "The signing key is missing. The saved batch remains reserved for recovery.");
  }
  const checkpointMessage = canonicalOfflineCheckpoint({ allowanceId, checkpointSequence: pending.checkpointSequence, finalized: pending.finalized });
  const proposedSignature = bytesToBase64Url(new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key.privateKey, new TextEncoder().encode(checkpointMessage))));
  // Multiple tabs may sign the same intent. The first saved signature is authoritative; later
  // callers reuse it. They never replace the stable batch ID or the sequence checkpoint.
  const commit = db.transaction(["allowances"], "readwrite");
  const currentRequest = commit.objectStore("allowances").get(allowanceId);
  let finalSignature: string | null = null;
  let commitError: OfflineClientError | null = null;
  currentRequest.onsuccess = () => {
    const current = currentRequest.result as StoredAllowance | undefined;
    if (!current?.pendingBatch || current.pendingBatch.batchId !== pending.batchId ||
        current.pendingBatch.checkpointSequence !== pending.checkpointSequence ||
        current.pendingBatch.finalized !== pending.finalized ||
        current.pendingBatch.sequenceNumbers.join(",") !== pending.sequenceNumbers.join(",")) {
      commitError = new OfflineClientError("OFFLINE_BATCH_MISMATCH", "The pending offline batch changed in another tab. Keep records and recover before retrying.");
      commit.abort(); return;
    }
    finalSignature = current.pendingBatch.checkpointSignature || proposedSignature;
    current.pendingBatch.checkpointSignature = finalSignature;
    commit.objectStore("allowances").put(current);
  };
  try { await transactionDone(commit); }
  catch {
    db.close();
    if (commitError) throw commitError;
    throw new OfflineClientError("OFFLINE_BATCH_CHECKPOINT_FAILED", "The checkpoint signature could not be saved. Keep the pending batch and retry.");
  }
  pending = { ...pending, checkpointSignature: finalSignature ?? proposedSignature };
  db.close();
  return { allowanceToken: allowance.allowanceToken, batchId: pending.batchId,
    transactions: prepared.records.map((row) => row.record), checkpointSequence: pending.checkpointSequence,
    checkpointSignature: pending.checkpointSignature!, finalized: pending.finalized };
}

/** Call only when the server returns a durable syncing/reconciled result for the current batch. */
export async function acknowledgeOfflineSyncBatch(allowanceId: string, batchId: string, resultStatus: string, checkpointSequence?: number): Promise<void> {
  if (resultStatus !== "syncing" && resultStatus !== "reconciled") {
    throw new OfflineClientError("OFFLINE_SYNC_NOT_ACCEPTED", "The server did not confirm this batch. Keep all local records and retry or recover.");
  }
  const db = await openDb();
  const tx = db.transaction(["allowances", "transactions"], "readwrite");
  const request = tx.objectStore("allowances").get(allowanceId);
  let localError: OfflineClientError | null = null;
  request.onsuccess = () => {
    const allowance = request.result as StoredAllowance | undefined;
    if (!allowance) {
      localError = new OfflineClientError("OFFLINE_ALLOWANCE_MISSING", "The local allowance is missing; the server acknowledgement cannot change another wallet.");
      tx.abort(); return;
    }
    // A second tab can receive the same successful server response after the first tab has
    // already deleted the batch rows. Treat that replay as success only when its checkpoint
    // is at or below the durable local acknowledgement watermark.
    if (!allowance.pendingBatch && checkpointSequence !== undefined && allowance.lastAckSequence >= checkpointSequence) return;
    if (!allowance.pendingBatch || allowance.pendingBatch.batchId !== batchId) {
      localError = new OfflineClientError("OFFLINE_BATCH_MISMATCH", "The acknowledgement does not match the saved batch. Local records were preserved.");
      tx.abort(); return;
    }
    const pending = allowance.pendingBatch;
    if (checkpointSequence !== undefined && pending.checkpointSequence !== checkpointSequence) {
      localError = new OfflineClientError("OFFLINE_BATCH_MISMATCH", "The server checkpoint does not match the locally saved batch. Local records were preserved.");
      tx.abort(); return;
    }
    for (const sequence of pending.sequenceNumbers) tx.objectStore("transactions").delete([allowanceId, sequence]);
    allowance.lastAckSequence = Math.max(allowance.lastAckSequence, pending.checkpointSequence);
    allowance.pendingBatch = undefined;
    allowance.status = resultStatus === "reconciled" ? "reconciled" : "syncing";
    tx.objectStore("allowances").put(allowance);
  };
  try { await transactionDone(tx); }
  catch {
    db.close();
    if (localError) throw localError;
    throw new OfflineClientError("OFFLINE_ACKNOWLEDGEMENT_FAILED", "The server acknowledgement could not be saved atomically. Keep local records and retry.");
  }
  db.close();
}

/** Request a server reservation; no local allowance is stored until the server returns success. */
export async function requestWebOfflineAllowance(input: { requestedSubunits: number; idempotencyKey: string }) {
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(input.idempotencyKey) || !Number.isSafeInteger(input.requestedSubunits) || input.requestedSubunits < 100) {
    throw new OfflineClientError("INVALID_ALLOWANCE_REQUEST", "Use a stable idempotency key and a valid milli-token allowance amount.");
  }
  const localDb = await openDb();
  const savedAllowances = await getRows<StoredAllowance>(localDb, "allowances");
  const existingAllowance = savedAllowances.find((item) => item.issueIdempotencyKey === input.idempotencyKey);
  if (existingAllowance) {
    localDb.close();
    return { allowanceId: existingAllowance.allowanceId, allowanceSubunits: existingAllowance.allowanceSubunits,
      pricingVersion: existingAllowance.pricingVersion, status: existingAllowance.status, expiresAt: existingAllowance.expiresAt };
  }
  let intent = await getRow<OfflineIssueIntent>(localDb, "issueIntents", input.idempotencyKey);
  localDb.close();
  if (intent && intent.requestedSubunits !== input.requestedSubunits) {
    throw new OfflineClientError("IDEMPOTENCY_CONFLICT", "This allowance key was already used with a different requested amount.");
  }
  if (!intent) {
    const device = await createOfflineDeviceKey();
    const candidate: OfflineIssueIntent = { idempotencyKey: input.idempotencyKey, deviceKeyId: device.deviceKeyId,
      requestedSubunits: input.requestedSubunits, createdAt: new Date().toISOString() };
    const db = await openDb();
    const tx = db.transaction(["issueIntents"], "readwrite");
    try { tx.objectStore("issueIntents").add(candidate); await transactionDone(tx); intent = candidate; }
    catch {
      const winner = await getRow<OfflineIssueIntent>(db, "issueIntents", input.idempotencyKey);
      if (!winner || winner.requestedSubunits !== input.requestedSubunits) { db.close(); throw new OfflineClientError("OFFLINE_ISSUE_INTENT_FAILED", "The allowance request could not be safely prepared."); }
      intent = winner;
    }
    db.close();
  }
  const keyDb = await openDb();
  const key = await getRow<KeyRecord>(keyDb, "keys", intent.deviceKeyId);
  keyDb.close();
  if (!key) throw new OfflineClientError("OFFLINE_KEY_MISSING", "The pending allowance's signing key is missing. Report this allowance through the wallet recovery process.");
  const response = await fetch("/api/billing/offline/allowances", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ requestedSubunits: input.requestedSubunits, idempotencyKey: input.idempotencyKey, platform: "web", publicKeyJwk: key.publicKeyJwk }),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; data?: { allowance?: Record<string, unknown>; allowanceToken?: string }; message?: string } | null;
  if (!response.ok || !payload?.ok || !payload.data?.allowance || typeof payload.data.allowanceToken !== "string") {
    throw new OfflineClientError("OFFLINE_ALLOWANCE_ISSUE_FAILED", payload?.message ?? "The server did not issue an offline allowance. No offline balance was activated.");
  }
  const allowance = payload.data.allowance;
  await saveOfflineAllowance({
    allowanceId: String(allowance.allowanceId), deviceKeyId: intent.deviceKeyId, issueIdempotencyKey: input.idempotencyKey,
    allowanceToken: payload.data.allowanceToken, allowanceSubunits: Number(allowance.allowanceSubunits),
    pricingVersion: String(allowance.pricingVersion), issuedAt: String(allowance.issuedAt), expiresAt: String(allowance.expiresAt),
  });
  return allowance;
}

/** Send the persisted, retry-safe batch and acknowledge records only after server confirmation. */
export async function synchronizeWebOfflineAllowance(allowanceId: string, finalize = false) {
  if (finalize) {
    const statusResponse = await fetch("/api/billing/offline/status", { credentials: "same-origin", headers: { accept: "application/json" } });
    const statusPayload = await statusResponse.json().catch(() => null) as { ok?: boolean; data?: { enabled?: boolean; code?: string }; message?: string } | null;
    if (!statusResponse.ok || !statusPayload?.ok || statusPayload.data?.enabled !== true || statusPayload.data.code !== "LOCAL_TEST_ONLY") {
      throw new OfflineClientError("OFFLINE_FINALIZATION_NOT_AVAILABLE", statusPayload?.message ?? "Allowance finalization is unavailable until the server confirms the isolated local-test environment. No records were deleted.");
    }
  }
  const batch = await buildOfflineSyncBatch(allowanceId, finalize);
  const response = await fetch("/api/billing/offline/sync", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ allowanceToken: batch.allowanceToken, batchId: batch.batchId, transactions: batch.transactions,
      checkpointSequence: batch.checkpointSequence, checkpointSignature: batch.checkpointSignature, finalized: batch.finalized }),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; data?: { status?: string }; message?: string } | null;
  if (!payload?.ok || !payload.data?.status || (!response.ok && payload.data.status !== "needs_recovery")) {
    throw new OfflineClientError("OFFLINE_SYNC_FAILED", payload?.message ?? "The sync did not receive server confirmation. Keep the local records and retry or recover.");
  }
  if (payload.data.status === "needs_recovery") {
    const recoveryCode = String((payload.data as { error?: unknown }).error ?? "");
    // These two conditions are repairable by submitting the original durable records again
    // in a fresh batch. Preserve every row and its sequence; only discard the rejected batch
    // envelope so the server can replay already accepted rows idempotently.
    if (recoveryCode === "SEQUENCE_GAP" || recoveryCode === "CHECKPOINT_SEQUENCE_MISMATCH") {
      const db = await openDb();
      const tx = db.transaction(["allowances"], "readwrite");
      const request = tx.objectStore("allowances").get(allowanceId);
      request.onsuccess = () => {
        const allowance = request.result as StoredAllowance | undefined;
        if (allowance?.pendingBatch?.batchId === batch.batchId) {
          allowance.pendingBatch = undefined;
          allowance.status = "syncing";
          tx.objectStore("allowances").put(allowance);
        }
      };
      try { await transactionDone(tx); }
      catch { db.close(); throw new OfflineClientError("OFFLINE_RECOVERY_RETRY_FAILED", "The rejected sync batch could not be safely reset. Local records remain saved; use wallet recovery."); }
      db.close();
      return { ...payload.data, retryable: true, message: "The server preserved accepted records. enV kept the local ledger and prepared it for a safe idempotent retry." };
    }
    const db = await openDb();
    const allowance = await getRow<StoredAllowance>(db, "allowances", allowanceId);
    if (allowance) { allowance.status = "needs_recovery"; const tx = db.transaction(["allowances"], "readwrite"); tx.objectStore("allowances").put(allowance); await transactionDone(tx); }
    db.close();
    return payload.data;
  }
  await acknowledgeOfflineSyncBatch(allowanceId, batch.batchId, payload.data.status, batch.checkpointSequence);
  return payload.data;
}

/** Retry selected local records after reconnect/reload. This function never finalizes an
 * allowance or releases reserved funds. It repairs only already-committed `finishing` rows;
 * an unresolved `preparing` row blocks synchronization and remains a recovery issue. */
export async function synchronizeSelectedWebOfflineAllowance(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine) return;
  let allowanceId: string | null;
  try { allowanceId = getSelectedWebOfflineAllowanceId(); }
  catch { return; }
  if (!allowanceId) return;
  try {
    let local = await getLocalOfflineAllowance(allowanceId);
    if (!local || local.pendingRecords === 0 || local.preparingRecords > 0 || local.status === "needs_recovery") return;
    await repairFinishingOfflineRecords(allowanceId);
    local = await getLocalOfflineAllowance(allowanceId);
    if (!local || local.pendingRecords === 0 || local.preparingRecords > 0 || local.status === "needs_recovery") return;
    await synchronizeWebOfflineAllowance(allowanceId, false);
  } catch {
    // Durable local records remain the source for retry. Network/auth/sequence failures are
    // surfaced in the wallet page when the user opens it; never discard rows here.
  }
}

/** Report loss without implying a refund; the shared server keeps unresolved reservation funds protected. */
export async function reportWebOfflineAllowanceLost(allowanceId: string) {
  const response = await fetch("/api/billing/offline/recovery", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ allowanceId }),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; data?: unknown; message?: string } | null;
  if (!response.ok || !payload?.ok) throw new OfflineClientError("OFFLINE_RECOVERY_FAILED", payload?.message ?? "Offline recovery could not be recorded.");
  return payload.data;
}

/** Return local state for wallet UI; never treat it as the confirmed wallet balance. */
export async function getLocalOfflineAllowance(allowanceId: string) {
  const db = await openDb();
  const allowance = await getRow<StoredAllowance>(db, "allowances", allowanceId);
  const records = (await getRows<StoredTransaction>(db, "transactions"))
    .filter((row) => row.allowanceId === allowanceId)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  db.close();
  if (!allowance) return null;
  return {
    allowanceId: allowance.allowanceId, reservedSubunits: allowance.allowanceSubunits,
    pendingRecords: records.length, preparingRecords: records.filter((r) => r.status === "preparing").length,
    lastAckSequence: allowance.lastAckSequence, nextSequence: allowance.nextSequence,
    spentSubunits: allowance.spentSubunits, pendingSubunits: allowance.pendingSubunits,
    availableOfflineSubunits: Math.max(0, allowance.allowanceSubunits - allowance.spentSubunits - allowance.pendingSubunits),
    status: allowance.status, expiresAt: allowance.expiresAt, lastSyncState: allowance.pendingBatch ? "pending" : "none",
  };
}
