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
            A practical toolkit for everyday digital work.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
            enV brings useful tools, calculators, converters, generators, and creator and developer utilities together in one searchable workspace. Find the tool that fits your task, understand what it does, and get on with your work without unnecessary friction.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
            enV is available on the web and through dedicated Android and iOS apps, with a focus on clear workflows and practical everyday use.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-semibold text-fg">One useful workspace</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Browse by category or search by task to find utilities for calculations, conversions, content, files, and technical work.
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-semibold text-fg">Made for your devices</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Use enV on desktop, mobile web, Android, or iOS, with layouts designed to work comfortably across screen sizes.
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-semibold text-fg">Clear about processing</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Many tools work on your device. When a feature needs a server or an external provider, review the tool's guidance and our Privacy page before proceeding.
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="rounded-xl border border-border bg-white p-3">
              <img
                src="/chas-technologies-logo.jpg"
                alt="chAs Technologies LLC logo"
                width={960}
                height={300}
                className="h-auto w-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">The company behind enV</p>
              <h2 className="mt-2 text-xl font-semibold text-fg">Built by chAs Technologies LLC</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                enV is developed and operated by chAs Technologies LLC, a company registered in Delaware, USA. The team works to make useful digital tools easier to discover and more straightforward to use.
              </p>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="font-medium text-fg">Product questions</p>
                  <a className="text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com">envtoolkit@gmail.com</a>
                </div>
                <div>
                  <p className="font-medium text-fg">Company and partnership inquiries</p>
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
