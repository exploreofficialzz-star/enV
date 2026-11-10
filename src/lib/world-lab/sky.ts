/**
 * Display-grade sun position and sky palette for the representative world.
 * The sun uses the public NOAA solar-position equations (no refraction); it is a
 * visual reference good to roughly half a degree, not an ephemeris. Coordinates
 * follow the scene: +X east, +Y up, +Z north, heading measured clockwise from north.
 */

export type SolarPosition = { altitudeDegrees: number; azimuthDegrees: number };
export type Rgb = readonly [number, number, number];
export type SkyPalette = { zenith: Rgb; horizon: Rgb; glow: Rgb; glowStrength: number };
export type SkyLighting = { ambient: number; sun: number; sunVisible: boolean };

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function approximateSolarPosition(utc: Date, latitudeDegrees: number, longitudeDegrees: number): SolarPosition {
  const julianDay = utc.getTime() / 86_400_000 + 2_440_587.5;
  const t = (julianDay - 2_451_545) / 36_525;
  const meanLongitude = (((280.46646 + t * (36_000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const meanAnomaly = 357.52911 + t * (35_999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const m = meanAnomaly * RAD;
  const centre =
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289;
  const trueLongitude = meanLongitude + centre;
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos(omega * RAD);
  const declination = Math.asin(Math.sin(obliquity * RAD) * Math.sin(apparentLongitude * RAD));
  const y = Math.tan((obliquity * RAD) / 2) ** 2;
  const l0 = meanLongitude * RAD;
  const equationOfTimeMinutes =
    4 * DEG * (y * Math.sin(2 * l0) - 2 * eccentricity * Math.sin(m) +
      4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) -
      0.5 * y * y * Math.sin(4 * l0) - 1.25 * eccentricity * eccentricity * Math.sin(2 * m));
  const utcMinutes = utc.getUTCHours() * 60 + utc.getUTCMinutes() + utc.getUTCSeconds() / 60 + utc.getUTCMilliseconds() / 60_000;
  const solarMinutes = (((utcMinutes + equationOfTimeMinutes + 4 * longitudeDegrees) % 1440) + 1440) % 1440;
  let hourAngle = solarMinutes / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;
  const lat = clamp(latitudeDegrees, -90, 90) * RAD;
  const cosZenith = clamp(Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle * RAD), -1, 1);
  const zenith = Math.acos(cosZenith);
  const denominator = Math.cos(lat) * Math.sin(zenith);
  let azimuth = 180;
  if (Math.abs(denominator) > 1e-9) {
    const raw = DEG * Math.acos(clamp((Math.sin(lat) * cosZenith - Math.sin(declination)) / denominator, -1, 1));
    azimuth = hourAngle > 0 ? (raw + 180) % 360 : (540 - raw) % 360;
  }
  return { altitudeDegrees: 90 - zenith * DEG, azimuthDegrees: azimuth };
}

/** Unit vector toward the sun in scene axes (+X east, +Y up, +Z north). */
export function sunDirection(position: SolarPosition): [number, number, number] {
  const altitude = position.altitudeDegrees * RAD;
  const azimuth = position.azimuthDegrees * RAD;
  return [Math.sin(azimuth) * Math.cos(altitude), Math.sin(altitude), Math.cos(azimuth) * Math.cos(altitude)];
}

type Key = { altitude: number; zenith: Rgb; horizon: Rgb; glow: number };
const KEYS: readonly Key[] = [
  { altitude: -18, zenith: [0.012, 0.02, 0.06], horizon: [0.035, 0.05, 0.11], glow: 0 },
  { altitude: -6, zenith: [0.05, 0.08, 0.2], horizon: [0.2, 0.2, 0.34], glow: 0.35 },
  { altitude: 0, zenith: [0.2, 0.3, 0.58], horizon: [0.96, 0.6, 0.4], glow: 0.85 },
  { altitude: 8, zenith: [0.24, 0.46, 0.8], horizon: [0.86, 0.8, 0.74], glow: 0.45 },
  { altitude: 25, zenith: [0.17, 0.42, 0.82], horizon: [0.72, 0.85, 0.96], glow: 0.18 },
  { altitude: 90, zenith: [0.15, 0.38, 0.8], horizon: [0.7, 0.84, 0.95], glow: 0.1 },
];

const mix = (a: Rgb, b: Rgb, f: number): Rgb => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

export function skyPalette(altitudeDegrees: number): SkyPalette {
  const altitude = clamp(altitudeDegrees, KEYS[0].altitude, 90);
  let index = 0;
  while (index < KEYS.length - 2 && altitude > KEYS[index + 1].altitude) index += 1;
  const a = KEYS[index];
  const b = KEYS[index + 1];
  const f = clamp((altitude - a.altitude) / (b.altitude - a.altitude), 0, 1);
  const glow = a.glow + (b.glow - a.glow) * f;
  return { zenith: mix(a.zenith, b.zenith, f), horizon: mix(a.horizon, b.horizon, f), glow: [1, 0.72, 0.42], glowStrength: glow };
}

export function skyLighting(altitudeDegrees: number): SkyLighting {
  const day = clamp((altitudeDegrees + 4) / 16, 0, 1);
  const twilight = clamp((altitudeDegrees + 18) / 14, 0, 1);
  return { ambient: 0.12 + 0.12 * twilight + 0.61 * day, sun: 0.65 * day, sunVisible: altitudeDegrees > -2 };
}

/** The representative site sits on the equator; its longitude is chosen so the device clock reads local solar time. */
export function representativeSite(now: Date): { latitudeDegrees: number; longitudeDegrees: number } {
  return { latitudeDegrees: 0, longitudeDegrees: -(now.getTimezoneOffset() / 60) * 15 };
}
