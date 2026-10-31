import test from "node:test";
import assert from "node:assert/strict";
import { formatCmyk, formatHsv, hsvToRgb, parseDesignColor, rgbToHsv } from "./design-color.ts";
import { toHex } from "./accessibility-color.ts";

test("HSV and HSB accept percentages, unit fractions, commas and hue degrees", () => {
  assert.equal(toHex(parseDesignColor("hsv(0deg 100% 100%)")!), "#ff0000");
  assert.equal(toHex(parseDesignColor("hsb(120, 1, 1)")!), "#00ff00");
  assert.equal(toHex(parseDesignColor("hsv(240 1 1)")!), "#0000ff");
  assert.equal(toHex(parseDesignColor("hsv(60 100 100)")!), "#ffff00");
});

test("CMYK accepts percentage and normalized inputs", () => {
  assert.equal(toHex(parseDesignColor("cmyk(100%, 0%, 0%, 0%)")!), "#00ffff");
  assert.equal(toHex(parseDesignColor("cmyk(0, 1, 0, 0)")!), "#ff00ff");
  assert.equal(toHex(parseDesignColor("cmyk(0%, 0%, 0%, 100%)")!), "#000000");
});

test("HSV conversion round-trips primary and achromatic colors", () => {
  for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000", "#808080"]) {
    const parsed = parseDesignColor(hex)!;
    const hsv = rgbToHsv(parsed);
    const rebuilt = hsvToRgb(hsv.h, hsv.s, hsv.v);
    assert.equal(toHex(rebuilt), hex);
  }
});

test("formatters return standard copyable converter strings", () => {
  const cyan = parseDesignColor("#00ffff")!;
  assert.equal(formatHsv(cyan), "hsv(180 100% 100%)");
  assert.equal(formatCmyk(cyan), "cmyk(100%, 0%, 0%, 0%)");
  assert.equal(formatCmyk(parseDesignColor("#000000")!), "cmyk(0%, 0%, 0%, 100%)");
});

test("invalid HSV and CMYK values are rejected", () => {
  for (const value of ["hsv(0 120% 100%)", "hsv(0 0.8oops 1)", "hsx(0 1 1)", "cmyk(101%,0%,0%,0%)", "cmyk(-1,0,0,0)", "cmyk(1,2,3)"]) {
    assert.equal(parseDesignColor(value), null, value);
  }
});
