# enV Audio UX Implementation Brief

**Scope:** Audio category and Music Studio improvements across **web React/Tailwind**, **Android Kotlin/Jetpack Compose**, and **iOS Swift/SwiftUI**.

**Status:** Action plan synthesized from the completed research and repository observations. It is not a claim that the proposed native parity or DSP exists today. Priorities favor safer source handling, clearer state, useful review/preview, accessible editing, and reproducible local exports over adding more effect menus.

## Product outcome

Make Audio and Music Studio feel like a transparent, source-first local workspace:

1. A user can choose or record audio with clear permission, privacy, format, storage, and upload boundaries.
2. The user can inspect and preview before insertion, see what will happen, and cancel safely.
3. Editing, practice, mixing, recording, separation, and delivery preserve the source and expose the actual output properties.
4. Web, Android, and iOS share behavior and labels where appropriate, but use platform-native file, permission, audio-session, navigation, and accessibility APIs rather than a WebView or forced visual clone.

## Current baseline and honest boundaries

- The web Music Studio already has five modes—Separate, Stem mixer, Practice, Duet / record, and Karaoke—plus browser-local Web Audio decoding, IndexedDB take persistence with a documented seven-day/250 MB policy, local stem separation safeguards, live stem mixing, local WAV/ZIP exports, and a browser recording flow.
- The web source lane still needs a real preflight queue, robust multi-file drag/drop, richer metadata, explicit source-copy status, stronger fingerprints, and complete recording/take state.
- Android native audio is primarily an offline, WAV/PCM utility path. The manifest declares `RECORD_AUDIO`, but the inspected native source did not contain the proposed SAF source-lane, native Music Studio, native stem workflow, or dedicated practice player. Do not imply compressed decoding, MP3/FLAC encoding, neural separation, or pitch-locked time stretching where those are not implemented.
- iOS native audio is primarily focused WAV/PCM tooling plus a Live Video Studio. The inspected source did not contain the proposed native Music Studio modes, multi-take Duet lane, stem mixer, practice player, karaoke UI, or native neural separation. `Info.plist` contains a specific microphone usage string; preserve it.
- Native audio effects are intentionally lightweight. Current Android/iOS behavior includes fixed/approximate normalization, high-pass plus soft-gate voice cleanup, hum notches, basic EQ, and coupled resampling. Do not label these as profile-based denoise, compliant LUFS, or independent pitch-locked tempo unless the implementation changes and is tested.

## Cross-platform principles

- **Source before action:** show file name, source/copy status, size, duration, MIME/container, sample rate, channels/layout, bit depth/bitrate when known, tags, and decode limitations before expensive processing.
- **Copy by default:** imported audio is a local working copy. Forget/delete, download backup, export/share, storage expiry, and any server upload must be explicit. Persistent/open-in-place access is opt-in.
- **Non-destructive by default:** preserve the source; model takes, edits, stems, and mixes as identifiable outputs with stable metadata and separate export actions.
- **Actual state, not optimistic state:** distinguish ready, armed, recording, paused, finalizing, previewing, processing, canceled, failed, and exported. Never show playback or recording as active until the platform operation succeeds.
- **Preview before commitment:** provide waveform/scrub, A/B or original/bypass, effect preview, and review before export. Explain that previews do not guarantee full-track quality.
- **Truthful measurement:** label sample peak dBFS, RMS and any loudness proxy with their measurement basis. Use LUFS/true-peak/compliance language only after a tested implementation of the relevant standard.
- **Accessible equivalents:** every drag, waveform, fader, slider, and gesture has labeled value controls and keyboard/screen-reader alternatives. Target at least 48px web/Android controls where practical and 44pt iOS hit regions; do not use color or audio alone for state.
- **No unsupported quality claims:** broad stem groups remain broad; local processing does not clear copyright; device-dependent latency and memory estimates are estimates; server conversion and upload are distinct from local WAV export.
- **Shared behavior, native mechanics:** share IDs, state labels, export metadata, and acceptance criteria across platforms, but use React/Tailwind, Compose/Media3/SAF, and SwiftUI/AVFoundation/UIDocumentPicker respectively.

## Prioritized implementation order

### P0 — safety, source, and state foundations

1. Define shared domain contracts: `SourceAsset`, `AudioMetadata`, `Take`, `StemTrack`, `Project/Session`, `TransportState`, `ExportJob`, and `ProcessingStatus`. Include source ID, original name, MIME/container, bytes, duration, sample rate, channels, creation time, local-copy status, and output lineage.
2. Implement a source preflight state machine and status vocabulary across web/native. Reject empty, unsupported, over-cap, and decode-failing files before expensive work; make cancellation and stale-job cleanup deterministic.
3. Make permission and privacy flows just-in-time. Web requests microphone access only from Record; Android requests `RECORD_AUDIO` at Record after rationale; iOS checks current permission and requests immediately before capture. Every denial must preserve import-only workflows and offer a settings/help path.
4. Add regression tests for lifecycle cleanup, dropped-file navigation prevention, permission denial, route/interruption changes, storage failure, cancellation, export metadata, and accessible control names.

### P1 — web source lane and shared timeline

5. Refactor `src/components/engines/audio-music-studio.tsx` around one reusable React source/drop/input controller. Support multiple files, `DataTransfer` filtering, accepted MIME/extensions, `copy`/`none` drop effects, keyboard input, window-level file-drop prevention, and announced errors. Never accept only the first dropped file.
6. Add a preflight queue row with metadata, local-only badge, Preview, Remove, Replace, and Import/Insert. Preserve original name/MIME/`lastModified`; use a stronger content fingerprint than name+size+modified+type when feasible. Revoke object URLs when replaced or removed.
7. Keep IndexedDB’s seven-day/250 MB behavior but expose policy, usage/status, handoff ID, expiry/eviction warning, Forget, Download backup, and a warning before any server-backed operation. A local browser copy is not a permanent backup.
8. Build one shared source waveform/timeline with channel-aware peak/RMS tiles, time ruler, playhead, zoom/pan, selection, scrub, clipping markers, and current metadata. Keep a text result panel for assistive technology and exportable measurements.

### P2 — web Music Studio workflows

9. **Edit Studio:** turn the existing six entry cards into one persistent, source-first workspace. Add selection-first trim with large handles plus exact Start/End or Start/Length fields, fade handles with linear/log/cosine choice, Preview/Bypass/Undo, separate output, and clipping feedback. Regroup as Cut & timing, Level & dynamics, Cleanup, Tone, and Tempo/Pitch with progressive disclosure.
10. **Analysis:** replace separate PNG-only waveform/spectrogram outputs with a synchronized canvas/panel. Add per-channel min/max plus RMS tiles, linear/dB scale, zero line, time/frequency readouts, configurable FFT/window/overlap and linear/log/mel scale, documented color legend, cancellable worker processing, and configurable silence regions (threshold, minimum duration, combined/per-channel).
11. **Practice:** add a dedicated transport model for Original/Mix, playhead, A/B range, repeat off/once/infinite, count-in scope, bars, metronome, BPM, speed, pitch, and iteration. Use waveform handles plus exact controls. Keep coupled playback clearly labeled until pitch-locked time stretching exists; do not call it practice-grade independent control.
12. **Duet / record:** use ready → recording → review states. Add device selection, dry/processed/off monitor modes, wired-headphone and Bluetooth latency disclosure, peak/RMS plus clip latch, elapsed time, count-in/cycle range, pause/resume/stop/cancel/finalizing, non-destructive take lanes, rename/choose/delete, and immediate WAV backup. Keep processed monitoring separate from the recorded source unless explicitly effect-printed.
13. **Separate:** retain explicit 2/4-stem choice, conservative duration/memory preflight, phase-specific determinate/indeterminate progress, cancellation, original-versus-stem A/B, per-stem play/solo, aligned WAVs, rendered-mix option, ZIP manifest, output size estimate, and rights acknowledgement. Keep canonical names Drums, Bass, Other, Vocals and describe them as broad groups.
14. **Stem mixer:** extend `StemTrack` with pan, route (initially Master), peak/RMS/clip state, and explicit solo-active state. Use a shared Web Audio live/offline graph for faders, pan, mute, solo, master meter, seek/loop, deterministic render, progress/cancel, and stable per-stem/mix exports.
15. **Karaoke and delivery:** make karaoke a player with play/pause, seek, A–B loop, backing level, and stem mute/solo. Keep display-only lyrics separate from timed LRC/JSON/manual cues and label unsynced text. In `audio-engine.tsx`, move conversion to reusable target profiles (format/codec, rate, channel layout, bitrate mode), show source/target metadata and estimated decimal MB/MiB, separate local WAV from server FFmpeg/upload, and distinguish Accepted/Recommended/Notes rather than universal requirements.
16. **Recording implementation:** use `MediaRecorder.isTypeSupported`, store the actual `recorder.mimeType`, chunk `dataavailable`, derive the extension from actual MIME, and stop all tracks on Stop, Cancel, unmount, device loss, and permission failure. Do not silently default to WebM/Ogg or claim a format not reported by the browser.

### P3 — Android Kotlin/Jetpack Compose

17. **Native import:** add an audio-aware `ActivityResultContracts.GetContent` copy-import for `audio/*` with explicit extensions; use `OpenDocument` and persist URI permission only after the user explicitly chooses persistent/open-in-place access. Copy into app-managed storage, retain `ContentResolver` metadata, avoid broad storage permissions, and export through `ACTION_SEND`/`FileProvider` with temporary read grants and visible filename/MIME.
18. **Native recording:** add rationale → runtime permission → capture. Use `MediaRecorder` or `AudioRecord` with explicit source, format, encoder/output descriptor, lifecycle cleanup, actual MIME/container reporting, and foreground-only behavior unless a separately designed foreground service is required. Add in-app capture indication alongside Android 12+ privacy indicators. Probe raw/unprocessed input before promising it; otherwise label device processing.
19. **Native studio shell:** refactor `NativeMusicLiveVideoStudio.kt` toward a state-hoisted ViewModel and focused Compose sections; use adaptive navigation (phone bar, tablet rail/two-pane), a persistent mini-player/transport, bottom sheets for advanced controls, edge-to-edge insets, and 48dp semantics. Keep local-only and existing saved-setup behavior.
20. **Native editor/analysis:** add a Compose waveform, selection/trim/fade handles, preview/apply/export states, labeled meters, and accessible button alternatives. Generate file-analysis tiles off the main thread from decoded PCM; do not use `android.media.audiofx.Visualizer` as a file decoder. Keep WAV-only restrictions explicit and use `MediaMetadataRetriever`/`MediaExtractor` only for metadata they actually support. Add configurable silence regions and avoid calling RMS-derived output LUFS.
21. **Native conversion:** upgrade `NativeFileConverterToolForm.kt` to profile/rate/channel/bitrate menus and an estimated-size summary. Return structured fields from `NativeAudioEngine.kt`. If no native codec exists, present “WAV/PCM local export” and “server conversion” as separate, upload-disclosing actions; do not imply MP3/FLAC encoding.
22. **Native playback/mixer/future modes:** use Media3 `ExoPlayer`/`MediaSessionService` for a real player, audio focus/noisy-output handling, notification/system controls, queue, seek, and loop. Build a dedicated stem mixer with gain/pan/mute/solo/meters/master and deterministic offline WAV render. Keep native stem separation, karaoke, and practice independence as future work unless a model/engine is deliberately introduced.
23. **Recorder parity:** replace fixed 44.1 kHz/buffer assumptions with device-reported or measured settings and disclose device-dependent latency. Add monitoring Off by default, wired-headphone guidance, route/interruption/background handling, peak hold, take list, backing cue, count-in/loop passes, and review before export. Test on physical devices; emulator recording is not sufficient.

### P4 — iOS Swift/SwiftUI

24. **Native source lane:** add `UIDocumentPickerViewController` with UTType audio content types and multi-select where useful; default to copy/import. Wrap external reads with security-scoped access and persist a security-scoped bookmark only when persistent access is explicitly chosen. Use `UIActivityViewController`/`NSItemProvider` to share copies by default.
25. **Native recording/session:** replace deprecated permission usage with current permission APIs, check state before capture, and configure `.record` or `.playAndRecord` deliberately. Add `AVAudioRecorder`/`AVAudioEngine` pause/resume, metering, output format, cancel/delete, interruption and route-change handling. Show route and state; pause on headphone removal rather than unexpectedly exposing audio.
26. **Native Music Studio:** add `MusicStudioView` and `MusicStudioStore` routed from the five mode IDs, with a shared source/session/transport model. Use a compact mode switcher, shared transport, scrollable/zoomable waveform timeline, playhead, selection, go-to-start, metronome/count-in, and large VoiceOver-readable controls.
27. **Native mixer/practice/duet/karaoke:** implement identifiable stem tracks with faders, pan, mute, solo, master, A/B and aligned WAV export; add A/B loop, repeat, count-in, metronome, and explicit coupled-versus-independent pitch/tempo status; add aligned multi-take recording and review; keep karaoke lyrics display-only unless cues exist. Use `MPVolumeView` for system output volume and keep app master gain relative.
28. **Native decoding/separation:** use `AVAudioFile`/`AVAudioConverter` where supported and retain source metadata; keep 250 MB/local-only/restore-forget behavior. Do not present fake native neural separation; route to the existing web path or a replaceable separator service until a real native model is available.
29. **Accessibility and device QA:** provide labels, values, adjustable actions and non-color state for every transport, fader, toggle, playhead, loop bound, take, and lyrics surface. Honor Dynamic Type, Reduce Motion, and Increase Contrast. Add XCTest/UI coverage for permission denial, route removal, interruptions, play/pause, loops, mute/solo, takes, export metadata, and VoiceOver labels.

## Acceptance criteria

- Every source import/record path clearly states local copy, storage retention, output format, and whether any server request/upload occurs.
- A user can preview and inspect a source before insertion, cancel processing, recover from a denied microphone permission, and export a durable copy without losing the source.
- All modes expose real state and accessible non-gesture alternatives; no action depends on color, audio-only feedback, or an unlabeled icon.
- Exported files report actual format/container, sample rate, channels, bit depth, duration, and size when known; manifests preserve source ID, take/stem names, alignment, and settings.
- Native UI does not claim web/server/model capabilities that are absent from the Android or iOS implementation.
- Analysis labels measurements honestly; no compliant LUFS/true-peak or pitch-locked tempo claim without the corresponding tested implementation.
- Regression tests cover web storage/drop/record cleanup and native permission, lifecycle, route, interruption, accessibility, export, and cancellation paths. Full web build, Android Gradle build, iOS Xcode build, physical-device tests, and model/service integration remain release validation rather than being inferred from source inspection.

## Research gaps and decisions still required

- No strong source was found for enV-specific task frequency, abandonment, error rates, preferred mode ordering, or whether users want a full DAW (Arrangement/Session) rather than a focused Music Studio. Instrument usage analytics and moderated usability tests are needed before committing to the largest workstation surface.
- Competitor manuals and platform guidance document available workflows, not comparative usability or enV user outcomes. Do not turn their patterns into market-share, superiority, or conversion claims.
- Native codec coverage, AVFoundation/Media3 device behavior, exact latency, memory ceilings, battery impact, route changes, Bluetooth behavior, and background policy require macOS/Xcode, Gradle/device builds, and physical-device measurement.
- No strong source established a universal delivery preset or current long-term platform requirement. Apple Podcasts and YouTube rules change and vary by workflow; keep profile guidance dated, labeled Accepted/Recommended/Notes, and verify at release.
- Native neural stem separation, native pitch-locked time stretch, profile-based denoise, compliant loudness measurement, and synchronized lyrics have no inspected implementation here. Treat them as engineering/product decisions, not parity assumptions.
- Persistent/open-in-place semantics, backup guarantees, user accounts/sync, collaborative editing, and rights/licensing policy need explicit product/legal decisions. Local processing does not grant remix, derivative-work, sample, voice, or commercial rights.

## Research anchors

- [Ableton Live: Browser, arrangement/session, mixing, comping, file management](https://www.ableton.com/en/live-manual/12/working-with-the-browser/)
- [Adobe Audition: import, recording, waveform editing, fades, cleanup, dynamics, time/pitch](https://helpx.adobe.com/audition/desktop/importing-recording-and-playing/recording-audio.html)
- [Audacity: importing, waveform, selection, metadata, recording, effects, analysis](https://manual.audacityteam.org/man/importing_audio.html)
- [Apple GarageBand/Logic: recording, takes, controls, cycle, count-in, import](https://support.apple.com/guide/garageband-iphone/welcome/ios)
- [Android document providers and SAF](https://developer.android.com/guide/topics/providers/document-provider)
- [Android MediaRecorder and runtime permissions](https://developer.android.com/media/platform/mediarecorder)
- [Android audio latency](https://developer.android.com/ndk/guides/audio/audio-latency)
- [Android Compose accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps)
- [Android Media3 playback](https://developer.android.com/media/implement/playback-app)
- [Apple UIDocumentPickerViewController](https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller)
- [Apple AVAudioRecorder](https://developer.apple.com/documentation/avfaudio/avaudiorecorder)
- [Apple audio session route changes](https://developer.apple.com/documentation/avfaudio/responding-to-audio-route-changes)
- [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Apple file management and sharing copies](https://developer.apple.com/design/human-interface-guidelines/file-management)
- [Web drag/drop and MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop)
- [Web Audio API best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
- [Web getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [ITU-R BS.1770 loudness measurement](https://www.itu.int/rec/R-REC-BS.1770-5-202311-I/en)
- [FFmpeg silence detection contract](https://ffmpeg.org/ffmpeg-filters.html)
- [Apple Accelerate spectrogram sample](https://developer.apple.com/documentation/accelerate/visualizing-sound-as-an-audio-spectrogram)
- [Apple Podcasts audio requirements](https://podcasters.apple.com/support/893-audio-requirements)
- [YouTube music delivery guidance](https://support.google.com/youtube/answer/6039860?hl=en)
- [LALAL.AI stem splitter](https://www.lalal.ai/stem-splitter/)
- [Moises export and rights guidance](https://help.moises.ai/hc/en-us/articles/23877386138140-Who-owns-the-output-and-music-I-create-with-Moises)
- [Material 3 menus](https://m3.material.io/components/menus/guidelines)
- [Apple HIG pickers](https://developer.apple.com/design/human-interface-guidelines/pickers)
