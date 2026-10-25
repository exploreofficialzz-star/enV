import fs from "node:fs";
import { tools } from "../src/data/catalog.ts";

const audio = tools.filter((tool) => tool.category === "audio").sort((a, b) => a.id.localeCompare(b.id));
const studioIds = new Map([
  ["audio-convert-studio", ["Audio Convert Studio", "Studio landing"]],
  ["audio-edit-studio", ["Audio Edit Studio", "Studio landing"]],
  ["audio-analyze-studio", ["Audio Analyze Studio", "Studio landing"]],
  ["audio-calc-studio", ["Audio Calc Studio", "Studio landing"]],
  ["audio-transcribe-studio", ["Audio Transcribe Studio", "Studio landing"]],
  ["audio-import-studio", ["Audio Import Studio", "Studio landing"]],
  ["audio-platform-guide-studio", ["Audio Platform Guide Studio", "Studio landing"]],
]);
const platformNames = ["podcast", "discord", "spotify", "instagram", "apple-music", "youtube", "tiktok", "twitch"];
function mapping(tool) {
  const id = tool.id;
  const op = tool.engine?.op ?? "";
  if (studioIds.has(id)) return [...studioIds.get(id), "Studio route; linked modes shown on landing page"];
  if (id.startsWith("music-")) {
    const mode = id === "music-studio" ? "Studio landing / separate" : id.slice("music-".length);
    return ["Music Studio", mode, "Same studio state; deep-link selects mode"];
  }
  const prefix = platformNames.find((name) => id.startsWith(`${name}-`));
  if (prefix) {
    if (id.includes("file-size")) return ["Audio Calc Studio", `${prefix} file-size`, "Legacy URL retained; platform preset mode"];
    if (id.includes("bitrate-calculator")) return ["Audio Calc Studio", `${prefix} bitrate`, "Legacy URL retained; bitrate/target-size math where supported"];
    if (id.includes("bpm-helper")) return ["Audio Calc Studio", `${prefix} BPM helper`, "Best-effort reference/helper"];
    const mode = id.slice(prefix.length + 1).replace(/-/g, " ");
    if (["format guide", "loudness helper", "sample rate helper", "metadata helper", "export preset"].includes(mode)) {
      return ["Audio Platform Guide Studio", `${prefix} · ${mode}`, "Legacy URL retained; maps to selected platform guidance"];
    }
  }
  if (["audio-to-text", "audio-to-subtitles"].includes(id)) return ["Audio Transcribe Studio", id === "audio-to-text" ? "Audio to Text" : "Audio to Subtitles", "Requires configured/reachable STT; upload is disclosed"];
  if (id === "youtube-audio-extractor") return ["Audio Import Studio", "Conditional YouTube import", "Requires existing media service and explicit rights/Terms acknowledgement"];
  if (id === "audio-recorder") return ["Audio Import Studio", "Microphone recorder", "Local browser recorder; WAV export"];
  if (["audio-tone-generator", "audio-metronome"].includes(id)) return ["Music Studio", id === "audio-tone-generator" ? "Tone generator utility" : "Metronome utility", "Local generated audio; standalone deep-link retained"];
  if (["audio-joiner", "audio-joiner-local", "audio-merger"].includes(id)) return ["Audio Edit Studio", id === "audio-merger" ? "Server merge" : "Local multi-file join", id === "audio-merger" ? "Configured service required; clear unavailable state otherwise" : "Client-side WAV render"];
  if (["audio-bitrate-calculator", "audio-file-size-calculator", "audio-duration-tool", "sample-rate-info"].includes(id) || /(?:audio-file-size-calculator|bitrate-calculator|bpm-helper)$/.test(id)) return ["Audio Calc Studio", op || id, "Local math; compressed size estimates exclude container overhead"];
  if (id === "song-metadata-analyzer") return ["Audio Analyze Studio", "song-metadata-analyzer", "Local tag parsing and signal analysis; Full Analysis uses explicitly consented AI excerpts"];
  if (["audio-file-inspector", "audio-peak-meter", "audio-rms-meter", "audio-silence-detector", "audio-dc-offset-checker", "audio-waveform-generator", "audio-channel-balance", "webcodecs-audio-checker", "audio-lufs-meter", "audio-spectrogram"].includes(id)) return ["Audio Analyze Studio", op || id, id === "audio-lufs-meter" ? "RMS proxy only; not standards-compliant LUFS" : "Local browser analysis/export"];
  if (["audio-to-wav", "audio-to-wav-server", "audio-to-mp3-server", "audio-to-ogg-server", "audio-to-flac-server", "audio-bitrate-converter", "audio-sample-rate-converter", "audio-channel-converter", "audio-to-mono", "audio-to-stereo"].includes(id)) return ["Audio Convert Studio", op || id, id.endsWith("-server") ? "Media processor required; upload is disclosed" : "Local where browser API supports it; server state is explicit"];
  if (["audio-fade-in", "audio-fade-out", "audio-trim-silence", "audio-normalizer", "audio-reverser", "audio-trimmer", "audio-volume-control", "audio-hum-reducer", "voice-noise-reducer", "voice-noise-gate", "audio-pitch-shift", "audio-tempo-change", "audio-compressor", "audio-eq-simple"].includes(id)) return ["Audio Edit Studio", op || id, "Local WAV processing when browser decoding is supported"];
  return ["Audio Edit Studio", op || id, "Compatibility mapping; validate with real browser/device testing before production sign-off"];
}
const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const header = `# enV Audio Studios — Legacy slug to Studio/mode map

Generated from src/data/catalog.ts on 2026-10-15. All ${audio.length} Audio-category routes are listed. Routes retain their slugs while supported pages route into Studio modes. This is a source-level route audit, not proof every browser/device/provider path has passed end-to-end testing.

Primary Music Studio: /tools/audio/music-studio. Music deep-links share that Studio: /tools/audio/music-separator, /tools/audio/music-duet, /tools/audio/music-karaoke, /tools/audio/music-stem-mixer, /tools/audio/music-practice.

| Existing/new slug | Studio | Mode / compatibility behavior | Implementation note |
|---|---|---|---|
`;
const rows = audio.map((tool) => {
  const [studio, mode, note] = mapping(tool);
  return `| /tools/audio/${escape(tool.id)} | ${escape(studio)} | ${escape(mode)} | ${escape(note)} |`;
}).join("\n");
const footer = `

## Route guarantees and known caveats

- Existing Audio-category IDs are not deleted by this implementation. Platform file-size/bitrate/BPM helpers remain in Calc Studio; format, loudness, sample-rate, metadata and export-preset helpers point to Platform Guide modes.
- audio-to-text and audio-to-subtitles depend on a configured transcription service. audio-to-mp3-server and related FFmpeg routes depend on a configured processor. The map does not establish that those remote services are healthy.
- Music stems run in the browser after a third-party ONNX model download. The current model is approximately 166 MB, and source is limited to four minutes to reduce browser memory exhaustion. Inference has not been end-to-end tested in a real browser in this audit.
- The native implementation covers offline calculators and reference guidance. Stem AI and broader Web Audio DSP remain Web-first; catalogue presence is not native parity.
- LUFS-like values are labelled approximate and are not BS.1770/EBU R128 compliance readings. Practice preview uses playback-rate pitch/speed changes (no pitch lock), and those playback-rate controls are not baked into the exported WAV.
`;
const output = new URL("../docs/audits/enV-audio-studios-slug-map.md", import.meta.url);
fs.writeFileSync(output, header + rows + footer);
console.log(`Wrote slug map for ${audio.length} Audio routes to ${output.pathname}`);
