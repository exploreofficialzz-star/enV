import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadBlob } from "@/lib/utils";
import { recordToolExecutionResult } from "@/lib/analytics/client";
import { parseScreenRecordingPostLink } from "@/lib/media/video-link-recording";

type CaptureOutput = { blob: Blob; filename: string; mimeType: string; size: number };

const MAX_CAPTURE_MS = 10 * 60 * 1000;

function recorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function VideoLinkRecorderEngine() {
  const [postLink, setPostLink] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [captureSupported, setCaptureSupported] = useState(false);
  const [secureContext, setSecureContext] = useState(true);
  const [androidDevice, setAndroidDevice] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<CaptureOutput | null>(null);

  const startingRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    setSecureContext(window.isSecureContext);
    setAndroidDevice(/Android/i.test(navigator.userAgent));
    setCaptureSupported(
      Boolean(navigator.mediaDevices?.getDisplayMedia) &&
      typeof MediaRecorder !== "undefined",
    );
  }, []);

  const previewUrl = useMemo(
    () => output ? URL.createObjectURL(output.blob) : null,
    [output],
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => () => {
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* The browser may already be finalizing. */ }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function parseLink() {
    try {
      const result = parseScreenRecordingPostLink(postLink);
      if (!result.ok) {
        setError(result.reason);
        return null;
      }
      setProvider(result.platformLabel);
      setError(null);
      return { url: result.url, provider: result.platformLabel };
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enter a supported social-media post link.");
      return null;
    }
  }

  function openPost() {
    const resolved = parseLink();
    if (!resolved) { startingRef.current = false; return; }
    setOutput(null);
    const opened = window.open(resolved.url, "_blank");
    if (!opened) {
      setError("Your browser blocked the new tab. Allow pop-ups for enV, then open the post again.");
      return;
    }
    try { opened.opener = null; } catch { /* Browser-controlled cross-origin opener isolation. */ }
  }

  function openNativeRecorder() {
    const resolved = parseLink();
    if (!resolved) return;
    window.location.href = `env://tool/video-link-screen-recording?postUrl=${encodeURIComponent(resolved.url)}`;
  }

  function releaseCapture() {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  function stopCapture() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive" || stoppedRef.current) return;
    stoppedRef.current = true;
    try {
      recorder.stop();
    } catch {
      releaseCapture();
      startingRef.current = false;
      setIsRecording(false);
      setError("The browser could not finalize this recording. Try another capture.");
    }
  }

  async function startCapture() {
    if (isRecording || startingRef.current) return;
    startingRef.current = true;
    const resolved = parseLink();
    if (!resolved) return;
    if (!window.isSecureContext) {
      setError("Screen capture requires a secure HTTPS connection. Open enV over HTTPS and try again.");
      startingRef.current = false;
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setError("Screen recording is not available in this browser. Use the enV Android app, or a desktop browser with screen-capture support.");
      startingRef.current = false;
      return;
    }

    setError(null);
    setOutput(null);
    setElapsedSeconds(0);
    chunksRef.current = [];
    stoppedRef.current = false;

    let stream: MediaStream;
    try {
      // Must remain directly inside this user-initiated action so the browser
      // can present its own screen/tab permission picker.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: true,
      });
    } catch (reason) {
      if (reason instanceof Error && reason.name === "NotAllowedError") {
        setError("Screen capture was cancelled or permission was not granted.");
      } else {
        setError(reason instanceof Error ? reason.message : "The browser could not start screen capture.");
      }
      startingRef.current = false;
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      stream.getTracks().forEach((track) => track.stop());
      setError("The selected screen source did not provide a video track.");
      startingRef.current = false;
      return;
    }
    const mimeType = recorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (reason) {
      stream.getTracks().forEach((track) => track.stop());
      setError(reason instanceof Error ? reason.message : "This browser cannot encode the selected screen source.");
      startingRef.current = false;
      return;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      setError("The browser reported a recording error. Stop capture and try again.");
      stopCapture();
    };
    recorder.onstop = () => {
      const finalType = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type: finalType });
      const extension = finalType.toLowerCase().includes("mp4") ? "mp4" : "webm";
      const duration = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));
      releaseCapture();
      startingRef.current = false;
      setIsRecording(false);
      setElapsedSeconds(duration);
      if (!blob.size) {
        setError("No screen frames were recorded. Check the selected tab and try again.");
        recordToolExecutionResult("video-link-screen-recording", "failure", duration * 1000, "screen_capture", "EMPTY_CAPTURE");
        return;
      }
      const nextOutput = {
        blob,
        filename: `env-video-link-interface-capture-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`,
        mimeType: finalType,
        size: blob.size,
      };
      setOutput(nextOutput);
      recordToolExecutionResult("video-link-screen-recording", "success", duration * 1000, "screen_capture");
      chunksRef.current = [];
    };

    videoTrack.addEventListener("ended", stopCapture, { once: true });
    try {
      recorder.start(1000);
      setIsRecording(true);
      stopTimerRef.current = window.setTimeout(stopCapture, MAX_CAPTURE_MS);
    } catch (reason) {
      releaseCapture();
      startingRef.current = false;
      setError(reason instanceof Error ? reason.message : "The browser could not start recording.");
    }
  }

  function saveRecording() {
    if (!output) return;
    downloadBlob(output.blob, output.filename);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="video-post-recorder-link">Post link</label>
        <input
          id="video-post-recorder-link"
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          type="url"
          value={postLink}
          onChange={(event) => { setPostLink(event.target.value); setProvider(null); setError(null); }}
          placeholder="Paste a TikTok, Instagram, Facebook, YouTube or other supported post link"
          autoComplete="off"
          disabled={isRecording}
        />
        {provider ? <p className="text-xs text-muted">Detected platform: <strong className="text-fg">{provider}</strong></p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {androidDevice ? (
          <Button type="button" onClick={openNativeRecorder} disabled={isRecording || !postLink.trim()}>
            Start recording
          </Button>
        ) : captureSupported ? (
          <>
            <Button type="button" variant="outline" onClick={openPost} disabled={isRecording || !postLink.trim()}>
              Open post
            </Button>
            <Button type="button" onClick={() => void startCapture()} disabled={isRecording || !postLink.trim() || !secureContext}>
              Start recording
            </Button>
          </>
        ) : (
          <Button type="button" disabled>
            Start recording
          </Button>
        )}
        {isRecording ? <Button type="button" variant="danger" onClick={stopCapture}>Stop and finish</Button> : null}
      </div>

      {!secureContext ? <ErrorBanner message="Screen capture requires HTTPS. Open enV over a secure connection." /> : null}
      {isRecording ? (
        <div className="rounded-xl border border-border bg-surface-2 p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <strong>Recording screen</strong>
            <span className="font-mono text-sm tabular-nums">{formatTime(elapsedSeconds)}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
            <div className="h-full w-full animate-pulse bg-accent" />
          </div>
        </div>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}

      {output && previewUrl ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-4">
          <div className="font-medium">Recording ready</div>
          <video className="max-h-[70vh] w-full rounded-lg bg-black" src={previewUrl} controls playsInline />
          <div className="text-sm text-muted">
            {formatTime(elapsedSeconds)} · {(output.size / 1024 / 1024).toFixed(2)} MB · {output.mimeType}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={saveRecording}>Save recording</Button>
            <Button type="button" variant="outline" onClick={() => setOutput(null)}>Discard</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
