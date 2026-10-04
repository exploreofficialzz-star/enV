import { MediaJobController, detectMediaRuntimes } from "@/lib/media/media-runtime";
import { createServerMediaAdapter, getServerMediaConfig, isFfmpegConfigured } from "@/lib/media/media-backends";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { ResultPanel } from "@/components/engines/result-panel";
import { downloadBlob } from "@/lib/utils";
import { browserCodecSupport, getMediaCapabilities } from "@/lib/media-runtime";

type Props = { op: string };

type VideoInfo = {
  file: File;
  duration: number;
  width: number;
  height: number;
  mime: string;
};

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function ratioLabel(w: number, h: number) {
  if (!w || !h) return "—";
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

function pickRecorderMime() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((value) => MediaRecorder.isTypeSupported(value)) ?? "";
}

async function readVideo(file: File): Promise<VideoInfo> {
  if (!file.type.startsWith("video/") && !/\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i.test(file.name)) {
    throw new Error("Choose a video file.");
  }
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("The browser could not read this video."));
    });
    return { file, duration: video.duration, width: video.videoWidth, height: video.videoHeight, mime: file.type || "unknown" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function captureAudio(file: File, onProgress: (value: number) => void): Promise<{ blob: Blob; extension: string }> {
  const mime = pickRecorderMime();
  if (!mime) throw new Error("This browser does not support local audio recording from video. Try a Chromium-based browser.");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("The browser could not decode this video."));
    });
    const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream; webkitCaptureStream?: () => MediaStream }).captureStream
      ?? (video as HTMLVideoElement & { webkitCaptureStream?: () => MediaStream }).webkitCaptureStream;
    if (!capture) throw new Error("This browser does not expose a video capture stream.");
    const source = capture.call(video);
    const audioTracks = source.getAudioTracks();
    if (!audioTracks.length) throw new Error("This video does not contain an audio track.");
    const audioStream = new MediaStream(audioTracks);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(audioStream, { mimeType: mime });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const done = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("Audio extraction failed while recording the local stream."));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const timer = window.setInterval(() => onProgress(duration ? Math.min(100, (video.currentTime / duration) * 100) : 0), 150);
    recorder.start(250);
    await video.play();
    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
      video.onerror = () => resolve();
    });
    recorder.stop();
    await done;
    window.clearInterval(timer);
    onProgress(100);
    audioTracks.forEach((track) => track.stop());
    return { blob: new Blob(chunks, { type: mime }), extension: mime.startsWith("audio/ogg") ? "ogg" : "webm" };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}


function pickVideoRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((value) => MediaRecorder.isTypeSupported(value)) ?? "";
}

async function recordVideoSegment(file: File, start: number, end: number, playbackRate: number, videoBitsPerSecond?: number, onProgress?: (value: number) => void): Promise<Blob> {
  const mime = pickVideoRecorderMime();
  if (!mime) throw new Error("This browser does not support local video recording. Try a Chromium-based browser.");
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error("Enter a valid start and end time.");
  if (!Number.isFinite(playbackRate) || playbackRate <= 0 || playbackRate > 4) throw new Error("Playback speed must be between 0.25× and 4×.");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.preload = "auto";
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("The browser could not decode this video.")); });
    const actualStart = Math.max(0, Math.min(start, Math.max(0, video.duration - 0.02)));
    const actualEnd = Math.min(Math.max(actualStart + 0.05, end), video.duration);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable in this browser.");
    const canvasStream = canvas.captureStream(30);
    let audioContext: AudioContext | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let destination: MediaStreamAudioDestinationNode | null = null;
    try {
      audioContext = new AudioContext();
      source = audioContext.createMediaElementSource(video);
      destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      source.connect(audioContext.destination);
    } catch {
      audioContext = null;
      source = null;
      destination = null;
    }
    const tracks = [...canvasStream.getVideoTracks(), ...(destination?.stream.getAudioTracks() ?? [])];
    const stream = new MediaStream(tracks);
    const chunks: Blob[] = [];
    const options: MediaRecorderOptions = { mimeType: mime };
    if (videoBitsPerSecond) options.videoBitsPerSecond = videoBitsPerSecond;
    const recorder = new MediaRecorder(stream, options);
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const done = new Promise<void>((resolve, reject) => { recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error("Video recording failed.")); });
    const render = () => { if (!video.paused && !video.ended) { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); requestAnimationFrame(render); } };
    video.currentTime = actualStart;
    await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
    if (audioContext?.state === "suspended") await audioContext.resume();
    video.playbackRate = playbackRate;
    recorder.start(250);
    const expectedDuration = Math.max(0.05, (actualEnd - actualStart) / playbackRate);
    const timer = window.setInterval(() => {
      const progress = Math.min(100, Math.max(0, ((video.currentTime - actualStart) / Math.max(0.001, actualEnd - actualStart)) * 100));
      onProgress?.(progress);
      if (video.currentTime >= actualEnd - 0.02) {
        video.pause();
        if (recorder.state !== "inactive") recorder.stop();
      }
    }, 100);
    render();
    await video.play();
    await new Promise<void>((resolve) => { const check = () => { if (recorder.state === "inactive") resolve(); else window.setTimeout(check, 50); }; check(); });
    window.clearInterval(timer);
    await done;
    onProgress?.(100);
    tracks.forEach((track) => track.stop());
    if (audioContext) await audioContext.close().catch(() => undefined);
    if (!chunks.length) throw new Error("The browser produced no video output.");
    return new Blob(chunks, { type: mime });
  } finally {
    video.pause(); video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url);
  }
}

async function thumbnail(file: File, seconds: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.preload = "metadata";
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("The browser could not read this video."));
    });
    const target = Math.min(Math.max(0, seconds), Math.max(0, video.duration - 0.05));
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Could not seek to the requested frame."));
      video.currentTime = target;
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable in this browser.");
    ctx.drawImage(video, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the thumbnail.")), "image/jpeg", 0.9));
  } finally {
    URL.revokeObjectURL(url);
  }
}


async function loadVideo(file: File) {
  const url = URL.createObjectURL(file); const video = document.createElement("video"); video.preload = "metadata"; video.src = url;
  await new Promise<void>((resolve,reject)=>{video.onloadedmetadata=()=>resolve(); video.onerror=()=>reject(new Error("The browser could not read this video."));});
  return { video, url };
}

async function frameBlob(file: File, seconds: number, type: "image/png"|"image/jpeg" = "image/png"): Promise<Blob> {
  const {video,url}=await loadVideo(file);
  try { const t=Math.min(Math.max(0,seconds),Math.max(0,video.duration-0.02)); await new Promise<void>((resolve,reject)=>{video.onseeked=()=>resolve();video.onerror=()=>reject(new Error("Could not seek to the requested frame."));video.currentTime=t;}); const canvas=document.createElement("canvas"); canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas is unavailable in this browser.");ctx.drawImage(video,0,0);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not create the frame image.")),type,0.92)); }
  finally { video.removeAttribute("src");video.load();URL.revokeObjectURL(url); }
}

async function contactSheet(file: File, count = 9): Promise<Blob> {
  const {video,url}=await loadVideo(file);
  try { const cols=3,rows=Math.ceil(count/cols),cellW=480,cellH=270;const canvas=document.createElement("canvas");canvas.width=cols*cellW;canvas.height=rows*cellH;const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas is unavailable in this browser.");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);for(let i=0;i<count;i++){const t=video.duration*(i/(count-1||1));await new Promise<void>((resolve,reject)=>{video.onseeked=()=>resolve();video.onerror=()=>reject(new Error("Could not seek through the video."));video.currentTime=t;});const x=(i%cols)*cellW,y=Math.floor(i/cols)*cellH;ctx.drawImage(video,x,y,cellW,cellH);ctx.fillStyle="rgba(0,0,0,.7)";ctx.fillRect(x+8,y+8,92,26);ctx.fillStyle="#fff";ctx.font="14px sans-serif";ctx.fillText(formatDuration(t),x+16,y+26);}return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not create contact sheet.")),"image/jpeg",.88)); }
  finally {video.removeAttribute("src");video.load();URL.revokeObjectURL(url);}
}

const browserVideoMediaController = new MediaJobController([{
  kind: "browser",
  canHandle: (request) => ["video-trimmer", "video-speed", "video-compressor"].includes(request.operation),
  execute: async (request, signal, onProgress) => {
    const file = request.params?.file;
    if (!(file instanceof File)) throw new Error("A video file is required.");
    if (signal.aborted) throw new DOMException("Media job cancelled.", "AbortError");
    const start = Number(request.params?.start ?? 0);
    const end = Number(request.params?.end ?? 0);
    const rate = Number(request.params?.rate ?? 1);
    const bitrate = request.params?.bitrate === undefined ? undefined : Number(request.params.bitrate);
    return recordVideoSegment(file, start, end, rate, bitrate, onProgress);
  },
}]);

const serverVideoMediaController = new MediaJobController([createServerMediaAdapter()]);

export function VideoEngine({ op }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [replacementAudio, setReplacementAudio] = useState<File | null>(null);
  const [seconds, setSeconds] = useState("0");
  const [endSeconds, setEndSeconds] = useState(10);
  const [speed, setSpeed] = useState("1");
  const [width, setWidth] = useState("1280");
  const [height, setHeight] = useState("720");
  const [cropX, setCropX] = useState("0");
  const [cropY, setCropY] = useState("0");
  const [angle, setAngle] = useState("90");
  const [fps, setFps] = useState("30");
  const [videoBitrate, setVideoBitrate] = useState("2500");
  const [resolutionPreset, setResolutionPreset] = useState("720p");
  const [videoVolume, setVideoVolume] = useState("100");
  const [results, setResults] = useState<{ label: string; value: string; primary?: boolean; hint?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const title = useMemo(() => ({
    "extract-audio": "Extract Audio from Video", "video-trimmer": "Video Trimmer", "video-speed": "Video Speed Changer", "video-compressor": "Browser Video Compressor", "video-to-mp4": "Video to MP4", "video-to-mp3": "Video to MP3", "video-to-gif": "Video to GIF", "video-to-webm": "Video to WebM", "video-to-mov": "Video to MOV", "video-to-avi": "Video to AVI", "video-resize": "Video Resizer", "video-crop": "Video Cropper", "video-rotate": "Video Rotator", "video-mute": "Mute Video", "video-fps": "Video Frame Rate Converter", "video-bitrate": "Video Bitrate Converter", "video-merger": "Video Merger", "video-audio-replacer": "Replace Video Audio", thumbnail: "Video Thumbnail Extractor", "frame-png": "Video Frame to PNG", "frame-grid": "Video Frame Contact Sheet", "metadata-json": "Video Metadata JSON", "frame-percent": "Video Frame by Percentage", "bitrate-estimator": "Video Bitrate Estimator", "audio-track-check": "Video Audio Track Checker",
  } as Record<string,string>)[op] ?? "Video File Inspector", [op]);
  const needsFile = true;

  const run = async () => {
    try {
      setError(null); setResults([]); setBusy(true); setProgress(0);
      const capabilityOnly = ["media-capability-checker", "media-runtime-inspector", "ffmpeg-runtime-checker", "media-backend-checker", "webcodecs-video-checker", "mediarecorder-support-checker", "video-codec-support-checker", "media-worker-support-checker"].includes(op);
      if (!capabilityOnly && needsFile && !file) throw new Error("Choose a video file first.");
      if (!capabilityOnly && !file) return;
      if (op === "media-runtime-inspector") {
        const runtimes = detectMediaRuntimes();
        setResults(runtimes.map((item) => ({ label: item.kind === "browser" ? "Browser" : item.kind === "native" ? "Native Android/iOS bridge" : "Server", value: item.available ? "Available" : "Unavailable", primary: item.available, hint: item.reason })));
        setResults((current) => [...current, { label: "FFmpeg adapter", value: isFfmpegConfigured() ? "Configured" : "Not configured", primary: isFfmpegConfigured(), hint: "FFmpeg conversion tools only activate when a real FFmpeg runner is configured." }]);
      } else if (op === "ffmpeg-runtime-checker") {
        const configured = isFfmpegConfigured();
        setResults([{ label: "FFmpeg processing runtime", value: configured ? "Configured" : "Not configured", primary: configured, hint: configured ? "A real FFmpeg runner has been registered." : "No FFmpeg runner is registered; conversion is not falsely enabled." }]);
      } else if (op === "media-backend-checker") {
        const config = getServerMediaConfig();
        setResults([{ label: "Media processing backend", value: config.configured ? "Configured" : "Not configured", primary: config.configured, hint: config.configured ? "The VITE_MEDIA_PROCESSOR_URL endpoint is configured." : "No server media-processing endpoint is configured." }]);
      } else if (op === "media-capability-checker") {
        const caps = getMediaCapabilities();
        setResults(caps.map((item) => ({ label: item.label, value: item.supported ? "Supported" : "Not supported", primary: item.supported, hint: item.detail })));
      } else if (op === "webcodecs-video-checker") {
        const caps = getMediaCapabilities().filter((item) => item.label === "WebCodecs video");
        setResults(caps.map((item) => ({ label: item.label, value: item.supported ? "Supported" : "Not supported", primary: item.supported, hint: item.detail })));
      } else if (op === "mediarecorder-support-checker" || op === "video-codec-support-checker") {
        const codecs = browserCodecSupport();
        setResults(codecs.map((item) => ({ label: item.type, value: item.supported ? "Supported" : "Not supported", primary: item.supported, hint: item.mime })));
      } else if (op === "media-worker-support-checker") {
        const caps = getMediaCapabilities().filter((item) => item.label === "Web Workers" || item.label === "OffscreenCanvas");
        setResults(caps.map((item) => ({ label: item.label, value: item.supported ? "Supported" : "Not supported", primary: item.supported, hint: item.detail })));
      } else {
        if (!file) throw new Error("Choose a video file first.");
        if (op === "video-trimmer") {
        const info = await readVideo(file); const start = Number(seconds); const end = Number(endSeconds); if (end > info.duration) throw new Error(`End time cannot exceed ${info.duration.toFixed(2)} seconds.`); const job = await browserVideoMediaController.run({ toolId: op, operation: "video-trimmer", params: { file, start, end } }); const blob = job.blob; downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, "")}-trim.webm`); setResults([{label:"Trimmed video",value:`${(blob.size/1024/1024).toFixed(2)} MB`,primary:true,hint:"Exported as browser-native WebM; the original file is not modified."}]);
      } else if (op === "video-speed") {
        const info = await readVideo(file); const rate = Number(speed); const job = await browserVideoMediaController.run({ toolId: op, operation: "video-speed", params: { file, start: 0, end: info.duration, rate } }); const blob = job.blob; downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, "")}-${rate}x.webm`); setResults([{label:"Speed-adjusted video",value:`${(blob.size/1024/1024).toFixed(2)} MB`,primary:true,hint:`Playback speed ${rate}× · exported as browser-native WebM.`}]);
      } else if (op === "video-compressor") {
        const info = await readVideo(file); const target = Math.max(150_000, Math.min(4_000_000, Number(file.size * 8 / Math.max(info.duration, 1) * 0.45))); const job = await browserVideoMediaController.run({ toolId: op, operation: "video-compressor", params: { file, start: 0, end: info.duration, rate: 1, bitrate: target } }); const blob = job.blob; setResults([{label:"Compressed video",value:`${(blob.size/1024/1024).toFixed(2)} MB`,primary:true,hint:`Browser-native WebM re-encode at approximately ${(target/1000).toFixed(0)} kbps video bitrate. Results vary by browser and source.`}]);
      } else if (op === "video-merger") {
        if (files.length < 2) throw new Error("Choose at least two video files.");
        const job = await serverVideoMediaController.run({ toolId: op, operation: "server-media:video-merge", params: { inputs: files, fileNames: files.map((item) => item.name), outputName: "env-merged-video.mp4" } });
        downloadBlob(job.blob, "env-merged-video.mp4");
        setResults([{ label: "Merged video", value: `${(job.blob.size / 1024 / 1024).toFixed(2)} MB`, primary: true, hint: "Merged by the configured enV FFmpeg media processor." }]);
      } else if (op === "video-audio-replacer") {
        if (!file) throw new Error("Choose a video file first.");
        if (!replacementAudio) throw new Error("Choose a replacement audio file.");
        const job = await serverVideoMediaController.run({ toolId: op, operation: "server-media:video-replace-audio", params: { inputs: [file, replacementAudio], fileNames: [file.name, replacementAudio.name], outputName: `${file.name.replace(/\.[^.]+$/, "")}-new-audio.mp4` } });
        downloadBlob(job.blob, `${file.name.replace(/\.[^.]+$/, "")}-new-audio.mp4`);
        setResults([{ label: "Video with replacement audio", value: `${(job.blob.size / 1024 / 1024).toFixed(2)} MB`, primary: true, hint: "Video stream preserved where possible; audio replaced by the configured enV FFmpeg media processor." }]);
      } else if (["video-to-mp4","video-to-mp3","video-to-gif","video-to-webm","video-to-mov","video-to-avi","video-resize","video-crop","video-rotate","video-mute","video-fps","video-bitrate","video-resolution-presets","video-audio-volume"].includes(op)) {
        const extension = ({"video-to-mp4":"mp4","video-to-mp3":"mp3","video-to-gif":"gif","video-to-webm":"webm","video-to-mov":"mov","video-to-avi":"avi","video-resize":"mp4","video-crop":"mp4","video-rotate":"mp4","video-mute":"mp4","video-fps":"mp4","video-bitrate":"mp4","video-resolution-presets":"mp4","video-audio-volume":"mp4"} as Record<string,string>)[op];
        const label = ({"video-to-mp4":"MP4 video","video-to-mp3":"MP3 audio","video-to-gif":"Animated GIF","video-to-webm":"WebM video","video-to-mov":"MOV video","video-to-avi":"AVI video","video-resize":"Resized video","video-crop":"Cropped video","video-rotate":"Rotated video","video-mute":"Muted video","video-fps":"Frame-rate converted video","video-bitrate":"Bitrate converted video","video-resolution-presets":"Resolution-adjusted video","video-audio-volume":"Volume-adjusted video"} as Record<string,string>)[op];
        const params = { input: file, fileName: file.name, outputName: `${file.name.replace(/\.[^.]+$/, "")}.${extension}`, width: Number(width), height: Number(height), x: Number(cropX), y: Number(cropY), angle, fps: Number(fps), bitrate: Number(videoBitrate), preset: resolutionPreset, volume: Number(videoVolume) };
        const job = await serverVideoMediaController.run({ toolId: op, operation: `server-media:${op}`, params });
        downloadBlob(job.blob, `${file.name.replace(/\.[^.]+$/, "")}.${extension}`);
        setResults([{ label, value: `${(job.blob.size / 1024 / 1024).toFixed(2)} MB`, primary: true, hint: "Processed by the configured enV FFmpeg media processor." }]);
      } else if (op === "frame-png") { const image=await frameBlob(file, Number(seconds), "image/png"); downloadBlob(image, `${file.name.replace(/\.[^.]+$/, "")}-frame.png`); setResults([{label:"PNG frame",value:`${(image.size/1024).toFixed(0)} KB`,primary:true}]);
      } else if (op === "frame-percent") { const info=await readVideo(file); const pct=Number(seconds); if(!Number.isFinite(pct)||pct<0||pct>100) throw new Error("Enter a percentage from 0 to 100."); const image=await frameBlob(file, info.duration*pct/100); downloadBlob(image, `${file.name.replace(/\.[^.]+$/, "")}-${pct.toFixed(0)}pct.jpg`); setResults([{label:"Frame captured",value:`${pct.toFixed(1)}% · ${formatDuration(info.duration*pct/100)}`,primary:true}]);
      } else if (op === "frame-grid") { const image=await contactSheet(file,9); downloadBlob(image, `${file.name.replace(/\.[^.]+$/, "")}-contact-sheet.jpg`); setResults([{label:"Contact sheet",value:`${(image.size/1024).toFixed(0)} KB · 9 frames`,primary:true}]);
      } else if (op === "metadata-json") { const info=await readVideo(file); const payload={name:file.name,type:file.type||"unknown",size:file.size,duration:info.duration,width:info.width,height:info.height,aspectRatio:ratioLabel(info.width,info.height),lastModified:new Date(file.lastModified).toISOString()}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}); downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, "")}-metadata.json`); setResults([{label:"Metadata JSON",value:`${(blob.size/1024).toFixed(1)} KB`,primary:true}]);
      } else if (op === "bitrate-estimator") { const info=await readVideo(file); if(!info.duration) throw new Error("The video duration is unavailable."); const kbps=(file.size*8/info.duration)/1000; setResults([{label:"Estimated average bitrate",value:`${kbps.toFixed(0)} kbps`,primary:true,hint:"Estimated from file size ÷ playable duration; container overhead and VBR are included in the average."}]);
      } else if (op === "audio-track-check") { const url=URL.createObjectURL(file); try { const v=document.createElement("video");v.src=url;v.preload="metadata";await new Promise<void>((resolve,reject)=>{v.onloadedmetadata=()=>resolve();v.onerror=()=>reject(new Error("The browser could not inspect this video."));}); const stream=(v as HTMLVideoElement & {captureStream?:()=>MediaStream;webkitCaptureStream?:()=>MediaStream}).captureStream?.() ?? (v as HTMLVideoElement & {webkitCaptureStream?:()=>MediaStream}).webkitCaptureStream?.(); const count=stream?.getAudioTracks().length ?? 0; setResults([{label:"Audio track",value:count?"Detected":"No audio track detected",primary:true,hint:count?`${count} audio track${count===1?"":"s"} exposed by the browser.`:"Some codecs/browsers may not expose tracks even when a container contains audio."}]); stream?.getTracks().forEach(t=>t.stop());} finally {URL.revokeObjectURL(url);}
      } else if (op === "extract-audio") {
        const output = await captureAudio(file, setProgress);
        downloadBlob(output.blob, `${file.name.replace(/\.[^.]+$/, "")}.${output.extension}`);
        setResults([{ label: "Audio extracted", value: `${(output.blob.size / 1024 / 1024).toFixed(2)} MB`, primary: true, hint: `Browser-native ${output.extension.toUpperCase()} audio. MP3 export needs a dedicated encoder.` }]);
      } else if (op === "thumbnail") {
        const at = Number(seconds);
        if (!Number.isFinite(at) || at < 0) throw new Error("Enter a valid timestamp in seconds.");
        const image = await thumbnail(file, at);
        downloadBlob(image, `${file.name.replace(/\.[^.]+$/, "")}-thumbnail.jpg`);
        setResults([{ label: "Thumbnail", value: `${(image.size / 1024).toFixed(0)} KB`, primary: true, hint: `Captured at approximately ${at.toFixed(2)} seconds.` }]);
      } else {
        const info = await readVideo(file);
        const mb = file.size / 1024 / 1024;
        const items = [
          { label: "Duration", value: formatDuration(info.duration), primary: true },
          { label: "Dimensions", value: `${info.width} × ${info.height}` },
          { label: "Aspect ratio", value: ratioLabel(info.width, info.height) },
          { label: "File size", value: `${mb.toFixed(2)} MB` },
          { label: "MIME type", value: info.mime },
        ];
        if (op === "duration") setResults([items[0]]);
        else if (op === "dimensions") setResults([items[1], items[2]]);
        else if (op === "aspect-ratio") setResults([items[2], items[1]]);
        else setResults(items);
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : "The video operation failed."); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-subtle">Process the selected video locally in your browser. Files are not uploaded by this tool.</p>
    </div>
    {!["media-capability-checker","webcodecs-video-checker","mediarecorder-support-checker","video-codec-support-checker","media-worker-support-checker"].includes(op) ? (op === "video-merger" ? <input className="block w-full rounded-lg border border-border bg-surface p-2 text-sm" type="file" multiple accept="video/*,.mp4,.webm,.mov,.m4v,.ogv" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /> : <input className="block w-full rounded-lg border border-border bg-surface p-2 text-sm" type="file" accept="video/*,.mp4,.webm,.mov,.m4v,.ogv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />) : null}
    {(["video-to-mp4","video-to-mp3","video-to-gif","video-to-webm","video-to-mov","video-to-avi","video-resize","video-crop","video-rotate","video-mute","video-fps","video-bitrate","video-resolution-presets","video-audio-volume","video-merger","video-audio-replacer"].includes(op)) ? <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm"><strong>FFmpeg media processor required</strong><p className="mt-1 text-subtle">This conversion uses the enV server media processor. Your file is uploaded to that configured endpoint for conversion.</p></div> : null}
    {op === "video-audio-replacer" ? <input className="block w-full rounded-lg border border-border bg-surface p-2 text-sm" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm" onChange={(e) => setReplacementAudio(e.target.files?.[0] ?? null)} /> : null}
    {op === "video-resize" ? <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Width<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="2" value={width} onChange={(e)=>setWidth(e.target.value)} /></label><label className="block text-sm">Height<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="2" value={height} onChange={(e)=>setHeight(e.target.value)} /></label></div> : null}
    {op === "video-crop" ? <div className="grid gap-3 sm:grid-cols-4"><label className="block text-sm">Width<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="2" value={width} onChange={(e)=>setWidth(e.target.value)} /></label><label className="block text-sm">Height<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="2" value={height} onChange={(e)=>setHeight(e.target.value)} /></label><label className="block text-sm">X<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="0" value={cropX} onChange={(e)=>setCropX(e.target.value)} /></label><label className="block text-sm">Y<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="0" value={cropY} onChange={(e)=>setCropY(e.target.value)} /></label></div> : null}
    {op === "video-rotate" ? <label className="block text-sm">Rotation<select className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" value={angle} onChange={(e)=>setAngle(e.target.value)}><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select></label> : null}
    {op === "video-fps" ? <label className="block text-sm">Frame rate (FPS)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="1" max="120" value={fps} onChange={(e)=>setFps(e.target.value)} /></label> : null}
    {op === "video-resolution-presets" ? <label className="block text-sm">Resolution preset<select className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" value={resolutionPreset} onChange={(e)=>setResolutionPreset(e.target.value)}><option value="360p">360p</option><option value="480p">480p</option><option value="720p">720p</option><option value="1080p">1080p</option><option value="1440p">1440p</option><option value="2160p">2160p (4K)</option></select></label> : null}
    {op === "video-audio-volume" ? <label className="block text-sm">Audio volume (%)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="0" max="500" value={videoVolume} onChange={(e)=>setVideoVolume(e.target.value)} /></label> : null}
    {op === "video-bitrate" ? <label className="block text-sm">Video bitrate (kbps)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="100" max="50000" value={videoBitrate} onChange={(e)=>setVideoBitrate(e.target.value)} /></label> : null}
    {op === "video-trimmer" ? <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Start time (seconds)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="0" step="0.1" value={seconds} onChange={(e) => setSeconds(e.target.value)} /></label><label className="block text-sm">End time (seconds)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="0.1" step="0.1" value={endSeconds} onChange={(e) => setEndSeconds(Number(e.target.value))} /></label></div> : op === "video-speed" ? <label className="block text-sm">Playback speed<select className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" value={speed} onChange={(e) => setSpeed(e.target.value)}><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option></select></label> : op === "thumbnail" ? <label className="block text-sm">Frame time (seconds)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="0" step="0.1" value={seconds} onChange={(e) => setSeconds(e.target.value)} /></label> : null}
    {busy && ["extract-audio","video-trimmer","video-speed","video-compressor","video-to-mp4","video-to-mp3","video-to-gif","video-to-webm","video-to-mov","video-to-avi","video-resize","video-crop","video-rotate","video-mute","video-fps","video-bitrate"].includes(op) ? <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} /></div> : null}
    <div className="flex gap-2"><Button type="button" disabled={busy} onClick={() => void run()}>{busy ? "Processing…" : "Run tool"}</Button><Button type="button" variant="ghost" onClick={() => { setFile(null); setResults([]); setError(null); }}>Reset</Button></div>
    <ErrorBanner message={error}/>
    {results.length ? <ResultPanel items={results} filename={`env-${op}.txt`} /> : null}
  </div>;
}
