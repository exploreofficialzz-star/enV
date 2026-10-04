export const DEFAULT_WEB_APP_URL = "https://en-v.vercel.app";
export const BRAND_STATUS_BAR_COLOR = "#0D9A8D";
export const MAX_NATIVE_DOWNLOAD_BYTES = 100 * 1024 * 1024;

const configuredWebAppUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim();
const candidateUrl = configuredWebAppUrl || DEFAULT_WEB_APP_URL;

let parsedWebAppUrl: URL;
try {
  parsedWebAppUrl = new URL(candidateUrl);
} catch {
  throw new Error("EXPO_PUBLIC_WEB_URL must be a valid absolute URL.");
}

if (parsedWebAppUrl.protocol !== "https:" || parsedWebAppUrl.username || parsedWebAppUrl.password) {
  throw new Error("EXPO_PUBLIC_WEB_URL must use HTTPS and must not contain credentials.");
}

export const WEB_APP_URL = parsedWebAppUrl.toString();
export const WEB_APP_ORIGIN = parsedWebAppUrl.origin;

export function isSafeHttpsWebUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function isInternalWebUrl(value: string): boolean {
  if (!isSafeHttpsWebUrl(value)) return false;
  return new URL(value).origin === WEB_APP_ORIGIN;
}
