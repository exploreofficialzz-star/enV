import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand/logo";
import { CATEGORIES } from "@/data/categories";
import { activeCount } from "@/lib/registry";

const LEGAL_LINKS = [
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
  { to: "/disclaimer", label: "Disclaimer" },
  { to: "/responsible-use", label: "Responsible use" },
] as const;

export function Footer() {
  const count = activeCount();
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-3">
          <Logo />
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
            Useful tools. One place. {count} browser tools you can use without an account.
            Files and text stay on your device unless a tool says otherwise.
          </p>
        </div>
        <nav aria-label="Legal" className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Legal</p>
          <ul className="mt-3 space-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-sm text-muted hover:text-fg">{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-subtle sm:px-6">
          <p>© {new Date().getFullYear()} chAs Technologies LLC · enV</p>
          <p className="hidden sm:block">{CATEGORIES.length} categories · {count} live tools</p>
        </div>
      </div>
    </footer>
  );
}
