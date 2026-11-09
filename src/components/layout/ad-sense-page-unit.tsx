import { useEffect, useRef, useState } from "react";
import { isApplicationOnline } from "@/lib/ads/policy";
import { loadAdSenseScript, whenGooglePrivacyConsentDataReady } from "@/lib/ads/browser";
import { resolveAdPageUnits, type AdPageUnitFormat } from "@/lib/ads/page-units";

const pageAdUnits = resolveAdPageUnits({
  enabled: import.meta.env.VITE_ADS_ENABLED,
  privacyConfigured: import.meta.env.VITE_ADSENSE_PRIVACY_CONFIGURED,
  clientId: import.meta.env.VITE_ADSENSE_CLIENT_ID,
  inFeedSlotId: import.meta.env.VITE_ADSENSE_IN_FEED_SLOT_ID,
  inFeedLayoutKey: import.meta.env.VITE_ADSENSE_IN_FEED_LAYOUT_KEY,
  inArticleSlotId: import.meta.env.VITE_ADSENSE_IN_ARTICLE_SLOT_ID,
  multiplexSlotId: import.meta.env.VITE_ADSENSE_MULTIPLEX_SLOT_ID,
});

/** Consent-gated editorial ad unit. No provider request occurs until online and CMP-ready. */
export function AdSensePageUnit({ format }: { format: AdPageUnitFormat }) {
  const unit = pageAdUnits?.[format];
  const slotRef = useRef<HTMLModElement | null>(null);
  const [online, setOnline] = useState(false);
  const [failed, setFailed] = useState(false);
  const configured = Boolean(unit);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    const update = () => {
      void isApplicationOnline().then((reachable) => {
        if (active) setOnline(reachable);
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
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
  }, [configured]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!unit || !online || !slot || slot.dataset.envAdRequested === "true") return;

    let active = true;
    const queue = window.adsbygoogle ?? (window.adsbygoogle = []);
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
    void loadAdSenseScript(unit.clientId).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [unit, online]);

  if (!unit || !online || failed) return null;

  return (
    <aside
      data-ad-slot={format}
      aria-label="Advertisement"
      className={format === "in-feed"
        ? "col-span-full mx-auto my-2 w-full max-w-4xl rounded-xl border border-border bg-surface/50 p-2 text-center"
        : "mx-auto my-6 w-full max-w-3xl rounded-xl border border-border bg-surface/50 p-3 text-center"}
    >
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">Advertisement</p>
      <ins
        ref={slotRef}
        className="adsbygoogle"
        style={{ display: "block", minHeight: format === "multiplex" ? 180 : 100, textAlign: "center" }}
        data-ad-client={unit.clientId}
        data-ad-slot={unit.slotId}
        data-ad-format={format === "multiplex" ? "autorelaxed" : "fluid"}
        data-ad-layout={format === "in-article" ? "in-article" : undefined}
        data-ad-layout-key={format === "in-feed" ? unit.layoutKey : undefined}
      />
    </aside>
  );
}
