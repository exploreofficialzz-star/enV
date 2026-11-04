const encoder = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function u32(value: number): Uint8Array {
  const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0, value, false); return out;
}
function u64(value: bigint): Uint8Array {
  const out = new Uint8Array(8); new DataView(out.buffer).setBigUint64(0, value, false); return out;
}
function derLength(length: number): Uint8Array {
  if (length < 128) return Uint8Array.of(length);
  const bytes: number[] = [];
  let n = length;
  while (n > 0) { bytes.unshift(n & 0xff); n = Math.floor(n / 256); }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}
function tlv(tag: number, value: Uint8Array): Uint8Array { return concat(Uint8Array.of(tag), derLength(value.length), value); }
function sequence(...values: Uint8Array[]): Uint8Array { return tlv(0x30, concat(...values)); }
function setOf(...values: Uint8Array[]): Uint8Array { return tlv(0x31, concat(...values)); }
function octet(value: Uint8Array): Uint8Array { return tlv(0x04, value); }
function bitString(value: Uint8Array, unusedBits = 0): Uint8Array { return tlv(0x03, concat(Uint8Array.of(unusedBits), value)); }
function integer(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("DER integer must be non-negative.");
  const bytes: number[] = [];
  let n = value;
  do { bytes.unshift(Number(n & 0xffn)); n >>= 8n; } while (n > 0n);
  if (bytes[0] & 0x80) bytes.unshift(0);
  return tlv(0x02, Uint8Array.from(bytes));
}
function integerBytes(value: Uint8Array): Uint8Array {
  let first = 0; while (first < value.length - 1 && value[first] === 0) first++;
  let body = value.slice(first);
  if (body[0] & 0x80) body = concat(Uint8Array.of(0), body);
  return tlv(0x02, body);
}
function base128(value: number): number[] {
  const out = [value & 0x7f];
  let n = Math.floor(value / 128);
  while (n > 0) { out.unshift((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
  for (let i = 0; i < out.length - 1; i++) out[i] |= 0x80;
  return out;
}
function oid(value: string): Uint8Array {
  const arcs = value.split(".").map(Number);
  if (arcs.length < 2 || arcs.some((n) => !Number.isSafeInteger(n) || n < 0)) throw new Error("Invalid object identifier.");
  const bytes = [...base128(arcs[0] * 40 + arcs[1])];
  for (const arc of arcs.slice(2)) bytes.push(...base128(arc));
  return tlv(0x06, Uint8Array.from(bytes));
}
function nullDer(): Uint8Array { return Uint8Array.of(0x05, 0x00); }
function utf8(value: string): Uint8Array { return tlv(0x0c, encoder.encode(value)); }
function certificateTime(date: Date): Uint8Array {
  const two = (n: number) => String(n).padStart(2, "0");
  const year = date.getUTCFullYear();
  const value = year >= 2050
    ? `${String(year).padStart(4, "0")}${two(date.getUTCMonth()+1)}${two(date.getUTCDate())}${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}Z`
    : `${two(year % 100)}${two(date.getUTCMonth()+1)}${two(date.getUTCDate())}${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}Z`;
  return tlv(year >= 2050 ? 0x18 : 0x17, encoder.encode(value));
}
function subjectPublicKeyBytes(spki: Uint8Array): Uint8Array {
  const read = (offset: number) => {
    const tag = spki[offset];
    let length = spki[offset + 1];
    let header = 2;
    if (length & 0x80) {
      const count = length & 0x7f;
      length = 0;
      for (let i = 0; i < count; i++) length = length * 256 + spki[offset + 2 + i];
      header += count;
    }
    return { tag, content: offset + header, end: offset + header + length };
  };
  const outer = read(0);
  if (outer.tag !== 0x30) throw new Error("Unable to inspect the generated public key.");
  const algorithm = read(outer.content);
  const publicBits = read(algorithm.end);
  if (publicBits.tag !== 0x03 || spki[publicBits.content] !== 0) throw new Error("Unable to inspect the generated public key.");
  return spki.slice(publicBits.content + 1, publicBits.end);
}
function algId(algorithm: string): Uint8Array { return sequence(oid(algorithm), nullDer()); }
function name(fields: Array<[string, string]>): Uint8Array {
  const mapping: Record<string, string> = { CN: "2.5.4.3", OU: "2.5.4.11", O: "2.5.4.10", L: "2.5.4.7", ST: "2.5.4.8", C: "2.5.4.6" };
  return sequence(...fields.filter(([, value]) => value).map(([key, value]) => setOf(sequence(oid(mapping[key]), key === "C" ? tlv(0x13, encoder.encode(value)) : utf8(value)))));
}
async function digest(algorithm: "SHA-1" | "SHA-256", data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest(algorithm, data));
}
function pem(label: string, bytes: Uint8Array): string {
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return `-----BEGIN ${label}-----\n${base64.match(/.{1,64}/g)?.join("\n") ?? base64}\n-----END ${label}-----\n`;
}
function toHex(bytes: Uint8Array): string { return [...bytes].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(""); }
function modifiedUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0x0001 && c <= 0x007f) bytes.push(c);
    else if (c <= 0x07ff) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  if (bytes.length > 65535) throw new Error("The key alias is too long.");
  return concat(Uint8Array.of(bytes.length >> 8, bytes.length & 0xff), Uint8Array.from(bytes));
}
function utf16be(value: string): Uint8Array {
  const out = new Uint8Array(value.length * 2);
  for (let i = 0; i < value.length; i++) { const code = value.charCodeAt(i); out[i*2] = code >> 8; out[i*2+1] = code & 0xff; }
  return out;
}
function writeKeyEntry(alias: string, protectedKey: Uint8Array, certificate: Uint8Array): Uint8Array {
  const now = BigInt(Date.now());
  return concat(
    u32(1), modifiedUtf8(alias), u64(now), u32(protectedKey.length), protectedKey,
    u32(1), modifiedUtf8("X.509"), u32(certificate.length), certificate,
  );
}
async function protectPrivateKey(pkcs8: Uint8Array, password: string): Promise<Uint8Array> {
  const passwordBytes = utf16be(password);
  const salt = crypto.getRandomValues(new Uint8Array(20));
  let previous = salt;
  const encrypted = new Uint8Array(pkcs8.length);
  for (let offset = 0; offset < pkcs8.length; offset += 20) {
    previous = await digest("SHA-1", concat(passwordBytes, previous));
    for (let i = 0; i < Math.min(20, pkcs8.length - offset); i++) encrypted[offset+i] = pkcs8[offset+i] ^ previous[i];
  }
  const checksum = await digest("SHA-1", concat(passwordBytes, pkcs8));
  const encryptedKey = concat(salt, encrypted, checksum);
  const params = sequence(octet(salt), integer(1n));
  const info = sequence(sequence(oid("1.3.6.1.4.1.42.2.17.1.1"), params), octet(encryptedKey));
  return info;
}
async function makeCertificate(privateKey: CryptoKey, publicSpki: Uint8Array, dn: Array<[string,string]>, serial: Uint8Array, validYears: number): Promise<Uint8Array> {
  const notBefore = new Date(Date.now() - 5 * 60_000);
  const notAfter = new Date(notBefore); notAfter.setUTCFullYear(notAfter.getUTCFullYear() + validYears);
  const keyUsage = sequence(oid("2.5.29.15"), tlv(0x01, Uint8Array.of(0xff)), octet(bitString(Uint8Array.of(0xa0), 5)));
  const basicConstraints = sequence(oid("2.5.29.19"), tlv(0x01, Uint8Array.of(0xff)), octet(sequence()));
  const extendedKeyUsage = sequence(oid("2.5.29.37"), octet(sequence(oid("1.3.6.1.5.5.7.3.3"))));
  const subjectKeyId = sequence(oid("2.5.29.14"), octet(octet(await digest("SHA-1", subjectPublicKeyBytes(publicSpki)))));
  const extensions = tlv(0xa3, sequence(keyUsage, basicConstraints, extendedKeyUsage, subjectKeyId));
  const tbs = sequence(
    tlv(0xa0, integer(2n)), integerBytes(serial), algId("1.2.840.113549.1.1.11"), name(dn),
    sequence(certificateTime(notBefore), certificateTime(notAfter)), name(dn), publicSpki, extensions,
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, tbs));
  return sequence(tbs, algId("1.2.840.113549.1.1.11"), bitString(signature));
}
export type GoogleSigningKeyInput = {
  alias: string; storePassword: string; keyPassword: string; commonName: string;
  organization?: string; organizationalUnit?: string; city?: string; state?: string; country: string;
  keySize: 2048 | 3072 | 4096; validityYears: number;
};
export type GoogleSigningKeyArtifacts = {
  keystore: Uint8Array; certificatePem: string; certificateDer: Uint8Array;
  sha1: string; sha256: string; alias: string; validFrom: string; validUntil: string;
  gradleGroovy: string; gradleKotlin: string;
};
export async function generateGoogleSigningKey(input: GoogleSigningKeyInput): Promise<GoogleSigningKeyArtifacts> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure cryptography is not available. Open enV in a supported HTTPS browser or the native app.");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(input.alias)) throw new Error("Alias must be 1–64 characters using letters, numbers, dots, underscores, or hyphens.");
  const validPassword = (value: string) => value.length >= 12 && value.length <= 128 && /^[\x20-\x7E]+$/.test(value);
  if (!validPassword(input.storePassword)) throw new Error("Use a keystore password of 12–128 printable ASCII characters.");
  if (!validPassword(input.keyPassword)) throw new Error("Use a key password of 12–128 printable ASCII characters.");
  if (!input.commonName.trim() || input.commonName.length > 128) throw new Error("Enter a certificate owner name up to 128 characters.");
  if (!/^[A-Z]{2}$/.test(input.country)) throw new Error("Country must be a two-letter uppercase ISO country code.");
  if (![2048, 3072, 4096].includes(input.keySize)) throw new Error("Choose an RSA key size of 2048, 3072, or 4096 bits.");
  if (!Number.isInteger(input.validityYears) || input.validityYears < 1 || input.validityYears > 30) throw new Error("Validity must be from 1 to 30 years.");
  const keyPair = await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5", modulusLength:input.keySize, publicExponent:new Uint8Array([1,0,1]), hash:"SHA-256"}, true, ["sign","verify"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  const serial = crypto.getRandomValues(new Uint8Array(16)); serial[0] &= 0x7f; if (serial.every((b)=>b===0)) serial[15] = 1;
  const dn: Array<[string,string]> = [["CN",input.commonName.trim()], ["OU",input.organizationalUnit?.trim() ?? ""], ["O",input.organization?.trim() ?? ""], ["L",input.city?.trim() ?? ""], ["ST",input.state?.trim() ?? ""], ["C",input.country]];
  const certificateDer = await makeCertificate(keyPair.privateKey, spki, dn, serial, input.validityYears);
  // JKS protects private-key entries with the key password; the store password protects its integrity.
  const protectedKey = await protectPrivateKey(pkcs8, input.keyPassword);
  pkcs8.fill(0);
  const body = concat(u32(0xfeedfeed), u32(2), u32(1), writeKeyEntry(input.alias, protectedKey, certificateDer));
  const integrity = await digest("SHA-1", concat(utf16be(input.storePassword), encoder.encode("Mighty Aphrodite"), body));
  const keystore = concat(body, integrity);
  const sha1 = toHex(await digest("SHA-1", certificateDer)).match(/.{2}/g)?.join(":") ?? "";
  const sha256 = toHex(await digest("SHA-256", certificateDer)).match(/.{2}/g)?.join(":") ?? "";
  const from = new Date(Date.now() - 5 * 60_000);
  const until = new Date(from); until.setUTCFullYear(until.getUTCFullYear() + input.validityYears);
  const gradleGroovy = `android {\n    signingConfigs {\n        release {\n            storeFile file("upload-keystore.jks")\n            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")\n            keyAlias "${input.alias}"\n            keyPassword System.getenv("ANDROID_KEY_PASSWORD")\n        }\n    }\n    buildTypes {\n        release { signingConfig signingConfigs.release }\n    }\n}`;
  const gradleKotlin = `android {\n    signingConfigs {\n        create("release") {\n            storeFile = file("upload-keystore.jks")\n            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")\n            keyAlias = "${input.alias}"\n            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")\n        }\n    }\n    buildTypes {\n        getByName("release") { signingConfig = signingConfigs.getByName("release") }\n    }\n}`;
  return {keystore, certificatePem:pem("CERTIFICATE",certificateDer), certificateDer, sha1, sha256, alias:input.alias, validFrom:from.toISOString(), validUntil:until.toISOString(), gradleGroovy, gradleKotlin};
}
