import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, Smartphone, X } from "lucide-react";

export const Route = createFileRoute("/pair-native")({ component: NativePairingPage });

type PairingPlatform = "android" | "ios";
type PairingCode = { platform: PairingPlatform; code: string; expiresAt: string };

function NativePairingPage() {
  const [platform, setPlatform] = useState<PairingPlatform>("android");
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("platform");
    if (requested === "android" || requested === "ios") setPlatform(requested);
  }, []);

  async function generateCode() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setPairing(null);
    try {
      const response = await fetch("/api/billing/offline/pairing", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ platform }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        data?: { pairingCode?: string; expiresAt?: string };
        error?: string;
        message?: string;
      } | null;
      if (!response.ok || !payload?.ok || !payload.data?.pairingCode || !payload.data.expiresAt) {
        if (response.status === 401 || payload?.error === "AUTH_REQUIRED") {
          throw new Error("Sign in to your enV account in this browser, then return here to generate a code.");
        }
        throw new Error(payload?.message ?? "A pairing code could not be generated. No account or wallet data was changed.");
      }
      setPairing({ platform, code: payload.data.pairingCode, expiresAt: payload.data.expiresAt });
      setMessage({ kind: "success", text: "Pairing code created. Enter it in the enV app before it expires." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "A pairing code could not be generated. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.code);
      setMessage({ kind: "success", text: "Pairing code copied. Return to enV and enter the code." });
    } catch {
      setMessage({ kind: "error", text: "Clipboard access was blocked. You can select the code and copy it manually." });
    }
  }

  const expiresAt = pairing ? new Date(pairing.expiresAt) : null;
  const expiryLabel = expiresAt && Number.isFinite(expiresAt.getTime())
    ? expiresAt.toLocaleString()
    : "soon";

  return (
    <main className="min-h-dvh px-4 py-10 text-fg sm:py-16">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl border border-border bg-surface text-fg">
            <Smartphone size={21} aria-hidden="true"/>
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">enV device connection</p>
            <h1 className="text-xl font-semibold sm:text-2xl">Pair your native app</h1>
          </div>
        </div>
        <section className="rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <p className="text-sm leading-6 text-muted">
            Generate a one-time code for your Android or iOS app. Codes are short-lived and can only be used to pair the selected platform.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2" aria-label="Choose device platform">
            {(["android", "ios"] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={platform === choice}
                onClick={() => { setPlatform(choice); setPairing(null); setMessage(null); }}
                className={"min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                  (platform === choice ? "border-accent bg-accent/5 text-fg" : "border-border bg-surface text-muted hover:bg-surface-2")}
              >
                {choice === "android" ? "Android" : "iOS"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void generateCode()}
            disabled={busy}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#3df1c2] px-4 py-3 text-sm font-semibold text-[#052a2a] transition hover:bg-[#74f9d7] disabled:cursor-wait disabled:opacity-60"
          >
            <Smartphone size={17} aria-hidden="true"/>
            {busy ? "Generating secure code…" : pairing ? "Generate a new code" : "Generate pairing code"}
          </button>

          {pairing ? (
            <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Your one-time code</p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><Check size={14} aria-hidden="true"/> Created</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded-xl border border-border bg-surface px-3 py-3 text-center text-lg font-semibold tracking-[0.14em]">{pairing.code}</code>
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-2"
                  aria-label="Copy pairing code"
                  title="Copy pairing code"
                >
                  <Copy size={17} aria-hidden="true"/>
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted">Expires: {expiryLabel}. Keep the code private and use it only in the enV app you selected.</p>
            </div>
          ) : null}

          {message ? (
            <p role="status" aria-live="polite" className={"mt-4 rounded-xl border p-3 text-sm leading-5 " +
              (message.kind === "success" ? "border-emerald-500/30 bg-emerald-500/5 text-fg" : "border-rose-500/30 bg-rose-500/5 text-fg")}>
              {message.text}
            </p>
          ) : null}
        </section>
        <p className="mt-5 text-center text-xs leading-5 text-muted">
          Need to sign in first? <Link to="/account" className="font-semibold text-fg underline underline-offset-4">Open enV account</Link>
        </p>
      </div>
    </main>
  );
}
