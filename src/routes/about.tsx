import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";

export const Route = createFileRoute("/about")({ component: About });

function About() {
  return (
    <InfoPage title="About enV">
      <div className="space-y-6">
        <img
          src="/chas-technologies-logo.jpg"
          alt="chAs Technologies LLC"
          width={960}
          height={300}
          className="h-auto w-full max-w-[520px] rounded-2xl border border-border bg-white object-contain"
        />
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-fg">A focused toolkit for everyday work</h2>
          <p>
            enV brings practical utilities together in one place across Web, Android, and iOS. Browse by category,
            search for a tool, and use the tools that fit your task.
          </p>
          <p>
            enV is developed and operated by <strong className="font-semibold text-fg">chAs Technologies LLC</strong>, a company registered in Delaware, USA.
            Some tools process information on your device; features that need a server or an external provider make
            that clear in their use and are described in our Privacy page.
          </p>
        </section>
        <section className="space-y-2 rounded-xl border border-border bg-surface-2 p-4">
          <h2 className="font-semibold text-fg">Company</h2>
          <p>chAs Technologies LLC</p>
          <p>
            Product inquiries: <a className="text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com">envtoolkit@gmail.com</a>
          </p>
          <p>
            Company inquiries: <a className="text-accent underline underline-offset-4" href="mailto:chastechnologiesllc@gmail.com">chastechnologiesllc@gmail.com</a>
          </p>
        </section>
      </div>
    </InfoPage>
  );
}
