#!/usr/bin/env node
import "./check-camera-studio-face-effects.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const engine = read("src/components/engines/camera-studio-engine.tsx");
const router = read("src/components/tools/tool-engine.tsx");
const enginePreload = read("src/lib/tool-engine-preload.ts");
const registry = read("src/lib/registry.ts");
const androidCamera = read("apps/android/app/src/main/java/com/chastech/env/NativeCameraStudio.kt");
const androidMain = read("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
const androidCatalog = read("apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt");
const androidCatalogTests = read("apps/android/app/src/test/java/com/chastech/env/data/CatalogModelsTest.kt");
const iosCamera = read("apps/ios/enV/NativeCameraStudio.swift");
const iosViews = read("apps/ios/enV/ToolViews.swift");
const iosCatalog = read("apps/ios/enV/CatalogCore.swift");
const iosCatalogTests = read("apps/ios/enVTests/CatalogCoreTests.swift");
const iosInfo = read("apps/ios/enV/Info.plist");
const androidManifest = read("apps/android/app/src/main/AndroidManifest.xml");
const vercelConfig = JSON.parse(read("vercel.json"));
const productionReadiness = read("docs/production-readiness.md");
const iosProject = read("apps/ios/enV.xcodeproj/project.pbxproj");
const nativeCoverage = read("scripts/check-native-coverage.mjs");
const androidCoverage = read("apps/android/native-tool-coverage.txt");
const iosCoverage = read("apps/ios/native-tool-coverage.txt");
const inventory = JSON.parse(read("apps/shared/native-engine-inventory.json"));
const billingProfiles = JSON.parse(read("src/data/billing-profile-runtime-extensions.json"));
const deviceAcceptance = read("docs/camera-studio-device-acceptance.md");
const androidBuild = read("apps/android/app/build.gradle.kts");


// Camera Studio parity upgrade: true second-device browser capture and native controls.
assert.match(engine, /const startDualCamera/);
assert.doesNotMatch(
  engine,
  /if \(facing === "user"\) \{\s*context\.translate\(canvas\.width, 0\);\s*context\.scale\(-1, 1\);/,
  "Photo capture must mirror each camera feed once through drawCover, not flip the composite canvas twice."
);
assert.match(engine, /drawCover\(context, video, 0, 0, canvas\.width, canvas\.height, facing === "user"\)/);
assert.match(engine, /enumerateDevices\(\)/);
assert.match(engine, /dualStreamRef\.current/);
assert.match(engine, /drawCover\(recordingContext/);
assert.match(engine, /setDualLayout\("pip"\)/);
assert.match(engine, /setDualLayout\("split"\)/);
assert.match(engine, /Second camera preview/);
assert.match(engine, /second camera is still starting/i);
assert.match(androidCamera, /timerSeconds/);
assert.match(androidCamera, /capturePhotoWithTimer/);
assert.match(androidCamera, /gridEnabled/);
assert.match(androidCamera, /QualitySelector\.from/);
assert.match(androidCamera, /FallbackStrategy\.lowerQualityOrHigherThan/);
assert.match(androidCamera, /setVideoCaptureTargetFrameRate/);
assert.match(androidCamera, /ProcessCameraProvider\.getInstance/);
assert.match(androidCamera, /availableConcurrentCameraInfos/);
assert.match(androidCamera, /FEATURE_CAMERA_CONCURRENT/);
assert.match(androidCamera, /ConcurrentCamera\.SingleCameraConfig/);
assert.match(androidCamera, /concurrentCamera\.cameras\.forEach/);
assert.match(androidCamera, /Camera2CameraControl\.from\(activeCamera\.cameraControl\)/, "Android concurrent camera feeds request stabilization independently.");
assert.match(androidCamera, /CaptureRequest\.CONTROL_VIDEO_STABILIZATION_MODE_ON/);
assert.match(androidCamera, /Camera2CameraControl\.from\(activeCamera\.cameraControl\)/, "Android concurrent feeds request stabilization independently when supported.");
assert.match(androidCamera, /UseCaseGroup\.Builder/);
assert.match(androidCamera, /VideoCapture\.withOutput/);
assert.match(androidCamera, /withAudioEnabled\(\)/);
assert.match(androidCamera, /NativeDualCameraStudioScreen/);
const androidDualCameraScreen = androidCamera.slice(androidCamera.indexOf("private fun NativeDualCameraStudioScreen"));
assert.match(
  androidDualCameraScreen,
  /if \(disposeAfterRecording\.compareAndSet\(true, false\)\) \{[\s\S]*?currentProvider\.unbind\(currentPreview, currentVideo\)/,
  "Leaving dual-camera mode during recording must unbind concurrent use cases after recording finalization."
);
assert.match(androidCamera, /videoFrameRate/);
assert.ok(androidCamera.includes("Save canceled. Your photo is still ready to save."));
assert.match(androidCamera, /Your capture is still available to retry/);
assert.ok(androidCamera.includes('Text("Discard")'));
assert.match(iosCamera, /func setFocusLocked/);
assert.match(iosCamera, /func setWhiteBalance/);
assert.match(iosCamera, /func setManualExposure/);
assert.match(iosCamera, /func setVideoStabilization\(_ enabled: Bool\)/);
assert.match(iosCamera, /func refreshVideoStabilizationSupport\(requested: Bool\)/);
assert.match(iosCamera, /refreshVideoStabilizationSupport\(requested: videoStabilizationEnabled\)/);
assert.match(iosCamera, /connection\.isVideoStabilizationSupported/);
assert.match(iosCamera, /preferredVideoStabilizationMode = enabled \? \.auto : \.off/);
const iosDualCameraStabilization = iosCamera.slice(iosCamera.indexOf("private final class NativeDualCameraCapture"));
assert.match(iosDualCameraStabilization, /connection\.isVideoStabilizationSupported/);
assert.match(iosDualCameraStabilization, /preferredVideoStabilizationMode = \.auto/);
const iosDualPreviewConnections = iosDualCameraStabilization.slice(
  iosDualCameraStabilization.indexOf("func connectPreviewLayers"),
  iosDualCameraStabilization.indexOf("func startRecording")
);
assert.match(iosDualPreviewConnections, /backConnection\.isVideoStabilizationSupported/);
assert.match(iosDualPreviewConnections, /frontConnection\.isVideoStabilizationSupported/);
assert.match(iosCamera, /preferredVideoStabilizationMode = \.auto/);
assert.match(iosCamera, /"Video stabilization"/);
assert.ok(iosCamera.includes("AVCaptureMultiCamSession"));
assert.ok(iosCamera.includes("isMultiCamSupported"));
assert.ok(iosCamera.includes("hardwareCost"));
assert.ok(iosCamera.includes("systemPressureCost"));
assert.match(iosCamera, /setExposureModeCustom/);
assert.match(iosCamera, /manualISORange/);
assert.match(iosCamera, /manualShutterRange/);
assert.match(iosCamera, /recentCaptures/);
assert.match(iosCamera, /case fade = "Fade"/);
assert.match(iosCamera, /case sunset = "Sunset"/);
assert.match(iosCamera, /case glow = "Glow"/);

assert.match(engine, /navigator\.mediaDevices\?\.getUserMedia/);
const cameraDescription = "Take photos and record videos. Switch between the front and back cameras, zoom in or out, adjust brightness, apply color filters, and save your captures to your device.";
assert.ok(registry.includes(`description: "${cameraDescription}"`), "Web catalogue uses direct, user-facing Camera Studio copy");
assert.ok(androidCatalog.includes(`description = "${cameraDescription}"`), "Android catalogue uses the same Camera Studio copy");
assert.ok(iosCatalog.includes(`description: "${cameraDescription}"`), "iOS catalogue uses the same Camera Studio copy");
assert.doesNotMatch(registry, /with a familiar camera/);
const cameraPolicy = vercelConfig.headers.flatMap((header) => header.headers ?? []).find((header) => header.key === "Permissions-Policy");
assert.equal(cameraPolicy?.value, "camera=(self), geolocation=(), microphone=(self)", "The application must allow first-party browser camera access.");
assert.ok(productionReadiness.includes("Permissions-Policy: camera=(self), geolocation=(), microphone=(self)"), "Deployment documentation matches the browser camera policy");
assert.ok(androidManifest.includes("android.permission.CAMERA"), "Android declares camera permission");
assert.ok(iosInfo.includes("enV uses the camera when you scan a QR code, take a photo, record a video, or start a live video performance."), "iOS camera permission prompt explains Camera Studio use");
assert.ok(iosInfo.includes("enV uses the microphone when you record audio or video with sound."), "iOS microphone permission prompt explains video audio use");
assert.match(engine, /isSecureCaptureContext/);
assert.match(engine, /initialCameraRequestRef/);
assert.match(engine, /void requestCamera\("environment"\)/);
assert.doesNotMatch(engine, /Your camera preview will appear here|camera preview could not start|Wait for the camera preview/);
assert.ok(engine.includes("The camera is still starting. Try again in a moment."));
assert.ok(engine.includes(">Video quality</label>"));
assert.ok(engine.includes(">Frame rate</label>"));
assert.doesNotMatch(engine, /Your camera preview will appear here|Allow camera access when your browser asks|Start camera/);
assert.match(engine, /getSettings\(\)\.facingMode/);
assert.match(engine, /facingMode: \{ ideal: nextFacing \}/);
assert.match(engine, /VIDEO_QUALITIES/);
assert.match(engine, /applyVideoQuality/);
assert.match(engine, /frameRate: \{ ideal: frameRate \}/);
assert.match(engine, /video\.videoWidth/);
assert.match(engine, /canvas\.toBlob/);
assert.match(engine, /recordingCanvas\.captureStream\(outputFrameRate\)/);
assert.match(engine, /getSettings\(\)\.frameRate/);
assert.match(engine, /recordingContext\.filter = look\.css/);
assert.match(engine, /MediaRecorder\.isTypeSupported/);
assert.match(engine, /recorder\.ondataavailable/);
assert.match(engine, /recorder\.onstop/);
assert.match(engine, /downloadRecoveredRecording/);
assert.match(engine, /beforeunload/);
assert.match(engine, /cameraTrack\.addEventListener\("ended", finalizeOnCameraEnd\)/);
assert.match(engine, /cameraTrack\.removeEventListener\("ended", finalizeOnCameraEnd\)/);
assert.match(engine, /recorder\.stop\(\)/);
assert.match(engine, /event\.returnValue/);
assert.match(engine, /microphoneRef\.current\?\.getTracks\(\)\.forEach/);
assert.match(engine, /getCapabilities\?\./);
assert.match(engine, /const applyZoom/);
assert.match(engine, /const applyExposure/);
assert.match(engine, /torchAvailable/);
assert.match(engine, /LOOKS/);
assert.match(engine, /\[0, 3, 10\]/);
assert.match(engine, /MAX_GALLERY_ITEMS/);
assert.match(engine, /URL\.createObjectURL/);
assert.match(engine, /URL\.revokeObjectURL/);
assert.match(engine, /download=\{item\.filename\}/);
assert.doesNotMatch(engine, /Dual front-and-rear recording and face-tracking AR masks are not enabled in this browser-first release/);
assert.doesNotMatch(engine, /Captures are processed in this session and are not uploaded to enV/);
assert.match(router, /const CameraStudioEngine = lazy\(\(\) => import\("@\/components\/engines\/camera-studio-engine"\)/);
assert.match(enginePreload, /if \(tool\.id === "camera-studio"\)[\s\S]*?import\("@\/components\/engines\/camera-studio-engine"\)/, "Camera Studio must be preloaded before its platform route commits");
assert.match(router, /if \(tool\.id === "camera-studio"\) return <CameraStudioEngine \/>/);
assert.match(registry, /id: "camera-studio"/);
assert.match(registry, /category: "photography"/);
assert.match(registry, /engine: \{ type: "custom", id: "camera-studio" \}/);
assert.match(registry, /status: "active"/);

assert.match(androidCamera, /LifecycleCameraController/);
assert.ok(
  androidCamera.includes("LaunchedEffect(\\n        videoStabilizationEnabled,\\n        mode,\\n        videoStabilizationModes,\\n        cameraGranted,\\n        usingFrontCamera,\\n        selectedRearCameraId\\n    )"),
  "Android stabilization settings react to camera/lens switches."
);
assert.ok(
  androidCamera.includes("if (cameraGranted) applyAdvancedCameraSettings()"),
  "Android camera settings re-apply ON/OFF after each camera/lens switch."
);
assert.match(androidCamera, /if \\(cameraGranted\\) applyAdvancedCameraSettings\\(\\)/, "Android camera settings re-apply ON/OFF after each camera/lens switch.");
assert.match(androidCamera, /requestCameraAccess\(\)/);
assert.match(androidCamera, /Settings\.ACTION_APPLICATION_DETAILS_SETTINGS/);
assert.doesNotMatch(androidCamera, /Your camera preview appears here|Allow camera access to begin|Enable camera/);
assert.match(androidCamera, /import androidx\.compose\.runtime\.livedata\.observeAsState/);
assert.match(androidCamera, /DisposableEffect\(controller, lifecycleOwner, cameraGranted, [a-zA-Z]+\)/);
assert.match(androidCamera, /if \(cameraGranted && .+\) controller\.bindToLifecycle\(lifecycleOwner\)/);
assert.match(androidCamera, /PreviewView/);
assert.match(androidCamera, /controller\.takePicture/);
assert.match(androidCamera, /controller\.startRecording/);
assert.match(androidCamera, /includeAudio &&\s*ContextCompat\.checkSelfPermission\(context, Manifest\.permission\.RECORD_AUDIO\) == PackageManager\.PERMISSION_GRANTED/);
assert.match(androidCamera, /AudioConfig\.create\(false\)/);
assert.match(androidCamera, /RequestPermission/);
assert.match(androidCamera, /CreateDocument/);
assert.match(androidCamera, /copyCameraFile/);
assert.match(androidCamera, /DEFAULT_FRONT_CAMERA/);
assert.match(androidCamera, /DEFAULT_BACK_CAMERA/);
assert.match(androidCamera, /setPinchToZoomEnabled\(true\)/);
assert.match(androidCamera, /setTapToFocusEnabled\(true\)/);
assert.match(androidCamera, /controller\.setLinearZoom\(it\)/);
assert.match(androidCamera, /setExposureCompensationIndex\(index\)/);
assert.match(androidCamera, /Media3Effect/);
assert.match(androidCamera, /CameraEffect\.PREVIEW or CameraEffect\.VIDEO_CAPTURE or CameraEffect\.IMAGE_CAPTURE/);
assert.match(androidCamera, /cameraEffect\.setEffects\(nativeCameraEffects\(selectedLook\)\)/);
assert.match(androidCamera, /addEffect\(cameraEffect\)/);
assert.match(androidCamera, /CameraCharacteristics\.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR/);
assert.match(androidCamera, /CaptureRequest\.SENSOR_SENSITIVITY/);
assert.match(androidCamera, /CaptureRequest\.SENSOR_EXPOSURE_TIME/);
assert.match(androidCamera, /CaptureRequest\.LENS_FOCUS_DISTANCE/);
assert.match(androidCamera, /CaptureRequest\.CONTROL_AWB_MODE/);
assert.match(androidCamera, /CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES/);
assert.match(androidCamera, /CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON/);
assert.match(androidCamera, /videoStabilizationEnabled/);
assert.match(androidCamera, /videoStabilizationEnabled by remember \{ mutableStateOf\(true\) \}/, "Android enables hardware stabilization by default where the active camera supports it.");
assert.doesNotMatch(androidCamera, /if \(!videoStabilizationModes\.contains\(CaptureRequest\.CONTROL_VIDEO_STABILIZATION_MODE_ON\)\) videoStabilizationEnabled = false/, "Unsupported lenses must not erase the user's stabilization preference.");
assert.match(iosCamera, /self\.videoStabilizationEnabled = requested/);
assert.match(iosCamera, /self\.videoStabilizationEnabled = enabled/, "iOS preserves the stabilization preference when a lens lacks support.");
assert.match(androidCamera, /LaunchedEffect\(\s*videoStabilizationEnabled,[\s\S]*?videoStabilizationModes,[\s\S]*?usingFrontCamera,[\s\S]*?selectedRearCameraId[\s\S]*?\)/);
assert.match(androidCamera, /if \(cameraGranted\) applyAdvancedCameraSettings\(\)/, "Android camera settings re-apply ON/OFF after each camera/lens switch.");
assert.match(androidCamera, /videoStabilizationEnabled = videoStabilizationModes\.contains\(CaptureRequest\.CONTROL_VIDEO_STABILIZATION_MODE_ON\)/, "Resetting pro controls restores supported stabilization.");
assert.match(androidCamera, /Video stabilization/);
assert.match(androidCamera, /Reset pro controls/);
assert.match(androidCamera, /disposeAfterRecording\.set\(true\)/);
assert.match(androidCamera, /activeRecording\.stop\(\)/);
assert.match(androidCamera, /rememberUpdatedState\(recording\)/);
assert.match(androidCamera, /latestRecording\.value/);
assert.ok((androidCamera.match(/if \(disposing\) \{/g) ?? []).length >= 2, "Android discards a recording finalized after Camera Studio closes");
assert.match(androidCamera, /file\?\.delete\(\)/);
assert.ok((androidCamera.match(/disposeAfterRecording\.compareAndSet\(true, false\)/g) ?? []).length >= 4, "Android always unbinds after success or failed recording finalization");
assert.match(androidMain, /NativeCameraStudioScreen\(\)/);
assert.match(androidMain, /tool\.id == "camera-studio" -> true/);
assert.match(androidMain, /withCameraStudio\(\)/);
assert.match(androidCatalog, /fun Catalog\.withCameraStudio\(\)/);
assert.match(androidCatalogTests, /runtimeCameraStudioAdditionIsUniqueAndSearchable/);

assert.match(iosCamera, /AVCaptureSession/);
assert.match(iosCamera, /\.onAppear\s*\{[\s\S]*?capture\.start\(\)/, "iOS Camera Studio starts from its view lifecycle");
assert.match(iosCamera, /UIApplication\.openSettingsURLString/);
assert.doesNotMatch(iosCamera, /Allow camera access to start|Button\("Start camera"\)/);
assert.match(iosCamera, /AVCapturePhotoOutput/);
assert.match(iosCamera, /AVCaptureVideoDataOutput/);
assert.match(iosCamera, /AVAssetWriter/);
assert.match(iosCamera, /startVideo\(look: NativeCameraLook\)/);
assert.match(iosCamera, /videoDataOutput\.setSampleBufferDelegate\(self, queue: queue\)/);
assert.match(iosCamera, /writer\.finishWriting/);
assert.match(iosCamera, /applyNativeCameraLook/);
assert.match(iosCamera, /func selectLens\(uniqueID:/);
assert.match(iosCamera, /builtInUltraWideCamera/);
assert.match(iosCamera, /AVCaptureSessionWasInterrupted/);
assert.match(iosCamera, /AVCaptureSessionInterruptionEnded/);
assert.match(iosCamera, /AVCaptureSessionRuntimeError/);
const iosDualCamera = iosCamera.slice(iosCamera.indexOf("private final class NativeDualCameraCapture"));
assert.match(iosDualCamera, /AVCaptureSessionWasInterrupted/, "iOS dual-camera mode observes system interruptions.");
assert.match(iosDualCamera, /AVCaptureSessionInterruptionEnded/, "iOS dual-camera mode reconnects after interruption ends.");
assert.match(iosDualCamera, /AVCaptureSessionRuntimeError/, "iOS dual-camera mode handles capture runtime errors.");
assert.match(iosDualCamera, /mediaServicesWereReset/, "iOS dual-camera mode handles media-services resets.");
assert.match(iosDualCamera, /resumeAfterFinalization/, "iOS dual-camera mode resumes only after an interrupted clip has finalized.");
assert.match(iosDualCamera, /restartSessionLocked/, "iOS dual-camera mode has a guarded session recovery path.");
assert.match(iosCamera, /mediaServicesWereReset/);
assert.match(iosCamera, /PHPhotoLibrary\.shared\(\)\.performChanges/);
assert.match(iosCamera, /requestAccess\(for: \.audio\)/);
assert.match(iosCamera, /func switchCamera\(\)/);
assert.match(iosCamera, /func focus\(at point: CGPoint\)/);
assert.match(iosCamera, /captureDevicePointConverted\(fromLayerPoint:/);
assert.match(iosCamera, /focusPointOfInterest = point/);
assert.match(iosCamera, /exposurePointOfInterest = point/);
assert.match(iosViews, /tool\.id == "camera-studio" \{ NativeCameraStudioView\(\) \}/);
assert.match(iosViews, /tool\.id == "camera-studio" \|\| NativeProductivityEngine\.supports\(tool\.id\)/);
assert.match(iosCatalog, /func includingCameraStudio\(\)/);
assert.match(iosCatalog, /\.includingCameraStudio\(\)/);
assert.match(iosCatalogTests, /testCameraStudioRuntimeExtensionIsUniqueAndSearchable/);
assert.match(iosInfo, /NSPhotoLibraryAddUsageDescription/);
assert.match(iosProject, /NativeCameraStudio\.swift in Sources/);

assert.match(nativeCoverage, /id: 'camera-studio'/);
assert.ok(androidCoverage.split(/\r?\n/).includes("camera-studio"), "Android native tool coverage includes Camera Studio");
assert.ok(iosCoverage.split(/\r?\n/).includes("camera-studio"), "iOS native tool coverage includes Camera Studio");
assert.ok(inventory.runtimeExtensionIds.includes("camera-studio"), "native runtime inventory includes Camera Studio");
assert.ok(inventory.androidToolIds.includes("camera-studio") && inventory.iosToolIds.includes("camera-studio"), "native runtime inventory records both implementations");
assert.ok(billingProfiles.profiles.some((profile) => profile.toolId === "camera-studio" && profile.manualAuditRequired === true), "Camera Studio has an auditable local billing profile");

assert.match(androidBuild, /androidx\.compose\.runtime:runtime-livedata/);
assert.match(androidBuild, /androidx\.camera\.media3:media3-effect:1\.0\.0-alpha04/);
assert.match(androidBuild, /androidx\.media3:media3-effect:1\.5\.1/);
assert.ok(deviceAcceptance.includes("Physical-device execution state: NOT RUN"), "Physical device acceptance must remain explicitly open until real devices are tested.");
assert.ok(deviceAcceptance.includes("Release state: NOT ACCEPTED"), "Camera Studio must not be marked release-accepted before physical-device evidence exists.");
for (const gate of [
  "Dual-camera capability and graceful fallback",
  "Front/rear orientation and mirroring",
  "Microphone permission and audio synchronization",
  "Low-storage and recording finalization",
  "System interruptions and app backgrounding",
  "Thermal and battery behaviour",
  "Filter preview-to-export parity",
]) {
  assert.ok(deviceAcceptance.includes(gate), `Device acceptance matrix includes: ${gate}`);
}

console.log("Camera Studio checks passed: web dual-camera composition, Android CameraX concurrent recording, native live filters and manual controls, iOS AVFoundation filtered recording and optical lenses, plus explicit physical-device release gates.");
