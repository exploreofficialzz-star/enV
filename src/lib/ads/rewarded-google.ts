import { loadAdSenseScript, whenGoogleAdsConsentReady } from "./browser";

type RewardedFormat = "REWARDED";

type GPTSlot = {
  addService(service: GPTPubAds): GPTSlot;
};

type GPTEvent = {
  slot: GPTSlot;
};

type GPTRewardedReadyEvent = GPTEvent & {
  makeRewardedVisible: () => void;
};

type GPTSlotRenderEndedEvent = GPTEvent & {
  isEmpty: boolean;
};

type GPTPubAds = {
  addEventListener(name: string, listener: (event: GPTEvent & Record<string, unknown>) => void): void;
  removeEventListener?(name: string, listener: (event: GPTEvent & Record<string, unknown>) => void): void;
};

type GooglePublisherTag = {
  cmd: Array<() => void>;
  enums: { OutOfPageFormat: { REWARDED: RewardedFormat } };
  defineOutOfPageSlot(unitPath: string, format: RewardedFormat): GPTSlot | null;
  pubads(): GPTPubAds;
  enableServices(): void;
  display(slot: GPTSlot): void;
  destroySlots(slots: GPTSlot[]): boolean;
};

declare global {
  interface Window {
    googletag?: GooglePublisherTag;
  }
}

let gptScriptPromise: Promise<void> | null = null;
let privacyReadyPromise: Promise<void> | null = null;
let gptServicesEnabled = false;

async function waitForGooglePrivacyChoice(): Promise<void> {
  const clientId = String(import.meta.env.VITE_ADSENSE_CLIENT_ID ?? "").trim();
  if (import.meta.env.VITE_ADSENSE_PRIVACY_CONFIGURED !== "true" || !clientId) {
    throw new Error("Google advertising privacy messaging is not configured.");
  }
  if (!privacyReadyPromise) {
    privacyReadyPromise = (async () => {
      await loadAdSenseScript(clientId);
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Google privacy settings did not finish loading.")), 15_000);
        whenGoogleAdsConsentReady((allowed) => {
          window.clearTimeout(timeout);
          if (allowed) resolve();
          else reject(new Error("Advertising consent was declined or is unavailable."));
        });
      });
    })().catch((error) => {
      privacyReadyPromise = null;
      throw error;
    });
  }
  await privacyReadyPromise;
}

function ensureGPTQueue(): GooglePublisherTag {
  window.googletag ??= { cmd: [], enums: { OutOfPageFormat: { REWARDED: "REWARDED" } } } as GooglePublisherTag;
  return window.googletag;
}

/** Load GPT only after a visitor explicitly chooses the rewarded-ad option. */
function loadGPT(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Rewarded ads are only available in a browser."));
  }
  const existing = document.querySelector<HTMLScriptElement>('script[data-env-gpt-rewarded="true"]');
  if (existing?.dataset.loaded === "true" || (existing && window.googletag?.defineOutOfPageSlot)) {
    ensureGPTQueue();
    return Promise.resolve();
  }
  if (gptScriptPromise) return gptScriptPromise;

  ensureGPTQueue();
  gptScriptPromise = new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    const finish = () => { script.dataset.loaded = "true"; resolve(); };
    const fail = () => {
      gptScriptPromise = null;
      script.remove();
      reject(new Error("The rewarded-ad provider could not be reached. Check your connection or advertising blocker."));
    };
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", fail, { once: true });
    if (!existing) {
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.envGptRewarded = "true";
      script.src = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
      document.head.appendChild(script);
    }
  });
  return gptScriptPromise;
}

export type RewardedAdResult = "completed" | "dismissed" | "unavailable";

/**
 * Shows a Google Ad Manager rewarded ad. An ad counts only when GPT reports
 * both its reward grant and video completion before the visitor closes it.
 * Banner impressions, slot loads, clicks and Smartlink openings are not rewards.
 */
export async function showGoogleRewardedAd(unitPath: string): Promise<RewardedAdResult> {
  const normalizedUnitPath = typeof unitPath === "string" ? unitPath.trim() : "";
  if (!/^\/[A-Za-z0-9_./-]{2,180}$/.test(normalizedUnitPath)) return "unavailable";

  try {
    await waitForGooglePrivacyChoice();
    await loadGPT();
  } catch {
    return "unavailable";
  }

  return new Promise<RewardedAdResult>((resolve) => {
    const gpt = ensureGPTQueue();
    let settled = false;
    let rewardGranted = false;
    let videoCompleted = false;
    let slot: GPTSlot | null = null;
    let pubads: GPTPubAds | null = null;

    const readyListener = (rawEvent: GPTEvent & Record<string, unknown>) => {
      if (!slot || rawEvent.slot !== slot) return;
      const event = rawEvent as GPTRewardedReadyEvent;
      if (typeof event.makeRewardedVisible === "function") event.makeRewardedVisible();
    };
    const grantedListener = (event: GPTEvent & Record<string, unknown>) => {
      if (slot && event.slot === slot) rewardGranted = true;
    };
    const completedListener = (event: GPTEvent & Record<string, unknown>) => {
      if (slot && event.slot === slot) videoCompleted = true;
    };
    const closedListener = (event: GPTEvent & Record<string, unknown>) => {
      if (slot && event.slot === slot) finish(rewardGranted && videoCompleted ? "completed" : "dismissed");
    };
    const renderEndedListener = (rawEvent: GPTEvent & Record<string, unknown>) => {
      if (!slot || rawEvent.slot !== slot) return;
      if ((rawEvent as GPTSlotRenderEndedEvent).isEmpty) finish("unavailable");
    };

    const detach = () => {
      if (!pubads) return;
      pubads.removeEventListener?.("rewardedSlotReady", readyListener);
      pubads.removeEventListener?.("rewardedSlotGranted", grantedListener);
      pubads.removeEventListener?.("rewardedSlotVideoCompleted", completedListener);
      pubads.removeEventListener?.("rewardedSlotClosed", closedListener);
      pubads.removeEventListener?.("slotRenderEnded", renderEndedListener);
    };

    const finish = (result: RewardedAdResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      detach();
      if (slot) gpt.destroySlots([slot]);
      resolve(result);
    };

    const timeout = window.setTimeout(() => finish("unavailable"), 90_000);

    gpt.cmd.push(() => {
      try {
        pubads = gpt.pubads();
        slot = gpt.defineOutOfPageSlot(normalizedUnitPath, gpt.enums.OutOfPageFormat.REWARDED);
        if (!slot) {
          finish("unavailable");
          return;
        }
        slot.addService(pubads);
        pubads.addEventListener("rewardedSlotReady", readyListener);
        pubads.addEventListener("rewardedSlotGranted", grantedListener);
        pubads.addEventListener("rewardedSlotVideoCompleted", completedListener);
        pubads.addEventListener("rewardedSlotClosed", closedListener);
        pubads.addEventListener("slotRenderEnded", renderEndedListener);
        if (!gptServicesEnabled) {
          gpt.enableServices();
          gptServicesEnabled = true;
        }
        gpt.display(slot);
      } catch {
        finish("unavailable");
      }
    });
  });
}
