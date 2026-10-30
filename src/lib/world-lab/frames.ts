/**
 * WGS84 geographic and locally tangent ENU coordinate transforms.
 * This does not load or infer terrain/geology datasets, or provide ephemerides.
 * All persistent geodetic/ECEF values use JavaScript double-precision numbers.
 */
export type Vector3Meters = readonly [number, number, number];
export type GeodeticWgs84 = Readonly<{
  latitudeDegrees: number;
  longitudeDegrees: number;
  ellipsoidalHeightMeters: number;
}>;
export const WGS84_SEMI_MAJOR_AXIS_METERS = 6378137;
export const WGS84_FLATTENING = 1 / 298.257223563;
const e2 = WGS84_FLATTENING * (2 - WGS84_FLATTENING);
const b = WGS84_SEMI_MAJOR_AXIS_METERS * (1 - WGS84_FLATTENING);
const radians = (degrees: number) => degrees * Math.PI / 180;
const degrees = (angle: number) => angle * 180 / Math.PI;

function finite(value: number, label: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(label + " must be finite and within " + min + " through " + max + ".");
  }
}
function validCoordinates(point: GeodeticWgs84): void {
  if (!point) throw new Error("A WGS84 geographic anchor is required.");
  finite(point.latitudeDegrees, "Latitude", -90, 90);
  finite(point.longitudeDegrees, "Longitude", -180, 180);
  finite(point.ellipsoidalHeightMeters, "Ellipsoidal height (m)", -12000, 100000000);
}
function validVector(point: Vector3Meters): void {
  if (!Array.isArray(point) || point.length !== 3) throw new Error("A 3D vector in metres is required.");
  point.forEach(value => finite(value, "Coordinate (m)", -1e11, 1e11));
}

export function geodeticToEcef(point: GeodeticWgs84): Vector3Meters {
  validCoordinates(point);
  const latitude = radians(point.latitudeDegrees);
  const longitude = radians(point.longitudeDegrees);
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const n = WGS84_SEMI_MAJOR_AXIS_METERS / Math.sqrt(1 - e2 * sinLat * sinLat);
  return [
    (n + point.ellipsoidalHeightMeters) * cosLat * Math.cos(longitude),
    (n + point.ellipsoidalHeightMeters) * cosLat * Math.sin(longitude),
    (n * (1 - e2) + point.ellipsoidalHeightMeters) * sinLat,
  ];
}

export function ecefToGeodetic(ecef: Vector3Meters): GeodeticWgs84 {
  validVector(ecef);
  const [x, y, z] = ecef;
  const p = Math.hypot(x, y);
  if (p < 1e-9) {
    if (Math.abs(z) < 1e-9) throw new Error("The Earth's center has no defined geodetic coordinates.");
    return {
      latitudeDegrees: Math.sign(z) * 90,
      longitudeDegrees: 0,
      ellipsoidalHeightMeters: Math.abs(z) - b,
    };
  }
  const longitude = Math.atan2(y, x);
  let latitude = Math.atan2(z, p * (1 - e2));
  for (let iteration = 0; iteration < 12; iteration++) {
    const sinLat = Math.sin(latitude);
    const n = WGS84_SEMI_MAJOR_AXIS_METERS / Math.sqrt(1 - e2 * sinLat * sinLat);
    const next = Math.atan2(z + e2 * n * sinLat, p);
    if (Math.abs(next - latitude) < 1e-14) {
      latitude = next;
      break;
    }
    latitude = next;
  }
  const sinLat = Math.sin(latitude);
  const n = WGS84_SEMI_MAJOR_AXIS_METERS / Math.sqrt(1 - e2 * sinLat * sinLat);
  const cosLat = Math.cos(latitude);
  const height = Math.abs(cosLat) < 1e-12 ?
    Math.abs(z) - b : p / cosLat - n;
  const result = {
    latitudeDegrees: degrees(latitude),
    longitudeDegrees: degrees(longitude),
    ellipsoidalHeightMeters: height,
  };
  validCoordinates(result);
  return result;
}

function basis(anchor: GeodeticWgs84) {
  validCoordinates(anchor);
  const lat = radians(anchor.latitudeDegrees);
  const lon = radians(anchor.longitudeDegrees);
  const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
  return {
    east: [-so, co, 0] as Vector3Meters,
    north: [-sl * co, -sl * so, cl] as Vector3Meters,
    up: [cl * co, cl * so, sl] as Vector3Meters,
  };
}
function dot(a: Vector3Meters, b: Vector3Meters) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Convert double-precision planet ECEF coordinates to local ENU metres. */
export function ecefToLocalEnu(ecef: Vector3Meters, anchor: GeodeticWgs84): Vector3Meters {
  validVector(ecef);
  const origin = geodeticToEcef(anchor);
  const delta: Vector3Meters = [ecef[0] - origin[0], ecef[1] - origin[1], ecef[2] - origin[2]];
  const frame = basis(anchor);
  return [dot(delta, frame.east), dot(delta, frame.north), dot(delta, frame.up)];
}

/** Convert local ENU meters to the global Earth-fixed frame. */
export function localEnuToEcef(enu: Vector3Meters, anchor: GeodeticWgs84): Vector3Meters {
  validVector(enu);
  const origin = geodeticToEcef(anchor);
  const frame = basis(anchor);
  return [
    origin[0] + enu[0] * frame.east[0] + enu[1] * frame.north[0] + enu[2] * frame.up[0],
    origin[1] + enu[0] * frame.east[1] + enu[1] * frame.north[1] + enu[2] * frame.up[1],
    origin[2] + enu[0] * frame.east[2] + enu[1] * frame.north[2] + enu[2] * frame.up[2],
  ];
}
