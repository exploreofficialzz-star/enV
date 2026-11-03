import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Check,
  Download,
  Flashlight,
  FlashlightOff,
  Grid2X2,
  Image as ImageIcon,
  Settings2,
  SwitchCamera,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type CaptureMode = "photo" | "video";
type FacingMode = "user" | "environment";
type LookId = "natural" | "warm" | "cool" | "mono" | "vivid";
type MediaKind = "photo" | "video";

type StudioMediaItem = {
  id: string;
  kind: MediaKind;
  url: string;
  blob: Blob;
  filename: string;
  createdAt: number;
};

const LOOKS: { id: LookId; label: string; css: string }[] = [
  { id: "natural", label: "Natural", css: "none" },
  { id: "warm", label: "Warm", css: "sepia(.16) saturate(1.08) contrast(1.02)" },
  { id: "cool", label: "Cool", css: "saturate(.92) hue-rotate(8deg) contrast(1.03)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.06)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.22) contrast(1.04)" },
];

const MAX_GALLERY_ITEMS = 12;

function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(value / 60);
  return `${String(minutes).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function recorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const options = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}


function downloadRecoveredRecording(blob: Blob) {
  const extension = blob.type.includes("mp4") ? "mp4" : "webm";
  const filename = `env-camera-recovered-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was declined. Allow camera access in your browser or device settings, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No usable camera was found on this device.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is busy or could not start. Close other apps using the camera and try again.";
  }
  if (name === "OverconstrainedError") {
    return "This camera cannot provide the requested settings. Try switching cameras.";
  }
  return error instanceof Error ? error.message : "The camera could not be started. Please try again.";
}

function isSecureCaptureContext() {
  return typeof window !== "undefined" && (
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

export function CameraStudioEngine() {
  const [mode, setMode] = useState<CaptureMode>("photo");
  const [facing, setFacing] = useState<FacingMode>("environment");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedLook, setSelectedLook] = useState<LookId>("natural");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [gridVisible, setGridVisible] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [showCameraInfo, setShowCameraInfo] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [gallery, setGallery] = useState<StudioMediaItem[]>([]);
  const [lastCaptureId, setLastCaptureId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const galleryRef = useRef<StudioMediaItem[]>([]);
  const requestIdRef = useRef(0);
  const recordingStartedRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const look = LOOKS.find((item) => item.id === selectedLook) ?? LOOKS[0];

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        // Keep the recorder callbacks attached: onstop downloads a recovery copy
        // if navigation unmounts this screen before the user can save the clip.
        try { recorder.stop(); } catch { /* The browser may already have stopped it. */ }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      microphoneRef.current?.getTracks().forEach((track) => track.stop());
      galleryRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current || !cameraStream) return;
    videoRef.current.srcObject = cameraStream;
    void videoRef.current.play().catch(() => {
      if (mountedRef.current) setNotice("Tap Start camera again if the preview does not appear.");
    });
  }, [cameraStream]);

  useEffect(() => {
    if (!cameraStream) {
      setTorchAvailable(false);
      setTorchEnabled(false);
      return;
    }
    const track = cameraStream.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    setTorchAvailable(Boolean(capabilities?.torch));
    setTorchEnabled(false);
  }, [cameraStream]);


  useEffect(() => {
    if (!isRecording) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "A recording is in progress. Stop it to save your clip before leaving.";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) {
      if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
      return;
    }
    recordingTimerRef.current = window.setInterval(() => {
      const started = recordingStartedRef.current;
      if (started !== null) setRecordingSeconds(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => {
      if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    };
  }, [isRecording]);

  const releaseCamera = useCallback(() => {
    requestIdRef.current += 1;
    const current = streamRef.current;
    streamRef.current = null;
    current?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setTorchEnabled(false);
    setCameraBusy(false);
  }, []);

  const requestCamera = useCallback(async (nextFacing: FacingMode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser does not provide camera access. Open enV over HTTPS in a browser that supports camera capture.");
      return;
    }
    if (!isSecureCaptureContext()) {
      setCameraError("Camera access requires a secure connection. Open enV using its HTTPS website address.");
      return;
    }
    if (isRecording) {
      setCameraError("Stop the current recording before changing cameras.");
      return;
    }

    const requestId = ++requestIdRef.current;
    setCameraBusy(true);
    setCameraError(null);
    setNotice(null);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStream(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (requestId !== requestIdRef.current || !mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraStream(stream);
      setFacing(nextFacing);
      setNotice(nextFacing === "user" ? "Front camera ready." : "Rear camera ready.");
      const videoTrack = stream.getVideoTracks()[0];
      videoTrack?.addEventListener("ended", () => {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setCameraError("The camera stopped. The active recording was stopped so the clip can be finalized.");
          const activeRecorder = recorderRef.current;
          if (activeRecorder && activeRecorder.state !== "inactive") {
            try { activeRecorder.stop(); } catch { /* The recorder may already be finalizing. */ }
          }
          setCameraStream(null);
          streamRef.current = null;
        }
      }, { once: true });
    } catch (error) {
      if (requestId === requestIdRef.current && mountedRef.current) {
        setCameraError(cameraErrorMessage(error));
      }
    } finally {
      if (requestId === requestIdRef.current && mountedRef.current) setCameraBusy(false);
    }
  }, [isRecording]);

  const addToGallery = useCallback((kind: MediaKind, blob: Blob) => {
    const extension = kind === "photo" ? "jpg" : (blob.type.includes("mp4") ? "mp4" : "webm");
    const filename = `env-camera-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
    const item: StudioMediaItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      kind,
      url: URL.createObjectURL(blob),
      blob,
      filename,
      createdAt: Date.now(),
    };
    setGallery((previous) => {
      const next = [item, ...previous].slice(0, MAX_GALLERY_ITEMS);
      const kept = new Set(next.map((entry) => entry.id));
      previous.forEach((entry) => {
        if (!kept.has(entry.id)) URL.revokeObjectURL(entry.url);
      });
      galleryRef.current = next;
      return next;
    });
    setLastCaptureId(item.id);
    return item;
  }, []);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!cameraStream || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setCameraError("Wait for the camera preview to become clear, then try again.");
      return;
    }
    if (countdown !== null) return;
    setCameraError(null);
    try {
      if (timerSeconds > 0) {
        for (let remaining = timerSeconds; remaining > 0; remaining -= 1) {
          if (!mountedRef.current) return;
          setCountdown(remaining);
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      }
      if (!mountedRef.current) return;
      setCountdown(null);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This device could not prepare the photo.");
      if (facing === "user") {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }
      context.filter = look.css;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The photo could not be saved.")), "image/jpeg", 0.94);
      });
      addToGallery("photo", blob);
      setNotice("Photo captured. Download it from Recent captures to save it to your device.");
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "The photo could not be captured.");
    } finally {
      if (mountedRef.current) setCountdown(null);
    }
  }, [addToGallery, cameraStream, countdown, facing, look.css, timerSeconds]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        setCameraError("The recording could not be stopped cleanly. Check Recent captures before leaving this screen.");
      }
    } else {
      setIsRecording(false);
      setCameraError("The recording session ended before it could be finalized. Check Recent captures for a saved clip.");
    }
  }, []);

  const startRecording = useCallback(async () => {
    const currentStream = streamRef.current;
    if (!currentStream || !currentStream.getVideoTracks().some((track) => track.readyState === "live")) {
      setCameraError("Start the camera before recording.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setCameraError("Video recording is not supported by this browser. Try a current Chrome, Edge, or Safari browser.");
      return;
    }
    setCameraError(null);
    setNotice(null);
    setCameraBusy(true);
    const mimeType = recorderMimeType();
    let microphone: MediaStream | null = null;
    try {
      try {
        microphone = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        microphoneRef.current = microphone;
      } catch {
        setNotice("Microphone permission was not granted. Recording will continue without sound.");
      }

      const tracks = [
        ...currentStream.getVideoTracks(),
        ...(microphone?.getAudioTracks() ?? []),
      ];
      const recordingStream = new MediaStream(tracks);
      const recorder = mimeType
        ? new MediaRecorder(recordingStream, { mimeType })
        : new MediaRecorder(recordingStream);
      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (mountedRef.current) setCameraError("Recording encountered an error. Check Recent captures for a recoverable clip.");
      };
      recorder.onstop = () => {
        const actualType = recorder.mimeType || mimeType || "video/webm";
        const recording = new Blob(chunksRef.current, { type: actualType });
        chunksRef.current = [];
        microphoneRef.current?.getTracks().forEach((track) => track.stop());
        microphoneRef.current = null;
        recorderRef.current = null;
        recordingStartedRef.current = null;
        if (!mountedRef.current) {
          if (recording.size > 0) downloadRecoveredRecording(recording);
          return;
        }
        setIsRecording(false);
        if (recording.size > 0) {
          setCameraError(null);
          addToGallery("video", recording);
          setNotice("Recording saved to Recent captures. Download it to keep a copy on your device.");
        } else {
          setCameraError("The recording did not produce a usable file. Try a shorter clip and check available storage.");
        }
      };
      recorder.start(500);
      recordingStartedRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch (error) {
      microphone?.getTracks().forEach((track) => track.stop());
      microphoneRef.current = null;
      setCameraError(error instanceof Error ? error.message : "Video recording could not start on this device.");
    } finally {
      if (mountedRef.current) setCameraBusy(false);
    }
  }, [addToGallery]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchAvailable) return;
    const nextValue = !torchEnabled;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextValue } as unknown as MediaTrackConstraintSet],
      });
      setTorchEnabled(nextValue);
    } catch {
      setTorchAvailable(false);
      setTorchEnabled(false);
      setNotice("This camera does not allow its light to be controlled here.");
    }
  }, [torchAvailable, torchEnabled]);

  const switchCamera = useCallback(async () => {
    const previous = facing;
    const next = previous === "user" ? "environment" : "user";
    await requestCamera(next);
    if (streamRef.current === null && mountedRef.current) {
      setFacing(previous);
    }
  }, [facing, requestCamera]);

  const removeFromGallery = useCallback((id: string) => {
    const removed = gallery.find((item) => item.id === id);
    if (removed) URL.revokeObjectURL(removed.url);
    const next = gallery.filter((item) => item.id !== id);
    galleryRef.current = next;
    setGallery(next);
    if (lastCaptureId === id) setLastCaptureId(next[0]?.id ?? null);
  }, [gallery, lastCaptureId]);

  const clearGallery = useCallback(() => {
    galleryRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    galleryRef.current = [];
    setGallery([]);
    setLastCaptureId(null);
  }, []);

  const activeTrack = cameraStream?.getVideoTracks()[0];
  const cameraSettings = activeTrack?.getSettings();
  const previewFilter = mode === "photo" ? look.css : "none";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-fg">Camera Studio</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            A simple camera for everyday photos and videos, with useful creator controls when you need them.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted">
          <span className={`size-2 rounded-full ${cameraStream ? "bg-ok" : "bg-subtle"}`} />
          {cameraStream ? "Camera ready" : "Camera off"}
        </div>
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
        <section className="min-w-0 space-y-3">
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-border)]">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
              <div className="inline-flex rounded-lg bg-surface-2 p-1" aria-label="Capture mode">
                <button
                  type="button"
                  aria-pressed={mode === "photo"}
                  onClick={() => setMode("photo")}
                  disabled={isRecording || countdown !== null}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${mode === "photo" ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}
                >
                  <Camera size={16} /> Photo
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "video"}
                  onClick={() => setMode("video")}
                  disabled={isRecording || countdown !== null}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${mode === "video" ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}
                >
                  <Video size={16} /> Video
                </button>
              </div>
              <span className="text-xs tabular-nums text-muted">
                {isRecording ? <span className="inline-flex items-center gap-2 font-medium text-danger"><span className="size-2 animate-pulse rounded-full bg-danger" /> REC {formatTime(recordingSeconds)}</span> : facing === "user" ? "Front camera" : "Rear camera"}
              </span>
            </div>

            <div className="relative mx-auto aspect-[4/3] w-full max-h-[min(70vh,720px)] overflow-hidden bg-[#111315]">
              {cameraStream ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    aria-label="Live camera preview"
                    className="absolute inset-0 size-full object-cover"
                    style={{ filter: previewFilter, transform: facing === "user" ? "scaleX(-1)" : undefined }}
                  />
                  {gridVisible && (
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                      {Array.from({ length: 9 }, (_, index) => (
                        <span key={index} className={`border-white/45 ${index % 3 !== 2 ? "border-r" : ""} ${Math.floor(index / 3) !== 2 ? "border-b" : ""}`} />
                      ))}
                    </div>
                  )}
                  {countdown !== null && (
                    <div className="absolute inset-0 grid place-items-center bg-black/20">
                      <span className="text-6xl font-semibold tabular-nums text-white drop-shadow-lg">{countdown}</span>
                    </div>
                  )}
                  {isRecording && (
                    <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-xs font-medium text-white">
                      <span className="size-2 rounded-full bg-red-500" /> Recording · {formatTime(recordingSeconds)}
                    </div>
                  )}
                  {mode === "photo" && selectedLook !== "natural" && (
                    <span className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white">{look.label}</span>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
                  <span className="grid size-16 place-items-center rounded-full border border-white/20 bg-white/10">
                    <CameraOff size={28} />
                  </span>
                  <div>
                    <p className="font-medium">Your camera preview will appear here</p>
                    <p className="mt-1 text-sm text-white/65">Allow camera access when your browser asks.</p>
                  </div>
                  <Button type="button" variant="outline" size="lg" disabled={cameraBusy} onClick={() => void requestCamera(facing)} className="border-white/30 bg-white text-[#16181d] hover:bg-white/90">
                    {cameraBusy ? "Opening camera…" : "Start camera"}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-3 sm:px-4">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" aria-label="Switch camera" title="Switch camera" disabled={!cameraStream || cameraBusy || isRecording || countdown !== null} onClick={() => void switchCamera()}>
                  <SwitchCamera size={18} />
                </Button>
                {torchAvailable && (
                  <Button type="button" variant="outline" size="icon" aria-label={torchEnabled ? "Turn light off" : "Turn light on"} title={torchEnabled ? "Turn light off" : "Turn light on"} disabled={!cameraStream || isRecording || countdown !== null} onClick={() => void toggleTorch()}>
                    {torchEnabled ? <FlashlightOff size={18} /> : <Flashlight size={18} />}
                  </Button>
                )}
                <Button type="button" variant="outline" size="icon" aria-label={gridVisible ? "Hide framing grid" : "Show framing grid"} title={gridVisible ? "Hide grid" : "Show grid"} disabled={!cameraStream} onClick={() => setGridVisible((value) => !value)}>
                  <Grid2X2 size={18} />
                </Button>
              </div>

              <button
                type="button"
                aria-label={isRecording ? "Stop video recording" : mode === "photo" ? "Take photo" : "Start video recording"}
                disabled={!cameraStream || cameraBusy || countdown !== null}
                onClick={() => {
                  if (isRecording) stopRecording();
                  else if (mode === "photo") void capturePhoto();
                  else void startRecording();
                }}
                className={`grid size-[66px] place-items-center rounded-full border-[5px] border-fg bg-surface transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${isRecording ? "border-danger" : ""}`}
              >
                {mode === "photo" ? <span className="size-10 rounded-full bg-fg" /> : isRecording ? <span className="size-6 rounded-md bg-danger" /> : <span className="size-10 rounded-full bg-danger" />}
              </button>

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" aria-label="Camera settings" title="Camera settings" onClick={() => setShowCameraInfo((value) => !value)}>
                  <Settings2 size={18} />
                </Button>
                <span className="grid size-10 place-items-center overflow-hidden rounded-md border border-border bg-surface-2 text-muted">
                  {gallery[0] ? gallery[0].kind === "photo" ? <img src={gallery[0].url} alt="" className="size-full object-cover" /> : <Video size={17} /> : <ImageIcon size={17} />}
                </span>
              </div>
            </div>
          </div>

          {cameraError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">
              <X size={17} className="mt-0.5 shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}
          {notice && !cameraError && (
            <p role="status" aria-live="polite" className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-muted">
              <Check size={16} className="mt-0.5 shrink-0 text-ok" /> {notice}
            </p>
          )}

          {showCameraInfo && (
            <div className="rounded-lg border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg">Camera details</h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowCameraInfo(false)}>Close</Button>
              </div>
              {cameraSettings ? (
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-muted">Preview size</dt><dd className="font-medium text-fg">{cameraSettings.width ?? "—"} × {cameraSettings.height ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Frame rate</dt><dd className="font-medium text-fg">{cameraSettings.frameRate ? `${Math.round(cameraSettings.frameRate)} fps` : "Automatic"}</dd></div>
                  <div><dt className="text-xs text-muted">Camera</dt><dd className="font-medium text-fg">{facing === "user" ? "Front" : "Rear"}</dd></div>
                </dl>
              ) : (
                <p className="text-sm text-muted">Start the camera to see the settings reported by this device.</p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-muted">These are the settings reported by the active camera stream. Available resolutions, focus, flash and frame rates depend on your device.</p>
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-3">
          <section className="rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-border)] sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-fg">Quick controls</h3>
              {cameraStream && <Button type="button" variant="ghost" size="sm" disabled={isRecording || countdown !== null} onClick={releaseCamera}>Stop camera</Button>}
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-fg">Photo timer</span>
                  <span className="text-xs text-muted">{timerSeconds === 0 ? "Off" : `${timerSeconds} seconds`}</span>
                </div>
                <div id="camera-timer" className="grid grid-cols-3 gap-2">
                  {[0, 3, 10].map((seconds) => (
                    <button key={seconds} type="button" aria-pressed={timerSeconds === seconds} onClick={() => setTimerSeconds(seconds)} disabled={mode !== "photo"} className={`min-h-10 rounded-md border px-2 text-sm font-medium transition-colors disabled:opacity-40 ${timerSeconds === seconds ? "border-accent bg-accent-soft text-fg" : "border-border bg-surface text-muted hover:bg-surface-2"}`}>
                      {seconds === 0 ? "Off" : `${seconds}s`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-fg">Photo looks</span>
                  <span className="text-xs text-muted">Optional</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {LOOKS.map((item) => (
                    <button key={item.id} type="button" aria-pressed={selectedLook === item.id} disabled={mode !== "photo"} onClick={() => setSelectedLook(item.id)} className={`min-h-10 rounded-md border px-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${selectedLook === item.id ? "border-accent bg-accent-soft text-fg" : "border-border bg-surface text-muted hover:bg-surface-2"}`}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">Looks are applied to saved photos. Video stays clean and unfiltered in this first release.</p>
              </div>

              <div className="rounded-lg bg-surface-2 px-3 py-3">
                <p className="text-sm font-medium text-fg">Device-aware capture</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">Camera size, frame rate, light and microphone access depend on your phone and browser. Unsupported controls stay unavailable instead of pretending to work.</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-border)] sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-fg">Before you record</h3>
              <Mic size={17} className="text-muted" />
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
              <li>• Keep the lens clean and use steady light where possible.</li>
              <li>• Allow microphone access when you want sound in a video.</li>
              <li>• Longer clips use more storage and can warm up your phone.</li>
              <li>• Keep enV open until the recording is stopped and saved.</li>
            </ul>
            <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted">
              Dual front-and-rear recording is not enabled unless simultaneous camera support can be verified on this device.
            </p>
          </section>
        </aside>
      </div>

      {gallery.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-border)] sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-fg">Recent captures</h3>
              <p className="mt-0.5 text-xs text-muted">Stored in this camera session. Download the files you want to keep.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={clearGallery}>Clear list</Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((item) => (
              <article key={item.id} className={`min-w-0 overflow-hidden rounded-lg border ${lastCaptureId === item.id ? "border-accent" : "border-border"} bg-surface`}>
                <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
                  {item.kind === "photo" ? (
                    <img src={item.url} alt="Captured photo" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <video src={item.url} controls playsInline preload="metadata" className="size-full object-cover" aria-label="Captured video" />
                  )}
                  <span className="absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-[10px] font-medium text-white">{item.kind === "photo" ? "PHOTO" : "VIDEO"}</span>
                </div>
                <div className="space-y-2 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-fg">{item.filename}</span>
                    <span className="shrink-0 text-[10px] text-muted">{formatBytes(item.blob.size)}</span>
                  </div>
                  <div className="flex gap-2">
                    <a href={item.url} download={item.filename} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-fg px-2 text-xs font-medium text-surface hover:opacity-85">
                      <Download size={14} /> Download
                    </a>
                    <Button type="button" size="icon" variant="outline" aria-label={`Remove ${item.filename}`} title="Remove" onClick={() => removeFromGallery(item.id)} className="size-9 min-h-9">
                      <X size={14} />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <p className="px-1 text-xs leading-relaxed text-muted">
        Privacy: camera and microphone access begin only after you request them. Captures are processed in this session and are not uploaded to enV.
      </p>
    </div>
  );
}
