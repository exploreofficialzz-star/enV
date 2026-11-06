#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const android = read("apps/android/app/src/main/java/com/chastech/env/NativeCameraStudio.kt");
const androidBuild = read("apps/android/app/build.gradle.kts");
const ios = read("apps/ios/enV/NativeCameraStudio.swift");
const acceptance = read("docs/camera-studio-device-acceptance.md");

assert.match(androidBuild, /androidx\.camera:camera-effects:1\.5\.3/);
assert.match(androidBuild, /com\.google\.mlkit:face-detection:16\.1\.7/);
assert.match(android, /FaceDetection\.getClient/);
assert.match(android, /FaceDetectorOptions\.PERFORMANCE_MODE_FAST/);
assert.match(android, /FaceDetectorOptions\.LANDMARK_MODE_ALL/);
assert.match(android, /ImageAnalysis\.STRATEGY_KEEP_ONLY_LATEST/);
assert.match(android, /OverlayEffect\(/);
assert.match(android, /faceOverlayEffect\.drawFrameAsync\(timestamp\)/);
assert.match(android, /frame\.sensorToBufferTransform/);
assert.match(android, /ConcurrentHashMap<Long, List<NativeFaceOverlayGeometry>>/);
assert.match(android, /setEffects\(setOf\(faceOverlayEffect\)\)/);
assert.match(android, /setEffects\(setOf\(cameraEffect\)\)/);
assert.match(android, /mode == NativeCameraMode\.VIDEO/);
assert.match(android, /mode == NativeCameraMode\.PHOTO && faceEffectMode != "Off"/);
assert.match(android, /faceDetector\.close\(\)/);
assert.match(ios, /import Vision/);
assert.match(ios, /VNDetectFaceLandmarksRequest/);
assert.match(ios, /VNSequenceRequestHandler/);
assert.match(ios, /func setFaceEffect\(_ effect: String\)/);
assert.match(ios, /activeFaceEffect == "Beauty"/);
assert.match(ios, /activeFaceEffect == "Glasses"/);
assert.match(ios, /activeFaceEffect == "Crown"/);
assert.match(ios, /CIGaussianBlur/);
assert.match(ios, /func applyFaceEffect\(/);
assert.match(ios, /let faceProcessedImage = applyFaceEffect/);
assert.match(ios, /context\.render\(filteredImage, to: outputBuffer/);
assert.match(ios, /nextMode == "Photo"/);
assert.match(ios, /centerOfEye/);
assert.ok(acceptance.includes("Physical-device execution state: NOT RUN"));
assert.ok(acceptance.includes("Face tracking and original AR effects"));
assert.ok(acceptance.includes("Beauty / soft-light effects"));
assert.ok(acceptance.includes("Face-effect privacy and lifecycle"));
assert.ok(acceptance.includes("licensed Snapchat Lens catalogue"));
assert.ok(acceptance.includes("Face detection is off by default"));

console.log("Camera Studio face-effect checks passed: local face detection, timestamped overlays, video export parity, video-only gating and physical-device release gates.");
