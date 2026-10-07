import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <InfoPage title="Terms of Use">
      <p>These Terms apply when you use enV on the Web, Android, or iOS. enV is developed and operated by chAs Technologies LLC. By using the service, you agree to use it lawfully and in accordance with these Terms and the Responsible Use policy.</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Eligibility</h2>
        <p>You must be at least 13 years old to use enV. If you are under the age of majority where you live, use enV only with any parent or guardian permission required by local law and follow any applicable local restrictions.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Governing Law and Venue</h2>
        <p>These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict-of-law principles. Subject to non-waivable consumer rights and mandatory laws that apply where you live, disputes arising from or relating to these Terms will be brought in the state or federal courts located in Delaware, and the parties consent to those courts’ jurisdiction and venue. Nothing in this section limits a right or remedy that cannot lawfully be waived.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Using enV</h2>
        <p>enV provides practical tools, calculators, generators, converters, and optional connected features. You are responsible for the information you submit, the permissions you grant, and how you use any output. Do not use enV in a way that violates law, another person’s rights, or a third-party service’s terms.</p>
        <p>Some features work on your device; others may require a network connection or send the information needed for the task to enV’s configured service providers. Availability and capabilities may differ by platform and deployment.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Accounts and contact exchange</h2>
        <p>An account is not required for ordinary toolkit use. Where sign-in is enabled, you are responsible for protecting access to your account and for activity under it. Contact Exchange is optional: when you activate it, selected contact fields are shared with nearby participants. You are responsible for choosing what to share and for having permission to share it.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Your content and tool results</h2>
        <p>You must have the necessary rights and permissions for any text, files, images, contact details, or other material you submit. Outputs may be incomplete, inaccurate, unsuitable for your purpose, or similar to outputs received by other users. Review and independently verify results before using, publishing, or acting on them.</p>
        <p>Do not rely on enV as a substitute for qualified legal, medical, financial, tax, safety, or other professional advice. See the Disclaimer for more detail.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Availability and changes</h2>
        <p>We may update, suspend, or discontinue a tool or feature to maintain, improve, or protect enV. We do not guarantee that the service will be uninterrupted, error-free, compatible with every device, or available in every location. Third-party features are also subject to the availability and terms of their providers.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Tokens and pricing</h2>
        <p>The listed reference prices are in USD. The token packages, sign-up bonus, and referral reward shown on the Pricing page are planned offers. The current codebase does not implement token balances, purchases, or reward issuance; no purchase can currently be made through enV. When payments are enabled, checkout is intended to convert the USD price to local currency in countries supported by the selected gateway. The final amount and currency will be shown before payment; availability and conversion rates depend on the provider. Any future token terms, eligibility requirements, expiry, refunds, and payment-provider terms will be shown before a purchase or reward program is activated.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Disclaimer and limits</h2>
        <p>To the extent permitted by applicable law, enV is provided “as is” and “as available,” without warranties that cannot be disclaimed under that law. To the extent permitted by applicable law, chAs Technologies LLC is not responsible for indirect or consequential losses arising from use of the service. Nothing in these Terms excludes a right or liability that cannot lawfully be excluded.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Questions</h2>
        <p>For questions about these Terms, contact <a className="text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com">envtoolkit@gmail.com</a> or <a className="text-accent underline underline-offset-4" href="mailto:chastechnologiesllc@gmail.com">chastechnologiesllc@gmail.com</a>.</p>
      </section>
    </InfoPage>
  );
}
