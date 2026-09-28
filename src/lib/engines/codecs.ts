import { md5 } from "../md5.ts";

export type HashAlgo = "SHA-1" | "SHA-256" | "SHA-512";

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
    .replace(/"/gi, '"')
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
  const cleaned = input.replace(/\s+/g, "");
  try {
    const binary = atob(cleaned);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    throw new Error("Invalid Base64");
  }
}

function safeBtoa(input: string): string {
  const bytes = utf8(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < max; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
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
        return decodeURIComponent(input.replace(/\+/g, "%20"));
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
    case "sha512":
      return hashHex("SHA-512", input);
    case "multi-hash": {
      const [sha1, sha256, sha512] = await Promise.all([
        hashHex("SHA-1", input),
        hashHex("SHA-256", input),
        hashHex("SHA-512", input),
      ]);
      return [
        `MD5\t${md5(input)}`,
        `SHA-1\t${sha1}`,
        `SHA-256\t${sha256}`,
        `SHA-512\t${sha512}`,
      ].join("\n");
    }
    case "hash-compare": {
      const a = (opts?.a ?? input).trim();
      const b = (opts?.b ?? "").trim();
      const match = timingSafeEqual(a.toLowerCase(), b.toLowerCase());
      return match ? "match" : "different";
    }
    case "base-convert":
      return baseConvert(input, opts);
    default:
      throw new Error(`Unknown codec: ${op}`);
  }
}
