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

export type AdsterraBannerFormat = keyof typeof ADSTERRA_BANNER_UNITS;

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

export function setAdsterraConsent(choice: Exclude<AdsterraConsent, "unset">): void {
  try {
    window.localStorage.setItem(ADSTERRA_CONSENT_STORAGE_KEY, choice);
  } catch {
    // If consent cannot be stored, this browser session must not request ads.
  }
  window.dispatchEvent(new CustomEvent("env:adsterra-consent-changed", { detail: { choice } }));
}
