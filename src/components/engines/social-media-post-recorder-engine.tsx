import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadBlob } from "@/lib/utils";
import { recordToolExecutionResult } from "@/lib/analytics/client";
import { resolveSocialPostUrl } from "@/lib/media/social-post-recorder-policy.mjs";

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

export function SocialMediaPostRecorderEngine() {
  const [postLink, setPostLink] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [captureSupported, setCaptureSupported] = useState(false);
  const [secureContext, setSecureContext] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [output, setOutput] = useState<CaptureOutput | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    setSecureContext(window.isSecureContext);
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
      const resolved = resolveSocialPostUrl(postLink);
      setProvider(resolved.provider);
      setError(null);
      return resolved;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enter a supported social-media post link.");
      return null;
    }
  }

  function openPost() {
    const resolved = parseLink();
    if (!resolved) return;
    setOutput(null);
    setNotice(null);
    const opened = window.open(resolved.url, "_blank", "noopener,noreferrer");
    if (!opened) {
      setError("Your browser blocked the new tab. Allow pop-ups for enV, then open the post again.");
      return;
    }
    setNotice("Post opened in a new tab. Keep that tab available, return here, and start capture when you're ready.");
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
      setIsRecording(false);
      setError("The browser could not finalize this recording. Try another capture.");
    }
  }

  async function startCapture() {
    if (isRecording) return;
    const resolved = parseLink();
    if (!resolved) return;
    if (!window.isSecureContext) {
      setError("Screen capture requires a secure HTTPS connection. Open enV over HTTPS and try again.");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setError("Screen recording is not available in this browser. Use the enV Android app, or a desktop browser with screen-capture support.");
      return;
    }

    setError(null);
    setNotice(null);
    setOutput(null);
    setElapsedSeconds(0);
    setHasAudio(false);
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
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      stream.getTracks().forEach((track) => track.stop());
      setError("The selected screen source did not provide a video track.");
      return;
    }

    const audioTracks = stream.getAudioTracks();
    setHasAudio(audioTracks.length > 0);
    const mimeType = recorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (reason) {
      stream.getTracks().forEach((track) => track.stop());
      setError(reason instanceof Error ? reason.message : "This browser cannot encode the selected screen source.");
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
      setIsRecording(false);
      setElapsedSeconds(duration);
      if (!blob.size) {
        setError("No screen frames were recorded. Check the selected tab and try again.");
        recordToolExecutionResult("social-media-post-recorder", "failure", duration * 1000, "screen_capture", "EMPTY_CAPTURE");
        return;
      }
      const nextOutput = {
        blob,
        filename: `env-social-post-capture-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`,
        mimeType: finalType,
        size: blob.size,
      };
      setOutput(nextOutput);
      setNotice(audioTracks.length
        ? "Capture is ready. The selected source supplied an audio track."
        : "Capture is ready, but the browser did not provide tab/system audio. The saved video may be silent.");
      recordToolExecutionResult("social-media-post-recorder", "success", duration * 1000, "screen_capture");
      chunksRef.current = [];
    };

    videoTrack.addEventListener("ended", stopCapture, { once: true });
    try {
      recorder.start(1000);
      setIsRecording(true);
      setNotice("Recording started. Play the post and scroll through the details you want included. Return to enV and stop capture when finished.");
      stopTimerRef.current = window.setTimeout(stopCapture, MAX_CAPTURE_MS);
    } catch (reason) {
      releaseCapture();
      setError(reason instanceof Error ? reason.message : "The browser could not start recording.");
    }
  }

  function saveRecording() {
    if (!output) return;
    downloadBlob(output.blob, output.filename);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm">
        <div className="font-medium">Record a social-media post from its link</div>
        <p className="mt-1 text-muted">
          Open the original post, then record the real screen. The saved video includes the interface and details visible during capture.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="social-post-recorder-link">Post link</label>
        <input
          id="social-post-recorder-link"
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
        <Button type="button" variant="outline" onClick={openPost} disabled={isRecording || !postLink.trim()}>
          Open post
        </Button>
        <Button type="button" onClick={() => void startCapture()} disabled={isRecording || !postLink.trim() || !captureSupported || !secureContext}>
          Start screen capture
        </Button>
        {isRecording ? <Button type="button" variant="destructive" onClick={stopCapture}>Stop and save</Button> : null}
      </div>

      {!secureContext ? <ErrorBanner message="Screen capture requires HTTPS. Open enV over a secure connection." /> : null}
      {!captureSupported ? <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-muted">
        This browser does not expose screen recording. The browser version of this tool requires a supported desktop browser. Use the native enV app for mobile screen capture.
      </div> : null}
      {isRecording ? (
        <div className="rounded-xl border border-border bg-surface-2 p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <strong>Recording screen</strong>
            <span className="font-mono text-sm tabular-nums">{formatTime(elapsedSeconds)}</span>
          </div>
          <p className="mt-2 text-sm text-muted">{hasAudio ? "Screen and selected source audio are being captured." : "Screen is being captured. No tab/system audio track was supplied."}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
            <div className="h-full w-full animate-pulse bg-accent" />
          </div>
          <p className="mt-2 text-xs text-muted">Maximum capture time: 10 minutes. You can stop earlier.</p>
        </div>
      ) : null}

      {notice ? <p className="text-sm text-muted" role="status">{notice}</p> : null}
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
