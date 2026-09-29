export const PROVIDERS = {
  youtube: ["youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"],
  tiktok: ["tiktok.com", "m.tiktok.com", "vm.tiktok.com"],
  facebook: ["facebook.com", "m.facebook.com", "fb.watch"],
  instagram: ["instagram.com"],
  x: ["x.com", "twitter.com"],
};
const PROVIDER_BY_HOST = new Map(
  Object.entries(PROVIDERS).flatMap(([provider, hosts]) => hosts.map((host) => [host, provider])),
);

export function detectProvider(url) {
  return PROVIDER_BY_HOST.get(url.hostname.toLowerCase()) || "generic";
}

function audioAdapter(format) {
  if (format === "mp3") return { formatArg: "bestaudio/best", post: ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "192K"] };
  if (format === "m4a") return { formatArg: "bestaudio[ext=m4a]/bestaudio", post: [] };
  return { formatArg: "bestaudio/best", post: [] };
}

function videoAdapter(format, provider) {
  if (format === "mp4") {
    const preferred = provider === "youtube"
      ? "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
      : "best[ext=mp4]/best";
    return { formatArg: preferred, post: [] };
  }
  if (format === "webm") return { formatArg: provider === "youtube" ? "bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/best" : "best[ext=webm]/best", post: [] };
  return { formatArg: "best", post: [] };
}

export function createProviderAdapter(provider, format, audioOnly) {
  if (audioOnly) return audioAdapter(format);
  return videoAdapter(format, provider);
}

export function supportsProvider(provider) {
  return provider === "generic" || Object.prototype.hasOwnProperty.call(PROVIDERS, provider);
}
