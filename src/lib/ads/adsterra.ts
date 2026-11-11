export type AdsterraConsent = "granted" | "denied" | "unset";

export const ADSTERRA_CONSENT_STORAGE_KEY = "env.ads.adsterra-consent.v1";

export const ADSTERRA_BANNER_UNITS = {
  "300x250": {
    placementId: "32202127",
    key: "ffb0afee93380730ee06dbec9956c799",
    width: 300,
    height: 250,
    src: "https://bauval.org/22/ffb0afee93380730ee06dbec9956c799",
  },
  "320x50": {
    placementId: "32202130",
    key: "2a9bc08380f1634e49fb5abe53257b37",
    width: 320,
    height: 50,
    src: "https://bauval.org/22/2a9bc08380f1634e49fb5abe53257b37",
  },
  "728x90": {
    placementId: "32202131",
    key: "eb1d173d1bfbb3c552f347606f9e54e4",
    width: 728,
    height: 90,
    src: "https://bauval.org/22/eb1d173d1bfbb3c552f347606f9e54e4",
  },
} as const;

export const ADSTERRA_NATIVE_BANNER = {
  placementId: "32202120",
  containerId: "container-78a40bc1026f57ead96fcab42af6c0b0",
  src: "https://bauval.org/21/78a40bc1026f57ead96fcab42af6c0b0",
} as const;

export const ADSTERRA_POPUNDER_SCRIPT = {
  src: "https://abscloud.org/1/b39264253fbfc622884c9a3b81882853",
} as const;

export const ADSTERRA_SMARTLINK_URL = "https://araplhn.org/4/ae13eae40d577a3e29863b4ca80a9f2e";

export type AdsterraBannerFormat = keyof typeof ADSTERRA_BANNER_UNITS;

/**
 * Ad delivery is enabled for this deployment, the visitor has granted the
 * required advertising choice, and the browser is online. This deliberately
 * does not change guest access or the availability of enV tools.
 */
export function canRequestAdsterraAds(
  enabled: boolean,
  consent: AdsterraConsent,
  online: boolean,
): boolean {
  return enabled && consent === "granted" && online;
}

/** Open the publisher's Smartlink in a separate tab from an explicit output action. */
export function openAdsterraSmartlinkFromOutput(): void {
  if (!canRequestAdsterraAds(isAdsterraEnabled(), getAdsterraConsent(), navigator.onLine)) return;
  window.open(ADSTERRA_SMARTLINK_URL, "_blank", "noopener,noreferrer");
}

export function isAdsterraEnabled(): boolean {
  return import.meta.env.VITE_ADSTERRA_ENABLED === "true";
}

export function getAdsterraConsent(): AdsterraConsent {
  if (typeof window === "undefined") return "unset";
  try {
    const value = window.localStorage.getItem(ADSTERRA_CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : "unset";
  } catch {
    return "unset";
  }
}

export function setAdsterraConsent(choice: Exclude<AdsterraConsent, "unset">): boolean {
  try {
    window.localStorage.setItem(ADSTERRA_CONSENT_STORAGE_KEY, choice);
    if (window.localStorage.getItem(ADSTERRA_CONSENT_STORAGE_KEY) !== choice) return false;
  } catch {
    // If consent cannot be stored, this browser session must not request ads.
    return false;
  }
  window.dispatchEvent(new CustomEvent("env:adsterra-consent-changed", { detail: { choice } }));
  return true;
}
