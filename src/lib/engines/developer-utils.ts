/** Decode text-oriented encodings strictly so malformed bytes never become replacement characters. */
export function decodeData(input: string, kind: string): string {
  if (kind === "base64") {
    const compact = input.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) throw new Error("Invalid Base64 input: unexpected character or padding.");
    const firstPad = compact.indexOf("=");
    const core = firstPad < 0 ? compact : compact.slice(0, firstPad);
    const padding = firstPad < 0 ? 0 : compact.length - firstPad;
    if (core.length % 4 === 1 || (padding > 0 && (compact.length % 4 !== 0 || (padding === 1 && core.length % 4 !== 3) || (padding === 2 && core.length % 4 !== 2)))) {
      throw new Error("Invalid Base64 input: malformed length or padding.");
    }
    const normalized = core + "=".repeat((4 - (core.length % 4)) % 4);
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0)); }
    catch { throw new Error("Invalid Base64 input."); }
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    if (btoa(binary).replace(/=+$/, "") !== core) throw new Error("Invalid Base64 input: non-canonical trailing bits.");
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new Error("Base64 decoded to bytes that are not valid UTF-8 text."); }
  }
  // URI-component semantics preserve literal '+'. Query/form parsing has a separate decoder.
  if (kind === "uri") return decodeURIComponent(input);
  if (kind === "unicode") {
    const decoded = input.replace(/\\u([0-9a-f]{4})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
    for (let i = 0; i < decoded.length; i++) {
      const unit = decoded.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = decoded.charCodeAt(i + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("Unicode escape contains an unpaired high surrogate.");
        i++;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error("Unicode escape contains an unpaired low surrogate.");
    }
    return decoded;
  }
  if (kind === "html") {
    // Decode ampersands last so &amp;lt; becomes &lt;, not '<', in a single pass.
    let decoded = input.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'");
    decoded = decoded.replace(/&#(\d+);/g, (_, digits: string) => {
      const point = Number(digits);
      if (!Number.isInteger(point) || point < 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new Error("Invalid numeric HTML entity.");
      return String.fromCodePoint(point);
    }).replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => {
      const point = Number.parseInt(digits, 16);
      if (!Number.isInteger(point) || point < 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new Error("Invalid numeric HTML entity.");
      return String.fromCodePoint(point);
    });
    return decoded.replace(/&amp;/gi, "&");
  }
  return input;
}

export function encodeData(input: string, kind: string): string {
  if (kind === "base64") {
    const bytes = new TextEncoder().encode(input);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }
  if (kind === "uri") return encodeURIComponent(input);
  if (kind === "unicode") return Array.from(input).flatMap((c) => { const cp = c.codePointAt(0) ?? 0; if (cp <= 0xffff) return [`\\u${cp.toString(16).padStart(4, "0")}`]; const n = cp - 0x10000; return [`\\u${(0xd800 + (n >> 10)).toString(16).padStart(4, "0")}`, `\\u${(0xdc00 + (n & 0x3ff)).toString(16).padStart(4, "0")}`]; }).join("");
  if (kind === "html") return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return input;
}

export function uuidValid(input: string): string {
  const value = input.trim();
  if (/^00000000-0000-0000-0000-000000000000$/i.test(value)) return "Valid Nil UUID";
  if (/^ffffffff-ffff-ffff-ffff-ffffffffffff$/i.test(value)) return "Valid Max UUID";
  const m = value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  return m ? `Valid UUID v${m[1]}` : "Invalid UUID";
}

export const HTTP_STATUS: Record<string, string> = {
  "100": "Continue", "101": "Switching Protocols", "102": "Processing", "103": "Early Hints",
  "200": "OK", "201": "Created", "202": "Accepted", "203": "Non-Authoritative Information", "204": "No Content", "205": "Reset Content", "206": "Partial Content", "207": "Multi-Status", "208": "Already Reported", "226": "IM Used",
  "300": "Multiple Choices", "301": "Moved Permanently", "302": "Found", "303": "See Other", "304": "Not Modified", "307": "Temporary Redirect", "308": "Permanent Redirect",
  "400": "Bad Request", "401": "Unauthorized", "402": "Payment Required", "403": "Forbidden", "404": "Not Found", "405": "Method Not Allowed", "406": "Not Acceptable", "407": "Proxy Authentication Required", "408": "Request Timeout", "409": "Conflict", "410": "Gone", "411": "Length Required", "412": "Precondition Failed", "413": "Content Too Large", "414": "URI Too Long", "415": "Unsupported Media Type", "416": "Range Not Satisfiable", "417": "Expectation Failed", "418": "I'm a teapot", "421": "Misdirected Request", "422": "Unprocessable Content", "423": "Locked", "424": "Failed Dependency", "425": "Too Early", "426": "Upgrade Required", "428": "Precondition Required", "429": "Too Many Requests", "431": "Request Header Fields Too Large", "451": "Unavailable For Legal Reasons",
  "500": "Internal Server Error", "501": "Not Implemented", "502": "Bad Gateway", "503": "Service Unavailable", "504": "Gateway Timeout", "505": "HTTP Version Not Supported", "506": "Variant Also Negotiates", "507": "Insufficient Storage", "508": "Loop Detected", "510": "Not Extended", "511": "Network Authentication Required",
};

export const MIME_TYPES: Record<string, string> = {
  json: "application/json", js: "text/javascript", mjs: "text/javascript", cjs: "text/javascript", ts: "text/typescript", css: "text/css", html: "text/html", htm: "text/html", csv: "text/csv", xml: "application/xml", yaml: "application/yaml", yml: "application/yaml",
  pdf: "application/pdf", wasm: "application/wasm", zip: "application/zip", gz: "application/gzip", txt: "text/plain", md: "text/markdown",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo",
};


/** Suggest the best Developer Studio/mode for clipboard or pasted text (DevToys-style smart detection). Client-side only. */
export type DeveloperInputHint = {
  kind: string;
  confidence: "high" | "medium" | "low";
  studioSlug: string;
  modeKey: string;
  reason: string;
};

export function detectDeveloperInputKind(raw: string): DeveloperInputHint | null {
  const input = raw.trim();
  if (!input) return null;
  // JWT: three base64url segments
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(input) && input.split(".").length === 3) {
    return { kind: "jwt", confidence: "high", studioSlug: "jwt-studio", modeKey: "decode", reason: "Looks like a JWT (three base64url segments)." };
  }
  // UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input) || /^00000000-0000-0000-0000-000000000000$/i.test(input) || /^ffffffff-ffff-ffff-ffff-ffffffffffff$/i.test(input)) {
    return { kind: "uuid", confidence: "high", studioSlug: "uuid-studio", modeKey: "validate", reason: "Looks like a canonical UUID." };
  }
  // Unix timestamp seconds or ms
  if (/^\d{10}$/.test(input) || /^\d{13}$/.test(input)) {
    return { kind: "timestamp", confidence: "medium", studioSlug: "time-cron-studio", modeKey: "timestamp", reason: "Looks like a Unix timestamp (seconds or milliseconds)." };
  }
  // Cron 5-field
  if (/^(\S+\s+){4}\S+$/.test(input) && /[*\/,-]/.test(input) && input.length < 120) {
    return { kind: "cron", confidence: "medium", studioSlug: "time-cron-studio", modeKey: "explain", reason: "Looks like a 5-field cron expression." };
  }
  // JSON
  if ((input.startsWith("{") && input.endsWith("}")) || (input.startsWith("[") && input.endsWith("]"))) {
    return { kind: "json", confidence: "high", studioSlug: "json-studio", modeKey: "format", reason: "Looks like JSON object or array text." };
  }
  // Hex digest
  if (/^[0-9a-f]{32}$/i.test(input)) {
    return { kind: "md5-hex", confidence: "medium", studioSlug: "hash-studio", modeKey: "compare", reason: "Looks like a 32-char hex digest (MD5-sized)." };
  }
  if (/^[0-9a-f]{40}$/i.test(input)) {
    return { kind: "sha1-hex", confidence: "medium", studioSlug: "hash-studio", modeKey: "compare", reason: "Looks like a 40-char hex digest (SHA-1-sized)." };
  }
  if (/^[0-9a-f]{64}$/i.test(input)) {
    return { kind: "sha256-hex", confidence: "medium", studioSlug: "hash-studio", modeKey: "compare", reason: "Looks like a 64-char hex digest (SHA-256-sized)." };
  }
  if (/^[0-9a-f]{96}$/i.test(input)) {
    return { kind: "sha384-hex", confidence: "medium", studioSlug: "hash-studio", modeKey: "compare", reason: "Looks like a 96-char hex digest (SHA-384-sized)." };
  }
  if (/^[0-9a-f]{128}$/i.test(input)) {
    return { kind: "sha512-hex", confidence: "medium", studioSlug: "hash-studio", modeKey: "compare", reason: "Looks like a 128-char hex digest (SHA-512-sized)." };
  }
  // Base64-ish
  const compactBase64 = input.replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/]+=*$/.test(compactBase64) && compactBase64.length >= 16 && compactBase64.length % 4 === 0) {
    return { kind: "base64", confidence: "medium", studioSlug: "encoding-studio", modeKey: "base64", reason: "Looks like Base64 text." };
  }
  // URL
  if (/^https?:\/\//i.test(input) || /%[0-9A-Fa-f]{2}/.test(input)) {
    return { kind: "url", confidence: "medium", studioSlug: "encoding-studio", modeKey: "url", reason: "Looks like a URL or percent-encoded text." };
  }
  return null;
}
