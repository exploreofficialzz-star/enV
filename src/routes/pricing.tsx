import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/pricing")({ component: Pricing });

const tokenPackages = [
  { tokens: "100", price: "$0.30" },
  { tokens: "300", price: "$0.50" },
  { tokens: "500", price: "$0.80" },
  { tokens: "1,000", price: "$1.20" },
  { tokens: "5,000", price: "$5.00" },
];

function Pricing() {
  return (
    <AppShell>
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold">Pricing</h1>
        <p className="mt-3 text-muted">The token amounts and prices below are the schedule supplied by chAs Technologies LLC.</p>
        <p className="mt-2 text-sm text-muted">Prices are listed in USD. When payments are enabled, checkout is intended to convert the USD price to local currency in countries supported by the selected gateway. The final currency and total will be shown before you confirm payment; availability and conversion rates depend on the provider.</p>

        <aside className="mt-6 rounded-xl border border-accent/40 bg-surface-2 p-4" aria-live="polite">
          <p className="font-semibold text-fg">Planned pricing — purchases are not available yet</p>
          <p className="mt-1 text-sm text-muted">
            The current enV codebase does not include a token balance, checkout, or referral-award system. You cannot buy,
            redeem, or receive these tokens in the app at this time. This page lists the proposed schedule and is not a live offer.
          </p>
        </aside>

        <div className="mt-6 overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-2 bg-surface-2 px-4 py-3 text-sm font-semibold text-fg">
            <span>Tokens</span><span className="text-right">Price (USD)</span>
          </div>
          <dl>
            {tokenPackages.map(({ tokens, price }) => (
              <div key={tokens} className="grid grid-cols-2 border-t border-border px-4 py-3 text-sm">
                <dt>{tokens} tokens</dt><dd className="text-right font-medium text-fg">{price}</dd>
              </div>
            ))}
          </dl>
        </div>

        <section className="mt-6 space-y-3 rounded-xl border border-border p-4">
          <h2 className="font-semibold text-fg">Planned rewards</h2>
          <p><strong className="font-semibold text-fg">First sign-up bonus:</strong> 100 tokens.</p>
          <p><strong className="font-semibold text-fg">Referral reward:</strong> 50 tokens.</p>
          <p className="text-sm text-muted">
            Sign-up and referral rewards are not currently issued by the app. Eligibility and complete program rules will be
            published before the rewards become available.
          </p>
        </section>
        <p className="mt-6 text-sm text-muted">
          Questions about enV pricing can be sent to <a className="text-accent underline underline-offset-4" href="mailto:envtoolkit@gmail.com">envtoolkit@gmail.com</a>.
        </p>
      </section>
    </AppShell>
  );
}
