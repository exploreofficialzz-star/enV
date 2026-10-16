import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadBlob } from "@/lib/utils";
import { estimateTappedBpm, metronomeBeatDurationSeconds, metronomeTotalBeats, type MetronomeDenominator } from "@/lib/engines/audio-extra-utils";
import { deleteAudioSession, loadAudioSessionFile } from "@/lib/engines/audio-session-storage";

function audioContextCtor() { return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; }
function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels)), frames = buffer.length, rate = buffer.sampleRate;
  const bytes = 44 + frames * channels * 2, array = new ArrayBuffer(bytes), view = new DataView(array);
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, "RIFF"); view.setUint32(4, bytes - 8, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, bytes - 44, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) { const sample = Math.max(-1, Math.min(1, buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1))[i])); view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true); offset += 2; }
  return new Blob([array], { type: "audio/wav" });
}

export function AudioExtraTool({ mode }: { mode: string }) {
  const isRecorder = mode === "audio-recorder";
  const isMetronome = mode === "audio-metronome";
  const isJoiner = mode === "audio-joiner-local";
  const [joinFiles, setJoinFiles] = useState<File[]>([]);
  const didChooseJoinFilesRef = useRef(false);
  const restoredJoinSessionRef = useRef(false);
  const [sourceSessionId, setSourceSessionId] = useState<string | null>(null);
  const [shape, setShape] = useState("sine");
  const [frequency, setFrequency] = useState("440");
  const [duration, setDuration] = useState("5");
  const [bpm, setBpm] = useState("120");
  const [beats, setBeats] = useState("4");
  const [denominator, setDenominator] = useState<MetronomeDenominator>(4);
  const [exportBars, setExportBars] = useState("4");
  const [liveMetronome, setLiveMetronome] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const frameRef = useRef<number | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const metronomeContextRef = useRef<AudioContext | null>(null);
  const metronomeTimerRef = useRef<number | null>(null);
  const metronomeNextTimeRef = useRef(0);
  const metronomeBeatRef = useRef(0);
  const tapTimesRef = useRef<number[]>([]);

  function stopLiveMetronome(updateState = true) {
    if (metronomeTimerRef.current !== null) window.clearInterval(metronomeTimerRef.current);
    metronomeTimerRef.current = null;
    const context = metronomeContextRef.current;
    metronomeContextRef.current = null;
    if (context) void context.close().catch(() => undefined);
    if (updateState) setLiveMetronome(false);
  }

  useEffect(() => {
    if (!isJoiner) return;
    const sessionId = new URLSearchParams(window.location.search).get("audioSessionId");
    if (!sessionId) return;
    setSourceSessionId(sessionId);
    let active = true;
    void loadAudioSessionFile(sessionId).then((restored) => {
      if (!active || didChooseJoinFilesRef.current) return;
      if (!restored) {
        setSourceSessionId(null);
        setStatus("The Audio Studio source is unavailable or expired. Import your files again to continue.");
        return;
      }
      restoredJoinSessionRef.current = true;
      setJoinFiles([restored]);
      setStatus(`Restored ${restored.name} from local browser storage. Add at least one more file in the order you want them joined; nothing was uploaded.`);
    }).catch(() => {
      if (active) setStatus("Could not restore the Audio Studio source. Import your files again to continue.");
    });
    return () => { active = false; };
  }, [isJoiner]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void contextRef.current?.close().catch(() => undefined);
    if (metronomeTimerRef.current !== null) window.clearInterval(metronomeTimerRef.current);
    void metronomeContextRef.current?.close().catch(() => undefined);
  }, []);

  async function toggleLiveMetronome() {
    if (metronomeContextRef.current) { stopLiveMetronome(); setStatus("Live metronome stopped."); return; }
    try {
      const rate = Number(bpm), beatCount = Number(beats);
      const beatInterval = metronomeBeatDurationSeconds(rate, denominator);
      metronomeTotalBeats(beatCount, Number(exportBars));
      const Ctx = audioContextCtor(); if (!Ctx) throw new Error("Web Audio is unavailable in this browser.");
      const context = new Ctx(); await context.resume();
      metronomeContextRef.current = context;
      metronomeNextTimeRef.current = context.currentTime + 0.05;
      metronomeBeatRef.current = 0;
      const schedule = () => {
        if (context.state !== "running") return;
        while (metronomeNextTimeRef.current < context.currentTime + 0.12) {
          const at = metronomeNextTimeRef.current;
          const accented = metronomeBeatRef.current % beatCount === 0;
          const oscillator = context.createOscillator(), gain = context.createGain();
          oscillator.type = "sine"; oscillator.frequency.setValueAtTime(accented ? 1500 : 950, at);
          gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(accented ? 0.18 : 0.1, at + 0.003); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
          oscillator.connect(gain).connect(context.destination); oscillator.start(at); oscillator.stop(at + 0.04);
          metronomeBeatRef.current = (metronomeBeatRef.current + 1) % beatCount;
          metronomeNextTimeRef.current += beatInterval;
        }
      };
      schedule(); metronomeTimerRef.current = window.setInterval(schedule, 25);
      setLiveMetronome(true); setStatus(`Live metronome running at ${rate} BPM in ${beatCount}/${denominator}; first beat accented. Stop and restart to apply timing changes.`);
    } catch (cause) { stopLiveMetronome(); setError(cause instanceof Error ? cause.message : "Could not start the live metronome."); }
  }

  function tapTempo() {
    const now = performance.now();
    const prior = tapTimesRef.current;
    const taps = prior.length && now - prior[prior.length - 1] > 2000 ? [now] : [...prior, now].slice(-8);
    tapTimesRef.current = taps;
    setTapCount(taps.length);
    const tapped = estimateTappedBpm(taps, denominator);
    if (tapped !== null) { setBpm(String(tapped)); setStatus(`Tap tempo estimate: ${tapped} BPM. Verify by ear, then restart the live metronome if it is running.`); }
    else setStatus(`Tap ${Math.max(0, 3 - taps.length)} more time(s) at a steady pace to estimate BPM.`);
  }

  async function generate() {
    try {
      setError(null); setStatus("");
      const rate = Number(bpm), beatCount = Number(beats), seconds = Number(duration), hz = Number(frequency);
      if (isJoiner) {
        if (joinFiles.length < 2) throw new Error("Choose at least two local audio files in the order you want them joined.");
        if (joinFiles.some((file) => file.size > 250 * 1024 * 1024)) throw new Error("Each file must be under 250 MB for local decoding.");
        if (joinFiles.reduce((sum, file) => sum + file.size, 0) > 400 * 1024 * 1024) throw new Error("The selected files exceed 400 MB total. Join smaller groups to reduce browser memory pressure.");
        const Ctx = audioContextCtor(); if (!Ctx) throw new Error("Web Audio is unavailable in this browser.");
        const context = new Ctx();
        try {
          const decoded = await Promise.all(joinFiles.map(async (file) => context.decodeAudioData(await file.arrayBuffer())));
          const secondsTotal = decoded.reduce((sum, buffer) => sum + buffer.duration, 0);
          if (secondsTotal > 600) throw new Error("The local joiner is limited to 10 minutes total to avoid excessive memory use. Join shorter groups first.");
          const sampleRate = 44100, totalFrames = Math.ceil(secondsTotal * sampleRate);
          const offline = new OfflineAudioContext(2, totalFrames, sampleRate);
          let cursor = 0;
          for (const buffer of decoded) {
            const source = offline.createBufferSource(); source.buffer = buffer; source.connect(offline.destination); source.start(cursor); cursor += buffer.duration;
          }
          const joined = await offline.startRendering();
          downloadBlob(encodeWav(joined), `env-joined-audio-${joinFiles.length}-files.wav`);
          setStatus(`Joined ${joinFiles.length} local files in selection order (${secondsTotal.toFixed(2)} seconds) and exported 16-bit PCM WAV. No file was uploaded.`);
        } finally { await context.close().catch(() => undefined); }
        return;
      }
      if (isMetronome) {
        const denominatorValue = denominator;
        const bars = Number(exportBars);
        const totalBeats = metronomeTotalBeats(beatCount, bars);
        const interval = metronomeBeatDurationSeconds(rate, denominatorValue);
        const sampleRate = 44100, totalFrames = Math.ceil(interval * totalBeats * sampleRate), Ctx = audioContextCtor();
        if (!Ctx) throw new Error("Web Audio is unavailable in this browser.");
        const context = new Ctx();
        try {
          const buffer = context.createBuffer(1, totalFrames, sampleRate), data = buffer.getChannelData(0), beatFrames = Math.round(sampleRate * interval), clickLength = Math.round(sampleRate * 0.035);
          for (let beat = 0; beat < totalBeats; beat++) {
            const start = beat * beatFrames, accented = beat % beatCount === 0;
            for (let i = 0; i < clickLength && start + i < data.length; i++) data[start + i] = Math.sin(2 * Math.PI * (accented ? 1500 : 950) * i / sampleRate) * Math.exp(-i / (sampleRate * 0.008)) * (accented ? 0.75 : 0.45);
          }
          downloadBlob(encodeWav(buffer), `env-metronome-${rate}bpm-${beatCount}-${denominatorValue}-${bars}bars.wav`);
          setStatus(`Exported ${bars} bars of ${beatCount}/${denominatorValue} at ${rate} BPM (${totalBeats} clicks).`);
        } finally { await context.close().catch(() => undefined); }
        return;
      }
      if (!Number.isFinite(seconds) || seconds < 0.1 || seconds > 60) throw new Error("Duration must be between 0.1 and 60 seconds.");
      if (!Number.isFinite(hz) || hz < 20 || hz > 20000) throw new Error("Frequency must be 20–20,000 Hz.");
      const Ctx = audioContextCtor(); if (!Ctx) throw new Error("Web Audio is unavailable in this browser.");
      const sampleRate = 44100, context = new Ctx(), buffer = context.createBuffer(1, Math.ceil(seconds * sampleRate), sampleRate), data = buffer.getChannelData(0);
      const fadeFrames = Math.max(1, Math.round(sampleRate * 0.01));
      for (let i = 0; i < data.length; i++) {
        const phase = 2 * Math.PI * hz * i / sampleRate;
        const sample = shape === "square" ? (Math.sin(phase) >= 0 ? 0.6 : -0.6) : shape === "sawtooth" ? ((2 * ((hz * i / sampleRate) % 1) - 1) * 0.6) : shape === "noise" ? ((Math.random() * 2 - 1) * 0.4) : Math.sin(phase) * 0.6;
        const envelope = Math.min(1, i / fadeFrames, (data.length - 1 - i) / fadeFrames);
        data[i] = sample * Math.max(0, envelope);
      }
      downloadBlob(encodeWav(buffer), `env-${shape}-${hz}hz-${seconds}s.wav`);
      setStatus(`Generated and downloaded ${seconds}s of ${shape} audio at ${hz} Hz.`);
      await context.close().catch(() => undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate audio."); }
  }

  async function forgetStoredJoinHandoff() {
    if (!sourceSessionId) return;
    try {
      await deleteAudioSession(sourceSessionId);
      setSourceSessionId(null);
      const current = new URL(window.location.href);
      current.searchParams.delete("audioSessionId");
      window.history.replaceState(null, "", `${current.pathname}${current.search}${current.hash}`);
      setStatus("Stored handoff removed. Any already-restored file remains selected in this tool's memory.");
    } catch (cause) {
      setStatus(cause instanceof Error ? `Could not remove the stored handoff: ${cause.message}` : "Could not remove the stored handoff.");
    }
  }

  function moveJoinFile(index: number, direction: -1 | 1) {
    setJoinFiles((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }

  async function startRecording() {
    try {
      setError(null); setStatus("");
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("This browser does not support microphone recording. Try a recent desktop or mobile browser over HTTPS.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream; chunksRef.current = [];
      const recorder = new MediaRecorder(stream); recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => setError("Microphone recording failed. Check permission and available storage.");
      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const Ctx = audioContextCtor(); if (!Ctx) throw new Error("Web Audio is unavailable to convert the recording to WAV.");
          const context = new Ctx();
          try { const buffer = await context.decodeAudioData(await blob.arrayBuffer()); downloadBlob(encodeWav(buffer), `env-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`); setStatus(`Recorded ${(buffer.duration).toFixed(2)} seconds and exported local 16-bit PCM WAV.`); }
          finally { await context.close().catch(() => undefined); }
        } catch (cause) { setError(cause instanceof Error ? `Recording captured but this browser could not decode it into WAV: ${cause.message}` : "Could not export the recording."); }
        stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; setRecording(false); setLevel(0);
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        void contextRef.current?.close().catch(() => undefined); contextRef.current = null;
      };
      const Ctx = audioContextCtor(); if (!Ctx) throw new Error("Web Audio is unavailable for the microphone meter.");
      const context = new Ctx(), source = context.createMediaStreamSource(stream), analyser = context.createAnalyser(); analyser.fftSize = 1024; source.connect(analyser); contextRef.current = context; analyserRef.current = analyser;
      const samples = new Uint8Array(analyser.fftSize);
      const measure = () => { analyser.getByteTimeDomainData(samples); let peak = 0; for (const item of samples) peak = Math.max(peak, Math.abs(item - 128) / 128); setLevel(peak); frameRef.current = requestAnimationFrame(measure); };
      measure(); recorder.start(250); setRecording(true); setStatus("Recording on this device. Stop the recording to export WAV.");
    } catch (cause) { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setError(cause instanceof Error ? cause.message : "Could not start microphone recording."); setRecording(false); }
  }

  return <section className="max-w-3xl space-y-5">
    <div><h2 className="text-xl font-semibold">{isJoiner ? "Local Audio Joiner" : isRecorder ? "Audio Recorder" : isMetronome ? "Audio Metronome" : "Audio Tone Generator"}</h2><p className="mt-1 text-sm text-muted-foreground">{isJoiner ? "Join multiple files in selection order in this browser; no server or account is involved." : isRecorder ? "Record from your microphone and export a WAV locally. Microphone permission is requested only when you press Record." : isMetronome ? "Build a reusable click track and export it as WAV." : "Generate test tones or noise locally without sending audio to a server."}</p></div>
    {isJoiner ? <div className="space-y-3 rounded-xl border border-border p-4">{status ? <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground" role="status">{status}</p> : null}{sourceSessionId ? <Button size="sm" variant="outline" type="button" onClick={() => void forgetStoredJoinHandoff()}>Forget saved local handoff</Button> : null}<label className="block text-sm font-medium">Audio files (select in join order)<input type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" multiple onChange={(event) => { const selected = Array.from(event.target.files ?? []); if (selected.length) { didChooseJoinFilesRef.current = true; setJoinFiles((current) => restoredJoinSessionRef.current ? [...current, ...selected] : selected); setStatus(restoredJoinSessionRef.current ? "Added files after the restored source. Review order and remove any duplicates before joining." : "Using the files selected in this tool; none were uploaded."); } event.currentTarget.value = ""; }} className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2" /></label><p className="text-xs text-muted-foreground">{joinFiles.length ? `${joinFiles.length} files selected in this order; move files below to change the sequence (${(joinFiles.reduce((sum, file) => sum + file.size, 0) / 1_000_000).toFixed(1)} MB total).` : "Choose at least 2 files. Supported formats depend on this browser's audio decoder."} Output is stereo 44.1 kHz 16-bit WAV. Limits: 400 MB aggregate source size and 10 minutes decoded duration.</p>{joinFiles.length ? <ol className="space-y-2">{joinFiles.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm"><span className="w-6 text-muted-foreground">{index + 1}.</span><span className="min-w-0 flex-1 break-all">{file.name}</span><Button size="sm" variant="outline" type="button" disabled={index === 0} onClick={() => moveJoinFile(index, -1)} aria-label={`Move ${file.name} up`}>↑</Button><Button size="sm" variant="outline" type="button" disabled={index === joinFiles.length - 1} onClick={() => moveJoinFile(index, 1)} aria-label={`Move ${file.name} down`}>↓</Button><Button size="sm" variant="ghost" type="button" onClick={() => setJoinFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}>Remove</Button></li>)}</ol> : null}<Button type="button" disabled={joinFiles.length < 2} onClick={() => void generate()}>Join locally & download WAV</Button></div> : isRecorder ? <div className="space-y-4 rounded-xl border border-border p-4"><p className="text-sm">Microphone signal</p><div className="h-3 overflow-hidden rounded-full bg-surface-2"><div className={`h-full ${level > 0.92 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${Math.min(100, level * 100)}%` }} /></div><p className="text-xs text-muted-foreground">Peak {Math.round(level * 100)}%{level > 0.92 ? " — clipping risk" : ""}. Browser microphone capture requires permission and usually HTTPS.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={recording} onClick={() => void startRecording()}>Record</Button><Button type="button" variant="outline" disabled={!recording} onClick={() => recorderRef.current?.stop()}>Stop & export WAV</Button></div></div> : <div className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
      {isMetronome ? <><label className="text-sm">BPM<input type="number" min="30" max="300" value={bpm} onChange={(event) => setBpm(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2" /></label><label className="text-sm">Time signature numerator<input type="number" min="1" max="12" value={beats} onChange={(event) => setBeats(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2" /></label><label className="text-sm">Time signature denominator<select value={denominator} onChange={(event) => setDenominator(Number(event.target.value) as MetronomeDenominator)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2"><option value={2}>2 (half note)</option><option value={4}>4 (quarter note)</option><option value={8}>8 (eighth note)</option></select></label><label className="text-sm">Bars to export<input type="number" min="1" max="128" value={exportBars} onChange={(event) => setExportBars(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2" /></label><div className="sm:col-span-2 flex flex-wrap gap-2"><Button type="button" onClick={() => void toggleLiveMetronome()}>{liveMetronome ? "Stop live metronome" : "Start live metronome"}</Button><Button type="button" variant="outline" onClick={tapTempo}>Tap tempo{tapCount ? ` · ${tapCount} taps` : ""}</Button><Button type="button" variant="outline" onClick={() => { tapTimesRef.current = []; setTapCount(0); setStatus("Tap-tempo history cleared."); }}>Reset taps</Button></div><p className="sm:col-span-2 text-xs text-muted-foreground">BPM is quarter-note equivalent; click spacing scales with the selected denominator, and the first beat of each bar is accented. Tap steadily at least 3 times to estimate tempo.</p></> : <><label className="text-sm">Waveform<select value={shape} onChange={(event) => setShape(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2"><option value="sine">Sine</option><option value="square">Square</option><option value="sawtooth">Sawtooth</option><option value="noise">White-noise approximation</option></select></label><label className="text-sm">Frequency (Hz)<input type="number" min="20" max="20000" value={frequency} onChange={(event) => setFrequency(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2" /></label><label className="text-sm">Duration (seconds)<input type="number" min="0.1" max="60" step="0.1" value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2" /></label></>}
      <div className="sm:col-span-2"><Button type="button" onClick={() => void generate()}>{isMetronome ? "Export click track WAV" : "Generate tone & download WAV"}</Button></div>
    </div>}
    <ErrorBanner message={error} />{status ? <p className="rounded-lg bg-surface-2 p-3 text-sm" role="status" aria-live="polite">{status}</p> : null}
  </section>;
}
