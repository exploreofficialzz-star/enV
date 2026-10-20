import { createFileRoute } from "@tanstack/react-router";
import { SocialLinks } from "@/components/social/social-links";
import { InfoPage } from "@/components/layout/info-page";

export const Route = createFileRoute("/about")({ component: About });

function About() {
  return (
    <InfoPage title="About enV">
      <div className="space-y-8">
        <section className="rounded-2xl border border-border bg-surface-2 p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">About the platform</p>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold leading-tight text-fg sm:text-3xl">
            Useful digital tools, brought together in one focused workspace.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
            enV brings practical calculators, converters, generators, and creator and developer utilities into one searchable workspace. Browse by category or search by task to find a tool, understand what it does, and get on with your work without unnecessary friction.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
            Use enV on the web, Android, or iOS. Our focus is practical functionality, clear guidance, and a consistent experience across devices.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3" aria-label="What enV offers">
          <article className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-semibold text-fg">Find the right tool</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Browse categories or search by the task you need to complete, from everyday calculations to creative and technical work.
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-semibold text-fg">Work across devices</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Access enV from desktop and mobile browsers or through the dedicated Android and iOS apps.
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-semibold text-fg">Understand how tools work</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Many tools run on your device. For connected features, review the tool-specific guidance and Privacy page so you understand when a server or external provider is involved.
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="flex items-center">
              <img
                src="/chas-technologies-logo-transparent.webp"
                alt="chAs Technologies LLC logo"
                width={600}
                height={173}
                className="h-auto w-full object-contain dark:hidden"
              />
              <img
                src="/chas-technologies-logo-dark.webp"
                alt=""
                aria-hidden="true"
                width={600}
                height={173}
                className="hidden h-auto w-full object-contain dark:block"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">The company behind enV</p>
              <h2 className="mt-2 text-xl font-semibold text-fg">chAs Technologies LLC</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                enV is developed and operated by chAs Technologies LLC, a company registered in Delaware, USA. The company builds practical digital products designed to make useful tools easier to discover and use.
              </p>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="font-medium text-fg">Product support</p>
                  <a className="text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com">envtoolkit@gmail.com</a>
                </div>
                <div>
                  <p className="font-medium text-fg">Business and partnership inquiries</p>
                  <a className="text-accent underline underline-offset-4" href="mailto:chastechnologiesllc@gmail.com">chastechnologiesllc@gmail.com</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <SocialLinks brand="env" />
        <SocialLinks brand="chas" />
      </div>
    </InfoPage>
  );
}
