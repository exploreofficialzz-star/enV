import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleDot, Download, ExternalLink, Link2, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AUDIO_BITS_PER_SECOND,
  autoStopReason,
  buildRecordingFileName,
  containerMimeType,
  describeCaptureError,
  detectCaptureSupport,
  EMBED_ALLOW,
  EMBED_SANDBOX,
  estimateRecordingBytes,
  formatBytes,
  formatDuration,
  MAX_RECORDING_SECONDS,
  parseVideoLink,
  pickRecorderMimeType,
  popupWindowFeatures,
  QUALITY_PRESETS,
  type QualityPresetId,
  type VideoLinkSource,
} from "@/lib/media/video-link-recording";

type Phase = "idle" | "countdown" | "recording" | "paused" | "finishing" | "done";

type Recording = {
  url: string;
  blob: Blob;
  fileName: string;
  mime: string;
  seconds: number;
};

const COUNTDOWN_SECONDS = 3;

function downloadRecording(recording: Recording) {
  const anchor = document.createElement("a");
  anchor.href = recording.url;
  anchor.download = recording.fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // The track may already have ended.
    }
  });
}

/**
 * Video Link Screen Recording (web).
 *
 * The person pastes a video link, views it either in an official embedded player or on the original
 * platform in a separate window, and records the screen, window or tab that shows it with the
 * browser's own screen-capture permission. Recording, preview and saving all happen in this browser;
 * nothing is uploaded and no enV server is involved.
 */
export function VideoLinkRecorderEngine() {
  const [input, setInput] = useState("");
  const [source, setSource] = useState<VideoLinkSource | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [quality, setQuality] = useState<QualityPresetId>("high");
  const [captureAudio, setCaptureAudio] = useState(true);
  const [useMicrophone, setUseMicrophone] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [elapsed, setElapsed] = useState(0);
  const [recordedBytes, setRecordedBytes] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const support = useMemo(
    () => (typeof window === "undefined" ? { screenCapture: false, mediaRecorder: false } : detectCaptureSupport({ mediaDevices: navigator.mediaDevices, MediaRecorder: window.MediaRecorder })),
    [],
  );

  const recorderRef = useRef<MediaRecorder | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bytesRef = useRef(0);
  const mimeRef = useRef("video/webm");
  const startedAtRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pauseStartedRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const sourceRef = useRef<VideoLinkSource | null>(null);
  const recordingUrlRef = useRef<string | null>(null);

  const updatePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
    timerRef.current = null;
    countdownRef.current = null;
  }, []);

  const releaseCapture = useCallback(() => {
    stopTracks(displayStreamRef.current);
    stopTracks(micStreamRef.current);
    displayStreamRef.current = null;
    micStreamRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }, []);

  const discardRecording = useCallback(() => {
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = null;
    setRecording(null);
  }, []);

  // Stop everything when the tool is closed so the browser's "sharing your screen" indicator never lingers.
  useEffect(() => {
    return () => {
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          // Already stopped.
        }
      }
      releaseCapture();
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    };
  }, [clearTimers, releaseCapture]);

  const loadLink = useCallback(() => {
    setError("");
    setNotice("");
    const result = parseVideoLink(input, { parentHost: window.location.hostname });
    if (!result.ok) {
      setSource(null);
      setError(result.reason);
      return;
    }
    setSource(result);
    setInput(result.url);
  }, [input]);

  const openOriginal = useCallback(() => {
    if (!source) return;
    // noopener means window.open returns null even on success, so a visible fallback link is always shown too.
    window.open(source.url, "enV-video-link-view", popupWindowFeatures());
  }, [source]);

  const finalize = useCallback(() => {
    clearTimers();
    releaseCapture();
    const chunks = chunksRef.current;
    chunksRef.current = [];
    const mime = mimeRef.current;
    const seconds = Math.max(0, (Date.now() - startedAtRef.current - pausedMsRef.current) / 1000);
    recorderRef.current = null;
    if (!chunks.length || bytesRef.current === 0) {
      updatePhase("idle");
      setError("Nothing was recorded. Start again and keep the shared window visible while the video plays.");
      return;
    }
    const blob = new Blob(chunks, { type: containerMimeType(mime) });
    const url = URL.createObjectURL(blob);
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = url;
    setRecording({
      url,
      blob,
      mime,
      seconds,
      fileName: buildRecordingFileName(sourceRef.current?.host ?? "video", mime),
    });
    updatePhase("done");
  }, [clearTimers, releaseCapture, updatePhase]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      finalize();
      return;
    }
    if (phaseRef.current === "paused" && pauseStartedRef.current) {
      pausedMsRef.current += Date.now() - pauseStartedRef.current;
      pauseStartedRef.current = 0;
    }
    updatePhase("finishing");
    try {
      recorder.stop();
    } catch {
      finalize();
    }
  }, [finalize, updatePhase]);

  const cancelCountdown = useCallback(() => {
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    releaseCapture();
    updatePhase("idle");
  }, [clearTimers, releaseCapture, updatePhase]);

  const beginRecording = useCallback(async () => {
    setError("");
    setNotice("");
    discardRecording();
    if (!source) return;
    if (!support.screenCapture || !support.mediaRecorder) {
      setError("This browser cannot record the screen. Use a current desktop browser such as Chrome, Edge or Firefox, or the enV Android or iOS app.");
      return;
    }
    const preset = QUALITY_PRESETS[quality];
    const mime = pickRecorderMimeType((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mime) {
      setError("This browser has no supported video recording format.");
      return;
    }

    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: preset.frameRate, max: preset.frameRate }, width: { ideal: preset.width }, height: { ideal: preset.height } },
        audio: captureAudio,
      });
    } catch (cause) {
      setError(describeCaptureError(cause));
      return;
    }
    displayStreamRef.current = display;

    // Optional narration is mixed with the shared tab audio into one audio track.
    let mixed: MediaStream = display;
    let withAudio = display.getAudioTracks().length > 0;
    if (useMicrophone) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        micStreamRef.current = mic;
        const context = new AudioContext();
        audioContextRef.current = context;
        const destination = context.createMediaStreamDestination();
        context.createMediaStreamSource(mic).connect(destination);
        if (display.getAudioTracks().length) context.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(destination);
        mixed = new MediaStream([...display.getVideoTracks(), ...destination.stream.getAudioTracks()]);
        withAudio = true;
      } catch (cause) {
        setNotice(`Microphone unavailable, recording without narration. ${describeCaptureError(cause)}`);
      }
    }
    if (captureAudio && !display.getAudioTracks().length && !withAudio) {
      setNotice("The browser did not share any audio. Choose a browser tab and tick “Share tab audio” to include the video's sound.");
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(mixed, {
        mimeType: mime,
        videoBitsPerSecond: preset.videoBitsPerSecond,
        ...(withAudio ? { audioBitsPerSecond: AUDIO_BITS_PER_SECOND } : {}),
      });
    } catch (cause) {
      releaseCapture();
      setError(describeCaptureError(cause));
      return;
    }
    chunksRef.current = [];
    bytesRef.current = 0;
    mimeRef.current = recorder.mimeType || mime;
    recorderRef.current = recorder;
    setRecordedBytes(0);
    setElapsed(0);

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
        bytesRef.current += event.data.size;
        setRecordedBytes(bytesRef.current);
      }
    };
    recorder.onstop = () => finalize();
    recorder.onerror = () => {
      setError("The recording stopped because of a browser error. Anything captured so far has been kept.");
      stopRecording();
    };
    // "Stop sharing" in the browser's own bar ends the video track; treat it as Stop.
    display.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (phaseRef.current === "countdown") cancelCountdown();
      else if (phaseRef.current === "recording" || phaseRef.current === "paused") stopRecording();
    });

    // Give the person a moment to switch to the window that shows the video.
    updatePhase("countdown");
    setCountdown(COUNTDOWN_SECONDS);
    let remaining = COUNTDOWN_SECONDS;
    countdownRef.current = window.setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining > 0) return;
      if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
      countdownRef.current = null;
      if (phaseRef.current !== "countdown" || recorderRef.current !== recorder) return;
      try {
        recorder.start(1000);
      } catch (cause) {
        releaseCapture();
        updatePhase("idle");
        setError(describeCaptureError(cause));
        return;
      }
      startedAtRef.current = Date.now();
      pausedMsRef.current = 0;
      pauseStartedRef.current = 0;
      updatePhase("recording");
      timerRef.current = window.setInterval(() => {
        const seconds = (Date.now() - startedAtRef.current - pausedMsRef.current) / 1000;
        setElapsed(seconds);
        if (autoStopReason(seconds, bytesRef.current)) {
          setNotice("The recording reached its safety limit and was stopped so it can be saved.");
          stopRecording();
        }
      }, 250);
    }, 1000);
  }, [cancelCountdown, captureAudio, discardRecording, finalize, quality, releaseCapture, source, stopRecording, support.mediaRecorder, support.screenCapture, updatePhase, useMicrophone]);

  const togglePause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      pauseStartedRef.current = Date.now();
      updatePhase("paused");
    } else if (recorder.state === "paused") {
      recorder.resume();
      pausedMsRef.current += Date.now() - pauseStartedRef.current;
      pauseStartedRef.current = 0;
      updatePhase("recording");
    }
  }, []);

  const busy = phase === "countdown" || phase === "recording" || phase === "paused" || phase === "finishing";
  const preset = QUALITY_PRESETS[quality];
  const estimate = estimateRecordingBytes(preset, 60, captureAudio);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface-2 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
            <CircleDot aria-hidden="true" className="size-5 text-danger" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Video Link Screen Recording</h2>
            <p className="text-sm text-muted">Open a video link as it appears on its platform, then record what you see.</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="video-link-input" className="text-sm font-medium">Video link</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="video-link-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={input}
            disabled={busy}
            placeholder="https://www.youtube.com/watch?v=…"
            onChange={(event) => { setInput(event.target.value); setSource(null); setError(""); }}
            onKeyDown={(event) => { if (event.key === "Enter") loadLink(); }}
            className="flex h-11 w-full rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          />
          <Button type="button" onClick={loadLink} disabled={busy || !input.trim()} className="sm:w-40">
            <Link2 /> Load link
          </Button>
        </div>
        <p className="text-xs text-muted">Public HTTPS pages and direct video files. Subscription services that use DRM cannot be recorded.</p>
      </div>

      {source ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm"><span className="font-medium">{source.platformLabel}</span> <span className="text-muted">· {source.host}</span></p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={openOriginal}><ExternalLink /> Open on {source.kind === "direct-video" ? "its own page" : source.platformLabel}</Button>
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-sm px-3 text-sm text-muted underline">New tab</a>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-black">
            {source.kind === "direct-video" && source.embedUrl ? (
              <video src={source.embedUrl} controls playsInline preload="metadata" className="max-h-[70vh] w-full bg-black" />
            ) : source.embedUrl ? (
              <iframe
                key={source.embedUrl}
                title={`${source.platformLabel} player`}
                src={source.embedUrl}
                allow={EMBED_ALLOW}
                sandbox={EMBED_SANDBOX}
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                loading="lazy"
                className="h-[70vh] min-h-[320px] w-full border-0"
              />
            ) : (
              <div className="space-y-2 p-5 text-sm text-white/85">
                <p className="font-medium text-white">{source.platformLabel} does not allow its page to be shown inside another site.</p>
                <p>Use <strong>Open on {source.platformLabel}</strong> to view the full page, including likes, comments and controls, in its own window. Then start recording and choose that window or tab.</p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted">
            The embedded player shows the platform's official player. Likes, comments and the surrounding page appear only on the original page, so open it in its own window and record that window when you need them.
          </p>
        </div>
      ) : null}

      {source ? (
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <h3 className="text-sm font-semibold">Recording</h3>
          {!support.screenCapture || !support.mediaRecorder ? (
            <p role="alert" className="rounded-xl border border-border bg-surface-2 p-3 text-sm">
              This browser cannot record the screen (phones and some browsers do not offer it). Use a current desktop browser, or record on a phone with the enV Android or iOS app.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Quality</span>
              <select
                value={quality}
                disabled={busy}
                onChange={(event) => setQuality(event.target.value as QualityPresetId)}
                className="flex h-11 w-full rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                {Object.values(QUALITY_PRESETS).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <span className="block text-xs text-muted">About {formatBytes(estimate)} per minute.</span>
            </label>
            <div className="space-y-2 text-sm">
              <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 py-2">
                <input type="checkbox" checked={captureAudio} disabled={busy} onChange={(event) => setCaptureAudio(event.target.checked)} />
                <span>Include the video's sound</span>
              </label>
              <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 py-2">
                <input type="checkbox" checked={useMicrophone} disabled={busy} onChange={(event) => setUseMicrophone(event.target.checked)} />
                <span>Add my microphone</span>
              </label>
            </div>
          </div>

          <label className="flex min-h-10 items-start gap-2 rounded-xl border border-border px-3 py-2.5 text-sm">
            <input type="checkbox" className="mt-0.5" checked={rightsConfirmed} disabled={busy} onChange={(event) => setRightsConfirmed(event.target.checked)} />
            <span>I own this video or have permission to record it, and I will only use the recording as allowed.</span>
          </label>

          {phase === "idle" || phase === "done" ? (
            <Button type="button" onClick={() => void beginRecording()} disabled={!rightsConfirmed || !support.screenCapture || !support.mediaRecorder} className="w-full">
              <CircleDot /> {phase === "done" ? "Record again" : "Start recording"}
            </Button>
          ) : null}

          {phase === "countdown" ? (
            <div role="status" aria-live="polite" className="space-y-2 rounded-xl border border-border bg-surface-2 p-4 text-center">
              <p className="text-3xl font-semibold tabular-nums">{countdown}</p>
              <p className="text-sm text-muted">Switch to the window or tab that shows the video. Recording begins when this reaches zero.</p>
              <Button type="button" variant="outline" size="sm" onClick={cancelCountdown}>Cancel</Button>
            </div>
          ) : null}

          {phase === "recording" || phase === "paused" || phase === "finishing" ? (
            <div className="space-y-3">
              <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 p-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span aria-hidden="true" className={"size-2.5 rounded-full " + (phase === "recording" ? "animate-pulse bg-danger" : "bg-muted")} />
                  {phase === "recording" ? "Recording" : phase === "paused" ? "Paused" : "Finishing…"}
                </span>
                <span className="tabular-nums">{formatDuration(elapsed)} <span className="text-muted">/ {formatDuration(MAX_RECORDING_SECONDS)} · {formatBytes(recordedBytes)}</span></span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={togglePause} disabled={phase === "finishing"}>
                  {phase === "paused" ? <><Play /> Resume</> : <><Pause /> Pause</>}
                </Button>
                <Button type="button" variant="danger" onClick={stopRecording} disabled={phase === "finishing"}><Square /> Stop</Button>
              </div>
              <p className="text-xs text-muted">Everything visible in the shared window is recorded, including names and comments. Pause or stop before showing anything private.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {recording ? (
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <h3 className="text-sm font-semibold">Your recording</h3>
          <video src={recording.url} controls playsInline className="max-h-[60vh] w-full rounded-xl bg-black" />
          <p className="text-sm text-muted">{formatDuration(recording.seconds)} · {formatBytes(recording.blob.size)} · {recording.fileName.split(".").pop()?.toUpperCase()}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button type="button" onClick={() => downloadRecording(recording)}><Download /> Save video</Button>
            <Button type="button" variant="outline" onClick={() => { discardRecording(); updatePhase("idle"); }}><RotateCcw /> Record again</Button>
            <Button type="button" variant="ghost" onClick={() => { discardRecording(); updatePhase("idle"); }}><Trash2 /> Discard</Button>
          </div>
          <p className="text-xs text-muted">The recording exists only in this browser tab until you save it. Nothing was uploaded.</p>
        </div>
      ) : null}

      {error ? <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {notice ? <p role="status" className="rounded-xl border border-border bg-surface-2 p-3 text-sm">{notice}</p> : null}
    </div>
  );
}
