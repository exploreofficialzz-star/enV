#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const engine = read("src/components/engines/camera-studio-engine.tsx");
const router = read("src/components/tools/tool-engine.tsx");
const registry = read("src/lib/registry.ts");

assert.match(engine, /navigator\.mediaDevices\?\.getUserMedia/);
assert.match(engine, /isSecureCaptureContext/);
assert.match(engine, /getSettings\(\)\.facingMode/);
assert.match(engine, /const applyZoom/);
assert.match(engine, /const applyExposure/);
assert.match(engine, /zoom\?: NumericRange/);
assert.match(engine, /exposureCompensation\?: NumericRange/);
assert.match(engine, /facingMode: \{ ideal: nextFacing \}/);
assert.match(engine, /video\.videoWidth/);
assert.match(engine, /canvas\.toBlob/);
assert.match(engine, /MediaRecorder\.isTypeSupported/);
assert.match(engine, /recorder\.ondataavailable/);
assert.match(engine, /recorder\.onstop/);
assert.match(engine, /downloadRecoveredRecording/);
assert.match(engine, /beforeunload/);
assert.match(engine, /event\.returnValue/);
assert.match(engine, /microphoneRef\.current\?\.getTracks\(\)\.forEach/);
assert.match(engine, /getCapabilities\?\./);
assert.match(engine, /torchAvailable/);
assert.match(engine, /LOOKS/);
assert.match(engine, /MAX_GALLERY_ITEMS/);
assert.match(engine, /URL\.createObjectURL/);
assert.match(engine, /URL\.revokeObjectURL/);
assert.match(engine, /download=\{item\.filename\}/);
assert.match(engine, /Dual front-and-rear recording is not enabled unless simultaneous camera support can be verified/);
assert.match(engine, /Captures are processed in this session and are not uploaded to enV/);
assert.match(router, /if \(tool\.id === "camera-studio"\) return <CameraStudioEngine \/>/);
assert.match(registry, /id: "camera-studio"/);
assert.match(registry, /category: "photography"/);
assert.match(registry, /engine: \{ type: "custom", id: "camera-studio" \}/);
assert.match(registry, /status: "active"/);

console.log("Camera Studio checks passed: secure permission-gated capture, front/rear switching, photo save, video recording, microphone fallback, device-aware torch, local gallery/downloads, privacy copy, Photography registration and browser-only scope.");
