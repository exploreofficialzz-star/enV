import path from "node:path";

export const PROVIDERS = {
  youtube: ["youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com", "youtube-nocookie.com"],
  tiktok: ["tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  facebook: ["facebook.com", "m.facebook.com", "fb.watch"],
  instagram: ["instagram.com"],
  x: ["x.com", "twitter.com"],
  audiomack: ["audiomack.com"],
  soundcloud: ["soundcloud.com", "on.soundcloud.com"],
  bandcamp: ["bandcamp.com"],
  mixcloud: ["mixcloud.com"],
  audius: ["audius.co"],
  jamendo: ["jamendo.com"],
  hearthis: ["hearthis.at"],
  bandlab: ["bandlab.com"],
  boomplay: ["boomplay.com"],
  zingmp3: ["zingmp3.vn"],
  netease: ["music.163.com"],
  "yandex-music": ["music.yandex.com", "music.yandex.ru"],
  archive: ["archive.org"],
  audioboom: ["audioboom.com"],
  reverbnation: ["reverbnation.com"],
  soundclick: ["soundclick.com"],
  spreaker: ["spreaker.com"],
  podomatic: ["podomatic.com"],
  freesound: ["freesound.org"],
};
const PROVIDER_BY_HOST = new Map(
  Object.entries(PROVIDERS).flatMap(([provider, hosts]) => hosts.map((host) => [host, provider])),
);

export function detectProvider(url) {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const exact = PROVIDER_BY_HOST.get(hostname);
  if (exact) return exact;
  for (const [provider, hosts] of Object.entries(PROVIDERS)) {
    if (hosts.some((host) => hostname.endsWith("." + host))) return provider;
  }
  return "generic";
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
  if (audioOnly) {
    const adapter = audioAdapter(format);
    return { ...adapter, post: [...adapter.post, "--embed-metadata"] };
  }
  return videoAdapter(format, provider);
}

export function supportsProvider(provider) {
  return provider === "generic" || Object.prototype.hasOwnProperty.call(PROVIDERS, provider);
}

export function createProviderRequestArgs(provider, env = process.env) {
  if (!provider || provider === "generic") return [];
  const cookieFile = env[`URL_MEDIA_${provider.toUpperCase()}_COOKIES_FILE`]?.trim();
  const args = cookieFile ? ["--cookies", path.resolve(cookieFile)] : [];
  if (provider === "tiktok") args.push("--impersonate", "chrome");
  return args;
}
