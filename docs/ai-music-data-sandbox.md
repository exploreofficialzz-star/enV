# AI Music Data Sandbox

The web music analyser is now a persistent workspace for preparing music generation datasets. Open `/tools/audio/ai-music-data-sandbox`. Existing `/tools/audio/song-metadata-analyzer` and `/tools/audio/audio-analyze-studio` bookmarks still work and share the same device storage.

This implementation follows the supplied *Nigerian AI Music — Music Model Training Guide* as a data preparation template. Genres, languages, instruments, vocabulary and folder names are customizable; there is no country restriction. It prepares files and does not train a model.

## Working in the sandbox

1. Create a folder. Optional defaults supply the genre and sub-style for new records. Create subfolders for styles, projects or another arrangement.
2. Add a song, multiple files, a device folder, or a ZIP. Existing records are retained. Return to the same folder in another session to add more.
3. Open a draft and listen to its audio. Tags, descriptions, technical controls, title, ID, lyrics, clearance, source and internal notes are editable. The JSON tab supports custom fields as well as the standard schema.
4. Draft edits save automatically to IndexedDB. Save failures remain visible and keep the editor open. Renaming an ID changes the names of all exported companion files together. Moving a record changes its folder without rewriting its musical tags.
5. Check the rights record and select **Mark ready** after human review. Further edits require another review. Blank or unclear rights never qualify for a music training export.
6. Export selected records, the current view, or the entire workspace. Master exports include drafts. Music training preparation exports include only reviewed, cleared records with audio; lyrics-only records remain in master exports.

The homepage shows recent drafts. The Drafts and Ready views show the full corresponding collection, with search and incremental listing. Workspace settings provide a shared vocabulary editor, device storage information, a full-workspace backup action and a splash preview.

## What is automatic

- File size and original format/extension.
- Duration, when available from the header or the browser's media metadata.
- Sample rate, channel count and bit depth when the supported header makes these readable.
- A deterministic caption assembled from the user's tags, shown before export.

Unknown values remain blank. Readable duration is marked measured; imported and edited values have separate provenance. Musical labels, BPM, key, meter, energy, mood, language, vocals, flow, instruments and lyrics are not guessed. Embedded labels or imported sidecars are editable drafts, not verified inference.

The active sandbox does not load Transformers/ONNX, CLAP, Whisper, Demucs, stem separation, full-track PCM decoding, chord detection, pitch analysis or remote AI jobs. It adds no npm dependencies. Existing tools and the standalone Python companion retain their separate implementations; shared libraries are not removed from unrelated tools.

## Storage and limits

All records and audio live in this browser on this device. They survive refreshes and ordinary navigation, but do not sync between devices. Browser eviction, clearing site data or private browsing can remove them. Export backups to device storage or a separate storage provider. Persistent browser storage is requested where available, without assuming it will be granted.

| Scope | Limit |
| --- | --- |
| Default folder | 100 songs and 250 MB, including descendants |
| Editable folder budgets | 1–500 songs; 10–2000 MB |
| Audio file | 40 MB |
| Import batch | 50 records, up to 160 MB total expansion |
| ZIP | 80 MB compressed; 600 entries; 160 MB total expansion |
| Lyrics or tags sidecar | 1 MB |
| Export | 78 MB estimated payload, leaving room under the 80 MB ZIP import limit |

Device quota is checked as well as folder budgets. Budget checks include ancestors, existing records, moves and later imports; subfolders cannot evade a parent budget. Imports process one record at a time and atomically commit its audio and metadata. Cancellation preserves completed records. Duplicate IDs get a suffix rather than overwriting earlier songs. Unsupported files and per-record failures are reported.

ZIP directories are preflighted before inflation. Extraction runs in a disposable worker with a fixed output buffer, checksum verification, cancellation and a deadline. Unsafe paths, overlapping payloads, duplicate entries, links, encrypted archives, ZIP64, unreasonable expansion and unsupported compression methods are rejected. RAR, TAR and 7z must be unpacked first.

## Exports

Master files preserve the structure:

```text
afrobeats/afro_fusion/song_0001.wav
afrobeats/afro_fusion/song_0001.tags.json
afrobeats/afro_fusion/song_0001.lyrics.txt
manifest.csv
workspace.json
README.txt
```

Audio bytes are copied, never transcoded. Original display names, notes, settings, folder budgets, provenance and review history are retained in `workspace.json`. The paired audio/lyrics/tags can be imported again; imports require a fresh review. The manifest references complete relative paths and includes clearance and reviewed status.

The optional training preparation export adds `.caption.txt`, `.json` annotations and a `dataset.jsonl` index, and converts lyrics labels such as `[verse 1 | Yoruba]` to `[Verse]` without removing Unicode text. It keeps BPM, key and meter as separate controls. Mixed or unsupported vocal-language controls use `unknown` while captions retain language names. Identity, license, source, notes and custom fields never enter automatically generated captions.

Annotation names and JSONL layout must be checked against the exact ACE-Step or other trainer version before training. These files are a preparation format, not a claimed validated native trainer schema.

## Appearance and platform scope

The sandbox is monochrome and inherits enV's system/light/dark preference. Container queries accommodate both the actual device width and enV's user-selected mobile/tablet/desktop layout. Forms have labels, the editor has keyboard tabs, dialogs trap focus, and motion respects the device preference.

The splash uses the same light and dark enV logo assets as the homepage and the supplied Rumuo icon. It keeps the PDF's embedded Lora font, Lucide headset, mobile artboard coordinates and title. Brand images retain their colors against the monochrome interface. Inter and Aclonica are served locally. The 390×844 artboard scales to fit smaller viewports and centers on larger devices.

This change implements the responsive web sandbox. Native Android/iOS analyser screens and their storage are separate and are not represented as having the new browser workflow.

## Validation

```bash
npm run typecheck
npm run test:song-analyzer
npm run check:audio-studios
npm run audit:song-analyzer:browser
npm run build
```

The browser audit uses generated audio and ZIP sidecars, checks persisted IndexedDB records after refresh, repeated imports, duplicate IDs, folder limits, review gating, exact downloaded audio bytes, captions, Unicode lyrics, custom tags, master/training files, accessibility, and 390/768/1440 light/dark layouts. It also rejects model downloads or audio-upload requests during this workflow.
