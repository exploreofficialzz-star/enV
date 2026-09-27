import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CodeResult } from "@/components/engines/result-panel";

type Props = { op: string };

function b64urlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function prettyJson(input: string, minify = false): string {
  const value = JSON.parse(input);
  return JSON.stringify(value, null, minify ? 0 : 2);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortJson(v)]));
  }
  return value;
}

function jsonDiff(a: string, b: string): string {
  const left = prettyJson(a).split("\n");
  const right = prettyJson(b).split("\n");
  const max = Math.max(left.length, right.length);
  const out: string[] = [];
  for (let i = 0; i < max; i += 1) {
    if (left[i] === right[i]) out.push(`  ${left[i] ?? ""}`);
    else {
      if (left[i] !== undefined) out.push(`- ${left[i]}`);
      if (right[i] !== undefined) out.push(`+ ${right[i]}`);
    }
  }
  return out.join("\n");
}

function formatMarkup(input: string): string {
  const tokens = input.replace(/>\s+</g, "><").replace(/(<[^>]+>)/g, "\n$1\n").split("\n").map((x) => x.trim()).filter(Boolean);
  const voidish = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
  let depth = 0;
  return tokens.map((token) => {
    const close = /^<\//.test(token);
    if (close) depth = Math.max(0, depth - 1);
    const line = `${"  ".repeat(depth)}${token}`;
    const open = /^<[^/!?]/.test(token) && !/\/>$/.test(token);
    const name = token.replace(/^<\/?([^\s>/]+).*$/, "$1");
    if (open && !voidish.test(name)) depth += 1;
    return line;
  }).join("\n");
}

function minifyText(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--([\s\S]*?)-->/g, "").replace(/\s+/g, " ").trim();
}

function csvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell); cell = ""; if (row.some((v) => v !== "")) rows.push(row); row = [];
    } else cell += ch;
  }
  row.push(cell); if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

function csvString(rows: string[][]): string {
  return rows.map((row) => row.map((v) => /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(",")).join("\n");
}

function csvToJson(input: string): string {
  const rows = csvRows(input); if (!rows.length) return "[]";
  const headers = rows[0];
  return JSON.stringify(rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h || `column_${i + 1}`, r[i] ?? ""]))), null, 2);
}

function jsonToCsv(input: string): string {
  const value = JSON.parse(input);
  if (!Array.isArray(value)) throw new Error("Expected a JSON array of objects.");
  const keys = [...new Set(value.flatMap((v) => v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v) : []))];
  if (!keys.length) return "";
  return csvString([keys, ...value.map((v) => keys.map((k) => typeof (v as any)?.[k] === "object" ? JSON.stringify((v as any)[k]) : String((v as any)?.[k] ?? "")))]);
}

function decodeData(input: string, kind: string): string {
  if (kind === "base64") return new TextDecoder().decode(Uint8Array.from(atob(input.replace(/\s+/g, "")), (c) => c.charCodeAt(0)));
  if (kind === "uri") return decodeURIComponent(input.replace(/\+/g, "%20"));
  if (kind === "unicode") return input.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (kind === "html") return input.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, "&");
  return input;
}

function encodeData(input: string, kind: string): string {
  if (kind === "base64") { const bytes = new TextEncoder().encode(input); let binary = ""; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary); }
  if (kind === "uri") return encodeURIComponent(input);
  if (kind === "unicode") return [...input].map((c) => `\\u${(c.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`).join("");
  if (kind === "html") return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return input;
}

function uuidValid(input: string): string {
  const m = input.trim().match(/^[0-9a-f]{8}-[0-9a-f]{4}-([1-5])[89ab][0-9a-f]{3}-[89ab][0-9a-f]{4}-[0-9a-f]{12}$/i);
  return m ? `Valid UUID v${m[1]}` : "Invalid UUID";
}

function makeUuid(): string {
  const cryptoApi = globalThis.crypto;
  const randomUUID = Reflect.get(cryptoApi, "randomUUID") as (() => string) | undefined;
  if (typeof randomUUID === "function") return randomUUID.call(cryptoApi);
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function jwt(input: string): string {
  const parts = input.trim().split("."); if (parts.length !== 3) throw new Error("A JWT must contain three dot-separated parts.");
  const header = JSON.parse(b64urlDecode(parts[0])); const payload = JSON.parse(b64urlDecode(parts[1]));
  const exp = typeof payload.exp === "number" ? new Date(payload.exp * 1000).toISOString() : "none";
  return JSON.stringify({ header, payload, signaturePresent: Boolean(parts[2]), expiresAt: exp, expired: typeof payload.exp === "number" ? Date.now() >= payload.exp * 1000 : null }, null, 2);
}

function urlInfo(input: string): string {
  const u = new URL(input.trim());
  return JSON.stringify({ href: u.href, protocol: u.protocol, username: u.username, hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin, params: Object.fromEntries(u.searchParams.entries()) }, null, 2);
}

const HTTP_STATUS: Record<string, string> = { "200":"OK", "201":"Created", "204":"No Content", "301":"Moved Permanently", "302":"Found", "304":"Not Modified", "400":"Bad Request", "401":"Unauthorized", "403":"Forbidden", "404":"Not Found", "405":"Method Not Allowed", "409":"Conflict", "422":"Unprocessable Content", "429":"Too Many Requests", "500":"Internal Server Error", "502":"Bad Gateway", "503":"Service Unavailable", "504":"Gateway Timeout" };

function generic(op: string, input: string, secondary: string, flags = "g"): string {
  const lower = op.toLowerCase();
  const base = lower.replace(/^developer-/, "").split("-")[0];
  const suffix = lower.match(/(?:^|-)((?:formatter|validator|beautifier|minifier|parser|converter|generator|diff|inspector|preview|tester|decoder|encoder|explainer))$/)?.[1] ?? "";

  if (lower.includes("regex-tester") || lower.includes("regex-replace") || lower.includes("regex-generator") || lower.includes("regex-explainer")) {
    if (!secondary) throw new Error("Enter a regular expression in the second field.");
    const regexFlags = flags.includes("g") ? flags : `${flags}g`;
    const matches = [...secondary.matchAll(new RegExp(input, regexFlags))];
    return `Pattern: /${input}/\nMatches: ${matches.length}\n\n${matches.map((m, i) => `${i + 1}. ${m[0]} at index ${m.index}`).join("\n") || "No matches"}`;
  }
  if (lower.includes("jwt-")) return jwt(input);
  if (lower.includes("uuid-generator") || lower.includes("uuid-batch-generator")) return Array.from({ length: Math.min(100, Number(secondary) || 10) }, makeUuid).join("\n");
  if (lower.includes("uuid") && (lower.includes("validator") || lower.includes("tester"))) return uuidValid(input);
  if (lower.includes("url-") || lower.includes("uri-") || lower.includes("cookie-parser") || lower.includes("query-builder")) {
    if (lower.includes("encoder")) return encodeData(input, "uri");
    if (lower.includes("decoder")) return decodeData(input, "uri");
    if (lower.includes("validator") || lower.includes("tester")) { new URL(input.trim()); return "Valid URL/URI"; }
    return urlInfo(input);
  }
  if (lower.includes("base64")) return suffix === "encoder" || suffix === "generator" ? encodeData(input, "base64") : suffix === "decoder" ? decodeData(input, "base64") : input;
  if (lower.includes("unicode")) return suffix === "encoder" || suffix === "generator" ? encodeData(input, "unicode") : suffix === "decoder" ? decodeData(input, "unicode") : input;
  if (lower.includes("ascii") || lower.includes("binary") || lower.includes("hex")) {
    if (suffix === "encoder" || suffix === "generator") return [...new TextEncoder().encode(input)].map((b) => lower.includes("binary") ? b.toString(2).padStart(8,"0") : b.toString(16).padStart(2,"0")).join(lower.includes("binary") ? " " : "");
    if (suffix === "decoder") return input.trim().split(/\s+/).map((v) => String.fromCharCode(parseInt(v, lower.includes("binary") ? 2 : 16))).join("");
    return input;
  }
  if (lower.includes("json")) {
    if (lower.includes("to-csv")) return jsonToCsv(input);
    if (lower.includes("diff")) return jsonDiff(input, secondary);
    if (lower.includes("sort")) return JSON.stringify(sortJson(JSON.parse(input)), null, 2);
    if (suffix === "minifier") return prettyJson(input, true);
    if (suffix === "formatter" || suffix === "beautifier" || suffix === "preview" || suffix === "inspector" || suffix === "parser" || suffix === "tester" || suffix === "explainer") return prettyJson(input);
    if (suffix === "validator") { JSON.parse(input); return "Valid JSON (RFC 8259-compatible parser)."; }
    if (suffix === "encoder") return encodeData(input, "base64");
    if (suffix === "decoder") return decodeData(input, "base64");
    if (suffix === "converter" || suffix === "generator") return prettyJson(input);
  }
  if (lower.includes("csv")) {
    if (lower.includes("to-json")) return csvToJson(input);
    if (suffix === "validator" || suffix === "tester") { const rows = csvRows(input); if (!rows.length) throw new Error("CSV is empty."); return `Valid CSV with ${rows.length} rows and ${rows[0].length} columns.`; }
    if (suffix === "minifier") return csvString(csvRows(input));
    if (suffix === "decoder" || suffix === "parser" || suffix === "formatter" || suffix === "beautifier" || suffix === "preview" || suffix === "inspector" || suffix === "converter") return csvString(csvRows(input));
  }
  if (lower.includes("xml") || lower.includes("html") || lower.includes("svg")) {
    if (suffix === "validator" || suffix === "tester") { const doc = new DOMParser().parseFromString(input, "application/xml"); if (doc.querySelector("parsererror")) throw new Error("Invalid markup/XML."); return "Valid markup/XML."; }
    if (suffix === "minifier") return minifyText(input);
    if (suffix === "encoder") return encodeData(input, "html");
    if (suffix === "decoder") return decodeData(input, "html");
    return formatMarkup(input);
  }
  if (lower.includes("sql") || lower.includes("graphql") || lower.includes("css") || lower.includes("javascript") || lower.includes("typescript") || lower.includes("docker") || lower.includes("nginx") || lower.includes("kubernetes") || lower.includes("git") || lower.includes("openapi") || lower.includes("markdown") || lower.includes("yaml")) {
    if (suffix === "validator" || suffix === "tester") { if (!input.trim()) throw new Error("Input is empty."); return `Input looks structurally usable for ${base}. Full language parsing is not claimed by this browser-only utility.`; }
    if (suffix === "minifier") return minifyText(input);
    if (suffix === "diff") return jsonDiff(JSON.stringify(input), JSON.stringify(secondary));
    if (suffix === "encoder") return encodeData(input, "html");
    if (suffix === "decoder") return decodeData(input, "html");
    return formatMarkup(input);
  }
  if (lower.includes("http-status") || lower.includes("status-code")) {
    const key = input.trim(); return HTTP_STATUS[key] ? `${key} ${HTTP_STATUS[key]}` : Object.entries(HTTP_STATUS).map(([k,v]) => `${k} ${v}`).join("\n");
  }
  if (lower.includes("mime") || lower.includes("content-type")) {
    const map: Record<string,string> = { json:"application/json", js:"text/javascript", css:"text/css", html:"text/html", csv:"text/csv", xml:"application/xml", pdf:"application/pdf", png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", webp:"image/webp", svg:"image/svg+xml", txt:"text/plain", wasm:"application/wasm" };
    const ext = input.trim().replace(/^.*\./, "").toLowerCase(); return map[ext] ?? Object.entries(map).map(([k,v]) => `${k}\t${v}`).join("\n");
  }
  if (lower.includes("cron")) return `Cron: ${input.trim()}\nFive-field format: minute hour day-of-month month day-of-week`;
  if (lower.includes("data-uri")) return encodeData(input, "base64");
  if (lower.includes("file-hash")) throw new Error("Use a local file input for the file hash tool.");
  if (lower.includes("generator") || lower.includes("builder") || lower.includes("helper")) return input.trim() || "Generated developer template ready. Replace the placeholders with your project values.";
  if (lower.includes("explainer")) return `Developer tool: ${op}\n\nInput length: ${input.length} characters.`;
  return input;
}

export function DeveloperEngine({ op }: Props) {
  const [input, setInput] = useState("");
  const [secondary, setSecondary] = useState("");
  const [flags, setFlags] = useState("g");
  const [out, setOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const needsSecond = useMemo(() => /diff|regex|replace|compare/.test(op), [op]);
  const run = () => {
    try { setError(null); setOut(generic(op, input, secondary, flags)); }
    catch (e) { setOut(""); setError(e instanceof Error ? e.message : "Could not process this input."); }
  };
  return <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block space-y-1.5"><Label htmlFor="dev-input">Input</Label><Textarea id="dev-input" value={input} onChange={(e) => setInput(e.target.value)} className="min-h-52 font-mono" placeholder="Paste your code, data, token, URL, or text here…" /></label>
      {needsSecond ? <label className="block space-y-1.5"><Label htmlFor="dev-secondary">Second input / test string</Label><Textarea id="dev-secondary" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="min-h-52 font-mono" /></label> : null}
    </div>
    <div className="flex flex-wrap items-end gap-3">
      {op.includes("regex") ? <label className="space-y-1.5"><Label htmlFor="dev-flags">Regex flags</Label><Input id="dev-flags" value={flags} onChange={(e) => setFlags(e.target.value)} className="w-28 font-mono" /></label> : null}
      <Button type="button" onClick={run}>Run tool</Button>
      <Button type="button" variant="ghost" onClick={() => { setInput(""); setSecondary(""); setOut(""); setError(null); }}>Reset</Button>
    </div>
    <ErrorBanner message={error} />
    <CodeResult code={out} filename={`env-${op}.txt`} />
  </div>;
}
