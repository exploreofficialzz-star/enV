import { useEffect, useState } from "react";
import { resolveAdConfig } from "@/lib/ads/policy";
import {
  loadAdSenseScript,
  reopenGooglePrivacySettings,
  whenGooglePrivacyMessagingReady,
} from "@/lib/ads/browser";

const adConfig = resolveAdConfig({
  enabled: import.meta.env.VITE_ADS_ENABLED,
  privacyConfigured: import.meta.env.VITE_ADSENSE_PRIVACY_CONFIGURED,
  clientId: import.meta.env.VITE_ADSENSE_CLIENT_ID,
  toolSlotId: import.meta.env.VITE_ADSENSE_TOOL_SLOT_ID,
  toolIds: import.meta.env.VITE_AD_SUPPORTED_TOOL_IDS,
});

export function AdPrivacyControls() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!adConfig) return;
    let active = true;
    whenGooglePrivacyMessagingReady(() => {
      if (active) setReady(true);
    });
    void loadAdSenseScript(adConfig.clientId).catch(() => {
      if (active) setReady(false);
    });
    return () => { active = false; };
  }, []);

  if (!adConfig || !ready) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-fg">Advertising privacy</h2>
      <p>Google's Privacy &amp; Messaging service manages advertising choices separately from enV analytics.</p>
      <button
        type="button"
        onClick={reopenGooglePrivacySettings}
        className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg hover:bg-surface"
      >
        Privacy and cookie settings
      </button>
    </section>
  );
}
