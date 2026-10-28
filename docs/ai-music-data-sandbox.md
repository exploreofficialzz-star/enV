# AI Music Data Sandbox

The sandbox replaces the separate song and audio analyzer interfaces on web, Android and iOS. Existing web analyzer URLs open the same sandbox. enV discovery shows one sandbox entry. The sandbox is a music dataset preparation workspace for any genre or language; it does not train a model.

## Workflow

The home appears inside the enV tool page, below its title and description. Enter the workspace to create folders and subfolders, import songs or ZIP packages, continue drafts, edit metadata and lyrics, review permissions, and export. Collections persist locally and accept additional imports later. A folder's song and storage limits include its descendants. The default is 100 songs and 250 MB; both limits are editable.

The record editor has three horizontal sections: Music, lyrics.txt and tags.json. The audio player remains available while switching between them. The tags form exposes the record's fields and an optional advanced JSON editor retains custom fields. Add or replace audio and import lyrics directly in the record. Overview, Folders, Drafts and Ready to export use matching dashboard, folder, draft and checked-file icons; on phones they appear at the bottom. Import music or sidecars to create records. The Ready to export view contains the export action, with an option for a workspace backup including drafts.

Descriptive fields are human-supplied. BPM and key are editable estimates and should be checked by ear: tempo may be half or double the intended beat, and a mixed or percussion-only track may not have a clear key. The tempo band is a simple derived suggestion (below 90 BPM is slow, 90–129 is mid, 130 and above is fast), not a classification. Imported and manually edited bands are preserved. Genre, language, instruments, mood, vocals, meter and lyrics are not inferred. Measurements such as duration, sample rate, channels, peak and RMS are available where the device can read them. A web master tags file includes readable format, sample rate, channel count and bit depth; unknown values stay empty or null. Replacing audio preserves manual BPM, key and tempo band while discarding estimates from the old recording.

A training preparation export includes only reviewed, cleared audio records; it supplies captions, lyrics and separate tempo, key and meter controls. The master backup contains drafts and sidecars. Confirm the exact export schema against the trainer version before training. Audio and data are stored on the current device and do not sync between web and native apps. Export a backup before clearing browser data or uninstalling the app.

## Analysis and limits

Analysis runs locally with existing signal-processing code. No models are downloaded and no audio is uploaded for this workflow. The web decodes only recordings whose expected PCM fits an 80 MiB budget, analyzes up to 45 seconds in a worker, and leaves fields editable if a format, duration or device budget prevents analysis. Android and iOS use bounded local decoders and skip signal analysis beyond five minutes. Peak and RMS describe the analyzed audio; they are not semantic classifications. The browser's estimates reflect a sample rather than necessarily the whole recording.

| Limit | Web | Android / iOS |
| --- | --- | --- |
| Audio file | 40 MB | 20 MB |
| Files per import | 50 records | 50 records |
| ZIP input | 80 MB; 160 MB expanded | 30 MB; 60 MB expanded |
| ZIP export | 78 MB estimated payload | 28 MB estimated payload |
| Folder limits | 1–500 songs; 10–2000 MB | 1–500 songs; 10–2000 MB |

ZIP import checks paths, entry sizes and checksums. RAR, TAR and 7z must be unpacked first. Native imports can pair `.tags.json` and `.lyrics.txt` sidecars with audio and retain folder paths. A master re-import becomes a fresh draft requiring review. On web, the master ZIP also includes `workspace.json` with workspace settings and history for reference; native exports contain the audio, tags, lyrics and manifest.

Full screen opens the workspace directly. The web presents the mobile interface and temporarily uses the device viewport in full screen, regardless of enV's saved view mode; exiting restores that preference. Android and iOS use their own native views and private storage, not an embedded website.

## Validation

The browser audit covers import, bounded signal analysis, metadata preservation, drafts, review, exports, light/dark layouts, bottom navigation, the three editor sections, persistent playback controls, full-screen viewport restoration, accessibility and the absence of model downloads or audio uploads. Android unit tests cover native sidecar ZIPs, folder limits, review gating and training captions. The iOS source and data/ZIP helpers can be checked on Linux, but an iOS application build and simulator testing require Xcode on macOS.
