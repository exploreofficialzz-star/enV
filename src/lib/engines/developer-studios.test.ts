import test from "node:test";
import assert from "node:assert/strict";
import { cronNextRuns, parseCron, hashText, runDeveloperStudio, validateJsonDetailed } from "./developer-studios.ts";

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
