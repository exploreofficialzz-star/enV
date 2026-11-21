type AdsByGoogleQueue = Array<Record<string, unknown>> & { requestNonPersonalizedAds?: number; pauseAdRequests?: number };
type GoogleFcCallback = (() => void) | Record<string, () => void>;
type GoogleFcApi = {
  callbackQueue?: GoogleFcCallback[];
  showRevocationMessage?: () => void;
  getGoogleConsentModeValues?: () => GoogleFcConsentModeValues;
  ConsentModePurposeStatusEnum?: {
    CONSENT_MODE_PURPOSE_STATUS_UNKNOWN: number;
    CONSENT_MODE_PURPOSE_STATUS_GRANTED: number;
    CONSENT_MODE_PURPOSE_STATUS_DENIED: number;
    CONSENT_MODE_PURPOSE_STATUS_NOT_APPLICABLE: number;
    CONSENT_MODE_PURPOSE_STATUS_NOT_CONFIGURED: number;
  };
  getAdBlockerStatus?: () => number;
  AdBlockerStatusEnum?: {
    UNKNOWN: number;
    EXTENSION_LEVEL_AD_BLOCKER: number;
    NETWORK_LEVEL_AD_BLOCKER: number;
    NO_AD_BLOCKER: number;
  };
  AllowAdsStatusEnum?: {
    UNKNOWN: number;
    ADS_NOT_ALLOWED: number;
    ADS_ALLOWED: number;
  };
  getAllowAdsStatus?: () => number;
  usstatesoptout?: {
    getInitialUsStatesOptOutStatus?: () => number;
    InitialUsStatesOptOutStatusEnum?: {
      UNKNOWN: number;
      DOES_NOT_APPLY: number;
      NOT_OPTED_OUT: number;
      OPTED_OUT: number;
    };
  };
};
type GoogleFcConsentModeValues = {
  adStoragePurposeConsentStatus: number;
  adUserDataPurposeConsentStatus: number;
  adPersonalizationPurposeConsentStatus: number;
  analyticsStoragePurposeConsentStatus: number;
};

declare global {
  interface Window {
    adsbygoogle?: AdsByGoogleQueue;
    googlefc?: GoogleFcApi;
    __envGoogleConsentDataReady?: boolean;
    __envGoogleAdsConsentDecisionReady?: boolean;
    __envGoogleAdsAllowed?: boolean;
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
  // The site-verification tag is in the document head. The queue accepts requests before the async library loads.
  if (existing) return Promise.resolve();
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
/** Run ad-slot requests only after Google's CMP has resolved the visitor's consent data. */
export function whenGooglePrivacyConsentDataReady(callback: () => void): void {
  if (window.__envGoogleConsentDataReady === true) {
    callback();
    return;
  }
  ensureGoogleFcQueue().callbackQueue!.push({
    CONSENT_DATA_READY: () => {
      window.__envGoogleConsentDataReady = true;
      callback();
    },
  });
}

/**
 * Require resolved Google ad consent, no US privacy opt-out, and a clear
 * ad-blocker signal. Unknown provider states fail closed instead of requesting
 * an ad for a visitor whose permissions cannot be determined.
 */
export function whenGoogleAdsConsentReady(callback: (allowed: boolean) => void): void {
  if (window.__envGoogleAdsConsentDecisionReady === true) {
    callback(window.__envGoogleAdsAllowed === true);
    return;
  }

  const finish = (allowed: boolean) => {
    window.__envGoogleAdsAllowed = allowed;
    window.__envGoogleAdsConsentDecisionReady = true;
    callback(allowed);
  };

  ensureGoogleFcQueue().callbackQueue!.push({
    CONSENT_MODE_DATA_READY: () => {
      const api = window.googlefc;
      const values = api?.getGoogleConsentModeValues?.();
      const consentStatuses = api?.ConsentModePurposeStatusEnum;
      if (!values || !consentStatuses) {
        finish(false);
        return;
      }
      const permitted = new Set([
        consentStatuses.CONSENT_MODE_PURPOSE_STATUS_GRANTED,
        consentStatuses.CONSENT_MODE_PURPOSE_STATUS_NOT_APPLICABLE,
        consentStatuses.CONSENT_MODE_PURPOSE_STATUS_NOT_CONFIGURED,
      ]);
      const consentAllowed = [
        values.adStoragePurposeConsentStatus,
        values.adUserDataPurposeConsentStatus,
        values.adPersonalizationPurposeConsentStatus,
      ].every((status) => permitted.has(status));
      if (!consentAllowed) {
        finish(false);
        return;
      }

      ensureGoogleFcQueue().callbackQueue!.push({
        INITIAL_US_STATES_OPT_OUT_DATA_READY: () => {
          const stateApi = window.googlefc?.usstatesoptout;
          const stateStatus = stateApi?.getInitialUsStatesOptOutStatus?.();
          const stateEnums = stateApi?.InitialUsStatesOptOutStatusEnum;
          if (!stateEnums || stateStatus === undefined ||
              (stateStatus !== stateEnums.DOES_NOT_APPLY && stateStatus !== stateEnums.NOT_OPTED_OUT)) {
            finish(false);
            return;
          }

          ensureGoogleFcQueue().callbackQueue!.push({
            AD_BLOCK_DATA_READY: () => {
              const blockerApi = window.googlefc;
              const blockerStatus = blockerApi?.getAdBlockerStatus?.();
              const blockerEnums = blockerApi?.AdBlockerStatusEnum;
              finish(Boolean(
                blockerEnums &&
                blockerStatus === blockerEnums.NO_AD_BLOCKER
              ));
            },
          });
        },
      });
    },
  });
}

export function reopenGooglePrivacySettings(): void {
  window.__envGoogleAdsConsentDecisionReady = false;
  window.__envGoogleAdsAllowed = false;
  ensureGoogleFcQueue().callbackQueue!.push(() => {
    window.googlefc?.showRevocationMessage?.();
  });
}
