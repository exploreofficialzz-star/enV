import { type KeyboardEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CodeResult } from "@/components/engines/result-panel";
import { hashBytes, runDeveloperStudio } from "@/lib/engines/developer-studios";
import { developerStudioExample } from "@/lib/engines/developer-studio-examples";
import type { ToolMeta } from "@/types/tool";
import { getAllTools, toolPath } from "@/lib/registry";

type Props = { op: string; tool?: ToolMeta };

const STUDIO_FAMILIES = [
  "api-mock", "file-hash", "environment-variable", "semantic-version", "branch-name", "commit-message", "content-type", "query-string", "data-uri", "timestamp", "javascript", "typescript", "kubernetes", "graphql", "openapi", "markdown", "base64", "unicode", "binary", "ascii", "docker", "nginx", "http", "mime", "regex", "cron", "uuid", "json", "jwt", "hash", "sha", "md5", "hex", "url", "uri", "html", "xml", "svg", "css", "csv", "sql", "yaml", "git", "cookie", "webhook", "readme", "license", "editorconfig", "changelog", "csp", "cors", "ip-header", "status-code", "user-agent", "dummy-json",
].sort((a, b) => b.length - a.length);

function studioFamily(slug: string): string {
  const normalized = slug.replace(/^developer-/, "");
  if (normalized.startsWith("gitignore")) return "git";
  if (normalized.startsWith("dockerfile")) return "docker";
  if (normalized.startsWith("unix-timestamp") || normalized.startsWith("epoch") || normalized.startsWith("cron")) return "time";
  if (normalized.startsWith("xml-") || normalized.startsWith("html-") || normalized.startsWith("svg-") || normalized === "markdown-to-html") return "markup";
  const family = STUDIO_FAMILIES.find((prefix) => normalized === prefix || normalized.startsWith(`${prefix}-`));
  if (family === "file-hash" || family === "sha" || family === "md5") return "hash";
  if (family === "environment-variable") return "environment-variable";
  if (family === "content-type" || family === "mime") return "http";
  if (family === "query-string") return "url";
  if (family === "ip-header" || family === "status-code" || family === "user-agent" || family === "cookie" || family === "csp" || family === "cors") return "http";
  if (family === "data-uri" || family === "base64" || family === "unicode" || family === "binary" || family === "ascii" || family === "hex" || family === "url" || family === "uri" || family === "html") return "encoding";
  return family ?? normalized.split("-")[0];
}

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
  if (kind === "unicode") return Array.from(input).flatMap((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0xffff) return [`\\u${codePoint.toString(16).padStart(4, "0")}`];
    const scalar = codePoint - 0x10000;
    return [
      `\\u${(0xd800 + (scalar >> 10)).toString(16).padStart(4, "0")}`,
      `\\u${(0xdc00 + (scalar & 0x3ff)).toString(16).padStart(4, "0")}`,
    ];
  }).join("");
  if (kind === "html") return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return input;
}

function uuidValid(input: string): string {
  const value = input.trim();
  if (/^00000000-0000-0000-0000-000000000000$/i.test(value)) return "Valid Nil UUID";
  if (/^ffffffff-ffff-ffff-ffff-ffffffffffff$/i.test(value)) return "Valid Max UUID";
  const m = value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
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

function legacyGeneric(op: string, input: string, secondary: string, flags = "g"): string {
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

function actionLabel(op: string): string {
  const lower = op.toLowerCase();
  if (lower.includes("formatter") || lower.includes("beautifier")) return "Format";
  if (lower.includes("minifier")) return "Minify";
  if (lower.includes("validator") || lower.includes("tester")) return lower.includes("regex") ? "Test pattern" : "Validate";
  if (lower.includes("encoder")) return "Encode";
  if (lower.includes("decoder")) return "Decode";
  if (lower.includes("generator") || lower.includes("builder")) return "Generate";
  if (lower.includes("parser")) return "Parse";
  if (lower.includes("diff") || lower.includes("compare")) return "Compare";
  if (lower.includes("explainer")) return "Explain";
  if (lower.includes("hash")) return "Calculate hash";
  return "Run";
}

export function DeveloperEngine({ op, tool }: Props) {
  const example = useMemo(() => developerStudioExample(op), [op]);
  const [input, setInput] = useState("");
  const [secondary, setSecondary] = useState("");
  const [flags, setFlags] = useState("g");
  const [replacement, setReplacement] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [out, setOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsSecond = useMemo(() => /diff|regex|replace|compare|json-path|uuid-generator|uuid-batch|http-request-builder/.test(op), [op]);
  const isRegexReplace = op.toLowerCase().includes("regex-replace");
  const isFileHash = op.toLowerCase().includes("file-hash");
  const toolSlug = tool?.slug;
  const relatedTools = useMemo(() => {
    if (!toolSlug) return [];
    const family = studioFamily(toolSlug);
    const rank = (slug: string) => {
      const ending = slug.split("-").at(-1) ?? "";
      const ordered = ["formatter", "validator", "minifier", "diff", "inspector", "parser", "generator", "decoder", "encoder", "explainer", "tester", "preview", "calculator", "builder", "lookup", "helper"];
      const index = ordered.indexOf(ending);
      return index < 0 ? ordered.length : index;
    };
    return getAllTools()
      .filter((candidate) => candidate.category === "developer" && candidate.slug !== toolSlug && candidate.status !== "planned" && studioFamily(candidate.slug) === family)
      .sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [toolSlug]);
  const run = async () => {
    setBusy(true);
    try {
      setError(null);
      if (isFileHash) {
        if (!selectedFile) throw new Error("Choose a local file first. The file bytes will be read in this browser and will not be uploaded.");
        // A bounded whole-file Web Crypto read avoids silently allocating a multi-gigabyte buffer.
        // Larger files need a streaming/incremental hash implementation rather than a risky arrayBuffer().
        if (selectedFile.size > 256 * 1024 * 1024) throw new Error("This browser hash mode is limited to 256 MiB per file to protect memory. Use a trusted local streaming hash tool for larger files.");
        const algorithms = op.toLowerCase().includes("md5") ? ["MD5"] : op.toLowerCase().includes("sha256") ? ["SHA-256"] : ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"];
        setOut(await hashBytes(new Uint8Array(await selectedFile.arrayBuffer()), algorithms));
      } else {
        const dedicated = await runDeveloperStudio(op, input, secondary, flags, new Date(), replacement);
        const result = dedicated ?? legacyGeneric(op, input, secondary, flags);
        setOut(result);
      }
    } catch (e) {
      setOut("");
      setError(e instanceof Error ? e.message : "Could not process this input.");
    } finally { setBusy(false); }
  };
  const loadExample = () => { setInput(example.input); setSecondary(example.secondary ?? ""); setFlags(example.flags ?? "g"); setReplacement(example.replacement ?? ""); setOut(""); setError(null); };
  const handleEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void run(); } };
  return <div className="space-y-4">
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm" role="note">
      <span className="font-medium">On-device processing.</span> Text operations run in this browser; input is not uploaded by this tool. File hashing reads the selected file locally.
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={loadExample}>Load example</Button>
      <span className="text-xs text-muted">Use Ctrl/⌘ + Enter to run.</span>
    </div>
    {isFileHash ? <div className="space-y-1.5"><Label htmlFor="dev-file">Local file</Label><input id="dev-file" type="file" onChange={(event) => { setSelectedFile(event.target.files?.[0] ?? null); setOut(""); setError(null); }} className="block w-full rounded-md border border-border p-2 text-sm" /><p className="text-xs text-muted">{selectedFile ? `${selectedFile.name} · ${selectedFile.size.toLocaleString()} bytes` : "The file never leaves this device."}</p></div> : null}
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block space-y-1.5"><Label htmlFor="dev-input">{op.toLowerCase().includes("regex") ? "Regular expression" : "Input"}</Label><Textarea id="dev-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleEnter} className="min-h-52 font-mono" placeholder="Paste your code, data, token, URL, or text here…" /></label>
      {needsSecond ? <label className="block space-y-1.5"><Label htmlFor="dev-secondary">{op.toLowerCase().includes("regex") ? "Test text" : op.toLowerCase().includes("json-path") ? "JSON path" : "Second input"}</Label><Textarea id="dev-secondary" value={secondary} onChange={(e) => setSecondary(e.target.value)} onKeyDown={handleEnter} className="min-h-52 font-mono" placeholder={op.toLowerCase().includes("json-path") ? "$.items[0].id" : op.toLowerCase().includes("regex") ? 'One sample or JSON array, e.g. ["order-12", "invoice-8"]' : "Paste comparison input or test text…"} /></label> : null}
    </div>
    {op.toLowerCase().includes("regex") ? <p className="text-xs text-muted" role="note">Engine: JavaScript RegExp on Web. For independent test cases, paste a JSON array of strings into Test text. The same flags apply to each sample. Suspected high-backtracking patterns may be skipped for long samples to protect responsiveness; this is a heuristic, not a general execution timeout.</p> : null}
    <div className="flex flex-wrap items-end gap-3">
      {op.toLowerCase().includes("regex") ? <label className="space-y-1.5"><Label htmlFor="dev-flags">Regex flags</Label><Input id="dev-flags" value={flags} onChange={(e) => setFlags(e.target.value)} className="w-28 font-mono" /></label> : null}
      {isRegexReplace ? <label className="space-y-1.5"><Label htmlFor="dev-replacement">Replacement</Label><Input id="dev-replacement" value={replacement} onChange={(e) => setReplacement(e.target.value)} className="w-48 font-mono" placeholder="Replacement text" /></label> : null}
      <Button type="button" onClick={() => void run()} disabled={busy}>{busy ? "Processing…" : actionLabel(op)}</Button>
      <Button type="button" variant="ghost" onClick={() => { setInput(""); setSecondary(""); setFlags("g"); setReplacement(""); setSelectedFile(null); setOut(""); setError(null); }}>Reset</Button>
    </div>
    <ErrorBanner message={error} />
    <CodeResult code={out} filename={`env-${op}.txt`} />
    {relatedTools.length ? <nav aria-label="Related Developer Studio tools" className="space-y-2 border-t border-border pt-3">
      <h2 className="text-sm font-medium">Related tools in this Studio</h2>
      <div className="flex flex-wrap gap-2">{relatedTools.map((related) => <a key={related.id} href={toolPath(related)} className="inline-flex min-h-9 items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2">{related.name}</a>)}</div>
    </nav> : null}
  </div>;
}
