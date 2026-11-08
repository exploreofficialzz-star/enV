import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
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
type LookId = "natural" | "warm" | "cool" | "mono" | "vivid" | "fade" | "sunset" | "glow";
type MediaKind = "photo" | "video";
type NumericRange = { min: number; max: number; step?: number };
type VideoQuality = "720p" | "1080p" | "4k";
type FrameRate = 24 | 30 | 60;
type DualCameraLayout = "pip" | "split";

const VIDEO_QUALITIES: Record<VideoQuality, { width: number; height: number; label: string }> = {
  "720p": { width: 1280, height: 720, label: "HD" },
  "1080p": { width: 1920, height: 1080, label: "Full HD" },
  "4k": { width: 3840, height: 2160, label: "4K" },
};

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
  { id: "fade", label: "Fade", css: "saturate(.78) contrast(.9) brightness(1.05)" },
  { id: "sunset", label: "Sunset", css: "sepia(.18) saturate(1.3) hue-rotate(-8deg)" },
  { id: "glow", label: "Glow", css: "brightness(1.06) saturate(1.12) contrast(.96)" },
];

const MAX_GALLERY_ITEMS = 12;

function drawCover(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  width: number,
  height: number,
  mirror = false,
) {
  if (!video.videoWidth || !video.videoHeight || width <= 0 || height <= 0) return;
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (video.videoWidth - sourceWidth) / 2;
  const sourceY = (video.videoHeight - sourceHeight) / 2;
  context.save();
  if (mirror) {
    context.translate(x + width, y);
    context.scale(-1, 1);
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
  } else {
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  }
  context.restore();
}

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
  const [dualStream, setDualStream] = useState<MediaStream | null>(null);
  const [dualLayout, setDualLayout] = useState<DualCameraLayout>("pip");
  const [dualBusy, setDualBusy] = useState(false);
  const [dualUnavailable, setDualUnavailable] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedLook, setSelectedLook] = useState<LookId>("natural");
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("1080p");
  const [frameRate, setFrameRate] = useState<FrameRate>(30);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [gridVisible, setGridVisible] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoomRange, setZoomRange] = useState<NumericRange | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [exposureRange, setExposureRange] = useState<NumericRange | null>(null);
  const [exposureValue, setExposureValue] = useState(0);
  const [showCameraInfo, setShowCameraInfo] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [gallery, setGallery] = useState<StudioMediaItem[]>([]);
  const [lastCaptureId, setLastCaptureId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dualVideoRef = useRef<HTMLVideoElement | null>(null);
  const dualStreamRef = useRef<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const galleryRef = useRef<StudioMediaItem[]>([]);
  const requestIdRef = useRef(0);
  const initialCameraRequestRef = useRef(false);
  const recordingStartedRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingCanvasFrameRef = useRef<number | null>(null);
  const recordingCanvasStreamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const look = LOOKS.find((item) => item.id === selectedLook) ?? LOOKS[0];

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
      if (recordingCanvasFrameRef.current !== null) window.cancelAnimationFrame(recordingCanvasFrameRef.current);
      recordingCanvasFrameRef.current = null;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        // Keep the recorder callbacks attached: onstop downloads a recovery copy
        // if navigation unmounts this screen before the user can save the clip.
        try { recorder.stop(); } catch { /* The browser may already have stopped it. */ }
      } else {
        recordingCanvasStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingCanvasStreamRef.current = null;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      dualStreamRef.current?.getTracks().forEach((track) => track.stop());
      dualStreamRef.current = null;
      microphoneRef.current?.getTracks().forEach((track) => track.stop());
      galleryRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current || !cameraStream) return;
    videoRef.current.srcObject = cameraStream;
    void videoRef.current.play().catch(() => {
      if (mountedRef.current) setCameraError("The camera could not start. Try again.");
    });
  }, [cameraStream]);

  useEffect(() => {
    if (!dualVideoRef.current || !dualStream) return;
    dualVideoRef.current.srcObject = dualStream;
    void dualVideoRef.current.play().catch(() => {
      if (mountedRef.current) setNotice("The second camera could not start. Turn dual camera off and try again.");
    });
  }, [dualStream]);

  useEffect(() => {
    if (!cameraStream) {
      setTorchAvailable(false);
      setTorchEnabled(false);
      setZoomRange(null);
      setZoomLevel(1);
      setExposureRange(null);
      setExposureValue(0);
      return;
    }
    const track = cameraStream.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & {
      torch?: boolean;
      zoom?: NumericRange;
      exposureCompensation?: NumericRange;
    }) | undefined;
    const settings = track?.getSettings() as (MediaTrackSettings & {
      zoom?: number;
      exposureCompensation?: number;
    }) | undefined;
    setTorchAvailable(Boolean(capabilities?.torch));
    setTorchEnabled(false);
    const zoom = capabilities?.zoom;
    setZoomRange(zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max) && zoom.max > zoom.min ? zoom : null);
    setZoomLevel(settings?.zoom ?? zoom?.min ?? 1);
    const exposure = capabilities?.exposureCompensation;
    setExposureRange(exposure && Number.isFinite(exposure.min) && Number.isFinite(exposure.max) && exposure.max > exposure.min ? exposure : null);
    setExposureValue(settings?.exposureCompensation ?? 0);
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
    dualStreamRef.current?.getTracks().forEach((track) => track.stop());
    dualStreamRef.current = null;
    setDualStream(null);
    setDualUnavailable(false);
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

    dualStreamRef.current?.getTracks().forEach((track) => track.stop());
    dualStreamRef.current = null;
    setDualStream(null);
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
          width: { ideal: VIDEO_QUALITIES[videoQuality].width },
          height: { ideal: VIDEO_QUALITIES[videoQuality].height },
          frameRate: { ideal: frameRate },
        },
      });
      if (requestId !== requestIdRef.current || !mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraStream(stream);
      const videoTrack = stream.getVideoTracks()[0];
      const facingSetting = videoTrack?.getSettings().facingMode;
      const activeFacing: FacingMode = facingSetting === "user"
        ? "user"
        : facingSetting === "environment"
          ? "environment"
          : nextFacing;
      setFacing(activeFacing);
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
  }, [frameRate, isRecording, videoQuality]);

  useEffect(() => {
    if (initialCameraRequestRef.current || cameraStream || cameraBusy) return;
    initialCameraRequestRef.current = true;
    void requestCamera("environment");
  }, [requestCamera, cameraStream, cameraBusy]);

  const stopDualCamera = useCallback(() => {
    dualStreamRef.current?.getTracks().forEach((track) => track.stop());
    dualStreamRef.current = null;
    setDualStream(null);
    setDualUnavailable(false);
    setDualBusy(false);
  }, []);

  const startDualCamera = useCallback(async () => {
    if (dualStreamRef.current) return;
    const activePrimary = streamRef.current;
    const primary = activePrimary?.getVideoTracks()[0];
    if (!primary || !cameraStream) {
      setCameraError("Start the main camera before enabling dual camera.");
      return;
    }
    if (isRecording || cameraBusy || dualBusy) return;
    const primaryDeviceId = primary.getSettings().deviceId;
    const desiredFacing: FacingMode = facing === "user" ? "environment" : "user";
    setDualBusy(true);
    setCameraError(null);
    setDualUnavailable(false);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput" && device.deviceId !== primaryDeviceId);
      const isDesiredFacingLabel = (label: string) => {
        const normalized = label.toLowerCase();
        return desiredFacing === "user"
          ? /front|user|selfie|facetime/.test(normalized)
          : /back|rear|environment|world/.test(normalized);
      };
      const orderedCameras = cameras.slice().sort((left, right) =>
        Number(isDesiredFacingLabel(right.label)) - Number(isDesiredFacingLabel(left.label))
      );
      let stream: MediaStream | null = null;
      let selectedSecondaryProfile = "";
      let lastCameraError: unknown = null;
      // Some phones can run both sensors only at a reduced second-stream size/FPS.
      // Retry progressively cheaper profiles instead of giving up after one 720p ask.
      const secondaryProfiles = [
        { width: 1280, height: 720, frameRate: 30, label: "720p / 30 fps" },
        { width: 640, height: 480, frameRate: 24, label: "480p / 24 fps" },
        { width: 320, height: 240, frameRate: 15, label: "low-power 240p / 15 fps" },
      ];
      for (const device of orderedCameras) {
        for (const profile of secondaryProfiles) {
          try {
            const candidateStream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                deviceId: { exact: device.deviceId },
                facingMode: { ideal: desiredFacing },
                width: { ideal: profile.width, max: profile.width },
                height: { ideal: profile.height, max: profile.height },
                frameRate: { ideal: profile.frameRate, max: profile.frameRate },
              },
            });
            const candidateTrack = candidateStream.getVideoTracks()[0];
            const actualFacing = candidateTrack?.getSettings().facingMode;
            if (!candidateTrack || candidateTrack.readyState !== "live" ||
                (actualFacing && actualFacing !== desiredFacing) ||
                (!actualFacing && !isDesiredFacingLabel(device.label))) {
              candidateStream.getTracks().forEach((track) => track.stop());
              continue;
            }
            stream = candidateStream;
            selectedSecondaryProfile = profile.label;
            break;
          } catch (error) {
            lastCameraError = error;
          }
        }
        if (stream) break;
      }
      if (!stream) {
        setDualUnavailable(true);
        setNotice("A separate front/rear camera could not be opened at the same time. Single-camera capture is still available.");
        if (lastCameraError instanceof Error) {
          setCameraError(`Dual camera is not supported by this browser or phone: ${lastCameraError.message}`);
        }
        return;
      }
      if (!mountedRef.current || streamRef.current !== activePrimary) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const secondTrack = stream.getVideoTracks()[0];
      dualStreamRef.current = stream;
      setDualStream(stream);
      setDualUnavailable(false);
      setNotice(`Both cameras are active. The second feed is using ${selectedSecondaryProfile}; photos and recordings include both views.`);
      secondTrack.addEventListener("ended", () => {
        if (dualStreamRef.current === stream && mountedRef.current) {
          stopDualCamera();
          setNotice("The second camera disconnected. Single-camera capture is still available.");
        }
      }, { once: true });
    } catch (error) {
      setDualUnavailable(true);
      setCameraError(error instanceof Error
        ? `Dual camera is not supported by this browser or phone: ${error.message}`
        : "This phone or browser could not start both cameras at once.");
    } finally {
      if (mountedRef.current) setDualBusy(false);
    }
  }, [cameraBusy, cameraStream, dualBusy, facing, isRecording, stopDualCamera]);

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
      setCameraError("The camera is still starting. Try again in a moment.");
      return;
    }
    if (countdown !== null) return;
    if (dualStreamRef.current && (!dualVideoRef.current || dualVideoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)) {
      setCameraError("The second camera is still starting. Try again in a moment.");
      return;
    }
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
      // drawCover owns per-feed mirroring. Do not mirror the whole canvas here:
      // dual-camera composition must mirror each feed independently, exactly once.
      context.filter = look.css;
      const secondaryVideo = dualVideoRef.current;
      const activeSecondary = dualStreamRef.current;
      if (activeSecondary && secondaryVideo && secondaryVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (dualLayout === "split") {
          const half = canvas.width / 2;
          drawCover(context, video, 0, 0, half, canvas.height, facing === "user");
          const secondaryFacing = activeSecondary.getVideoTracks()[0]?.getSettings().facingMode;
          drawCover(context, secondaryVideo, half, 0, canvas.width - half, canvas.height, secondaryFacing === "user");
        } else {
          drawCover(context, video, 0, 0, canvas.width, canvas.height, facing === "user");
          const insetWidth = canvas.width * 0.32;
          const insetHeight = insetWidth * (secondaryVideo.videoHeight / secondaryVideo.videoWidth);
          const insetX = canvas.width - insetWidth - canvas.width * 0.035;
          const insetY = canvas.height - insetHeight - canvas.height * 0.035;
          const secondaryFacing = activeSecondary.getVideoTracks()[0]?.getSettings().facingMode;
          drawCover(context, secondaryVideo, insetX, insetY, insetWidth, insetHeight, secondaryFacing === "user");
          context.filter = "none";
          context.strokeStyle = "#ffffff";
          context.lineWidth = Math.max(2, canvas.width * 0.004);
          context.strokeRect(insetX, insetY, insetWidth, insetHeight);
        }
      } else {
        drawCover(context, video, 0, 0, canvas.width, canvas.height, facing === "user");
      }
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
  }, [addToGallery, cameraStream, countdown, dualLayout, facing, look.css, timerSeconds]);

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

  useEffect(() => {
    if (!isRecording || !cameraStream) return;
    const cameraTrack = cameraStream.getVideoTracks()[0];
    if (!cameraTrack) return;
    const finalizeOnCameraEnd = () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
          if (mountedRef.current) {
            setNotice("The camera connection ended. The current clip is being finalized where possible.");
          }
        } catch {
          if (mountedRef.current) {
            setCameraError("The camera connection ended and the clip could not be finalized. Check Recent captures.");
          }
        }
      }
    };
    cameraTrack.addEventListener("ended", finalizeOnCameraEnd);
    return () => cameraTrack.removeEventListener("ended", finalizeOnCameraEnd);
  }, [cameraStream, isRecording]);

  const startRecording = useCallback(async () => {
    const currentStream = streamRef.current;
    if (!currentStream || !currentStream.getVideoTracks().some((track) => track.readyState === "live")) {
      setCameraError("Turn on the camera before recording.");
      return;
    }
    if (dualBusy || (dualStreamRef.current && (!dualVideoRef.current || dualVideoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA))) {
      setCameraError("The second camera is still starting. Try again in a moment.");
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
      if (!currentStream.getVideoTracks().some((track) => track.readyState === "live")) {
        throw new Error("The camera stopped while microphone permission was being requested. Restart the camera and try again.");
      }

      const preview = videoRef.current;
      if (!preview || preview.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !preview.videoWidth || !preview.videoHeight) {
        throw new Error("The camera is still starting. Try recording again in a moment.");
      }
      if (typeof HTMLCanvasElement.prototype.captureStream !== "function") {
        throw new Error("Filtered video recording is not supported by this browser. Use the Natural look or a current Chrome, Edge or Safari browser.");
      }

      const recordingCanvas = document.createElement("canvas");
      recordingCanvas.width = preview.videoWidth;
      recordingCanvas.height = preview.videoHeight;
      const recordingContext = recordingCanvas.getContext("2d");
      if (!recordingContext) throw new Error("This device could not prepare the video recording.");

      const drawRecordingFrame = () => {
        if (!mountedRef.current && !recorderRef.current) return;
        if (preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          recordingContext.save();
          recordingContext.filter = look.css;
          const secondaryVideo = dualVideoRef.current;
          const activeSecondary = dualStreamRef.current;
          if (activeSecondary && secondaryVideo && secondaryVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            if (dualLayout === "split") {
              const half = recordingCanvas.width / 2;
              drawCover(recordingContext, preview, 0, 0, half, recordingCanvas.height, facing === "user");
              const secondaryFacing = activeSecondary.getVideoTracks()[0]?.getSettings().facingMode;
              drawCover(recordingContext, secondaryVideo, half, 0, recordingCanvas.width - half, recordingCanvas.height, secondaryFacing === "user");
            } else {
              drawCover(recordingContext, preview, 0, 0, recordingCanvas.width, recordingCanvas.height, facing === "user");
              const insetWidth = recordingCanvas.width * 0.32;
              const insetHeight = insetWidth * (secondaryVideo.videoHeight / secondaryVideo.videoWidth);
              const insetX = recordingCanvas.width - insetWidth - recordingCanvas.width * 0.035;
              const insetY = recordingCanvas.height - insetHeight - recordingCanvas.height * 0.035;
              const secondaryFacing = activeSecondary.getVideoTracks()[0]?.getSettings().facingMode;
              drawCover(recordingContext, secondaryVideo, insetX, insetY, insetWidth, insetHeight, secondaryFacing === "user");
              recordingContext.filter = "none";
              recordingContext.strokeStyle = "#ffffff";
              recordingContext.lineWidth = Math.max(2, recordingCanvas.width * 0.004);
              recordingContext.strokeRect(insetX, insetY, insetWidth, insetHeight);
            }
          } else {
            drawCover(recordingContext, preview, 0, 0, recordingCanvas.width, recordingCanvas.height, facing === "user");
          }
          recordingContext.restore();
        }
        recordingCanvasFrameRef.current = window.requestAnimationFrame(drawRecordingFrame);
      };

      drawRecordingFrame();
      const sourceFrameRate = currentStream.getVideoTracks()[0]?.getSettings().frameRate ?? frameRate;
      const outputFrameRate = Math.max(1, Math.min(frameRate, sourceFrameRate));
      const canvasStream = recordingCanvas.captureStream(outputFrameRate);
      recordingCanvasStreamRef.current = canvasStream;
      const tracks = [
        ...canvasStream.getVideoTracks(),
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
        if (recordingCanvasFrameRef.current !== null) window.cancelAnimationFrame(recordingCanvasFrameRef.current);
        recordingCanvasFrameRef.current = null;
        recordingCanvasStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingCanvasStreamRef.current = null;
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
      if (recordingCanvasFrameRef.current !== null) window.cancelAnimationFrame(recordingCanvasFrameRef.current);
      recordingCanvasFrameRef.current = null;
      recordingCanvasStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingCanvasStreamRef.current = null;
      microphone?.getTracks().forEach((track) => track.stop());
      microphoneRef.current = null;
      setCameraError(error instanceof Error ? error.message : "Video recording could not start on this device.");
    } finally {
      if (mountedRef.current) setCameraBusy(false);
    }
  }, [addToGallery, dualLayout, facing, frameRate, look.css]);

  const applyVideoQuality = useCallback(async (quality: VideoQuality, fps: FrameRate) => {
    const track = streamRef.current?.getVideoTracks()[0];
    setVideoQuality(quality);
    setFrameRate(fps);
    if (!track) return;
    const target = VIDEO_QUALITIES[quality];
    setCameraBusy(true);
    try {
      await track.applyConstraints({
        width: { ideal: target.width },
        height: { ideal: target.height },
        frameRate: { ideal: fps },
      });
      const actual = track.getSettings();
      setNotice(`Camera set to ${actual.width ?? target.width} × ${actual.height ?? target.height} at ${Math.round(actual.frameRate ?? fps)} fps where supported.`);
    } catch {
      setNotice("This camera could not apply that quality preset. It will keep the closest supported settings.");
    } finally {
      if (mountedRef.current) setCameraBusy(false);
    }
  }, []);

  const applyZoom = useCallback(async (value: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomRange) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as unknown as MediaTrackConstraintSet] });
      setZoomLevel(value);
    } catch {
      setZoomRange(null);
      setNotice("Hardware zoom control is unavailable on this camera.");
    }
  }, [zoomRange]);

  const applyExposure = useCallback(async (value: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !exposureRange) return;
    try {
      await track.applyConstraints({ advanced: [{ exposureCompensation: value } as unknown as MediaTrackConstraintSet] });
      setExposureValue(value);
    } catch {
      setExposureRange(null);
      setNotice("Exposure adjustment is unavailable on this camera.");
    }
  }, [exposureRange]);

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
    stopDualCamera();
    const previous = facing;
    const next = previous === "user" ? "environment" : "user";
    await requestCamera(next);
    if (streamRef.current === null && mountedRef.current) {
      setFacing(previous);
    }
  }, [facing, requestCamera, stopDualCamera]);

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
  const previewFilter = look.css;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-fg">Camera Studio</h2>
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
                    className={dualStream && dualLayout === "split" ? "absolute inset-y-0 left-0 h-full w-1/2 object-cover" : "absolute inset-0 size-full object-cover"}
                    style={{ filter: previewFilter, transform: facing === "user" ? "scaleX(-1)" : undefined }}
                  />
                  {dualStream && (
                    <video
                      ref={dualVideoRef}
                      autoPlay
                      playsInline
                      muted
                      aria-label="Second camera preview"
                      className={dualLayout === "split"
                        ? "absolute inset-y-0 right-0 h-full w-1/2 object-cover"
                        : "absolute bottom-3 right-3 aspect-[4/3] w-[32%] rounded-lg border-2 border-white object-cover shadow-lg"}
                    />
                  )}
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
                  {selectedLook !== "natural" && (
                    <span className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white">{look.label}</span>
                  )}
                </>
              ) : null}
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
                disabled={!cameraStream || cameraBusy || dualBusy || countdown !== null}
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
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">
              <span className="flex min-w-0 items-start gap-2">
                <X size={17} className="mt-0.5 shrink-0" />
                <span>{cameraError}</span>
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => void requestCamera(facing)}>
                Try again
              </Button>
            </div>
          )}
          {notice && !cameraError && (
            <p role="status" aria-live="polite" className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-muted">
              <Check size={16} className="mt-0.5 shrink-0 text-ok" /> {notice}
            </p>
          )}

          {showCameraInfo && (
            <div className="rounded-lg border border-border bg-surface p-3">
              <div className="mb-3 border-b border-border pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-fg">Dual camera</p>
                    <p className="mt-1 text-xs text-muted">Uses two separate camera devices when the phone and browser allow them to run together.</p>
                  </div>
                  {dualStream ? (
                    <Button type="button" size="sm" variant="outline" onClick={stopDualCamera} disabled={isRecording}>Turn off</Button>
                  ) : (
                    <Button type="button" size="sm" variant="outline" onClick={() => void startDualCamera()} disabled={!cameraStream || dualBusy || isRecording}>
                      {dualBusy ? "Starting…" : "Enable"}
                    </Button>
                  )}
                </div>
                {dualStream && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant={dualLayout === "pip" ? "default" : "outline"} onClick={() => setDualLayout("pip")} disabled={isRecording}>Picture in picture</Button>
                    <Button type="button" size="sm" variant={dualLayout === "split" ? "default" : "outline"} onClick={() => setDualLayout("split")} disabled={isRecording}>Split view</Button>
                  </div>
                )}
                {dualUnavailable && <p className="mt-2 text-xs text-muted">This device did not start a second camera. Normal camera capture remains available.</p>}
                {dualStream && <p className="mt-2 text-xs text-muted">Photos and videos are composited from both live camera feeds. The feeds are not duplicated or simulated.</p>}
              </div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg">Camera details</h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowCameraInfo(false)}>Close</Button>
              </div>
              {cameraSettings ? (
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-muted">Resolution</dt><dd className="font-medium text-fg">{cameraSettings.width ?? "—"} × {cameraSettings.height ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Frame rate</dt><dd className="font-medium text-fg">{cameraSettings.frameRate ? `${Math.round(cameraSettings.frameRate)} fps` : "Automatic"}</dd></div>
                  <div><dt className="text-xs text-muted">Camera</dt><dd className="font-medium text-fg">{facing === "user" ? "Front" : "Rear"}</dd></div>
                </dl>
              ) : (
                <p className="text-sm text-muted">Turn on the camera to view its current settings.</p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-muted">Available camera settings vary by device. Some phones may not support every resolution, frame rate, zoom or flash option.</p>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="camera-quality" className="mb-2 block text-sm font-medium text-fg">Video quality</label>
                  <select
                    id="camera-quality"
                    value={videoQuality}
                    onChange={(event) => void applyVideoQuality(event.currentTarget.value as VideoQuality, frameRate)}
                    disabled={cameraBusy || isRecording}
                    className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm text-fg disabled:opacity-50"
                  >
                    <option value="720p">720p HD</option>
                    <option value="1080p">1080p Full HD</option>
                    <option value="4k">4K (when supported)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="camera-frame-rate" className="mb-2 block text-sm font-medium text-fg">Frame rate</label>
                  <select
                    id="camera-frame-rate"
                    value={frameRate}
                    onChange={(event) => void applyVideoQuality(videoQuality, Number(event.currentTarget.value) as FrameRate)}
                    disabled={cameraBusy || isRecording}
                    className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm text-fg disabled:opacity-50"
                  >
                    <option value={24}>24 fps</option>
                    <option value={30}>30 fps</option>
                    <option value={60}>60 fps</option>
                  </select>
                </div>
              </div>
              {zoomRange && (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label htmlFor="camera-zoom" className="text-sm font-medium text-fg">Zoom</label>
                    <span className="text-xs tabular-nums text-muted">{zoomLevel.toFixed(1)}×</span>
                  </div>
                  <input
                    id="camera-zoom"
                    type="range"
                    min={zoomRange.min}
                    max={zoomRange.max}
                    step={zoomRange.step && zoomRange.step > 0 ? zoomRange.step : 0.1}
                    value={Math.min(zoomRange.max, Math.max(zoomRange.min, zoomLevel))}
                    onChange={(event) => void applyZoom(Number(event.currentTarget.value))}
                    disabled={!cameraStream || cameraBusy || isRecording}
                    className="h-2 w-full cursor-pointer accent-[var(--color-accent)] disabled:opacity-40"
                  />
                </div>
              )}

              {exposureRange && (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label htmlFor="camera-exposure" className="text-sm font-medium text-fg">Exposure</label>
                    <span className="text-xs tabular-nums text-muted">{exposureValue > 0 ? "+" : ""}{exposureValue.toFixed(1)}</span>
                  </div>
                  <input
                    id="camera-exposure"
                    type="range"
                    min={exposureRange.min}
                    max={exposureRange.max}
                    step={exposureRange.step && exposureRange.step > 0 ? exposureRange.step : 0.1}
                    value={Math.min(exposureRange.max, Math.max(exposureRange.min, exposureValue))}
                    onChange={(event) => void applyExposure(Number(event.currentTarget.value))}
                    disabled={!cameraStream || cameraBusy || isRecording}
                    className="h-2 w-full cursor-pointer accent-[var(--color-accent)] disabled:opacity-40"
                  />
                </div>
              )}

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
                  <span className="text-sm font-medium text-fg">Color filters</span>
                  <span className="text-xs text-muted">Optional</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {LOOKS.map((item) => (
                    <button key={item.id} type="button" aria-pressed={selectedLook === item.id} disabled={cameraBusy || countdown !== null || isRecording} onClick={() => setSelectedLook(item.id)} className={`min-h-10 rounded-md border px-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${selectedLook === item.id ? "border-accent bg-accent-soft text-fg" : "border-border bg-surface text-muted hover:bg-surface-2"}`}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>
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

    </div>
  );
}
