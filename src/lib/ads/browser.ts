type AdsByGoogleQueue = Array<Record<string, unknown>> & { requestNonPersonalizedAds?: number };
type GoogleFcCallback = (() => void) | Record<string, () => void>;
type GoogleFcApi = {
  callbackQueue?: GoogleFcCallback[];
  showRevocationMessage?: () => void;
};

declare global {
  interface Window {
    adsbygoogle?: AdsByGoogleQueue;
    googlefc?: GoogleFcApi;
  }
}

let adSenseScriptPromise: Promise<void> | null = null;

function ensureGoogleFcQueue(): GoogleFcApi {
  const api = window.googlefc ?? (window.googlefc = {});
  api.callbackQueue ??= [];
  return api;
}

/**
 * Load the publisher tag once. Published Google Privacy & Messaging messages are
 * delivered by the AdSense tag; initialise the callback queue before loading it.
 */
export function loadAdSenseScript(clientId: string): Promise<void> {
  if (typeof document === "undefined") return Promise.reject(new Error("Ads are only available in a browser."));
  const existing = document.querySelector<HTMLScriptElement>("script[data-env-adsense-client]");
  if (existing && existing.dataset.envAdsenseClient !== clientId) {
    return Promise.reject(new Error("A different AdSense publisher script is already loaded."));
  }
  ensureGoogleFcQueue();
  if (existing?.dataset.loaded === "true") return Promise.resolve();
  if (adSenseScriptPromise) return adSenseScriptPromise;

  adSenseScriptPromise = new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => {
      adSenseScriptPromise = null;
      script.remove();
      reject(new Error("The advertising provider could not be loaded."));
    }, { once: true });
    if (!existing) {
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.envAdsenseClient = clientId;
      script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(clientId);
      document.head.appendChild(script);
    }
  });
  return adSenseScriptPromise;
}

/** Register for Google's documented API-ready event before publisher script load. */
export function whenGooglePrivacyMessagingReady(callback: () => void): void {
  ensureGoogleFcQueue().callbackQueue!.push({ CONSENT_API_READY: callback });
}

/** Google requires its consent messaging methods to be invoked via callbackQueue. */
export function reopenGooglePrivacySettings(): void {
  ensureGoogleFcQueue().callbackQueue!.push(() => {
    window.googlefc?.showRevocationMessage?.();
  });
}
