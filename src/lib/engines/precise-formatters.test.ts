import test from "node:test";
import assert from "node:assert/strict";
import { formatSqlWithDialect, formatStructuredWithParser } from "./precise-formatters.ts";
import { developerStudioGolden } from "./developer-studio-golden.ts";

const fixtures = developerStudioGolden.parserFormatters;

test("SQL grammar formatter handles the shared hard PostgreSQL fixture without touching literals", async () => {
  const output = await formatSqlWithDialect(developerStudioGolden.sql.input, developerStudioGolden.sql.dialect);
  for (const fragment of developerStudioGolden.sql.mustContain) assert.ok(output.includes(fragment), `missing SQL fixture fragment ${fragment}`);
  assert.match(output, /Formatter: sql-formatter 15\.9\.0/);
  assert.match(output, /query layout/i);
});

test("SQL grammar formatter supports distinct SQL dialects from the canonical corpus", async () => {
  for (const fixture of fixtures.sqlDialects) {
    const output = await formatSqlWithDialect(fixture.input, fixture.dialect);
    assert.ok(output.includes("\n"), `${fixture.dialect} should be multi-line`);
    for (const fragment of fixture.mustContain) assert.ok(output.includes(fragment), `${fixture.dialect} missing ${fragment}`);
    assert.ok(output.includes(`dialect '${fixture.dialect}'`));
  }
});

test("SQL formatter canonicalizes aliases and rejects unsupported dialects clearly", async () => {
  assert.match(await formatSqlWithDialect("select 1", "generic"), /dialect 'sql'/);
  assert.match(await formatSqlWithDialect("select 1", "sqlserver"), /dialect 'transactsql'/);
  await assert.rejects(formatSqlWithDialect("select 1", "random-db"), /Unsupported SQL dialect 'random-db'/);
});

test("SQL formatter rejects oversized or empty payloads before invoking the parser", async () => {
  await assert.rejects(formatSqlWithDialect("   ", "postgresql"), /Paste SQL input/);
  await assert.rejects(formatSqlWithDialect("x".repeat(1_000_001), "postgresql"), /1 MB local formatting limit/);
});

test("Prettier CSS parser preserves nested media/rule structure", async () => {
  const output = await formatStructuredWithParser(fixtures.css.input, "css");
  for (const fragment of fixtures.css.mustContain) assert.ok(output.includes(fragment), `CSS output missing ${fragment}`);
  assert.match(output, /@media[\s\S]*\n\s*\.card/);
  assert.match(output, /Prettier standalone css parser/);
});

test("Prettier HTML and XML parsers emit nested multi-line output", async () => {
  const html = await formatStructuredWithParser(fixtures.html.input, "html");
  const xml = await formatStructuredWithParser(fixtures.xml.input, "xml");
  for (const fragment of fixtures.html.mustContain) assert.ok(html.includes(fragment), `HTML output missing ${fragment}`);
  for (const fragment of fixtures.xml.mustContain) assert.ok(xml.includes(fragment), `XML output missing ${fragment}`);
  assert.ok(html.includes("\n") && xml.includes("\n"));
});

test("Prettier YAML parser supports quoted colons and flow sequences", async () => {
  const output = await formatStructuredWithParser(fixtures.yaml.input, "yaml");
  for (const fragment of fixtures.yaml.mustContain) assert.ok(output.includes(fragment), `YAML output missing ${fragment}`);
  assert.match(output, /enV: developer tools/);
});

test("Prettier Markdown and GraphQL parsers preserve meaningful structure", async () => {
  const markdown = await formatStructuredWithParser(fixtures.markdown.input, "markdown");
  const graphql = await formatStructuredWithParser(fixtures.graphql.input, "graphql");
  for (const fragment of fixtures.markdown.mustContain) assert.ok(markdown.includes(fragment), `Markdown output missing ${fragment}`);
  for (const fragment of fixtures.graphql.mustContain) assert.ok(graphql.includes(fragment), `GraphQL output missing ${fragment}`);
  assert.ok(markdown.includes("\n\n") && graphql.includes("\n"));
});

test("structured formatter rejects invalid grammar with parser diagnostics and does not execute source", async () => {
  await assert.rejects(formatStructuredWithParser("<root><child></root>", "xml"), /XML structural preflight\/HTML printer could not format the input/i);
  await assert.rejects(formatStructuredWithParser("<!DOCTYPE root [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><root>&x;</root>", "xml"), /DOCTYPE declarations are disabled/i);
  await assert.rejects(formatStructuredWithParser("items: [one, two", "yaml"), /YAML parser could not format the input/i);
});
