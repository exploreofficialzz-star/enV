import assert from "node:assert/strict";
import test from "node:test";
import { approximateSolarPosition, representativeSite, skyLighting, skyPalette, sunDirection } from "./sky.ts";

test("equinox solar noon on the equator is nearly overhead", () => {
  const p = approximateSolarPosition(new Date("2026-03-20T12:07:00Z"), 0, 0);
  assert.ok(p.altitudeDegrees > 88 && p.altitudeDegrees <= 90.01, String(p.altitudeDegrees));
});

test("equinox sunrise rises in the east and sunset sets in the west", () => {
  const rise = approximateSolarPosition(new Date("2026-03-20T06:07:00Z"), 0, 0);
  const set = approximateSolarPosition(new Date("2026-03-20T18:07:00Z"), 0, 0);
  assert.ok(Math.abs(rise.altitudeDegrees) < 3 && Math.abs(rise.azimuthDegrees - 90) < 6, JSON.stringify(rise));
  assert.ok(Math.abs(set.altitudeDegrees) < 3 && Math.abs(set.azimuthDegrees - 270) < 6, JSON.stringify(set));
});

test("midnight sun is far below the horizon", () => {
  assert.ok(approximateSolarPosition(new Date("2026-03-20T00:07:00Z"), 0, 0).altitudeDegrees < -80);
});

test("sun direction is a unit vector with +Y up", () => {
  const [x, y, z] = sunDirection({ altitudeDegrees: 30, azimuthDegrees: 90 });
  assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-12);
  assert.ok(Math.abs(y - 0.5) < 1e-12 && x > 0.8 && Math.abs(z) < 1e-9);
});

test("palette and lighting are continuous and bounded across the day", () => {
  let previous = skyPalette(-30);
  for (let altitude = -30; altitude <= 90; altitude += 1) {
    const palette = skyPalette(altitude);
    for (const channel of [...palette.zenith, ...palette.horizon]) assert.ok(channel >= 0 && channel <= 1);
    assert.ok(Math.abs(palette.horizon[0] - previous.horizon[0]) < 0.16, `jump at ${altitude}`);
    previous = palette;
    const light = skyLighting(altitude);
    assert.ok(light.ambient >= 0.1 && light.ambient <= 1 && light.sun >= 0 && light.sun <= 0.7);
  }
  assert.equal(skyLighting(-30).sunVisible, false);
  assert.equal(skyLighting(40).sunVisible, true);
  assert.ok(skyLighting(-30).ambient < skyLighting(40).ambient);
});

test("representative site maps the device clock to local solar time", () => {
  const site = representativeSite(new Date("2026-06-01T10:00:00Z"));
  assert.equal(site.latitudeDegrees, 0);
  assert.ok(site.longitudeDegrees >= -180 && site.longitudeDegrees <= 180);
});
