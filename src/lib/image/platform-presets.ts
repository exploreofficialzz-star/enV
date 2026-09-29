import type { PlatformPlacementSpec } from "./types.ts";

const SOURCES: Record<string, string> = {
  youtube: "https://support.google.com/youtube/answer/10456525",
  twitch: "https://help.twitch.tv/s/article/profile-settings",
  linkedin: "https://www.linkedin.com/help/linkedin/answer/a1357804",
  discord: "https://support.discord.com/hc/en-us/articles/4403147417623-Custom-Profiles",
  pinterest: "https://business.pinterest.com/creative-best-practices/",
  tiktok: "https://ads.tiktok.com/business/creativecenter/inspiration/topads",
  meta: "https://www.facebook.com/business/m/1-2-creative-guidance",
  instagram: "https://help.instagram.com/1631821640426723",
  facebook: "https://www.facebook.com/business/help",
  x: "https://help.x.com/en/using-x",
  reddit: "https://support.reddithelp.com/",
  snapchat: "https://forbusiness.snapchat.com/",
  threads: "https://help.instagram.com/",
};

const DIMENSIONS: Record<string, Record<string, [number, number]>> = {
  instagram: { image: [1080, 1080], profile: [320, 320], banner: [1080, 566], post: [1080, 1080], story: [1080, 1920], thumbnail: [1080, 1080], cover: [1080, 566], square: [1080, 1080], portrait: [1080, 1350], landscape: [1080, 566] },
  tiktok: { image: [1080, 1920], profile: [200, 200], banner: [1080, 1920], post: [1080, 1920], story: [1080, 1920], thumbnail: [1080, 1920], cover: [1080, 1920], square: [1080, 1080], portrait: [1080, 1350], landscape: [1920, 1080] },
  youtube: { image: [1280, 720], profile: [800, 800], banner: [2560, 1440], post: [1280, 720], story: [1080, 1920], thumbnail: [1280, 720], cover: [2560, 1440], square: [1080, 1080], portrait: [1080, 1350], landscape: [1280, 720] },
  facebook: { image: [1200, 630], profile: [320, 320], banner: [1640, 856], post: [1200, 630], story: [1080, 1920], thumbnail: [1200, 630], cover: [1640, 856], square: [1080, 1080], portrait: [1080, 1350], landscape: [1200, 630] },
  x: { image: [1600, 900], profile: [400, 400], banner: [1500, 500], post: [1600, 900], story: [1080, 1920], thumbnail: [1600, 900], cover: [1500, 500], square: [1080, 1080], portrait: [1080, 1350], landscape: [1600, 900] },
  linkedin: { image: [1200, 627], profile: [400, 400], banner: [1584, 396], post: [1200, 627], story: [1080, 1920], thumbnail: [1200, 627], cover: [1584, 396], square: [1080, 1080], portrait: [1080, 1350], landscape: [1200, 627] },
  pinterest: { image: [1000, 1500], profile: [165, 165], post: [1000, 1500], story: [1080, 1920], thumbnail: [1000, 1500], cover: [1000, 1500], square: [1000, 1000], portrait: [1000, 1500], landscape: [1000, 1000] },
  snapchat: { image: [1080, 1920], profile: [320, 320], post: [1080, 1920], story: [1080, 1920], cover: [1080, 1920], square: [1080, 1080], portrait: [1080, 1350], landscape: [1920, 1080] },
  threads: { image: [1080, 1350], profile: [320, 320], post: [1080, 1350], story: [1080, 1920], cover: [1080, 1350], square: [1080, 1080], portrait: [1080, 1350], landscape: [1920, 1080] },
  discord: { image: [1280, 720], profile: [512, 512], banner: [960, 540], post: [1280, 720], story: [1080, 1920], cover: [960, 540], square: [1080, 1080], portrait: [1080, 1350], landscape: [1280, 720] },
  reddit: { image: [1200, 628], profile: [256, 256], post: [1200, 628], thumbnail: [400, 400], cover: [1920, 384], square: [1080, 1080], portrait: [1080, 1350], landscape: [1200, 628] },
  twitch: { image: [1920, 1080], profile: [256, 256], banner: [1200, 480], post: [1920, 1080], thumbnail: [1280, 720], cover: [1200, 480], square: [1080, 1080], portrait: [1080, 1350], landscape: [1920, 1080] },
};

const SAFE_AREAS: Record<string, { width: number; height: number }> = {
  youtube: { width: 1235, height: 338 },
};

export const PLATFORM_PRESETS: PlatformPlacementSpec[] = Object.entries(DIMENSIONS).flatMap(([platform, placements]) => Object.entries(placements).map(([contentType, [width, height]]) => {
  const safe = SAFE_AREAS[platform];
  return {
    platform,
    contentType,
    version: "2026-09",
    sourceUrl: SOURCES[platform],
    lastVerified: "2026-09-29",
    dimensions: { width, height },
    aspectRatio: ratio(width, height),
    allowedFormats: ["JPG", "PNG", "WebP"],
    alphaAllowed: true,
    cropBehavior: "reposition",
    safeAreas: safe && contentType === "banner" ? [{ x: (width - safe.width) / 2, y: (height - safe.height) / 2, width: safe.width, height: safe.height, unit: "px" }] : undefined,
    notes: ["Dimension preset retained from the enV Image research brief; verify platform-specific placement rules against the linked official source before production release."],
  } satisfies PlatformPlacementSpec;
}));

function ratio(width: number, height: number) {
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : Math.abs(a);
  const g = gcd(width, height);
  return `${width / g}:${height / g}`;
}

export function getPlatformPreset(platform: string, contentType?: string) {
  const p = platform.toLowerCase();
  return PLATFORM_PRESETS.find((item) => item.platform === p && (!contentType || item.contentType === contentType));
}

export function getPresetForImageOp(op: string) {
  const match = op.toLowerCase().match(/^([a-z]+)-(.+)$/);
  if (!match) return undefined;
  const platform = match[1] === "twitter" ? "x" : match[1];
  const action = match[2];
  const contentType = action.includes("profile") ? "profile" : action.includes("banner") ? "banner" : action.includes("story") ? "story" : action.includes("thumbnail") ? "thumbnail" : action.includes("cover") ? "cover" : action.includes("square") ? "square" : action.includes("portrait") ? "portrait" : action.includes("landscape") ? "landscape" : action.includes("post") ? "post" : "image";
  return getPlatformPreset(platform, contentType);
}
