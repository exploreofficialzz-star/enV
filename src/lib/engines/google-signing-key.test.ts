import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import { test } from "node:test";
import { strFromU8, unzipSync, zipSync } from "fflate";
import { createGoogleSigningKeyHandoutFiles, generateGoogleSigningKey, type GoogleSigningKeyInput } from "./google-signing-key.ts";

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
  assert.equal(output.keystoreBase64, Buffer.from(output.keystore).toString("base64"));
  const handoutFiles = createGoogleSigningKeyHandoutFiles(output);
  const zip = unzipSync(zipSync(handoutFiles, { level: 6 }));
  assert.deepEqual(Object.keys(zip).filter((name) => !name.endsWith("/")).sort(), [
    ".gitignore-signing-example",
    ".github/workflows/android-release.yml",
    "README.md",
    "github-secrets.txt",
    "release-signing.gradle",
    "release-signing.gradle.kts",
    "signing-info.txt",
    "upload-keystore.base64.txt",
    "upload-keystore.jks",
    "upload_certificate.pem",
  ].sort());
  assert.deepEqual(zip["upload-keystore.jks"], output.keystore);
  assert.equal(strFromU8(zip["upload-keystore.base64.txt"]).trim(), output.keystoreBase64);
  assert.equal(strFromU8(zip["github-secrets.txt"]), output.githubSecrets);
  assert.equal(strFromU8(zip[".github/workflows/android-release.yml"]), output.githubActionsWorkflow);
  assert.equal(strFromU8(zip["README.md"]), output.handoutReadme);
  assert.ok(output.githubSecrets.includes("\n"));
  assert.equal(output.githubSecrets.includes("\\n"), false);
  assert.ok(output.signingInfo.includes("\n"));
  assert.equal(output.signingInfo.includes("\\n"), false);
  assert.match(output.gradleKotlin, /ANDROID_KEY_ALIAS/);
  assert.match(output.gradleGroovy, /ANDROID_KEY_ALIAS/);
  assert.match(output.githubSecrets, /^ANDROID_KEYSTORE_BASE64=/m);
  assert.match(output.githubSecrets, /^ANDROID_KEYSTORE_PASSWORD=A-Strong-Store-Password-2026!$/m);
  assert.match(output.githubSecrets, /^ANDROID_KEY_ALIAS=upload$/m);
  assert.match(output.githubSecrets, /^ANDROID_KEY_PASSWORD=A-Different-Key-Password-2026!$/m);
  assert.match(output.githubActionsWorkflow, /secrets\.ANDROID_KEYSTORE_BASE64/);
  assert.match(output.githubActionsWorkflow, /bundleRelease/);
  assert.match(output.githubActionsWorkflow, /working-directory: apps\/android/);
  assert.match(output.githubActionsWorkflow, /envRequireProductionSigning=true/);
  assert.match(output.githubActionsWorkflow, /jarsigner -verify/);
  assert.match(output.githubActionsWorkflow, /actions\/upload-artifact@v4/);
  assert.match(output.githubActionsWorkflow, /rm -f.*upload-keystore\.jks/);
  assert.match(output.handoutReadme, /Settings > Secrets and variables > Actions/);
  assert.match(output.signingInfo, /SHA-256:/);
  assert.match(output.gradleKotlin, /ANDROID_KEYSTORE_FILE/);
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
