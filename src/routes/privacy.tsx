import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";
import { seoPageHead, pageSchema } from "@/lib/seo-metadata";
import { PrivacyControls } from "@/components/layout/privacy-controls";
import { AdPrivacyControls } from "@/components/layout/ad-privacy-controls";

export const Route = createFileRoute("/privacy")({
  head: () => seoPageHead({
    title: "enV Privacy Policy | Web, Android and iOS Data Handling",
    description: "Read how enV and chAs Technologies LLC handle device-stored preferences, local tool processing, connected media and AI services, account information, and operational data.",
    path: "/privacy",
    structuredData: pageSchema("enV Privacy Policy", "Privacy information for the enV Web, Android, and iOS experiences.", "/privacy", "WebPage")
  }),
  component: Privacy
});

function Privacy() {
  const advertisingEnabled = import.meta.env.VITE_ADS_ENABLED === "true";
  return (
    <InfoPage title="Privacy">
      <p><strong className="font-semibold text-fg">chAs Technologies LLC</strong>, a company registered in Delaware, USA, develops and operates enV. This notice describes the information handled by the enV Web, Android, and iOS experiences and how feature-specific processing works.</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Age requirement</h2>
        <p>enV is for people aged 13 or older and is not intended for children under 13. If you are under the age of majority where you live, any parent or guardian permission required by your local law still applies. Contact us if you believe a child under 13 has provided personal information through enV.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">A local-first toolkit—with some connected features</h2>
        <p>Many tools run directly on your device. When a tool needs a server, an AI model, or a media processor, information needed for that operation is sent to the enV service or the processor configured for that feature. Tool screens should be treated as the guide to whether a task is local or connected.</p>
        <p>Do not submit passwords, payment-card details, confidential business material, or sensitive personal information to a connected tool unless you have reviewed the relevant provider and are comfortable with its handling.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Information stored on your device</h2>
        <p>Depending on the platform and features you use, enV stores preferences such as theme, saved tools, recently opened tools, and per-tool usage counts for personal shortcuts on your device. The Web version uses browser storage for these preferences. The Web Contact Exchange tool also stores the contact-card fields and selected sharing fields you enter in that browser. This information remains until you clear the relevant browser or app data.</p>
        <p>Native Contact Exchange does not upload a profile to an enV account. When you deliberately activate Exchange, the fields shown in that feature are sent to nearby participating devices. Saving a received contact to your address book requires your separate action and the platform’s Contacts permission.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Connected tools and service providers</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong className="font-semibold text-fg">Documents and media:</strong> some tools upload the files you select to an enV processing endpoint or to a media processor configured for the deployment. The document endpoint uses a temporary working directory and removes it after the request finishes. Other processor or infrastructure retention depends on that service’s configuration and policies.</li>
          <li><strong className="font-semibold text-fg">AI features:</strong> when enabled, the task input needed to produce a response is sent through the enV server to the AI provider configured for that deployment. The code supports Groq, OpenRouter, and Google Gemini; the provider used can vary by task and server configuration. AI results may be cached briefly when caching is enabled. Provider handling and retention are governed in part by the provider’s terms and privacy practices.</li>
          <li><strong className="font-semibold text-fg">Sign-in:</strong> an account is not required for ordinary toolkit use. If sign-in is enabled for a deployment and you choose to use it, the identity provider and configured database process account and session information such as your email and profile details. Authentication uses session cookies.</li>
          {advertisingEnabled ? <li><strong className="font-semibold text-fg">Advertising on selected Web tools:</strong> Google AdSense may load on explicitly allowlisted, online, device-local tool pages. The ad provider may process request context and technical identifiers for ad delivery, fraud prevention, frequency capping and aggregated reporting. enV requests non-personalized ads, which are not based on your past behavior, but that setting does not mean no cookies or identifiers are used.</li> : null}
          <li><strong className="font-semibold text-fg">Operational infrastructure:</strong> hosting, network, and service providers may process connection and diagnostic data needed to deliver, secure, and troubleshoot the service.</li>
        </ul>
        <p>Provider availability, settings, and retention can change by deployment. enV does not promise that an external provider will retain or delete submitted content on a particular schedule. Review the provider information shown for the feature before sending information you consider sensitive.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Cookies, sessions, and account requests</h2>
        <p>Browser-local preferences use local storage. If an optional sign-in or AI feature is used, the service may set essential session cookies—for example, to maintain sign-in or apply abuse-prevention limits. These are not the same as a marketing-cookie profile.</p>
        <p>If you have used a sign-in-enabled deployment and want to ask about, correct, or delete account information, email <a className="text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com">envtoolkit@gmail.com</a>. Information stored only on your device can generally be removed by clearing that browser’s site data or the app’s local data.</p>
      </section>

      <PrivacyControls />
      <AdPrivacyControls />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Optional analytics</h2>
        <p>Optional product analytics helps chAs Technologies LLC understand which enV tools are used, whether tasks complete or fail, and how reliably Web, Android and iOS work online and offline. It is used to troubleshoot service quality and prioritise product improvements. It is separate from advertising, is not used to target advertisements, and is not sold. Analytics collection is disabled unless this deployment enables it and you actively choose to allow it. Declining does not prevent ordinary toolkit use.</p>
        <p>After you opt in, the service may receive event names (for example, app opened, tool viewed, started, completed, failed, cancelled or abandoned, and offline-sync outcomes), a catalogue tool ID, platform, approximate device class, normalised operating-system and browser family, coarse network category, online/offline status, application version, referrer category, bounded duration, machine-readable error code and a small allowlist of workflow metadata. A verified account reference may be associated when the server independently confirms your signed-in session. The service uses random installation and session identifiers to group events, but stores keyed HMAC digests rather than the raw identifiers. These records are pseudonymous, not necessarily anonymous.</p>
        <p>Analytics does not collect the contents of files, documents, contacts, clipboard data, comments, prompts, search terms, tool inputs, generated outputs, passwords, payment details, full page URLs, raw IP addresses, full user-agent strings, raw cookie values or advertising IDs. Free-form text and unapproved event properties are rejected by the analytics API.</p>
        <p><strong className="font-semibold text-fg">Retention:</strong> raw analytics events are currently retained for a 90-day window from receipt; the scheduled daily job removes events beyond that window. Daily aggregate snapshots and privacy-safe reports may be retained for up to 730 days. Those aggregates contain counts and totals by day, platform, tool and event type, not account, installation, session or event identifiers. A granted consent record is retained while consent remains active and is removed when you withdraw consent. Short-lived rate-limit records are deleted separately.</p>
        <p><strong className="font-semibold text-fg">Storage and service providers:</strong> analytics records are stored in the enV Supabase PostgreSQL project configured in region <code>eu-central-1</code>. Vercel provides application hosting and API execution. These infrastructure providers may process service, security and operational information under their own privacy and data-processing terms; the stated database region does not mean that every provider operation or support process occurs only in that region.</p>
        <p><strong className="font-semibold text-fg">Your choice and withdrawal:</strong> the Web client keeps a bounded pending-event queue in browser storage; Android and iOS keep separate bounded native queues. Choosing Decline or withdrawing consent immediately stops new local collection and clears the pending queue. When online, the client asks the server to remove that installation's raw events, rate-limit records and consent record. When offline, it keeps a revocation request and sends it after connectivity returns. Aggregate snapshots and reports already created may remain until their 730-day retention period expires because they no longer contain an installation or session identifier that can be used to isolate your events.</p>
        <p>You can change your choice in the privacy controls above. For an access, correction or deletion request, contact <a className="text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com?subject=enV%20analytics%20privacy%20request">envtoolkit@gmail.com</a>. Requests involving a signed-in account may require enough information to verify that account; do not send passwords or authentication tokens.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Community and public content</h2>
        <p>Comments, replies, chosen display labels, reactions, reports and blocks are stored as community records. Other users can see visible comments and selected display labels. Choosing “Anonymous” hides your display label from the public feed, but the service keeps a private pseudonymous abuse-prevention identifier so blocking, reporting and moderation can work. You can remove your own visible comments from the tool discussion. Moderators may hide or remove reported content.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Private product feedback</h2>
        <p>Feedback submitted through the feedback form is a private developer ticket, not a public comment. The report can include its category, platform, optional tool ID and app version, title and description. The form does not ask for your email address. Do not include passwords, authentication tokens, payment details or sensitive personal information. Resolved and closed tickets are scheduled for deletion under the stated retention period.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Service updates</h2>
        <p>Update dismissals are stored locally on your device. The public update feed returns published notices for the platform and release channel you request. Viewing a notice does not automatically enroll you in marketing communications or push notifications.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Payments and tokens</h2>
        <p>Token accounting records balances, reservations, and usage for supported operations. enV does not collect payment-card details directly through the toolkit. When payment or store purchase options are offered, the chosen provider, payment-data handling, token terms, refunds, and purchase-verification process should be disclosed before confirmation.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Changes and contact</h2>
        <p>We may revise this notice when product features, providers, or data practices change. The published version should be checked before using connected features.</p>
        <p>For privacy questions or requests, contact <a className="text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com">envtoolkit@gmail.com</a>. Company correspondence may also be sent to <a className="text-accent underline underline-offset-4" href="mailto:chastechnologiesllc@gmail.com">chastechnologiesllc@gmail.com</a>.</p>
      </section>
    </InfoPage>
  );
}
