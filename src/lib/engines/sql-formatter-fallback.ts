/** Bounded, token-aware SQL layout fallback. It never executes SQL. */
export function formatSqlFallback(input: string, dialectRaw = "sql"): string {
  const dialectAliases: Record<string, string> = { standard: "sql", generic: "sql", tsql: "transactsql", sqlserver: "transactsql", "sql-server": "transactsql", plsql: "oracle", "pl/sql": "oracle" };
  const dialect = dialectAliases[dialectRaw.trim().toLowerCase()] ?? (dialectRaw.trim().toLowerCase() || "sql");
  const supported = new Set(["sql", "postgresql", "mysql", "mariadb", "sqlite", "transactsql", "bigquery", "snowflake", "oracle", "plsql", "redshift", "duckdb"]);
  if (!supported.has(dialect)) throw new Error(`Unsupported fallback SQL dialect '${dialectRaw}'. Choose one of: ${[...supported].join(", ")}.`);
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

