import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Monitor, Moon, Settings as SettingsIcon, Smartphone, Sun, Tablet, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { usePrefs, type ThemePreference } from "@/lib/storage";
import type { ViewModePreference } from "@/lib/view-mode";

export const Route = createFileRoute("/settings")({ component: Settings });

const themeOptions: { value: ThemePreference; title: string; description: string; icon: typeof Sun }[] = [
  { value: "system", title: "System", description: "Follow your device's light or dark appearance.", icon: SettingsIcon },
  { value: "light", title: "Light", description: "Use the light enV theme.", icon: Sun },
  { value: "dark", title: "Dark", description: "Use the dark enV theme.", icon: Moon },
];

const viewOptions: { value: ViewModePreference; title: string; description: string; icon: typeof Monitor }[] = [
  { value: "auto", title: "Automatic", description: "Match the actual phone, tablet or computer using enV.", icon: SettingsIcon },
  { value: "mobile", title: "Mobile view", description: "Use the compact phone layout on this device.", icon: Smartphone },
  { value: "tablet", title: "Tablet view", description: "Use the tablet layout on this device.", icon: Tablet },
  { value: "desktop", title: "Desktop view", description: "Use the desktop layout, even on a smaller screen.", icon: Monitor },
];

function Settings() {
  const hydrated = usePrefs((state) => state.hydrated);
  const themePreference = usePrefs((state) => state.themePreference);
  const viewModePreference = usePrefs((state) => state.viewModePreference);
  const storageAvailable = usePrefs((state) => state.storageAvailable);
  const setThemePreference = usePrefs((state) => state.setThemePreference);
  const setViewMode = usePrefs((state) => state.setViewMode);

  function resetPreferences() {
    setThemePreference("system");
    setViewMode("auto");
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">
            <SettingsIcon size={15} aria-hidden="true" /> PREFERENCES
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Settings</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
            Personalize how enV looks and fits your screen. These choices apply across enV on this browser.
          </p>
        </header>

        {!hydrated ? (
          <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted" role="status">
            Loading your saved preferences…
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="appearance-heading">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><Sun size={19} aria-hidden="true" /></span>
                <div>
                  <h2 id="appearance-heading" className="text-lg font-semibold text-fg">Appearance</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">Choose the theme that feels most comfortable to use.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  const selected = themePreference === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setThemePreference(option.value)}
                      className={"relative flex min-h-28 items-start gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " + (selected ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}
                    >
                      <Icon size={19} className="mt-0.5 shrink-0 text-fg" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-fg">{option.title}</span>
                        <span className="mt-1 block text-sm leading-5 text-muted">{option.description}</span>
                      </span>
                      {selected ? <Check size={17} className="shrink-0 text-accent" aria-label="Selected" /> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="layout-heading">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><Monitor size={19} aria-hidden="true" /></span>
                <div>
                  <h2 id="layout-heading" className="text-lg font-semibold text-fg">Display mode</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Automatic detects the actual device: phones open in mobile view, tablets in tablet view, and computers in desktop view. Choose a manual mode to override that default.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {viewOptions.map((option) => {
                  const Icon = option.icon;
                  const selected = viewModePreference === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setViewMode(option.value)}
                      className={"relative flex min-h-32 items-start gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " + (selected ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}
                    >
                      <Icon size={19} className="mt-0.5 shrink-0 text-fg" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-fg">{option.title}</span>
                        <span className="mt-1 block text-sm leading-5 text-muted">{option.description}</span>
                      </span>
                      {selected ? <Check size={17} className="shrink-0 text-accent" aria-label="Selected" /> : null}
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-xs leading-5 text-muted">
                Automatic follows the device this browser is running on. Manual choices are saved locally and restored before the page is first displayed, including after a refresh.
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="accessibility-heading">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><Moon size={19} aria-hidden="true" /></span>
                <div>
                  <h2 id="accessibility-heading" className="text-lg font-semibold text-fg">Accessibility</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    enV respects your device's reduced-motion preference. You can also use your browser zoom, keyboard navigation, and built-in screen reader settings.
                  </p>
                  <Link to="/help-feedback" className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-accent underline underline-offset-4">Accessibility help & feedback</Link>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface-2 p-5 sm:p-6" aria-labelledby="local-settings-heading">
              <h2 id="local-settings-heading" className="font-semibold text-fg">Saved on this device</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Appearance and display-mode preferences are stored locally in this browser. They are not an account-wide sync setting.
              </p>
              {!storageAvailable ? (
                <p className="mt-3 rounded-xl border border-warn/30 bg-surface px-3 py-2 text-sm leading-6 text-muted" role="status">
                  Browser storage is unavailable. Your changes can apply now, but may not persist after this page closes.
                </p>
              ) : null}
              <button
                type="button"
                onClick={resetPreferences}
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-fg transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <RotateCcw size={16} aria-hidden="true" /> Reset appearance and display mode
              </button>
            </section>
          </div>
        )}
      </main>
    </AppShell>
  );
}
