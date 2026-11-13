import { useEffect, useRef, useState } from "react";
import { isApplicationOnline } from "@/lib/ads/policy";
import {
  ADSTERRA_BANNER_UNITS,
  ADSTERRA_NATIVE_BANNER,
  canRequestAdsterraAds,
  getAdsterraConsent,
  isAdsterraEnabled,
  type AdsterraBannerFormat,
} from "@/lib/ads/adsterra";

type AtOptions = {
  key: string;
  format: "iframe";
  height: number;
  width: number;
  params: Record<string, never>;
};

declare global {
  interface Window {
    atOptions?: AtOptions;
  }
}

export type AdsterraDeliveryState = "filled" | "unfilled" | "blocked";

function hasVisibleAdCreative(slot: HTMLElement): boolean {
  for (const node of Array.from(slot.querySelectorAll<HTMLElement>("iframe, img, video, [data-adsterra-creative]"))) {
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    if (style.display !== "none" && style.visibility !== "hidden" &&
        Number(style.opacity) > 0 && rect.width >= 40 && rect.height >= 20) return true;
  }
  return false;
}

let bannerScriptQueue: Promise<void> = Promise.resolve();

function useAdsterraReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let requestVersion = 0;
    const refresh = async () => {
      const version = ++requestVersion;
      if (!canRequestAdsterraAds(isAdsterraEnabled(), getAdsterraConsent(), navigator.onLine)) {
        if (active && version === requestVersion) setReady(false);
        return;
      }
      const online = await isApplicationOnline();
      if (active && version === requestVersion) setReady(online);
    };
    const onChange = () => { void refresh(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    // Mobile browsers can resume a tab without firing an online event. Retry
    // same-origin reachability when the page returns and at a bounded interval.
    const retryHandle = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    window.addEventListener("focus", onChange);
    window.addEventListener("env:adsterra-consent-changed", onChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      requestVersion += 1;
      window.clearInterval(retryHandle);
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
      window.removeEventListener("focus", onChange);
      window.removeEventListener("env:adsterra-consent-changed", onChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return ready;
}

function appendBannerScript(
  slot: HTMLDivElement,
  unit: (typeof ADSTERRA_BANNER_UNITS)[AdsterraBannerFormat],
): Promise<void> {
  const request = () => new Promise<void>((resolve, reject) => {
    if (!slot.isConnected) {
      resolve();
      return;
    }
    window.atOptions = {
      key: unit.key,
      format: "iframe",
      height: unit.height,
      width: unit.width,
      params: {},
    };
    const script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.dataset.envAdsterraPlacement = unit.placementId;
    script.src = unit.src;
    const loadTimeout = window.setTimeout(() => {
      script.remove();
      reject(new Error("Adsterra banner request timed out."));
    }, 15_000);
    script.addEventListener("load", () => {
      window.clearTimeout(loadTimeout);
      resolve();
    }, { once: true });
    script.addEventListener("error", () => {
      window.clearTimeout(loadTimeout);
      reject(new Error("Adsterra banner could not be loaded."));
    }, { once: true });
    slot.appendChild(script);
  });

  const queued = bannerScriptQueue.catch(() => undefined).then(request);
  bannerScriptQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

export function AdsterraBanner({
  format,
  onDelivery,
}: {
  format: AdsterraBannerFormat;
  onDelivery?: (state: AdsterraDeliveryState) => void;
}) {
  const ready = useAdsterraReady();
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryTimerRef = useRef<number | null>(null);
  const unit = ADSTERRA_BANNER_UNITS[format];

  useEffect(() => {
    if (!ready) {
      setFailed(false);
      setRetryAttempt(0);
      onDelivery?.("blocked");
      return;
    }
    const slot = slotRef.current;
    if (!slot || slot.dataset.envAdsterraRequested === "true") return;
    let active = true;
    let retryTriggered = false;
    let deliveryReported = false;
    const reportDelivery = () => {
      if (!active || deliveryReported || !hasVisibleAdCreative(slot)) return;
      deliveryReported = true;
      onDelivery?.("filled");
      observer.disconnect();
      window.clearTimeout(creativeTimeout);
    };
    const observer = new MutationObserver(reportDelivery);
    observer.observe(slot, { childList: true, subtree: true, attributes: true });
    const creativeTimeout = window.setTimeout(() => {
      reportDelivery();
      if (active && !deliveryReported) {
        deliveryReported = true;
        onDelivery?.("unfilled");
      }
    }, 12_000);
    const retryOnAvailability = () => {
      if (!active || retryTriggered || !navigator.onLine || document.visibilityState !== "visible") return;
      retryTriggered = true;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setFailed(false);
      setRetryAttempt(retryAttempt + 1);
    };
    slot.dataset.envAdsterraRequested = "true";
    void appendBannerScript(slot, unit).then(reportDelivery).catch(() => {
      if (!active) return;
      if (!deliveryReported) {
        deliveryReported = true;
        onDelivery?.("unfilled");
      }
      slot.replaceChildren();
      delete slot.dataset.envAdsterraRequested;
      setFailed(true);
      if (retryAttempt < 3) {
        const delay = Math.min(30_000, 5_000 * (2 ** retryAttempt));
        window.addEventListener("online", retryOnAvailability);
        document.addEventListener("visibilitychange", retryOnAvailability);
        retryTimerRef.current = window.setTimeout(retryOnAvailability, delay);
      }
    });
    return () => {
      active = false;
      observer.disconnect();
      window.clearTimeout(creativeTimeout);
      window.removeEventListener("online", retryOnAvailability);
      document.removeEventListener("visibilitychange", retryOnAvailability);
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [ready, unit, retryAttempt, onDelivery]);

  if (!ready || failed) return null;

  return (
    <aside
      aria-label="Advertisement"
      data-adsterra-placement={unit.placementId}
      className="mx-auto my-6 w-full text-center"
    >
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">Advertisement</p>
      <div
        ref={slotRef}
        className="mx-auto overflow-hidden"
        style={{ width: "100%", maxWidth: unit.width, minHeight: unit.height }}
      />
    </aside>
  );
}

export function AdsterraResponsiveBanner({ onDelivery }: { onDelivery?: (state: AdsterraDeliveryState) => void }) {
  const [format, setFormat] = useState<AdsterraBannerFormat | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setFormat(media.matches ? "728x90" : "320x50");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return format ? <AdsterraBanner format={format} onDelivery={onDelivery} /> : null;
}

export function AdsterraNativeBanner({ onDelivery }: { onDelivery?: (state: AdsterraDeliveryState) => void }) {
  const ready = useAdsterraReady();
  const [failed, setFailed] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryTimerRef = useRef<number | null>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    if (!ready) {
      setFailed(false);
      setRetryAttempt(0);
      onDelivery?.("blocked");
      return;
    }
    if (scriptRef.current) return;
    const container = document.getElementById(ADSTERRA_NATIVE_BANNER.containerId);
    if (!container || container.dataset.envAdsterraRequested === "true") return;
    let active = true;
    let retryTriggered = false;
    const retryOnAvailability = () => {
      if (!active || retryTriggered || !navigator.onLine || document.visibilityState !== "visible") return;
      retryTriggered = true;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setFailed(false);
      setRetryAttempt(retryAttempt + 1);
    };
    let failureHandled = false;
    let deliveryReported = false;
    const reportDelivery = () => {
      if (!active || deliveryReported || !hasVisibleAdCreative(container)) return;
      deliveryReported = true;
      onDelivery?.("filled");
      observer.disconnect();
      window.clearTimeout(creativeTimeout);
    };
    const observer = new MutationObserver(reportDelivery);
    observer.observe(container, { childList: true, subtree: true, attributes: true });
    const creativeTimeout = window.setTimeout(() => {
      reportDelivery();
      if (active && !deliveryReported) {
        deliveryReported = true;
        onDelivery?.("unfilled");
      }
    }, 12_000);
    const script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.src = ADSTERRA_NATIVE_BANNER.src;
    const fail = () => {
      if (!active || failureHandled) return;
      failureHandled = true;
      script.remove();
      if (!deliveryReported) {
        deliveryReported = true;
        onDelivery?.("unfilled");
      }
      observer.disconnect();
      window.clearTimeout(creativeTimeout);
      if (scriptRef.current === script) scriptRef.current = null;
      container.replaceChildren();
      delete container.dataset.envAdsterraRequested;
      setFailed(true);
      if (retryAttempt < 3) {
        const delay = Math.min(30_000, 5_000 * (2 ** retryAttempt));
        window.addEventListener("online", retryOnAvailability);
        document.addEventListener("visibilitychange", retryOnAvailability);
        retryTimerRef.current = window.setTimeout(retryOnAvailability, delay);
      }
    };
    const loadTimeout = window.setTimeout(fail, 15_000);
    script.addEventListener("load", () => {
      window.clearTimeout(loadTimeout);
      if (failureHandled) return;
      failureHandled = true;
      if (active) setFailed(false);
      reportDelivery();
    }, { once: true });
    script.addEventListener("error", () => {
      window.clearTimeout(loadTimeout);
      fail();
    }, { once: true });
    container.insertAdjacentElement("beforebegin", script);
    scriptRef.current = script;
    return () => {
      active = false;
      observer.disconnect();
      window.clearTimeout(creativeTimeout);
      window.removeEventListener("online", retryOnAvailability);
      document.removeEventListener("visibilitychange", retryOnAvailability);
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      script.remove();
      container.replaceChildren();
      delete container.dataset.envAdsterraRequested;
      if (scriptRef.current === script) scriptRef.current = null;
    };
  }, [ready, retryAttempt, onDelivery]);

  if (!ready || failed) return null;

  return (
    <aside
      aria-label="Advertisement"
      data-adsterra-placement={ADSTERRA_NATIVE_BANNER.placementId}
      className="my-8 w-full overflow-hidden text-center"
    >
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">Advertisement</p>
      <div id={ADSTERRA_NATIVE_BANNER.containerId} className="mx-auto w-full max-w-3xl" />
    </aside>
  );
}


/**
 * Adsterra's Popunder is a site-level Web placement, not a rewarded ad.
 * Load it only after explicit advertising consent and same-origin reachability.
 * Consent revocation reloads the document to clear provider-installed listeners.
 */
