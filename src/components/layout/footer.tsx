import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand/logo";
import { CATEGORIES } from "@/data/categories";
import homeTools from "@/data/home-tools.json";

const LINKS = [
  { to: "/about", label: "About" },
  { to: "/tools", label: "Tools" },
  { to: "/pricing", label: "Pricing" },
  { to: "/contact", label: "Contact" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
  { to: "/disclaimer", label: "Disclaimer" },
  { to: "/responsible-use", label: "Responsible use" },
] as const;

export function Footer() {
  const count = homeTools.counts.active;
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted">
            Useful tools. One place. {count} browser tools you can use without an account.
            Files and text stay on your device unless a tool says otherwise.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Product</p>
          <ul className="mt-3 space-y-2">
            {LINKS.slice(0, 4).map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-sm text-muted hover:text-fg">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Legal</p>
          <ul className="mt-3 space-y-2">
            {LINKS.slice(4).map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-sm text-muted hover:text-fg">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-subtle sm:px-6">
          <p>© {new Date().getFullYear()} enV</p>
          <p className="hidden sm:block">
            {CATEGORIES.length} categories · {count} live tools
          </p>
        </div>
      </div>
    </footer>
  );
}
