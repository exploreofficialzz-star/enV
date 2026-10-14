import type { ToolMeta } from "@/types/tool";

export type DeveloperStudioMode = { key: string; label: string; op: string; decodeOp?: string };
export type DeveloperStudioDefinition = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sourceId: string;
  icon: string;
  keywords: string[];
  modes: DeveloperStudioMode[];
};

/**
 * Developer Studios are a discovery/workspace layer over the existing catalog.
 * The source tool records and their public slugs are intentionally preserved.
 */
export const DEVELOPER_STUDIOS: DeveloperStudioDefinition[] = [
  {
    id: "json-studio", slug: "json-studio", name: "JSON Studio",
    description: "Format, validate, compare, inspect, query, and convert structured data locally while preserving large integer tokens and explaining parser caveats.",
    sourceId: "json-formatter", icon: "Braces", keywords: ["json", "format", "minify", "validate", "diff", "path", "tree", "csv", "schema", "large integer", "duplicate key", "offline", "privacy"],
    modes: [
      { key: "format", label: "Format", op: "json-formatter" }, { key: "minify", label: "Minify", op: "json-minifier" },
      { key: "validate", label: "Validate", op: "json-validator" }, { key: "diff", label: "Diff", op: "json-diff" },
      { key: "path", label: "Path / Search", op: "json-path-query" }, { key: "tree", label: "Tree / Inspect", op: "json-inspector" },
      { key: "schema", label: "Schema", op: "developer-json-schema-generator" }, { key: "convert", label: "Convert to CSV", op: "json-to-csv" }, { key: "csv", label: "CSV tools", op: "csv-formatter" },
    ],
  },
  {
    id: "jwt-studio", slug: "jwt-studio", name: "JWT Studio",
    description: "Decode JWT header and payload, inspect registered claims and expiry, and draft payloads locally. Decoding never proves trust or signature validity.",
    sourceId: "jwt-decoder", icon: "ShieldCheck", keywords: ["jwt", "token", "claims", "expiration", "exp", "iat", "nbf", "issuer", "audience", "privacy"],
    modes: [
      { key: "decode", label: "Decode", op: "jwt-decoder" }, { key: "expiration", label: "Expiration", op: "jwt-expiration-checker" },
      { key: "claims", label: "Claims inspector", op: "jwt-inspector" }, { key: "payload", label: "Payload builder", op: "developer-jwt-payload-generator" },
    ],
  },
  {
    id: "regex-studio", slug: "regex-studio", name: "Regex Studio",
    description: "Test JavaScript regular expressions against multiple cases, inspect numbered and named captures, preview replacements, and review portability and backtracking risks.",
    sourceId: "regex-tester", icon: "Regex", keywords: ["regex", "regular expression", "replace", "capture group", "match", "flags", "benchmark", "pipeline", "JavaScript RegExp"],
    modes: [
      { key: "match", label: "Match / Test", op: "regex-tester" }, { key: "replace", label: "Replace", op: "regex-replace" },
      { key: "explain", label: "Explain", op: "developer-regex-explainer" },
    ],
  },
  {
    id: "hash-studio", slug: "hash-studio", name: "Hash Studio",
    description: "Calculate MD5 and SHA-family digests side by side, compare digest strings, or hash a local file without uploading its bytes. Hashes are not encryption.",
    sourceId: "sha256-hash", icon: "Fingerprint", keywords: ["hash", "sha256", "sha-256", "md5", "sha-1", "sha-384", "sha-512", "file hash", "digest", "checksum"],
    modes: [
      { key: "hash", label: "Multi-hash", op: "hash-generator" }, { key: "compare", label: "Compare", op: "hash-compare" },
      { key: "file", label: "File hash", op: "file-hash-calculator" },
    ],
  },
  {
    id: "encoding-studio", slug: "encoding-studio", name: "Encoding Studio",
    description: "Encode and decode UTF-8 data across Base64, URL components, HTML entities, hexadecimal, binary, ASCII, Unicode escapes, and Data URIs on-device.",
    sourceId: "base64-encoder", icon: "ArrowLeftRight", keywords: ["encoding", "decoding", "base64", "url", "html entities", "hex", "binary", "ascii", "unicode", "data uri", "utf-8"],
    modes: [
      { key: "base64", label: "Base64", op: "base64-encoder", decodeOp: "base64-decoder" }, { key: "url", label: "URL", op: "url-encoder", decodeOp: "url-decoder" },
      { key: "html", label: "HTML entities", op: "html-encoder", decodeOp: "html-decoder" }, { key: "hex", label: "Hex", op: "hex-encoder", decodeOp: "hex-decoder" },
      { key: "binary", label: "Binary", op: "binary-encoder", decodeOp: "binary-decoder" }, { key: "ascii", label: "ASCII", op: "ascii-encoder", decodeOp: "ascii-decoder" },
      { key: "unicode", label: "Unicode", op: "unicode-encoder", decodeOp: "unicode-decoder" }, { key: "data-uri", label: "Data URI", op: "data-uri-generator", decodeOp: "developer-data-uri-decoder" },
    ],
  },
  {
    id: "time-cron-studio", slug: "time-cron-studio", name: "Time & Cron Studio",
    description: "Convert Unix seconds or milliseconds, parse five-field cron expressions, explain scheduling semantics, and calculate upcoming fire times without contacting a scheduler.",
    sourceId: "cron-parser", icon: "Clock3", keywords: ["cron", "timestamp", "unix", "epoch", "UTC", "local time", "schedule", "next runs", "timezone"],
    modes: [
      { key: "timestamp", label: "Timestamp", op: "unix-timestamp-converter" }, { key: "explain", label: "Cron explain", op: "cron-explainer" },
      { key: "next-runs", label: "Next runs", op: "cron-parser" }, { key: "presets", label: "Presets", op: "cron-generator" },
    ],
  },
  {
    id: "uuid-studio", slug: "uuid-studio", name: "UUID Studio",
    description: "Generate batches of cryptographically random UUID v4 identifiers, validate canonical UUID shape and version bits, and inspect special UUIDs locally.",
    sourceId: "uuid-generator", icon: "Fingerprint", keywords: ["uuid", "guid", "v4", "batch", "validate", "variant", "identifier"],
    modes: [{ key: "generate", label: "Generate batch", op: "uuid-generator" }, { key: "validate", label: "Validate", op: "uuid-validator" }],
  },
  {
    id: "sql-studio", slug: "sql-studio", name: "SQL Studio",
    description: "Format and minify SQL using an explicit dialect, review basic parser feedback, and preserve hard JOIN/GROUP/HAVING queries. SQL is never executed.",
    sourceId: "sql-formatter", icon: "Database", keywords: ["sql", "format", "minify", "dialect", "postgresql", "mysql", "sqlite", "join", "group by", "having"],
    modes: [{ key: "format", label: "Format", op: "sql-formatter" }, { key: "minify", label: "Minify", op: "sql-minifier" }, { key: "parse", label: "Parse feedback", op: "sql-parser" }, { key: "query", label: "Query builder", op: "developer-sql-query-builder" }, { key: "schema", label: "Schema generator", op: "developer-sql-schema-generator" }],
  },
  {
    id: "markup-studio", slug: "markup-studio", name: "Markup & Style Studio",
    description: "Format and inspect HTML, CSS, JavaScript, XML, YAML, and Markdown preview locally. Formatting is not code execution or a security audit.",
    sourceId: "javascript-formatter", icon: "FileCode2", keywords: ["html", "css", "javascript", "typescript", "xml", "yaml", "markdown", "formatter", "preview"],
    modes: [
      { key: "html", label: "HTML", op: "html-beautifier" }, { key: "css", label: "CSS", op: "css-beautifier" },
      { key: "javascript", label: "JavaScript", op: "javascript-formatter" }, { key: "xml", label: "XML", op: "xml-beautifier" },
      { key: "yaml", label: "YAML", op: "yaml-formatter" }, { key: "markdown", label: "Markdown preview", op: "markdown-preview" },
      { key: "samples", label: "Sample content", op: "lorem-ipsum-generator" },
    ],
  },
  {
    id: "http-api-studio", slug: "http-api-studio", name: "HTTP & API Studio",
    description: "Look up HTTP statuses, inspect query strings and content types, build safe headers, and draft CORS, CSP, cookie, and User-Agent references entirely locally.",
    sourceId: "http-status-lookup", icon: "Network", keywords: ["http", "api", "status", "418", "headers", "query string", "mime", "cors", "csp", "cookies", "user agent"],
    modes: [
      { key: "status", label: "Status codes", op: "http-status-lookup" }, { key: "headers", label: "Headers", op: "developer-http-header-builder" },
      { key: "query", label: "Query string", op: "query-string-parser" }, { key: "mime", label: "MIME types", op: "developer-content-type-lookup" },
      { key: "cors", label: "CORS", op: "developer-cors-header-helper" }, { key: "csp", label: "CSP", op: "developer-csp-header-generator" },
      { key: "cookies", label: "Cookies", op: "developer-cookie-parser" }, { key: "user-agent", label: "User-Agent", op: "user-agent-parser" },
    ],
  },
  {
    id: "devops-studio", slug: "devops-studio", name: "DevOps Config Studio",
    description: "Generate copy-ready project configuration, starter docs, container files, API schemas, Git conventions, and release metadata with useful comments and editable presets.",
    sourceId: "developer-gitignore-generator", icon: "Container", keywords: ["devops", "docker", "compose", "nginx", "gitignore", "editorconfig", "environment", "openapi", "graphql", "license", "readme", "commit", "semver"],
    modes: [
      { key: "gitignore", label: ".gitignore", op: "developer-gitignore-generator" }, { key: "dockerfile", label: "Dockerfile", op: "developer-dockerfile-helper" },
      { key: "compose", label: "Compose", op: "developer-docker-compose-generator" }, { key: "nginx", label: "Nginx", op: "developer-nginx-config-generator" },
      { key: "editorconfig", label: "EditorConfig", op: "developer-editorconfig-generator" }, { key: "env", label: ".env example", op: "developer-environment-variable-generator" },
      { key: "openapi", label: "OpenAPI", op: "developer-openapi-example-generator" }, { key: "graphql", label: "GraphQL", op: "developer-graphql-query-builder" },
      { key: "license", label: "License", op: "developer-license-generator" }, { key: "readme", label: "README", op: "developer-readme-generator" },
      { key: "commit", label: "Commit message", op: "developer-commit-message-helper" }, { key: "branch", label: "Branch name", op: "developer-branch-name-generator" },
      { key: "changelog", label: "Changelog", op: "developer-changelog-generator" }, { key: "semver", label: "Semver", op: "developer-semantic-version-calculator" },
      { key: "mock", label: "API / webhook fixtures", op: "developer-api-mock-response-generator" },
    ],
  },
  {
    id: "diff-inspect-studio", slug: "diff-inspect-studio", name: "Diff & Inspect Studio",
    description: "Compare text, JSON, and YAML; inspect structure; preview data; and compose up to 16 deterministic local transforms into an inspectable recipe with per-step previews and safety limits.",
    sourceId: "json-diff", icon: "GitCompareArrows", keywords: ["diff", "compare", "inspect", "structure", "preview", "tester", "parser", "yaml diff", "text diff", "pipeline", "recipe", "workflow", "transform", "CyberChef alternative"],
    modes: [
      { key: "text-diff", label: "Text diff", op: "text-diff" }, { key: "json-diff", label: "JSON diff", op: "json-diff" },
      { key: "yaml-diff", label: "YAML diff", op: "yaml-diff" }, { key: "inspect", label: "Structure inspector", op: "json-inspector" },
      { key: "preview", label: "Preview", op: "markdown-preview" }, { key: "test", label: "JSON tester", op: "json-tester" },
      { key: "recipe", label: "Recipe pipeline", op: "developer-recipe-runner" },
    ],
  },
];

export function makeDeveloperStudioTools(allTools: ToolMeta[]): ToolMeta[] {
  const byId = new Map(allTools.map((tool) => [tool.id, tool]));
  return DEVELOPER_STUDIOS.flatMap((studio) => {
    const source = byId.get(studio.sourceId);
    if (!source) return [];
    return [{
      ...source,
      id: studio.id,
      slug: studio.slug,
      name: studio.name,
      description: studio.description,
      icon: studio.icon,
      popularity: 1_000_000 - DEVELOPER_STUDIOS.findIndex((item) => item.id === studio.id),
      featured: true,
      tags: [...new Set([...source.tags, "developer-studio", studio.id])],
      keywords: [...new Set([...source.keywords, ...studio.keywords, "studio", "local", "privacy", "offline"])],
      related: [],
      engine: { type: "developer", op: `developer-studio:${studio.id}` },
    }];
  });
}

export function developerStudioBySlug(slug: string): DeveloperStudioDefinition | undefined {
  return DEVELOPER_STUDIOS.find((studio) => studio.slug === slug || studio.id === slug);
}

/** Family routing keeps long-tail URL aliases inside the closest useful parent Studio. */
export function developerStudioForLegacySlug(rawSlug: string): DeveloperStudioDefinition {
  const slug = rawSlug.toLowerCase().replace(/^developer-/, "");
  const starts = (prefixes: string[]) => prefixes.some((prefix) => slug === prefix || slug.startsWith(`${prefix}-`));
  // Diff is checked before JSON/markup families so cross-format comparisons stay grouped.
  if (["yaml-diff", "text-diff", "csv-diff"].includes(slug) || /^(?:yaml|text|csv|xml|html|css|sql|base64|url|hex|binary|ascii|unicode|uuid|jwt|regex)-diff$/.test(slug)) return DEVELOPER_STUDIOS[11];
  if (starts(["jwt"])) return DEVELOPER_STUDIOS[1];
  if (starts(["regex"])) return DEVELOPER_STUDIOS[2];
  if (starts(["hash", "md5", "file-hash", "sha1", "sha256", "sha384", "sha512"]) || /^sha(?:1|256|384|512)-hash$/.test(slug)) return DEVELOPER_STUDIOS[3];
  if (starts(["query-string", "url-query", "cookie", "cors", "csp", "ip-header", "status-code", "user-agent", "content-type", "mime", "http"])) return DEVELOPER_STUDIOS[9];
  if (starts(["base64", "url", "uri", "hex", "binary", "ascii", "unicode", "data-uri"]) || /^(?:json-decoder|json-encoder)$/.test(slug) || /^(?:html-decoder|html-encoder)$/.test(slug)) return DEVELOPER_STUDIOS[4];
  if (starts(["cron", "unix-timestamp", "timestamp", "epoch"])) return DEVELOPER_STUDIOS[5];
  if (starts(["uuid"])) return DEVELOPER_STUDIOS[6];
  if (starts(["sql"])) return DEVELOPER_STUDIOS[7];
  if (starts(["csv"])) return DEVELOPER_STUDIOS[0];
  if (starts(["json", "dummy-json"])) return DEVELOPER_STUDIOS[0];
  if (starts(["html", "css", "javascript", "typescript", "xml", "svg", "yaml", "markdown", "lorem-ipsum"]) || slug === "markdown-to-html") return DEVELOPER_STUDIOS[8];
  if (starts(["developer-gitignore", "gitignore", "git", "docker", "dockerfile", "kubernetes", "nginx", "openapi", "graphql", "license", "readme", "editorconfig", "environment-variable", "semantic-version", "branch-name", "commit-message", "changelog", "webhook", "api-mock", "sql-query-builder", "sql-schema-generator"])) return DEVELOPER_STUDIOS[10];
  if (/-diff$/.test(slug) || /-(inspector|parser|preview|tester|explainer)$/.test(slug)) return DEVELOPER_STUDIOS[11];
  return DEVELOPER_STUDIOS[11];
}

/** Translate every legacy URL into a visible Studio mode rather than an unrelated first tab. */
export function developerModeForLegacySlug(studio: DeveloperStudioDefinition, rawSlug: string): string {
  const slug = rawSlug.toLowerCase().replace(/^developer-/, "");
  if (studio.id === "json-studio") {
    if (slug.startsWith("csv-")) return "csv";
    if (slug.includes("diff")) return "diff";
    if (slug.includes("path") || slug.includes("query")) return "path";
    if (slug.includes("inspector") || slug.includes("parser") || slug.includes("tree") || slug.includes("preview")) return "tree";
    if (slug.includes("schema")) return "schema";
    if (slug.includes("to-csv") || slug.includes("csv")) return "convert";
    if (slug.includes("validator") || slug.includes("tester")) return "validate";
    if (slug.includes("minifier")) return "minify";
    return "format";
  }
  if (studio.id === "jwt-studio") {
    if (slug.includes("expiration") || slug.includes("expiry") || slug.includes("exp-check")) return "expiration";
    if (slug.includes("payload") || slug.includes("builder")) return "payload";
    if (slug.includes("inspector") || slug.includes("claims")) return "claims";
    return "decode";
  }
  if (studio.id === "regex-studio") {
    if (slug.includes("replace")) return "replace";
    if (slug.includes("explain")) return "explain";
    return "match";
  }
  if (studio.id === "hash-studio") {
    if (slug.includes("file-hash") || slug.includes("file-hasher")) return "file";
    if (slug.includes("compare")) return "compare";
    return "hash";
  }
  if (studio.id === "encoding-studio") {
    if (slug.includes("base64") || slug === "json-decoder" || slug === "json-encoder") return "base64";
    if (slug.includes("data-uri")) return "data-uri";
    if (slug.includes("hex")) return "hex";
    if (slug.includes("binary")) return "binary";
    if (slug.includes("ascii")) return "ascii";
    if (slug.includes("unicode")) return "unicode";
    if (slug.startsWith("html-")) return "html";
    return "url";
  }
  if (studio.id === "time-cron-studio") {
    if (slug.includes("timestamp") || slug.includes("epoch")) return "timestamp";
    if (slug.includes("generator") || slug.includes("preset")) return "presets";
    if (slug.includes("explain")) return "explain";
    return "next-runs";
  }
  if (studio.id === "uuid-studio") return /validator|tester/.test(slug) ? "validate" : "generate";
  if (studio.id === "sql-studio") {
    if (slug.includes("query-builder")) return "query";
    if (slug.includes("schema-generator")) return "schema";
    if (slug.includes("minifier")) return "minify";
    if (slug.includes("parser") || slug.includes("validator") || slug.includes("tester")) return "parse";
    return "format";
  }
  if (studio.id === "markup-studio") {
    if (slug.startsWith("css-")) return "css";
    if (slug.startsWith("javascript-") || slug.startsWith("typescript-")) return "javascript";
    if (slug.startsWith("xml-") || slug.startsWith("svg-")) return "xml";
    if (slug.startsWith("yaml-")) return "yaml";
    if (slug.startsWith("lorem-ipsum")) return "samples";
    if (slug.startsWith("markdown")) return "markdown";
    return "html";
  }
  if (studio.id === "http-api-studio") {
    if (slug.includes("query")) return "query";
    if (slug.includes("mime") || slug.includes("content-type")) return "mime";
    if (slug.includes("cors")) return "cors";
    if (slug.includes("csp")) return "csp";
    if (slug.includes("cookie")) return "cookies";
    if (slug.includes("user-agent")) return "user-agent";
    if (slug.includes("header")) return "headers";
    return "status";
  }
  if (studio.id === "devops-studio") {
    if (slug.includes("dockerfile")) return "dockerfile";
    if (slug.includes("docker-compose") || slug.includes("compose")) return "compose";
    if (slug.includes("nginx")) return "nginx";
    if (slug.includes("editorconfig")) return "editorconfig";
    if (slug.includes("environment") || slug.includes("\.env")) return "env";
    if (slug.includes("openapi")) return "openapi";
    if (slug.includes("graphql")) return "graphql";
    if (slug.includes("license")) return "license";
    if (slug.includes("readme")) return "readme";
    if (slug.includes("commit")) return "commit";
    if (slug.includes("branch")) return "branch";
    if (slug.includes("changelog")) return "changelog";
    if (slug.includes("semantic-version") || slug.includes("semver")) return "semver";
    if (slug.includes("api-mock") || slug.includes("webhook")) return "mock";
    return "gitignore";
  }
  if (studio.id === "diff-inspect-studio") {
    if (slug.startsWith("json-")) return slug.includes("diff") ? "json-diff" : /inspector|parser|preview|tester|explainer/.test(slug) ? "inspect" : "text-diff";
    if (slug.startsWith("yaml-")) return "yaml-diff";
    if (slug.startsWith("csv-")) return "text-diff";
    if (slug.startsWith("markdown")) return "preview";
    if (slug.includes("inspector") || slug.includes("parser") || slug.includes("tester")) return "inspect";
    return "text-diff";
  }
  return studio.modes[0]?.key ?? "format";
}

/** An encoding legacy URL should open the matching encode or decode operation. */
export function developerActionForLegacySlug(studio: DeveloperStudioDefinition, rawSlug: string): "encode" | "decode" {
  if (studio.id !== "encoding-studio") return "encode";
  return /-(?:decoder|decoding)$/.test(rawSlug.toLowerCase()) || rawSlug.toLowerCase().includes("data-uri-decoder") ? "decode" : "encode";
}
