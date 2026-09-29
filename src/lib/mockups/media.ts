import type { MediaAsset } from "./schema.ts";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function dataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the uploaded media."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function waveformFromBuffer(buffer: AudioBuffer, points = 72) {
  const channel = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(channel.length / points));
  const output: number[] = [];
  for (let i = 0; i < points; i++) {
    const start = i * step;
    const end = Math.min(channel.length, start + step);
    let peak = 0;
    for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(channel[j]));
    output.push(Number(peak.toFixed(4)));
  }
  const max = Math.max(...output, 1);
  return output.map((v) => Number((v / max).toFixed(4)));
}

export async function fileToMediaAsset(file: File, kind?: MediaAsset["kind"]): Promise<MediaAsset> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Mockup media is limited to 10MB per file.");
  const mime = file.type || "application/octet-stream";
  if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(mime) && !/^audio\//.test(mime) && !/^video\//.test(mime)) {
    throw new Error("Only image, audio, and video media are supported in Mockups uploads.");
  }
  const url = await dataUrl(file);
  const inferred: MediaAsset["kind"] = kind ?? (mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "image");
  const asset: MediaAsset = { id: crypto.randomUUID(), kind: inferred, name: file.name, mimeType: mime, url, source: "upload", objectFit: "cover", scale: 1 };
  if (inferred === "image" || inferred === "gif") {
    const image = new Image();
    image.src = url;
    await image.decode();
    asset.width = image.naturalWidth; asset.height = image.naturalHeight;
    asset.thumbnailUrl = url;
  }
  if (inferred === "video") {
    const video = document.createElement("video");
    video.preload = "metadata"; video.muted = true; video.playsInline = true; video.src = url;
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("The browser could not read this video.")); });
    asset.width = video.videoWidth; asset.height = video.videoHeight; asset.durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined;
    try {
      video.currentTime = Math.min(0.1, Math.max(0, video.duration || 0));
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); setTimeout(resolve, 250); });
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, video.videoWidth); canvas.height = Math.max(1, video.videoHeight);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      asset.thumbnailUrl = canvas.toDataURL("image/jpeg", 0.82);
    } catch { /* thumbnail is optional when browser decoding does not permit capture */ }
    URL.revokeObjectURL(video.src);
  }
  if (inferred === "audio") {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      const ctx = new AudioContextCtor();
      try {
        const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
        asset.durationMs = Math.round(buffer.duration * 1000);
        asset.waveform = waveformFromBuffer(buffer);
      } finally { await ctx.close(); }
    }
  }
  return asset;
}
