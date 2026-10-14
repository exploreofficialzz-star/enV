import { formatWithGrammar } from "./precise-formatters.ts";
/**
 * enV Developer Studios — deterministic, client-side implementations shared by Web tool pages.
 * Scope is deliberately explicit: this module never performs network requests or executes user code.
 */

const HTTP_STATUS: Record<number, string> = {
  100: "Continue", 101: "Switching Protocols", 102: "Processing", 103: "Early Hints", 104: "Upload Resumption Supported (temporary registration)",
  200: "OK", 201: "Created", 202: "Accepted", 203: "Non-Authoritative Information", 204: "No Content", 205: "Reset Content", 206: "Partial Content", 207: "Multi-Status", 208: "Already Reported", 226: "IM Used",
  300: "Multiple Choices", 301: "Moved Permanently", 302: "Found", 303: "See Other", 304: "Not Modified", 305: "Use Proxy (deprecated)", 306: "(Unused)", 307: "Temporary Redirect", 308: "Permanent Redirect",
  400: "Bad Request", 401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 406: "Not Acceptable", 407: "Proxy Authentication Required", 408: "Request Timeout", 409: "Conflict", 410: "Gone", 411: "Length Required", 412: "Precondition Failed", 413: "Content Too Large", 414: "URI Too Long", 415: "Unsupported Media Type", 416: "Range Not Satisfiable", 417: "Expectation Failed", 418: "I'm a teapot", 421: "Misdirected Request", 422: "Unprocessable Content", 423: "Locked", 424: "Failed Dependency", 425: "Too Early", 426: "Upgrade Required", 428: "Precondition Required", 429: "Too Many Requests", 431: "Request Header Fields Too Large", 451: "Unavailable For Legal Reasons",
  500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout", 505: "HTTP Version Not Supported", 506: "Variant Also Negotiates", 507: "Insufficient Storage", 508: "Loop Detected", 510: "Not Extended", 511: "Network Authentication Required",
};

const HTTP_STATUS_DETAILS: Record<number, { meaning: string; action: string; retry?: string }> = {
  100: { meaning: "The server has received the request headers; the client may send the request body.", action: "Continue sending the request body." },
  101: { meaning: "The server is switching protocols as requested by the client.", action: "Continue using the negotiated protocol only if the upgrade was expected." },
  103: { meaning: "Early Hints can let a browser begin loading likely-needed resources before the final response.", action: "Treat as an interim response; await the final status." },
  104: { meaning: "Upload Resumption Supported is currently a temporary IANA registration, not a status clients should assume every server implements; its registration is listed to expire on 2026-11-13 unless renewed or updated.", action: "Use only when the specific resumable-upload protocol and server document this behavior; check current IANA/draft status before relying on it." },
  200: { meaning: "The request succeeded. The response body depends on the method and endpoint.", action: "Validate the response schema and application-level result." },
  201: { meaning: "A new resource was created as a result of the request.", action: "Check the response body and Location header when provided." },
  202: { meaning: "The request was accepted for processing, but processing may not be complete.", action: "Use the API's job/status endpoint or callback contract to check completion." },
  204: { meaning: "The request succeeded and the response intentionally has no content.", action: "Do not require a JSON response body." },
  206: { meaning: "The server is returning a partial representation, typically for a Range request.", action: "Check Content-Range and ensure the client reassembles ranges correctly." },
  301: { meaning: "The resource has a permanent redirect. Some clients may change POST to GET for historical compatibility.", action: "Update stored links when appropriate; use 308 when preserving the method is required." },
  302: { meaning: "The resource is temporarily redirected. Some clients may change POST to GET for historical compatibility.", action: "Follow according to client policy; use 307 when method/body preservation is required." },
  304: { meaning: "The cached representation is still valid after a conditional request.", action: "Reuse the cached representation; a 304 response has no content body." },
  305: { meaning: "Use Proxy is deprecated and retained for historical/reference purposes; modern clients should not treat it as a routine redirect instruction.", action: "Avoid relying on 305; follow current security policy and use documented proxy configuration." },
  306: { meaning: "Unused. The code is not available for ordinary server semantics in the current registry.", action: "Do not assign private semantics to 306 on public HTTP endpoints; use a documented extension code if needed." },
  307: { meaning: "The redirect is temporary and the request method must not be changed.", action: "Follow the redirect while preserving the method and body." },
  308: { meaning: "The redirect is permanent and the request method must not be changed.", action: "Update the target URL when appropriate and preserve method/body on redirect." },
  400: { meaning: "The server cannot or will not process the request because it appears malformed or invalid.", action: "Inspect request syntax, required fields, encoding, and parameter names." },
  401: { meaning: "The request lacks valid authentication credentials. It is not the same as authorization failure.", action: "Check the credential and the WWW-Authenticate challenge; avoid blindly retrying expired credentials." },
  403: { meaning: "The server understood the request but refuses to fulfill it; re-authentication may not help.", action: "Check permissions, policy, resource ownership, and server access rules." },
  404: { meaning: "No current representation was found, or the server is unwilling to disclose that one exists.", action: "Check the URL, resource identifier, deployment/base path, and whether the resource is intentionally hidden." },
  405: { meaning: "The resource does not support the request method.", action: "Check the Allow header and the API's supported methods." },
  408: { meaning: "The server did not receive a complete request within its wait limit.", action: "Check network latency, client upload behavior, and server/proxy timeouts before retrying." },
  409: { meaning: "The request conflicts with the current state of the target resource.", action: "Reload current state and resolve the conflict; use idempotency/version controls where supported." },
  410: { meaning: "The resource is no longer available and that condition is likely permanent.", action: "Remove stale references or use a replacement resource if documented." },
  412: { meaning: "A request precondition evaluated to false, commonly an If-Match/ETag check.", action: "Refresh the representation and send the correct precondition." },
  413: { meaning: "The request content exceeds a limit the server is willing to process.", action: "Reduce payload size or use the documented chunked/resumable upload flow." },
  415: { meaning: "The request representation format is not supported for this resource or method.", action: "Check Content-Type and the endpoint's accepted media types." },
  416: { meaning: "A requested byte range cannot be satisfied.", action: "Check the resource size and Content-Range behavior; retry without Range if appropriate." },
  418: { meaning: "I'm a teapot is the historical RFC 2324 joke meaning. The current IANA HTTP Status Code Registry marks 418 as unused for general HTTP semantics, so this label is historical/application-specific rather than a currently registered general-purpose status meaning.", action: "Recognize the familiar teapot label, but inspect the particular server/API documentation; do not assume standard retry or protocol semantics." },
  422: { meaning: "The server understood the content type and syntax but could not process the contained instructions.", action: "Read field-level validation details and correct semantic errors before retrying." },
  425: { meaning: "The server is unwilling to risk processing a request that might be replayed.", action: "Use a safer connection/retry flow as defined by the protocol and endpoint." },
  429: { meaning: "The client has sent too many requests in a given time interval.", action: "Apply backoff and honor Retry-After or the API's rate-limit reset headers.", retry: "Retry guidance: do not loop immediately; use exponential backoff with jitter and obey Retry-After." },
  431: { meaning: "The request headers are too large for the server to process.", action: "Reduce cookie/header size and check proxy/server header limits." },
  451: { meaning: "Access is denied for legal reasons in the server's context.", action: "Review the response body and applicable legal/policy notice; do not treat this as a transient network error." },
  500: { meaning: "The server encountered an unexpected condition.", action: "Use a request/correlation ID to investigate logs; retry only when the operation is safe or idempotent." },
  502: { meaning: "A gateway or proxy received an invalid response from an upstream server.", action: "Check upstream health, proxy routing, DNS, TLS, and intermediary logs." },
  503: { meaning: "The server is temporarily unable to handle the request, often because of maintenance or overload.", action: "Check service health and Retry-After; use bounded backoff for safe/idempotent operations.", retry: "Retry guidance: honor Retry-After when present; otherwise use bounded exponential backoff with jitter." },
  504: { meaning: "A gateway/proxy did not receive a timely upstream response.", action: "Check upstream latency and intermediary timeout budgets before retrying." },
};

function httpStatusClass(code: number): string {
  return code < 200 ? "Informational (1xx)" : code < 300 ? "Success (2xx)" : code < 400 ? "Redirection (3xx)" : code < 500 ? "Client error (4xx)" : "Server error (5xx)";
}
function httpStatusLookup(raw: string): string {
  const codeText = raw.trim();
  if (!codeText) return Object.entries(HTTP_STATUS).sort(([a], [b]) => Number(a) - Number(b)).map(([code, name]) => `${code} ${name}${Number(code) === 418 ? " (IANA registry: unused; teapot meaning is historical)" : ""} — ${httpStatusClass(Number(code))}`).join("\n");
  if (!/^\d{3}$/.test(codeText)) throw new Error("Enter a three-digit HTTP status code from 100 through 599, such as 418 or 503.");
  const code = Number(codeText);
  if (code < 100 || code > 599) throw new Error("HTTP status codes must be from 100 through 599.");
  const name = HTTP_STATUS[code] ?? "Unassigned / extension status code";
  const detail = HTTP_STATUS_DETAILS[code];
  return `${code} ${name}\nCategory: ${code < 200 ? "Informational" : code < 300 ? "Success" : code < 400 ? "Redirection" : code < 500 ? "Client error" : "Server error"}\nMeaning: ${detail?.meaning ?? `${name}. This numeric code is not in the built-in registered-status table; semantics may be unassigned, reserved, or defined by a private extension.`}\nTypical next step: ${detail?.action ?? "Check the response body and the API/server documentation; do not assume an unassigned code has standard behavior."}${detail?.retry ? `\n${detail.retry}` : ""}\n\nLocal lookup only: no network request was sent. Status codes describe HTTP behavior; endpoint-specific response bodies and headers may add essential detail.`;
}

const MIME_TYPES: Record<string, string> = {
  json: "application/json", map: "application/json", js: "text/javascript", mjs: "text/javascript", cjs: "text/javascript", ts: "text/typescript", tsx: "text/tsx", jsx: "text/jsx", css: "text/css", scss: "text/x-scss", html: "text/html", htm: "text/html", csv: "text/csv", tsv: "text/tab-separated-values", xml: "application/xml", yaml: "application/yaml", yml: "application/yaml", toml: "application/toml", pdf: "application/pdf", wasm: "application/wasm", zip: "application/zip", gz: "application/gzip", tar: "application/x-tar", txt: "text/plain", md: "text/markdown", mdx: "text/mdx", sql: "application/sql", graphql: "application/graphql", gql: "application/graphql", proto: "text/plain", ini: "text/plain", conf: "text/plain", env: "text/plain", sh: "text/x-shellscript", py: "text/x-python", go: "text/x-go", rs: "text/x-rust", java: "text/x-java", kt: "text/x-kotlin", swift: "text/x-swift", c: "text/x-c", h: "text/x-c", cpp: "text/x-c++", hpp: "text/x-c++", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
};

function jsonErrorPosition(input: string, position: number): { line: number; column: number } {
  const safe = Math.max(0, Math.min(position, input.length));
  const before = input.slice(0, safe);
  const lines = before.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

class JsonDiagnostic extends Error {
  position: number;
  path: string;
  constructor(message: string, position: number, path: string) {
    super(message);
    this.position = position;
    this.path = path;
  }
}

/** Strict JSON syntax scan which reports the nearest structural path as well as line/column. */
export function validateJsonDetailed(input: string, options: { duplicateKeyPaths?: string[] } = {}): string {
  let i = 0;
  // Capture duplicate keys before JSON.parse collapses them to the last value.
  const duplicateKeyPaths = options.duplicateKeyPaths ?? [];
  const fail = (message: string, path: string): never => { throw new JsonDiagnostic(message, i, path); };
  const ws = () => { while (i < input.length && /\s/.test(input[i])) i += 1; };
  const string = (path: string): string => {
    const start = i;
    if (input[i] !== '"') fail("Expected a JSON string", path);
    i += 1;
    while (i < input.length) {
      const code = input.charCodeAt(i);
      if (input[i] === '"') { i += 1; try { return JSON.parse(input.slice(start, i)) as string; } catch { return fail("Invalid string escape", path); } }
      if (code < 0x20) fail("Unescaped control character in string", path);
      if (input[i] === "\\") {
        i += 1;
        if (i >= input.length) fail("Unterminated escape sequence", path);
        if (input[i] === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(input.slice(i + 1, i + 5))) fail("Unicode escape must contain four hexadecimal digits", path);
          i += 5; continue;
        }
        if (!/["\\/bfnrt]/.test(input[i])) fail("Invalid string escape", path);
      }
      i += 1;
    }
    return fail("Unterminated JSON string", path);
  };
  const value = (path: string): void => {
    ws();
    const ch = input[i];
    if (ch === '"') { string(path); return; }
    if (ch === "{") {
      i += 1; ws(); if (input[i] === "}") { i += 1; return; }
      const keys = new Set<string>();
      while (i < input.length) {
        ws(); if (input[i] !== '"') fail("Expected an object key in double quotes", path);
        const key = string(path); const child = `${path}.${key}`; if (keys.has(key)) duplicateKeyPaths.push(child); keys.add(key);
        ws(); if (input[i] !== ":") fail("Expected ':' after object key", child); i += 1;
        value(child); ws();
        if (input[i] === "}") { i += 1; return; }
        if (input[i] !== ",") fail("Expected ',' or '}' after object property", path); i += 1; ws();
        if (input[i] === "}") fail("Trailing comma is not valid JSON", path);
      }
      fail("Unterminated object", path);
    }
    if (ch === "[") {
      i += 1; ws(); if (input[i] === "]") { i += 1; return; }
      let index = 0;
      while (i < input.length) {
        value(`${path}[${index}]`); index += 1; ws();
        if (input[i] === "]") { i += 1; return; }
        if (input[i] !== ",") fail("Expected ',' or ']' after array element", path); i += 1; ws();
        if (input[i] === "]") fail("Trailing comma is not valid JSON", `${path}[${index}]`);
      }
      fail("Unterminated array", path);
    }
    for (const literal of ["true", "false", "null"]) if (input.startsWith(literal, i)) { i += literal.length; return; }
    const number = input.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) { i += number[0].length; return; }
    fail(i >= input.length ? "Expected a JSON value" : `Unexpected token ${JSON.stringify(ch)}`, path);
  };
  try {
    ws(); if (i >= input.length) throw new JsonDiagnostic("Input is empty", 0, "$" );
    value("$"); ws(); if (i !== input.length) throw new JsonDiagnostic("Unexpected content after the JSON value", i, "$");
    JSON.parse(input); // final source of truth after detailed diagnostic scanning
    const uniqueDuplicates = [...new Set(duplicateKeyPaths)];
    const duplicateNote = uniqueDuplicates.length
      ? ` Duplicate object keys detected at ${uniqueDuplicates.slice(0, 20).join(", ")}${uniqueDuplicates.length > 20 ? ", …" : ""}; JSON.parse retains only the last value for each duplicate key.`
      : "";
    return `Valid JSON (RFC 8259).${duplicateNote} Large integers may exceed JavaScript's exact integer range.`;
  } catch (error) {
    const diagnostic = error instanceof JsonDiagnostic ? error : null;
    const posMatch = error instanceof Error ? error.message.match(/position\s+(\d+)/i) : null;
    const pos = diagnostic?.position ?? (posMatch ? Number(posMatch[1]) : i);
    const { line, column } = jsonErrorPosition(input, pos);
    const path = diagnostic?.path ?? "$ (nearest location; parser message did not identify an exact member)";
    const message = diagnostic?.message ?? (error instanceof Error ? error.message.replace(/^JSON\.parse:\s*/i, "") : "Invalid JSON");
    throw new Error(`Invalid JSON at line ${line}, column ${column}, path ${path}: ${message}`);
  }
}

function decodeBase64Utf8(value: string, urlSafe = false): string {
  const compact = value.replace(/\s+/g, "");
  const source = urlSafe ? compact.replace(/-/g, "+").replace(/_/g, "/") : compact;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(source) || source.length % 4 === 1 || (/=/.test(source) && source.length % 4 !== 0)) throw new Error("Invalid Base64 input: check the alphabet, padding, and length.");
  const padded = source.replace(/=+$/, "") + "=".repeat((4 - source.replace(/=+$/, "").length % 4) % 4);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))); }
  catch { throw new Error("Base64 decoded, but the bytes are not valid UTF-8 text. Use a binary-aware output instead."); }
}
function encodeBase64Utf8(value: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(value); let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  const encoded = btoa(binary); return urlSafe ? encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : encoded;
}
function encodeUnicode(input: string): string {
  return Array.from(input, (character) => {
    const cp = character.codePointAt(0) ?? 0;
    if (cp <= 0xffff) return `\\u${cp.toString(16).padStart(4, "0")}`;
    const n = cp - 0x10000;
    return `\\u${(0xd800 + (n >> 10)).toString(16)}\\u${(0xdc00 + (n & 0x3ff)).toString(16)}`;
  }).join("");
}
function decodeUnicode(input: string): string {
  const pieces = input.replace(/\\u([0-9a-f]{4})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  return pieces.replace(/\\x([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}
function encodeHex(input: string): string { return [...new TextEncoder().encode(input)].map((byte) => byte.toString(16).padStart(2, "0")).join(" "); }
function decodeHex(input: string): string {
  const compact = input.trim().replace(/0x/gi, "").replace(/[\s,:-]+/g, "");
  if (!compact || !/^(?:[0-9a-f]{2})+$/i.test(compact)) throw new Error("Hex input must contain an even number of hexadecimal digits.");
  const bytes = new Uint8Array(compact.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("Hex bytes are not valid UTF-8 text."); }
}
function encodeBinary(input: string): string { return [...new TextEncoder().encode(input)].map((byte) => byte.toString(2).padStart(8, "0")).join(" "); }
function decodeBinary(input: string): string {
  const tokens = input.trim().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length || tokens.some((token) => !/^[01]{1,8}$/.test(token))) throw new Error("Binary input must be groups of 1–8 bits separated by spaces or commas.");
  const bytes = new Uint8Array(tokens.map((token) => parseInt(token, 2)));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("Binary bytes are not valid UTF-8 text."); }
}
function encodeAscii(input: string): string {
  if ([...input].some((c) => (c.codePointAt(0) ?? 0) > 0x7f)) throw new Error("ASCII only supports code points U+0000–U+007F. Use UTF-8 bytes via Hex or Binary for other characters.");
  return [...input].map((c) => (c.codePointAt(0) ?? 0).toString(10)).join(" ");
}
function decodeAscii(input: string): string {
  const tokens = input.trim().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length || tokens.some((t) => !/^\d{1,3}$/.test(t) || Number(t) > 127)) throw new Error("ASCII codes must be decimal integers from 0 to 127 separated by spaces or commas.");
  return tokens.map((t) => String.fromCharCode(Number(t))).join("");
}
function htmlEncode(input: string): string { return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
function htmlDecode(input: string): string { return input.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, "&").replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16))); }

class JsonNumberToken { readonly raw: string; constructor(raw: string) { this.raw = raw; } }
interface JsonTokenObject { [key: string]: JsonTokenValue }
type JsonTokenValue = null | boolean | string | JsonNumberToken | JsonTokenValue[] | JsonTokenObject;

/** Parse JSON structurally while retaining number tokens verbatim instead of round-tripping them
 * through IEEE-754. Duplicate keys intentionally use last-value lookup semantics but are also
 * surfaced as diagnostics by the caller, matching JSON.parse's common behavior. */
function parseJsonTokenAware(input: string): JsonTokenValue {
  let i = 0;
  const ws = () => { while (i < input.length && /\s/.test(input[i])) i += 1; };
  const parseString = (): string => {
    const start = i;
    if (input[i] !== '"') throw new Error(`Expected string at character ${i + 1}.`);
    i += 1;
    while (i < input.length) {
      if (input[i] === "\\") { i += 2; continue; }
      if (input[i++] === '"') return JSON.parse(input.slice(start, i)) as string;
    }
    throw new Error("Unterminated JSON string.");
  };
  const parseValue = (): JsonTokenValue => {
    ws(); const ch = input[i];
    if (ch === '"') return parseString();
    if (ch === "{") {
      i += 1; ws(); const out: Record<string, JsonTokenValue> = Object.create(null) as Record<string, JsonTokenValue>;
      if (input[i] === "}") { i += 1; return out; }
      while (i < input.length) {
        ws(); const key = parseString(); ws(); if (input[i++] !== ":") throw new Error(`Expected ':' after JSON key at character ${i}.`);
        Object.defineProperty(out, key, { value: parseValue(), enumerable: true, configurable: true, writable: true });
        ws(); if (input[i] === "}") { i += 1; return out; }
        if (input[i++] !== ",") throw new Error(`Expected ',' or '}' at character ${i}.`);
      }
      throw new Error("Unterminated JSON object.");
    }
    if (ch === "[") {
      i += 1; ws(); const out: JsonTokenValue[] = [];
      if (input[i] === "]") { i += 1; return out; }
      while (i < input.length) {
        out.push(parseValue()); ws(); if (input[i] === "]") { i += 1; return out; }
        if (input[i++] !== ",") throw new Error(`Expected ',' or ']' at character ${i}.`);
      }
      throw new Error("Unterminated JSON array.");
    }
    for (const [literal, value] of [["true", true], ["false", false], ["null", null]] as const) {
      if (input.startsWith(literal, i)) { i += literal.length; return value; }
    }
    const number = input.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) { i += number[0].length; return new JsonNumberToken(number[0]); }
    throw new Error(`Unexpected JSON value at character ${i + 1}.`);
  };
  ws(); const value = parseValue(); ws();
  if (i !== input.length) throw new Error(`Unexpected trailing JSON content at character ${i + 1}.`);
  return value;
}

function stringifyJsonTokenAware(value: JsonTokenValue, pretty = true, depth = 0): string {
  const pad = (level: number) => pretty ? "  ".repeat(level) : "";
  const join = (items: string[]) => pretty ? `,\n${pad(depth + 1)}` : ",";
  if (value instanceof JsonNumberToken) return value.raw;
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[${pretty ? `\n${pad(depth + 1)}` : ""}${value.map((item) => stringifyJsonTokenAware(item, pretty, depth + 1)).join(join(value as string[]))}${pretty ? `\n${pad(depth)}` : ""}]`;
  }
  const keys = Object.keys(value);
  if (!keys.length) return "{}";
  return `{${pretty ? `\n${pad(depth + 1)}` : ""}${keys.map((key) => `${JSON.stringify(key)}:${pretty ? " " : ""}${stringifyJsonTokenAware(value[key], pretty, depth + 1)}`).join(join(keys))}${pretty ? `\n${pad(depth)}` : ""}}`;
}

function jsonPathQuery(input: string, path: string): string {
  const duplicateKeyPaths: string[] = [];
  validateJsonDetailed(input, { duplicateKeyPaths });
  const root = parseJsonTokenAware(input); const normalized = path.trim();
  if (!normalized || normalized === "$" || normalized === ".") {
    const formatted = stringifyJsonTokenAware(root);
    const warnings = jsonFormatterWarnings(input, duplicateKeyPaths);
    return [formatted, ...warnings].join("\n\n");
  }
  let tokens: (string | number | "*")[] = [];
  if (normalized.startsWith("/")) {
    // RFC 6901 JSON Pointer: ~1 is '/', ~0 is '~'; any other tilde escape is invalid.
    tokens = normalized.slice(1).split("/").map((segment) => {
      if (/~(?![01])/.test(segment)) throw new Error(`Invalid JSON Pointer escape in segment '${segment}'. Use ~0 for '~' and ~1 for '/'.`);
      return segment.replace(/~1/g, "/").replace(/~0/g, "~");
    });
  } else {
    if (!normalized.startsWith("$") && !normalized.startsWith(".")) throw new Error("Use JSONPath-like syntax ($.user.name, $.items[0].id) or an RFC 6901 JSON Pointer (/user/name). JSON Pointer escapes '/' as ~1 and '~' as ~0.");
    const body = normalized.replace(/^\$\.?/, "").replace(/^\./, "");
    const expression = /\.?([^.[\]]+)|\[(\d+|\*|'[^']+'|\"[^\"]+\")\]/g;
    let match: RegExpExecArray | null; let consumed = "";
    while ((match = expression.exec(body))) {
      consumed += match[0]; const bracket = match[2];
      if (bracket === undefined) tokens.push(match[1]);
      else if (bracket === "*") tokens.push("*");
      else if (/^\d+$/.test(bracket)) tokens.push(Number(bracket));
      else tokens.push(bracket.slice(1, -1));
    }
    if (!tokens.length || body.replace(expression, "").replace(/[.]/g, "").length) throw new Error("Unsupported JSON path. Use $.user.name, $.items[0].id, or $['display-name']; alternatively use RFC 6901 /user/name.");
  }
  let values: JsonTokenValue[] = [root];
  for (const token of tokens) values = values.flatMap((value) => {
    if (token === "*") return Array.isArray(value) ? value : value && typeof value === "object" && !(value instanceof JsonNumberToken) ? Object.values(value) : [];
    if (Array.isArray(value) && typeof token === "number") return token < value.length ? [value[token]] : [];
    if (value && typeof value === "object" && !(value instanceof JsonNumberToken) && !Array.isArray(value) && typeof token === "string" && Object.prototype.hasOwnProperty.call(value, token)) return [value[token]];
    // In RFC 6901, array indices are decimal text and leading zeroes (except '0') are invalid.
    if (Array.isArray(value) && typeof token === "string" && /^(?:0|[1-9]\d*)$/.test(token)) { const index = Number(token); return index < value.length ? [value[index]] : []; }
    if (Array.isArray(value) && typeof token === "string" && token === "-") return [];
    return [];
  });
  if (!values.length) throw new Error(`JSON path or pointer '${path}' did not match any value.`);
  const selected: JsonTokenValue = values.length === 1 ? values[0] : values;
  const formatted = stringifyJsonTokenAware(selected);
  const warnings = jsonFormatterWarnings(formatted, duplicateKeyPaths);
  return [formatted, ...warnings].join("\n\n");
}

/**
 * Format strict JSON without materializing numeric tokens as IEEE-754 Numbers.
 * This preserves unsafe integer digits, exponent spelling, and duplicate object keys.
 */
function formatJsonSource(input: string, minify = false): string {
  let output = "";
  const stack: { kind: "object" | "array"; hasItems: boolean }[] = [];
  const indent = (depth: number) => "  ".repeat(Math.max(0, depth));
  const nextNonWhitespace = (from: number) => {
    let index = from;
    while (index < input.length && /\s/.test(input[index])) index += 1;
    return input[index];
  };
  const markParent = () => { const parent = stack.at(-1); if (parent) parent.hasItems = true; };
  for (let i = 0; i < input.length;) {
    const ch = input[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '"') {
      markParent(); const start = i++;
      while (i < input.length) { if (input[i] === "\\") { i += 2; continue; } if (input[i++] === '"') break; }
      output += input.slice(start, i); continue;
    }
    if (ch === "{" || ch === "[") {
      markParent(); output += ch;
      const kind = ch === "{" ? "object" : "array";
      stack.push({ kind, hasItems: false });
      if (!minify && nextNonWhitespace(i + 1) !== (ch === "{" ? "}" : "]")) output += "\n" + indent(stack.length);
      i += 1; continue;
    }
    if (ch === "}" || ch === "]") {
      const current = stack.pop();
      if (!current || (current.kind === "object" ? ch !== "}" : ch !== "]")) throw new Error("JSON formatter encountered an unbalanced container after validation.");
      if (!minify && current.hasItems) output = output.trimEnd() + "\n" + indent(stack.length);
      output += ch; i += 1; continue;
    }
    if (ch === ",") { output = output.trimEnd() + ","; if (!minify) output += "\n" + indent(stack.length); i += 1; continue; }
    if (ch === ":") { output = output.trimEnd() + (minify ? ":" : ": "); i += 1; continue; }
    const token = input.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|^(?:true|false|null)\b/);
    if (token) { markParent(); output += token[0]; i += token[0].length; continue; }
    throw new Error(`Unexpected JSON formatter token at character ${i + 1}; validate the input and try again.`);
  }
  return output.trim();
}

function jsonFormatterWarnings(input: string, duplicateKeyPaths: string[]): string[] {
  const unsafe = scanUnsafeJsonIntegers(input);
  const warnings: string[] = [];
  if (unsafe.length) {
    const examples = unsafe.slice(0, 5).map((item) => `${item.token} (line ${item.line}, column ${item.column})`).join(", ");
    warnings.push(`WARNING: JavaScript Number cannot safely represent this integer; value may be rounded. The formatter preserved the raw numeric token text. Detected: ${examples}${unsafe.length > 5 ? ", …" : ""}`);
  }
  const duplicates = [...new Set(duplicateKeyPaths)];
  if (duplicates.length) warnings.push(`NOTE: Duplicate object keys detected at ${duplicates.slice(0, 20).join(", ")}${duplicates.length > 20 ? ", …" : ""}. Duplicate-key JSON is ambiguous; many parsers including JSON.parse keep only the last value. The formatter preserves the source keys.`);
  return warnings;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortJson(child)]));
  return value;
}
function jsonDiff(left: string, right: string): string {
  const a = JSON.stringify(JSON.parse(left), null, 2).split("\n"); const b = JSON.stringify(JSON.parse(right), null, 2).split("\n");
  const n = Math.max(a.length, b.length); const out: string[] = [];
  for (let i = 0; i < n; i += 1) { if (a[i] === b[i]) out.push(`  ${a[i] ?? ""}`); else { if (a[i] !== undefined) out.push(`- ${a[i]}`); if (b[i] !== undefined) out.push(`+ ${b[i]}`); } }
  return out.join("\n");
}

function base64UrlToUtf8(value: string): string { return decodeBase64Utf8(value, true); }
function jwtDecode(token: string): string {
  const parts = token.trim().split("."); if (parts.length !== 3) throw new Error("A JWT compact token must have three dot-separated parts.");
  const headerText = base64UrlToUtf8(parts[0]); const payloadText = base64UrlToUtf8(parts[1]);
  let header: unknown; let payload: Record<string, unknown>;
  try { header = JSON.parse(headerText); payload = JSON.parse(payloadText) as Record<string, unknown>; } catch { throw new Error("JWT header or payload is not valid JSON."); }
  if (!header || typeof header !== "object" || !payload || Array.isArray(payload) || typeof payload !== "object") throw new Error("JWT header and payload must be JSON objects.");
  const now = Math.floor(Date.now() / 1000);
  const timestamp = (key: string) => {
    const claim = payload[key];
    if (typeof claim !== "number" || !Number.isFinite(claim)) return undefined;
    // Malformed hostile tokens can contain numerically valid but out-of-Date-range timestamps.
    // Never let toISOString() throw a generic RangeError that hides the rest of the decode report.
    const date = new Date(claim * 1000);
    const iso = Number.isFinite(date.getTime()) ? date.toISOString() : null;
    const status = iso === null ? "out-of-range" : key === "exp" ? (now >= claim ? "expired" : "valid") : key === "nbf" ? (now < claim ? "not-yet-valid" : "active") : key === "iat" && claim > now ? "issued-in-the-future" : "informational";
    return { unixSeconds: claim, iso, status };
  };
  const largeIntegerTokens = scanUnsafeJsonIntegers(payloadText);
  const headerLargeIntegers = scanUnsafeJsonIntegers(headerText);
  return JSON.stringify({
    warning: "DECODE ONLY — signature not verified. Do not treat this display as proof of authenticity.",
    header, payload,
    // Preserve exact source JSON so a viewer never has to rely on rounded JS numbers.
    headerRawJson: headerText,
    payloadRawJson: payloadText,
    rawNumericPrecision: {
      headerUnsafeIntegerTokens: headerLargeIntegers,
      payloadUnsafeIntegerTokens: largeIntegerTokens,
    },
    claims: { exp: timestamp("exp"), iat: timestamp("iat"), nbf: timestamp("nbf"), sub: payload.sub ?? null, iss: payload.iss ?? null, aud: payload.aud ?? null },
    signaturePresent: parts[2].length > 0, signatureVerified: false,
    largeIntegerPrecisionWarning: (largeIntegerTokens.length || headerLargeIntegers.length) ? "Header or payload contains unsafe integer tokens. The parsed claims display may be rounded; headerRawJson/payloadRawJson preserve exact source digits." : null,
  }, null, 2);
}

const CRON_MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const CRON_DAYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
type CronField = { values: Set<number>; any: boolean; wildcard: boolean; normalized: string };
function parseCronField(raw: string, min: number, max: number, names: Record<string, number> = {}, dow = false): CronField {
  const values = new Set<number>(); const any = raw === "*";
  // Vixie-style cron tracks a leading wildcard separately from whether the whole field is exactly "*".
  // Keep `any` for human wording (*/2 is not every day) and `wildcard` for day-field matching.
  const wildcard = raw.startsWith("*");
  for (const segment of raw.toLowerCase().split(",")) {
    if (!segment) throw new Error("Empty comma-separated value in cron field.");
    const [rangePart, stepText] = segment.split("/"); if (segment.split("/").length > 2) throw new Error("Cron field contains more than one '/'.");
    const step = stepText === undefined ? 1 : Number(stepText); if (!Number.isInteger(step) || step < 1) throw new Error("Cron step must be a positive integer.");
    let start: number; let end: number;
    if (rangePart === "*") { start = min; end = max; }
    else if (rangePart.includes("-")) {
      const pair = rangePart.split("-"); if (pair.length !== 2) throw new Error("Invalid range in cron field.");
      const convert = (part: string) => names[part] ?? Number(part);
      start = convert(pair[0]); end = convert(pair[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || start > max || end < min || end > max || start > end) throw new Error(`Cron range '${rangePart}' must be from ${min} through ${max}.`);
    } else {
      start = names[rangePart] ?? Number(rangePart);
      if (!Number.isInteger(start) || start < min || start > max) throw new Error(`Cron value '${rangePart}' must be from ${min} through ${max}.`);
      end = stepText === undefined ? start : max;
    }
    for (let n = start; n <= end; n += step) values.add(dow && n === 7 ? 0 : n);
  }
  if (!values.size) throw new Error("Cron field does not select any values.");
  return { values, any, wildcard, normalized: [...values].sort((a,b) => a-b).join(",") };
}
export function parseCron(expression: string): { normalized: string; fields: { minute: CronField; hour: CronField; dayOfMonth: CronField; month: CronField; dayOfWeek: CronField } } {
  const parts = expression.trim().split(/\s+/); if (parts.length !== 5) throw new Error(`Expected exactly five cron fields (minute hour day-of-month month day-of-week); received ${parts.length}.`);
  const fields = { minute: parseCronField(parts[0],0,59), hour: parseCronField(parts[1],0,23), dayOfMonth: parseCronField(parts[2],1,31), month: parseCronField(parts[3],1,12,CRON_MONTHS), dayOfWeek: parseCronField(parts[4],0,7,CRON_DAYS,true) };
  return { normalized: parts.join(" "), fields };
}
function matchesCronDate(date: Date, f: ReturnType<typeof parseCron>["fields"]): boolean {
  if (!f.minute.values.has(date.getMinutes()) || !f.hour.values.has(date.getHours()) || !f.month.values.has(date.getMonth()+1)) return false;
  const domMatch = f.dayOfMonth.values.has(date.getDate()); const dowMatch = f.dayOfWeek.values.has(date.getDay());
  // Common Vixie-style cron uses OR when both day fields are restricted; a leading `*` (including */step)
  // marks that field as wildcard-driven. Cron dialects vary here, so the report calls out the assumption.
  const dayMatch = f.dayOfMonth.wildcard ? dowMatch : f.dayOfWeek.wildcard ? domMatch : domMatch || dowMatch;
  return dayMatch;
}
export function cronNextRuns(expression: string, count = 10, from = new Date()): { normalized: string; explanation: string; runs: { local: string; utc: string }[] } {
  const parsed = parseCron(expression); const fields = parsed.fields;
  const names = (vals: Set<number>, map?: string[]) => [...vals].sort((a,b)=>a-b).map((n)=>map?.[n-1] ?? String(n)).join(", ");
  // Month values are 1-based but cron weekdays are 0-based (Sunday=0). Do not use the month mapper for weekdays.
  const weekdays = [...fields.dayOfWeek.values].sort((a,b)=>a-b).map((day) => ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][day] ?? String(day)).join(", ");
  const explanation = `Minute: ${fields.minute.any ? "every minute" : names(fields.minute.values)}; hour: ${fields.hour.any ? "every hour" : names(fields.hour.values)}; day of month: ${fields.dayOfMonth.any ? "every day" : names(fields.dayOfMonth.values)}; month: ${fields.month.any ? "every month" : names(fields.month.values, ["January","February","March","April","May","June","July","August","September","October","November","December"])}; day of week: ${fields.dayOfWeek.any ? "every day of week" : weekdays}. Times are evaluated in the device's local time zone. Day-of-month/day-of-week matching follows Vixie-style wildcard semantics (a leading * including */step counts as wildcard); verify this edge case against your target scheduler.`;
  const cursor = new Date(from.getTime()); cursor.setSeconds(0, 0); cursor.setMinutes(cursor.getMinutes() + 1);
  const runs: { local: string; utc: string }[] = []; const limit = cursor.getTime() + 366 * 24 * 60 * 60 * 1000;
  while (cursor.getTime() <= limit && runs.length < Math.max(1, Math.min(10, count))) {
    if (matchesCronDate(cursor, fields)) runs.push({ local: `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-${String(cursor.getDate()).padStart(2,"0")} ${String(cursor.getHours()).padStart(2,"0")}:${String(cursor.getMinutes()).padStart(2,"0")} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`, utc: cursor.toISOString() });
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  if (runs.length === 0) throw new Error("No runs found in the next 366 days for this expression.");
  return { normalized: parsed.normalized, explanation, runs };
}

function parseQuery(input: string): string {
  const raw = input.trim().replace(/^\?/, ""); const params = new URLSearchParams(raw);
  const entries = [...params.entries()].map(([key, value]) => ({ key, value }));
  return JSON.stringify({ count: entries.length, entries, grouped: Object.fromEntries([...new Set(entries.map(e => e.key))].map(key => [key, entries.filter(e => e.key === key).map(e => e.value)])) }, null, 2);
}
function buildQuery(input: string): string {
  let entries: [string, string][] = [];
  try {
    const parsed: unknown = JSON.parse(input);
    if (Array.isArray(parsed)) entries = parsed.map((v) => { if (Array.isArray(v)) return [String(v[0] ?? ""), String(v[1] ?? "")]; if (v && typeof v === "object") return [String((v as any).key ?? ""), String((v as any).value ?? "")]; throw new Error("Use arrays of [key, value] pairs or {key, value} objects."); });
    else if (parsed && typeof parsed === "object") entries = Object.entries(parsed as Record<string, unknown>).flatMap(([k, v]) => Array.isArray(v) ? v.map(x => [k, String(x)] as [string,string]) : [[k, String(v ?? "")]]);
    else throw new Error("JSON must be an object or array.");
  } catch (e) {
    if (e instanceof SyntaxError) entries = input.split(/\r?\n/).map(line => line.split(/=(.*)/s, 2)).filter(pair => pair.length === 2).map(([k,v]) => [k.trim(), v.trim()]);
    else throw e;
  }
  if (!entries.length) throw new Error("Enter a JSON object, array of key/value pairs, or one key=value pair per line.");
  return new URLSearchParams(entries).toString();
}
function cookieParse(input: string): string {
  const pairs = input.split(";").map(part => part.trim()).filter(Boolean).map((part) => { const idx = part.indexOf("="); if (idx < 0) return { name: part, value: "", hasValue: false }; return { name: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim(), hasValue: true }; });
  return JSON.stringify({ count: pairs.length, cookies: pairs }, null, 2);
}
function headerBuilder(input: string): string {
  let values: Record<string, unknown>;
  try { const parsed: unknown = JSON.parse(input); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); values = parsed as Record<string, unknown>; }
  catch { values = Object.fromEntries(input.split(/\r?\n/).map(line => { const idx = line.indexOf(":"); return idx < 0 ? ["", ""] : [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]; }).filter(([key]) => key)); }
  const headers: string[] = [];
  for (const [key, raw] of Object.entries(values)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)) throw new Error(`Invalid HTTP header name: ${key}`);
    const value = String(raw ?? ""); if (/[\r\n]/.test(value)) throw new Error(`Header '${key}' contains a line break, which is not allowed.`);
    headers.push(`${key}: ${value}`);
  }
  if (!headers.length) throw new Error("Enter headers as JSON or one Header-Name: value per line.");
  return headers.join("\n");
}

function toFilenamePart(raw: string): string { return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "my-app"; }
function generateGitignore(stack: string): string {
  const common = "# OS/editor\n.DS_Store\nThumbs.db\n.vscode/\n.idea/\n*.swp\n\n# Secrets and local environment\n.env\n.env.*\n!.env.example\n*.pem\n*.key\n\n# Logs\n*.log\nlogs/\n";
  const maps: Record<string,string> = {
    node: "\n# Node.js\nnode_modules/\ndist/\nbuild/\ncoverage/\n.npm/\n", typescript: "\n# TypeScript\nnode_modules/\ndist/\nbuild/\ncoverage/\n*.tsbuildinfo\n", react: "\n# React tooling\nnode_modules/\ndist/\nbuild/\ncoverage/\n.vite/\n", python: "\n# Python\n__pycache__/\n*.py[cod]\n.venv/\nvenv/\n.pytest_cache/\n.mypy_cache/\n.ruff_cache/\n", django: "\n# Django/Python\n__pycache__/\n*.py[cod]\n.venv/\nvenv/\nstaticfiles/\nmedia/\n*.sqlite3\n", java: "\n# Java/Gradle\n*.class\nbuild/\n.gradle/\nout/\n", kotlin: "\n# Kotlin/Gradle\n.gradle/\nbuild/\n*.class\nlocal.properties\n", android: "\n# Android Studio/Gradle\n.gradle/\nbuild/\nlocal.properties\n*.iml\n.cxx/\n.externalNativeBuild/\n", swift: "\n# Swift/Xcode\n.build/\nDerivedData/\n*.xcuserstate\nxcuserdata/\n", go: "\n# Go\n/bin/\n/vendor/\n*.test\n", rust: "\n# Rust\ntarget/\nCargo.lock\n", docker: "\n# Docker local overrides\ndocker-compose.override.yml\n", terraform: "\n# Terraform\n.terraform/\n*.tfstate\n*.tfstate.*\ncrash.log\n*.tfvars\n!example.tfvars\n", php: "\n# PHP/Composer\n/vendor/\n/node_modules/\n.phpunit.cache/\n", ruby: "\n# Ruby\n.bundle/\n/vendor/bundle/\n/log/\n/tmp/\n", generic: "\n# Build artifacts\ndist/\nbuild/\ncoverage/\n" };
  const key = stack.toLowerCase().trim(); const selected = maps[key] ?? maps.node;
  return `${common}${selected}\n# enV note: review the rules against your repository before committing.\n`;
}
function generateDockerfile(stack: string, appName: string): string {
  const key = stack.toLowerCase().trim();
  if (["python", "flask", "django", "fastapi"].includes(key)) return `# Minimal Python container; pin dependencies in requirements.txt.\nFROM python:3.12-slim\nENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1\nWORKDIR /app\nCOPY requirements.txt ./\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8000\n# Replace main:app with your ASGI module if needed.\nCMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]\n`;
  if (["static", "nginx", "html"].includes(key)) return `FROM nginx:1.27-alpine\nCOPY ./dist/ /usr/share/nginx/html/\nEXPOSE 80\nHEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1\n`;
  if (["go", "golang"].includes(key)) return `# Multi-stage Go build. Adjust the module path if needed.\nFROM golang:1.23-alpine AS build\nWORKDIR /src\nCOPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nRUN CGO_ENABLED=0 go build -o /app/${toFilenamePart(appName)} ./...\nFROM alpine:3.20\nRUN adduser -D -H appuser\nWORKDIR /app\nCOPY --from=build /app/${toFilenamePart(appName)} ./app\nUSER appuser\nEXPOSE 8080\nENTRYPOINT ["./app"]\n`;
  return `# Node.js production image. Pin the base image and lockfile in CI.\nFROM node:22-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM node:22-alpine AS runtime\nENV NODE_ENV=production\nWORKDIR /app\nCOPY --from=build /app/package*.json ./\nRUN npm ci --omit=dev && npm cache clean --force\nCOPY --from=build /app/dist ./dist\nUSER node\nEXPOSE 3000\n# Update this command to match the app's actual production server.\nCMD ["node", "dist/server.js"]\n`;
}
function generateOpenApi(title: string): string {
  const safeTitle = title.trim() || "Example API";
  return `openapi: 3.1.0\ninfo:\n  title: ${JSON.stringify(safeTitle)}\n  version: 1.0.0\n  description: Example contract; replace paths and schemas before publishing.\nservers:\n  - url: https://api.example.com\npaths:\n  /health:\n    get:\n      operationId: getHealth\n      summary: Health check\n      responses:\n        '200':\n          description: Service is healthy\n          content:\n            application/json:\n              schema:\n                type: object\n                required: [status]\n                properties:\n                  status:\n                    type: string\n                    const: ok\n`;
}
function generateReadme(name: string): string {
  const title = name.trim() || "Project Name";
  return `# ${title}\n\nA short description of what this project does and who it is for.\n\n## Features\n- Describe the main capability\n- Document local-first/privacy behavior where applicable\n\n## Requirements\n- List supported runtime and tool versions\n\n## Getting started\n\n\`\`\`sh\n# Install dependencies using the project's lockfile\nnpm ci\n# Start locally (replace with the real command)\nnpm run dev\n\`\`\`\n\n## Configuration\nCopy \`.env.example\` to your local environment file and provide required values. Never commit credentials.\n\n## Tests\n\`\`\`sh\nnpm test\n\`\`\`\n\n## Security\nReport vulnerabilities privately to the project maintainer. Do not publish secrets, access tokens, or personal data in issues.\n\n## License\nAdd the license that applies to this repository.\n`;
}
function generateCompose(): string {
  return `services:\n  app:\n    build:\n      context: .\n      dockerfile: Dockerfile\n    restart: unless-stopped\n    ports:\n      - "3000:3000"\n    environment:\n      NODE_ENV: production\n    # Add required environment variables through your deployment secret store.\n    # Do not hard-code credentials in this file.\n    healthcheck:\n      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]\n      interval: 30s\n      timeout: 5s\n      retries: 3\n`;
}
function generateEditorConfig(): string {
  return `root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\ntrim_trailing_whitespace = true\n\n[*.{js,jsx,ts,tsx,json,jsonc,css,scss,html,yml,yaml,md}]\nindent_style = space\nindent_size = 2\n\n[*.{kt,kts,java,swift,py,go,rs}]\nindent_style = space\nindent_size = 4\n\n[Makefile]\nindent_style = tab\n`;
}
function generateEnvExample(input: string): string {
  const keys = input.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase()).filter((s) => /^[A-Z_][A-Z0-9_]*$/.test(s));
  const distinct = [...new Set(keys)];
  if (!distinct.length) distinct.push("APP_ENV", "API_BASE_URL", "LOG_LEVEL");
  return `# Example only; never put real credentials in this committed file.\n${distinct.map((key) => `${key}=`).join("\n")}\n`;
}
function generateLicense(owner: string): string {
  const year = new Date().getFullYear(); const who = owner.trim() || "[Copyright holder]";
  return `MIT License\n\nCopyright (c) ${year} ${who}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n\nReview the license choice and placeholder before using this file in a repository.\n`;
}
function parseGeneratorObject(input: string, label: string): Record<string, unknown> | null {
  if (!input.trim().startsWith("{")) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { throw new Error(`${label} configuration must be valid JSON.`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} configuration must be a JSON object.`);
  return parsed as Record<string, unknown>;
}
function safeConfigStringList(value: unknown, field: string, defaults: string[]): string[] {
  if (value === undefined) return defaults;
  const items = typeof value === "string" ? [value] : value;
  if (!Array.isArray(items) || items.some((item) => typeof item !== "string" || !item.trim() || /[\r\n,;]/.test(item))) throw new Error(`${field} must be a string or a list of non-empty strings without commas, semicolons, or line breaks.`);
  return [...new Set((items as string[]).map((item) => item.trim()))];
}
function generateCsp(input = ""): string {
  const config = parseGeneratorObject(input, "CSP");
  if (!config) return `Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests\n\nReview required sources for scripts, styles, fonts, images, API calls and embedding before deployment. A strict policy can break application features if not tailored.\n`;
  const entries = Object.entries(config);
  if (!entries.length) throw new Error("Provide at least one CSP directive.");
  const directives = new Set<string>(); const weakSources: string[] = [];
  const rendered = entries.map(([rawName, rawValues]) => {
    const name = rawName.toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(name) || directives.has(name)) throw new Error(`Invalid or duplicate CSP directive: ${rawName}`);
    directives.add(name);
    const values = rawValues === undefined || rawValues === null ? [] : safeConfigStringList(rawValues, `CSP directive ${name}`, []);
    if (values.some((value) => /[;\r\n]/.test(value))) throw new Error(`CSP directive ${name} contains a forbidden separator.`);
    for (const value of values) if (value === "*" || value.toLowerCase() === "'unsafe-inline'" || value.toLowerCase() === "'unsafe-eval'" || /^http:\/*$/i.test(value)) weakSources.push(`${name} ${value}`);
    return values.length ? `${name} ${values.join(" ")}` : name;
  });
  if (!directives.has("default-src")) rendered.unshift("default-src 'self'");
  if (!directives.has("object-src")) rendered.push("object-src 'none'");
  if (!directives.has("base-uri")) rendered.push("base-uri 'self'");
  return `Content-Security-Policy: ${rendered.join("; ")}\n\n${weakSources.length ? `Review broad/unsafe source expressions before deployment: ${[...new Set(weakSources)].join(", ")}.` : "Review required script/style/font/image/connect/frame sources in a staging environment before enforcing this policy."} This generator does not inspect your application or guarantee a complete CSP.\n`;
}
function generateCors(input = ""): string {
  const config = parseGeneratorObject(input, "CORS");
  if (!config) return `Access-Control-Allow-Origin: https://app.example.com\nVary: Origin\nAccess-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS\nAccess-Control-Allow-Headers: Content-Type, Authorization\nAccess-Control-Max-Age: 600\n\nReplace the example origin with an explicit allow-list. Avoid '*' for credentialed requests. Handle OPTIONS preflight responses in the server.\n`;
  const origins = safeConfigStringList(config.origins, "origins", ["https://app.example.com"]);
  if (!origins.length) throw new Error(`origins must contain at least one explicitly allowed origin; use ["*"] only for public non-credentialed resources.`);
  const methods = safeConfigStringList(config.methods, "methods", ["GET", "POST", "OPTIONS"]).map((method) => method.toUpperCase());
  if (!methods.length) throw new Error("methods must contain at least one allowed HTTP method.");
  const headers = safeConfigStringList(config.headers, "headers", ["Content-Type", "Authorization"]);
  const expose = safeConfigStringList(config.exposeHeaders, "exposeHeaders", []);
  const headerToken = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
  if ([...headers, ...expose].some((header) => !headerToken.test(header))) throw new Error("headers and exposeHeaders must contain valid HTTP field-name tokens.");
  const credentials = config.credentials === undefined ? false : config.credentials;
  if (typeof credentials !== "boolean") throw new Error("credentials must be true or false.");
  const maxAge = config.maxAge === undefined ? 600 : Number(config.maxAge);
  if (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 86400) throw new Error("maxAge must be an integer from 0 through 86400 seconds.");
  for (const origin of origins) {
    if (origin === "*") continue;
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error(`Invalid CORS origin: ${origin}. Use an explicit http(s) origin, without a path.`); }
    if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== origin.replace(/\/$/, "")) throw new Error(`CORS origin '${origin}' must be only an http(s) scheme and authority, without path, query, credentials, or fragment.`);
  }
  if (credentials && origins.includes("*")) throw new Error("CORS forbids Access-Control-Allow-Origin: * for credentialed requests. Use a strict explicit origin allow-list.");
  if (methods.some((method) => !/^[A-Z!#$%&'*+.^_`|~0-9-]+$/.test(method))) throw new Error("methods contains an invalid HTTP method token.");
  const shared = `Access-Control-Allow-Methods: ${methods.join(", ")}\nAccess-Control-Allow-Headers: ${headers.join(", ")}\n${expose.length ? `Access-Control-Expose-Headers: ${expose.join(", ")}\n` : ""}${credentials ? "Access-Control-Allow-Credentials: true\n" : ""}Access-Control-Max-Age: ${maxAge}\n`;
  if (origins.length === 1) return `Access-Control-Allow-Origin: ${origins[0]}\nVary: Origin\n${shared}\n${origins[0] === "*" ? "Public, non-credentialed CORS. Do not use cookies or credentialed requests with wildcard origin." : "Validate the request Origin on the server and answer OPTIONS preflight requests."} No request was sent by this local generator.\n`;
  return `# CORS middleware configuration — reflect an origin only after exact allow-list matching; never comma-join origins into Access-Control-Allow-Origin.\nallowedOrigins = ${JSON.stringify(origins)}\n\nif request.origin is in allowedOrigins:\n    response.setHeader("Access-Control-Allow-Origin", request.origin)\n    response.setHeader("Vary", "Origin")\n${shared.split("\n").filter(Boolean).map((line) => `    response.setHeader(${JSON.stringify(line.split(": ")[0])}, ${JSON.stringify(line.slice(line.indexOf(": ") + 2))})`).join("\n")}\n\nReject unlisted origins and handle OPTIONS preflight. This is explanatory pseudocode, not directly executable middleware. No request was sent.\n`;
}
function generateNginx(): string {
  return `server {\n    listen 80;\n    server_name example.com; # replace before deployment\n    root /usr/share/nginx/html;\n    index index.html;\n\n    location / {\n        try_files $uri $uri/ /index.html;\n    }\n\n    location = /health {\n        access_log off;\n        add_header Content-Type text/plain;\n        return 200 "ok\\n";\n    }\n\n    # Configure TLS, security headers, caching and upload limits for your deployment.\n}\n`;
}
/** Infer a conservative schema from samples without assuming every array item matches item zero.
 * Fields observed in every object sample become required; heterogeneous values become unions.
 */
function generateJsonSchema(input: string): string {
  const value: unknown = JSON.parse(input);
  const typeOf = (v: unknown): string => v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v;
  const uniqueTypes = (values: unknown[]): string[] => [...new Set(values.map(typeOf))].sort((a, b) => a === "null" ? -1 : b === "null" ? 1 : a.localeCompare(b));
  const inferSamples = (samples: unknown[]): Record<string, unknown> => {
    if (!samples.length) return {};
    const types = uniqueTypes(samples);
    const schemaTypes = types.includes("number") && types.includes("integer") ? types.filter((t) => t !== "integer") : types;
    const result: Record<string, unknown> = { type: schemaTypes.length === 1 ? schemaTypes[0] : schemaTypes };
    const objects = samples.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v) && v !== null);
    if (types.includes("object") && objects.length) {
      const keys = [...new Set(objects.flatMap((o) => Object.keys(o)))].sort();
      const properties: Record<string, unknown> = {};
      for (const key of keys) properties[key] = inferSamples(objects.filter((o) => Object.prototype.hasOwnProperty.call(o, key)).map((o) => o[key]));
      const required = keys.filter((key) => objects.every((o) => Object.prototype.hasOwnProperty.call(o, key)));
      result.properties = properties;
      if (required.length) result.required = required;
      // Samples cannot prove that unobserved fields are invalid, so keep this permissive.
      result.additionalProperties = true;
    }
    const arrays = samples.filter(Array.isArray) as unknown[][];
    if (types.includes("array") && arrays.length) result.items = inferSamples(arrays.flat());
    return result;
  };
  return JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", title: "Generated schema from sample data", ...inferSamples([value]) }, null, 2);
}

/** Lexically scan numbers outside JSON strings before IEEE-754 parsing can round them. */
function scanUnsafeJsonIntegers(input: string): { token: string; line: number; column: number }[] {
  const found: { token: string; line: number; column: number }[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] === '"') {
      i += 1;
      while (i < input.length) { if (input[i] === "\\") { i += 2; continue; } if (input[i++] === '"') break; }
      continue;
    }
    if (input[i] === "-" || /[0-9]/.test(input[i] ?? "")) {
      const match = input.slice(i).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
      if (match) {
        const token = match[0];
        if (!/[.eE]/.test(token) && (token.replace(/^-/, "").length > 15 || !Number.isSafeInteger(Number(token)))) found.push({ token, ...jsonErrorPosition(input, i) });
        i += token.length; continue;
      }
    }
    i += 1;
  }
  return found;
}

/** Compact, bounded structural report; it deliberately avoids rendering a giant eager DOM tree. */
export function inspectJsonDetailed(input: string, maxNodes = 100_000): string {
  if (input.length > 50 * 1024 * 1024) throw new Error("JSON input exceeds the 50 MiB safety limit. Split it or use a local streaming parser for very large datasets.");
  const duplicates: string[] = [];
  validateJsonDetailed(input, { duplicateKeyPaths: duplicates });
  const root: unknown = JSON.parse(input);
  const stats = { rootType: "unknown", characters: input.length, utf8Bytes: new TextEncoder().encode(input).byteLength, nodes: 0, maximumDepth: 0, objectCount: 0, arrayCount: 0, propertyCount: 0, arrayItems: 0, stringCount: 0, duplicateKeys: [...new Set(duplicates)].slice(0, 100), duplicateKeyOccurrenceCount: duplicates.length, unsafeIntegerTokens: scanUnsafeJsonIntegers(input).slice(0, 50), truncated: false };
  const typeOf = (v: unknown) => v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  stats.rootType = typeOf(root);
  const stack: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  while (stack.length) {
    const current = stack.pop()!; stats.nodes += 1; stats.maximumDepth = Math.max(stats.maximumDepth, current.depth);
    if (stats.nodes > maxNodes) { stats.truncated = true; break; }
    const value = current.value;
    if (typeof value === "string") stats.stringCount += 1;
    if (Array.isArray(value)) { stats.arrayCount += 1; stats.arrayItems += value.length; for (let i = value.length - 1; i >= 0; i -= 1) stack.push({ value: value[i], depth: current.depth + 1 }); }
    else if (value && typeof value === "object") { const entries = Object.entries(value as Record<string, unknown>); stats.objectCount += 1; stats.propertyCount += entries.length; for (let i = entries.length - 1; i >= 0; i -= 1) stack.push({ value: entries[i][1], depth: current.depth + 1 }); }
  }
  const warnings = [stats.duplicateKeyOccurrenceCount ? "Duplicate object keys are ambiguous and commonly overwritten by parsers." : null, stats.unsafeIntegerTokens.length ? "Raw integer tokens may be rounded by IEEE-754 JavaScript numbers; preserve them as strings or use a lossless parser when exact digits matter." : null, stats.truncated ? `Traversal capped at ${maxNodes} values to protect responsiveness.` : null].filter(Boolean);
  return JSON.stringify({ ...stats, warnings, privacy: "This deterministic inspection function performs no network request." }, null, 2);
}

/** Semantic JSON diff: report structural paths rather than confusing users with shifted line numbers. */
function sortedJsonTokens(value: JsonTokenValue): JsonTokenValue {
  if (Array.isArray(value)) return value.map(sortedJsonTokens);
  if (value && typeof value === "object" && !(value instanceof JsonNumberToken)) {
    const result: Record<string, JsonTokenValue> = Object.create(null) as Record<string, JsonTokenValue>;
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) Object.defineProperty(result, key, { value: sortedJsonTokens(value[key]), enumerable: true, configurable: true, writable: true });
    return result;
  }
  return value;
}
function describeJsonDiffValue(value: JsonTokenValue): unknown {
  if (value instanceof JsonNumberToken) {
    const unsafe = !/[.eE]/.test(value.raw) && !Number.isSafeInteger(Number(value.raw));
    return { kind: "json-number-token", raw: value.raw, unsafeInteger: unsafe, note: "Raw token is included so exact digits do not depend on JSON number precision." };
  }
  if (Array.isArray(value)) return value.map(describeJsonDiffValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, describeJsonDiffValue(item)]));
  return value;
}
/** Semantic JSON diff that avoids converting numeric tokens to IEEE-754 values. */
function structuredJsonDiff(leftRaw: string, rightRaw: string): string {
  if (leftRaw.length + rightRaw.length > 50 * 1024 * 1024) throw new Error("Combined JSON diff input exceeds the 50 MiB safety limit. Compare smaller sections for responsiveness.");
  const leftDuplicates: string[] = []; const rightDuplicates: string[] = [];
  validateJsonDetailed(leftRaw, { duplicateKeyPaths: leftDuplicates }); validateJsonDetailed(rightRaw, { duplicateKeyPaths: rightDuplicates });
  const left = parseJsonTokenAware(leftRaw); const right = parseJsonTokenAware(rightRaw);
  const leftSorted = sortedJsonTokens(left); const rightSorted = sortedJsonTokens(right);
  const changes: { path: string; type: "added" | "removed" | "changed"; before?: unknown; after?: unknown; value?: unknown }[] = [];
  const stable = (v: JsonTokenValue): string => stringifyJsonTokenAware(sortedJsonTokens(v), false);
  const walk = (a: JsonTokenValue | undefined, b: JsonTokenValue | undefined, path: string, depth: number): void => {
    if (changes.length >= 500) return;
    if (a === undefined) { changes.push({ path, type: "added", value: describeJsonDiffValue(b!) }); return; }
    if (b === undefined) { changes.push({ path, type: "removed", value: describeJsonDiffValue(a) }); return; }
    if (depth > 100) { if (stable(a) !== stable(b)) changes.push({ path, type: "changed", before: "[depth limit]", after: "[depth limit]" }); return; }
    if (stable(a) === stable(b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.max(a.length, b.length) && changes.length < 500; i += 1) walk(a[i], b[i], `${path}[${i}]`, depth + 1);
      return;
    }
    const objA = a && typeof a === "object" && !Array.isArray(a) && !(a instanceof JsonNumberToken) ? a as Record<string, JsonTokenValue> : null;
    const objB = b && typeof b === "object" && !Array.isArray(b) && !(b instanceof JsonNumberToken) ? b as Record<string, JsonTokenValue> : null;
    if (objA && objB) {
      const keys = [...new Set([...Object.keys(objA), ...Object.keys(objB)])].sort((x, y) => x.localeCompare(y));
      for (const key of keys) { if (changes.length >= 500) break; walk(Object.prototype.hasOwnProperty.call(objA, key) ? objA[key] : undefined, Object.prototype.hasOwnProperty.call(objB, key) ? objB[key] : undefined, `${path}[${JSON.stringify(key)}]`, depth + 1); }
      return;
    }
    changes.push({ path, type: "changed", before: describeJsonDiffValue(a), after: describeJsonDiffValue(b) });
  };
  walk(leftSorted, rightSorted, "$", 0);
  const unsafe = { left: scanUnsafeJsonIntegers(leftRaw), right: scanUnsafeJsonIntegers(rightRaw) };
  const duplicateWarnings = [leftDuplicates.length ? `Left input has duplicate object keys: ${[...new Set(leftDuplicates)].slice(0, 20).join(", ")}.` : "", rightDuplicates.length ? `Right input has duplicate object keys: ${[...new Set(rightDuplicates)].slice(0, 20).join(", ")}.` : ""].filter(Boolean);
  return JSON.stringify({ equal: changes.length === 0, algorithm: "lossless numeric-token structural comparison with sorted object keys", changeCount: changes.length, truncated: changes.length >= 500, changes, unsafeIntegerTokens: unsafe, warnings: [...duplicateWarnings, unsafe.left.length || unsafe.right.length ? "Unsafe integer tokens are compared as exact source tokens. Changed numeric values use kind=json-number-token and raw=exact token." : ""].filter(Boolean), note: "Object key order is ignored; arrays are compared by index, not move-aware. Duplicate object keys are inherently ambiguous; lookup semantics use the final occurrence." }, null, 2);
}
function generateDeveloperTemplate(op: string, input: string, secondary: string, now = new Date()): string | null {
  const lower = op.toLowerCase(); const subject = (input.trim() || secondary.trim());
  if (lower.includes("gitignore") && lower.includes("generator")) return generateGitignore(subject || "node");
  if (lower.includes("docker-compose") && (lower.includes("generator") || lower.includes("builder"))) return generateCompose();
  if ((lower.includes("dockerfile") && (lower.includes("helper") || lower.includes("generator"))) || (lower.includes("docker") && lower.includes("generator"))) return generateDockerfile(subject || "node", "my-app");
  if (lower.includes("editorconfig") && lower.includes("generator")) return generateEditorConfig();
  if ((lower.includes("environment-variable") || lower.includes("env-var") || lower.includes("environment-generator")) && lower.includes("generator")) return generateEnvExample(subject);
  if (lower.includes("openapi-schema-generator")) return JSON.stringify({ openapi: "3.1.0", info: { title: subject || "Example API", version: "1.0.0" }, components: { schemas: { Example: { type: "object", properties: { id: { type: "string" }, createdAt: { type: "string", format: "date-time" } }, required: ["id"], additionalProperties: false } } }, paths: {} }, null, 2);
  if (lower.includes("openapi") && lower.includes("generator")) return generateOpenApi(subject || "Example API");
  if (lower.includes("readme") && lower.includes("generator")) return generateReadme(subject);
  if (lower.includes("license") && lower.includes("generator")) return generateLicense(subject);
  if (lower.includes("nginx") && lower.includes("generator")) return generateNginx();
  if (lower.includes("cors") && (lower.includes("generator") || lower.includes("builder") || lower.includes("helper"))) return generateCors(input);
  if (lower.includes("csp") && (lower.includes("generator") || lower.includes("builder") || lower.includes("helper"))) return generateCsp(input);
  if (lower.includes("json-schema") && (lower.includes("generator") || lower.includes("builder"))) return generateJsonSchema(subject || '{"name":"Ada","active":true}');
  if (lower.includes("graphql-query-builder")) return `query GetExample($id: ID!) {\n  node(id: $id) {\n    id\n    __typename\n  }\n}\n\n# Replace node and fields with operations supported by your GraphQL schema.\n`;
  if (lower.includes("graphql-variables") && (lower.includes("builder") || lower.includes("generator") || lower.includes("formatter") || lower.includes("validator"))) { const raw = subject || '{"id":"REPLACE_WITH_ID"}'; return JSON.stringify(JSON.parse(raw), null, 2); }
  if (lower.includes("jwt-claim-builder")) { const claims = subject ? JSON.parse(subject) : { sub: "user-id", iss: "https://issuer.example.com", aud: "example-api", iat: Math.floor(now.getTime()/1000), exp: Math.floor(now.getTime()/1000)+3600 }; if (!claims || typeof claims !== "object" || Array.isArray(claims)) throw new Error("JWT claims must be a JSON object."); return JSON.stringify(claims, null, 2); }
  if (lower.includes("jwt-payload-generator")) { const payload = subject ? JSON.parse(subject) : { sub: "user-id", iat: Math.floor(now.getTime()/1000), exp: Math.floor(now.getTime()/1000)+3600 }; if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("JWT payload must be a JSON object."); const head = encodeBase64Utf8(JSON.stringify({ alg: "none", typ: "JWT" }), true); const body = encodeBase64Utf8(JSON.stringify(payload), true); return `${head}.${body}.\n\nUNSIGNED PREVIEW ONLY. No signature was created or verified. Never use this as an authentication token.`; }
  if (lower.includes("jwt-encoder") || lower.includes("jwt-generator")) return `JWT signing is not available in this page unless a dedicated cryptographic key and algorithm flow is implemented. Use the JWT claim/payload builder to prepare JSON; this tool will not pretend to sign a token.\n`;
  if (lower.includes("mock-response") && (lower.includes("generator") || lower.includes("builder"))) {
    if (subject) { const parsed = JSON.parse(subject); return JSON.stringify({ data: parsed, meta: { mock: true, generatedLocally: true }, error: null }, null, 2); }
    return JSON.stringify({ data: { id: "example-1", name: "Example record", active: true }, meta: { mock: true, generatedLocally: true }, error: null }, null, 2);
  }
  if (lower.includes("webhook") && (lower.includes("generator") || lower.includes("builder"))) {
    let data: unknown = { id: "record_123", status: "created" };
    let event = "record.created";
    if (subject) {
      try { const parsed = JSON.parse(subject); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed; else event = subject.toLowerCase().replace(/[^a-z0-9.]+/g, ".").replace(/^\.|\.$/g, "") || event; }
      catch { event = subject.toLowerCase().replace(/[^a-z0-9.]+/g, ".").replace(/^\.|\.$/g, "") || event; }
    }
    return JSON.stringify({ id: "evt_example_001", type: event, createdAt: "2026-01-01T00:00:00.000Z", data, meta: { generatedExample: true, signature: "not-provided" } }, null, 2);
  }
  if (lower.includes("branch-name") && (lower.includes("generator") || lower.includes("builder") || lower.includes("helper"))) return toFilenamePart(subject || "describe-your-change");
  if (lower.includes("commit-message") && (lower.includes("generator") || lower.includes("builder") || lower.includes("helper"))) {
    const text = subject || "describe the change"; const m = text.match(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\(([^)]+)\))?:\s*(.+)$/);
    return m ? `${m[1]}${m[2] ? `(${m[2]})` : ""}: ${m[3].trim()}` : `chore: ${text.replace(/[\r\n]+/g," ").trim()}\n\nConventional Commit types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. Review the type before committing.`;
  }
  if (lower.includes("changelog") && (lower.includes("generator") || lower.includes("builder") || lower.includes("helper"))) {
    const lines = subject.split(/\r?\n/).map(s => s.trim()).filter(Boolean); const version = lines.shift() || "Unreleased";
    return `# Changelog\n\n## ${version}\n\n${lines.length ? lines.map(s => `- ${s}`).join("\n") : "### Changed\n- Describe the user-visible change.\n\n### Fixed\n- Describe the bug fixed."}\n`;
  }
  if (lower.includes("semantic-version") && (lower.includes("generator") || lower.includes("calculator") || lower.includes("helper"))) {
    const [rawVersion = "0.1.0", change = "patch"] = subject.split(/[\s,]+/); const match = rawVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
    if (!match) throw new Error("Enter a semantic version like 1.2.3 and an increment: major, minor, or patch.");
    let major = Number(match[1]), minor = Number(match[2]), patch = Number(match[3]);
    if (change === "major") { major += 1; minor = 0; patch = 0; } else if (change === "minor") { minor += 1; patch = 0; } else if (change === "patch" || !change) patch += 1; else throw new Error("Increment must be major, minor, or patch.");
    return `${rawVersion} → ${major}.${minor}.${patch}`;
  }
  return null;
}

function formatCss(input: string): string {
  const compact = input.replace(/\s*([{}:;,])\s*/g, "$1").replace(/;}/g, "}");
  let depth = 0; let inString = ""; let escaped = false; let out = ""; let line = "";
  const emit = () => { const t = line.trim(); if (t) out += `${"  ".repeat(Math.max(0, depth))}${t}\n`; line = ""; };
  for (const ch of compact) {
    line += ch;
    if (inString) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === inString) inString = ""; continue; }
    if (ch === '"' || ch === "'") inString = ch;
    else if (ch === "{") { emit(); depth += 1; }
    else if (ch === "}") { line = line.slice(0, -1); emit(); depth = Math.max(0, depth - 1); line = "}"; emit(); }
    else if (ch === ";") emit();
  }
  emit();
  return out.trim();
}
function minifySafe(input: string, language: string): string {
  let output = ""; let quote = ""; let escaped = false; let pendingSpace = false; let i = 0;
  while (i < input.length) {
    const ch = input[i]; const next = input[i + 1] ?? "";
    if (quote) { output += ch; if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === quote) quote = ""; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { if (pendingSpace && /[\w$]/.test(output.at(-1) ?? "") && /[\w$]/.test(ch)) output += " "; pendingSpace = false; quote = ch; output += ch; i += 1; continue; }
    if (ch === "/" && next === "*") { const end = input.indexOf("*/", i + 2); if (end < 0) throw new Error("Unterminated block comment."); pendingSpace = true; i = end + 2; continue; }
    if (language !== "sql" && ch === "/" && next === "/") { const end = input.indexOf("\n", i + 2); pendingSpace = true; i = end < 0 ? input.length : end + 1; continue; }
    if (language === "html" && ch === "<" && input.startsWith("<!--", i)) { const end = input.indexOf("-->", i + 4); if (end < 0) throw new Error("Unterminated HTML comment."); pendingSpace = true; i = end + 3; continue; }
    if (/\s/.test(ch)) { pendingSpace = true; i += 1; continue; }
    if (pendingSpace && /[\w$]/.test(output.at(-1) ?? "") && /[\w$]/.test(ch)) output += " ";
    pendingSpace = false;
    if (["{", "}", ";", ",", ":"].includes(ch)) output = output.trimEnd();
    output += ch; i += 1;
  }
  if (quote) throw new Error("Unterminated string literal; input was not minified.");
  return output.trim();
}
const SQL_DIALECTS = new Set(["sql", "postgresql", "mysql", "mariadb", "sqlite", "transactsql", "bigquery", "snowflake", "oracle", "redshift", "duckdb"]);
function formatSql(input: string, dialectRaw = "sql"): string {
  const dialect = dialectRaw.trim().toLowerCase() || "sql";
  if (!SQL_DIALECTS.has(dialect)) throw new Error(`Unsupported SQL dialect '${dialectRaw}'. Choose one of: ${[...SQL_DIALECTS].join(", ")}.`);
  if (input.length > 1_000_000) throw new Error("SQL formatter input exceeds the 1 MB local formatting limit.");
  // Keywords in literals, quoted identifiers, and comments are not clauses.
  const tokens: { text: string; kind: "word" | "literal" | "comment" | "punct" }[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === "-" && input[i + 1] === "-") { const start = i; i += 2; while (i < input.length && input[i] !== "\n") i += 1; tokens.push({ text: input.slice(start, i), kind: "comment" }); continue; }
    if (ch === "/" && input[i + 1] === "*") { const start = i; const close = input.indexOf("*/", i + 2); if (close < 0) throw new Error("SQL formatter found an unterminated block comment."); i = close + 2; tokens.push({ text: input.slice(start, i), kind: "comment" }); continue; }
    // PostgreSQL-style dollar-quoted bodies must be consumed as one literal, so keywords
    // such as FROM/WHERE inside a function body are never mistaken for outer clauses.
    if ((dialect === "postgresql" || dialect === "redshift" || dialect === "duckdb") && ch === "$") {
      const tag = input.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) { const start = i; const close = input.indexOf(tag, i + tag.length); if (close < 0) throw new Error(`SQL formatter found an unterminated dollar-quoted string (${tag}).`); i = close + tag.length; tokens.push({ text: input.slice(start, i), kind: "literal" }); continue; }
    }
    if (dialect === "mysql" && ch === "#") { const start = i; while (i < input.length && input[i] !== "\n") i += 1; tokens.push({ text: input.slice(start, i), kind: "comment" }); continue; }
    if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
      const start = i; const closing = ch === "[" ? "]" : ch; i += 1;
      while (i < input.length) {
        if (input[i] === closing) { if (input[i + 1] === closing && closing !== "]") { i += 2; continue; } i += 1; break; }
        if (input[i] === "\\" && ch === "'") i += 1;
        i += 1;
      }
      tokens.push({ text: input.slice(start, i), kind: "literal" }); continue;
    }
    const word = input.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/);
    if (word) { tokens.push({ text: word[0], kind: "word" }); i += word[0].length; continue; }
    tokens.push({ text: ch, kind: "punct" }); i += 1;
  }
  if (!tokens.length) return "";
  const major = new Set(["WITH", "RECURSIVE", "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "QUALIFY", "WINDOW", "PARTITION BY", "LIMIT", "OFFSET", "FETCH FIRST", "INSERT INTO", "UPDATE", "DELETE FROM", "VALUES", "UNION", "UNION ALL", "INTERSECT", "EXCEPT", "RETURNING", "CREATE TABLE", "ALTER TABLE", "DROP TABLE", "ON CONFLICT", "DO UPDATE SET"]);
  const joins = new Set(["JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "FULL JOIN", "LEFT OUTER JOIN", "RIGHT OUTER JOIN", "FULL OUTER JOIN", "CROSS JOIN", "CROSS APPLY", "OUTER APPLY"]);
  const output: string[] = [];
  let depth = 0, line = "", previous = "";
  const trimLine = () => { line = line.trimEnd(); };
  const emit = () => { trimLine(); if (line.trim()) output.push(`${"  ".repeat(Math.max(0, depth))}${line.trimStart()}`); line = ""; };
  const append = (text: string, needsSpace = true) => { if (needsSpace && line && !/[\s(.]$/.test(line) && !/^[,;).]/.test(text)) line += " "; line += text; };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]; const upper = token.kind === "word" ? token.text.toUpperCase() : "";
    let phrase = upper, count = 1;
    if (token.kind === "word" && tokens[index + 1]?.kind === "word") {
      const two = `${upper} ${tokens[index + 1].text.toUpperCase()}`;
      if ([...major, ...joins].includes(two)) { phrase = two; count = 2; }
      else if (["LEFT OUTER JOIN", "RIGHT OUTER JOIN"].includes(`${two} ${tokens[index + 2]?.text.toUpperCase()}`) && tokens[index + 2]?.kind === "word") { phrase = `${two} ${tokens[index + 2].text.toUpperCase()}`; count = 3; }
    }
    const isMajor = token.kind === "word" && major.has(phrase);
    const isJoin = token.kind === "word" && joins.has(phrase);
    const isOn = token.kind === "word" && upper === "ON";
    const isBoolean = token.kind === "word" && (upper === "AND" || upper === "OR");
    if (isMajor || isJoin || isOn || isBoolean) {
      emit(); depth = isJoin || isOn || isBoolean ? Math.max(1, depth) : 0; line = phrase; index += count - 1; previous = phrase; continue;
    }
    if (token.text === "(") { append("(", /^(IN|VALUES|EXISTS|NOT)$/i.test(previous)); depth += 1; }
    else if (token.text === ")") { depth = Math.max(0, depth - 1); trimLine(); line += ")"; }
    else if (token.text === ",") { trimLine(); line += ","; }
    else if (token.text === ".") { trimLine(); line += "."; }
    else if (token.text === ";") { trimLine(); line += ";"; emit(); depth = 0; }
    else if (["=", "<", ">", "!", "+", "-", "*", "/", "<=", ">=", "<>", "!=", "%"].includes(token.text)) append(token.text);
    else { append(token.text, true); if (token.kind === "comment") emit(); }
    previous = token.text;
  }
  emit();
  return output.join("\n").trim();
}

/** Dependency-light token-preserving fallback used if the TypeScript parser is unavailable. */
function formatJavascriptConservative(input: string): string {
  type Token = { text: string; kind: "word" | "literal" | "comment" | "punct" | "operator" };
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === "/" && input[i + 1] === "/") { const start = i; i += 2; while (i < input.length && input[i] !== "\n") i += 1; tokens.push({ text: input.slice(start, i), kind: "comment" }); continue; }
    if (ch === "/" && input[i + 1] === "*") { const start = i; const close = input.indexOf("*/", i + 2); if (close < 0) throw new Error("JavaScript formatter found an unterminated block comment."); i = close + 2; tokens.push({ text: input.slice(start, i), kind: "comment" }); continue; }
    if (ch === "'" || ch === '"' || ch === "`") {
      const start = i++; let closed = false;
      while (i < input.length) { if (input[i] === "\\") { i += 2; continue; } if (input[i++] === ch) { closed = true; break; } }
      if (!closed) throw new Error("JavaScript formatter found an unterminated string or template literal.");
      tokens.push({ text: input.slice(start, i), kind: "literal" }); continue;
    }
    const word = input.slice(i).match(/^(?:[A-Za-z_$][\w$]*|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/);
    if (word) { tokens.push({ text: word[0], kind: "word" }); i += word[0].length; continue; }
    const op = input.slice(i).match(/^(?:===|!==|=>|\?\?|\?\.|&&|\|\||\*\*|==|!=|<=|>=|\+\+|--|\+=|-=|\*=|\/=|\.\.\.)/);
    if (op) { tokens.push({ text: op[0], kind: "operator" }); i += op[0].length; continue; }
    tokens.push({ text: ch, kind: "punct" }); i += 1;
  }
  if (!tokens.length) throw new Error("Paste JavaScript or TypeScript code to format.");
  const lines: string[] = []; let line = ""; let depth = 0; let parenDepth = 0; let lineDepth = depth;
  const indent = (atDepth = depth) => "  ".repeat(Math.max(0, atDepth));
  const trim = () => { line = line.trimEnd(); };
  const emit = () => { trim(); if (line.trim()) lines.push(indent(lineDepth) + line.trimStart()); line = ""; lineDepth = depth; };
  const append = (text: string, space = false) => { if (!line && text) lineDepth = depth; if (space && line && !/[\s.(\[]$/.test(line) && !/^[,;).\]}]/.test(text)) line += " "; line += text; };
  const prev = (index: number) => tokens[index - 1]?.text ?? "";
  const next = (index: number) => tokens[index + 1]?.text ?? "";
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]; const text = token.text; const before = prev(index); const after = next(index);
    if (token.kind === "comment") { if (line.trim()) emit(); append(text); emit(); continue; }
    if (text === "{") { append("{", Boolean(line.trim()) && !/[.(\[]$/.test(line)); depth += 1; emit(); continue; }
    if (text === "}") { if (line.trim()) emit(); depth = Math.max(0, depth - 1); append("}"); if ([";", ",", ")", "]", ".", "(", "["].includes(after)) { /* next token remains adjacent */ } else emit(); continue; }
    if (text === "(") { append("(", /^(if|for|while|switch|catch|with|function)$/.test(before)); parenDepth += 1; continue; }
    if (text === ")") { trim(); line += ")"; parenDepth = Math.max(0, parenDepth - 1); continue; }
    if (text === "[") { append("["); continue; }
    if (text === "]") { trim(); line += "]"; continue; }
    if (text === "." || text === "?.") { trim(); line += text; continue; }
    if (text === ",") { trim(); line += ","; emit(); continue; }
    if (text === ";") { trim(); line += ";"; if (parenDepth > 0) append("", true); else emit(); continue; }
    if (text === ":") { trim(); line += ":"; append("", true); continue; }
    if (token.kind === "operator" || ["=", "+", "-", "*", "/", "%", "<", ">", "!", "&", "|", "?"].includes(text)) {
      if (["++", "--", "!", "~", "..."].includes(text)) append(text); else { append(text, true); append("", true); }
      continue;
    }
    const wordLike = token.kind === "word" || token.kind === "literal";
    const previousWordLike = tokens[index - 1] && (tokens[index - 1].kind === "word" || tokens[index - 1].kind === "literal");
    const shouldSpace = Boolean(line) && (Boolean(previousWordLike) || /^(return|throw|new|await|yield|typeof|delete|void|instanceof|in|of|else|async)$/.test(before) || (before === ")" && wordLike));
    append(text, shouldSpace);
  }
  emit();
  const result = lines.join("\n").trim();
  if (!result) throw new Error("Formatter produced no output. Check that the source is not empty.");
  return `${result}\n\nFormatter: conservative lexical fallback. Strings/comments are preserved; this is not a full ECMAScript parser.`;
}

/**
 * Parser-backed JavaScript/TypeScript formatting using the project's already-installed
 * TypeScript compiler dependency. It is dynamically loaded only when a user runs the formatter,
 * rather than inflating every tool page's initial bundle. No source is sent to a service.
 */
async function formatJavascript(input: string, preferTypeScript = false): Promise<string> {
  if (!input.trim()) throw new Error("Paste JavaScript or TypeScript code to format.");
  if (input.length > 1_000_000) throw new Error("Code formatter input exceeds the 1 MB local formatting limit.");
  try {
    const ts = await import("typescript");
    const jsxLikely = /(?:^|[=(:,\[>])\s*<[A-Za-z][A-Za-z0-9_.:-]*(?:\s|>|\/)/m.test(input) || /<\/[A-Za-z][A-Za-z0-9_.:-]*\s*>/.test(input);
    const scriptKind = jsxLikely ? ts.ScriptKind.TSX : (preferTypeScript ? ts.ScriptKind.TS : ts.ScriptKind.JS);
    const fileName = jsxLikely ? "enV-input.tsx" : preferTypeScript ? "enV-input.ts" : "enV-input.js";
    const sourceFile = ts.createSourceFile(fileName, input, ts.ScriptTarget.Latest, true, scriptKind);
    const diagnostics = (sourceFile as unknown as { parseDiagnostics?: readonly import("typescript").Diagnostic[] }).parseDiagnostics ?? [];
    if (diagnostics.length) {
      const first = diagnostics[0];
      const pos = first.start ?? 0;
      const location = sourceFile.getLineAndCharacterOfPosition(pos);
      const message = ts.flattenDiagnosticMessageText(first.messageText, "\n");
      throw new Error(`Parser-backed formatter could not parse input at line ${location.line + 1}, column ${location.character + 1}: ${message}`);
    }
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false, omitTrailingSemicolon: false });
    const formatted = printer.printFile(sourceFile).trimEnd();
    if (!formatted) throw new Error("Parser returned no printable statements for this input.");
    return `${formatted}\n\nFormatter: TypeScript compiler AST printer (local parser; source is not uploaded). This is formatting, not type-checking, linting, transpilation, or semantic-equivalence proof.`;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Parser-backed formatter")) throw error;
    // Some test/embedded environments omit runtime modules even though the web app's install has
    // them. Fall back honestly rather than return an empty result; report the execution engine.
    if (error instanceof Error && error.message.includes("could not parse input")) throw error;
    return formatJavascriptConservative(input);
  }
}


function simpleMarkupInspect(input: string): string {
  const tags = [...input.matchAll(/<([A-Za-z][\w:-]*)\b[^>]*>/g)].map(m => m[1].toLowerCase());
  const headings = [...input.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m => ({ level: Number(m[1]), text: m[2].replace(/<[^>]*>/g, "").trim() }));
  const ids = [...input.matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)].map(m => m[2]);
  const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  return JSON.stringify({ characters: input.length, tagCount: tags.length, uniqueTags: [...new Set(tags)].sort(), headingCount: headings.length, headings, idCount: ids.length, duplicateIds: [...new Set(duplicateIds)], scriptTagCount: tags.filter(t => t === "script").length, note: "Structural inspection uses lightweight pattern matching, not a full HTML5 parser." }, null, 2);
}

// MD5 implementation for legacy checksums. Not for passwords, signatures, or security decisions.
function md5Hex(message: Uint8Array): string {
  const bytes = [...message]; const bitLength = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  const low = bitLength >>> 0; const high = Math.floor(bitLength / 0x100000000) >>> 0;
  for (let j=0;j<4;j++) bytes.push((low >>> (8*j)) & 255); for (let j=0;j<4;j++) bytes.push((high >>> (8*j)) & 255);
  let a0=0x67452301|0, b0=0xefcdab89|0, c0=0x98badcfe|0, d0=0x10325476|0;
  const shifts=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const k=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*4294967296)|0);
  const rotate=(x:number,n:number)=>(x<<n)|(x>>>(32-n));
  for(let offset=0;offset<bytes.length;offset+=64){const m=Array.from({length:16},(_,j)=>(bytes[offset+j*4]|(bytes[offset+j*4+1]<<8)|(bytes[offset+j*4+2]<<16)|(bytes[offset+j*4+3]<<24))|0);let a=a0,b=b0,c=c0,d=d0;
    for(let i=0;i<64;i++){let f:number,g:number;if(i<16){f=(b&c)|(~b&d);g=i;}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;}else if(i<48){f=b^c^d;g=(3*i+5)%16;}else{f=c^(b|~d);g=(7*i)%16;}const temp=d;d=c;c=b;b=(b+rotate((a+f+k[i]+m[g])|0,shifts[i]))|0;a=temp;}
    a0=(a0+a)|0;b0=(b0+b)|0;c0=(c0+c)|0;d0=(d0+d)|0;
  }
  return [a0,b0,c0,d0].map(n=>[0,8,16,24].map(shift=>((n>>>shift)&255).toString(16).padStart(2,"0")).join("")).join("");
}
export async function hashBytes(bytes: Uint8Array, algorithms: string[] = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"], encoding: "hex" | "base64" = "hex"): Promise<string> {
  const rows: Record<string, string>[] = [];
  for (const algorithm of algorithms) {
    let result: string;
    if (algorithm.toUpperCase() === "MD5") result = md5Hex(bytes);
    else {
      const subtle = globalThis.crypto?.subtle;
      if (!subtle) throw new Error("Web Crypto is not available in this context. Use a secure context (HTTPS or localhost).");
      const digestName = algorithm.toUpperCase().replace(/^SHA(\d+)$/, "SHA-$1");
      try { const digestBuffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(digestBuffer).set(bytes); const digest = new Uint8Array(await subtle.digest(digestName, digestBuffer)); result = encoding === "base64" ? encodeBase64Utf8Bytes(digest) : [...digest].map(b => b.toString(16).padStart(2,"0")).join(""); }
      catch { throw new Error(`Digest algorithm ${algorithm} is not supported by this browser.`); }
    }
    if (algorithm.toUpperCase() === "MD5" && encoding === "base64") result = encodeBase64Utf8Bytes(Uint8Array.from(result.match(/.{2}/g)!.map(hex => parseInt(hex,16))));
    rows.push({ algorithm, encoding, digest: result });
  }
  return JSON.stringify({ localOnly: true, note: "MD5 and SHA-1 are legacy checksums; do not use them for password storage or new security designs.", hashes: rows }, null, 2);
}
export async function hashText(input: string, algorithms: string[] = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"], encoding: "hex" | "base64" = "hex"): Promise<string> {
  return hashBytes(new TextEncoder().encode(input), algorithms, encoding);
}
function encodeBase64Utf8Bytes(bytes: Uint8Array): string { let binary = ""; for (let offset=0;offset<bytes.length;offset+=0x8000) binary += String.fromCharCode(...bytes.subarray(offset,offset+0x8000)); return btoa(binary); }

function unixTimestamp(input: string, now = new Date()): string {
  const raw = input.trim(); const ts = raw ? Number(raw) : now.getTime();
  if (!Number.isFinite(ts)) { const date = new Date(raw); if (Number.isNaN(date.getTime())) throw new Error("Enter a Unix timestamp (seconds or milliseconds), ISO date, or leave empty to use now."); return JSON.stringify({ input: raw, milliseconds: date.getTime(), seconds: Math.floor(date.getTime()/1000), iso: date.toISOString(), utc: date.toUTCString(), local: date.toString() }, null, 2); }
  const milliseconds = Math.abs(ts) < 100_000_000_000 ? ts * 1000 : ts;
  const date = new Date(milliseconds); if (Number.isNaN(date.getTime())) throw new Error("Timestamp is outside the supported Date range.");
  return JSON.stringify({ input: ts, detectedUnit: milliseconds === ts ? "milliseconds" : "seconds", milliseconds: date.getTime(), seconds: Math.floor(date.getTime()/1000), iso: date.toISOString(), utc: date.toUTCString(), local: date.toString() }, null, 2);
}
function uuidValidate(input: string): string {
  const value = input.trim();
  if (/^00000000-0000-0000-0000-000000000000$/i.test(value)) return "Valid Nil UUID (all-zero identifier).";
  if (/^ffffffff-ffff-ffff-ffff-ffffffffffff$/i.test(value)) return "Valid Max UUID (all-one identifier).";
  const match = value.match(/^([0-9a-f]{8})-([0-9a-f]{4})-([1-8])[0-9a-f]{3}-([89ab])[0-9a-f]{3}-([0-9a-f]{12})$/i);
  return match ? `Valid UUID version ${match[3]} (RFC variant).` : "Invalid UUID: expected canonical 8-4-4-4-12 hexadecimal form with UUID version 1–8 and RFC variant, or the Nil/Max UUID.";
}
function uuidToBinary(input: string): string {
  const canonical = input.trim().replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(canonical)) throw new Error("Enter a canonical UUID (8-4-4-4-12 hexadecimal form). ");
  return canonical.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16).toString(2).padStart(8, "0")).join(" ");
}
function binaryToUuid(input: string): string {
  const compact = input.trim().replace(/[\s,:-]/g, "");
  let hex: string;
  if (/^[01]{128}$/.test(compact)) hex = compact.match(/.{8}/g)!.map((byte) => Number.parseInt(byte, 2).toString(16).padStart(2, "0")).join("");
  else if (/^[0-9a-f]{32}$/i.test(compact)) hex = compact.toLowerCase();
  else throw new Error("Enter exactly 128 binary digits or 32 hexadecimal digits to decode a UUID.");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function uuidGenerate(countRaw: string): string {
  const count = Math.max(1, Math.min(1000, Number.parseInt(countRaw, 10) || 10)); const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.randomUUID) throw new Error("Secure UUID generation is unavailable in this browser context.");
  return Array.from({ length: count }, () => cryptoApi.randomUUID()).join("\n");
}

function studioTextDiff(left: string, right: string, label: string): string {
  if (!right.trim()) throw new Error("Enter the second input to compare.");
  const a = left.replace(/\r\n?/g, "\n").split("\n");
  const b = right.replace(/\r\n?/g, "\n").split("\n");
  if (a.length * b.length > 120_000) {
    let prefix = 0;
    while (prefix < Math.min(a.length, b.length) && a[prefix] === b[prefix]) prefix++;
    let suffix = 0;
    while (suffix < Math.min(a.length - prefix, b.length - prefix) && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
    return JSON.stringify({ label, algorithm: "bounded prefix/suffix comparison", equal: left === right, unchangedPrefixLines: prefix, unchangedSuffixLines: suffix, removed: a.slice(prefix, a.length - suffix), added: b.slice(prefix, b.length - suffix), note: "Large input: bounded diff used to limit memory." }, null, 2);
  }
  const dp: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const changes: { type: "same" | "removed" | "added"; line: number; text: string }[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { changes.push({ type: "same", line: i + 1, text: a[i] }); i++; j++; }
    else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j])) { changes.push({ type: "added", line: j + 1, text: b[j] }); j++; }
    else { changes.push({ type: "removed", line: i + 1, text: a[i] }); i++; }
  }
  return JSON.stringify({ label, algorithm: "line-based longest common subsequence", equal: left === right, changes }, null, 2);
}

function markdownToHtmlLocal(input: string): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const out: string[] = []; let paragraph: string[] = []; let code: string[] = []; let inCode = false;
  const flush = () => { if (paragraph.length) { out.push(`<p>${paragraph.map(escape).join(" ")}</p>`); paragraph = []; } };
  for (const line of input.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) { flush(); if (!inCode) { inCode = true; code = []; } else { out.push(`<pre><code>${escape(code.join("\n"))}</code></pre>`); inCode = false; } continue; }
    if (inCode) { code.push(line); continue; }
    if (!line.trim()) { flush(); continue; }
    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) { flush(); const level = heading[1].length; out.push(`<h${level}>${escape(heading[2].trim())}</h${level}>`); continue; }
    const list = line.match(/^\s*[-*+]\s+(.+)$/);
    if (list) { flush(); out.push(`<ul><li>${escape(list[1])}</li></ul>`); continue; }
    paragraph.push(line.trim());
  }
  flush(); if (inCode) out.push(`<pre><code>${escape(code.join("\n"))}</code></pre>`);
  return out.join("\n");
}

function cssEscapeContent(input: string): string {
  return Array.from(input, (ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === "\\") return "\\\\";
    if (ch === '"') return '\\"';
    if (ch === "'") return "\\27 ";
    if (ch === "\n") return "\\a ";
    if (ch === "\r") return "\\d ";
    if (ch === "\f") return "\\c ";
    if (cp === 0) return "\\fffd ";
    if (cp < 0x20 || cp === 0x7f) return `\\${cp.toString(16)} `;
    return ch;
  }).join("");
}
function cssUnescapeContent(input: string): string {
  return input.replace(/\\([0-9a-fA-F]{1,6})[ \t\r\n\f]?|\\(.)/gs, (_all, hex: string | undefined, escaped: string | undefined) => {
    if (hex) {
      const cp = Number.parseInt(hex, 16);
      return String.fromCodePoint(cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? 0xfffd : cp);
    }
    return escaped ?? "";
  });
}

function suffixFallback(op: string, input: string, secondary: string, suffix: string): string {
  const lower = op.toLowerCase(); const family = lower.replace(/^developer-/, "").split("-")[0] || "text";
  const bytes = new TextEncoder().encode(input).length; const value = input.trim();
  const explain: Record<string, string> = {
    ascii: "ASCII covers code points U+0000–U+007F. Decimal ASCII codes are not UTF-8 byte hex or binary output.",
    base64: "Base64 is a reversible binary-to-text encoding, not encryption. Anyone with the encoded content can decode it.",
    binary: "This utility represents UTF-8 bytes as eight-bit binary groups; it does not treat Unicode characters as one byte each.",
    hex: "Hexadecimal output represents bytes with two hexadecimal digits per byte, using UTF-8 for text input.",
    unicode: "Unicode escapes are text representations of code points or UTF-16 code units, not a cryptographic transformation.",
    uuid: "UUIDs are 128-bit identifiers. A generated UUID is not an authentication or authorization token.",
    hash: "Hashes produce fixed-size digests from bytes. MD5 and SHA-1 are legacy checksums; password storage needs a dedicated password-hashing function.",
    http: "HTTP utility outputs are local examples or metadata parsing. They do not send requests or contact a server.",
    mime: "MIME types label media formats. File extensions do not prove a file's content or safety.",
    docker: "Docker configuration examples must be reviewed against the real application, runtime, and deployment policies.",
    kubernetes: "Kubernetes manifests express desired cluster resources and must be reviewed against cluster version, RBAC, policies, and workload requirements.",
    graphql: "Full GraphQL validation requires the relevant schema; this local utility can provide structural checks only.",
    openapi: "An OpenAPI document describes a contract, but local structure checks cannot prove the deployed server conforms to it.",
    nginx: "Nginx configuration must be checked against the deployed Nginx version; this tool does not run nginx -t.",
    sql: "SQL syntax varies by dialect. Local formatting and delimiter checks are not database parsing or execution.",
    javascript: "JavaScript checking here is structural only; this is not execution, a security review, or a full lint/type-check.",
    typescript: "Full TypeScript checking requires the compiler and project types; this local view is not a substitute for tsc.",
    yaml: "YAML indentation and scalar rules are significant. Lightweight checks do not replace a complete parser or schema validator.",
    markdown: "Markdown support follows a small common subset; host dialects and extension rules can render differently.",
    xml: "XML structure checks do not prove schema validity or application-level correctness.",
    html: "Lightweight HTML inspection is not a full HTML5 parser, sanitizer, or accessibility audit.",
    svg: "SVG syntax inspection does not guarantee safe or correct rendering in every viewer.",
    css: "A brace/string check is not a complete CSS grammar parse or browser compatibility test.",
    csv: "CSV dialects differ. Quoted commas and escaped quotes are supported, but every vendor-specific dialect is not inferred.",
    cron: "This utility targets five-field cron syntax; schedulers can differ in day-of-week, timezone, and extension support.",
    jwt: "JWT decoding is not signature verification. Claims are untrusted unless the signature and issuer/audience policy are separately verified.",
    url: "URL parsing happens locally. It does not fetch the address or prove that a remote host exists."
  };
  if (suffix === "diff") return studioTextDiff(input, secondary, family);
  if (suffix === "explainer") return `${family.toUpperCase()} — local explanation\n\n${explain[family] || `This ${family} operation analyzes the supplied input locally.`}\n\nInput: ${input.length} characters, ${bytes} UTF-8 bytes, ${input ? input.split(/\r?\n/).length : 0} lines.`;
  if (suffix === "inspector") return JSON.stringify({ tool: op, family, characters: input.length, utf8Bytes: bytes, lines: input ? input.replace(/\r\n?/g, "\n").split("\n").length : 0, words: value ? value.split(/\s+/).length : 0, empty: input.length === 0, delimiterCounts: { openCurly: (input.match(/{/g) || []).length, closeCurly: (input.match(/}/g) || []).length, openRound: (input.match(/\(/g) || []).length, closeRound: (input.match(/\)/g) || []).length }, preview: input.slice(0, 500) }, null, 2);
  if (suffix === "parser") return JSON.stringify({ tool: op, family, lineCount: input ? input.replace(/\r\n?/g, "\n").split("\n").length : 0, lines: input.replace(/\r\n?/g, "\n").split("\n").map((text, i) => ({ line: i + 1, empty: !text, text })), note: `Line-oriented ${family} parse view; no full domain parser is bundled for this specific mode.` }, null, 2);
  if (suffix === "preview") return JSON.stringify({ tool: op, family, preview: input.slice(0, 2000), truncated: input.length > 2000, characters: input.length, utf8Bytes: bytes, note: explain[family] || "Preview only; this does not execute code or contact remote services." }, null, 2);
  if (suffix === "validator" || suffix === "tester") {
    if (!value) throw new Error(`Enter ${family} input to check.`);
    const stack: string[] = []; let quote = "", escaped = false;
    for (let i = 0; i < input.length; i++) { const c = input[i]; if (quote) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === quote) quote = ""; continue; } if (c === "\"" || c === "'") { quote = c; continue; } if (c === "(" || c === "[" || c === "{") stack.push(c); else if (c === ")" || c === "]" || c === "}") { const wanted = c === ")" ? "(" : c === "]" ? "[" : "{"; if (stack.pop() !== wanted) throw new Error(`Unmatched or misordered closing delimiter '${c}' at character ${i + 1}.`); } }
    if (quote) throw new Error("Unterminated quoted string; comments and all language-specific string forms are not parsed by this basic checker.");
    if (stack.length) throw new Error(`Unclosed delimiter '${stack[stack.length - 1]}'.`);
    return `${family.toUpperCase()} structural check passed: quotes and (), [], {} are balanced. This is not full ${family} syntax, schema, type, or runtime validation.`;
  }
  if (["formatter", "beautifier"].includes(suffix)) {
    if (family === "ascii") { try { return encodeAscii(decodeAscii(input)); } catch { return encodeAscii(input); } }
    if (family === "hex") { try { return encodeHex(decodeHex(input)); } catch { return encodeHex(input); } }
    if (family === "binary") { try { return encodeBinary(decodeBinary(input)); } catch { return encodeBinary(input); } }
    if (family === "base64") { const decoded = decodeBase64Utf8(input, lower.includes("url-safe") || lower.includes("urlsafe")); return encodeBase64Utf8(decoded, lower.includes("url-safe") || lower.includes("urlsafe")); }
    if (family === "unicode") { try { return encodeUnicode(decodeUnicode(input)); } catch { return encodeUnicode(input); } }
    return input.replace(/\r\n?/g, "\n").split("\n").map(line => line.replace(/[ \t]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  }
  if (suffix === "minifier") {
    if (["base64", "ascii", "binary", "hex"].includes(family)) return value.replace(/[\s,:-]/g, "");
    return input.replace(/\r\n?/g, "\n").split("\n").map(line => line.trim()).filter(Boolean).join("\n");
  }
  if (suffix === "converter") {
    if (family === "base64") { try { return encodeBase64Utf8(decodeBase64Utf8(input), lower.includes("url-safe") || lower.includes("urlsafe")); } catch { return encodeBase64Utf8(input, lower.includes("url-safe") || lower.includes("urlsafe")); } }
    if (family === "ascii") { try { return decodeAscii(input); } catch { return encodeAscii(input); } }
    if (family === "binary") { try { return decodeBinary(input); } catch { return encodeBinary(input); } }
    if (family === "hex") { try { return decodeHex(input); } catch { return encodeHex(input); } }
    if (family === "uuid") { const values = value.split(/\s+/); if (!values.length) throw new Error("Enter one or more UUIDs."); return values.map(v => { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) throw new Error(`Invalid UUID format: ${v}`); return v.toLowerCase(); }).join("\n"); }
    return JSON.stringify({ tool: op, family, normalized: input.replace(/\r\n?/g, "\n"), note: `Only line endings were normalized; a semantic ${family} conversion cannot be inferred from this input alone.` }, null, 2);
  }
  if (suffix === "decoder" && family === "hash") throw new Error("Cryptographic hashes are one-way digests and cannot be decoded back into the original input.");
  if (suffix === "generator") {
    const templates: Record<string, string> = {
      git: "# Suggested local Git ignore rules\n.env\n*.log\n.DS_Store\n",
      kubernetes: "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example-config\ndata:\n  APP_ENV: \"development\"\n",
      markdown: "# Project title\n\nDescribe the purpose of this project.\n\n## Getting started\n\nDocument install, configuration, and tests.\n",
      yaml: "app:\n  name: example\n  enabled: true\n",
      csv: "id,name,active\n1,Ada,true\n2,Grace,true\n",
      svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 240 80\" role=\"img\" aria-label=\"Example illustration\"><rect width=\"240\" height=\"80\" rx=\"8\" fill=\"#eee\"/><text x=\"120\" y=\"46\" text-anchor=\"middle\">Example</text></svg>\n",
      http: "GET /health HTTP/1.1\nHost: api.example.com\nAccept: application/json\n",
      graphql: "query Example($id: ID!) {\n  node(id: $id) { id __typename }\n}\n"
    };
    if (templates[family]) return templates[family];
    if (family === "json") return JSON.stringify({ id: "example-1", name: "Example", active: true, items: [] }, null, 2);
    if (family === "uuid") return globalThis.crypto?.randomUUID?.() || (() => { throw new Error("Secure UUID generation is unavailable in this browser context."); })();
    throw new Error(`No stack preset is defined for ${family}; use the appropriate preset selector or related generator.`);
  }
  return `${op}\nLocal input analysis completed: ${input.length} characters and ${bytes} UTF-8 bytes.\nNo semantic validation is claimed for this mode.`;
}

/** Returns a result when this engine owns the operation, otherwise null for existing specialist engines. */
export async function runDeveloperStudio(op: string, input: string, secondary = "", flags = "g", now = new Date(), replacement = ""): Promise<string | null> {
  const lower = op.toLowerCase();
  const suffix = lower.match(/(?:^|-)(formatter|format|validator|beautifier|minifier|parser|converter|generator|diff|inspector|preview|tester|decoder|encoder|explainer|helper|builder|calculator|lookup|checker|compare|explainer)$/)?.[1] ?? "";
  const value = input.trim();

  const template = generateDeveloperTemplate(lower, input, secondary, now); if (template !== null) return template;
  if (suffix === "diff" && lower.includes("json")) return structuredJsonDiff(input, secondary);
  if (suffix === "diff" && !lower.includes("hash")) return studioTextDiff(input, secondary, lower.split("-")[0]);

  if (lower.includes("cron")) {
    if (suffix === "encoder") {
      const expression = value || "*/5 * * * *";
      cronNextRuns(expression, 1, now);
      return encodeBase64Utf8(expression);
    }
    if (suffix === "decoder") {
      const expression = decodeBase64Utf8(value);
      const parsed = cronNextRuns(expression, 10, now);
      return `${parsed.normalized}\n\n${parsed.explanation}\n\nDecoded locally from Base64; no scheduler was contacted.`;
    }
    const expression = value || (lower.includes("generator") ? "*/5 * * * *" : "");
    if (!expression) throw new Error("Enter a five-field cron expression: minute hour day-of-month month day-of-week.");
    const parsed = cronNextRuns(expression, 10, now);
    if (["validator", "tester"].includes(suffix)) return `Valid five-field cron expression.\nNormalized: ${parsed.normalized}\n\n${parsed.explanation}`;
    if (["beautifier", "formatter", "minifier", "converter"].includes(suffix)) return parsed.normalized;
    if (suffix === "explainer") return parsed.explanation;
    if (suffix === "inspector" || suffix === "parser" || suffix === "preview") return JSON.stringify({ normalized: parsed.normalized, explanation: parsed.explanation, upcomingRuns: parsed.runs }, null, 2);
    return JSON.stringify(parsed, null, 2);
  }
  if (lower.includes("unix-timestamp") || lower.includes("timestamp-converter") || lower.includes("epoch-converter")) return unixTimestamp(input, now);

  if (lower.includes("jwt") && (lower.includes("decoder") || lower.includes("expiration") || lower.includes("inspector") || lower.includes("parser") || lower.includes("tester") || lower.includes("validator") || lower.includes("explainer") || lower.includes("formatter") || lower.includes("beautifier") || lower.includes("preview") || lower.includes("checker") || lower.includes("converter") || lower.includes("minifier"))) {
    const report = JSON.parse(jwtDecode(input));
    if (suffix === "explainer") return `${report.warning}\n\nThe header and payload are Base64URL-decoded JSON. A successful decode does not establish that the token was issued by a trusted party.`;
    if (suffix === "minifier") return input.trim();
    if (suffix === "formatter" || suffix === "beautifier" || suffix === "preview" || suffix === "converter") return JSON.stringify(report, null, 2);
    return JSON.stringify(report, null, 2);
  }

  if (lower.includes("uuid") && lower.endsWith("-encoder")) return uuidToBinary(input);
  if (lower.includes("uuid") && lower.endsWith("-decoder")) return binaryToUuid(input);
  if (lower.includes("uuid") && ["generator", "randomizer", "batch"].some(s => lower.includes(s))) return uuidGenerate(secondary || input || "10");
  if (lower.includes("uuid")) {
    const validation = uuidValidate(value);
    if (suffix === "explainer") return "UUIDs are 128-bit identifiers. Version and variant bits describe the UUID format; UUIDs are not authorization credentials.\n\n" + validation;
    if (suffix === "inspector" || suffix === "parser" || suffix === "preview") {
      if (!/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i.test(value)) throw new Error(validation);
      return JSON.stringify({ canonical: value.toLowerCase(), length: value.replace(/-/g, "").length, variant: /^00000000|^ffffffff/i.test(value) ? "special Nil/Max UUID" : /-[89ab]/i.test(value) ? "RFC variant" : "non-RFC variant", version: /^00000000|^ffffffff/i.test(value) ? null : Number.parseInt(value[14], 16), groups: value.split("-"), note: "UUIDs are identifiers, not secrets or authentication tokens." }, null, 2);
    }
    if (["formatter", "beautifier", "converter", "minifier"].includes(suffix)) {
      if (!/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i.test(value)) throw new Error(validation);
      return value.toLowerCase();
    }
    if (["validator", "tester", "checker"].includes(suffix)) return validation;
  }

  if (lower.includes("hash-compare") || lower.includes("hash-diff")) {
    const rawLeft = value.trim().replace(/\s/g, ""); const rawRight = secondary.trim().replace(/\s/g, "");
    if (!rawLeft || !rawRight) throw new Error("Enter both hash values to compare.");
    // Hexadecimal digests are conventionally case-insensitive. Base64 and arbitrary strings are not.
    const hexDigestLengths = new Set([32, 40, 48, 64, 96, 128]);
    const isHexDigest = (v: string) => hexDigestLengths.has(v.length) && /^[a-f0-9]+$/i.test(v);
    const left = isHexDigest(rawLeft) && isHexDigest(rawRight) ? rawLeft.toLowerCase() : rawLeft;
    const right = isHexDigest(rawLeft) && isHexDigest(rawRight) ? rawRight.toLowerCase() : rawRight;
    const equal = left.length === right.length && [...left].reduce((acc, ch, i) => acc | (ch.charCodeAt(0) ^ right.charCodeAt(i)), 0) === 0;
    return JSON.stringify({ equal, leftLength: left.length, rightLength: right.length, comparison: isHexDigest(rawLeft) && isHexDigest(rawRight) ? "hex-digest-case-insensitive" : "exact-string", note: "Display comparison only; this is not a cryptographic timing-safe comparison or signature verification." }, null, 2);
  }
  if (lower.includes("hash") || lower.includes("sha256") || lower.includes("sha-256") || lower.includes("md5") || lower.includes("sha1") || lower.includes("sha-1") || lower.includes("sha512") || lower.includes("sha-512")) {
    if (suffix === "explainer") return "A cryptographic hash maps input bytes to a fixed-length digest. Hashing is one-way and is not encryption. MD5 and SHA-1 are unsuitable for modern collision-resistant security uses; use a password-hashing scheme, not a fast hash, for passwords. This tool hashes locally.";
    if (suffix === "decoder") throw new Error("Cryptographic hashes are one-way digests and cannot be decoded back to their original input.");
    if (suffix === "inspector" || suffix === "parser") { const compact = value.replace(/\s/g, ""); const shape = /^(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64}|[a-f0-9]{96}|[a-f0-9]{128})$/i.test(compact); return JSON.stringify({ characters: input.length, compactCharacters: compact.length, hexadecimal: /^[a-f0-9]+$/i.test(compact), recognizedDigestLength: shape, possibleAlgorithms: ({32:["MD5"],40:["SHA-1"],64:["SHA-256"],96:["SHA-384"],128:["SHA-512"]} as Record<number,string[]>)[compact.length] || [], note:"Digest length suggests a possible algorithm but does not establish authenticity." },null,2); }
    if (suffix === "formatter" || suffix === "beautifier") { const compact = value.replace(/\s/g, ""); if (!/^[a-f0-9]+$/i.test(compact)) throw new Error("A hash digest must contain hexadecimal characters only."); return compact.toLowerCase().match(/.{1,8}/g)?.join(" ") || ""; }
    if (lower.includes("validator") || lower.includes("tester")) { if (!/^(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64}|[a-f0-9]{96}|[a-f0-9]{128})$/i.test(value)) throw new Error("Hash must be a 32/40/64/96/128-character hexadecimal digest."); return `Valid hexadecimal digest shape (${value.length} characters). Algorithm cannot be inferred with certainty from length alone.`; }
    let algorithms = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"];
    if (lower.includes("md5")) algorithms = ["MD5"];
    else if (lower.includes("sha256") || lower.includes("sha-256")) algorithms = ["SHA-256"];
    else if (lower.includes("sha1") || lower.includes("sha-1")) algorithms = ["SHA-1"];
    else if (lower.includes("sha512") || lower.includes("sha-512")) algorithms = ["SHA-512"];
    else if (lower.includes("sha384") || lower.includes("sha-384")) algorithms = ["SHA-384"];
    else if (lower.includes("sha")) algorithms = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];
    return hashText(input, algorithms, lower.includes("base64") ? "base64" : "hex");
  }

  if (lower.includes("developer-sql-query-builder") || lower.includes("sql-query-builder")) {
    let spec: any = {};
    try { spec = value ? JSON.parse(input) : {}; } catch { throw new Error('Enter query options as JSON, for example {"table":"users","columns":["id","email"],"filters":[{"column":"active","operator":"=","value":true}],"limit":100}.'); }
    const ident = (x: unknown, label: string) => { if (typeof x !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(x)) throw new Error(`${label} must be a simple SQL identifier (letters, numbers, underscore; cannot start with a number).`); return `"${x}"`; };
    const table = ident(spec.table || "users", "Table");
    const cols = Array.isArray(spec.columns) && spec.columns.length ? spec.columns.map((x: unknown) => ident(x, "Column")).join(", ") : "*";
    const filters = Array.isArray(spec.filters) ? spec.filters : [];
    const params: unknown[] = [];
    const where = filters.map((f: any) => { const col = ident(f?.column, "Filter column"); const operator = String(f?.operator || "=").toUpperCase(); if (!["=", "!=", "<>", "<", "<=", ">", ">=", "LIKE", "IN", "IS NULL", "IS NOT NULL"].includes(operator)) throw new Error(`Unsupported filter operator: ${operator}`); if (operator === "IS NULL" || operator === "IS NOT NULL") return `${col} ${operator}`; if (operator === "IN") { if (!Array.isArray(f.value) || !f.value.length) throw new Error("IN filters need a non-empty value array."); params.push(...f.value); return `${col} IN (${f.value.map(() => "?").join(", ")})`; } params.push(f.value); return `${col} ${operator} ?`; });
    const rawLimit = spec.limit === undefined ? 100 : Number(spec.limit); if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 10000) throw new Error("Limit must be an integer from 1 to 10000.");
    const sql = `SELECT ${cols} FROM ${table}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} LIMIT ${rawLimit};`;
    return JSON.stringify({ sql, parameters: params, note: "Values use ? placeholders; adapt placeholders/identifier quoting to your database driver and dialect before execution." }, null, 2);
  }
  // HTTP request-builder is handled below by the options-aware implementation.
  if (lower.includes("ip-header-parser") || lower.includes("developer-ip-header-parser")) {
    const rows = input.split(/\r?\n/).map(line => line.match(/^\s*(x-forwarded-for|x-real-ip|cf-connecting-ip|forwarded)\s*:\s*(.*)$/i)).filter(Boolean) as RegExpMatchArray[];
    return JSON.stringify({ headers: rows.map(m => ({ name: m[1], value: m[2].trim(), addresses: m[1].toLowerCase() === "x-forwarded-for" ? m[2].split(",").map(x => x.trim()).filter(Boolean) : undefined })), note: "Forwarding headers are attacker-controlled unless a trusted proxy strips and rewrites them. Do not use them alone for security decisions." }, null, 2);
  }
  if (lower.includes("status-code-explainer") || lower.includes("http-status-explainer")) {
    if (!/^\d{3}$/.test(value)) throw new Error("Enter a three-digit HTTP status code from 100 through 599.");
    const code = Number(value); if (code < 100 || code > 599) throw new Error("HTTP status codes must be from 100 through 599.");
    const name = HTTP_STATUS[code] || "Unassigned / extension status code"; const detail = HTTP_STATUS_DETAILS[code];
    return JSON.stringify({ code, name, category: httpStatusClass(code), meaning: detail?.meaning ?? `${name}. This code is absent from the built-in registered-status table; consult the endpoint or applicable registry for exact semantics.`, typicalNextStep: detail?.action ?? "Inspect the response body, request, and API documentation; do not assume custom/unassigned statuses have standard behavior.", retryGuidance: detail?.retry ?? null, registeredInBuiltInTable: Object.hasOwn(HTTP_STATUS, code), localOnly: true, note: "This lookup never sends a request; real API behavior can be endpoint-specific." }, null, 2);
  }
  if (lower.includes("dummy-json-generator") || lower === "json-generator" || lower.endsWith("-json-generator")) {
    const count = Math.max(1, Math.min(100, Number(secondary || 3) || 3));
    return JSON.stringify(Array.from({ length: count }, (_, i) => ({ id: i + 1, name: ["Ada Lovelace", "Grace Hopper", "Katherine Johnson"][i % 3], email: `user${i + 1}@example.test`, active: i % 2 === 0 })), null, 2);
  }
  if (lower.includes("lorem-ipsum")) {
    const count = Math.max(1, Math.min(50, Number(secondary || 3) || 3));
    const paragraph = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae justo eget magna fermentum iaculis eu non diam.";
    return Array.from({ length: count }, () => paragraph).join("\n\n");
  }
  if (lower.includes("json-schema") && (suffix === "generator" || suffix === "builder")) return generateJsonSchema(input);

  if (lower.includes("json")) {
    if (lower.includes("path")) return jsonPathQuery(input, secondary || "$");
    if (lower.includes("diff")) return structuredJsonDiff(input, secondary);
    if (lower.includes("sort")) {
      const duplicates: string[] = []; validateJsonDetailed(input, { duplicateKeyPaths: duplicates });
      const sorted = stringifyJsonTokenAware(sortedJsonTokens(parseJsonTokenAware(input)));
      const warnings = jsonFormatterWarnings(input, duplicates);
      return [sorted, warnings, duplicates.length ? "Duplicate keys are last-value-wins in object sorting because the object mapping is ambiguous." : ""].filter(Boolean).join("\n\n");
    }
    if (lower.includes("schema") && (suffix === "generator" || suffix === "builder")) return generateJsonSchema(input);
    if (lower.includes("inspector") || lower.includes("explainer") || lower.includes("tree")) {
      const report = JSON.parse(inspectJsonDetailed(input)) as Record<string, any>;
      if (lower.includes("tree")) {
        const root: unknown = JSON.parse(input); const nodes: { path: string; type: string; preview: string }[] = [];
        const stack: { value: unknown; path: string; depth: number }[] = [{ value: root, path: "$", depth: 0 }];
        while (stack.length && nodes.length < 500) {
          const current = stack.pop()!; const x = current.value; const type = x === null ? "null" : Array.isArray(x) ? "array" : typeof x;
          nodes.push({ path: current.path, type, preview: x && typeof x === "object" ? `${type} (${Object.keys(x).length} items)` : String(x).slice(0, 100) });
          if (current.depth < 30 && x && typeof x === "object") { const entries = Object.entries(x as Record<string, unknown>); for (let i = entries.length - 1; i >= 0; i -= 1) stack.push({ value: entries[i][1], path: Array.isArray(x) ? `${current.path}[${entries[i][0]}]` : `${current.path}[${JSON.stringify(entries[i][0])}]`, depth: current.depth + 1 }); }
        }
        return JSON.stringify({ ...report, nodes, treeTruncated: stack.length > 0 || report.truncated, renderingAdvice: "Tree output is capped. Render only the subtree the user expands to avoid large-DOM slowdowns." }, null, 2);
      }
      return JSON.stringify(report, null, 2);
    }
    if (suffix === "validator" || suffix === "tester") return validateJsonDetailed(input);
    if (suffix === "encoder") return encodeBase64Utf8(input);
    if (suffix === "decoder") return decodeBase64Utf8(input);
    if (["formatter", "beautifier", "minifier"].includes(suffix)) {
      const duplicateKeyPaths: string[] = [];
      validateJsonDetailed(input, { duplicateKeyPaths });
      const formatted = formatJsonSource(input, suffix === "minifier");
      const warnings = jsonFormatterWarnings(input, duplicateKeyPaths);
      return [...warnings, formatted].filter(Boolean).join("\n\n");
    }
    const parsed = JSON.parse(input);
    const serialized = JSON.stringify(parsed, null, lower.includes("minifier") ? 0 : 2);
    const warnings = jsonFormatterWarnings(input, []);
    return [...warnings, serialized].filter(Boolean).join("\n\n");
  }

  if (lower.includes("jwt") && (suffix === "generator" || suffix === "encoder" || lower.includes("payload"))) {
    const payload = value ? JSON.parse(input) : { sub: "user-id", iat: Math.floor(now.getTime()/1000), exp: Math.floor(now.getTime()/1000)+3600 };
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("JWT payload must be a JSON object.");
    return JSON.stringify({ payload, note: "Payload preview only. A signature is not created or verified; do not use it for authentication." }, null, 2);
  }

  if (lower.includes("base64")) {
    if (suffix === "encoder" || suffix === "generator") return encodeBase64Utf8(input, lower.includes("url-safe") || lower.includes("urlsafe"));
    if (suffix === "decoder") return decodeBase64Utf8(input, lower.includes("url-safe") || lower.includes("urlsafe"));
    if (suffix === "validator" || suffix === "tester") { decodeBase64Utf8(input, lower.includes("url-safe") || lower.includes("urlsafe")); return "Valid Base64 encoding with UTF-8 text output."; }
  }
  if (lower.includes("unicode")) {
    if (suffix === "encoder" || suffix === "generator" || suffix === "converter") return encodeUnicode(input);
    if (suffix === "decoder") return decodeUnicode(input);
    if (suffix === "validator" || suffix === "tester") { if (/\\u(?![0-9a-f]{4})/i.test(input)) throw new Error("Found a \\u escape that is not followed by exactly four hexadecimal digits."); decodeUnicode(input); return "Unicode escape syntax is valid for the supported \\u and \\x forms."; }
  }
  if (lower.includes("ascii")) {
    if (suffix === "encoder" || suffix === "generator" || suffix === "converter") return encodeAscii(input);
    if (suffix === "decoder") return decodeAscii(input);
    if (suffix === "validator" || suffix === "tester") { decodeAscii(input); return "Valid decimal ASCII code sequence."; }
  }
  if (lower.includes("binary")) {
    if (suffix === "encoder" || suffix === "generator" || suffix === "converter") return encodeBinary(input);
    if (suffix === "decoder") return decodeBinary(input);
    if (suffix === "validator" || suffix === "tester") { decodeBinary(input); return "Valid binary byte sequence."; }
  }
  if (lower.includes("hex")) {
    if (suffix === "encoder" || suffix === "generator" || suffix === "converter") return encodeHex(input);
    if (suffix === "decoder") return decodeHex(input);
    if (suffix === "validator" || suffix === "tester") { const compact = value.replace(/0x/gi, "").replace(/[\s,:-]/g, ""); if (!/^(?:[a-f0-9]{2})+$/i.test(compact)) throw new Error("Hex input must contain an even number of hexadecimal digits."); return "Valid hexadecimal byte sequence."; }
  }
  if (lower.includes("html-entity") || (lower.includes("html") && (suffix === "encoder" || suffix === "decoder"))) return suffix === "encoder" ? htmlEncode(input) : htmlDecode(input);
  if (lower.includes("data-uri")) {
    if (lower.includes("decoder")) {
      const match = input.match(/^data:([^,]*?),(.*)$/s);
      if (!match) throw new Error("Enter a data URI (data:metadata,payload) with a comma separating metadata and payload.");
      const meta = match[1]; const payload = match[2]; const isBase64 = /(?:^|;)base64(?:;|$)/i.test(meta);
      let decoded: string;
      try { decoded = isBase64 ? decodeBase64Utf8(payload) : decodeURIComponent(payload); }
      catch (error) { throw new Error(`Unable to decode this data URI as UTF-8 text: ${error instanceof Error ? error.message : String(error)}. This tool is not a binary-file decoder.`); }
      return `${decoded}\n\nData URI metadata: ${meta || "(default media type: text/plain;charset=US-ASCII)"}\nPayload mode: ${isBase64 ? "Base64 interpreted as UTF-8 text" : "percent-encoded text"}. Arbitrary binary payloads require a byte/buffer-aware workflow and are not represented losslessly here.`;
    }
    const rawMime = secondary.trim() || "text/plain;charset=utf-8";
    const mime = rawMime.replace(/^data:/i, "").replace(/;base64$/i, "");
    if (!mime || /[\r\n,]/.test(mime) || !/^[A-Za-z0-9!#$&^_.+\-]+\/[A-Za-z0-9!#$&^_.+\-]+(?:;[A-Za-z0-9!#$&^_.+\-]+=[A-Za-z0-9!#$&^_.+\-]+)*$/.test(mime)) throw new Error("Enter a valid MIME type and optional simple parameters, such as text/plain;charset=utf-8 or image/svg+xml.");
    return `data:${mime};base64,${encodeBase64Utf8(input)}\n\nThis generator encodes UTF-8 text bytes. It does not read files or claim arbitrary binary-file support.`;
  }

  if (lower.includes("query-string-parser") || lower.includes("query-parser")) return parseQuery(input);
  if (lower.includes("query-string-builder") || lower.includes("query-builder")) return buildQuery(input);

  if (lower.includes("url") || lower.includes("uri")) {
    if (lower.includes("encoder")) return encodeURIComponent(input);
    if (lower.includes("decoder")) { try { return decodeURIComponent(input); } catch { throw new Error("Invalid percent escape in URL-encoded input."); } }
    if (lower.includes("validator") || lower.includes("tester")) { let url: URL; try { url = new URL(value); } catch { throw new Error("Enter a valid absolute URL, including its scheme (for example, https://example.com)."); } if (!/^https?:$/.test(url.protocol)) throw new Error("Only http: and https: URLs are accepted by this URL validator."); return `Valid ${url.protocol.slice(0,-1).toUpperCase()} URL: ${url.origin}`; }
    try { const u = new URL(value); return JSON.stringify({ href: u.href, protocol: u.protocol, username: u.username, hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin, params: [...u.searchParams.entries()].map(([key,val])=>({key,value:val})), note: "Query parameters are preserved as ordered key/value pairs, including duplicate keys." }, null, 2); } catch { throw new Error("Enter a valid absolute URL, including its scheme (for example, https://example.com)."); }
  }
  if (lower.includes("http") && !lower.includes("status") && !lower.includes("header-builder") && !lower.includes("cors") && !lower.includes("csp") && !lower.includes("request-builder") && !lower.includes("ip-header-parser")) {
    const lines = input.replace(/\r\n?/g, "\n").split("\n");
    const requestLine = lines[0] ?? "";
    const requestMatch = requestLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+)\s+HTTP\/(1\.0|1\.1|2|3)$/i);
    const headers = lines.slice(1).map((line, index) => ({ line: index + 2, raw: line, match: line.match(/^([!#$%&'*+.^_`|~0-9A-Za-z-]+)\s*:\s*(.*)$/) })).filter(row => row.match).map(row => ({ name: row.match![1], value: row.match![2] }));
    if (suffix === "validator" || suffix === "tester") {
      if (!requestMatch) throw new Error("Expected an HTTP request line such as GET /health HTTP/1.1.");
      const bad = lines.slice(1).findIndex(line => line.trim() && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\s*:\s*.*$/.test(line) && !/^\s/.test(line));
      if (bad >= 0) throw new Error(`Malformed HTTP header on line ${bad + 2}.`);
      return JSON.stringify({ valid: true, method: requestMatch[1].toUpperCase(), target: requestMatch[2], httpVersion: requestMatch[3], headerCount: headers.length, note: "Basic request-line and header-shape validation only; this does not open a socket or contact a server." }, null, 2);
    }
    if (suffix === "parser" || suffix === "inspector") return JSON.stringify({ requestLine: requestMatch ? { method: requestMatch[1].toUpperCase(), target: requestMatch[2], version: requestMatch[3] } : null, headers, malformedHeaderLines: lines.slice(1).map((line, index) => ({ line: index + 2, text: line })).filter(row => row.text.trim() && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+\s*:\s*.*$/.test(row.text) && !/^\s/.test(row.text)), lineCount: lines.length, note: "Local HTTP message inspection only. Header values are untrusted input." }, null, 2);
    if (suffix === "formatter" || suffix === "beautifier" || suffix === "converter") return lines.map(line => line.trimEnd()).join("\n").trimEnd() + "\n";
    if (suffix === "minifier") return lines.map(line => line.trim()).filter(Boolean).join("\n");
    if (suffix === "explainer") return "HTTP messages use a start line, headers, a blank separator, and optionally a body. This local tool inspects text only and never sends a request.";
    if (suffix === "generator") return "GET /health HTTP/1.1\nHost: api.example.test\nAccept: application/json\nUser-Agent: enV-Developer-Studio/1.0\n";
    if (suffix === "preview") return JSON.stringify({ firstLine: requestLine, headers: headers.slice(0, 10), preview: input.slice(0, 2000), truncated: input.length > 2000 }, null, 2);
  }

  if (lower.includes("cookie-parser")) return cookieParse(input);
  if (lower.includes("http-header") || lower.includes("header-builder") || lower.includes("header-format")) return headerBuilder(input);
  if (lower.includes("cors") && (lower.includes("generator") || lower.includes("builder") || lower.includes("helper"))) return generateCors(input);
  if (lower.includes("csp") && (lower.includes("generator") || lower.includes("builder") || lower.includes("helper"))) return generateCsp(input);
  if (lower.includes("http-status") || lower.includes("status-code")) return httpStatusLookup(input);
  if (lower.includes("mime") || lower.includes("content-type")) { const ext = value.replace(/^.*\./, "").replace(/^\./, "").toLowerCase(); return MIME_TYPES[ext] ?? Object.entries(MIME_TYPES).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}\t${v}`).join("\n"); }

  if (lower.includes("base64")) {
    const urlSafe = lower.includes("url-safe") || lower.includes("urlsafe");
    if (suffix === "encoder" || suffix === "generator") return encodeBase64Utf8(input, urlSafe);
    if (suffix === "decoder") return decodeBase64Utf8(input, urlSafe);
    if (suffix === "validator" || suffix === "tester") { decodeBase64Utf8(input, urlSafe); return `Valid ${urlSafe ? "Base64URL" : "Base64"} encoding with UTF-8 text payload.`; }
    if (["formatter", "beautifier", "minifier", "converter"].includes(suffix)) return encodeBase64Utf8(decodeBase64Utf8(input, urlSafe), urlSafe);
    if (["inspector", "parser", "preview"].includes(suffix)) {
      const decoded = decodeBase64Utf8(input, urlSafe);
      return JSON.stringify({ encoding: urlSafe ? "Base64URL" : "Base64", encodedCharacters: input.length, decodedCharacters: decoded.length, decodedUtf8Bytes: new TextEncoder().encode(decoded).length, preview: decoded.slice(0, 500), note: "Base64 is encoding, not encryption." }, null, 2);
    }
    if (suffix === "explainer") return "Base64 represents bytes as text using a 64-character alphabet. It is reversible and is not encryption. UTF-8 text decoding is used here; arbitrary binary files should be handled as bytes.";
  }

  // These families do not have a single canonical “encode/decode” grammar.
  // Their suffix tools therefore expose a clearly reversible UTF-8/Base64 transformation.
  // Dedicated HTML, URL, Base64, Unicode, ASCII, binary, hex, and UUID modes are handled above.
  const genericEncodingFamily = lower.replace(/^developer-/, "").split("-")[0] || "text";
  if (suffix === "encoder" && /^(docker|git|graphql|http|javascript|kubernetes|markdown|nginx|openapi|sql|typescript|yaml|csv|mime)$/.test(genericEncodingFamily)) return encodeBase64Utf8(input);
  if (suffix === "decoder" && /^(docker|git|graphql|http|javascript|kubernetes|markdown|nginx|openapi|sql|typescript|yaml|csv|mime)$/.test(genericEncodingFamily)) return decodeBase64Utf8(input);

  if (lower.includes("csv")) {
    const rows = (() => { const result: string[][] = []; let row: string[] = [], cell = "", quoted = false; for (let i=0;i<input.length;i++) { const ch=input[i]; if(ch==='"'){ if(quoted && input[i+1]==='"'){cell+='"';i+=1;}else quoted=!quoted;}else if(ch===","&&!quoted){row.push(cell);cell="";}else if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&input[i+1]==="\n")i+=1;row.push(cell);cell="";if(row.some(x=>x!==""))result.push(row);row=[];}else cell+=ch;} row.push(cell);if(row.some(x=>x!==""))result.push(row); if(quoted) throw new Error("CSV has an unterminated quoted field."); return result; })();
    const toCsv = (data: string[][]) => data.map(row => row.map(cell => /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g,'""')}"` : cell).join(",")).join("\n");
    if (lower.includes("to-json")) { if (!rows.length) return "[]"; const headers=rows[0].map((h,i)=>h||`column_${i+1}`); return JSON.stringify(rows.slice(1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??""]))),null,2); }
    if (lower.includes("to-csv") && lower.includes("json")) { const parsed=JSON.parse(input); if(!Array.isArray(parsed)) throw new Error("Expected a JSON array of objects."); const keys=[...new Set(parsed.flatMap((x:any)=>x&&typeof x==="object"&&!Array.isArray(x)?Object.keys(x):[]))]; const data=[keys,...parsed.map((x:any)=>keys.map(k=>x[k]&&typeof x[k]==="object"?JSON.stringify(x[k]):String(x[k]??"")))]; return toCsv(data); }
    if (!rows.length && (lower.includes("validator")||lower.includes("tester"))) throw new Error("CSV is empty.");
    if (lower.includes("validator") || lower.includes("tester")) { const widths=[...new Set(rows.map(row=>row.length))]; return JSON.stringify({ valid: widths.length<=1, rowCount: rows.length, headerColumns: rows[0]?.length ?? 0, rowWidths: widths, note: widths.length>1 ? "Rows have different column counts; review the source data." : "CSV was parsed with quoted-field and escaped-quote support." },null,2); }
    if (lower.includes("inspector")) return JSON.stringify({ rows: rows.length, columns: rows[0]?.length??0, rowWidths: rows.map(r=>r.length), preview: rows.slice(0,10) },null,2);
    return toCsv(rows);
  }

  if (lower.includes("markdown") || lower.includes("md-to-html")) {
    if (suffix === "generator") return "# Project title\n\nDescribe the purpose of the project.\n\n## Getting started\n\n- Install dependencies\n- Configure the environment\n- Run tests\n";
    if (suffix === "validator" || suffix === "tester") { const fences = (input.match(/^\s*```/gm) || []).length; if (fences % 2 !== 0) throw new Error("Markdown code fence is not closed; add a matching ``` line."); return JSON.stringify({ valid: true, lines: input.replace(/\r\n?/g,"\n").split("\n").length, headings: (input.match(/^\s*#{1,6}\s+.+$/gm) || []).length, links: (input.match(/!?\[[^\]]*\]\([^)]*\)/g) || []).length, note: "Checks common Markdown structure only; extensions and rendering vary by renderer." }, null, 2); }
    if (suffix === "preview" || lower.includes("to-html") || lower.includes("markdown-html")) return markdownToHtmlLocal(input);
    if (suffix === "inspector" || suffix === "parser") return JSON.stringify({ lines: input.replace(/\r\n?/g,"\n").split("\n").length, headings: [...input.matchAll(/^\s*(#{1,6})\s+(.+)$/gm)].map(m => ({ level:m[1].length, text:m[2].trim() })), links: [...input.matchAll(/!?\[([^\]]*)\]\(([^)]+)\)/g)].map(m => ({ text:m[1], target:m[2] })), codeFenceCount:(input.match(/^\s*```/gm)||[]).length },null,2);
    if (suffix === "minifier") return input.replace(/\r\n?/g,"\n").split("\n").map(line=>line.trimEnd()).join("\n").replace(/\n{3,}/g,"\n\n").trim();
    if (suffix === "formatter" || suffix === "beautifier" || suffix === "converter") return formatWithGrammar(input, "markdown");
  }

  if (lower.includes("xml") || lower.includes("html") || lower.includes("svg")) {
    if (lower.includes("validator") || lower.includes("tester")) {
      if (!value) throw new Error("Paste markup first.");
      if (typeof DOMParser !== "undefined") { const doc = new DOMParser().parseFromString(input, "application/xml"); const parserError = doc.querySelector("parsererror"); if (parserError) throw new Error(`Invalid XML/markup: ${parserError.textContent?.trim() || "parser error"}`); return "Valid XML syntax. This does not guarantee HTML accessibility, security, or schema conformance."; }
      const stack: string[] = []; for (const m of input.matchAll(/<\/?([A-Za-z][\w:.-]*)\b[^>]*?>/g)) { const token=m[0]; const name=m[1].toLowerCase(); if(/^<\//.test(token)){if(stack.pop()!==name) throw new Error(`Mismatched closing tag: ${name}.`);} else if(!/\/>$/.test(token)&&! /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(name)) stack.push(name); } if(stack.length) throw new Error(`Unclosed markup tag: ${stack.at(-1)}.`); return "Markup tag nesting appears balanced. No full XML/HTML parser was available in this context.";
    }
    if (suffix === "formatter" || suffix === "beautifier" || suffix === "preview") return formatWithGrammar(input, lower.includes("xml") || lower.includes("svg") ? "xml" : "html");
    if (lower.includes("inspector")) return simpleMarkupInspect(input);
    if (lower.includes("minifier")) return minifySafe(input, "html");
    if (lower.includes("encoder")) return htmlEncode(input);
    if (lower.includes("decoder")) return htmlDecode(input);
    if (lower.includes("generator")) return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>New page</title>\n</head>\n<body>\n  <main>\n    <h1>Hello world</h1>\n    <p>Replace this starter content with your own.</p>\n  </main>\n</body>\n</html>\n`;
  }
  if (lower.includes("css")) {
    if (suffix === "encoder") return cssEscapeContent(input);
    if (suffix === "decoder") return cssUnescapeContent(input);
    if (suffix === "generator") return `:root {\n  --primary: #0d9f8a;\n}\n\n.example {\n  color: var(--primary);\n  padding: 1rem;\n}\n`;
    if (suffix === "minifier") return minifySafe(input,"css");
    if (suffix === "formatter" || suffix === "beautifier" || suffix === "preview") return formatWithGrammar(input, "css");
    if (suffix === "inspector" || suffix === "parser") return JSON.stringify({ rules:(input.match(/[^{}]+\{[^{}]*\}/g)||[]).map(rule=>({selector:rule.slice(0,rule.indexOf("{")).trim(),declarations:(rule.match(/:[^;{}]+/g)||[]).length})), atRules:(input.match(/@[-\w]+/g)||[]).length, braceCounts:{open:(input.match(/\{/g)||[]).length,close:(input.match(/\}/g)||[]).length}, note:"Rule inspection is lightweight and does not cover the complete CSS grammar."},null,2);
    if (suffix === "validator" || suffix === "tester") { if(!value) throw new Error("Paste CSS input first."); const opens=(input.match(/\{/g)||[]).length, closes=(input.match(/\}/g)||[]).length; if(opens!==closes) throw new Error(`CSS braces do not balance (${opens} opening, ${closes} closing).`); if(/(^|;)\s*:[^:]/m.test(input)) throw new Error("Found a declaration with no property name."); return "Basic CSS structure checks passed. This is not full CSS grammar or browser compatibility validation."; }
  }
  if (lower.includes("sql") && !lower.includes("query-builder")) {
    if (suffix === "generator") return `CREATE TABLE example_records (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n`;
    if (suffix === "minifier") return minifySafe(input,"sql");
    if (["formatter", "beautifier", "format"].includes(suffix)) return formatWithGrammar(input, "sql", secondary || "sql");
    if (suffix === "inspector" || suffix === "parser") return JSON.stringify({ statementCount:input.split(";").map(x=>x.trim()).filter(Boolean).length, keywords:[...new Set((input.match(/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FROM|WHERE|JOIN|GROUP BY|ORDER BY|LIMIT|VALUES|SET)\b/gi)||[]).map(x=>x.toUpperCase()))], parentheses:{open:(input.match(/\(/g)||[]).length,close:(input.match(/\)/g)||[]).length}, semicolons:(input.match(/;/g)||[]).length, note:"Lightweight SQL inspection only; no dialect-specific parser or database execution."},null,2);
    if (suffix === "validator" || suffix === "tester") { if(!value) throw new Error("Paste SQL input first."); const open=(input.match(/\(/g)||[]).length, close=(input.match(/\)/g)||[]).length; if(open!==close) throw new Error(`SQL parentheses do not balance (${open} opening, ${close} closing).`); if(/\b(SELECT|DELETE|UPDATE|INSERT)\b/i.test(input) && !/\b(FROM|INTO|SET|VALUES)\b/i.test(input)) throw new Error("SQL statement appears to be missing a required clause such as FROM, INTO, SET, or VALUES."); return "Basic SQL structure checks passed. Dialect syntax, schema references, and query safety are not fully validated."; }
  }
  if (lower.includes("javascript") || lower.includes("typescript") || lower === "js-format" || lower === "js-beautifier") { if (suffix === "generator") return `/** Replace this example with your application logic. */\nexport function main() {\n  return { ok: true };\n}\n`; if (suffix === "minifier") return minifySafe(input,"javascript"); if (["formatter", "beautifier", "format"].includes(suffix)) return formatJavascript(input, lower.includes("typescript")); }
  if (lower.includes("yaml")) {
    if (suffix === "generator") return `app:\n  name: example\n  enabled: true\n`;
    if (suffix === "formatter" || suffix === "beautifier" || suffix === "converter") return formatWithGrammar(input, "yaml");
    if (!value) throw new Error("Paste YAML input first.");
    const normalized=input.replace(/\r\n?/g,"\n").split("\n").map(line=>line.replace(/[ \t]+$/g,"")).join("\n");
    if (suffix === "inspector" || suffix === "parser") return JSON.stringify({ lines:normalized.split("\n").length, mappings:(input.match(/^[ \t]*[^#\s][^:\n]*:[ \t]*/gm)||[]).length, sequences:(input.match(/^[ \t]*-[ \t]+/gm)||[]).length, tabsInIndent:input.split(/\r?\n/).some(line=>/^\s*\t/.test(line)), note:"This is a line-level YAML view, not a full YAML parser." },null,2);
    if (input.split(/\r?\n/).some(line=>/^\s*\t/.test(line))) throw new Error("YAML indentation should use spaces, not tabs.");
    if (!(/^\s*[-?]\s+/.test(value) || /^[\w."'-]+\s*:/m.test(value) || value === "---")) throw new Error("Input does not resemble a basic YAML mapping or sequence.");
    if (suffix === "validator" || suffix === "tester") { const bad = normalized.split("\n").findIndex(line => /:\s*[^#].*:\s*[^#]/.test(line) && !/^\s*[^:]+:\s*['"].*['"]\s*$/.test(line)); if (bad >= 0) throw new Error(`Possible malformed scalar or mapping on line ${bad+1}. Full YAML syntax and schema validation are not available locally.`); return "Basic YAML shape check passed. Anchors, tags, block scalars and schema rules are not fully parsed."; }
    if (suffix === "minifier") return normalized.split("\n").map(line=>line.trim()).filter(Boolean).join("\n");
    return await formatWithGrammar(input, "yaml");
  }
  if (lower.includes("graphql")) { if (lower.includes("validator")||lower.includes("tester")) { if(!value) throw new Error("Paste a GraphQL document first."); if(!/[{]/.test(value)||!/[}]/.test(value)) throw new Error("GraphQL document needs a selection set with matching braces. This is a basic structural check, not full schema validation."); let depth=0; for(const ch of value){if(ch==="{")depth++;if(ch==="}")depth--;if(depth<0)throw new Error("Unexpected closing brace in GraphQL document.");}if(depth!==0)throw new Error("GraphQL selection braces are unbalanced.");return "GraphQL selection braces are balanced. Schema/type validation is not performed."; } if(lower.includes("minifier"))return minifySafe(input,"graphql"); if(lower.includes("formatter")||lower.includes("beautifier")) return formatWithGrammar(input, "graphql"); }

  if (suffix === "encoder" && /^(docker|git|graphql|http|javascript|kubernetes|markdown|nginx|openapi|sql|typescript|yaml|csv|mime)$/.test(genericEncodingFamily)) return encodeBase64Utf8(input);
  if (suffix === "decoder" && /^(docker|git|graphql|http|javascript|kubernetes|markdown|nginx|openapi|sql|typescript|yaml|csv|mime)$/.test(genericEncodingFamily)) return decodeBase64Utf8(input);

  if (lower.includes("regex")) {
    const pattern = input;
    const sample = secondary;
    if (lower.includes("generator") && !sample) return `Common JavaScript RegExp patterns:\nEmail-like text: [^\\s@]+@[^\\s@]+\\.[^\\s@]+\nDigits: \\d+\nWhitespace: \\s+\nStart of line: ^\nEnd of line: $\n\nThese are starting patterns, not complete validators for every domain.`;
    if (!sample && !lower.includes("explainer")) throw new Error("Enter the sample/test text in the second input field.");
    let regexFlags = [...new Set(flags)].filter(c => "dgimsuvy".includes(c)).join(""); if (!regexFlags.includes("g")) regexFlags += "g";
    try { new RegExp(pattern, regexFlags); } catch(e) { throw new Error(`Invalid JavaScript RegExp: ${e instanceof Error ? e.message : String(e)}`); }
    // Accept a JSON array of sample strings to test many independent cases without asking
    // users to emulate multiple lines via flags. Plain text remains a single sample for compatibility.
    let samples = [sample]; let batch = false;
    if (sample.trim().startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(sample);
        if (Array.isArray(parsed)) {
          if (parsed.some((item) => typeof item !== "string")) throw new Error("Batch regex input must be a JSON array containing only strings.");
          samples = parsed as string[]; batch = true;
        }
      } catch (error) {
        if (error instanceof Error && /Batch regex input/.test(error.message)) throw error;
        // A non-JSON text sample beginning with '[' is still treated as ordinary sample text.
      }
    }
    if (batch && (samples.length < 1 || samples.length > 100)) throw new Error("Regex batch mode accepts between 1 and 100 sample strings.");
    if (samples.reduce((total, item) => total + new TextEncoder().encode(item).length, 0) > 1_000_000) throw new Error("Regex sample input exceeds the 1 MB local processing limit.");
    // This is only a heuristic: JS RegExp is synchronous and has no portable per-call timeout.
    // To avoid freezing the page, skip known-risk patterns on longer samples instead of claiming a timeout.
    const backtrackingRisk = /\([^)]*[+*][^)]*\)[+*{]/.test(pattern) || /(?:\.\*|\.\+).*(?:\.\*|\.\+)/.test(pattern);
    const results = samples.map((text, sampleIndex) => {
      const executionSkipped = backtrackingRisk && text.length > 24;
      if (executionSkipped) return { sampleIndex, sample: text, matchCount: 0, matches: [], preview: null, executionSkipped: true };
      const sampleRegex = new RegExp(pattern, regexFlags);
      const matches = [...text.matchAll(sampleRegex)].slice(0, 500);
      const report = matches.map((m) => ({ match: m[0], index: m.index, end: (m.index ?? 0) + m[0].length, groups: m.slice(1), namedGroups: m.groups ?? null }));
      return { sampleIndex, sample: text, matchCount: matches.length, matches: report, preview: lower.includes("replace") ? text.replace(new RegExp(pattern, regexFlags), replacement) : undefined, executionSkipped: false, truncated: matches.length === 500 };
    });
    const performanceRisk = backtrackingRisk ? "Pattern resembles a nested-quantifier backtracking pattern. Heuristic only; matching was skipped for samples over 24 UTF-16 code units because JavaScript RegExp has no portable timeout." : null;
    if (batch) return JSON.stringify({ pattern, flags: regexFlags, engine: "JavaScript RegExp", mode: "batch", sampleCount: samples.length, matchCount: results.reduce((total, result) => total + result.matchCount, 0), results, replacement: lower.includes("replace") ? replacement : undefined, performanceRisk }, null, 2);
    const result = results[0];
    if (lower.includes("replace")) return JSON.stringify({ preview: result.preview, replacement, matches: result.matches, engine: "JavaScript RegExp", truncated: result.truncated ?? false, executionSkipped: result.executionSkipped, performanceRisk }, null, 2);
    if (lower.includes("explainer")) return JSON.stringify({ pattern, flags: regexFlags, engine: "JavaScript RegExp", explanation: "Pattern is evaluated by the JavaScript RegExp engine in this browser. Regex syntax and lookbehind support vary from other engines.", performanceRisk, executionSkipped: result.executionSkipped, matchCount: result.matchCount, matches: result.matches }, null, 2);
    return JSON.stringify({ pattern, flags: regexFlags, engine: "JavaScript RegExp", performanceRisk, executionSkipped: result.executionSkipped, matchCount: result.matchCount, matches: result.matches, truncated: result.truncated ?? false }, null, 2);
  }
  if (lower.includes("user-agent-parser")) {
    if (!value) throw new Error("Paste a User-Agent string to inspect.");
    const browser = /Edg\//.test(input) ? "Microsoft Edge" : /Firefox\//.test(input) ? "Firefox" : /Chrome\//.test(input) ? "Chrome or Chromium" : /Safari\//.test(input) && /Version\//.test(input) ? "Safari" : /MSIE |Trident\//.test(input) ? "Internet Explorer" : "Unknown / not confidently identified";
    const os = /Windows NT/.test(input) ? "Windows" : /Android/.test(input) ? "Android" : /iPhone|iPad|iPod/.test(input) ? "iOS/iPadOS" : /Mac OS X|Macintosh/.test(input) ? "macOS" : /Linux/.test(input) ? "Linux" : "Unknown / not confidently identified";
    const device = /iPad|Tablet/.test(input) ? "Tablet" : /Mobile|iPhone|Android/.test(input) ? "Mobile or Android device" : /Windows|Macintosh|X11|Linux/.test(input) ? "Desktop-like client" : "Unknown";
    return JSON.stringify({ browser, operatingSystem: os, device, raw: input, note: "Heuristic User-Agent parsing only. User-Agent strings can be spoofed and are increasingly reduced by browsers." }, null, 2);
  }
  if (lower.includes("developer-api-mock-response-generator")) return JSON.stringify({ data: value ? JSON.parse(input) : { id: "example-1", message: "Mock response" }, meta: { mock: true }, error: null },null,2);
  if (lower.includes("http-request-builder")) {
    // Keep request generation local and validate header names/values to prevent newline injection.
    let method = "GET"; let suppliedHeaders: Record<string, unknown> = {}; let body: unknown;
    const rawOptions = secondary.trim();
    if (rawOptions.startsWith("{")) {
      let parsed: unknown; try { parsed = JSON.parse(rawOptions); } catch { throw new Error("Request options must be valid JSON with optional method, headers, and body fields."); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Request options must be a JSON object.");
      const spec = parsed as Record<string, unknown>; method = String(spec.method ?? "GET").toUpperCase();
      if (spec.headers !== undefined) { if (!spec.headers || typeof spec.headers !== "object" || Array.isArray(spec.headers)) throw new Error("headers must be a JSON object."); suppliedHeaders = spec.headers as Record<string, unknown>; }
      body = spec.body;
    } else method = (rawOptions.split(/\s+/)[0] || "GET").toUpperCase();
    if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method)) throw new Error("HTTP method must be GET, POST, PUT, PATCH, DELETE, HEAD, or OPTIONS.");
    let url: URL; try { url = new URL(value || "https://api.example.com/health"); } catch { throw new Error("Enter an absolute request URL, such as https://api.example.com/health."); }
    if (!/^https?:$/.test(url.protocol)) throw new Error("Only http and https request examples are supported.");
    const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "enV-Developer-Studio/1.0" };
    for (const [name, raw] of Object.entries(suppliedHeaders)) {
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) throw new Error(`Invalid HTTP header name: ${name}`);
      const headerValue = String(raw); if (/[\r\n]/.test(headerValue)) throw new Error(`Header '${name}' contains a newline, which is not allowed.`); headers[name] = headerValue;
    }
    if (body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
    const headerText = Object.entries(headers).map(([name, v]) => `${name}: ${v}`).join("\n");
    const bodyText = body === undefined ? "" : `\n\n${typeof body === "string" ? body : JSON.stringify(body, null, 2)}`;
    return `${method} ${url.pathname}${url.search} HTTP/1.1\nHost: ${url.host}\n${headerText}${bodyText}\n`;
  }
  return suffixFallback(op, input, secondary, suffix);
}

export const DEVELOPER_HTTP_STATUS = HTTP_STATUS;
export const DEVELOPER_MIME_TYPES = MIME_TYPES;
