const SOCIAL_POST_HOSTS = Object.freeze({
  tiktok: ["tiktok.com"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.watch"],
  youtube: ["youtube.com", "youtu.be"],
  x: ["x.com", "twitter.com"],
  snapchat: ["snapchat.com"],
  threads: ["threads.net"],
  linkedin: ["linkedin.com"],
  reddit: ["reddit.com"],
  twitch: ["twitch.tv"],
  vimeo: ["vimeo.com"],
  dailymotion: ["dailymotion.com"],
});

/**
 * @param {string} host
 * @param {string} domain
 */
function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Accept only public-link URLs from supported social/video providers.
 * This is an input guard, not proof that a post is public or recordable.
 */
/** @param {string} rawValue */
export function resolveSocialPostUrl(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw || raw.length > 4096) {
    throw new Error("Paste a valid social-media post link.");
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That link is not a valid URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Only secure HTTPS post links are supported.");
  }
  if (url.username || url.password) {
    throw new Error("Links containing embedded login credentials are not accepted.");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Custom ports are not supported for post links.");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  let provider = null;
  for (const [name, domains] of Object.entries(SOCIAL_POST_HOSTS)) {
    if (domains.some((domain) => hostMatches(host, domain))) {
      provider = name;
      break;
    }
  }
  if (!provider) {
    throw new Error("This platform is not supported yet. Paste a link from TikTok, Instagram, Facebook, YouTube, X, Snapchat, Threads, LinkedIn, Reddit, Twitch, Vimeo, or Dailymotion.");
  }

  url.hash = "";
  return { url: url.toString(), provider };
}

export const SOCIAL_POST_PROVIDERS = Object.freeze(Object.keys(SOCIAL_POST_HOSTS));
