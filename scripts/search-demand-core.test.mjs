import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULTS, learnFromDemand, parseCsv, readExport, sanitizeQuery } from "./search-demand-core.mjs";

// All data below is SYNTHETIC test input. It is not real search demand.

test("sanitizeQuery drops anything that could identify a person or leak a secret", () => {
  assert.equal(sanitizeQuery("john.doe@gmail.com pdf").dropped, "email-like");
  assert.equal(sanitizeQuery("convert https://x.example/a.pdf").dropped, "url-like");
  assert.equal(sanitizeQuery("shop.example.com merge").dropped, "url-like");
  assert.equal(sanitizeQuery("call 5551234567 pdf").dropped, "long-digit-sequence");
  assert.equal(sanitizeQuery("synthetic_placeholder_token_for_unit_test").dropped, "token-like");
  assert.equal(sanitizeQuery("envtools merge pdf").dropped, "brand-query");
  assert.equal(sanitizeQuery("a b c d e f g h i j k l").dropped, "too-long");
  assert.equal(sanitizeQuery("   ").dropped, "empty");
  assert.equal(sanitizeQuery("Merge  PDF Files!").query, "merge pdf files");
  assert.equal(sanitizeQuery("sha256 hash").query, "sha256 hash");
});

test("CSV parsing handles quotes, commas, CRLF and header aliases", () => {
  const rows = parseCsv('Query,Page,Clicks,Impressions,Position\r\n"a, b",https://envtools.store/tools/pdf/pdf-merger,3,"1,200",4.5\r\n"say ""hi""",https://envtools.store/x,0,50,12\r\n');
  assert.equal(rows.length, 3);
  const data = readExport(rows);
  assert.deepEqual(data[0], { query: "a, b", page: "https://envtools.store/tools/pdf/pdf-merger", clicks: 3, impressions: 1200, position: 4.5 });
  assert.equal(data[1].query, 'say "hi"');
  assert.throws(() => readExport(parseCsv("Query,Clicks,Impressions\nx,1,2\n")), /missing required column.*page/i);
});

const ctxFor = (ranks, mapping, existing = {}) => ({
  resolvePage: (u) => mapping[u] ?? null,
  rankOf: (q, id) => (id === null ? (ranks[q]?.length ?? 0) : (ranks[q] ?? []).indexOf(id) + 1),
  existingPhrases: new Map(Object.entries(existing).map(([k, v]) => [k, new Set(v)])),
});
const row = (query, page, clicks, impressions, position = 5) => ({ query, page, clicks, impressions, position });

test("learnFromDemand separates ranked-ok, ranking gaps, covered phrases, ambiguity, thresholds and unmet leads", () => {
  const rows = [
    row("merge pdf", "P1", 40, 900), row("pdf joiner", "P1", 25, 500), row("pdf joiner", "P1", 5, 100),
    row("join pdf", "P1", 10, 300), row("rare phrase", "P1", 2, 10),
    row("compress it", "P2", 30, 400), row("compress it", "P3", 25, 380),
    row("someone@mail.com pdf", "P1", 9, 900), row("mp4 audio", "NOTATOOL", 0, 600),
  ];
  const ranks = { "merge pdf": ["pdf-merger"], "pdf joiner": ["x", "y", "z", "pdf-merger"], "join pdf": ["x", "y", "z", "w"], "mp4 audio": [] };
  const r = learnFromDemand(rows, ctxFor(ranks, { P1: "pdf-merger", P2: "image-compressor", P3: "pdf-compressor" }, { "pdf-merger": ["join pdf"] }), DEFAULTS);
  assert.equal(r.summary.droppedRows["email-like"], 1);
  assert.equal(r.summary.rankedOk, 1);
  assert.deepEqual(r.proposedAliases.map((g) => [g.query, g.toolId, g.currentRank, g.impressions]), [["pdf joiner", "pdf-merger", 4, 600]]);
  assert.equal(r.summary.alreadyCovered, 1, "join pdf is already a known phrase");
  assert.equal(r.ambiguous.length, 1);
  assert.equal(r.ambiguous[0].query, "compress it");
  assert.ok(!r.proposedAliases.some((g) => g.query === "rare phrase"), "below the impression threshold");
  assert.deepEqual(r.unmet.map((u) => u.query), ["mp4 audio"]);
  assert.ok(r.proposedAliases.every((g) => g.reviewed === false && g.source === "measured-demand"));
  assert.deepEqual(r.behavioralJudgments.find((j) => j.query === "merge pdf").relevant, { "pdf-merger": 3 });
  assert.ok(r.behavioralJudgments.every((j) => j.reviewStatus === "BEHAVIORAL_NOT_HUMAN_REVIEWED"));
});

test("aggregation is deterministic and independent of row order", () => {
  const rows = [row("a b", "P", 1, 100), row("a b", "P", 2, 100), row("c d", "P", 9, 400)];
  const ctx = ctxFor({ "a b": [], "c d": [] }, { P: "t" });
  assert.deepEqual(learnFromDemand(rows, ctx), learnFromDemand([...rows].reverse(), ctx));
});
