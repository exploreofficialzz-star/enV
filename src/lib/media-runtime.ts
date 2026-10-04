export type MediaCapability = { label: string; supported: boolean; detail: string };

function support(label: string, supported: boolean, detail: string): MediaCapability {
  return { label, supported, detail };
}

export function getMediaCapabilities(): MediaCapability[] {
  if (typeof window === "undefined") return [];
  const w = window as typeof window & {
    VideoDecoder?: unknown;
    VideoEncoder?: unknown;
    AudioDecoder?: unknown;
    AudioEncoder?: unknown;
    OffscreenCanvas?: unknown;
    MediaRecorder?: typeof MediaRecorder;
  };
  const recorder = typeof MediaRecorder !== "undefined";
  const capture = typeof HTMLMediaElement !== "undefined" &&
    ("captureStream" in HTMLMediaElement.prototype || "webkitCaptureStream" in HTMLMediaElement.prototype);
  const audio = typeof AudioContext !== "undefined" || "webkitAudioContext" in w;
  const webCodecsVideo = !!w.VideoDecoder && !!w.VideoEncoder;
  const webCodecsAudio = !!w.AudioDecoder && !!w.AudioEncoder;
  const offscreen = "OffscreenCanvas" in w;
  const workers = typeof Worker !== "undefined";
  return [
    support("MediaRecorder", recorder, recorder ? "Browser can record supported media streams." : "MediaRecorder is unavailable."),
    support("Video captureStream", capture, capture ? "A video element can expose a MediaStream in this browser." : "captureStream is unavailable."),
    support("Web Audio", audio, audio ? "AudioContext is available for local decoding and processing." : "Web Audio is unavailable."),
    support("WebCodecs video", webCodecsVideo, webCodecsVideo ? "VideoEncoder and VideoDecoder are available." : "WebCodecs video APIs are unavailable."),
    support("WebCodecs audio", webCodecsAudio, webCodecsAudio ? "AudioEncoder and AudioDecoder are available." : "WebCodecs audio APIs are unavailable."),
    support("OffscreenCanvas", offscreen, offscreen ? "Canvas processing can move off the main UI thread." : "OffscreenCanvas is unavailable."),
    support("Web Workers", workers, workers ? "Background JavaScript workers are available." : "Web Workers are unavailable."),
    support("File System Access API", "showSaveFilePicker" in w, "showSaveFilePicker" in w ? "Direct local file saving is available." : "Direct file saving is unavailable; downloads use browser storage/downloads."),
  ];
}

export function browserCodecSupport(): { type: string; mime: string; supported: boolean }[] {
  if (typeof MediaRecorder === "undefined") return [];
  const candidates = [
    ["WebM VP9 + Opus", "video/webm;codecs=vp9,opus"],
    ["WebM VP8 + Opus", "video/webm;codecs=vp8,opus"],
    ["WebM Opus audio", "audio/webm;codecs=opus"],
    ["Ogg Opus audio", "audio/ogg;codecs=opus"],
    ["MP4 H.264 + AAC", "video/mp4;codecs=avc1.42E01E,mp4a.40.2"],
  ] as const;
  return candidates.map(([type, mime]) => ({ type, mime, supported: MediaRecorder.isTypeSupported(mime) }));
}
