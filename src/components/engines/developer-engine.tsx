import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CodeResult } from "@/components/engines/result-panel";
import { DEVELOPER_HTTP_STATUS, hashBytes, runDeveloperStudio } from "@/lib/engines/developer-studios";
import { runRegexStudio, type RegexStudioMode } from "@/lib/engines/regex-studio";
import { developerStudioExample } from "@/lib/engines/developer-studio-examples";
import { decodeData as decodeSharedData, encodeData as encodeSharedData } from "@/lib/engines/developer-utils";
import type { ToolMeta } from "@/types/tool";
import { getAllTools, toolPath } from "@/lib/registry";
import { developerActionForLegacySlug, developerModeForLegacySlug, developerStudioForLegacySlug } from "@/lib/developer-studios-catalog";

type Props = { op: string; tool?: ToolMeta; initialInput?: string };

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

// Legacy/fallback routes delegate to the same strict shared codec helpers used by direct utility pages.
function decodeData(input: string, kind: string): string {
  return decodeSharedData(input, kind);
}

function encodeData(input: string, kind: string): string {
  return encodeSharedData(input, kind);
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

// Keep legacy fallback and the primary Studio lookup aligned; this prevents
// older Developer routes from silently losing specialist status codes like 418.
const HTTP_STATUS: Record<string, string> = Object.fromEntries(
  Object.entries(DEVELOPER_HTTP_STATUS).map(([code, name]) => [code, name]),
);

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

export function DeveloperEngine({ op, tool, initialInput }: Props) {
  const example = useMemo(() => developerStudioExample(op), [op]);
  const [input, setInput] = useState(initialInput ?? "");
  const [secondary, setSecondary] = useState("");
  const [flags, setFlags] = useState("g");
  const [replacement, setReplacement] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [out, setOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [regexMode, setRegexMode] = useState<RegexStudioMode>(() => op.toLowerCase().includes("explainer") ? "flavors" : "test");
  const [sqlDialect, setSqlDialect] = useState("postgresql");
  const regexAbort = useRef<AbortController | null>(null);
  // Keep generator routes on their established starter-pattern behavior; tester/replace/builder/
  // explainer routes use the advanced Studio. The native forms mirror this routing rule.
  const isRegexTool = useMemo(() => /regex/.test(op.toLowerCase()) && !/regex-generator/.test(op.toLowerCase()), [op]);
  const needsSecond = useMemo(() => isRegexTool ? ["test", "benchmark", "pipeline"].includes(regexMode) : /diff|replace|compare|json-path|uuid-generator|uuid-batch|http-request-builder/.test(op), [op, isRegexTool, regexMode]);
  const isRegexReplace = op.toLowerCase().includes("regex-replace");
  const isSqlFormatter = /sql-(?:formatter|beautifier)/i.test(op);
  const isFileHash = op.toLowerCase().includes("file-hash");
  const toolSlug = tool?.slug;
  const parentStudio = useMemo(() => tool && !tool.tags.includes("developer-studio") ? developerStudioForLegacySlug(tool.slug) : null, [tool]);
  const parentMode = parentStudio && tool ? developerModeForLegacySlug(parentStudio, tool.slug) : undefined;
  const parentAction = parentStudio && tool ? developerActionForLegacySlug(parentStudio, tool.slug) : "encode";
  const legacyEngineOp = tool && "op" in tool.engine ? tool.engine.op : undefined;
  const parentStudioUrl = parentStudio && tool
    ? `/tools/developer/${parentStudio.slug}?mode=${encodeURIComponent(parentMode ?? parentStudio.modes[0]?.key ?? "format")}${legacyEngineOp ? `&op=${encodeURIComponent(legacyEngineOp)}` : ""}${parentAction === "decode" ? "&action=decode" : ""}`
    : undefined;
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
      if (isRegexTool) {
        const controller = new AbortController();
        regexAbort.current = controller;
        const result = await runRegexStudio(input, secondary, flags, replacement, regexMode, controller.signal);
        setOut(result);
      } else if (isFileHash) {
        if (!selectedFile) throw new Error("Choose a local file first. The file bytes will be read in this browser and will not be uploaded.");
        // A bounded whole-file Web Crypto read avoids silently allocating a multi-gigabyte buffer.
        // Larger files need a streaming/incremental hash implementation rather than a risky arrayBuffer().
        if (selectedFile.size > 256 * 1024 * 1024) throw new Error("This browser hash mode is limited to 256 MiB per file to protect memory. Use a trusted local streaming hash tool for larger files.");
        const algorithms = op.toLowerCase().includes("md5") ? ["MD5"] : op.toLowerCase().includes("sha256") ? ["SHA-256"] : ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"];
        setOut(await hashBytes(new Uint8Array(await selectedFile.arrayBuffer()), algorithms));
      } else {
        const dedicated = await runDeveloperStudio(op, input, isSqlFormatter ? sqlDialect : secondary, flags, new Date(), replacement);
        const result = dedicated ?? legacyGeneric(op, input, secondary, flags);
        setOut(result);
      }
    } catch (e) {
      setOut("");
      setError(e instanceof Error ? e.message : "Could not process this input.");
    } finally { regexAbort.current = null; setBusy(false); }
  };
  const loadExample = () => { setInput(initialInput ?? example.input); setSecondary(example.secondary ?? ""); setFlags(example.flags ?? "g"); setReplacement(example.replacement ?? ""); setRegexMode("test"); setOut(""); setError(null); };
  const handleEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void run(); } };
  return <div className="space-y-4">
    {parentStudio ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-sm"><div><p className="font-medium">Part of {parentStudio.name}</p><p className="mt-0.5 text-xs text-muted">Open the grouped workspace to switch between related developer tasks.</p></div><a href={parentStudioUrl} className="inline-flex min-h-9 items-center rounded-md border border-border px-3 py-2 font-medium hover:bg-surface-2">Open Studio</a></div> : null}
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm" role="note">
      <span className="font-medium">On-device processing.</span> Text operations run in this browser; input is not uploaded by this tool. File hashing reads the selected file locally.
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={loadExample}>Load example</Button>
      <span className="text-xs text-muted">Use Ctrl/⌘ + Enter to run.</span>
    </div>
    {isFileHash ? <div className="space-y-1.5"><Label htmlFor="dev-file">Local file</Label><input id="dev-file" type="file" onChange={(event) => { setSelectedFile(event.target.files?.[0] ?? null); setOut(""); setError(null); }} className="block w-full rounded-md border border-border p-2 text-sm" /><p className="text-xs text-muted">{selectedFile ? `${selectedFile.name} · ${selectedFile.size.toLocaleString()} bytes` : "The file never leaves this device."}</p></div> : null}
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block space-y-1.5"><Label htmlFor="dev-input">{isRegexTool && regexMode === "pipeline" ? "Default pattern (unused by layers)" : op.toLowerCase().includes("regex") ? "Regular expression" : "Input"}</Label><Textarea id="dev-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleEnter} className="min-h-52 font-mono" placeholder="Paste your code, data, token, URL, or text here…" /></label>
      {needsSecond ? <label className="block space-y-1.5"><Label htmlFor="dev-secondary">{isRegexTool ? regexMode === "pipeline" ? "Pipeline JSON (input + ordered layers)" : regexMode === "benchmark" ? "Test strings JSON" : "Test text or batch JSON" : op.toLowerCase().includes("json-path") ? "JSON path" : "Second input"}</Label><Textarea id="dev-secondary" value={secondary} onChange={(e) => setSecondary(e.target.value)} onKeyDown={handleEnter} className="min-h-52 font-mono" placeholder={isRegexTool && regexMode === "pipeline" ? '{"input":"text","layers":[{"name":"Trim tags","pattern":"<[^>]+>","flags":"g","replacement":""}]}' : isRegexTool && regexMode === "benchmark" ? '["short sample", {"label":"adversarial near miss","text":"..."}]' : op.toLowerCase().includes("json-path") ? "$.items[0].id" : isRegexTool ? 'One sample or JSON array, e.g. ["order-12", "invoice-8"]' : "Paste comparison input or test text…"} /></label> : null}
    </div>
    {isSqlFormatter ? <label className="block max-w-sm space-y-1.5"><Label htmlFor="dev-sql-dialect">SQL dialect</Label><select id="dev-sql-dialect" value={sqlDialect} onChange={(e) => setSqlDialect(e.target.value)} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="sql">Standard SQL</option><option value="postgresql">PostgreSQL</option><option value="mysql">MySQL</option><option value="mariadb">MariaDB</option><option value="sqlite">SQLite</option><option value="transactsql">SQL Server (T-SQL)</option><option value="bigquery">BigQuery</option><option value="snowflake">Snowflake</option><option value="oracle">Oracle</option><option value="redshift">Redshift</option><option value="duckdb">DuckDB</option></select><p className="text-xs text-muted">Uses the bundled sql-formatter dialect grammar locally. It formats query layout; it does not inspect schema or execute SQL, and stored procedures or custom delimiters may be unsupported.</p></label> : null}
    {isRegexTool ? <div className="space-y-3 rounded-lg border border-border p-3" aria-label="Regex Studio controls">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5"><Label htmlFor="dev-regex-mode">Studio mode</Label><select id="dev-regex-mode" value={regexMode} onChange={(e) => setRegexMode(e.target.value as RegexStudioMode)} className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
          <option value="test">Test / assertions</option><option value="benchmark">Benchmark</option><option value="pipeline">Substitution pipeline</option><option value="format">Format regex source</option><option value="flavors">Flavor compatibility</option>
        </select></label>
        <label className="block space-y-1.5"><Label htmlFor="dev-flags">Regex flags (JavaScript execution)</Label><Input id="dev-flags" value={flags} onChange={(e) => setFlags(e.target.value)} className="w-full font-mono" /></label>
      </div>
      {regexMode === "pipeline" ? <p className="text-xs text-muted" role="note">Provide JSON: {`{"input":"text","layers":[{"name":"Trim tags","pattern":"<[^>]+>","flags":"g","replacement":""}]}`}. Each layer receives the previous layer's output; each step is inspectable. Runs in a terminable Web Worker.</p>
        : regexMode === "flavors" ? <p className="text-xs text-muted" role="note">Shows static portability warnings for JavaScript, PCRE2, Python, Java, .NET and Go RE2. Only JavaScript RegExp is executed here; the tool does not claim cross-engine execution.</p>
        : regexMode === "format" ? <p className="text-xs text-muted" role="note">Produces a source-preserving readable representation. It does not add the unsupported free-spacing flag to JavaScript regexes.</p>
        : regexMode === "benchmark" ? <p className="text-xs text-muted" role="note">Benchmarks your selected samples on this device. Results vary by browser and device; likely high-backtracking patterns are bounded by a worker deadline.</p>
        : <p className="text-xs text-muted [overflow-wrap:anywhere]" role="note">Engine: JavaScript RegExp. Paste a JSON array or {`{"samples":[{"label":"valid","text":"ORD-12","expectMatch":true},{"label":"invalid","text":"bad","expectMatch":false}]}`} for repeatable cases. Execution is isolated in a terminable Web Worker when available.</p>}
      {(regexMode === "test" || regexMode === "benchmark") && <label className="block space-y-1.5"><Label htmlFor="dev-regex-replacement">{isRegexReplace ? "Replacement preview" : "Replacement preview (optional)"}</Label><Input id="dev-regex-replacement" value={replacement} onChange={(e) => setReplacement(e.target.value)} className="w-full font-mono" placeholder="$<name>, $1, or replacement text" /></label>}
    </div> : null}
    <div className="flex flex-wrap items-end gap-3">
      {isRegexReplace && !isRegexTool ? <label className="space-y-1.5"><Label htmlFor="dev-replacement">Replacement</Label><Input id="dev-replacement" value={replacement} onChange={(e) => setReplacement(e.target.value)} className="w-48 font-mono" placeholder="Replacement text" /></label> : null}
      <Button type="button" onClick={() => void run()} disabled={busy}>{busy ? "Processing…" : isRegexTool ? (regexMode === "test" ? (isRegexReplace ? "Preview replacement" : "Run tests") : regexMode === "benchmark" ? "Benchmark" : regexMode === "pipeline" ? "Run pipeline" : regexMode === "format" ? "Format regex" : "Analyze flavors") : actionLabel(op)}</Button>
      {busy && isRegexTool ? <Button type="button" variant="outline" onClick={() => regexAbort.current?.abort()}>Stop regex run</Button> : null}
      <Button type="button" variant="ghost" onClick={() => { regexAbort.current?.abort(); setInput(""); setSecondary(""); setFlags("g"); setReplacement(""); setRegexMode("test"); setSqlDialect("postgresql"); setSelectedFile(null); setOut(""); setError(null); }}>Reset</Button>
    </div>
    <ErrorBanner message={error} />
    <CodeResult code={out} filename={`env-${op}.txt`} />
    {relatedTools.length ? <nav aria-label="Related Developer Studio tools" className="space-y-2 border-t border-border pt-3">
      <h2 className="text-sm font-medium">Related tools in this Studio</h2>
      <div className="flex flex-wrap gap-2">{relatedTools.map((related) => <a key={related.id} href={toolPath(related)} className="inline-flex min-h-9 items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2">{related.name}</a>)}</div>
    </nav> : null}
  </div>;
}
