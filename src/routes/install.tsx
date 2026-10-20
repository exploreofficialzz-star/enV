import { useEffect, useState, useSyncExternalStore } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Download, ExternalLink, Laptop, Monitor, Smartphone } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import {
  getPwaInstallServerSnapshot,
  getPwaInstallState,
  promptEnVInstallation,
  subscribePwaInstallState,
  type InstallChoice,
} from "@/lib/pwa-install";

export const Route = createFileRoute("/install")({ component: InstallPage });

type Platform = "ios" | "android" | "desktop" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  const touchPoints = navigator.maxTouchPoints || 0;
  const isiPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  if (isiPad || /iPhone|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (!/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return "desktop";
  return "other";
}

function InstallPage() {
  const install = useSyncExternalStore(subscribePwaInstallState, getPwaInstallState, getPwaInstallServerSnapshot);
  const [platform, setPlatform] = useState<Platform>("other");
  const [isPrompting, setIsPrompting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setPlatform(detectPlatform()), []);

  async function installApp() {
    setIsPrompting(true);
    setNotice(null);
    const outcome: InstallChoice = await promptEnVInstallation();
    if (outcome === "accepted") setNotice("The browser accepted the installation request. Follow any remaining browser prompts to finish setup.");
    else if (outcome === "dismissed") setNotice("Installation was cancelled. You can try again if your browser offers the install option.");
    else setNotice("An in-page installation prompt is not available here. Follow the browser-specific steps below.");
    setIsPrompting(false);
  }

  const platformInstructions: Record<Platform, { title: string; steps: string[]; icon: typeof Monitor }> = {
    ios: {
      title: "On iPhone or iPad",
      steps: [
        "Open enV in a browser that supports adding sites to the Home Screen.",
        "Open the Share menu in the browser.",
        "Choose Add to Home Screen, review the name, and tap Add.",
      ],
      icon: Smartphone,
    },
    android: {
      title: "On Android",
      steps: [
        "Open enV in your browser and open the browser menu.",
        "Choose Install app or Add to Home screen (the wording depends on the browser).",
        "Review the prompt and confirm to add enV to your device.",
      ],
      icon: Smartphone,
    },
    desktop: {
      title: "On a desktop or laptop",
      steps: [
        "Look for the install icon in your browser's address bar, or open the browser menu.",
        "In Chrome, look for Install page as app. In Edge, look under Apps for the install option.",
        "Confirm the browser prompt. If installation is unavailable, use your browser's Create shortcut or bookmark option instead.",
      ],
      icon: Laptop,
    },
    other: {
      title: "Use your browser's menu",
      steps: [
        "Open the browser menu or Share menu while viewing enV.",
        "Look for Install app, Add to Home screen, Create shortcut, or Bookmark.",
        "Follow the browser's prompts. Available options depend on your browser and device.",
      ],
      icon: Monitor,
    },
  };

  const instructions = platformInstructions[platform];
  const InstructionsIcon = instructions.icon;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">
            <Download size={15} aria-hidden="true" /> GET enV
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Install enV or create a shortcut</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
            Add enV to your device for easier access. When your browser supports app installation, you can use its official install prompt. Otherwise, follow the steps for your device.
          </p>
        </header>

        {install.installed ? (
          <section className="rounded-2xl border border-ok/30 bg-surface p-5 sm:p-6" aria-labelledby="installed-heading">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><CheckCircle2 size={22} aria-hidden="true" /></span>
              <div className="flex-1">
                <h2 id="installed-heading" className="text-lg font-semibold text-fg">enV appears to be installed</h2>
                <p className="mt-2 text-sm leading-6 text-muted">You can open enV from your device's app launcher or Home Screen. The installed app's availability is managed by your browser or operating system.</p>
                <Link to="/" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">Open enV <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="install-now-heading">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><Download size={21} aria-hidden="true" /></span>
              <div className="flex-1">
                <h2 id="install-now-heading" className="text-lg font-semibold text-fg">Install directly from this page</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  This option appears only when the browser provides a valid installation prompt. enV cannot bypass the browser's permission or silently create shortcuts.
                </p>
                {install.canInstall ? (
                  <button
                    type="button"
                    disabled={isPrompting}
                    onClick={() => void installApp()}
                    className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <Download size={17} aria-hidden="true" /> {isPrompting ? "Opening browser prompt…" : "Install enV"}
                  </button>
                ) : (
                  <p className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm leading-6 text-muted" role="status">
                    Your current browser has not provided an in-page install prompt. Use the device-specific instructions below or look for the browser's own install option.
                  </p>
                )}
                {notice ? <p className="mt-3 text-sm leading-6 text-muted" role="status">{notice}</p> : null}
              </div>
            </div>
          </section>
        )}

        <section className="mt-5 rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="manual-install-heading">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><InstructionsIcon size={21} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <h2 id="manual-install-heading" className="text-lg font-semibold text-fg">{instructions.title}</h2>
              <ol className="mt-4 space-y-3">
                {instructions.steps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3 text-sm leading-6 text-muted">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-xs font-semibold text-fg">{index + 1}</span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
              {platform === "ios" ? (
                <a href="/?install=1&platform=ios" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-fg transition hover:bg-surface-2">
                  Open the illustrated iPhone/iPad guide <ExternalLink size={15} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-surface-2 p-5 sm:p-6">
          <h2 className="font-semibold text-fg">What installing does—and does not do</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-fg">What to expect</h3>
              <p className="mt-1 text-sm leading-6 text-muted">An app-style entry point, where supported, with enV's name and icon supplied by the existing web app manifest.</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">Your choice remains yours</h3>
              <p className="mt-1 text-sm leading-6 text-muted">Your browser controls installation. This page does not download an executable, change browser settings, or send your information to install a shortcut.</p>
            </div>
          </div>
        </section>

        <nav aria-label="Installation help" className="mt-7 flex flex-wrap gap-4 text-sm font-semibold">
          <Link to="/help" className="inline-flex min-h-10 items-center text-accent underline underline-offset-4">Help center</Link>
          <Link to="/help-feedback" className="inline-flex min-h-10 items-center text-accent underline underline-offset-4">Help & feedback</Link>
          <Link to="/contact" className="inline-flex min-h-10 items-center text-accent underline underline-offset-4">Contact support</Link>
        </nav>
      </main>
    </AppShell>
  );
}
