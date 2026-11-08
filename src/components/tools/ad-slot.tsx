import { useEffect, useRef, useState } from "react";
import type { ToolMeta } from "@/types/tool";
import { canShowAdForTool, isApplicationOnline, resolveAdConfig } from "@/lib/ads/policy";

type AdsByGoogleQueue = Array<Record<string, unknown>> & { requestNonPersonalizedAds?: number };

declare global {
  interface Window {
    adsbygoogle?: AdsByGoogleQueue;
  }
}

const adConfig = resolveAdConfig({
  enabled: import.meta.env.VITE_ADS_ENABLED,
  privacyConfigured: import.meta.env.VITE_ADSENSE_PRIVACY_CONFIGURED,
  clientId: import.meta.env.VITE_ADSENSE_CLIENT_ID,
  toolSlotId: import.meta.env.VITE_ADSENSE_TOOL_SLOT_ID,
  toolIds: import.meta.env.VITE_AD_SUPPORTED_TOOL_IDS,
});

let adSenseScriptPromise: Promise<void> | null = null;

function loadAdSenseScript(clientId: string): Promise<void> {
  if (typeof document === "undefined") return Promise.reject(new Error("Ads are only available in a browser."));
  const existing = document.querySelector<HTMLScriptElement>("script[data-env-adsense-client]");
  if (existing && existing.dataset.envAdsenseClient !== clientId) {
    return Promise.reject(new Error("A different AdSense publisher script is already loaded."));
  }
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

/** One responsive, clearly labelled ad below eligible Web tool interfaces. */
export function AdSlot({ tool }: { tool: ToolMeta }) {
  const slotRef = useRef<HTMLModElement | null>(null);
  const [online, setOnline] = useState(false);
  const [failed, setFailed] = useState(false);
  const eligible = Boolean(adConfig && canShowAdForTool(tool, adConfig));

  useEffect(() => {
    let active = true;
    const update = () => { void isApplicationOnline().then((reachable) => { if (active) setOnline(reachable); }); };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      active = false;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const slot = slotRef.current;
    if (!eligible || !online || !adConfig || !slot || slot.dataset.envAdRequested === "true") return;
    let active = true;
    void loadAdSenseScript(adConfig.clientId).then(() => {
      if (!active || !slot.isConnected || slot.dataset.envAdRequested === "true") return;
      try {
        const queue = window.adsbygoogle ?? (window.adsbygoogle = []);
        // Non-personalized requests reduce profiling but do not replace required CMP consent.
        queue.requestNonPersonalizedAds = 1;
        queue.push({});
        slot.dataset.envAdRequested = "true";
      } catch {
        if (active) setFailed(true);
      }
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [eligible, online, tool.id]);

  if (!adConfig || !eligible || failed) return null;
  return (
    <aside
      data-ad-slot="tool"
      aria-label="Advertisement"
      className={online ? "mx-auto my-6 max-w-4xl rounded-xl border border-border bg-surface/50 p-2 text-center" : "hidden"}
    >
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">Advertisement</p>
      <ins
        ref={slotRef}
        className="adsbygoogle"
        style={{ display: "block", minHeight: 90 }}
        data-ad-client={adConfig.clientId}
        data-ad-slot={adConfig.toolSlotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
