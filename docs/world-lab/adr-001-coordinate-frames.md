# ADR 001 — Coordinate and observational frame separation

Status: ACCEPTED FOR REFERENCE LIBRARY ONLY — NOT FOR LIVE EARTH DATA

Date: 2026-10-30

## Decision

Use WGS84 ellipsoidal latitude/longitude/height as the explicit
geodetic input to double-precision Earth-centered/Earth-fixed (ECEF)
coordinates and local tangent East-North-Up (ENU) offsets.
The pure library in `src/lib/world-lab/frames.ts` cannot assert
observed soil, real terrain, underground structure or any astronomical
inertial frame. Real-world imagery, elevations, weather and maps remain
separate versioned data adapters carrying datum, time, resolution, license,
quality flags and uncertainty.

WGS84 **ellipsoidal height is not geoid/orthometric height**. No vertical
datum conversion has been implemented. The current authoring scene uses
a synthetic representative local ENU origin and cannot be reclassified as
measured terrain by changing its camera position.

## Validation and failure behavior

`src/lib/world-lab/frames.test.ts` checks equator and pole reference
values, frame axes, metre-scale roundtrips over 100 km and representative
locations at distinct heights. Reject invalid latitude/longitude and
nonfinite vectors, and explicitly reject Earth's center where geodetic
coordinates are undefined. Future rendering must use camera-relative
origins and bounded LOD transitions; these are **not** implemented here.

## Alternatives and next gate

No unverified Cesium/3D Tiles dataset, no invented underground layer
geometry, no spherical-Earth simplification as a claim of WGS84 accuracy.
Before enabling Earth/space travel, implement licensed geospatial ingestion,
height conventions, floating-origin GPU rendering, representation-change
notices and comparison with independent geodetic fiducials.
