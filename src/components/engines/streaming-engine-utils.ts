export type StreamingPlatform = "youtube" | "twitch" | "tiktok" | "instagram" | "facebook" | "kick" | "podcast";

export const STREAMING_PLATFORMS: Record<StreamingPlatform, string> = {
  youtube: "YouTube Live",
  twitch: "Twitch",
  tiktok: "TikTok Live",
  instagram: "Instagram Live",
  facebook: "Facebook Live",
  kick: "Kick",
  podcast: "Podcast Live",
};

export const RESOLUTIONS: Record<string, readonly [number, number]> = {
  "360p": [640, 360],
  "480p": [854, 480],
  "720p": [1280, 720],
  "1080p": [1920, 1080],
  "1440p": [2560, 1440],
  "2160p": [3840, 2160],
};

export const FPS: Record<string, number> = { "24": 24, "25": 25, "30": 30, "50": 50, "60": 60 };

const OPERATIONS = [
  "bitrate-calculator",
  "resolution-helper",
  "stream-schedule",
  "title-generator",
  "description-generator",
  "overlay-planner",
  "stream-checklist",
  "revenue-calculator",
  "aspect-ratio-helper",
] as const;

export type StreamingOperation = (typeof OPERATIONS)[number];

export function parseStreamingToolId(id: string): { platform: StreamingPlatform; operation: StreamingOperation } | null {
  const platform = (Object.keys(STREAMING_PLATFORMS) as StreamingPlatform[]).find((value) => id.startsWith(`${value}-`));
  if (!platform) return null;
  const operation = OPERATIONS.find((value) => id.endsWith(value));
  return operation ? { platform, operation } : null;
}

export function calculateBitrate(resolution: string, fps: string, quality: string, platform: StreamingPlatform) {
  const dimensions = RESOLUTIONS[resolution];
  const frameRate = FPS[fps];
  if (!dimensions || !frameRate || !["low", "high"].includes(quality)) return { error: "Choose a valid resolution, frame rate, and quality." } as const;
  const [width, height] = dimensions;
  const base = Math.round((width * height * frameRate) / 2500);
  const video = Math.max(800, Math.round(base * (quality === "high" ? 1 : 0.72)));
  const audio = platform === "podcast" ? 160 : 128;
  return { video, audio, combined: video + audio } as const;
}

export function calculateAspectRatio(widthValue: string, heightValue: string) {
  const width = Number(widthValue);
  const height = Number(heightValue);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { error: "Width and height must be positive numbers." } as const;
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(Math.round(width), Math.round(height));
  return { ratio: `${Math.round(width) / divisor}:${Math.round(height) / divisor}`, decimal: width / height } as const;
}

export function calculateRevenue(viewersValue: string, hoursValue: string, rateValue: string) {
  const viewers = Number(viewersValue);
  const hours = Number(hoursValue);
  const rate = Number(rateValue);
  if (![viewers, hours, rate].every(Number.isFinite) || viewers < 0 || hours < 0 || rate < 0) return { error: "Viewers, hours, and rate must be non-negative numbers." } as const;
  return { estimate: viewers * hours / 1000 * rate } as const;
}

export function validateSchedule(date: string, time: string, duration: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) return "Enter a valid date.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return "Enter a valid 24-hour start time.";
  if (!/^([0-9]{1,2}):[0-5]\d$/.test(duration)) return "Enter duration as HH:MM.";
  const [hours, minutes] = duration.split(":").map(Number);
  if (hours === 0 && minutes === 0) return "Duration must be greater than zero.";
  return null;
}

export function buildScheduleText(platform: StreamingPlatform, date: string, time: string, duration: string, topic: string) {
  return `STREAM SCHEDULE\nPlatform: ${STREAMING_PLATFORMS[platform]}\nDate: ${date}\nStart: ${time}\nDuration: ${duration}\nTopic: ${topic.trim() || "Untitled stream"}`;
}

export function buildOverlayText(platform: StreamingPlatform, items: string[]) {
  return `OVERLAY PLAN\nPlatform: ${STREAMING_PLATFORMS[platform]}\n\n${items.map((item, index) => `${index + 1}. ${item}`).join("\n") || "No overlay elements planned."}`;
}

export function buildChecklistText(platform: StreamingPlatform, items: string[], checked: boolean[]) {
  const completed = checked.filter(Boolean).length;
  return `STREAM CHECKLIST\nPlatform: ${STREAMING_PLATFORMS[platform]}\nProgress: ${completed}/${items.length}\n\n${items.map((item, index) => `${checked[index] ? "[x]" : "[ ]"} ${item}`).join("\n")}`;
}

export function buildTitles(topic: string, style: string) {
  const clean = topic.trim();
  if (!clean) return [];
  const titles = [clean, `LIVE: ${clean} — Ask Me Anything`, `${clean} Live — What You Need to Know`, `Let's Talk: ${clean}`, `${clean} — Live Session`];
  if (style === "announcement") return titles.map((title) => `📢 ${title}`);
  if (style === "community") return titles.map((title) => `🎙️ ${title}`);
  return titles;
}

export function buildDescription(topic: string, cta: string) {
  const clean = topic.trim();
  if (!clean) return "";
  return `LIVE STREAM: ${clean}\n\nJoin the live session and follow along in real time.\n\nWhat we'll cover:\n• ${clean}\n• Questions and discussion\n• Practical takeaways\n\n${cta.trim()}`;
}
