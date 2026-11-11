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
    void refresh();
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    window.addEventListener("env:adsterra-consent-changed", onChange);
    return () => {
      active = false;
      requestVersion += 1;
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
      window.removeEventListener("env:adsterra-consent-changed", onChange);
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
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Adsterra banner could not be loaded.")), { once: true });
    slot.appendChild(script);
  });

  const queued = bannerScriptQueue.catch(() => undefined).then(request);
  bannerScriptQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

export function AdsterraBanner({ format }: { format: AdsterraBannerFormat }) {
  const ready = useAdsterraReady();
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const unit = ADSTERRA_BANNER_UNITS[format];

  useEffect(() => {
    if (!ready) setFailed(false);
  }, [ready]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!ready || !slot || slot.dataset.envAdsterraRequested === "true") return;
    let active = true;
    slot.dataset.envAdsterraRequested = "true";
    void appendBannerScript(slot, unit).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [ready, unit]);

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

export function AdsterraResponsiveBanner() {
  const [format, setFormat] = useState<AdsterraBannerFormat | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setFormat(media.matches ? "728x90" : "320x50");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return format ? <AdsterraBanner format={format} /> : null;
}

export function AdsterraNativeBanner() {
  const ready = useAdsterraReady();
  const [failed, setFailed] = useState(false);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    if (!ready) setFailed(false);
  }, [ready]);

  useEffect(() => {
    if (!ready || scriptRef.current) return;
    const container = document.getElementById(ADSTERRA_NATIVE_BANNER.containerId);
    if (!container || container.dataset.envAdsterraRequested === "true") return;
    let active = true;
    container.dataset.envAdsterraRequested = "true";
    const script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.src = ADSTERRA_NATIVE_BANNER.src;
    script.addEventListener("error", () => {
      if (active) setFailed(true);
    }, { once: true });
    container.insertAdjacentElement("afterend", script);
    scriptRef.current = script;
    return () => {
      active = false;
      script.remove();
      container.replaceChildren();
      delete container.dataset.envAdsterraRequested;
      if (scriptRef.current === script) scriptRef.current = null;
    };
  }, [ready]);

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
