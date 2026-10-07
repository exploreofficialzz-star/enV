import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";

export const Route = createFileRoute("/contact")({ component: Contact });

function Contact() {
  return (
    <InfoPage title="Contact">
      <p>Choose the address that best matches your inquiry. We will use your message to respond to the request you send.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface-2 p-4">
          <h2 className="font-semibold text-fg">enV product support</h2>
          <p className="mt-2">Questions, feedback, accessibility concerns, or help using the toolkit.</p>
          <a className="mt-3 inline-block font-medium text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com">
            envtoolkit@gmail.com
          </a>
        </section>
        <section className="rounded-xl border border-border bg-surface-2 p-4">
          <h2 className="font-semibold text-fg">Company inquiries</h2>
          <p className="mt-2">Business, partnership, and company-related correspondence for chAs Technologies LLC.</p>
          <a className="mt-3 inline-block font-medium text-accent underline underline-offset-4" href="mailto:chastechnologiesllc@gmail.com">
            chastechnologiesllc@gmail.com
          </a>
        </section>
      </div>
      <p className="text-sm">Please do not include passwords, payment-card details, or other highly sensitive information in ordinary email.</p>
    </InfoPage>
  );
}
