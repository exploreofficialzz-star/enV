import { createFileRoute } from "@tanstack/react-router";
import { BriefcaseBusiness, Mail, MessageCircle } from "lucide-react";
import { SocialLinks } from "@/components/social/social-links";
import { InfoPage } from "@/components/layout/info-page";

export const Route = createFileRoute("/contact")({ component: Contact });

function Contact() {
  return (
    <InfoPage title="Contact">
      <div className="space-y-8">
        <section className="max-w-3xl">
          <p className="text-base leading-7 text-muted">
            Have a question, spotted something we can improve, or want to discuss working together? Choose the contact route that best fits your message. We aim to make it clear where product feedback should go and where company inquiries belong.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2" aria-label="Contact options">
          <article className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-accent">
              <MessageCircle size={21} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-fg">enV product support</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              For help using the toolkit, product feedback, accessibility concerns, bug reports, or ideas for improving enV.
            </p>
            <a
              className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline underline-offset-4"
              href="mailto:envtoolkit@gmail.com"
            >
              <Mail size={16} aria-hidden="true" />
              envtoolkit@gmail.com
            </a>
          </article>

          <article className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-accent">
              <BriefcaseBusiness size={21} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-fg">chAs Technologies LLC</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              For business proposals, partnerships, media inquiries, and other company-related correspondence.
            </p>
            <a
              className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline underline-offset-4"
              href="mailto:chastechnologiesllc@gmail.com"
            >
              <Mail size={16} aria-hidden="true" />
              chastechnologiesllc@gmail.com
            </a>
          </article>
        </section>

        <section className="rounded-xl border border-border bg-surface-2 p-4 sm:p-5">
          <h2 className="font-semibold text-fg">A quick note before you write</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Please include enough non-sensitive context for us to understand your question. Do not send passwords, payment-card details, recovery codes, or other sensitive personal information by ordinary email.
          </p>
        </section>

        <SocialLinks brand="env" />
        <SocialLinks brand="chas" />
      </div>
    </InfoPage>
  );
}
