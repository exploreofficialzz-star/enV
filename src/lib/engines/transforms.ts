const SMALL_WORDS = new Set(["a", "an", "the", "and", "or", "of", "in", "on", "to"]);

function opt(opts: Record<string, string> | undefined, key: string, fallback = ""): string {
  return opts?.[key] ?? fallback;
}

function splitWords(input: string): string[] {
  return input
    .replace(/['’]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function capitalize(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCase(input: string): string {
  const words = input.split(/(\s+)/);
  const tokens = words.filter((w) => !/^\s+$/.test(w));
  let tokenIndex = 0;
  const lastIndex = tokens.length - 1;
  return words
    .map((chunk) => {
      if (/^\s+$/.test(chunk)) return chunk;
      const lower = chunk.toLowerCase();
      const isEdge = tokenIndex === 0 || tokenIndex === lastIndex;
      tokenIndex += 1;
      const bare = lower.replace(/[^a-z0-9]/gi, "");
      if (!isEdge && SMALL_WORDS.has(bare)) {
        return chunk.replace(/[A-Za-z]+/g, (m) => m.toLowerCase());
      }
      return chunk.replace(/[A-Za-z0-9]+/g, (m) => capitalize(m));
    })
    .join("");
}

function sentenceCase(input: string): string {
  const lower = input.toLowerCase();
  return lower.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
}

function camelCase(input: string): string {
  const words = splitWords(input);
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : capitalize(w)))
    .join("");
}

function snakeCase(input: string): string {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join("_");
}

function kebabCase(input: string): string {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join("-");
}

function slug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function reverseText(input: string): string {
  return Array.from(input).reverse().join("");
}

function trimSpaces(input: string): string {
  return input.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function unwrap(input: string): string {
  return input.replace(/[ \t]*\n[ \t]*/g, " ").replace(/ +/g, " ").trim();
}

function sortLines(input: string): string {
  const lines = input.split(/\r?\n/);
  const trailing = lines.length > 0 && lines[lines.length - 1] === "";
  const body = trailing ? lines.slice(0, -1) : lines;
  body.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
  return trailing ? `${body.join("\n")}\n` : body.join("\n");
}

function dedupeLines(input: string): string {
  const lines = input.split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out.join("\n");
}

function findReplace(input: string, opts?: Record<string, string>): string {
  const find = opt(opts, "find");
  const replace = opt(opts, "replace");
  const flags = opt(opts, "flags", "g");
  if (!find) return input;
  try {
    const re = new RegExp(find, flags.includes("g") ? flags : `${flags}g`);
    return input.replace(re, replace);
  } catch {
    return input.split(find).join(replace);
  }
}

function wrap(input: string, opts?: Record<string, string>): string {
  const width = Math.max(8, Number(opt(opts, "width", "80")) || 80);
  const paragraphs = input.split(/\r?\n/);
  return paragraphs
    .map((para) => {
      if (!para.trim()) return para;
      const words = para.split(/\s+/);
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        if (!current) {
          current = word;
          continue;
        }
        if (current.length + 1 + word.length <= width) {
          current += ` ${word}`;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      return lines.join("\n");
    })
    .join("\n");
}

function wordFreq(input: string): string {
  const counts = new Map<string, number>();
  for (const raw of input.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/gi) ?? []) {
    const word = raw.toLowerCase();
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word, n]) => `${word}\t${n}`)
    .join("\n");
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

function uniqueMatches(input: string, re: RegExp): string {
  const found = input.match(re) ?? [];
  return [...new Set(found.map((s) => s.replace(/[),.;]+$/, "")))].join("\n");
}

function listify(input: string, opts?: Record<string, string>): string {
  const style = opt(opts, "style", "bullets");
  const items = input
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (style === "numbered") return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
  if (style === "comma") return items.join(", ");
  return items.map((item) => `- ${item}`).join("\n");
}

const SQL_BREAK =
  /\b(SELECT|FROM|WHERE|AND|OR|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|UNION ALL|UNION)\b/gi;

function sqlFormat(input: string): string {
  const compact = input.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact
    .replace(SQL_BREAK, (m) => `\n${m.toUpperCase()}`)
    .replace(/, /g, ",\n  ")
    .trim();
}

function indentMarkup(input: string): string {
  const voidish = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
  const tokens = input
    .replace(/>\s+</g, "><")
    .replace(/(<[^>]+>)/g, "\n$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  let depth = 0;
  const lines: string[] = [];
  for (const token of tokens) {
    const isClose = /^<\//.test(token);
    const isOpen = /^<[^/!?]/.test(token) && !/\/>$/.test(token);
    const name = token.replace(/^<\/?([^\s>/]+).*$/, "$1");
    if (isClose) depth = Math.max(0, depth - 1);
    lines.push(`${"  ".repeat(depth)}${token}`);
    if (isOpen && !voidish.test(name) && !isClose) depth += 1;
  }
  return lines.join("\n");
}

function cssFormat(input: string): string {
  let indent = 0;
  const out: string[] = [];
  const src = input.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  let buf = "";
  const flush = (line: string) => {
    const trimmed = line.trim();
    if (trimmed) out.push(`${"  ".repeat(Math.max(0, indent))}${trimmed}`);
  };
  for (const ch of src) {
    if (ch === "{") {
      flush(`${buf} {`);
      buf = "";
      indent += 1;
    } else if (ch === "}") {
      if (buf.trim()) flush(buf.trim().endsWith(";") ? buf : `${buf};`);
      buf = "";
      indent = Math.max(0, indent - 1);
      out.push(`${"  ".repeat(indent)}}`);
    } else if (ch === ";") {
      flush(`${buf.trim()};`);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) flush(buf);
  return out.join("\n");
}

function jsFormat(input: string): string {
  let indent = 0;
  let out = "";
  let i = 0;
  let inStr: string | null = null;
  let inLine = false;
  let inBlock = false;
  while (i < input.length) {
    const ch = input[i]!;
    const next = input[i + 1];
    if (inLine) {
      out += ch;
      if (ch === "\n") inLine = false;
      i += 1;
      continue;
    }
    if (inBlock) {
      out += ch;
      if (ch === "*" && next === "/") {
        out += "/";
        i += 2;
        inBlock = false;
        continue;
      }
      i += 1;
      continue;
    }
    if (inStr) {
      out += ch;
      if (ch === "\\" && i + 1 < input.length) {
        out += input[i + 1];
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      inStr = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "{") {
      out += " {\n";
      indent += 1;
      out += "  ".repeat(indent);
      i += 1;
      while (input[i] === " " || input[i] === "\n" || input[i] === "\t") i += 1;
      continue;
    }
    if (ch === "}") {
      indent = Math.max(0, indent - 1);
      out = out.replace(/[ \t]*$/, "");
      if (!out.endsWith("\n")) out += "\n";
      out += `${"  ".repeat(indent)}}`;
      i += 1;
      if (input[i] === ";") {
        out += ";";
        i += 1;
      }
      out += "\n" + "  ".repeat(indent);
      while (input[i] === " " || input[i] === "\n" || input[i] === "\t") i += 1;
      continue;
    }
    if (ch === ";") {
      out += ";\n" + "  ".repeat(indent);
      i += 1;
      while (input[i] === " " || input[i] === "\n" || input[i] === "\t") i += 1;
      continue;
    }
    if (ch === "\n") {
      out += "\n" + "  ".repeat(indent);
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function yamlFormat(input: string): string {
  return input
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, "  ").replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlMinify(input: string): string {
  return input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

function cssMinify(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};:,>~+])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function jsMinify(input: string): string {
  let out = "";
  let i = 0;
  let inStr: string | null = null;
  let inLine = false;
  let inBlock = false;
  while (i < input.length) {
    const ch = input[i]!;
    const next = input[i + 1];
    if (inLine) {
      if (ch === "\n") inLine = false;
      i += 1;
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (inStr) {
      out += ch;
      if (ch === "\\" && i + 1 < input.length) {
        out += input[i + 1];
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      inStr = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      const prev = out[out.length - 1] ?? "";
      const nxt = next ?? "";
      if (/[A-Za-z0-9_$]/.test(prev) && /[A-Za-z0-9_$]/.test(nxt)) out += " ";
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out.trim();
}

function parseJson(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Invalid JSON");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("Invalid JSON");
  }
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function jsonToCsv(input: string): string {
  const data = parseJson(input);
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) throw new Error("Empty CSV");
  const objects: Record<string, unknown>[] = rows.map((row) => {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      return row as Record<string, unknown>;
    }
    return { value: row };
  });
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const obj of objects) {
    for (const key of Object.keys(obj)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  const header = keys.map(csvEscape).join(",");
  const body = objects.map((obj) =>
    keys
      .map((key) => {
        const v = obj[key];
        if (v === null || v === undefined) return "";
        if (typeof v === "object") return csvEscape(JSON.stringify(v));
        return csvEscape(String(v));
      })
      .join(","),
  );
  return [header, ...body].join("\n");
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function csvToJson(input: string): string {
  const raw = input.replace(/^\uFEFF/, "").trim();
  if (!raw) throw new Error("Empty CSV");
  const lines: string[] = [];
  let buf = "";
  let quotes = false;
  for (const ch of raw) {
    buf += ch;
    if (ch === '"') quotes = !quotes;
    if (ch === "\n" && !quotes) {
      const line = buf.replace(/\r?\n$/, "");
      if (line.trim()) lines.push(line);
      buf = "";
    }
  }
  if (buf.trim()) lines.push(buf.replace(/\r$/, ""));
  if (lines.length === 0) throw new Error("Empty CSV");
  const headers = parseCsvLine(lines[0]!).map((h) => h.trim());
  if (headers.every((h) => !h) || lines.length < 2) throw new Error("Empty CSV");
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h || `col${i + 1}`] = cells[i] ?? "";
    });
    return obj;
  });
  return JSON.stringify(rows, null, 2);
}

function toYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (value === null) return "null";
  if (typeof value === "string") {
    if (value === "" || /[:#\n&*?|>!%@`'"{}[\],]/.test(value) || value !== value.trim()) {
      return JSON.stringify(value);
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          const inner = toYaml(item, indent + 1);
          const [first, ...rest] = inner.split("\n");
          return `${pad}- ${first}\n${rest.map((r) => `${r}`).join("\n")}`.replace(/\n$/, "");
        }
        return `${pad}- ${toYaml(item, 0)}`;
      })
      .join("\n");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries
      .map(([k, v]) => {
        const key = /^[A-Za-z_][\w-]*$/.test(k) ? k : JSON.stringify(k);
        if (v && typeof v === "object") {
          const inner = toYaml(v, indent + 1);
          if (inner === "{}" || inner === "[]") return `${pad}${key}: ${inner}`;
          return `${pad}${key}:\n${inner}`;
        }
        return `${pad}${key}: ${toYaml(v, 0)}`;
      })
      .join("\n");
  }
  return JSON.stringify(value);
}

function jsonToYaml(input: string): string {
  return toYaml(parseJson(input)).trim();
}

function parseSimpleYaml(text: string): unknown {
  const lines = text.replace(/\t/g, "  ").split(/\r?\n/);
  type Frame = { indent: number; value: unknown };
  const root: Frame = { indent: -2, value: null };
  const stack: Frame[] = [root];

  const assign = (parent: Frame, key: string | null, val: unknown) => {
    if (key === null) {
      if (!Array.isArray(parent.value)) parent.value = [];
      (parent.value as unknown[]).push(val);
    } else {
      if (!parent.value || typeof parent.value !== "object" || Array.isArray(parent.value)) {
        parent.value = {};
      }
      (parent.value as Record<string, unknown>)[key] = val;
    }
  };

  const parseScalar = (raw: string): unknown => {
    const s = raw.trim();
    if (!s || s === "~" || s === "null") return null;
    if (s === "true") return true;
    if (s === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  };

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    const line = rawLine.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) stack.pop();
    const parent = stack[stack.length - 1]!;
    if (line.startsWith("- ")) {
      const rest = line.slice(2);
      const colon = rest.indexOf(":");
      if (colon > 0 && !rest.startsWith("{")) {
        const k = rest.slice(0, colon).trim();
        const v = rest.slice(colon + 1).trim();
        const obj: Record<string, unknown> = {};
        if (v) obj[k] = parseScalar(v);
        assign(parent, null, obj);
        const frame: Frame = { indent, value: obj };
        stack.push(frame);
        if (!v) {
          /* nested */
        }
      } else {
        assign(parent, null, parseScalar(rest));
      }
    } else {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const k = line.slice(0, colon).trim();
      const v = line.slice(colon + 1).trim();
      if (!v) {
        const obj: Record<string, unknown> = {};
        assign(parent, k, obj);
        stack.push({ indent, value: obj });
      } else if (v === "|" || v === ">") {
        assign(parent, k, "");
      } else {
        assign(parent, k, parseScalar(v));
      }
    }
  }
  return root.value;
}

function yamlToJson(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Invalid YAML");
  try {
    const parsed = parseSimpleYaml(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch {
    throw new Error("Invalid YAML");
  }
}

function jsonToXml(input: string): string {
  const data = parseJson(input);
  const emit = (node: unknown, tag = "root"): string => {
    if (node === null || node === undefined) return `<${tag} />`;
    if (Array.isArray(node)) {
      return node.map((item) => emit(item, tag === "root" ? "item" : tag)).join("");
    }
    if (typeof node === "object") {
      const body = Object.entries(node as Record<string, unknown>)
        .map(([k, v]) => emit(v, k.replace(/[^\w:-]/g, "_")))
        .join("");
      return `<${tag}>${body}</${tag}>`;
    }
    const text = String(node)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<${tag}>${text}</${tag}>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${indentMarkup(emit(data))}`;
}

function xmlToJson(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Invalid XML");
  const parseElem = (xml: string): unknown => {
    const obj: Record<string, unknown> = {};
    const re = /<([A-Za-z_][\w:.-]*)([^>]*)>([\s\S]*?)<\/\1>|<([A-Za-z_][\w:.-]*)[^>]*\/>/g;
    let match: RegExpExecArray | null;
    let found = false;
    while ((match = re.exec(xml))) {
      found = true;
      const name = match[1] ?? match[4] ?? "item";
      const inner = match[3];
      const value = inner === undefined ? null : parseElem(inner);
      if (name in obj) {
        const prev = obj[name];
        obj[name] = Array.isArray(prev) ? [...prev, value] : [prev, value];
      } else {
        obj[name] = value;
      }
    }
    if (!found) {
      const text = xml.replace(/<\?[\s\S]*?\?>/g, "").trim();
      return text;
    }
    return obj;
  };
  try {
    const parsed = parseElem(trimmed.replace(/<\?xml[\s\S]*?\?>/, ""));
    return JSON.stringify(parsed, null, 2);
  } catch {
    throw new Error("Invalid XML");
  }
}

function keywordDensity(input: string, opts?: Record<string, string>): string {
  const keyword = opt(opts, "keyword").trim().toLowerCase();
  const words = (input.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter(Boolean);
  const total = words.length;
  if (!keyword) {
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([w, n]) => `${w}\t${n}\t${total ? ((n / total) * 100).toFixed(2) : "0.00"}%`)
      .join("\n");
  }
  const parts = keyword.split(/\s+/).filter(Boolean);
  let count = 0;
  if (parts.length <= 1) {
    count = words.filter((w) => w === keyword).length;
  } else {
    const hay = words.join(" ");
    const needle = parts.join(" ");
    let idx = 0;
    while (idx <= hay.length) {
      const at = hay.indexOf(needle, idx);
      if (at < 0) break;
      count += 1;
      idx = at + needle.length;
    }
  }
  const density = total ? (count / total) * 100 : 0;
  return [
    `keyword\t${keyword}`,
    `count\t${count}`,
    `words\t${total}`,
    `density\t${density.toFixed(3)}%`,
  ].join("\n");
}

export const transforms: Record<string, (input: string, opts?: Record<string, string>) => string> = {
  uppercase: (input) => input.toUpperCase(),
  lowercase: (input) => input.toLowerCase(),
  "title-case": titleCase,
  "sentence-case": sentenceCase,
  "camel-case": camelCase,
  "snake-case": snakeCase,
  "kebab-case": kebabCase,
  slug,
  reverse: reverseText,
  "trim-spaces": trimSpaces,
  unwrap,
  "sort-lines": sortLines,
  "dedupe-lines": dedupeLines,
  "find-replace": findReplace,
  wrap,
  "word-freq": wordFreq,
  "extract-emails": (input) => uniqueMatches(input, EMAIL_RE),
  "extract-urls": (input) => uniqueMatches(input, URL_RE),
  list: listify,
  "sql-format": sqlFormat,
  "html-format": indentMarkup,
  "css-format": cssFormat,
  "js-format": jsFormat,
  "xml-format": indentMarkup,
  "yaml-format": yamlFormat,
  "html-minify": htmlMinify,
  "css-minify": cssMinify,
  "js-minify": jsMinify,
  "json-to-csv": jsonToCsv,
  "csv-to-json": csvToJson,
  "json-to-yaml": jsonToYaml,
  "yaml-to-json": yamlToJson,
  "json-to-xml": jsonToXml,
  "xml-to-json": xmlToJson,
  "keyword-density": keywordDensity,
};
