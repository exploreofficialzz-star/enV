export function decodeData(input: string, kind: string): string {
  if (kind === "base64") {
    const compact = input.replace(/\s+/g, "");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) throw new Error("Invalid Base64 input.");
    return new TextDecoder().decode(Uint8Array.from(atob(compact), (c) => c.charCodeAt(0)));
  }
  if (kind === "uri") return decodeURIComponent(input.replace(/\+/g, "%20"));
  if (kind === "unicode") return input.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (kind === "html") return input
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, "&");
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
  const m = value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-([1-5])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
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
