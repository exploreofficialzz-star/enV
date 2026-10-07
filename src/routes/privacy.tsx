import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
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
        <p>Depending on the platform and features you use, enV stores preferences such as theme, saved tools, and recently opened tools on your device. The Web version uses browser storage for these preferences. The Web Contact Exchange tool also stores the contact-card fields and selected sharing fields you enter in that browser. This information remains until you clear the relevant browser or app data.</p>
        <p>Native Contact Exchange does not upload a profile to an enV account. When you deliberately activate Exchange, the fields shown in that feature are sent to nearby participating devices. Saving a received contact to your address book requires your separate action and the platform’s Contacts permission.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Connected tools and service providers</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong className="font-semibold text-fg">Documents and media:</strong> some tools upload the files you select to an enV processing endpoint or to a media processor configured for the deployment. The document endpoint uses a temporary working directory and removes it after the request finishes. Other processor or infrastructure retention depends on that service’s configuration and policies.</li>
          <li><strong className="font-semibold text-fg">AI features:</strong> when enabled, the task input needed to produce a response is sent through the enV server to the AI provider configured for that deployment. The code supports Groq, OpenRouter, and Google Gemini; the provider used can vary by task and server configuration. AI results may be cached briefly when caching is enabled. Provider handling and retention are governed in part by the provider’s terms and privacy practices.</li>
          <li><strong className="font-semibold text-fg">Sign-in:</strong> an account is not required for ordinary toolkit use. If sign-in is enabled for a deployment and you choose to use it, the identity provider and configured database process account and session information such as your email and profile details. Authentication uses session cookies.</li>
          <li><strong className="font-semibold text-fg">Operational infrastructure:</strong> hosting, network, and service providers may process connection and diagnostic data needed to deliver, secure, and troubleshoot the service.</li>
        </ul>
        <p>Provider availability, settings, and retention can change by deployment. enV does not promise that an external provider will retain or delete submitted content on a particular schedule. Review the provider information shown for the feature before sending information you consider sensitive.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Cookies, sessions, and account requests</h2>
        <p>Browser-local preferences use local storage. If an optional sign-in or AI feature is used, the service may set essential session cookies—for example, to maintain sign-in or apply abuse-prevention limits. These are not the same as a marketing-cookie profile.</p>
        <p>If you have used a sign-in-enabled deployment and want to ask about, correct, or delete account information, email <a className="text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com">envtoolkit@gmail.com</a>. Information stored only on your device can generally be removed by clearing that browser’s site data or the app’s local data.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Payments and tokens</h2>
        <p>The current enV codebase does not provide token balances, token purchases, or referral awards, and does not collect payment-card information through a checkout. The figures on the Pricing page are the proposed schedule supplied by chAs Technologies LLC, not an active purchase offer. If payments are introduced, the applicable payment provider and data handling will be described before checkout is enabled.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Changes and contact</h2>
        <p>We may revise this notice when product features, providers, or data practices change. The published version should be checked before using connected features.</p>
        <p>For privacy questions or requests, contact <a className="text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com">envtoolkit@gmail.com</a>. Company correspondence may also be sent to <a className="text-accent underline underline-offset-4" href="mailto:chastechnologiesllc@gmail.com">chastechnologiesllc@gmail.com</a>.</p>
      </section>
    </InfoPage>
  );
}
