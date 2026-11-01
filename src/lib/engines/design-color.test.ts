import test from "node:test";
import assert from "node:assert/strict";
import { formatCmyk, formatHsv, formatHwb, formatOklch, hsvToRgb, parseDesignColor, rgbToHsv } from "./design-color.ts";
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


test("HWB CSS colors parse hue units, alpha and whiteness/blackness", () => {
  assert.equal(toHex(parseDesignColor("hwb(0 0% 0%)")!), "#ff0000");
  assert.equal(toHex(parseDesignColor("hwb(120 0% 0% / 50%)")!), "#00ff0080");
  assert.equal(toHex(parseDesignColor("hwb(240 20% 20%)")!), "#3333cc");
  assert.equal(toHex(parseDesignColor("hwb(90 50% 50%)")!), "#808080");
  assert.equal(parseDesignColor("hwb(0 110% 0%)"), null);
});

test("OKLCH CSS colors parse and round-trip with bounded sRGB output", () => {
  assert.equal(toHex(parseDesignColor("oklch(62.8% 0.2577 29.2)")!), "#ff0000");
  assert.equal(toHex(parseDesignColor("oklch(0.62796 0.2577 29.2 / 50%)")!), "#ff000080");
  for (const hex of ["#ff0000", "#00aa88", "#347fc4", "#808080", "#ffffff"]) {
    const parsed = parseDesignColor(hex)!;
    const output = formatOklch(parsed);
    const rebuilt = parseDesignColor(output)!;
    const channels = [parsed.r, parsed.g, parsed.b];
    const rebuiltChannels = [rebuilt.r, rebuilt.g, rebuilt.b];
    assert.ok(channels.every((channel, index) => Math.abs(channel - rebuiltChannels[index]) <= 2), `${hex} -> ${output}`);
  }
});

test("HWB and OKLCH formatters produce copyable CSS Color 4 values", () => {
  const color = parseDesignColor("#0d9f8a")!;
  assert.match(formatHwb(color), /^hwb\(\d+ \d+% \d+%\)$/);
  assert.match(formatOklch(color), /^oklch\(\d+\.\d% \d+\.\d{3} \d+\.\d\)$/);
});
