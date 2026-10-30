import { useEffect, useState } from "react";
import { getAnalyticsConsent, chooseAnalyticsConsent } from "@/lib/analytics/client";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

type Choice = "granted" | "denied" | "unset";

export function PrivacyControls() {
  const enabled = import.meta.env.VITE_ANALYTICS_ENABLED === "true";
  const [choice,setChoice] = useState<Choice>("unset");
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");

  useEffect(()=>{setChoice(getAnalyticsConsent());},[]);

  async function update(granted:boolean) {
    setSaving(true);setError("");setMessage("");
    try {
      await chooseAnalyticsConsent(granted);
      setChoice(granted?"granted":"denied");
      setMessage(granted?"Optional analytics consent saved.":"Analytics disabled. Pending local analytics events were removed.");
    } catch (reason) {
      setError(reason instanceof Error?reason.message:"Your privacy choice could not be saved.");
    } finally {setSaving(false);}
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="privacy-controls-heading">
      <h2 id="privacy-controls-heading" className="text-lg font-semibold text-fg">Your privacy choices</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Optional product analytics is separate from essential account/session handling. It uses browser storage and sends a bounded set of tool events only after you opt in. It does not use an advertising or cross-site tracking cookie.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-fg">
          {choice==="granted"?"Analytics allowed":choice==="denied"?"Analytics declined":"No choice recorded"}
        </span>
        {!enabled ? <span className="text-xs text-muted">Analytics is disabled in this Web build.</span> : null}
      </div>
      {enabled || choice==="granted" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {enabled ? <Button type="button" size="sm" onClick={()=>void update(true)} disabled={saving||choice==="granted"}>{saving?"Saving…":"Allow analytics"}</Button> : null}
          {choice!=="denied" ? <Button type="button" size="sm" variant="outline" onClick={()=>void update(false)} disabled={saving}>Decline / withdraw consent</Button> : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      {message ? <p role="status" className="mt-3 text-sm text-success">{message}</p> : null}
      <div className="mt-4 border-t border-border pt-4">
        <p className="text-sm leading-6 text-muted">
          You can clear local preferences, community visitor identity and dismissed update notices from your browser’s site-data settings. Clearing site data also removes local tool preferences and any unsent local queue. It does not erase previously submitted feedback or community posts stored on the service.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">
          To request access, correction or deletion of account data, use <a className="font-semibold text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com?subject=enV%20privacy%20request">envtoolkit@gmail.com</a>. Include the account email only in that private request, not in a public comment or tool input.
        </p>
        <Link to="/feedback" className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-accent underline underline-offset-4">Send private product feedback</Link>
      </div>
    </section>
  );
}
