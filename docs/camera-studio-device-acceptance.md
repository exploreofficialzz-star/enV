# Camera Studio — physical-device acceptance matrix

**Release state: NOT ACCEPTED.** Source-level checks and simulator/emulator builds are not evidence of real-camera acceptance.

**Current execution state: NOT RUN — requires real hardware.** No physical Android phone or iPhone was available to this repository workflow on 6 November 2026. Do not change a row to PASS without the device model, OS version, app commit, test date, and evidence link.

## Required test record

For every test run, record:

- Device model and hardware variant
- OS version and security/build number
- App version and exact Git commit
- Camera capability results reported by the app
- Test date, tester, and whether the phone was cool/warm at start
- Requested versus actual resolution and frame rate
- Recording duration, output duration, output file size, and audio result
- Battery and thermal observations
- Result: PASS, FAIL, BLOCKED, or NOT RUN
- Evidence: short exported clip, screenshots, device logs, and any crash report

A result without this evidence remains NOT RUN.

## Device coverage

| Platform cohort | Minimum coverage | Required checks | Status |
|---|---|---|---|
| Android 10 baseline | At least one physical Android 10 phone | Single-camera preview/capture, permission denial and retry, save, fallback messaging; dual-camera must remain unavailable because CameraX concurrent capture requires Android 11+ | NOT RUN |
| Android 11+ dual-capable | At least one phone where CameraX reports a front/rear concurrent pair | Simultaneous preview, PiP composition, one-file recording, audio, orientation, stop/finalize, filters | NOT RUN |
| Android 11+ non-dual-capable | At least one phone where the concurrent pair is not reported | Clear unavailable state and working single-camera fallback | NOT RUN |
| Android low/mid-range | At least one constrained-memory phone | Heat, dropped frames, recording length, low storage, background/foreground, resource release | NOT RUN |
| iOS MultiCam-capable | At least one physical iPhone where `AVCaptureMultiCamSession.isMultiCamSupported` is true | Both cameras, synchronized PiP, audio, orientation, thermal pressure, finalization | NOT RUN |
| iOS non-MultiCam | At least one physical iPhone where MultiCam is unavailable | Clear unavailable state and working single-camera fallback | NOT RUN |
| iOS different generations | At least two generations with different camera hardware | Manual settings, supported optical lenses, permission recovery, recording interruption and Photos export | NOT RUN |

## Release-gate scenarios

| Scenario | Required acceptance behaviour | Status |
|---|---|---|
| Dual-camera capability and graceful fallback | Detect actual concurrent-camera support; never duplicate one stream to fake dual capture; keep single camera usable if unsupported | NOT RUN |
| Front/rear orientation and mirroring | Portrait and landscape clips are upright; front inset mirroring is intentional; PiP does not crop the subject unexpectedly | NOT RUN |
| Microphone permission and audio synchronization | Ask only when recording with sound; silent recording works after denial; audio stays synchronized with the exported video | NOT RUN |
| Low-storage and recording finalization | Show a recoverable error, do not publish a partial file as complete, and preserve an already completed take when a save picker is canceled | NOT RUN |
| System interruptions and app backgrounding | Calls, app switches, camera pre-emption and iOS media-services reset stop/reconnect safely; files remain playable where finalization succeeds | NOT RUN |
| Thermal and battery behaviour | Run repeated and sustained recording; note thermal warnings, throttling, dropped frames and battery drain; do not advertise unmeasured performance | NOT RUN |
| Filter preview-to-export parity | Each native color look is visible in preview and present in the saved photo/video; Natural resets correctly; no stale filter after mode changes | NOT RUN |
| Manual camera controls | Verify actual sensor capability gating; ISO/shutter, white balance, focus distance/lock and optical lens selection change capture output; unsupported controls are hidden | NOT RUN |
| Permission revoked in Settings | Return to Camera Studio after revocation; camera is not bound until permission returns; retry/settings route works | NOT RUN |
| Long recording | Test at least 5 minutes and 30 minutes on a capable device; confirm output duration, sound, playback, storage use and cleanup | NOT RUN |
| Save, share and discard | Test photo/video export, share, canceled picker, failed save, deletion and recovery without leaking temporary files | NOT RUN |

## Implemented versus still gated

### Source implementation present — not yet device-accepted

- Browser dual-camera composition from two distinct camera streams, with capability/error handling.
- Android CameraX concurrent front/rear capture behind the device capability check.
- iOS `AVCaptureMultiCamSession` front/rear capture with synchronized frame composition.
- Android CameraX/Media3 color processing for preview, photo and video outputs.
- iOS Core Image frame processing used by preview and the `AVAssetWriter` export path, including the composed dual-camera clip.
- Android Camera2-interoperability manual sensor, white-balance and focus-distance controls, shown only when the camera advertises the required capability.
- iOS manual ISO/shutter, white-balance, focus lock and optical-lens selection, shown only where supported.
- Single-camera permission recovery, audio-denied silent-video path and recording-finalization handling.

These are source-level implementations. A green build still does not prove that a specific physical camera/encoder combination works.

### Not implemented — do not advertise as available

- Face-landmark tracking, face-attached AR masks, expression-driven effects and beauty/skin-retouch effects.
- Any licensed Snapchat Lens or Snap Camera Kit integration.

The next face-effects implementation must use original enV assets/effects and an explicitly licensed, on-device landmark pipeline. A global color look is not face tracking, and a drawn static overlay is not a tracked AR mask.

## Safe execution notes

1. Start with the single-camera and permission tests on every device.
2. Run the dual-camera test only after the app reports the actual front/rear concurrent capability.
3. Compare the encoded file to the preview; do not judge from the preview alone.
4. Repeat tests after app backgrounding, a phone call, low storage, and a camera permission change.
5. Attach test artifacts to the PR and update this matrix with measured values before enabling or promoting device-dependent features.
6. Keep face effects disabled until the landmark pipeline is implemented and its latency, export parity, privacy behaviour and device fallback are tested.
