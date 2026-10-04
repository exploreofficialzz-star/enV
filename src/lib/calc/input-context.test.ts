import test from "node:test";
import assert from "node:assert/strict";
import { CalcInputError } from "./numeric.ts";
import { readInteger, readList, readNumber, readPositive, trackCalculatorInputs, withTrackedInputs } from "./input-context.ts";

type Definition = { fields: Array<{ name: string; label: string }>; compute: (values: Record<string, string>) => unknown };

function registry(compute: Definition["compute"]): Record<string, Definition> {
  const entries: Record<string, Definition> = {
    force: {
      fields: [
        { name: "mass", label: "Mass" },
        { name: "accel", label: "Acceleration" },
      ],
      compute,
    },
  };
  trackCalculatorInputs(entries);
  return entries;
}

const force = registry((v) => readNumber(v.mass) * readNumber(v.accel));

test("errors name the on-screen label of the input that was read", () => {
  assert.equal(force.force.compute({ mass: "2", accel: "3" }), 6);
  assert.throws(() => force.force.compute({ mass: "", accel: "3" }), /Enter a value for Mass\./);
  assert.throws(() => force.force.compute({ mass: "2", accel: "abc" }), /Enter a valid number for Acceleration/);
});

test("errors carry the field name so the UI can mark the input", () => {
  try {
    force.force.compute({ mass: "2", accel: "" });
    assert.fail("expected an error");
  } catch (error) {
    if (!(error instanceof CalcInputError)) throw error;
    assert.equal(error.field, "accel");
  }
});

test("a value that was transformed before parsing is never attributed to a field", () => {
  const entries = registry((v) => readNumber(`${v.mass} `));
  assert.throws(() => entries.force.compute({ mass: "x", accel: "1" }), /Enter a valid number for value /);
});

test("an explicit label wins over the tracked one", () => {
  const entries = registry((v) => readNumber(v.mass, "weight"));
  assert.throws(() => entries.force.compute({ mass: "", accel: "1" }), /Enter a value for weight\./);
});

test("readPositive and readInteger use the tracked label", () => {
  const positive = registry((v) => readPositive(v.mass));
  assert.throws(() => positive.force.compute({ mass: "0", accel: "1" }), /Mass must be greater than 0\./);
  const whole = registry((v) => readInteger(v.accel));
  assert.throws(() => whole.force.compute({ mass: "1", accel: "2.5" }), /Acceleration must be a whole number\./);
  assert.equal(whole.force.compute({ mass: "1", accel: "4" }), 4);
});

test("lists name the field and report every unreadable token", () => {
  const list = registry((v) => readList(v.mass));
  assert.throws(() => list.force.compute({ mass: "1, x, 3", accel: "1" }), /Could not read "x" as a number in Mass/);
  assert.throws(() => list.force.compute({ mass: "", accel: "1" }), /Enter at least one number in Mass/);
  assert.deepEqual(list.force.compute({ mass: "1 2\n3;4", accel: "1" }), [1, 2, 3, 4]);
});

test("without a tracking frame the generic label is used", () => {
  assert.throws(() => readNumber(""), /Enter a value for value\./);
  assert.throws(() => readList("a b"), /Could not read "a", "b" as numbers in the list/);
});

test("frames nest and restore", () => {
  const outer = { mass: "", accel: "1" };
  const inner = { mass: "5", accel: "" };
  withTrackedInputs([{ name: "mass", label: "Mass" }, { name: "accel", label: "Acceleration" }], outer, (tracked) => {
    withTrackedInputs([{ name: "mass", label: "Inner mass" }, { name: "accel", label: "Inner accel" }], inner, (innerTracked) => {
      assert.throws(() => readNumber(innerTracked.accel), /Inner accel/);
    });
    assert.throws(() => readNumber(tracked.mass), /Enter a value for Mass\./);
  });
});

test("tracking works with numeric inputs as well as strings", () => {
  const entries = registry((v) => readNumber(v.mass) + readNumber(v.accel));
  assert.equal(entries.force.compute({ mass: 2, accel: 3 } as unknown as Record<string, string>), 5);
});
