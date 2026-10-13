import { md5 } from "../md5.ts";

export type HashAlgo = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < arr.length; i += 1) {
    out += arr[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("Web Crypto is not available");
  return c;
}

export async function hashHex(algo: HashAlgo, text: string): Promise<string> {
  const digest = await getCrypto().subtle.digest(algo, utf8(text).buffer as ArrayBuffer);
  return bytesToHex(digest);
}

function htmlEncode(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlDecode(input: string): string {
  return input
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;|'/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, "&");
}

function unicodeDump(input: string): string {
  const bytes = utf8(input);
  const hexBytes = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const points = [...input].map((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return `U+${cp.toString(16).toUpperCase().padStart(4, "0")} ${ch}`;
  });
  return [`UTF-8: ${hexBytes || "(empty)"}`, ...points].join("\n");
}

function asciiDump(input: string): string {
  return [...input]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return `${ch}\t${code}`;
    })
    .join("\n");
}

function toBinary(input: string): string {
  return [...utf8(input)].map((b) => b.toString(2).padStart(8, "0")).join(" ");
}

function toHex(input: string): string {
  return bytesToHex(utf8(input));
}

function safeAtob(input: string): string {
  // Accept canonical padded or unpadded RFC 4648 Base64, but never quietly
  // discard bad characters or replace undecodable UTF-8 bytes with U+FFFD.
  const cleaned = input.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 === 1) {
    throw new Error("Invalid Base64: check the alphabet, padding, and length.");
  }
  const body = cleaned.replace(/=+$/, "");
  const padding = cleaned.length - body.length;
  const expectedPadding = (4 - (body.length % 4)) % 4;
  if (padding > 0 && (cleaned.length % 4 !== 0 || padding !== expectedPadding)) {
    throw new Error("Invalid Base64: padding is not canonical.");
  }
  let binary: string;
  try {
    binary = atob(body + "=".repeat(expectedPadding));
  } catch {
    throw new Error("Invalid Base64: alphabet or encoded length is invalid.");
  }
  // Keep syntax/canonicalization errors distinct from successfully decoded bytes
  // that simply are not UTF-8 text. This makes malformed-input feedback actionable.
  if (btoa(binary).replace(/=+$/, "") !== body) {
    throw new Error("Invalid Base64: non-canonical trailing bits.");
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Decoded Base64 bytes are not valid UTF-8 text.");
  }
}

function safeBtoa(input: string): string {
  const bytes = utf8(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function digestsEqualForDisplay(a: string, b: string): boolean {
  // Hash comparison is a display utility, not a cryptographic authentication
  // primitive. Normalize case only for same-length, even-sized hexadecimal
  // digest strings; Base64 and arbitrary text must remain case-sensitive.
  const isHexDigest = (value: string) => /^(?:[0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{48}|[0-9a-f]{64}|[0-9a-f]{96}|[0-9a-f]{128})$/i.test(value);
  return isHexDigest(a) && isHexDigest(b) ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function baseConvert(input: string, opts?: Record<string, string>): string {
  const fromBase = Number(opts?.fromBase ?? 10);
  const toBase = Number(opts?.toBase ?? 16);
  const raw = (opts?.value ?? input).trim();
  if (!raw) throw new Error("Missing value");
  if (!Number.isInteger(fromBase) || fromBase < 2 || fromBase > 36) {
    throw new Error("fromBase must be 2–36");
  }
  if (!Number.isInteger(toBase) || toBase < 2 || toBase > 36) {
    throw new Error("toBase must be 2–36");
  }
  const negative = raw.startsWith("-");
  const body = /^[+-]/.test(raw) ? raw.slice(1) : raw;
  if (!body) throw new Error("Invalid number");
  let value = 0n;
  for (const character of body.toLowerCase()) {
    const digit = Number.parseInt(character, 36);
    if (!Number.isInteger(digit) || digit >= fromBase) throw new Error("Invalid number");
    value = value * BigInt(fromBase) + BigInt(digit);
  }
  const converted = value.toString(toBase);
  return `${negative && value !== 0n ? "-" : ""}${converted}`;
}

export async function runCodec(
  op: string,
  input: string,
  opts?: Record<string, string>,
): Promise<string> {
  switch (op) {
    case "base64-encode":
      return safeBtoa(input);
    case "base64-decode":
      return safeAtob(input);
    case "url-encode":
      return encodeURIComponent(input);
    case "url-decode":
      try {
        return decodeURIComponent(input);
      } catch {
        throw new Error("Invalid URL encoding");
      }
    case "html-encode":
      return htmlEncode(input);
    case "html-decode":
      return htmlDecode(input);
    case "unicode":
      return unicodeDump(input);
    case "ascii":
      return asciiDump(input);
    case "binary":
      return toBinary(input);
    case "hex":
      return toHex(input);
    case "md5":
      return md5(input);
    case "sha1":
      return hashHex("SHA-1", input);
    case "sha256":
      return hashHex("SHA-256", input);
    case "sha384":
      return hashHex("SHA-384", input);
    case "sha512":
      return hashHex("SHA-512", input);
    case "multi-hash": {
      const [sha1, sha256, sha384, sha512] = await Promise.all([
        hashHex("SHA-1", input),
        hashHex("SHA-256", input),
        hashHex("SHA-384", input),
        hashHex("SHA-512", input),
      ]);
      return [
        `MD5\t${md5(input)}`,
        `SHA-1\t${sha1}`,
        `SHA-256\t${sha256}`,
        `SHA-384\t${sha384}`,
        `SHA-512\t${sha512}`,
      ].join("\n");
    }
    case "hash-compare": {
      const a = (opts?.a ?? input).trim();
      const b = (opts?.b ?? "").trim();
      const match = digestsEqualForDisplay(a, b);
      return match ? "match" : "different";
    }
    case "base-convert":
      return baseConvert(input, opts);
    default:
      throw new Error(`Unknown codec: ${op}`);
  }
}
