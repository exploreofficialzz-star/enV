/**
 * Parser-backed, on-device formatter adapters for the Web edition.
 *
 * Important boundaries:
 * - This module never uses fetch/XHR and never sends source text to a service.
 * - All inputs are capped before invoking parser libraries.
 * - A formatter is not a schema validator, compiler, security scanner, or semantic-equivalence proof.
 * - sql-formatter uses dialect-aware SQL token/grammar rules for layout; stored procedures and
 *   non-standard statement delimiters are outside its documented support.
 */

export type StructuredFormatter = "css" | "html" | "xml" | "yaml" | "markdown" | "graphql";

const MAX_FORMAT_INPUT_CHARS = 1_000_000;

function checkedInput(input: string, language: string): string {
  if (!input.trim()) throw new Error(`Paste ${language} input before formatting.`);
  if (input.length > MAX_FORMAT_INPUT_CHARS) {
    throw new Error(`${language} formatter input exceeds the 1 MB local formatting limit.`);
  }
  return input;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/\s+/g, " ").trim();
  return String(error).replace(/\s+/g, " ").trim();
}

function sourceLocation(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const candidate = error as { loc?: { start?: { line?: number; column?: number } }; line?: number; column?: number; location?: { start?: { line?: number; column?: number } } };
  const line = candidate.loc?.start?.line ?? candidate.location?.start?.line ?? candidate.line;
  const column = candidate.loc?.start?.column ?? candidate.location?.start?.column ?? candidate.column;
  return Number.isInteger(line) && Number(line) > 0
    ? ` at line ${line}${Number.isInteger(column) && Number(column) >= 0 ? `, column ${Number(column) + 1}` : ""}`
    : "";
}

/** Format SQL with the maintained sql-formatter dialect parser, entirely locally. */
export async function formatSqlWithDialect(input: string, dialectRaw = "postgresql"): Promise<string> {
  checkedInput(input, "SQL");
  const raw = dialectRaw.trim().toLowerCase() || "sql";
  const dialectAliases: Record<string, string> = {
    generic: "sql",
    standard: "sql",
    tsql: "transactsql",
    "sql-server": "transactsql",
    sqlserver: "transactsql",
    oracle: "plsql",
    "pl/sql": "plsql",
  };
  const language = dialectAliases[raw] ?? raw;
  const supported = new Set([
    "sql", "bigquery", "clickhouse", "db2", "duckdb", "hive", "mariadb", "mysql", "tidb",
    "n1ql", "plsql", "postgresql", "redshift", "singlestoredb", "snowflake", "spark", "sqlite", "transactsql", "trino",
  ]);
  if (!supported.has(language)) {
    throw new Error(`Unsupported SQL dialect '${dialectRaw}'. Choose a dialect supported by the local SQL formatter: ${[...supported].join(", ")}.`);
  }

  try {
    const sqlFormatter = await import("sql-formatter");
    const format = sqlFormatter.format as unknown as (query: string, options: Record<string, unknown>) => string;
    const formatted = format(input, {
      language,
      tabWidth: 2,
      useTabs: false,
      keywordCase: "upper",
      dataTypeCase: "upper",
      functionCase: "upper",
      expressionWidth: 80,
      linesBetweenQueries: 1,
    });
    if (!formatted.trim()) throw new Error("The SQL formatter returned empty output for non-empty input.");
    return `${formatted.trimEnd()}\n\nFormatter: sql-formatter 15.9.0, dialect '${language}' (local processing). This formats query layout; it does not validate database schema, authorize operations, or execute SQL. Stored procedures and custom statement delimiters may be unsupported.`;
  } catch (error) {
    const message = messageOf(error);
    if (message.startsWith("Unsupported SQL dialect") || message.includes("exceeds the 1 MB") || message.includes("returned empty output")) throw error;
    throw new Error(`SQL parser/formatter could not format this ${language} input${sourceLocation(error)}: ${message}. Check the selected dialect and query syntax; the query was not executed.`);
  }
}


/**
 * XML is not one of Prettier standalone's built-in parser plugins. Before using its HTML printer
 * for XML layout, perform a conservative local structure preflight (nesting, one root, quoting,
 * entities, comments/CDATA/PI and basic attribute grammar). This is not a complete XML 1.0 parser,
 * and does not claim namespace, DTD, schema, or all Unicode-name conformance.
 */
function preflightXmlStructure(input: string): void {
  const stack: string[] = [];
  let i = 0;
  let rootCount = 0;
  const checkEntities = (value: string, context: string) => {
    if (/&(?!#(?:[0-9]+|[xX][0-9A-Fa-f]+);|amp;|lt;|gt;|apos;|quot;)/.test(value)) {
      throw new Error(`XML contains an undeclared or unterminated entity reference in ${context}.`);
    }
  };
  const nextTagEnd = (start: number, bracketAware = false): number => {
    let quote = '';
    let subsetDepth = 0;
    for (let at = start; at < input.length; at += 1) {
      const ch = input[at];
      if (quote) { if (ch === quote) quote = ''; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (bracketAware && ch === '[') subsetDepth += 1;
      else if (bracketAware && ch === ']') subsetDepth = Math.max(0, subsetDepth - 1);
      else if (ch === '>' && subsetDepth === 0) return at;
    }
    throw new Error('XML contains a tag or declaration without a closing delimiter.');
  };
  while (i < input.length) {
    if (input[i] !== '<') {
      const end = input.indexOf('<', i);
      const stop = end < 0 ? input.length : end;
      const text = input.slice(i, stop);
      checkEntities(text, 'text');
      if (stack.length === 0 && text.trim()) throw new Error('XML has non-whitespace text outside its single root element.');
      i = stop;
      continue;
    }
    if (input.startsWith('<!--', i)) {
      const end = input.indexOf('-->', i + 4);
      if (end < 0) throw new Error('XML contains an unterminated comment.');
      if (input.slice(i + 4, end).includes('--')) throw new Error('XML comments cannot contain a double hyphen.');
      i = end + 3;
      continue;
    }
    if (input.startsWith('<![CDATA[', i)) {
      if (stack.length === 0) throw new Error('XML CDATA sections must appear inside the root element.');
      const end = input.indexOf(']]>', i + 9);
      if (end < 0) throw new Error('XML contains an unterminated CDATA section.');
      i = end + 3;
      continue;
    }
    if (input.startsWith('<?', i)) {
      const end = input.indexOf('?>', i + 2);
      if (end < 0) throw new Error('XML contains an unterminated processing instruction.');
      i = end + 2;
      continue;
    }
    if (/^<!DOCTYPE\b/i.test(input.slice(i, i + 10))) {
      throw new Error('XML DOCTYPE declarations are disabled in the local formatter to avoid external entity and DTD processing.');
    }
    if (input.startsWith('<!', i)) throw new Error('XML contains an unsupported or malformed declaration.');
    const end = nextTagEnd(i + 1);
    const rawTag = input.slice(i + 1, end);
    if (rawTag.startsWith('/')) {
      const close = /^\/([A-Za-z_:][A-Za-z0-9._:-]*)\s*$/.exec(rawTag);
      if (!close) throw new Error('XML contains a malformed closing tag.');
      const expected = stack.pop();
      if (expected !== close[1]) throw new Error(`XML closing tag </${close[1]}> does not match ${expected ? `<${expected}>` : 'an open element'}.`);
      i = end + 1;
      continue;
    }
    const open = /^([A-Za-z_:][A-Za-z0-9._:-]*)([\s\S]*)$/.exec(rawTag);
    if (!open) throw new Error('XML contains a malformed element name or start tag.');
    const name = open[1];
    let rest = open[2];
    const selfClosing = /\/\s*$/.test(rest);
    if (selfClosing) rest = rest.replace(/\/\s*$/, '');
    const attributes = new Set<string>();
    while (rest.trim()) {
      const attr = /^\s+([A-Za-z_:][A-Za-z0-9._:-]*)\s*=\s*("[^"<>]*"|'[^'<>]*')/.exec(rest);
      if (!attr) throw new Error(`XML start tag <${name}> contains an invalid attribute or an unquoted attribute value.`);
      const attrName = attr[1];
      if (attributes.has(attrName)) throw new Error(`XML start tag <${name}> contains duplicate attribute '${attrName}'.`);
      attributes.add(attrName);
      checkEntities(attr[2].slice(1, -1), `attribute '${attrName}'`);
      rest = rest.slice(attr[0].length);
    }
    if (stack.length === 0) {
      rootCount += 1;
      if (rootCount > 1) throw new Error('XML documents must contain exactly one root element.');
    }
    if (!selfClosing) stack.push(name);
    i = end + 1;
  }
  if (stack.length) throw new Error(`XML element <${stack[stack.length - 1]}> is not closed.`);
  if (rootCount !== 1) throw new Error('XML must contain exactly one root element.');
}

const PRETTIER_PARSER_MAP: Record<StructuredFormatter, string> = {
  css: "css",
  html: "html",
  xml: "html",
  yaml: "yaml",
  markdown: "markdown",
  graphql: "graphql",
};

/** Format supported structured languages with locally bundled Prettier standalone plugins. */
export async function formatStructuredWithParser(input: string, language: StructuredFormatter): Promise<string> {
  checkedInput(input, language.toUpperCase());
  try {
    if (language === "xml") preflightXmlStructure(input);
    const prettier = await import("prettier/standalone");
    // Dynamic import keeps specialist parsers out of the initial toolkit bundle. They are still
    // bundled with the application and loaded from the same origin; no CDN or remote execution.
    const pluginMap = {
      css: () => import("prettier/plugins/postcss"),
      html: () => import("prettier/plugins/html"),
      // XML well-formedness is checked above; Prettier's standalone HTML printer supplies layout.
      // Keep this explicit rather than depending on a plugin export that may not be built in.
      xml: () => import("prettier/plugins/html"),
      yaml: () => import("prettier/plugins/yaml"),
      markdown: () => import("prettier/plugins/markdown"),
      graphql: () => import("prettier/plugins/graphql"),
    } as const;
    const plugin = await pluginMap[language]();
    const format = prettier.format as unknown as (source: string, options: Record<string, unknown>) => Promise<string>;
    const formatted = await format(input, {
      parser: PRETTIER_PARSER_MAP[language],
      plugins: [plugin],
      tabWidth: 2,
      useTabs: false,
      printWidth: 100,
      endOfLine: "lf",
    });
    if (!formatted.trim()) throw new Error("The parser returned empty output for non-empty input.");
    const method = language === "xml" ? "conservative XML structure preflight + Prettier standalone HTML printer" : `Prettier standalone ${language} parser`;
    const limitation = language === "xml" ? " XML output is not guaranteed to satisfy every XML 1.0/namespace/schema rule." : " Formatting is not full application/schema validation.";
    return `${formatted.trimEnd()}\n\nFormatter: ${method} (bundled, local-only).${limitation}`;
  } catch (error) {
    const message = messageOf(error);
    if (message.includes("exceeds the 1 MB") || message.includes("returned empty output")) throw error;
    const formatterName = language === "xml" ? "XML structural preflight/HTML printer" : `${language.toUpperCase()} parser`;
    throw new Error(`${formatterName} could not format the input${sourceLocation(error)}: ${message}. The input was not uploaded or executed.`);
  }
}

export async function formatWithGrammarDirect(input: string, language: "sql" | StructuredFormatter, dialect = "sql"): Promise<string> {
  return language === "sql" ? formatSqlWithDialect(input, dialect) : formatStructuredWithParser(input, language);
}

/**
 * Browser calls run inside a disposable same-origin Worker. A timeout terminates the whole
 * worker, so an unexpectedly expensive or malformed parser input cannot permanently pin the UI.
 * Node/unit-test callers invoke the exact same parser function directly.
 */
export async function formatWithGrammar(input: string, language: "sql" | StructuredFormatter, dialect = "sql"): Promise<string> {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return formatWithGrammarDirect(input, language, dialect);
  }
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, result?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error);
      else resolve(result ?? "");
    };
    const worker = new Worker(new URL("./precise-formatters.worker.ts", import.meta.url), { type: "module", name: "enV-local-formatter" });
    const timer = setTimeout(() => finish(new Error("Local formatter exceeded its 8-second execution budget. The formatter worker was terminated; reduce input size or simplify the document.")), 8_000);
    worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: string; error?: string }>) => {
      if (event.data?.ok && typeof event.data.result === "string") finish(undefined, event.data.result);
      else finish(new Error(event.data?.error || "Local formatter worker failed without a diagnostic."));
    };
    worker.onerror = (event) => finish(new Error(`Local formatter worker failed: ${event.message || "unknown worker error"}`));
    worker.onmessageerror = () => finish(new Error("The local formatter worker returned an unreadable message."));
    worker.postMessage({ language, input, dialect });
  });
}
