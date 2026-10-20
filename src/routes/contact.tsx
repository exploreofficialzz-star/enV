import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { SocialLinks } from "@/components/social/social-links";
import { InfoPage } from "@/components/layout/info-page";

export const Route = createFileRoute("/contact")({ component: Contact });

function Contact() {
  return (
    <InfoPage title="Contact">
      <div className="space-y-8">
        <section className="max-w-3xl">
          <p className="text-base leading-7 text-muted">
            Whether you need product support, want to share feedback, or would like to discuss working together, choose the contact route that best matches your message.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2" aria-label="Contact options">
          <article className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex min-h-[56px] items-center sm:min-h-[64px]">
              <img
                src="/logo-home-transparent.png"
                alt="enV logo"
                width={813}
                height={317}
                className="h-[56px] w-[142px] object-contain dark:hidden sm:h-[64px] sm:w-[163px]"
              />
              <img
                src="/logo-home-dark.png"
                alt=""
                aria-hidden="true"
                width={813}
                height={317}
                className="hidden h-[56px] w-[142px] object-contain dark:block sm:h-[64px] sm:w-[163px]"
              />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-fg">enV product support</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              For help using enV, bug reports, accessibility feedback, and suggestions about tools or workflows.
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
            <div className="flex h-12 w-12 items-center justify-center">
              <img
                src="/env-brand-mark-transparent.webp"
                alt="enV brand mark"
                width={48}
                height={48}
                className="h-12 w-12 object-contain"
              />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-fg">chAs Technologies LLC</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              For business proposals, partnership opportunities, media requests, and other company-related matters.
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
          <h2 className="font-semibold text-fg">Protect your information</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Never send passwords, one-time verification codes, payment-card details, recovery codes, or other sensitive personal information by ordinary email. Include only the non-sensitive context needed to explain your question or issue.
          </p>
        </section>

        <SocialLinks brand="env" />
        <SocialLinks brand="chas" />
      </div>
    </InfoPage>
  );
}
