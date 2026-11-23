import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { AppUser } from "@/lib/auth/use-current-user";
import type { RewardedAdResult } from "@/lib/ads/rewarded-google";
import { recordBrowserRewardedAdCompletion } from "@/lib/ads/rewarded-progress";
import type { ToolAccessPreference } from "@/lib/ads/access-preference";

type ToolAccessResult =
  | { ok: true; reservationId: string; reservedTokens: number; unitLabel: string }
  | { ok: false; message: string; errorCode?: string };

export function ToolAccessGate({
  toolName,
  user,
  authPending,
  rewardedAdsConfigured,
  preference,
  onPreferenceChange,
  onWatchRewardedAd,
  onUseTokens,
  onReleaseTokenAccess,
  onUnlocked,
  onAdFreeOfferReady,
}: {
  toolName: string;
  user: AppUser | null;
  authPending: boolean;
  rewardedAdsConfigured: boolean;
  preference: ToolAccessPreference;
  onPreferenceChange: (value: ToolAccessPreference) => void;
  onWatchRewardedAd: () => Promise<RewardedAdResult>;
  onUseTokens: () => Promise<ToolAccessResult>;
  onReleaseTokenAccess: (reservationId: string) => void;
  onUnlocked: (mode: "ads" | "tokens", reservationId?: string) => void;
  onAdFreeOfferReady: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [tokenShortage, setTokenShortage] = useState(false);
  const [pendingTokenAccess, setPendingTokenAccess] = useState<Extract<ToolAccessResult, { ok: true }> | null>(null);
  const canWatchRewardedAd = rewardedAdsConfigured;

  async function watchAd() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await onWatchRewardedAd();
      if (result !== "completed") {
        setFeedback(result === "dismissed"
          ? "The ad was closed before it finished. Complete the full ad or choose token access."
          : "A rewarded ad could not be loaded. Check your connection and ad-blocking settings, or use account access.");
        return;
      }
      const progress = recordBrowserRewardedAdCompletion();
      onUnlocked("ads");
      if (progress?.shouldShowAdFreeOffer) onAdFreeOfferReady();
    } catch {
      setFeedback("The rewarded ad could not be completed. No ad view was counted.");
    } finally {
      setBusy(false);
    }
  }

  async function useTokens() {
    if (!user || busy) return;
    setBusy(true);
    setFeedback(null);
    setTokenShortage(false);
    try {
      const result = await onUseTokens();
      if (result.ok) {
        setPendingTokenAccess(result);
      } else {
        setFeedback(result.message);
        setTokenShortage(result.errorCode === "INSUFFICIENT_CREDITS");
      }
    } catch {
      setFeedback("Token access could not be verified. No tokens were charged.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-64 max-w-xl flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface px-5 py-8 text-center">
      <div className="grid size-12 place-items-center rounded-full border border-border text-xl" aria-hidden="true">enV</div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Continue to {toolName}</h2>
        <p className="text-sm leading-6 text-muted">
          Keep this selected tool free by watching a rewarded ad, or use enV tokens for ad-free access.
          A banner view, ad click or Smartlink opening never counts as a completed watch.
        </p>
      </div>

      {authPending ? (
        <p className="text-sm text-muted" role="status">Checking your account…</p>
      ) : (
        <div className="flex w-full max-w-sm flex-col gap-2">
          {preference === "ads" && canWatchRewardedAd ? (
            <button
              type="button"
              onClick={() => void watchAd()}
              disabled={busy}
              className="min-h-11 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? "Preparing access…" : "Watch an ad to continue"}
            </button>
          ) : null}

          {preference === "ads" && !rewardedAdsConfigured ? (
            <p className="text-xs leading-5 text-muted">
              Rewarded ads are not available for this tool right now. Sign in to use an approved token option.
            </p>
          ) : null}

          {user ? (
            <button
              type="button"
              onClick={() => {
                onPreferenceChange("tokens");
                void useTokens();
              }}
              disabled={busy}
              className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-2 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? "Checking token balance…" : "Continue with enV tokens"}
            </button>
          ) : (
            <>
              <Link
                to="/signup"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-2"
              >
                Create an enV account
              </Link>
              <Link to="/login" className="py-1 text-sm font-medium text-accent underline underline-offset-4">
                Sign in
              </Link>
            </>
          )}

          {preference === "tokens" ? (
            <button
              type="button"
              onClick={() => onPreferenceChange("ads")}
              disabled={busy}
              className="py-1 text-xs font-medium text-muted underline underline-offset-4"
            >
              Use the ad-supported option instead
            </button>
          ) : null}

        </div>
      )}

      {pendingTokenAccess ? (
        <div className="w-full max-w-sm space-y-3 rounded-lg border border-border p-3 text-left" role="group" aria-label="Confirm token access">
          <p className="text-sm font-semibold text-fg">
            This tool costs {pendingTokenAccess.reservedTokens.toLocaleString(undefined, { maximumFractionDigits: 3 })} enV tokens per {pendingTokenAccess.unitLabel}.
          </p>
          <p className="text-xs leading-5 text-muted">
            Tokens are reserved now and are deducted only after this tool reports a successful result. Failed or cancelled runs release the reservation.
          </p>
          <button
            type="button"
            onClick={() => {
              onUnlocked("tokens", pendingTokenAccess.reservationId);
              setPendingTokenAccess(null);
            }}
            disabled={busy}
            className="min-h-11 w-full rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg"
          >
            Confirm and continue
          </button>
          <button
            type="button"
            onClick={() => {
              const reservation = pendingTokenAccess.reservationId;
              setPendingTokenAccess(null);
              onReleaseTokenAccess(reservation);
            }}
            disabled={busy}
            className="min-h-10 w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2"
          >
            Cancel without charge
          </button>
        </div>
      ) : null}

      {feedback ? (
        <div className="w-full max-w-sm space-y-2 text-sm" role="status" aria-live="polite">
          <p className="text-danger">{feedback}</p>
          {tokenShortage ? (
            <Link to="/wallet" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 py-2 font-semibold text-fg hover:bg-surface-2">
              Add tokens in Wallet
            </Link>
          ) : null}
          {feedback.includes("still being reviewed") && user ? (
            <Link to="/wallet" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 py-2 font-semibold text-fg hover:bg-surface-2">
              Open Wallet
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AdFreeAfterThreeAdsDialog({
  open,
  signedIn,
  onClose,
  onChooseTokens,
}: {
  open: boolean;
  signedIn: boolean;
  onClose: () => void;
  onChooseTokens: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="env-ad-free-offer-title"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 text-fg shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="rounded-full border border-border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">3 completed ads</span>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-2" aria-label="Close ad-free offer">Close</button>
        </div>
        <h2 id="env-ad-free-offer-title" className="text-xl font-semibold">Ready to go ad-free?</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Your rewarded visit stays free. Choose enV tokens as the default for future visits; the reviewed price will be shown for confirmation before any token-backed use. Unapproved tools are never charged.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {signedIn ? (
            <button type="button" onClick={onChooseTokens} className="min-h-11 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg">
              Use enV tokens
            </button>
          ) : (
            <>
              <Link to="/signup" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg">
                Create an account
              </Link>
              <Link to="/login" className="py-1 text-sm font-medium text-accent underline underline-offset-4">
                Already have an account? Sign in
              </Link>
            </>
          )}
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2">
            Keep using ads
          </button>
        </div>
      </section>
    </div>
  );
}
