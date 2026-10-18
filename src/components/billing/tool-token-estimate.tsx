import { useEffect, useState } from "react";
import { Coins, Info, Sparkles } from "lucide-react";

type Quote = {
  status: "quoted" | "requires-cost-measurement" | "premium-required";
  units: number;
  unitLabel: string;
  estimatedSubunits: number | null;
  estimatedTokens: number | null;
  estimatedUsdMicros: number | null;
  note: string;
  billingActive: boolean;
  priceStatus: "provisional" | string;
  aiAssistQuote?: { status: string; note: string } | null;
};

type State = { status: "loading" } | { status: "ready"; quote: Quote } | { status: "unavailable" };

function tokenLabel(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 3, minimumFractionDigits: 0 })} ${value === 1 ? "token" : "tokens"}`;
}

function usdLabel(micros: number): string {
  const amount = micros / 1_000_000;
  return amount > 0 && amount < 0.01 ? `$${amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}` : `$${amount.toFixed(2)}`;
}

export function ToolTokenEstimate({ toolId }: { toolId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void fetch("/api/billing/quote", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toolId, units: 1 }),
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json() as { ok?: boolean; data?: Quote };
      if (!response.ok || !payload.ok || !payload.data) throw new Error("Quote unavailable");
      setState({ status: "ready", quote: payload.data });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ status: "unavailable" });
    });
    return () => controller.abort();
  }, [toolId]);

  if (state.status === "loading") {
    return <div className="mt-3 flex items-center gap-2 text-xs text-muted" aria-live="polite"><Coins size={14} aria-hidden="true" /> Checking this tool's draft token estimate…</div>;
  }
  if (state.status !== "ready") return null;

  const quote = state.quote;
  const hasPrice = quote.status === "quoted" && quote.estimatedTokens !== null && quote.estimatedUsdMicros !== null;

  return (
    <aside className="mt-3 rounded-xl border border-border bg-surface-2 px-3 py-3 sm:px-4" aria-label="Tool token estimate">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-muted"><Coins size={17} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-fg">Draft token cost</p>
            {hasPrice ? <p className="text-sm font-medium text-fg">{tokenLabel(quote.estimatedTokens!)} per {quote.unitLabel}</p> : null}
            {hasPrice ? <p className="text-xs text-muted">({usdLabel(quote.estimatedUsdMicros!)} reference value)</p> : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">
            {hasPrice
              ? "Provisional rate only. The price is not finalized, and this release does not deduct tokens."
              : quote.status === "premium-required"
                ? "This capability is intended to require premium access. Actual execution will also use tokens; billing is not active."
                : "A reliable estimate depends on measured input size and provider/processing cost. A charge must not be made until that estimate is available."}
          </p>
          {quote.aiAssistQuote ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted"><Sparkles size={13} className="mt-0.5 shrink-0" aria-hidden="true" /> Optional AI assistance, when used, is metered separately from this tool's normal path and needs a measured provider-cost estimate.</p>
          ) : null}
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-subtle"><Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> Estimate only · no ads · no active charge</p>
        </div>
      </div>
    </aside>
  );
}
