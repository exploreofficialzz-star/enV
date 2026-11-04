import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import { test } from "node:test";
import { generateGoogleSigningKey, type GoogleSigningKeyInput } from "./google-signing-key.ts";

const baseInput: GoogleSigningKeyInput = {
  alias: "upload",
  storePassword: "A-Strong-Store-Password-2026!",
  keyPassword: "A-Different-Key-Password-2026!",
  commonName: "enV Android Upload",
  organization: "chAs Technologies LLC",
  organizationalUnit: "Mobile",
  city: "Port Harcourt",
  state: "Rivers",
  country: "NG",
  keySize: 2048,
  validityYears: 25,
};

test("Google signing key generator creates a JKS upload keystore and a valid self-signed certificate", async () => {
  const output = await generateGoogleSigningKey(baseInput);
  assert.equal(new DataView(output.keystore.buffer, output.keystore.byteOffset, 4).getUint32(0, false), 0xfeedfeed);
  assert.equal(new DataView(output.keystore.buffer, output.keystore.byteOffset, 8).getUint32(4, false), 2);
  assert.equal(new DataView(output.keystore.buffer, output.keystore.byteOffset, 12).getUint32(8, false), 1);
  assert.match(output.certificatePem, /^-----BEGIN CERTIFICATE-----/);
  const certificate = new X509Certificate(Buffer.from(output.certificateDer));
  assert.equal(certificate.subject.includes("CN=enV Android Upload"), true);
  assert.equal(certificate.verify(certificate.publicKey), true);
  assert.equal(output.sha1, createHash("sha1").update(output.certificateDer).digest("hex").toUpperCase().match(/.{2}/g)?.join(":") ?? "");
  assert.equal(output.sha256, createHash("sha256").update(output.certificateDer).digest("hex").toUpperCase().match(/.{2}/g)?.join(":") ?? "");
  assert.match(output.gradleKotlin, /ANDROID_KEYSTORE_PASSWORD/);
  assert.match(output.gradleKotlin, /ANDROID_KEY_PASSWORD/);
  assert.doesNotMatch(output.gradleKotlin, new RegExp(baseInput.storePassword));
  assert.doesNotMatch(output.gradleKotlin, new RegExp(baseInput.keyPassword));
});

test("Google signing key generator validates credentials and certificate settings", async () => {
  await assert.rejects(() => generateGoogleSigningKey({ ...baseInput, alias: "not a valid alias" }), /Alias must/);
  await assert.rejects(() => generateGoogleSigningKey({ ...baseInput, storePassword: "short" }), /keystore password/);
  await assert.rejects(() => generateGoogleSigningKey({ ...baseInput, country: "Nigeria" }), /two-letter/);
  await assert.rejects(() => generateGoogleSigningKey({ ...baseInput, keySize: 1024 as 2048 }), /RSA key size/);
  await assert.rejects(() => generateGoogleSigningKey({ ...baseInput, validityYears: 0 }), /Validity/);
});
