import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  canonicalOfflineCheckpoint,
  canonicalOfflinePublicKey,
  canonicalOfflineTransaction,
  isCanonicalBase64Url,
  isValidBase64Url,
  normalizeOfflinePublicJwk,
} from "./offline-protocol.ts";
import { isUsableOfflinePublicKey, sha256Hex, signAllowanceToken, verifyAllowanceToken, verifyDeviceSignature } from "./offline-crypto.server.ts";

const secret = "test-offline-wallet-signing-secret-0123456789";
const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicJwk = normalizeOfflinePublicJwk(pair.publicKey.export({ format: "jwk" }));
assert.ok(publicJwk);
const allowanceId = "a0f36e4a-10ca-471b-aea4-9f642c4a3f87";

function signatureFor(message: string) {
  return sign("sha256", Buffer.from(message), { key: pair.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
}


const protocolFixture = JSON.parse(readFileSync(new URL("../../../apps/shared/offline-protocol-v1-fixtures.json", import.meta.url), "utf8")) as {
  transaction: { allowanceId: string; transactionId: string; sequenceNumber: number; toolId: string; pricingVersion: string; unitCount: number; outcome: "succeeded" | "failed"; recordedAt: string; canonical: string };
  checkpoint: { allowanceId: string; checkpointSequence: number; finalized: boolean; canonical: string };
};

test("shared protocol golden vectors are identical to the server canonical wire format", () => {
  const tx = protocolFixture.transaction;
  assert.equal(canonicalOfflineTransaction({ ...tx }), tx.canonical);
  const checkpoint = protocolFixture.checkpoint;
  assert.equal(canonicalOfflineCheckpoint(checkpoint), checkpoint.canonical);
});


test("base64url rejects non-canonical encodings with non-zero unused trailing bits", () => {
  assert.equal(isCanonicalBase64Url("A".repeat(86)), true);
  assert.equal(isValidBase64Url("A".repeat(85) + "B", 86, 86), false);
  assert.equal(isCanonicalBase64Url("A".repeat(85) + "B"), false);
  assert.equal(isCanonicalBase64Url("A"), false);
  assert.equal(isCanonicalBase64Url("A".repeat(43)), true);
});

test("public-key normalization rejects private keys, non-P256 curves, and non-canonical coordinates", () => {
  const privateJwk = pair.privateKey.export({ format: "jwk" });
  assert.equal(normalizeOfflinePublicJwk(privateJwk), null);
  assert.equal(normalizeOfflinePublicJwk({ ...publicJwk, crv: "P-384" }), null);
  assert.equal(normalizeOfflinePublicJwk({ ...publicJwk, x: "short" }), null);
  assert.equal(normalizeOfflinePublicJwk({ ...publicJwk, x: publicJwk!.x.slice(0, -1) + "B" }), null);
  assert.equal(isUsableOfflinePublicKey(publicJwk!), true);
  assert.equal(isUsableOfflinePublicKey({ ...publicJwk!, x: "A".repeat(43) }), false);
});

test("device ECDSA signature covers the exact canonical transaction", () => {
  const record = { allowanceId, transactionId: "abc1234567890def", sequenceNumber: 1, toolId: "simple-calculator",
    pricingVersion: "pricing-test-v1", unitCount: 1, outcome: "succeeded" as const, recordedAt: "2026-10-18T20:15:30.000Z" };
  const message = canonicalOfflineTransaction(record);
  const signature = signatureFor(message);
  assert.equal(verifyDeviceSignature(publicJwk!, message, signature), true);
  // Native Android/iOS APIs generally return ASN.1 DER, while WebCrypto returns P1363.
  const nativeDerSignature = sign("sha256", Buffer.from(message), pair.privateKey).toString("base64url");
  assert.equal(verifyDeviceSignature(publicJwk!, message, nativeDerSignature), true);
  assert.equal(verifyDeviceSignature(publicJwk!, canonicalOfflineTransaction({ ...record, unitCount: 2 }), signature), false);
  assert.equal(verifyDeviceSignature(publicJwk!, message, "not-a-valid-signature"), false);
});

test("device ECDSA signature accepts the canonical checkpoint only", () => {
  const checkpoint = { allowanceId, checkpointSequence: 3, finalized: true };
  const message = canonicalOfflineCheckpoint(checkpoint);
  const signature = signatureFor(message);
  assert.equal(verifyDeviceSignature(publicJwk!, message, signature), true);
  assert.equal(verifyDeviceSignature(publicJwk!, canonicalOfflineCheckpoint({ ...checkpoint, checkpointSequence: 2 }), signature), false);
});

test("server allowance token is signed, account-bound, and expires after its sync grace", () => {
  const claims = { v: 1 as const, allowanceId, userId: "user-1", deviceKeyDigest: sha256Hex(canonicalOfflinePublicKey(publicJwk!)),
    allowanceSubunits: 20_000, pricingVersion: "pricing-test-v1", issuedAt: 1_797_000_000, expiresAt: 1_797_259_200, syncUntil: 1_798_468_800 };
  const token = signAllowanceToken(claims, secret);
  assert.deepEqual(verifyAllowanceToken(token, secret, "user-1", 1_797_300_000_000), claims);
  assert.throws(() => verifyAllowanceToken(token, secret, "user-2", 1_797_300_000_000));
  assert.throws(() => verifyAllowanceToken(`${token.slice(0, -1)}x`, secret, "user-1", 1_797_300_000_000));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const mac = token.split(".")[1]!;
  const finalIndex = alphabet.indexOf(mac.at(-1)!);
  const nonCanonicalMac = mac.slice(0, -1) + alphabet[(finalIndex & ~3) | ((finalIndex + 1) & 3)];
  assert.throws(() => verifyAllowanceToken(`${token.split(".")[0]}.${nonCanonicalMac}`, secret, "user-1", 1_797_300_000_000),
    /invalid|expired/i, "The token verifier must reject alternate base64url encodings of the same MAC.");
  assert.throws(() => verifyAllowanceToken(token, secret, "user-1", (claims.syncUntil + 1) * 1_000));
  const extendedToken = signAllowanceToken({ ...claims, syncUntil: claims.expiresAt + 14 * 24 * 60 * 60 + 1 }, secret);
  assert.throws(() => verifyAllowanceToken(extendedToken, secret, "user-1", 1_797_300_000_000));
  const oversizedToken = signAllowanceToken({ ...claims, allowanceSubunits: 20_001 }, secret);
  assert.throws(() => verifyAllowanceToken(oversizedToken, secret, "user-1", 1_797_300_000_000));
});
