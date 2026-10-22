import test from "node:test";
import assert from "node:assert/strict";
import { cronNextRuns, parseCron, hashText, runDeveloperStudio, validateJsonDetailed } from "./developer-studios.ts";
import { developerStudioGolden } from "./developer-studio-golden.ts";
import { generateHtmlProject, generateReactProject, generateKotlinProject, generateSwiftProject } from "./ux-ui-studio-codegen.ts";

const fixedNow = new Date("2026-01-01T00:00:00.000Z");

test("JSON Studio validates strict JSON and reports line, column, and structural path", async () => {
  assert.match(validateJsonDetailed('{"name":"enV","items":[1,true,null]}'), /^Valid JSON/);
  await assert.rejects(runDeveloperStudio("json-validator", '{\n  "items": [1, ]\n}'), /line 2, column .*path \$\.items/);
  await assert.rejects(runDeveloperStudio("json-validator", "{"), /Invalid JSON at line 1, column 2, path \$/);
});

test("JSON path query resolves properties and array indices", async () => {
  assert.equal(await runDeveloperStudio("json-path-query", '{"items":[{"id":1},{"id":2}]}', "$.items[1].id"), "2");
  await assert.rejects(runDeveloperStudio("json-path-query", '{"items":[]}', "$.items[9]"), /did not match/);
});

test("Cron Studio validates five fields and returns predictable UTC next runs", () => {
  const parsed = cronNextRuns("*/30 * * * *", 3, fixedNow);
  assert.equal(parsed.normalized, "*/30 * * * *");
  assert.equal(parsed.runs.length, 3);
  assert.deepEqual(parsed.runs.map((r) => r.utc), ["2026-01-01T00:30:00.000Z", "2026-01-01T01:00:00.000Z", "2026-01-01T01:30:00.000Z"]);
  assert.throws(() => cronNextRuns("60 * * * *", 2, fixedNow), /from 0 through 59/);
  assert.throws(() => cronNextRuns("* * * *", 2, fixedNow), /exactly five cron fields/);
});

test("Cron wildcard-step semantics are explicit and do not overstate every-day schedules", async () => {
  const parsed = parseCron("0 0 */2 * MON");
  assert.equal(parsed.fields.dayOfMonth.any, false, "*/2 is not the same human explanation as exactly *");
  assert.equal(parsed.fields.dayOfMonth.wildcard, true, "leading wildcard is tracked for Vixie-style DOM/DOW matching");
  const report = JSON.parse((await runDeveloperStudio("cron-parser", "0 0 */2 * MON", "", "g", fixedNow))!);
  assert.match(report.explanation, /Vixie-style wildcard semantics/i);
  assert.match(report.explanation, /Monday/);
  assert.ok(report.upcomingRuns.length > 0);
});

test("Hash Studio matches established MD5 and SHA-256 golden vectors", async () => {
  const md5 = JSON.parse(await hashText("hello", ["MD5"]));
  const sha = JSON.parse(await hashText("hello", ["SHA-256"]));
  assert.equal(md5.hashes[0].digest, "5d41402abc4b2a76b9719d911017c592");
  assert.equal(sha.hashes[0].digest, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

test("encoding families use UTF-8 bytes and reject malformed data", async () => {
  assert.equal(await runDeveloperStudio("hex-encoder", "Hi"), "48 69");
  assert.equal(await runDeveloperStudio("hex-decoder", "48 69"), "Hi");
  assert.equal(await runDeveloperStudio("binary-encoder", "Hi"), "01001000 01101001");
  assert.equal(await runDeveloperStudio("binary-decoder", "01001000 01101001"), "Hi");
  assert.equal(await runDeveloperStudio("ascii-encoder", "Hi"), "72 105");
  assert.equal(await runDeveloperStudio("ascii-decoder", "72 105"), "Hi");
  await assert.rejects(runDeveloperStudio("hex-decoder", "0x0"), /even number/);
  await assert.rejects(runDeveloperStudio("ascii-encoder", "🚀"), /ASCII only/);
});

test("JWT Studio explicitly never claims signature verification and annotates registered claims", async () => {
  const token = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJleGFtcGxlIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjQxMDI0NDQ4MDB9.";
  const parsed = JSON.parse((await runDeveloperStudio("jwt-decoder", token))!);
  assert.equal(parsed.signaturePresent, false);
  assert.equal(parsed.signatureVerified, false);
  assert.match(parsed.warning, /signature not verified/i);
  assert.equal(parsed.payload.sub, "example");
  assert.ok(parsed.claims.iat.iso);
});

test("JWT decode handles out-of-range timestamps without losing the decode report", async () => {
  const token = "eyJhbGciOiJub25lIn0.eyJleHAiOjFlKzEwMCwiaWF0Ijo5OTk5OTk5OTk5fQ.";
  const parsed = JSON.parse((await runDeveloperStudio("jwt-decoder", token))!);
  assert.equal(parsed.signatureVerified, false);
  assert.equal(parsed.claims.exp.status, "out-of-range");
  assert.equal(parsed.claims.exp.iso, null);
  assert.equal(parsed.claims.iat.status, "issued-in-the-future");
  assert.match(parsed.warning, /DECODE ONLY/i);
});

test("HTTP status and query tools preserve useful structured results", async () => {
  assert.match((await runDeveloperStudio("http-status-lookup", "418"))!, /^418 I'm a teapot/);
  const query = JSON.parse((await runDeveloperStudio("url-query-parser", "tag=a&tag=b&empty="))!);
  assert.equal(query.count, 3);
  assert.deepEqual(query.grouped.tag, ["a", "b"]);
  assert.equal(await runDeveloperStudio("url-query-builder", '{"q":"hello world","tag":["a","b"]}'), "q=hello+world&tag=a&tag=b");
});

test("DevOps generators return useful copy-ready templates", async () => {
  assert.match((await runDeveloperStudio("developer-gitignore-generator", "node"))!, /node_modules\//);
  assert.match((await runDeveloperStudio("developer-docker-compose-generator", ""))!, /services:/);
  assert.match((await runDeveloperStudio("developer-openapi-generator", "Example API"))!, /openapi: 3\.1\.0/);
  assert.match((await runDeveloperStudio("developer-readme-generator", "enV"))!, /# enV/);
  assert.match((await runDeveloperStudio("developer-environment-variable-generator", "APP_ENV\nAPI_BASE_URL"))!, /API_BASE_URL=/);
});

test("DevOps Dockerfile stack presets are meaningfully distinct and honest about mobile artifacts", async () => {
  const cases: Array<[string, RegExp]> = [
    ["node", /FROM node:22-alpine/], ["python", /FROM python:3\.12-slim/],
    ["go", /FROM golang:/], ["java", /FROM maven:/], ["rust", /FROM rust:/],
    ["swift", /FROM swift:/], ["static", /FROM nginx:/],
    ["android", /Android is a mobile package/], ["generic", /intentionally avoids guessing/],
  ];
  for (const [stack, expected] of cases) {
    const result = await runDeveloperStudio("developer-dockerfile-generator", stack);
    assert.match(result ?? "", expected, `stack preset ${stack} should select its own template`);
  }
  assert.match((await runDeveloperStudio("developer-gitignore-generator", "swift"))!, /DerivedData\//);
  assert.match((await runDeveloperStudio("developer-gitignore-generator", "android"))!, /local\.properties/);
});

test("suffix operations perform domain work instead of echoing generic input stats", async () => {
  const left = await runDeveloperStudio("yaml-validator", "app:\n  name: enV");
  assert.match(left!, /YAML shape check passed/);
  await assert.rejects(runDeveloperStudio("yaml-validator", "app:\n\tname: enV"), /tabs/i);
  const sql = JSON.parse((await runDeveloperStudio("developer-sql-query-builder", JSON.stringify({ table: "users", columns: ["id", "email"], filters: [{ column: "active", operator: "=", value: true }], limit: 25 })))!);
  assert.match(sql.sql, /SELECT "id", "email" FROM "users" WHERE "active" = \? LIMIT 25/);
  assert.deepEqual(sql.parameters, [true]);
  await assert.rejects(runDeveloperStudio("developer-sql-query-builder", JSON.stringify({ table: "users; DROP TABLE users" })), /identifier/);
  assert.match((await runDeveloperStudio("markdown-to-html", "# hello\n\nSome <unsafe> text"))!, /&lt;unsafe&gt;/);
  assert.match((await runDeveloperStudio("json-explainer", '{"items":[1,2]}'))!, /arrayItems/);
  await assert.rejects(runDeveloperStudio("hash-decoder", "abcd"), /cannot be decoded/i);
});

test("generic diff and specific status explanation produce useful results", async () => {
  const diff = JSON.parse((await runDeveloperStudio("css-diff", ".a { color: red; }", ".a { color: blue; }"))!);
  assert.equal(diff.equal, false);
  assert.ok(diff.changes.length > 0);
  assert.match((await runDeveloperStudio("developer-status-code-explainer", "404"))!, /Not Found/);
  assert.match((await runDeveloperStudio("http-request-builder", "https://api.example.test/v1?q=hi", "POST"))!, /^POST \/v1\?q=hi HTTP\/1.1/m);
});


test("developer encoder/decoder suffix routes are reversible and never fall through to generic analysis", async () => {
  const text = "select name from users where note = 'a & b'; 🚀";
  const encoded = await runDeveloperStudio("sql-encoder", text);
  assert.match(encoded!, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(await runDeveloperStudio("sql-decoder", encoded!), text);
  assert.equal(await runDeveloperStudio("css-encoder", 'content: "hello\nworld";'), String.raw`content: \"hello\a world\";`);
  assert.equal(await runDeveloperStudio("css-decoder", 'hello\\a world'), "hello\nworld");
  const uuid = "550e8400-e29b-71d4-a716-446655440000";
  assert.match((await runDeveloperStudio("uuid-validator", uuid))!, /Valid UUID version 7/i);
  assert.equal(await runDeveloperStudio("uuid-decoder", await runDeveloperStudio("uuid-encoder", uuid) ?? ""), uuid);
  assert.match((await runDeveloperStudio("uuid-validator", "00000000-0000-0000-0000-000000000000"))!, /Nil UUID/i);
  assert.match((await runDeveloperStudio("developer-webhook-payload-generator", "order.paid"))!, /"type": "order.paid"/);
});

test("URL encoding preserves spaces, ampersands, and repeated query values", async () => {
  assert.equal(await runDeveloperStudio("url-encoder", "hello world & tea"), "hello%20world%20%26%20tea");
  assert.equal(await runDeveloperStudio("url-decoder", "hello%20world%20%26%20tea"), "hello world & tea");
  const parsed = JSON.parse((await runDeveloperStudio("query-string-parser", "q=one&q=two&space=hello+world"))!);
  assert.deepEqual(parsed.grouped.q, ["one", "two"]);
  assert.equal(parsed.entries[2].value, "hello world");
});

test("JSON schema inference labels integral JSON numbers as integer", async () => {
  const schema = JSON.parse((await runDeveloperStudio("developer-json-schema-generator", '{"count":2,"ratio":1.5}'))!);
  assert.equal(schema.properties.count.type, "integer");
  assert.equal(schema.properties.ratio.type, "number");
});


test("JSON inspector surfaces duplicate keys, unsafe integers, and bounded structural stats", async () => {
  const report = JSON.parse((await runDeveloperStudio("json-inspector", '{"id":9007199254740993,"memo":"9007199254740993","name":"first","name":"second","items":[1,2]}'))!);
  assert.equal(report.rootType, "object");
  assert.ok(report.duplicateKeys.includes("$.name"));
  assert.equal(report.unsafeIntegerTokens[0].token, "9007199254740993");
  assert.equal(report.unsafeIntegerTokens.length, 1, "numeric text inside a quoted string is not a number token");
  assert.ok(report.nodes >= 6);
  assert.equal(report.arrayItems, 2);
  assert.match((await runDeveloperStudio("json-validator", '{"a":1,"a":2}'))!, /Duplicate object keys detected/);
});

test("JSON diff reports structural paths and ignores object key order", async () => {
  const equal = JSON.parse((await runDeveloperStudio("json-diff", '{"a":1,"b":{"x":2}}', '{"b":{"x":2},"a":1}'))!);
  assert.equal(equal.equal, true);
  const diff = JSON.parse((await runDeveloperStudio("json-diff", '{"items":[{"id":1}],"name":"old"}', '{"items":[{"id":2},{"id":3}],"name":"new"}'))!);
  assert.equal(diff.equal, false);
  assert.ok(diff.changes.some((change: {path:string}) => change.path === '$["items"][0]["id"]'));
  assert.ok(diff.changes.some((change: {type:string}) => change.type === "added"));
});

test("JSON Schema inference merges heterogeneous array sample shapes", async () => {
  const schema = JSON.parse((await runDeveloperStudio("developer-json-schema-generator", '[{"id":1,"name":"Ada"},{"id":2,"active":true},{"id":3.5,"name":null}]'))!);
  assert.equal(schema.items.type, "object");
  assert.deepEqual(schema.items.required, ["id"]);
  assert.equal(schema.items.properties.id.type, "number");
  assert.deepEqual(schema.items.properties.name.type, ["null", "string"]);
  assert.equal(schema.items.properties.active.type, "boolean");
});

test("HTTP request builder uses the entered host, supports validated custom headers/body", async () => {
  const output = await runDeveloperStudio("http-request-builder", "https://api.example.test/v2/items?q=hello", '{"method":"POST","headers":{"X-Request-ID":"abc-123"},"body":{"name":"enV"}}');
  assert.match(output!, /^POST \/v2\/items\?q=hello HTTP\/1.1/m);
  assert.match(output!, /Host: api\.example\.test/);
  assert.match(output!, /X-Request-ID: abc-123/);
  assert.match(output!, /"name": "enV"/);
  await assert.rejects(runDeveloperStudio("http-request-builder", "https://api.example.test", '{"headers":{"X-Test":"ok\\r\\nHost: evil.test"}}'), /newline/);
});

test("Regex report labels high-risk nested quantifier patterns heuristically", async () => {
  const report = JSON.parse((await runDeveloperStudio("regex-tester", '(a+)+$', 'aaaaaaaaab'))!);
  assert.equal(report.engine, "JavaScript RegExp");
  assert.match(report.performanceRisk, /backtracking/i);
});

test("Regex Studio runs independent batch samples without forcing multiline/global flag workarounds", async () => {
  const report = JSON.parse((await runDeveloperStudio("regex-tester", "\\d+", '["one 12", "no digits", "34 and 56"]'))!);
  assert.equal(report.mode, "batch");
  assert.equal(report.sampleCount, 3);
  assert.equal(report.matchCount, 3);
  assert.deepEqual(report.results.map((result: { matchCount: number }) => result.matchCount), [1, 0, 2]);
  const replaced = JSON.parse((await runDeveloperStudio("regex-replace", "\\d+", '["item-12", "item-9"]', "g", new Date(), "#"))!);
  assert.deepEqual(replaced.results.map((result: { preview: string }) => result.preview), ["item-#", "item-#"]);
});

test("Regex Studio bounds batch input and skips long samples for high-risk pattern heuristics", async () => {
  await assert.rejects(runDeveloperStudio("regex-tester", "\\d+", JSON.stringify(Array.from({ length: 101 }, () => "x"))), /between 1 and 100/);
  const report = JSON.parse((await runDeveloperStudio("regex-tester", "(a+)+$", JSON.stringify(["a".repeat(40) + "!", "safe"])))!);
  assert.equal(report.results[0].executionSkipped, true);
  assert.equal(report.results[1].executionSkipped, false);
  assert.match(report.performanceRisk, /skipped/i);
});


test("hash compare treats hexadecimal digests case-insensitively but preserves Base64 case", async () => {
  const hex = JSON.parse((await runDeveloperStudio("hash-compare", "5D41402ABC4B2A76B9719D911017C592", "5d41402abc4b2a76b9719d911017c592"))!);
  assert.equal(hex.equal, true);
  assert.equal(hex.comparison, "hex-digest-case-insensitive");
  const b64 = JSON.parse((await runDeveloperStudio("hash-compare", "AbCd+/==", "abcd+/=="))!);
  assert.equal(b64.equal, false);
  assert.equal(b64.comparison, "exact-string");
});

test("URL component decoder keeps plus literal while form-query parser maps plus to space", async () => {
  assert.equal(await runDeveloperStudio("url-decoder", "a+b%2Bc"), "a+b+c");
  const report = JSON.parse((await runDeveloperStudio("query-string-parser", "q=a+b%2Bc"))!);
  assert.equal(report.entries[0].value, "a b+c");
});

test("JSON formatter preserves unsafe integer token digits and warns before parsing losses", async () => {
  const output = await runDeveloperStudio("json-formatter", '{"id":9007199254740993,"ratio":1e+100,"name":"safe"}');
  assert.match(output!, /JavaScript Number cannot safely represent this integer; value may be rounded/i);
  assert.match(output!, /"id": 9007199254740993/);
  assert.match(output!, /1e\+100/);
  assert.doesNotMatch(output!, /9007199254740992/);
  const minified = await runDeveloperStudio("json-minifier", '{"id":9007199254740993}');
  assert.match(minified!, /\{"id":9007199254740993\}/);
  assert.match(minified!, /WARNING:/);
});

test("JSON formatter preserves duplicate-key source and explains last-wins parser behavior", async () => {
  const output = await runDeveloperStudio("json-beautifier", '{"dup":1,"nested":{"dup":2},"dup":3}');
  assert.match(output!, /Duplicate object keys detected/);
  assert.match(output!, /keep only the last value/i);
  assert.equal((output!.match(/"dup"/g) || []).length, 3);
});

test("JavaScript formatter normalizes async arrow/object syntax with the local TypeScript AST printer", async () => {
  const output = await runDeveloperStudio("js-format", 'const f=async(x)=>({ok:true,value:x+1});');
  assert.match(output!, /const f = async \(x\) => \(\{\s*ok: true,\s*value: x \+ 1\s*\}\);/);
  assert.match(output!, /Formatter: (?:TypeScript compiler AST printer|conservative lexical fallback)/);
  const empty = runDeveloperStudio("js-format", "");
  await assert.rejects(empty, /Paste JavaScript|empty/i);
});

test("SQL hard-input formatter separates clauses without rewriting keywords inside literals", async () => {
  const query = "select u.id,count(*) as n from users u join orders o on o.user_id=u.id where o.note='group by or order by' group by u.id having count(*)>1 order by n desc";
  const output = await runDeveloperStudio("sql-format", query);
  assert.ok(output!.split("\n").length >= 6);
  assert.match(output!, /JOIN orders/);
  assert.match(output!, /GROUP BY\s+u\.id/);
  assert.match(output!, /ORDER BY\s+n DESC/i);
  assert.match(output!, /'group by or order by'/);
  assert.doesNotMatch(output!, /'group\n\s+by/);
});

test("HTTP status lookup explains teapot and common retryable/client/server statuses", async () => {
  assert.match((await runDeveloperStudio("http-status-lookup", "418"))!, /^418 I'm a teapot\nCategory: Client error\nMeaning:.*(historical|unused).*teapot|Meaning:.*teapot.*(historical|unused)/i);
  assert.match((await runDeveloperStudio("http-status-lookup", "422"))!, /Unprocessable Content[\s\S]*could not process/i);
  assert.match((await runDeveloperStudio("http-status-lookup", "429"))!, /Retry-After/i);
  assert.match((await runDeveloperStudio("http-status-lookup", "503"))!, /temporarily unable/i);
  assert.match((await runDeveloperStudio("http-status-lookup", "104"))!, /temporary IANA registration/i);
  assert.match((await runDeveloperStudio("http-status-lookup", "305"))!, /deprecated/i);
  assert.match((await runDeveloperStudio("http-status-lookup", "306"))!, /Unused/i);
  assert.match((await runDeveloperStudio("http-status-reference", ""))!, /104 Upload Resumption Supported/);
  assert.match((await runDeveloperStudio("http-status-reference", ""))!, /305 Use Proxy/);
  assert.match((await runDeveloperStudio("http-status-reference", ""))!, /306 \(Unused\)/);
  await assert.rejects(runDeveloperStudio("http-status-lookup", "99"), /100 through 599/);
});

test("JSON Pointer supports escaped property names and preserves unsafe integer lexemes", async () => {
  const report = await runDeveloperStudio("json-path-query", '{"a/b":{"~id":9007199254740993}}', "/a~1b/~0id");
  assert.match(report!, /9007199254740993/);
  assert.match(report!, /cannot safely represent|unsafe integer|precision/i);
  await assert.rejects(runDeveloperStudio("json-path-query", '{"x":1}', "/bad~2escape"), /Invalid JSON Pointer escape/);
});

test("JWT decoder preserves exact header/payload JSON and flags unsafe numeric tokens", async () => {
  const token = "e30.eyJpZCI6OTAwNzE5OTI1NDc0MDk5MywibmFtZSI6InN0cjkwMDcxOTkyNTQ3NDA5OTMifQ.";
  const report = JSON.parse((await runDeveloperStudio("jwt-decoder", token))!);
  assert.equal(report.signatureVerified, false);
  assert.equal(report.payload.id, 9007199254740992, "the convenience claims object reflects JavaScript parse behavior");
  assert.match(report.payloadRawJson, /"id":9007199254740993/);
  assert.equal(report.rawNumericPrecision.payloadUnsafeIntegerTokens[0].token, "9007199254740993");
  assert.match(report.largeIntegerPrecisionWarning, /rawJson|RawJson|exact source/i);
});

test("CORS generator validates credential wildcard combinations and emits allow-list middleware for multiple origins", async () => {
  await assert.rejects(runDeveloperStudio("developer-cors-generator", JSON.stringify({ origins: ["*"], credentials: true })), /forbids.*credentialed|wildcard.*credential/i);
  const out = await runDeveloperStudio("developer-cors-generator", JSON.stringify({ origins: ["https://a.example", "https://b.example"], methods: ["GET", "POST"], credentials: true }));
  assert.match(out!, /allowedOrigins/);
  assert.match(out!, /Vary/);
  assert.match(out!, /Access-Control-Allow-Credentials/);
  assert.doesNotMatch(out!, /Access-Control-Allow-Origin: https:\/\/a\.example, https:\/\/b\.example/);
  await assert.rejects(runDeveloperStudio("developer-cors-generator", JSON.stringify({ origins: ["https://a.example/path"] })), /without path/i);
});

test("CSP generator safely composes directives and flags weak source expressions", async () => {
  const out = await runDeveloperStudio("developer-csp-generator", JSON.stringify({ "script-src": ["'self'", "'unsafe-inline'"], "img-src": ["https://cdn.example.test"] }));
  assert.match(out!, /default-src 'self'/);
  assert.match(out!, /object-src 'none'/);
  assert.match(out!, /unsafe source expressions/i);
  await assert.rejects(runDeveloperStudio("developer-csp-generator", JSON.stringify({ "script-src": ["'self'; default-src *"] })), /semicolons|forbidden separator/i);
});

test("Data URI text generator and decoder label their byte/text limits", async () => {
  const uri = await runDeveloperStudio("data-uri-generator", "Hello 世界", "text/plain;charset=utf-8");
  assert.match(uri!, /^data:text\/plain;charset=utf-8;base64,/);
  assert.match(uri!, /UTF-8 text bytes/);
  const decoded = await runDeveloperStudio("data-uri-decoder", "data:text/plain;charset=utf-8;base64,SGVsbG8=");
  assert.match(decoded!, /^Hello/);
  assert.match(decoded!, /Payload mode: Base64 interpreted as UTF-8 text/);
  await assert.rejects(runDeveloperStudio("data-uri-generator", "Hi", "not-a-mime"), /valid MIME type/i);
});


test("JSON diff and key sorting do not silently erase unsafe integer precision", async () => {
  const diff = JSON.parse((await runDeveloperStudio("json-diff", '{"id":9007199254740992}', '{"id":9007199254740993}'))!);
  assert.equal(diff.equal, false);
  assert.ok(diff.changes.some((change: any) => change.path === "$[\"id\"]"));
  const sorted = await runDeveloperStudio("json-key-sorter", '{"z":9007199254740993,"a":1}');
  assert.match(sorted!, /9007199254740993/);
  assert.ok(sorted!.indexOf('"a"') < sorted!.indexOf('"z"'));
  assert.match(sorted!, /WARNING: JavaScript Number cannot safely represent this integer/);
});


test("CORS rejects invalid header names instead of emitting unsafe policy text", async () => {
  await assert.rejects(runDeveloperStudio("cors-generator", JSON.stringify({ origins: ["https://app.example.com"], headers: ["X-Example\r\nInjected: yes"] })), /valid HTTP field-name tokens|line breaks/);
});


test("shared golden JavaScript formatter fixture produces readable multi-line output", async () => {
  const output = await runDeveloperStudio("javascript-formatter", developerStudioGolden.javascript.input);
  assert.ok(output && output.includes("\n"), "formatter must not return an empty or single-token result");
  for (const token of developerStudioGolden.javascript.mustContain) assert.ok(output.includes(token), `missing ${token}`);
  assert.match(output, /conservative local formatter|formatter/i);
});

test("shared golden SQL fixture keeps phrases inside quotes and dollar-quoted strings intact", async () => {
  const output = await runDeveloperStudio("sql-formatter", developerStudioGolden.sql.input, developerStudioGolden.sql.dialect);
  assert.ok(output && output.includes("\n"));
  for (const token of developerStudioGolden.sql.mustContain) assert.ok(output.includes(token), `missing SQL token ${token}`);
});

test("Recipe Pipeline executes bounded, inspectable steps while preserving Unicode and line endings", async () => {
  const recipe = {
    input: "  enV 🚀\r\nline two\rline two  ",
    steps: [
      { op: "normalize-newlines", name: "Normalize line endings" },
      { op: "trim" },
      { op: "unique-lines" },
      { op: "replace-literal", find: "line two", replacement: "second line" },
    ],
  };
  const report = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify(recipe)))!);
  assert.equal(report.status, "completed");
  assert.equal(report.stepsCompleted, 4);
  assert.equal(report.finalOutput, "enV 🚀\nsecond line");
  assert.equal(report.steps[0].status, "ok");
  assert.ok(report.steps.every((step: { inputUtf8Bytes: number; outputUtf8Bytes: number; preview: string }) => step.inputUtf8Bytes >= 0 && step.outputUtf8Bytes >= 0 && typeof step.preview === "string"));
  assert.match(report.privacy, /does not upload/i);
  assert.ok(report.supportedOperations.includes("sha256-hex"));
});

test("Recipe Pipeline preserves unsafe JSON integer tokens and refuses ambiguous duplicate-key sorting", async () => {
  const raw = '{"id":9007199254740993,"name":"enV"}';
  const formatted = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: raw, steps: [{ op: "json-format" }] })))!);
  assert.match(formatted.finalOutput, /9007199254740993/);
  assert.ok(formatted.warnings.some((warning: string) => /cannot safely represent this integer/i.test(warning)));
  const duplicate = JSON.stringify({ input: '{"a":1,"a":2}', steps: [{ op: "json-sort-keys" }] });
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", duplicate), /duplicate object keys/i);
  const preserved = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: '{"a":1,"a":2}', steps: [{ op: "json-format" }] })))!);
  assert.equal((preserved.finalOutput.match(/"a"/g) ?? []).length, 2);
});

test("Recipe Pipeline codecs round-trip UTF-8 and reject non-canonical Base64", async () => {
  const encoded = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: "enV 🚀", steps: [{ op: "base64-encode" }, { op: "base64-decode" }] })))!);
  assert.equal(encoded.finalOutput, "enV 🚀");
  const url = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: "A + 🚀 & B", steps: [{ op: "url-encode-component" }, { op: "url-decode-component" }] })))!);
  assert.equal(url.finalOutput, "A + 🚀 & B");
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: "Zh==", steps: [{ op: "base64-decode" }] })), /canonical/i);
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: "%Q0", steps: [{ op: "url-decode-component" }] })), /percent escape/i);
});

test("Recipe Pipeline has explicit step/input limits and fails closed on unknown operations", async () => {
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: "x", steps: Array.from({ length: 17 }, () => ({ op: "trim" })) })), /between 1 and 16/i);
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: "x", steps: [{ op: "eval", code: "alert(1)" }] })), /unsupported operation/i);
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: 123, steps: [{ op: "trim" }] })), /string 'input'/i);
});

test("Recipe SHA-256 is a deterministic one-way digest", async () => {
  const report = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: "hello", steps: [{ op: "sha256-hex" }] })))!);
  assert.equal(report.finalOutput, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  assert.ok(report.semantics.some((item: string) => /one-way/i.test(item)));
});


test("Recipe Pipeline supports Unicode normalization, BOM removal, and exact final-newline operations", async () => {
  const raw = "\uFEFFCafe\u0301\n\n";
  const report = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: raw, steps: [{ op: "strip-bom" }, { op: "unicode-normalize-nfc" }, { op: "remove-final-newline" }] })))!);
  assert.equal(report.finalOutput, "Café\n");
  const compatibility = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: "①", steps: [{ op: "unicode-normalize-nfkc" }] })))!);
  assert.equal(compatibility.finalOutput, "1");
  assert.ok(compatibility.warnings.some((warning: string) => /compatibility normalization/i.test(warning)));
  const add = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: "line", steps: [{ op: "ensure-final-newline" }] })))!);
  assert.equal(add.finalOutput, "line\n");
});

test("Recipe Pipeline reverses lines rather than characters and sorts deterministically by code point", async () => {
  const reversed = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: "🚀 first\nsecond\nthird\n", steps: [{ op: "reverse-lines" }] })))!);
  assert.equal(reversed.finalOutput, "third\nsecond\n🚀 first\n");
  const sorted = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: "z\nA\na\n🚀", steps: [{ op: "sort-lines" }] })))!);
  assert.equal(sorted.finalOutput, "A\na\nz\n🚀");
});


test("Recipe JSON Pointer follows RFC 6901 escapes and preserves selected unsafe number tokens", async () => {
  const config = JSON.stringify({ input: developerStudioGolden.recipePointer.input, steps: [{ op: "json-pointer-get", pointer: developerStudioGolden.recipePointer.pointer }] });
  const report = JSON.parse((await runDeveloperStudio("developer-recipe-runner", config))!);
  assert.equal(report.finalOutput, developerStudioGolden.recipePointer.output);
  assert.ok(report.warnings.some((warning: string) => /cannot safely represent this integer/i.test(warning)));
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: '{"a":1,"a":2}', steps: [{ op: "json-pointer-get", pointer: "/a" }] })), /ambiguous duplicate object keys/i);
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: '{"items":[1,2]}', steps: [{ op: "json-pointer-get", pointer: "/items/01" }] })), /canonical array index/i);
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: '{"a":1}', steps: [{ op: "json-pointer-get", pointer: "/a~2b" }] })), /invalid JSON Pointer escape/i);
});


test("Recipe CSV transforms round-trip quoted commas/quotes while keeping the pipeline's JSON values exact", async () => {
  const csv = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: developerStudioGolden.recipeCsv.input, steps: [{ op: "csv-to-json" }] })))!);
  assert.equal(csv.finalOutput, developerStudioGolden.recipeCsv.expectedJson);
  const roundTrip = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: csv.finalOutput, steps: [{ op: "json-to-csv" }] })))!);
  assert.equal(roundTrip.finalOutput, developerStudioGolden.recipeCsv.expectedCsv);
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: 'name,name\na,b', steps: [{ op: "csv-to-json" }] })), /headers must be unique/i);
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: 'name,note\nAda,"unfinished', steps: [{ op: "csv-to-json" }] })), /ends inside a quoted field/i);
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: '[{"id":1},{"name":"different schema"}]', steps: [{ op: "json-to-csv" }] })), /different set of keys/i);
});


test("Recipe literal replacement preflights expansion before constructing oversized output", async () => {
  const config = JSON.stringify({ input: "x".repeat(30), steps: [{ op: "replace-literal", find: "x", replacement: "a".repeat(100_000) }] });
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", config), /Literal replacement would exceed 2097152 UTF-8 bytes/i);
});

test("Recipe CSV round-trip quotes CRLF inside a field on every platform", async () => {
  const input = 'name,note\r\nAda,"line one\r\nline two"\r\n';
  const toJson = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input, steps: [{ op: "csv-to-json" }] })))!);
  const toCsv = JSON.parse((await runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: toJson.finalOutput, steps: [{ op: "json-to-csv" }] })))!);
  assert.equal(toCsv.finalOutput, 'name,note\nAda,"line one\r\nline two"\n');
});


test("Recipe JSON depth and pretty-output budgets stop hostile nested inputs before parsing or allocation", async () => {
  const deeplyNested = "[".repeat(129) + "0" + "]".repeat(129);
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: deeplyNested, steps: [{ op: "json-validate" }] })), /JSON nesting exceeds the safety depth of 128/i);
  const outputAmplifier = "[".repeat(80) + Array.from({ length: 13_500 }, () => "0").join(",") + "]".repeat(80);
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", JSON.stringify({ input: outputAmplifier, steps: [{ op: "json-format" }] })), /JSON formatting would exceed 2097152 UTF-8 bytes/i);
});


test("Recipe configuration rejects duplicate top-level keys consistently instead of silently choosing a value", async () => {
  const duplicate = '{"input":"first","input":"second","steps":[{"op":"trim"}]}';
  await assert.rejects(runDeveloperStudio("developer-recipe-runner", duplicate), /Recipe configuration contains duplicate object keys and is ambiguous/i);
});



test("UX/UI Studio code exports preserve shapes, SVG icons, imported images and custom fonts", () => {
  const project = {
    name: "Interface Asset QA",
    target: "mobile",
    background: "#F8FAFC",
    viewport: { width: 390, height: 844 },
    breakpoints: { mobile: 480, tablet: 768, desktop: 1024 },
    tokens: { colors: [{ name: "brand", value: "#2563EB" }], typography: [], spacing: [4, 8, 16] },
    elements: [
      {
        id: "shape-1", kind: "star", name: "Status star", x: 16, y: 24, width: 40, height: 40,
        text: "", iconName: "", iconSvg: "", iconViewBox: "0 0 24 24", imageDataUrl: "",
        fontDataUrl: "data:font/ttf;base64,AA==", color: "#1D4ED8", background: "#DBEAFE",
        borderColor: "#93C5FD", borderWidth: 1, radius: 4, padding: 0, marginTop: 0,
        marginRight: 0, marginBottom: 0, marginLeft: 0, fontFamily: "Imported QA Font",
        fontSize: 14, fontWeight: 600, lineHeight: 1.2, letterSpacing: 0,
        textAlign: "left", opacity: 1, shadow: false, horizontalConstraint: "left",
        verticalConstraint: "top", minWidth: 1, maxWidth: 100, visibleOn: ["mobile"],
        referenceWidth: 390, referenceHeight: 844, componentKey: ""
      },
      {
        id: "icon-1", kind: "icon", name: "Home icon", x: 64, y: 24, width: 24, height: 24,
        text: "", iconName: "lucide:house", iconSvg: "<path d='M2 12 L12 2 L22 12 V22 H2 Z'/>",
        iconViewBox: "0 0 24 24", imageDataUrl: "", fontDataUrl: "",
        color: "#2563EB", background: "transparent", borderColor: "#CBD5E1", borderWidth: 0,
        radius: 0, padding: 0, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0,
        fontFamily: "Inter", fontSize: 16, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0,
        textAlign: "left", opacity: 1, shadow: false, horizontalConstraint: "left",
        verticalConstraint: "top", minWidth: 1, maxWidth: 100, visibleOn: ["mobile"],
        referenceWidth: 390, referenceHeight: 844, componentKey: ""
      },
      {
        id: "image-1", kind: "image", name: "Product image", x: 96, y: 24, width: 80, height: 48,
        text: "", iconName: "", iconSvg: "", iconViewBox: "0 0 24 24",
        imageDataUrl: "data:image/png;base64,iVBORw0KGgo=", fontDataUrl: "",
        color: "#111827", background: "#E5E7EB", borderColor: "#CBD5E1", borderWidth: 1,
        radius: 8, padding: 0, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0,
        fontFamily: "Inter", fontSize: 14, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0,
        textAlign: "left", opacity: 1, shadow: false, horizontalConstraint: "left",
        verticalConstraint: "top", minWidth: 1, maxWidth: 100, visibleOn: ["mobile"],
        referenceWidth: 390, referenceHeight: 844, componentKey: ""
      }
    ]
  };
  const html = generateHtmlProject(project);
  const react = generateReactProject(project);
  const kotlin = generateKotlinProject(project);
  const swift = generateSwiftProject(project);
  assert.match(html, /clip-path:polygon/);
  assert.match(html, /@font-face/);
  assert.ok(html.includes("data:image/png;base64"));
  assert.ok(html.includes("aria-label=\"Home icon\""));
  assert.ok(html.includes("M2 12 L12 2 L22 12 V22 H2 Z"));
  assert.match(react, /embeddedFontCss/);
  assert.ok(react.includes("data:image/png;base64"));
  assert.match(kotlin, /generatedUxShape/);
  assert.match(kotlin, /generatedUxFontFamily/);
  assert.ok(kotlin.includes("data:image/png;base64"));
  assert.match(swift, /GeneratedUxShape/);
  assert.match(swift, /generatedUxRegisterFont/);
  assert.ok(swift.includes("data:image/png;base64"));
});
