import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AudioLines, Camera, CameraOff, CheckCircle2, CircleStop, Download, FileAudio, FolderOpen, Headphones, Mic, Music2, Radio, RotateCcw, Save, Search, SlidersHorizontal, Sparkles, Trash2, Video, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadBlob } from "@/lib/utils";
import { loadAudioSessionFile, saveAudioSessionFile } from "@/lib/engines/audio-session-storage";
import { connectVocalPreset, EQ_BAND_FREQUENCIES, EQ_PROFILES, getVocalPreset, VOCAL_PRESETS, type AmpCharacter, type EqProfileId, type VocalPresetId } from "@/lib/engines/vocal-presets";
import { createAudioStudioPresetFile, MAX_AUDIO_STUDIO_PRESET_BYTES, normalizePortableAudioSettings, parseAudioStudioPresetFile, type PortableAudioStudioSettings } from "@/lib/engines/audio-studio-preset-file";

const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 300;
const SAVED_VOCAL_SETUPS_KEY = "env.live-video-studio.saved-vocal-setups.v1";

type SavedVocalSetup = {
  id: string;
  name: string;
  savedAt: number;
  presetId: VocalPresetId;
  micGain: number;
  backingGain: number;
  eqBandsDb: number[];
  eqProfile: EqProfileId | "custom";
  highPassHz: number | null;
  lowPassHz: number | null;
  compressorThresholdDb: number;
  compressorRatio: number;
  outputGainDb: number;
  reverbAmount: number;
  delayAmount: number;
  ampCharacter: AmpCharacter;
  ampDrive: number;
  ampBassDb: number;
  ampMidDb: number;
  ampTrebleDb: number;
};

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readSavedVocalSetups(raw: string | null): SavedVocalSetup[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.slice(0, 30).flatMap((entry): SavedVocalSetup[] => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const preset = VOCAL_PRESETS.find((candidate) => candidate.id === item.presetId && candidate.available);
      const bands = Array.isArray(item.eqBandsDb) && item.eqBandsDb.length === 10
        ? item.eqBandsDb.map((gain) => boundedNumber(gain, 0, -9, 9))
        : null;
      const ampCharacter = ["clean", "tube", "crunch", "fuzz"].includes(String(item.ampCharacter)) ? item.ampCharacter as AmpCharacter : "clean";
      const eqProfile = Object.prototype.hasOwnProperty.call(EQ_PROFILES, String(item.eqProfile)) ? item.eqProfile as EqProfileId : item.eqProfile === "custom" ? "custom" : "flat";
      if (typeof item.id !== "string" || typeof item.name !== "string" || !item.name.trim() || !preset || !bands) return [];
      return [{
        id: item.id.slice(0, 100), name: item.name.trim().slice(0, 48), savedAt: boundedNumber(item.savedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
        presetId: preset.id, micGain: boundedNumber(item.micGain, 100, 0, 150), backingGain: boundedNumber(item.backingGain, 70, 0, 120),
        eqBandsDb: bands, eqProfile,
        highPassHz: item.highPassHz === null ? null : item.highPassHz === undefined ? null : boundedNumber(item.highPassHz, preset.highPassHz, 20, 1000),
        lowPassHz: item.lowPassHz === null ? null : item.lowPassHz === undefined ? null : boundedNumber(item.lowPassHz, preset.lowPassHz ?? 20000, 1000, 20000),
        compressorThresholdDb: boundedNumber(item.compressorThresholdDb, -20, -36, -8), compressorRatio: boundedNumber(item.compressorRatio, 3, 1, 8),
        outputGainDb: boundedNumber(item.outputGainDb, 0, -12, 6), reverbAmount: boundedNumber(item.reverbAmount, 100, 0, 150), delayAmount: boundedNumber(item.delayAmount, 100, 0, 150),
        ampCharacter, ampDrive: boundedNumber(item.ampDrive, 25, 0, 100), ampBassDb: boundedNumber(item.ampBassDb, 0, -6, 6),
        ampMidDb: boundedNumber(item.ampMidDb, 0, -6, 6), ampTrebleDb: boundedNumber(item.ampTrebleDb, 0, -6, 6),
      }];
    });
  } catch {
    return [];
  }
}

type PresetFilter = "all" | "natural" | "space" | "character" | "experimental";
const AMP_CHARACTERS: ReadonlyArray<{ id: AmpCharacter; label: string; description: string }> = [
  { id: "clean", label: "Clean preamp", description: "No added saturation; tone controls still work." },
  { id: "tube", label: "Warm tube", description: "Rounded soft clipping and gentle harmonic colour." },
  { id: "crunch", label: "Crunch", description: "More audible bite and density for creative vocals." },
  { id: "fuzz", label: "Fuzz", description: "Harder clipping for an intentionally rough character." },
];
const PRESET_FILTERS = [
  { key: "natural", label: "Clean & vocal", Icon: Mic },
  { key: "space", label: "Space & echo", Icon: Waves },
  { key: "character", label: "Character", Icon: Radio },
  { key: "experimental", label: "Experimental", Icon: Sparkles },
  { key: "all", label: "All presets", Icon: AudioLines },
] as const;

function presetCategory(id: VocalPresetId): Exclude<PresetFilter, "all"> {
  if (id === "natural-tune" || id === "hard-tune") return "experimental";
  if (["dream-hall", "slapback", "wide-chorus", "studio-room", "ambient", "arena"].includes(id)) return "space";
  if (["lofi", "telephone", "megaphone", "vocal-double"].includes(id)) return "character";
  return "natural";
}

function formatFrequency(frequency: number): string {
  return frequency >= 1000 ? `${Number((frequency / 1000).toFixed(frequency >= 10000 ? 0 : 1))}k` : String(frequency);
}

type ActiveGraph = {
  context: AudioContext;
  camera: MediaStream;
  recordStream: MediaStream;
  recordDestination: MediaStreamAudioDestinationNode;
  backingSource: AudioBufferSourceNode;
  stopEffects: () => void;
  analyser: AnalyserNode;
};

function getAudioContextConstructor() {
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

async function decodeLocalFile(file: File): Promise<AudioBuffer> {
  const Context = getAudioContextConstructor();
  if (!Context) throw new Error("This browser does not support Web Audio for live performance mixing.");
  const context = new Context();
  try { return await context.decodeAudioData(await file.arrayBuffer()); }
  finally { await context.close().catch(() => undefined); }
}

function preferredVideoMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((value) => MediaRecorder.isTypeSupported(value)) ?? "";
}

export function MusicLiveVideoStudio() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceBuffer, setSourceBuffer] = useState<AudioBuffer | null>(null);
  const [sourceMeta, setSourceMeta] = useState("");
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState("");
  const [cueStartSeconds, setCueStartSeconds] = useState(0);
  const [presetId, setPresetId] = useState<VocalPresetId>("pop");
  const [presetFilter, setPresetFilter] = useState<PresetFilter>("natural");
  const [presetSearch, setPresetSearch] = useState("");
  const [savedSetups, setSavedSetups] = useState<SavedVocalSetup[]>([]);
  const [savedSetupsLoaded, setSavedSetupsLoaded] = useState(false);
  const [savedSetupName, setSavedSetupName] = useState("");
  const [selectedSavedSetupId, setSelectedSavedSetupId] = useState("");
  const [abSnapshotA, setAbSnapshotA] = useState<SavedVocalSetup | null>(null);
  const [abSnapshotB, setAbSnapshotB] = useState<SavedVocalSetup | null>(null);
  const [activeAbSlot, setActiveAbSlot] = useState<"A" | "B" | null>(null);
  const [micGain, setMicGain] = useState(100);
  const [backingGain, setBackingGain] = useState(70);
  const [eqBandsDb, setEqBandsDb] = useState<number[]>(() => [...EQ_PROFILES["flat"].bandsDb]);
  const [eqProfile, setEqProfile] = useState<EqProfileId | "custom">("flat");
  const [highPassHz, setHighPassHz] = useState<number | null>(null);
  const [lowPassHz, setLowPassHz] = useState<number | null>(null);
  const eqGraphDragBandRef = useRef<number | null>(null);
  const [compressorThresholdDb, setCompressorThresholdDb] = useState(-20);
  const [compressorRatio, setCompressorRatio] = useState(3);
  const [outputGainDb, setOutputGainDb] = useState(0);
  const [reverbAmount, setReverbAmount] = useState(100);
  const [delayAmount, setDelayAmount] = useState(100);
  const [ampCharacter, setAmpCharacter] = useState<AmpCharacter>("clean");
  const [ampDrive, setAmpDrive] = useState(25);
  const [ampBassDb, setAmpBassDb] = useState(0);
  const [ampMidDb, setAmpMidDb] = useState(0);
  const [ampTrebleDb, setAmpTrebleDb] = useState(0);
  const [monitorMic, setMonitorMic] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [takeUrl, setTakeUrl] = useState("");
  const [takeBlob, setTakeBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState("Import a local backing track or an instrumental stem exported from Music Studio.");
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const presetImportRef = useRef<HTMLInputElement | null>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumAnimationRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const activeGraphRef = useRef<ActiveGraph | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const hardStopRef = useRef<number | null>(null);
  const takeUrlRef = useRef("");
  const recorderFailedRef = useRef(false);
  const sourcePreviewUrlRef = useRef("");

  useEffect(() => {
    try { setSavedSetups(readSavedVocalSetups(window.localStorage.getItem(SAVED_VOCAL_SETUPS_KEY))); }
    catch { setSavedSetups([]); }
    setSavedSetupsLoaded(true);
  }, []);
  useEffect(() => {
    if (!savedSetupsLoaded) return;
    try { window.localStorage.setItem(SAVED_VOCAL_SETUPS_KEY, JSON.stringify(savedSetups.slice(0, 30))); }
    catch { setStatus("This browser cannot persist sound setups in local storage. You can still use the current settings for this session."); }
  }, [savedSetups, savedSetupsLoaded]);
  useEffect(() => { cameraStreamRef.current = cameraStream; }, [cameraStream]);
  useEffect(() => {
    if (cameraRef.current && cameraStream) {
      cameraRef.current.srcObject = cameraStream;
      void cameraRef.current.play().catch(() => undefined);
    }
  }, [cameraStream]);
  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("audioSessionId");
    if (!sessionId) return;
    let active = true;
    void loadAudioSessionFile(sessionId).then((file) => {
      if (active && file) void chooseSource(file);
      else if (active) setStatus("The Music Studio handoff expired or is unavailable. Please import the exported instrumental stem again.");
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to restore the local Music Studio handoff.");
    });
    return () => { active = false; };
    // Restore only the initial route handoff; subsequent imports are user actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS && recorderRef.current?.state === "recording") stopRecording();
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => () => {
    if (hardStopRef.current !== null) window.clearTimeout(hardStopRef.current);
    if (spectrumAnimationRef.current !== null) window.cancelAnimationFrame(spectrumAnimationRef.current);
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      // Prevent asynchronous MediaRecorder events from calling setState after unmount.
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      try { if (recorder.state === "recording") recorder.stop(); } catch { /* Already stopped. */ }
    }
    chunksRef.current = [];
    const active = activeGraphRef.current;
    activeGraphRef.current = null;
    active?.camera.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (active) void active.context.close().catch(() => undefined);
    if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
    if (sourcePreviewUrlRef.current) URL.revokeObjectURL(sourcePreviewUrlRef.current);
  }, []);

  const chooseSource = useCallback(async (file: File) => {
    setError(null);
    if (file.size <= 0) { setError("The chosen audio file is empty."); return; }
    if (file.size > MAX_SOURCE_BYTES) { setError("For device memory safety, choose a backing file no larger than 100 MB."); return; }
    if (recording) { setError("Stop the current performance before changing the backing track."); return; }
    setStatus("Decoding backing audio locally; the file is not uploaded.");
    try {
      const buffer = await decodeLocalFile(file);
      if (buffer.duration < 0.1) throw new Error("The decoded backing track is too short.");
      if (sourcePreviewUrlRef.current) URL.revokeObjectURL(sourcePreviewUrlRef.current);
      const previewUrl = URL.createObjectURL(file); sourcePreviewUrlRef.current = previewUrl; setSourcePreviewUrl(previewUrl);
      setSourceFile(file); setSourceBuffer(buffer); setCueStartSeconds(0);
      setSourceMeta(`${buffer.duration.toFixed(1)} sec · ${buffer.sampleRate.toLocaleString()} Hz · ${buffer.numberOfChannels} channel(s) · ${(file.size / 1_000_000).toFixed(1)} MB`);
      setStatus(`Backing track ready: ${file.name}. Preview and record locally; export creates one synced video with the backing mix and processed microphone.`);
    } catch (cause) { setSourceFile(null); setSourceBuffer(null); setSourceMeta(""); setError(cause instanceof Error ? cause.message : "This browser could not decode the selected audio format."); }
  }, [recording]);

  async function startCameraPreview() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) { setError("Camera and microphone capture requires a current browser over HTTPS or localhost."); return; }
    try {
      stopCameraPreview();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      setCameraStream(stream); cameraStreamRef.current = stream;
      setStatus("Camera and microphone are ready. Wired headphones are strongly recommended to prevent backing-track bleed and echo.");
    } catch (cause) {
      setError(cause instanceof Error ? `Could not start camera/microphone: ${cause.message}. Check permissions and whether another app is using the camera.` : "Could not start camera/microphone.");
    }
  }

  function stopCameraPreview() {
    if (recording) return;
    const stream = cameraStreamRef.current;
    stream?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null; setCameraStream(null);
  }

  async function startRecording() {
    if (!sourceBuffer) { setError("Import a backing track first."); return; }
    if (!cameraStreamRef.current?.getVideoTracks().some((track) => track.readyState === "live")) { setError("Start the camera preview and grant camera/microphone access first."); return; }
    const mimeType = preferredVideoMimeType();
    if (!mimeType) { setError("This browser does not expose a supported MediaRecorder video format. Try a recent Chrome, Edge, or Safari browser."); return; }
    let context: AudioContext | null = null;
    let effectCleanup: (() => void) | null = null;
    let unownedAudioTracks: MediaStream | null = null;
    try {
      const Context = getAudioContextConstructor();
      if (!Context) throw new Error("Web Audio is not supported in this browser.");
      context = new Context({ latencyHint: "interactive" }); await context.resume();
      const recordDestination = context.createMediaStreamDestination();
      const micInput = context.createMediaStreamSource(cameraStreamRef.current!);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.78; analyser.minDecibels = -85; analyser.maxDecibels = -20;
      // AnalyserNode passes audio through unchanged; it exposes spectrum data before the effects chain.
      micInput.connect(analyser);
      const voiceBus = context.createGain(); voiceBus.gain.value = Math.min(2, Math.max(0, micGain / 100));
      const preset = getVocalPreset(presetId);
      const stopEffects = connectVocalPreset(context, analyser, voiceBus, preset.available ? presetId : "clean", {
        eqBandsDb,
        ...(highPassHz === null ? {} : { highPassHz }),
        ...(lowPassHz === null ? {} : { lowPassHz }),
        compressorThresholdDb,
        compressorRatio,
        outputGainDb,
        reverbAmount,
        delayAmount,
        ampCharacter,
        ampDrive,
        ampBassDb,
        ampMidDb,
        ampTrebleDb,
      });
      effectCleanup = stopEffects;
      voiceBus.connect(recordDestination);
      if (monitorMic) voiceBus.connect(context.destination);
      const backingSource = context.createBufferSource(); backingSource.buffer = sourceBuffer; backingSource.loop = true; backingSource.loopStart = Math.max(0, Math.min(cueStartSeconds, Math.max(0, sourceBuffer.duration - 0.05))); backingSource.loopEnd = sourceBuffer.duration;
      const backingVolume = context.createGain(); backingVolume.gain.value = Math.max(0, Math.min(1.5, backingGain / 100));
      backingSource.connect(backingVolume).connect(recordDestination);
      // Backing playback is monitored locally while the same Web Audio clock feeds the recorder.
      backingVolume.connect(context.destination);
      const videoTracks = cameraStreamRef.current!.getVideoTracks();
      const mixedStream = new MediaStream([...videoTracks, ...recordDestination.stream.getAudioTracks()]);
      unownedAudioTracks = recordDestination.stream;
      const recorder = new MediaRecorder(mixedStream, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 160_000 });
      const graph: ActiveGraph = { context, camera: cameraStreamRef.current!, recordStream: mixedStream, recordDestination, backingSource, stopEffects, analyser };
      activeGraphRef.current = graph; chunksRef.current = []; recorderFailedRef.current = false;
      effectCleanup = null; unownedAudioTracks = null;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        recorderFailedRef.current = true;
        setError("The browser stopped recording unexpectedly. The incomplete take will be discarded; your original backing file is still available to retry.");
        setRecording(false); setFinalizing(true);
        try { if (recorder.state === "recording") recorder.stop(); } catch { /* Stop may already be in progress. */ }
      };
      recorder.onstop = () => {
        setFinalizing(true);
        const outputType = recorder.mimeType || mimeType;
        const failedTake = recorderFailedRef.current;
        recorderFailedRef.current = false;
        const blob = new Blob(chunksRef.current, { type: outputType });
        chunksRef.current = [];
        if (spectrumAnimationRef.current !== null) { window.cancelAnimationFrame(spectrumAnimationRef.current); spectrumAnimationRef.current = null; }
        const currentGraph = activeGraphRef.current;
        activeGraphRef.current = null;
        currentGraph?.stopEffects();
        try { currentGraph?.backingSource.stop(); } catch { /* Source may have stopped already. */ }
        currentGraph?.camera.getTracks().forEach((track) => track.stop());
        currentGraph?.recordStream.getTracks().forEach((track) => { if (track.kind === "audio") track.stop(); });
        if (currentGraph) void currentGraph.context.close().catch(() => undefined);
        cameraStreamRef.current = null; setCameraStream(null);
        if (hardStopRef.current !== null) { window.clearTimeout(hardStopRef.current); hardStopRef.current = null; }
        if (failedTake) {
          if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
          takeUrlRef.current = ""; setTakeUrl(""); setTakeBlob(null);
        } else if (blob.size > 0) {
          if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
          const url = URL.createObjectURL(blob); takeUrlRef.current = url;
          setTakeUrl(url); setTakeBlob(blob);
          const actualDuration = Math.min(MAX_RECORDING_SECONDS, Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
          setElapsedSeconds(actualDuration);
          setStatus(`Performance captured locally (${(blob.size / 1_000_000).toFixed(1)} MB, ${actualDuration} sec). Review before download; storage remains subject to browser/device limits.`);
        } else setError("The recorder returned an empty file. Nothing was exported; check browser permissions and available storage, then retry.");
        setRecording(false); setFinalizing(false);
      };
      recorderRef.current = recorder;
      // Clear the previous preview before a new encoder starts so URL-backed blobs do not accumulate.
      if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
      takeUrlRef.current = ""; setTakeBlob(null); setTakeUrl("");
      // Start encoder before scheduling audio from the AudioContext clock to reduce first-frame offset.
      recorder.start(250); startedAtRef.current = Date.now(); setElapsedSeconds(0); setRecording(true);
      const paintSpectrum = () => {
        const canvas = spectrumCanvasRef.current;
        const activeGraph = activeGraphRef.current;
        if (!canvas || activeGraph?.analyser !== analyser || recorder.state !== "recording") { spectrumAnimationRef.current = null; return; }
        const cssWidth = Math.max(1, canvas.clientWidth);
        const cssHeight = Math.max(1, canvas.clientHeight);
        const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const pixelWidth = Math.round(cssWidth * dpr), pixelHeight = Math.round(cssHeight * dpr);
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
        const drawing = canvas.getContext("2d");
        if (drawing) {
          drawing.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawing.clearRect(0, 0, cssWidth, cssHeight);
          drawing.strokeStyle = "rgba(128,128,128,0.22)"; drawing.lineWidth = 1;
          for (const mark of [0.25, 0.5, 0.75]) { drawing.beginPath(); drawing.moveTo(0, cssHeight * mark); drawing.lineTo(cssWidth, cssHeight * mark); drawing.stroke(); }
          const bins = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(bins);
          const count = 40, gap = Math.max(1, cssWidth / count * 0.16), barWidth = Math.max(1, cssWidth / count - gap);
          drawing.fillStyle = getComputedStyle(canvas).color || "#64748b";
          for (let index = 0; index < count; index++) {
            const from = Math.max(0, Math.floor(Math.pow(bins.length, index / count)));
            const to = Math.max(from + 1, Math.floor(Math.pow(bins.length, (index + 1) / count)));
            let peak = 0; for (let bin = from; bin < Math.min(bins.length, to); bin++) peak = Math.max(peak, bins[bin] ?? 0);
            const level = Math.max(0.025, peak / 255);
            const barHeight = level * (cssHeight - 4);
            drawing.fillRect(index * (cssWidth / count), cssHeight - barHeight, barWidth, barHeight);
          }
        }
        spectrumAnimationRef.current = window.requestAnimationFrame(paintSpectrum);
      };
      spectrumAnimationRef.current = window.requestAnimationFrame(paintSpectrum);
      backingSource.start(context.currentTime + 0.03, Math.max(0, Math.min(cueStartSeconds, Math.max(0, sourceBuffer.duration - 0.05))));
      const latencyContext = context as AudioContext & { outputLatency?: number };
      const latencySeconds = Math.max(0, context.baseLatency || 0) + Math.max(0, latencyContext.outputLatency || 0);
      const latencyNote = latencySeconds > 0 ? ` Browser-reported output latency is about ${(latencySeconds * 1000).toFixed(0)} ms; use wired headphones for timing-sensitive takes.` : " Use wired headphones for timing-sensitive takes.";
      setStatus((preset.available ? `Recording video + microphone + backing track with ${preset.label}.` : "Recording video + backing track with clean microphone audio; pitch-correction preset is unavailable in this build.") + latencyNote);
      hardStopRef.current = window.setTimeout(() => { if (recorderRef.current?.state === "recording") stopRecording(); }, MAX_RECORDING_SECONDS * 1000);
    } catch (cause) {
      if (spectrumAnimationRef.current !== null) { window.cancelAnimationFrame(spectrumAnimationRef.current); spectrumAnimationRef.current = null; }
      const failedGraph = activeGraphRef.current;
      activeGraphRef.current = null;
      try { failedGraph?.stopEffects(); } catch { /* Failed recorder startup can leave nodes partly connected. */ }
      try { effectCleanup?.(); } catch { /* Effect graph may already be disconnected. */ }
      unownedAudioTracks?.getTracks().forEach((track) => track.stop());
      failedGraph?.recordStream.getAudioTracks().forEach((track) => track.stop());
      if (context) await context.close().catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "Could not start the live performance recorder.");
      setRecording(false); setFinalizing(false);
    }
  }

  function stopRecording() {
    if (hardStopRef.current !== null) { window.clearTimeout(hardStopRef.current); hardStopRef.current = null; }
    const recorder = recorderRef.current; recorderRef.current = null;
    if (recorder?.state === "recording") { setRecording(false); setFinalizing(true); recorder.stop(); }
  }

  async function handoffCurrentSource() {
    if (!sourceFile) return;
    try {
      const session = await saveAudioSessionFile(sourceFile);
      window.location.href = `/tools/audio/music-studio?audioSessionId=${encodeURIComponent(session.id)}&mode=duet`;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create a local handoff to Music Studio."); }
  }

  const currentPreset = getVocalPreset(presetId);
  const normalizedPresetSearch = presetSearch.trim().toLocaleLowerCase();
  const visiblePresets = VOCAL_PRESETS.filter((preset) =>
    (presetFilter === "all" || presetCategory(preset.id) === presetFilter) &&
    (!normalizedPresetSearch || `${preset.label} ${preset.description} ${preset.id}`.toLocaleLowerCase().includes(normalizedPresetSearch)),
  );
  const eqGraphX = (frequency: number) => 22 + ((Math.log10(frequency) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20))) * 556;
  const eqGraphY = (gainDb: number) => 80 - (gainDb / 9) * 60;
  const eqChartPoints = EQ_BAND_FREQUENCIES.map((frequency, index) => `${eqGraphX(frequency).toFixed(1)},${eqGraphY(eqBandsDb[index] ?? 0).toFixed(1)}`).join(" ");
  const updateEqFromGraphPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bandIndex = eqGraphDragBandRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    if (bandIndex === null || rect.height <= 0) return;
    const svgY = ((event.clientY - rect.top) / rect.height) * 176;
    const gainDb = Math.max(-9, Math.min(9, Math.round(((80 - svgY) / 60 * 9) * 2) / 2));
    setEqBandsDb((current) => current.map((gain, index) => index === bandIndex ? gainDb : gain));
    setEqProfile("custom");
  };
  const startEqGraphDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (recording || finalizing) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * 600;
    eqGraphDragBandRef.current = EQ_BAND_FREQUENCIES.reduce((bestIndex, frequency, index, frequencies) => {
      const bestDistance = Math.abs(eqGraphX(frequencies[bestIndex]) - svgX);
      const distance = Math.abs(eqGraphX(frequency) - svgX);
      return distance < bestDistance ? index : bestIndex;
    }, 0);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is not available in every embedded browser. */ }
    updateEqFromGraphPointer(event);
  };
  const endEqGraphDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    eqGraphDragBandRef.current = null;
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* The browser may already have released the pointer. */ }
  };
  const saveCurrentVocalSetup = () => {
    const name = savedSetupName.trim();
    if (!name) { setError("Enter a name for this sound setup before saving."); return; }
    const existing = savedSetups.find((setup) => setup.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    const id = existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const setup: SavedVocalSetup = {
      id, name: name.slice(0, 48), savedAt: Date.now(), presetId, micGain, backingGain,
      eqBandsDb: eqBandsDb.map((gain) => boundedNumber(gain, 0, -9, 9)), eqProfile,
      highPassHz, lowPassHz, compressorThresholdDb, compressorRatio, outputGainDb, reverbAmount, delayAmount,
      ampCharacter, ampDrive, ampBassDb, ampMidDb, ampTrebleDb,
    };
    setSavedSetups([setup, ...savedSetups.filter((item) => item.id !== id)].slice(0, 30));
    setSelectedSavedSetupId(id);
    setSavedSetupName(setup.name);
    setError(null);
    setStatus(`Saved “${setup.name}” on this device. Only sound-control values were saved; no audio or video was stored in the setup.`);
  };

  const applyVocalSetup = (setup: SavedVocalSetup, source: string = "saved setup") => {
    setPresetId(setup.presetId); setMicGain(setup.micGain); setBackingGain(setup.backingGain);
    setEqBandsDb([...setup.eqBandsDb]); setEqProfile(setup.eqProfile);
    setHighPassHz(setup.highPassHz); setLowPassHz(setup.lowPassHz);
    setCompressorThresholdDb(setup.compressorThresholdDb); setCompressorRatio(setup.compressorRatio); setOutputGainDb(setup.outputGainDb);
    setReverbAmount(setup.reverbAmount); setDelayAmount(setup.delayAmount); setAmpCharacter(setup.ampCharacter); setAmpDrive(setup.ampDrive);
    setAmpBassDb(setup.ampBassDb); setAmpMidDb(setup.ampMidDb); setAmpTrebleDb(setup.ampTrebleDb);
    setError(null); setStatus(`Loaded ${source} “${setup.name}”. Record a short test and adjust by ear before a full take.`);
  };

  const loadSavedVocalSetup = () => {
    const setup = savedSetups.find((item) => item.id === selectedSavedSetupId);
    if (setup) applyVocalSetup(setup);
  };

  const currentPortableSettings = (): PortableAudioStudioSettings | null => normalizePortableAudioSettings({
    presetId, micGain, backingGain, eqBandsDb, eqProfile, highPassHz, lowPassHz, compressorThresholdDb,
    compressorRatio, outputGainDb, reverbAmount, delayAmount, effectAmount: Math.max(reverbAmount, delayAmount),
    ampCharacter, ampDrive, ampBassDb, ampMidDb, ampTrebleDb,
  });

  const saveAbSnapshot = (slot: "A" | "B") => {
    const settings = currentPortableSettings();
    if (!settings) { setError("Could not capture the current sound settings."); return; }
    const snapshot: SavedVocalSetup = { id: `ab-${slot}`, name: `Snapshot ${slot}`, savedAt: Date.now(), ...settings };
    if (slot === "A") setAbSnapshotA(snapshot); else setAbSnapshotB(snapshot);
    setActiveAbSlot(slot);
    setStatus(`Saved the current sound controls to temporary A/B snapshot ${slot}. Snapshots stay in memory and are not exported with recordings.`);
  };

  const recallAbSnapshot = (slot: "A" | "B") => {
    const snapshot = slot === "A" ? abSnapshotA : abSnapshotB;
    if (!snapshot) return;
    applyVocalSetup(snapshot, `A/B snapshot ${slot}`);
    setActiveAbSlot(slot);
  };

  const exportPortableSetup = () => {
    const setup = savedSetups.find((item) => item.id === selectedSavedSetupId);
    if (!setup) return;
    const portable = createAudioStudioPresetFile(setup.name, setup);
    if (!portable) { setError("This saved setup could not be exported because its settings are invalid."); return; }
    const safeName = setup.name.toLocaleLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "sound-setup";
    downloadBlob(new Blob([JSON.stringify(portable, null, 2)], { type: "application/json" }), `env-${safeName}.env-audio-preset.json`);
    setStatus(`Exported “${setup.name}” as a portable enV preset. The file contains control values only, not audio or video.`);
  };

  const importPortableSetup = async (file?: File) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_AUDIO_STUDIO_PRESET_BYTES) { setError("Preset files must be 256 KB or smaller."); return; }
    try {
      const preset = parseAudioStudioPresetFile(await file.text());
      if (!preset) { setError("This is not a valid supported enV Audio Studio preset (version 1), or its values could not be read safely."); return; }
      const setup: SavedVocalSetup = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: preset.name, savedAt: Date.now(), ...preset.settings };
      const existing = savedSetups.find((item) => item.name.toLocaleLowerCase() === setup.name.toLocaleLowerCase());
      setup.id = existing?.id ?? setup.id;
      setSavedSetups([setup, ...savedSetups.filter((item) => item.id !== setup.id)].slice(0, 30));
      setSelectedSavedSetupId(setup.id); setSavedSetupName(setup.name);
      applyVocalSetup(setup, "imported preset");
      setStatus(`Imported and applied “${setup.name}”. Settings are saved locally on this device; no media was imported.`);
    } catch (cause) {
      setError(cause instanceof Error ? `Could not import preset: ${cause.message}` : "Could not import this preset file.");
    } finally {
      if (presetImportRef.current) presetImportRef.current.value = "";
    }
  };

  const deleteSelectedVocalSetup = () => {
    const setup = savedSetups.find((item) => item.id === selectedSavedSetupId);
    if (!setup) return;
    setSavedSetups(savedSetups.filter((item) => item.id !== setup.id));
    setSelectedSavedSetupId("");
    setStatus(`Deleted “${setup.name}” from this device. Existing recordings were not changed.`);
  };

  const resetSound = () => {
    setEqBandsDb([...EQ_PROFILES.flat.bandsDb]); setEqProfile("flat"); setPresetId("pop"); setHighPassHz(null); setLowPassHz(null);
    setCompressorThresholdDb(-20); setCompressorRatio(3); setOutputGainDb(0); setReverbAmount(100); setDelayAmount(100); setMicGain(100); setMonitorMic(false);
    setAmpCharacter("clean"); setAmpDrive(25); setAmpBassDb(0); setAmpMidDb(0); setAmpTrebleDb(0); setPresetSearch(""); setPresetFilter("natural");
  };
  return <section className="space-y-4 sm:space-y-5" aria-labelledby="live-video-title">
    <header className="relative isolate overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4 text-white shadow-sm sm:p-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden items-center gap-[3px] pr-6 opacity-25 sm:flex">{[18,32,46,25,62,38,78,43,24,54,85,36,48,27,67,41,22,57,72,31,45,64,28,52,82,35,20,49,68,39,26,58,76,33,44,61,28,52].map((height,index)=><span key={index} className="w-[3px] rounded-full bg-cyan-300" style={{height:`${height}%`}}/>)}</div>
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Video size={24}/></span><div className="min-w-0"><div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80"><AudioLines size={13}/> enV · Performance</div><h2 id="live-video-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Live Video Studio</h2><p className="mt-1 text-sm text-slate-300">Choose a sound. Capture a take. Export the mix.</p></div></div>
        <div className="flex flex-wrap gap-2"><span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 text-xs text-emerald-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300"/> On-device capture</span><a href="/tools/audio/music-studio" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"><Music2 size={16}/> Full Music Studio</a></div>
      </div>
      <details className="relative mt-4 border-t border-white/10 pt-3 text-xs text-slate-300"><summary className="min-h-8 w-fit cursor-pointer select-none py-1 pr-2 font-medium text-slate-200 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300">Rights & privacy: local capture</summary><p className="mt-2 max-w-3xl leading-relaxed">Use audio you own or have permission to perform. enV does not download DRM-protected streams. Camera, microphone and backing audio stay on this device for this workflow; this studio does not upload them. Wired headphones help minimize backing bleed, feedback and monitoring delay.</p></details>
    </header>
    <p className="sr-only">Mobile workflow: choose a goal, add a short audio file, then use the selected workspace. Processed tracks and takes appear here when ready to review or export.</p>
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recommended order</p>
      <div className="grid grid-cols-3 gap-2">
        <div className={`flex min-w-0 items-start gap-2 rounded-lg border p-2.5 ${sourceBuffer ? "border-primary/40 bg-primary/5" : "border-border bg-background"}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">{sourceBuffer ? "✓" : "1"}</span><span className="min-w-0"><strong className="block text-sm">Add backing track</strong><span className="mt-0.5 block text-xs text-muted-foreground">Import audio you can use.</span></span></div>
        <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-background p-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">2</span><span className="min-w-0"><strong className="block text-sm">Choose vocal sound</strong><span className="mt-0.5 block text-xs text-muted-foreground">Start with a preset; tune later.</span></span></div>
        <div className={`flex min-w-0 items-start gap-2 rounded-lg border p-2.5 ${cameraStream ? "border-primary/40 bg-primary/5" : "border-border bg-background"}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">{cameraStream ? "✓" : "3"}</span><span className="min-w-0"><strong className="block text-sm">Record & download</strong><span className="mt-0.5 block text-xs text-muted-foreground">Review your take before exporting.</span></span></div>
      </div>
    </div>
    <nav aria-label="Studio sections" className="grid grid-cols-3 gap-2">
      <a href="#live-backing-panel" className="flex min-h-12 min-w-0 items-center justify-start gap-2 rounded-xl border border-border bg-background px-2.5 py-2 text-left text-xs transition hover:border-primary/40 hover:bg-surface-2 sm:px-3 sm:text-sm"><Music2 size={16} aria-hidden="true"/> Backing track</a>
      <a href="#live-sound-panel" className="flex min-h-12 min-w-0 items-center justify-start gap-2 rounded-xl border border-border bg-background px-2.5 py-2 text-left text-xs transition hover:border-primary/40 hover:bg-surface-2 sm:px-3 sm:text-sm"><SlidersHorizontal size={16} aria-hidden="true"/> Vocal sound</a>
      <a href="#live-capture-panel" className="flex min-h-12 min-w-0 items-center justify-start gap-2 rounded-xl border border-border bg-background px-2.5 py-2 text-left text-xs transition hover:border-primary/40 hover:bg-surface-2 sm:px-3 sm:text-sm"><Video size={16} aria-hidden="true"/> Capture & review</a>
    </nav>

    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(270px,0.75fr)]">
      <div id="live-capture-panel" className="order-2 min-w-0 space-y-3 lg:order-1">
        <div className="overflow-hidden rounded-2xl border border-border bg-black">
          {cameraStream ? <video ref={cameraRef} className="aspect-video w-full object-cover" autoPlay muted playsInline aria-label="Live camera preview" /> : <div className="flex aspect-video flex-col items-center justify-center gap-3 p-5 text-center text-white/80"><Camera size={36}/><strong>Camera preview</strong><p className="max-w-sm text-sm">Start camera when ready. Browser will request camera and microphone access.</p></div>}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          {!cameraStream ? <Button className="min-h-12 w-full justify-center sm:w-auto" type="button" onClick={() => void startCameraPreview()}><Camera size={16} className="mr-2"/> Start camera & mic</Button> : <Button className="min-h-12 w-full justify-center sm:w-auto" type="button" variant="outline" disabled={recording} onClick={stopCameraPreview}><CameraOff size={16} className="mr-2"/> Release camera</Button>}
          <Button className="min-h-12 w-full justify-center sm:w-auto" type="button" disabled={!cameraStream || !sourceBuffer || recording || finalizing} onClick={() => void startRecording()}><Video size={16} className="mr-2"/> Start performance</Button>
          <Button className="min-h-12 w-full justify-center sm:w-auto" type="button" variant="danger" disabled={!recording} onClick={stopRecording}><CircleStop size={16} className="mr-2"/> Stop & finalize</Button>
        </div>
        {!sourceBuffer ? <p className="rounded-lg border border-border bg-surface-2/60 p-3 text-sm text-muted-foreground" role="status">Start with <strong className="text-foreground">1. Add your backing track</strong> on the right (or above on mobile). Recording becomes available after the audio is ready.</p> : !cameraStream ? <p className="rounded-lg border border-border bg-surface-2/60 p-3 text-sm text-muted-foreground" role="status"><strong className="text-foreground">Backing track ready.</strong> Start camera & mic when you are ready; your browser will ask for permission.</p> : recording ? null : <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm" role="status"><strong>Ready to record.</strong> Use headphones, check your backing level, then start the performance.</p>}
        {(recording || finalizing) ? <div className="rounded-lg border border-border p-3 text-sm" role="status" aria-live="polite"><div className="flex items-center justify-between gap-2"><strong>{recording ? "Recording in progress" : "Finalizing video"}</strong><span className="font-mono">{Math.floor(elapsedSeconds / 60).toString().padStart(2, "0")}:{(elapsedSeconds % 60).toString().padStart(2, "0")}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, elapsedSeconds / MAX_RECORDING_SECONDS * 100)}%` }}/></div><p className="mt-2 text-xs text-muted-foreground">Hard limit: five minutes per take to protect memory and device thermals. Stop to finalize your file.</p></div> : null}
        {takeUrl ? <div className="space-y-3 rounded-xl border border-border p-3"><div><h3 className="font-semibold">3. Review your performance</h3><p className="mt-1 text-xs text-muted-foreground">Confirm audio/video timing, voice level and backing balance before sharing.</p></div><video src={takeUrl} controls playsInline className="max-h-[60vh] w-full rounded-lg bg-black"/><div className="flex flex-wrap gap-2"><Button type="button" onClick={() => takeBlob && downloadBlob(takeBlob, `env-live-performance.${takeBlob.type.includes("mp4") ? "mp4" : "webm"}`)}><Download size={16} className="mr-2"/> Download video</Button><Button type="button" variant="outline" onClick={() => { if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current); takeUrlRef.current = ""; setTakeUrl(""); setTakeBlob(null); setStatus("The preview copy was cleared from this screen."); }}><RotateCcw size={16} className="mr-2"/> Clear take</Button></div></div> : null}
      </div>
      <div className="order-1 min-w-0 space-y-4 lg:order-2">
        <div id="live-backing-panel" className="min-w-0 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">1. Add backing / instrumental</h3><span className="text-xs text-muted-foreground">Local only</span></div>
          <input ref={pickerRef} type="file" className="sr-only" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void chooseSource(file); event.currentTarget.value = ""; }}/>
          <Button type="button" variant="outline" className="mt-3 w-full" disabled={recording || finalizing} onClick={() => pickerRef.current?.click()}><FileAudio size={16} className="mr-2"/>{sourceFile ? "Change backing track" : "Import audio / instrumental stem"}</Button>
          {sourceFile ? <div className="mt-3 rounded-lg bg-surface-2 p-3"><strong className="block break-words text-sm">{sourceFile.name}</strong><p className="mt-1 text-xs text-muted-foreground">{sourceMeta}</p>{sourcePreviewUrl ? <audio className="mt-3 w-full" controls preload="metadata" src={sourcePreviewUrl} aria-label="Preview backing audio" /> : null}<label className="mt-3 block text-sm">Start from {cueStartSeconds.toFixed(1)} sec<input aria-label="Backing cue start in seconds" className="mt-2 block w-full" type="range" min="0" max={Math.max(0, sourceBuffer?.duration ?? 0)} step="0.1" value={Math.min(cueStartSeconds, sourceBuffer?.duration ?? 0)} disabled={recording || !sourceBuffer} onChange={(event) => setCueStartSeconds(Number(event.target.value))}/></label><p className="mt-1 text-xs text-muted-foreground">The backing starts at this cue and loops from it if the take runs past the song end.</p><Button type="button" variant="ghost" className="mt-1 h-auto p-0 text-xs" onClick={() => void handoffCurrentSource()}>Open in full Music Studio <Music2 size={13} className="ml-1"/></Button></div> : <p className="mt-3 text-xs text-muted-foreground">You can send an exported vocals-removed/instrumental stem here from the full Music Studio, or import a local audio file.</p>}
          <label className="mt-4 block text-sm">Backing level: {backingGain}%<input className="mt-2 block w-full" type="range" min="0" max="120" value={backingGain} disabled={recording} onChange={(event) => setBackingGain(Number(event.target.value))}/></label>
          <div className="mt-3 flex flex-wrap gap-2">{(["user", "environment"] as const).map((mode) => <button type="button" key={mode} disabled={recording} onClick={() => { setFacingMode(mode); if (cameraStream) { stopCameraPreview(); setStatus("Camera released. Start camera & mic again to apply the selected camera."); } }} aria-pressed={facingMode === mode} className={`min-h-9 rounded-lg border px-3 py-2 text-xs ${facingMode === mode ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-surface-2"}`}>{mode === "user" ? "Front camera" : "Rear camera"}</button>)}</div>
        </div>
        <div id="live-sound-panel" className="min-w-0 rounded-xl border border-border p-4">
          <div className="flex items-start gap-2"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><SlidersHorizontal size={18}/></div><div><h3 className="font-semibold">2. Choose vocal sound</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Choose a sound, then fine-tune the ten-band EQ, dynamics and effect sends. These controls affect the captured vocal track, not the backing.</p></div></div>
          <div className="mt-3 rounded-xl border border-border bg-surface-2/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Live microphone spectrum</h4><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${recording ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-surface-2 text-muted-foreground"}`}>{recording ? "Live" : "Standby"}</span></div>
            <canvas ref={spectrumCanvasRef} width={600} height={88} role="img" aria-label="Live frequency spectrum of the raw microphone input while recording" className="mt-2 block h-[88px] w-full text-primary" />
            <p className="mt-1 text-xs text-muted-foreground">Real analyser data from the raw microphone input before effects; the analyser passes audio through unchanged and only adds a visual readout. Start recording to activate it.</p>
          </div>
          <div className="mt-3 rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">A/B sound comparison</h4><span className="text-xs text-muted-foreground">{activeAbSlot ? `Last recalled: ${activeAbSlot}` : "Temporary snapshots"}</span></div>
            <p className="mt-1 text-xs text-muted-foreground">Capture a sound setup to A, change settings, capture B, then recall either snapshot to compare by ear. Snapshots stay in memory only.</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button type="button" className="min-h-11 rounded-lg border border-border px-2 text-xs hover:bg-surface-2" disabled={recording || finalizing} onClick={() => saveAbSnapshot("A")}>{abSnapshotA ? "Replace A" : "Save current to A"}</button>
              <button type="button" className="min-h-11 rounded-lg border border-border px-2 text-xs hover:bg-surface-2" disabled={recording || finalizing} onClick={() => saveAbSnapshot("B")}>{abSnapshotB ? "Replace B" : "Save current to B"}</button>
              <button type="button" aria-pressed={activeAbSlot === "A"} className={`min-h-11 rounded-lg border px-2 text-xs ${activeAbSlot === "A" ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-surface-2"}`} disabled={!abSnapshotA || recording || finalizing} onClick={() => recallAbSnapshot("A")}>Recall A{abSnapshotA ? ` · ${abSnapshotA.presetId}` : ""}</button>
              <button type="button" aria-pressed={activeAbSlot === "B"} className={`min-h-11 rounded-lg border px-2 text-xs ${activeAbSlot === "B" ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-surface-2"}`} disabled={!abSnapshotB || recording || finalizing} onClick={() => recallAbSnapshot("B")}>Recall B{abSnapshotB ? ` · ${abSnapshotB.presetId}` : ""}</button>
            </div>
          </div>
          <label className="mt-3 block text-sm"><span className="mb-1 block text-xs font-medium text-muted-foreground">Find a vocal preset</span><span className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-primary"><Search size={16} aria-hidden="true" className="shrink-0 text-muted-foreground"/><input value={presetSearch} onChange={(event) => setPresetSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" type="search" placeholder="Search clean, reverb, radio…" aria-label="Search vocal presets"/><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{visiblePresets.length}</span></span></label>
          <div className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Vocal preset categories">{PRESET_FILTERS.map(({ key, label, Icon }) => <button key={key} type="button" role="tab" aria-selected={presetFilter === key} onClick={() => setPresetFilter(key)} title={label} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${presetFilter === key ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-surface-2"}`}><Icon size={15} aria-hidden="true"/>{label}{key === "all" ? ` (${VOCAL_PRESETS.length})` : ""}</button>)}</div>
          <div className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">{visiblePresets.map((preset) => <button key={preset.id} type="button" disabled={!preset.available || recording} onClick={() => setPresetId(preset.id)} aria-pressed={presetId === preset.id} title={preset.label} className={`min-h-12 min-w-0 rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${presetId === preset.id ? "border-primary bg-primary/10" : "border-border hover:bg-surface-2"} ${!preset.available ? "cursor-not-allowed opacity-60" : ""}`}><span className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{preset.label}</strong>{preset.available ? <span className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Local DSP</span> : <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">Engine required</span>}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{preset.description}</span></button>)}{visiblePresets.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground sm:col-span-2 lg:col-span-1">No presets match that search. Try a different word or choose another category.</p> : null}</div>
          <label className="mt-4 block text-sm">Mic input / preamp: {micGain}%<input className="mt-2 block w-full accent-current" type="range" min="0" max="150" step="1" value={micGain} disabled={recording} onChange={(event) => setMicGain(Number(event.target.value))}/><span className="mt-1 block text-xs text-muted-foreground">Increase gently; excess input gain can clip before downstream processing.</span></label>
          <div className="mt-5 rounded-xl border border-border bg-surface-2/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">Filter / cleanup</h4><button type="button" disabled={recording || finalizing || (highPassHz === null && lowPassHz === null)} onClick={() => { setHighPassHz(null); setLowPassHz(null); }} className="min-h-9 rounded-md border border-border px-2 text-xs hover:bg-surface-2">Use preset defaults</button></div>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="min-w-0 text-sm">High-pass / low cut: {Math.round(highPassHz ?? currentPreset.highPassHz)} Hz<input className="mt-2 block w-full" type="range" min="20" max="1000" step="5" value={highPassHz ?? currentPreset.highPassHz} disabled={recording || finalizing} aria-label="High-pass low-cut frequency" onChange={(event) => setHighPassHz(Number(event.target.value))}/><span className="mt-1 block text-xs text-muted-foreground">Raise to remove more handling rumble and proximity bass.</span></label>
              <label className="min-w-0 text-sm">Low-pass / high cut: {(lowPassHz ?? currentPreset.lowPassHz ?? 20000) >= 20000 ? "Off" : `${Math.round(lowPassHz ?? currentPreset.lowPassHz ?? 20000)} Hz`}<input className="mt-2 block w-full" type="range" min="1000" max="20000" step="100" value={lowPassHz ?? currentPreset.lowPassHz ?? 20000} disabled={recording || finalizing} aria-label="Low-pass high-cut frequency" onChange={(event) => setLowPassHz(Number(event.target.value))}/><span className="mt-1 block text-xs text-muted-foreground">Lower it to darken the vocal; 20 kHz bypasses the manual high cut.</span></label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Preset filters stay in control until you move these sliders. Reset returns both cutoffs to the selected preset's defaults.</p>
          </div>
          <div className="mt-5 rounded-xl border border-border bg-surface-2/30 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-semibold">10-band graphic EQ</h4><p className="mt-1 text-xs text-muted-foreground">Move each band between −9 and +9 dB. Cutting problematic frequencies often preserves more headroom than boosting.</p></div><button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs hover:bg-surface-2" disabled={recording} onClick={() => { setEqBandsDb([...EQ_PROFILES.flat.bandsDb]); setEqProfile("flat"); }}><RotateCcw size={13}/> Reset EQ</button></div>
            <div className="mt-3 flex flex-wrap gap-2">{(Object.keys(EQ_PROFILES) as EqProfileId[]).map((profileId) => <button key={profileId} type="button" disabled={recording} aria-pressed={eqProfile === profileId} onClick={() => { setEqProfile(profileId); setEqBandsDb([...EQ_PROFILES[profileId].bandsDb]); }} className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs ${eqProfile === profileId ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-surface-2"}`}>{EQ_PROFILES[profileId].label}</button>)}</div>
            <svg viewBox="0 0 600 176" role="group" aria-label="Interactive ten-band equalizer. Tap or click near a frequency point, then drag vertically to change its gain; sliders below provide an alternative." onPointerDown={startEqGraphDrag} onPointerMove={(event) => { if (eqGraphDragBandRef.current !== null) updateEqFromGraphPointer(event); }} onPointerUp={endEqGraphDrag} onPointerCancel={endEqGraphDrag} style={{ touchAction: "none", cursor: recording || finalizing ? "default" : "ns-resize" }} className="mt-3 block h-auto w-full overflow-visible text-primary">
              {[-9, -6, -3, 0, 3, 6, 9].map((gain) => { const y = eqGraphY(gain); return <g key={gain}><line x1="22" x2="578" y1={y} y2={y} stroke="currentColor" opacity={gain === 0 ? 0.35 : 0.12} strokeDasharray={gain === 0 ? "0" : "3 5"}/><text x="4" y={y + 4} fontSize="10" fill="currentColor" opacity="0.65">{gain}</text></g>; })}
              {EQ_BAND_FREQUENCIES.map((frequency) => { const x = eqGraphX(frequency); return <line key={frequency} x1={x} x2={x} y1="18" y2="142" stroke="currentColor" opacity="0.08"/>; })}
              <polyline points={eqChartPoints} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              {EQ_BAND_FREQUENCIES.map((frequency, index) => { const x = eqGraphX(frequency); const y = eqGraphY(eqBandsDb[index] ?? 0); return <g key={frequency}><circle cx={x} cy={y} r="5" fill="currentColor"/><text x={x} y="162" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.75">{formatFrequency(frequency)}</text></g>; })}
            </svg>
            <p className="mt-1 text-xs text-muted-foreground">Drag a point up/down to edit that band on desktop or touch; select a preset or use the individual sliders for precise values. The curve is a control response, not a live spectrum analyzer.</p>
            <div className="mt-2 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-5">{EQ_BAND_FREQUENCIES.map((frequency, index) => <label key={frequency} className="min-w-0 rounded-lg border border-border bg-background p-2 text-xs"><span className="flex items-center justify-between gap-1"><strong>{formatFrequency(frequency)} Hz</strong><span className="tabular-nums">{(eqBandsDb[index] ?? 0) > 0 ? "+" : ""}{(eqBandsDb[index] ?? 0).toFixed(1)} dB</span></span><input className="mt-2 block w-full" type="range" min="-9" max="9" step="0.5" disabled={recording || finalizing} value={eqBandsDb[index] ?? 0} aria-label={`${frequency} hertz EQ gain`} onChange={(event) => { const value = Number(event.target.value); setEqBandsDb((current) => current.map((gain, bandIndex) => bandIndex === index ? value : gain)); setEqProfile("custom"); }}/></label>)}</div>
            <p className="mt-2 text-xs text-muted-foreground">EQ profile: {eqProfile === "custom" ? "Custom" : EQ_PROFILES[eqProfile].label}. EQ changes apply to the next take; controls are locked during recording.</p>
          </div>
          <div className="mt-4 rounded-xl border border-border p-3 sm:p-4">
            <div className="flex items-start gap-2"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><AudioLines size={18} aria-hidden="true"/></div><div><h4 className="font-semibold">Preamp / amplifier colour</h4><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Choose clean, warm tube, crunch or fuzz coloration, then tune drive and a three-control tone stack. This is creative preamp saturation, not a physical amp or speaker-cabinet simulation.</p></div></div>
            <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">{AMP_CHARACTERS.map((amp) => <button key={amp.id} type="button" disabled={recording} aria-pressed={ampCharacter === amp.id} onClick={() => setAmpCharacter(amp.id)} className={`min-h-[76px] min-w-0 rounded-lg border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${ampCharacter === amp.id ? "border-primary bg-primary/10" : "border-border hover:bg-surface-2"}`}><strong className="block text-xs sm:text-sm">{amp.label}</strong><span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{amp.description}</span></button>)}</div>
            <label className="mt-4 block text-sm">Drive / saturation: {ampDrive}%<input className="mt-2 block w-full" type="range" min="0" max="100" step="1" value={ampDrive} disabled={recording || ampCharacter === "clean"} aria-label="Amplifier drive amount" onChange={(event) => setAmpDrive(Number(event.target.value))}/><span className="mt-1 block text-xs text-muted-foreground">Higher drive adds harmonics and can sound rougher. Begin low and judge the recorded result.</span></label>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="min-w-0 text-sm">Bass tone: {ampBassDb > 0 ? "+" : ""}{ampBassDb.toFixed(1)} dB<input className="mt-2 block w-full" type="range" min="-6" max="6" step="0.5" value={ampBassDb} disabled={recording} aria-label="Amplifier bass tone" onChange={(event) => setAmpBassDb(Number(event.target.value))}/><span className="mt-1 block text-xs text-muted-foreground">Low body</span></label>
              <label className="min-w-0 text-sm">Mid tone: {ampMidDb > 0 ? "+" : ""}{ampMidDb.toFixed(1)} dB<input className="mt-2 block w-full" type="range" min="-6" max="6" step="0.5" value={ampMidDb} disabled={recording} aria-label="Amplifier mid tone" onChange={(event) => setAmpMidDb(Number(event.target.value))}/><span className="mt-1 block text-xs text-muted-foreground">Voice body / bite</span></label>
              <label className="min-w-0 text-sm">Treble tone: {ampTrebleDb > 0 ? "+" : ""}{ampTrebleDb.toFixed(1)} dB<input className="mt-2 block w-full" type="range" min="-6" max="6" step="0.5" value={ampTrebleDb} disabled={recording} aria-label="Amplifier treble tone" onChange={(event) => setAmpTrebleDb(Number(event.target.value))}/><span className="mt-1 block text-xs text-muted-foreground">Top-end detail</span></label>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 p-2.5 text-xs"><span>Selected: <strong>{AMP_CHARACTERS.find((amp) => amp.id === ampCharacter)?.label}</strong></span><span>Drive {ampCharacter === "clean" ? "bypassed" : `${ampDrive}%`} · Tone stack active</span></div>
          </div>
          <div className="mt-4 rounded-xl border border-border p-3 sm:p-4">
            <div className="flex items-center gap-2"><AudioLines size={17} className="text-primary"/><h4 className="font-semibold">Dynamics & output controls</h4></div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2"> 
              <label className="text-sm">Compressor threshold: {compressorThresholdDb} dB<input className="mt-2 block w-full" type="range" min="-36" max="-8" step="1" value={compressorThresholdDb} disabled={recording} onChange={(event) => setCompressorThresholdDb(Number(event.target.value))}/><span className="mt-1 block text-xs text-muted-foreground">Lower thresholds compress more of the vocal.</span></label>
              <label className="text-sm">Compression ratio: {compressorRatio.toFixed(1)}:1<input className="mt-2 block w-full" type="range" min="1" max="8" step="0.5" value={compressorRatio} disabled={recording} onChange={(event) => setCompressorRatio(Number(event.target.value))}/><span className="mt-1 block text-xs text-muted-foreground">Higher ratios reduce peaks more strongly.</span></label>
              <label className="text-sm">Output trim: {outputGainDb > 0 ? "+" : ""}{outputGainDb} dB<input className="mt-2 block w-full" type="range" min="-12" max="6" step="1" value={outputGainDb} disabled={recording} onChange={(event) => setOutputGainDb(Number(event.target.value))}/><span className="mt-1 block text-xs text-muted-foreground">Trim level after EQ and compression.</span></label>
              <label className="text-sm">Reverb / ambience: {reverbAmount}%<input className="mt-2 block w-full" type="range" min="0" max="150" step="5" value={reverbAmount} disabled={recording} onChange={(event) => setReverbAmount(Number(event.target.value))}/></label>
              <label className="text-sm sm:col-span-2">Delay / echo send: {delayAmount}%<input className="mt-2 block w-full" type="range" min="0" max="150" step="5" value={delayAmount} disabled={recording} onChange={(event) => setDelayAmount(Number(event.target.value))}/></label>
            </div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" checked={monitorMic} disabled={recording} onChange={(event) => setMonitorMic(event.target.checked)} className="mt-1"/><span>Monitor processed mic live<span className="mt-1 block text-xs text-muted-foreground">Use headphones to reduce feedback risk.</span></span></label><button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-surface-2" disabled={recording || finalizing} onClick={resetSound}><RotateCcw size={13}/> Reset all sound controls</button></div>
          </div>
          <details className="mt-4 rounded-xl border border-border p-3 sm:p-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold"><span className="inline-flex items-center gap-2"><FolderOpen size={17} aria-hidden="true"/> My saved sound setups</span><span className="text-xs font-normal text-muted-foreground">{savedSetups.length}/30 · this device</span></summary>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Save and restore vocal effect settings locally. These profiles contain control values only—not recordings, source files or microphone data—and do not sync between devices.</p>
            <label className="mt-3 block text-sm">Setup name<input className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3" type="text" maxLength={48} value={savedSetupName} onChange={(event) => setSavedSetupName(event.target.value)} placeholder="e.g. Warm close vocal" disabled={recording || finalizing} /></label>
            <button type="button" className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2 sm:w-auto" onClick={saveCurrentVocalSetup} disabled={recording || finalizing}><Save size={15} aria-hidden="true"/> Save current sound setup</button>
            <input ref={presetImportRef} className="sr-only" type="file" accept="application/json,.json,.env-audio-preset.json" aria-label="Import enV sound preset file" onChange={(event) => { void importPortableSetup(event.currentTarget.files?.[0]); }} />
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2" onClick={() => presetImportRef.current?.click()} disabled={recording || finalizing}><FolderOpen size={15} aria-hidden="true"/> Import preset file</button>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2" onClick={exportPortableSetup} disabled={!selectedSavedSetupId || recording || finalizing}><Download size={15} aria-hidden="true"/> Export selected preset</button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Versioned JSON preset files can be moved or backed up manually. Imports are size-limited and numeric controls are validated; only settings are exported.</p>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="min-w-0 text-sm">Saved setup<select className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3" value={selectedSavedSetupId} onChange={(event) => { setSelectedSavedSetupId(event.target.value); const item = savedSetups.find((setup) => setup.id === event.target.value); if (item) setSavedSetupName(item.name); }} disabled={savedSetups.length === 0 || recording || finalizing}><option value="">Choose a saved setup…</option>{savedSetups.map((setup) => <option key={setup.id} value={setup.id}>{setup.name}</option>)}</select></label>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2" disabled={!selectedSavedSetupId || recording || finalizing} onClick={loadSavedVocalSetup}><FolderOpen size={15} aria-hidden="true"/> Load</button>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2" disabled={!selectedSavedSetupId || recording || finalizing} onClick={deleteSelectedVocalSetup}><Trash2 size={15} aria-hidden="true"/> Delete</button>
            </div>
            {savedSetups.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No custom setups yet. Tune your sound, enter a name, and save.</p> : null}
          </details>
          {!currentPreset.available ? <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">Pitch correction is not applied by this build. A key-aware real-time pitch processor is required; fixed pitch shifting is not the same as AutoPitch. The recording will use the Clean Studio chain instead.</p> : null}
        </div>
      </div>
    </div>
    <ErrorBanner message={error}/>
    {status ? <p role="status" aria-live="polite" className="rounded-lg bg-surface-2 p-3 text-sm text-muted-foreground">{status}</p> : null}
    <p className="text-xs text-muted-foreground">Format is selected from browser MediaRecorder capabilities (MP4 where supported; otherwise WebM). Results should be reviewed on the target device. Camera/microphone capture in a web browser requires HTTPS/localhost; mobile native apps provide their own native capture routes. Monitoring latency varies by device, driver, Bluetooth route and browser; use wired headphones for timing-sensitive takes. The start-cue and single-clock mix are designed to reduce setup mistakes, but real-device sync tests are still needed.</p>
  </section>;
}
