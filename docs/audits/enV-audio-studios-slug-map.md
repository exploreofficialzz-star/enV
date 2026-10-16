# enV Audio Studios — Legacy slug to Studio/mode map

Generated from src/data/catalog.ts on 2026-10-15. All 114 Audio-category routes are listed. Routes retain their slugs while supported pages route into Studio modes. This is a source-level route audit, not proof every browser/device/provider path has passed end-to-end testing.

Primary Music Studio: /tools/audio/music-studio. Music deep-links share that Studio: /tools/audio/music-separator, /tools/audio/music-duet, /tools/audio/music-karaoke, /tools/audio/music-stem-mixer, /tools/audio/music-practice.

| Existing/new slug | Studio | Mode / compatibility behavior | Implementation note |
|---|---|---|---|
| /tools/audio/apple-music-audio-file-size-calculator | Audio Calc Studio | apple-music file-size | Legacy URL retained; platform preset mode |
| /tools/audio/apple-music-bitrate-calculator | Audio Calc Studio | apple-music bitrate | Legacy URL retained; bitrate/target-size math where supported |
| /tools/audio/apple-music-bpm-helper | Audio Calc Studio | apple-music BPM helper | Best-effort reference/helper |
| /tools/audio/apple-music-export-preset | Audio Platform Guide Studio | apple-music · export preset | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/apple-music-format-guide | Audio Platform Guide Studio | apple-music · format guide | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/apple-music-loudness-helper | Audio Platform Guide Studio | apple-music · loudness helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/apple-music-metadata-helper | Audio Platform Guide Studio | apple-music · metadata helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/apple-music-sample-rate-helper | Audio Platform Guide Studio | apple-music · sample rate helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/audio-analyze-studio | Audio Analyze Studio | Studio landing | Studio route; linked modes shown on landing page |
| /tools/audio/audio-bitrate-calculator | Audio Calc Studio | audio-bitrate-calculator | Local math; compressed size estimates exclude container overhead |
| /tools/audio/audio-bitrate-converter | Audio Convert Studio | server-bitrate | Local where browser API supports it; server state is explicit |
| /tools/audio/audio-calc-studio | Audio Calc Studio | Studio landing | Studio route; linked modes shown on landing page |
| /tools/audio/audio-channel-balance | Audio Analyze Studio | channel-balance | Local browser analysis/export |
| /tools/audio/audio-channel-converter | Audio Convert Studio | channels-local | Local where browser API supports it; server state is explicit |
| /tools/audio/audio-compressor | Audio Edit Studio | audio-compressor | Local WAV processing when browser decoding is supported |
| /tools/audio/audio-convert-studio | Audio Convert Studio | Studio landing | Studio route; linked modes shown on landing page |
| /tools/audio/audio-dc-offset-checker | Audio Analyze Studio | dc-offset | Local browser analysis/export |
| /tools/audio/audio-duration-tool | Audio Calc Studio | duration | Local math; compressed size estimates exclude container overhead |
| /tools/audio/audio-edit-studio | Audio Edit Studio | Studio landing | Studio route; linked modes shown on landing page |
| /tools/audio/audio-eq-simple | Audio Edit Studio | audio-eq-simple | Local WAV processing when browser decoding is supported |
| /tools/audio/audio-fade-in | Audio Edit Studio | fade-in | Local WAV processing when browser decoding is supported |
| /tools/audio/audio-fade-out | Audio Edit Studio | fade-out | Local WAV processing when browser decoding is supported |
| /tools/audio/audio-file-inspector | Audio Analyze Studio | inspector | Local browser analysis/export |
| /tools/audio/audio-file-size-calculator | Audio Calc Studio | audio-file-size-calculator | Local math; compressed size estimates exclude container overhead |
| /tools/audio/audio-hum-reducer | Audio Edit Studio | audio-hum-reducer | Local WAV processing when browser decoding is supported |
| /tools/audio/audio-import-studio | Audio Import Studio | Studio landing | Studio route; linked modes shown on landing page |
| /tools/audio/audio-joiner | Audio Edit Studio | Local multi-file join | Client-side WAV render |
| /tools/audio/audio-joiner-local | Audio Edit Studio | Local multi-file join | Client-side WAV render |
| /tools/audio/audio-lufs-meter | Audio Analyze Studio | audio-lufs-meter | RMS proxy only; not standards-compliant LUFS |
| /tools/audio/audio-merger | Audio Edit Studio | Server merge | Configured service required; clear unavailable state otherwise |
| /tools/audio/audio-metronome | Music Studio | Metronome utility | Local generated audio; standalone deep-link retained |
| /tools/audio/audio-normalizer | Audio Edit Studio | normalize | Local WAV processing when browser decoding is supported |
| /tools/audio/audio-peak-meter | Audio Analyze Studio | peak | Local browser analysis/export |
| /tools/audio/audio-pitch-shift | Audio Edit Studio | audio-pitch-shift | Local WAV processing when browser decoding is supported |
| /tools/audio/audio-platform-guide-studio | Audio Platform Guide Studio | Studio landing | Studio route; linked modes shown on landing page |
| /tools/audio/audio-recorder | Audio Import Studio | Microphone recorder | Local browser recorder; WAV export |
| /tools/audio/audio-reverser | Audio Edit Studio | reverse | Local WAV processing when browser decoding is supported |
| /tools/audio/audio-rms-meter | Audio Analyze Studio | rms | Local browser analysis/export |
| /tools/audio/audio-sample-rate-converter | Audio Convert Studio | resample-local | Local where browser API supports it; server state is explicit |
| /tools/audio/audio-silence-detector | Audio Analyze Studio | silence | Local browser analysis/export |
| /tools/audio/audio-spectrogram | Audio Analyze Studio | audio-spectrogram | Local browser analysis/export |
| /tools/audio/audio-tempo-change | Audio Edit Studio | audio-tempo-change | Local WAV processing when browser decoding is supported |
| /tools/audio/audio-to-flac-server | Audio Convert Studio | server-flac | Media processor required; upload is disclosed |
| /tools/audio/audio-to-mono | Audio Convert Studio | mono | Local where browser API supports it; server state is explicit |
| /tools/audio/audio-to-mp3-server | Audio Convert Studio | server-mp3 | Media processor required; upload is disclosed |
| /tools/audio/audio-to-ogg-server | Audio Convert Studio | server-ogg | Media processor required; upload is disclosed |
| /tools/audio/audio-to-stereo | Audio Convert Studio | stereo | Local where browser API supports it; server state is explicit |
| /tools/audio/audio-to-subtitles | Audio Transcribe Studio | Audio to Subtitles | Requires configured/reachable STT; upload is disclosed |
| /tools/audio/audio-to-text | Audio Transcribe Studio | Audio to Text | Requires configured/reachable STT; upload is disclosed |
| /tools/audio/audio-to-wav | Audio Convert Studio | to-wav | Local where browser API supports it; server state is explicit |
| /tools/audio/audio-to-wav-server | Audio Convert Studio | server-wav | Media processor required; upload is disclosed |
| /tools/audio/audio-tone-generator | Music Studio | Tone generator utility | Local generated audio; standalone deep-link retained |
| /tools/audio/audio-transcribe-studio | Audio Transcribe Studio | Studio landing | Studio route; linked modes shown on landing page |
| /tools/audio/audio-trim-silence | Audio Edit Studio | audio-trim-silence | Local WAV processing when browser decoding is supported |
| /tools/audio/audio-trimmer | Audio Edit Studio | trim | Local WAV processing when browser decoding is supported |
| /tools/audio/audio-volume-control | Audio Edit Studio | volume-local | Local WAV processing when browser decoding is supported |
| /tools/audio/audio-waveform-generator | Audio Analyze Studio | waveform | Local browser analysis/export |
| /tools/audio/discord-audio-file-size-calculator | Audio Calc Studio | discord file-size | Legacy URL retained; platform preset mode |
| /tools/audio/discord-bpm-helper | Audio Calc Studio | discord BPM helper | Best-effort reference/helper |
| /tools/audio/discord-format-guide | Audio Platform Guide Studio | discord · format guide | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/discord-loudness-helper | Audio Platform Guide Studio | discord · loudness helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/discord-metadata-helper | Audio Platform Guide Studio | discord · metadata helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/discord-sample-rate-helper | Audio Platform Guide Studio | discord · sample rate helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/instagram-audio-file-size-calculator | Audio Calc Studio | instagram file-size | Legacy URL retained; platform preset mode |
| /tools/audio/instagram-bpm-helper | Audio Calc Studio | instagram BPM helper | Best-effort reference/helper |
| /tools/audio/instagram-format-guide | Audio Platform Guide Studio | instagram · format guide | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/instagram-loudness-helper | Audio Platform Guide Studio | instagram · loudness helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/instagram-metadata-helper | Audio Platform Guide Studio | instagram · metadata helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/instagram-sample-rate-helper | Audio Platform Guide Studio | instagram · sample rate helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/music-duet | Music Studio | duet | Same studio state; deep-link selects mode |
| /tools/audio/music-karaoke | Music Studio | karaoke | Same studio state; deep-link selects mode |
| /tools/audio/music-practice | Music Studio | practice | Same studio state; deep-link selects mode |
| /tools/audio/music-separator | Music Studio | separator | Same studio state; deep-link selects mode |
| /tools/audio/music-stem-mixer | Music Studio | stem-mixer | Same studio state; deep-link selects mode |
| /tools/audio/music-studio | Music Studio | Studio landing / separate | Same studio state; deep-link selects mode |
| /tools/audio/podcast-audio-file-size-calculator | Audio Calc Studio | podcast file-size | Legacy URL retained; platform preset mode |
| /tools/audio/podcast-bitrate-calculator | Audio Calc Studio | podcast bitrate | Legacy URL retained; bitrate/target-size math where supported |
| /tools/audio/podcast-bpm-helper | Audio Calc Studio | podcast BPM helper | Best-effort reference/helper |
| /tools/audio/podcast-export-preset | Audio Platform Guide Studio | podcast · export preset | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/podcast-format-guide | Audio Platform Guide Studio | podcast · format guide | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/podcast-loudness-helper | Audio Platform Guide Studio | podcast · loudness helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/podcast-metadata-helper | Audio Platform Guide Studio | podcast · metadata helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/podcast-sample-rate-helper | Audio Platform Guide Studio | podcast · sample rate helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/sample-rate-info | Audio Calc Studio | sample-rate-info | Local math; compressed size estimates exclude container overhead |
| /tools/audio/spotify-audio-file-size-calculator | Audio Calc Studio | spotify file-size | Legacy URL retained; platform preset mode |
| /tools/audio/spotify-bitrate-calculator | Audio Calc Studio | spotify bitrate | Legacy URL retained; bitrate/target-size math where supported |
| /tools/audio/spotify-bpm-helper | Audio Calc Studio | spotify BPM helper | Best-effort reference/helper |
| /tools/audio/spotify-export-preset | Audio Platform Guide Studio | spotify · export preset | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/spotify-format-guide | Audio Platform Guide Studio | spotify · format guide | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/spotify-loudness-helper | Audio Platform Guide Studio | spotify · loudness helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/spotify-metadata-helper | Audio Platform Guide Studio | spotify · metadata helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/spotify-sample-rate-helper | Audio Platform Guide Studio | spotify · sample rate helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/tiktok-audio-file-size-calculator | Audio Calc Studio | tiktok file-size | Legacy URL retained; platform preset mode |
| /tools/audio/tiktok-bpm-helper | Audio Calc Studio | tiktok BPM helper | Best-effort reference/helper |
| /tools/audio/tiktok-format-guide | Audio Platform Guide Studio | tiktok · format guide | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/tiktok-loudness-helper | Audio Platform Guide Studio | tiktok · loudness helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/tiktok-metadata-helper | Audio Platform Guide Studio | tiktok · metadata helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/tiktok-sample-rate-helper | Audio Platform Guide Studio | tiktok · sample rate helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/twitch-audio-file-size-calculator | Audio Calc Studio | twitch file-size | Legacy URL retained; platform preset mode |
| /tools/audio/twitch-bpm-helper | Audio Calc Studio | twitch BPM helper | Best-effort reference/helper |
| /tools/audio/twitch-format-guide | Audio Platform Guide Studio | twitch · format guide | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/twitch-loudness-helper | Audio Platform Guide Studio | twitch · loudness helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/twitch-metadata-helper | Audio Platform Guide Studio | twitch · metadata helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/twitch-sample-rate-helper | Audio Platform Guide Studio | twitch · sample rate helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/voice-noise-gate | Audio Edit Studio | voice-noise-gate | Local WAV processing when browser decoding is supported |
| /tools/audio/voice-noise-reducer | Audio Edit Studio | voice-noise-reducer | Local WAV processing when browser decoding is supported |
| /tools/audio/webcodecs-audio-checker | Audio Analyze Studio | webcodecs-audio | Local browser analysis/export |
| /tools/audio/youtube-audio-extractor | Audio Import Studio | Conditional YouTube import | Requires existing media service and explicit rights/Terms acknowledgement |
| /tools/audio/youtube-audio-file-size-calculator | Audio Calc Studio | youtube file-size | Legacy URL retained; platform preset mode |
| /tools/audio/youtube-bpm-helper | Audio Calc Studio | youtube BPM helper | Best-effort reference/helper |
| /tools/audio/youtube-format-guide | Audio Platform Guide Studio | youtube · format guide | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/youtube-loudness-helper | Audio Platform Guide Studio | youtube · loudness helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/youtube-metadata-helper | Audio Platform Guide Studio | youtube · metadata helper | Legacy URL retained; maps to selected platform guidance |
| /tools/audio/youtube-sample-rate-helper | Audio Platform Guide Studio | youtube · sample rate helper | Legacy URL retained; maps to selected platform guidance |

## Route guarantees and known caveats

- Existing Audio-category IDs are not deleted by this implementation. Platform file-size/bitrate/BPM helpers remain in Calc Studio; format, loudness, sample-rate, metadata and export-preset helpers point to Platform Guide modes.
- audio-to-text and audio-to-subtitles depend on a configured transcription service. audio-to-mp3-server and related FFmpeg routes depend on a configured processor. The map does not establish that those remote services are healthy.
- Music stems run in the browser after a third-party ONNX model download. The current model is approximately 166 MB, and source is limited to four minutes to reduce browser memory exhaustion. Inference has not been end-to-end tested in a real browser in this audit.
- The native implementation covers offline calculators and reference guidance. Stem AI and broader Web Audio DSP remain Web-first; catalogue presence is not native parity.
- LUFS-like values are labelled approximate and are not BS.1770/EBU R128 compliance readings. Practice preview uses playback-rate pitch/speed changes (no pitch lock), and those playback-rate controls are not baked into the exported WAV.
