import { test } from "node:test";
import assert from "node:assert/strict";
import { runCodec } from "./codecs.ts";

test("base-convert converts common bases and signed values", async () => {
  assert.equal(await runCodec("base-convert", "255", { fromBase: "10", toBase: "16" }), "ff");
  assert.equal(await runCodec("base-convert", "ff", { fromBase: "16", toBase: "2" }), "11111111");
  assert.equal(await runCodec("base-convert", "-ff", { fromBase: "16", toBase: "2" }), "-11111111");
  assert.equal(await runCodec("base-convert", "+42", { fromBase: "10", toBase: "8" }), "52");
  assert.equal(await runCodec("base-convert", "-0", { fromBase: "10", toBase: "2" }), "0");
});

test("base-convert preserves integers beyond JavaScript's safe-number range", async () => {
  const decimal = "123456789012345678901234567890";
  const expected = BigInt(decimal).toString(36);
  assert.equal(await runCodec("base-convert", decimal, { fromBase: "10", toBase: "36" }), expected);
});

test("base-convert rejects partial parses and digits outside the source base", async () => {
  await assert.rejects(runCodec("base-convert", "12z", { fromBase: "10", toBase: "16" }), /Invalid number/);
  await assert.rejects(runCodec("base-convert", "102", { fromBase: "2", toBase: "10" }), /Invalid number/);
  await assert.rejects(runCodec("base-convert", "-", { fromBase: "10", toBase: "2" }), /Invalid number/);
  await assert.rejects(runCodec("base-convert", "1 2", { fromBase: "10", toBase: "2" }), /Invalid number/);
});

test("base-convert enforces supported source and target bases", async () => {
  await assert.rejects(runCodec("base-convert", "10", { fromBase: "1", toBase: "2" }), /fromBase must be 2–36/);
  await assert.rejects(runCodec("base-convert", "10", { fromBase: "10", toBase: "37" }), /toBase must be 2–36/);
});
