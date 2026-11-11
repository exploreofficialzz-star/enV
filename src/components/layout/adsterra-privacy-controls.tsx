import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getAdsterraConsent, isAdsterraEnabled, setAdsterraConsent, type AdsterraConsent } from "@/lib/ads/adsterra";

export function AdsterraPrivacyControls() {
  const [choice, setChoice] = useState<AdsterraConsent>("unset");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const refresh = () => setChoice(getAdsterraConsent());
    refresh();
    window.addEventListener("env:adsterra-consent-changed", refresh);
    return () => window.removeEventListener("env:adsterra-consent-changed", refresh);
  }, []);

  if (!isAdsterraEnabled()) return null;

  function update(granted: boolean) {
    setAdsterraConsent(granted ? "granted" : "denied");
    setChoice(granted ? "granted" : "denied");
    if (granted) {
      setMessage("Advertising is enabled for this browser. Adsterra placements load on supported online pages.");
    } else {
      window.location.reload();
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="adsterra-privacy-heading">
      <h2 id="adsterra-privacy-heading" className="text-lg font-semibold text-fg">Adsterra advertising choices</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Advertising helps support enV. When you allow it, Adsterra and its advertising partners may process your IP address, browser and device information, page URL and referrer, and may use cookies or similar storage for ad delivery, frequency capping, fraud prevention and measurement.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-fg">
          {choice === "granted" ? "Advertising allowed" : choice === "denied" ? "Advertising declined" : "No advertising choice"}
        </span>
        {choice !== "granted" ? (
          <Button type="button" size="sm" onClick={() => update(true)}>Allow advertising</Button>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => update(false)}>Withdraw consent</Button>
        )}
        {choice === "unset" ? (
          <Button type="button" size="sm" variant="outline" onClick={() => update(false)}>Decline advertising</Button>
        ) : null}
      </div>
      {message ? <p className="mt-3 text-sm text-success" role="status">{message}</p> : null}
      <p className="mt-3 text-xs leading-5 text-muted">
        Changing this choice does not affect access to enV tools. See the <a className="underline underline-offset-4" href="https://adsterra.com/privacy-policy-managed/" target="_blank" rel="noreferrer">Adsterra privacy policy</a> for the provider's handling of advertising data.
      </p>
    </section>
  );
}
