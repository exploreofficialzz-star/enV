import { useEffect, useRef, useState } from "react";
import type { ToolMeta } from "@/types/tool";
import { canShowAdForTool, isApplicationOnline, resolveAdConfig } from "@/lib/ads/policy";
import { loadAdSenseScript, whenGooglePrivacyConsentDataReady } from "@/lib/ads/browser";

const adConfig = resolveAdConfig({
  enabled: import.meta.env.VITE_ADS_ENABLED,
  privacyConfigured: import.meta.env.VITE_ADSENSE_PRIVACY_CONFIGURED,
  clientId: import.meta.env.VITE_ADSENSE_CLIENT_ID,
  toolSlotId: import.meta.env.VITE_ADSENSE_TOOL_SLOT_ID,
  toolIds: import.meta.env.VITE_AD_SUPPORTED_TOOL_IDS,
});

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
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") update();
    };
    const refreshHandle = window.setInterval(update, 15_000);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(refreshHandle);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const slot = slotRef.current;
    if (!eligible || !online || !adConfig || !slot || slot.dataset.envAdRequested === "true") return;
    let active = true;
    const queue = window.adsbygoogle ?? (window.adsbygoogle = []);
    // Do not let the publisher tag request an ad before CMP consent data is resolved.
    queue.pauseAdRequests = 1;
    whenGooglePrivacyConsentDataReady(() => {
      if (!active || !slot.isConnected || slot.dataset.envAdRequested === "true") return;
      try {
        const consentedQueue = window.adsbygoogle ?? (window.adsbygoogle = []);
        consentedQueue.requestNonPersonalizedAds = 1;
        consentedQueue.pauseAdRequests = 0;
        consentedQueue.push({});
        slot.dataset.envAdRequested = "true";
      } catch {
        if (active) setFailed(true);
      }
    });
    void loadAdSenseScript(adConfig.clientId).catch(() => {
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
