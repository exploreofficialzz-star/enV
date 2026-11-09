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
    const re¶»§q«^