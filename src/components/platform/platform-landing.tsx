import { Link } from "@tanstack/react-router";
import { ArrowRight, Globe, Smartphone } from "lucide-react";

export function PlatformLanding({ platform }: { platform: "android" | "ios" }) {
  const nativeName = platform === "android" ? "Android" : "iOS";
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-4xl flex-col justify-center px-4 py-12 sm:px-6">
      <span className="inline-flex size-12 items-center justify-center rounded-xl border border-border bg-surface text-accent">
        <Smartphone className="size-6" />
      </span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-accent">{nativeName} web-tool handoff</p>
      <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-fg">Open enV tools in your {nativeName} browser</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        The native enV app stays native. Tools that run only in the Web product open here in your system browser, while native-ready tools continue to run inside the app.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link to="/tools" search={{ q: "" }} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
          Browse tools <ArrowRight className="size-4" />
        </Link>
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-fg">
          <Globe className="size-4" /> enV home
        </Link>
      </div>
    </main>
  );
}
