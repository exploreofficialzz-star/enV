import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowLeft, CircleAlert, Coins, RefreshCw, ShieldCheck, Wallet, WifiOff, Clock3, Copy, Smartphone, ShieldBan, Gift, Users, Video, CreditCard, TrendingUp, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import {
  clearWebOfflineIssueKey,
  getOrCreateWebOfflineIssueKey,
  getSelectedWebOfflineAllowanceId,
  listLocalWebOfflineAllowances,
  requestWebOfflineAllowance,
  selectWebOfflineAllowanceForMetering,
  synchronizeWebOfflineAllowance,
} from "@/lib/billing/offline-client";

export const Route = createFileRoute("/wallet")({ component: Account });

type WalletData = {
  availableTokens: number;
  reservedTokens: number;
  lifetimePurchasedSubunits: number;
  lifetimeConsumedSubunits: number;
};

type WalletActivity = {
  id: string;
  entry_type: string;
  delta_available_subunits: number;
  delta_reserved_subunits: number;
  consumed_subunits: number;
  description: string;
  reference_id: string | null;
  created_at: string;
};

type WalletState = { status: "loading" | "ready" | "unavailable"; message?: string; wallet?: WalletData; activity?: WalletActivity[] };
type RewardsData = {
  referralCode: string; referralCount: number; pendingReferrals: number; qualifiedReferrals: number;
  videoSignups: number; videoConversions: number; referralTokens: number; affiliateTokens: number;
  bonusTokens: number; pendingRewardTokens: number; totalRewardTokens: number;
};
type RewardsState = { status: "loading" | "ready" | "unavailable"; data?: RewardsData; message?: string };
type FundingPack = { tokens: number; amountMinor: number | null; currency: string };
type FundingData = { enabled: boolean; provider: string; currency: string; message: string; packs: FundingPack[] };
type FundingState = { status: "loading" | "ready" | "unavailable"; data?: FundingData; message?: string };
type OfflineAllowance = {
  allowanceId: string;
  platform?: "web" | "android" | "ios" | string;
  allowanceSubunits: number;
  acceptedSubunits: number;
  status: string;
  expiresAt: string;
  lastSyncAt: string | null;
  recoveryReason: string | null;
};
type OfflineWalletState = {
  status: "loading" | "ready" | "unavailable";
  enabled?: boolean;
  code?: string;
  message?: string;
  allowances?: OfflineAllowance[];
  allowancesAvailable?: boolean;
  allowancesMessage?: string;
};
type NativeDeviceSession = {
  sessionId: string;
  platform: "android" | "ios" | string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
};
type PairingCodeState = { platform: "android" | "ios"; code: string; expiresAt: string };
type LocalOfflineAllowance = {
  allowanceId: string;
  allowanceSubunits: number;
  pricingVersion: string;
  status: string;
  expiresAt: string;
  lastAckSequence: number;
  nextSequence: number;
  spentSubunits: number;
  pendingSubunits: number;
  pendingRecords: number;
  preparingRecords: number;
  pendingBatch: boolean;
  issueIdempotencyKey: string;
};

function tokenAmount(subunits: number): string {
  return (subunits / 1_000).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function activitySummary(entry: WalletActivity): string {
  if (entry.entry_type === "reservation") return `Reserved ${tokenAmount(Math.abs(entry.delta_reserved_subunits))} tokens`;
  if (entry.consumed_subunits > 0) return `Used ${tokenAmount(entry.consumed_subunits)} tokens`;
  if (entry.entry_type === "release") return `Released ${tokenAmount(Math.abs(entry.delta_available_subunits))} tokens`;
  const delta = entry.delta_available_subunits / 1_000;
  if (delta > 0) return `+${tokenAmount(entry.delta_available_subunits)} tokens`;
  if (delta < 0) return `−${tokenAmount(Math.abs(entry.delta_available_subunits))} tokens`;
  return entry.entry_type.replaceAll("_", " ");
}

function MetricCard({ title, value, description, icon }: { title: string; value: string; description: string; icon: React.ReactNode }) {
  return <div className="min-w-0 rounded-2xl border border-border bg-surface p-4">
    <div className="flex items-center gap-2 text-muted">{icon}<span className="text-xs font-medium">{title}</span></div>
    <p className="mt-3 break-words text-lg font-semibold tracking-tight text-fg sm:text-xl">{value}</p>
    <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
  </div>;
}

function Account() {
  const appOrigin = typeof window !== "undefined" ? window.location.origin : "https://envtools.store";
  const [state, setState] = useState<WalletState>({ status: "loading" });
  const [offlineState, setOfflineState] = useState<OfflineWalletState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [recoveringAllowanceId, setRecoveringAllowanceId] = useState<string | null>(null);
  const [recoveryFeedback, setRecoveryFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [localAllowances, setLocalAllowances] = useState<LocalOfflineAllowance[]>([]);
  const [selectedLocalAllowanceId, setSelectedLocalAllowanceId] = useState<string | null>(null);
  const [offlineActionBusy, setOfflineActionBusy] = useState(false);
  const [pairingCode, setPairingCode] = useState<PairingCodeState | null>(null);
  const [pairingPlatform, setPairingPlatform] = useState<"android" | "ios">("android");
  const [nativeSessions, setNativeSessions] = useState<NativeDeviceSession[]>([]);
  const [nativeSessionsMessage, setNativeSessionsMessage] = useState("");
  const [rewardsState, setRewardsState] = useState<RewardsState>({ status: "loading" });
  const [fundingState, setFundingState] = useState<FundingState>({ status: "loading" });
  const [rewardsReloadKey, setRewardsReloadKey] = useState(0);
  const [selectedTokenPack, setSelectedTokenPack] = useState(100);
  const [fundingBusy, setFundingBusy] = useState(false);
  const [fundingFeedback, setFundingFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);


  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/billing/rewards/summary", { credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        const payload = await response.json() as { ok?: boolean; data?: RewardsData; message?: string };
        if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.message ?? "Referral rewards are not available yet.");
        setRewardsState({ status: "ready", data: payload.data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setRewardsState({ status: "unavailable", message: error instanceof Error ? error.message : "Referral rewards are unavailable." });
      });
    return () => controller.abort();
  }, [rewardsReloadKey, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/billing/funding-options", { credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        const payload = await response.json() as { ok?: boolean; data?: FundingData; message?: string };
        if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.message ?? "Funding options are unavailable.");
        setFundingState({ status: "ready", data: payload.data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFundingState({ status: "unavailable", message: error instanceof Error ? error.message : "Funding options are unavailable." });
      });
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentState = params.get("payment");
    if (paymentState === "success") {
      setFundingFeedback({ kind: "success", message: "Payment verified by enV. Your wallet has been refreshed." });
      setReloadKey(value => value + 1);
      window.history.replaceState({}, "", "/wallet");
    } else if (paymentState === "pending") {
      setFundingFeedback({ kind: "success", message: "The payment is still processing. No tokens were added yet; refresh after provider confirmation." });
      window.history.replaceState({}, "", "/wallet");
    } else if (paymentState === "failed" || paymentState === "unverified") {
      setFundingFeedback({ kind: "error", message: "The payment could not be verified. Your wallet was not credited. Contact support if you were charged." });
      window.history.replaceState({}, "", "/wallet");
    }
    if (params.get("claimReferral") !== "1") return;
    const referralCode = window.localStorage.getItem("env.pendingReferralCode");
    const source = window.localStorage.getItem("env.pendingReferralSource") === "video" ? "video" : "referral";
    if (!referralCode) {
      window.history.replaceState({}, "", "/wallet");
      return;
    }
    const controller = new AbortController();
    void fetch("/api/billing/rewards/claim-referral", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ referralCode, source }), signal: controller.signal,
    }).then(async response => {
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: { alreadyClaimed?: boolean }; message?: string } | null;
      if (response.ok && payload?.ok) {
        window.localStorage.removeItem("env.pendingReferralCode");
        window.localStorage.removeItem("env.pendingReferralSource");
        setFundingFeedback({ kind: "success", message: payload.data?.alreadyClaimed ? "Your referral is already connected to this account." : "Your referral is connected. Rewards unlock after a verified qualifying purchase." });
        setRewardsReloadKey(value => value + 1);
      } else if (response.status !== 401 && response.status !== 503) {
        window.localStorage.removeItem("env.pendingReferralCode");
        window.localStorage.removeItem("env.pendingReferralSource");
        setFundingFeedback({ kind: "error", message: payload?.message ?? "This referral could not be applied to the account." });
      }
    }).finally(() => {
      if (!controller.signal.aborted) window.history.replaceState({}, "", "/wallet");
    });
    return () => controller.abort();
  }, []);


  useEffect(() => {
    const controller = new AbortController();
    setOfflineState({ status: "loading" });
    void Promise.all([
      fetch("/api/billing/offline/status", { credentials: "same-origin", signal: controller.signal }),
      fetch("/api/billing/offline/allowances", { credentials: "same-origin", signal: controller.signal }),
    ]).then(async ([statusResponse, allowancesResponse]) => {
      const statusPayload = await statusResponse.json() as { ok?: boolean; data?: { enabled?: boolean; code?: string; message?: string } };
      if (!statusResponse.ok || !statusPayload.ok || !statusPayload.data) throw new Error("Offline-wallet status is unavailable.");
      let allowances: OfflineAllowance[] = [];
      let allowancesAvailable = false;
      let allowancesMessage = "Offline allowance details could not be loaded. Refresh the wallet to try again.";
      if (allowancesResponse.ok) {
        const allowancePayload = await allowancesResponse.json() as { ok?: boolean; data?: OfflineAllowance[] };
        if (allowancePayload.ok && Array.isArray(allowancePayload.data)) {
          allowances = allowancePayload.data;
          allowancesAvailable = true;
          allowancesMessage = "";
        }
      } else {
        const errorPayload = await allowancesResponse.json().catch(() => null) as { error?: string; message?: string } | null;
        if (errorPayload?.error === "AUTH_REQUIRED") {
          allowancesMessage = "Sign in to view account-specific offline allowances.";
        } else if (errorPayload?.error === "BILLING_AUTH_NOT_CONFIGURED") {
          allowancesMessage = "Account authentication is not configured for this deployment, so private allowance details cannot be loaded.";
        } else if (typeof errorPayload?.message === "string") {
          allowancesMessage = errorPayload.message;
        }
      }
      const localRows = await listLocalWebOfflineAllowances().catch(() => [] as LocalOfflineAllowance[]);
      setLocalAllowances(localRows);
      let selectedId: string | null = null;
      try { selectedId = getSelectedWebOfflineAllowanceId(); } catch { selectedId = null; }
      // When an authenticated server query succeeds, a locally selected allowance that is
      // not part of this account must not remain selected after an account switch.
      if (allowancesAvailable && selectedId && !allowances.some((row) => row.allowanceId === selectedId && ["issued", "syncing"].includes(row.status))) {
        await selectWebOfflineAllowanceForMetering(null).catch(() => undefined);
        selectedId = null;
      }
      setSelectedLocalAllowanceId(selectedId);
      setOfflineState({ status: "ready", enabled: statusPayload.data.enabled === true, code: statusPayload.data.code,
        message: statusPayload.data.message, allowances, allowancesAvailable, allowancesMessage });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setOfflineState({ status: "unavailable", message: error instanceof Error ? error.message : "Offline-wallet status is unavailable." });
    });
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/billing/offline/pairing/sessions", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { ok?: boolean; data?: NativeDeviceSession[]; message?: string } | null;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
          setNativeSessions([]);
          setNativeSessionsMessage(payload?.message ?? "Sign in to manage paired native devices.");
          return;
        }
        setNativeSessions(payload.data);
        setNativeSessionsMessage("");
      }).catch(() => {
        if (!controller.signal.aborted) setNativeSessionsMessage("Paired-device status is currently unavailable.");
      });
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void fetch("/api/billing/wallet", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; data?: { wallet?: WalletData; activity?: WalletActivity[] }; message?: string; error?: string };
        if (!response.ok || !payload.ok || !payload.data?.wallet) {
          throw new Error(payload.message ?? (payload.error === "AUTH_REQUIRED"
            ? "Sign in is required to access a personal wallet."
            : payload.error === "BILLING_AUTH_NOT_CONFIGURED"
              ? "Wallet information is currently unavailable. No balance or payment was changed."
              : "Wallet information is unavailable. Please retry."));
        }
        setState({ status: "ready", wallet: payload.data.wallet, activity: payload.data.activity ?? [] });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "unavailable", message: error instanceof Error ? error.message : "Wallet information is unavailable. Please retry." });
      });
    return () => controller.abort();
  }, [reloadKey]);

  async function copyReferralLink(code: string, source: "referral" | "video") {
    const link = `${window.location.origin}/signup?ref=${encodeURIComponent(code)}${source === "video" ? "&source=video" : ""}`;
    try {
      await navigator.clipboard.writeText(link);
      setFundingFeedback({ kind: "success", message: source === "video" ? "Video affiliate link copied. Add it to your video caption or profile." : "Referral link copied. Your conversion and reward status will appear here." });
    } catch {
      setFundingFeedback({ kind: "error", message: "Clipboard access was denied. Select and copy the link shown in the referral card." });
    }
  }

  async function startFundingCheckout() {
    if (fundingBusy) return;
    setFundingBusy(true);
    setFundingFeedback(null);
    try {
      const response = await fetch("/api/billing/purchases", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ tokenPack: selectedTokenPack, idempotencyKey: `wallet-topup-${crypto.randomUUID()}` }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: { authorizationUrl?: string }; message?: string } | null;
      const target = payload?.data?.authorizationUrl;
      let checkout: URL | null = null;
      try { if (target) checkout = new URL(target); } catch { checkout = null; }
      if (!response.ok || !payload?.ok || !checkout || checkout.protocol !== "https:" || checkout.hostname !== "checkout.paystack.com") {
        throw new Error(payload?.message ?? "Secure checkout could not be opened. No tokens were added.");
      }
      window.location.assign(checkout.href);
    } catch (error) {
      setFundingFeedback({ kind: "error", message: error instanceof Error ? error.message : "Secure checkout is unavailable. No payment was taken." });
    } finally {
      setFundingBusy(false);
    }
  }

  async function reportMissingOfflineRecords(allowance: OfflineAllowance) {
    if (!window.confirm(
      "Report that this device's offline records are missing? enV will preserve the reservation and mark it for recovery review. This does not automatically refund tokens or release the unused allowance. Continue only if local app/browser data was lost."
    )) return;
    setRecoveringAllowanceId(allowance.allowanceId);
    setRecoveryFeedback(null);
    try {
      const response = await fetch("/api/billing/offline/recovery", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ allowanceId: allowance.allowanceId }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean; data?: { status?: string; message?: string; alreadyReconciled?: boolean };
        error?: string; message?: string;
      } | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.message ?? "The recovery request was not accepted. No automatic refund was made.");
      }
      setRecoveryFeedback({
        kind: "success",
        message: payload.data.alreadyReconciled
          ? "This allowance was already reconciled. No further action was taken."
          : (payload.data.message ?? "The allowance was submitted for recovery review. Reserved tokens were not automatically released."),
      });
      setReloadKey((value) => value + 1);
    } catch (error) {
      setRecoveryFeedback({ kind: "error", message: error instanceof Error ? error.message : "Recovery could not be requested. Keep any remaining local records and contact support." });
    } finally {
      setRecoveringAllowanceId(null);
    }
  }

  async function reserveOfflineAllowance() {
    if (!offlineState.enabled || offlineActionBusy) return;
    setOfflineActionBusy(true);
    setRecoveryFeedback(null);
    try {
      const issueKey = getOrCreateWebOfflineIssueKey();
      const allowance = await requestWebOfflineAllowance({ requestedSubunits: 5_000, idempotencyKey: issueKey });
      const allowanceId = String((allowance as { allowanceId?: unknown }).allowanceId ?? "");
      if (!allowanceId) throw new Error("The server response did not include a valid allowance ID.");
      await selectWebOfflineAllowanceForMetering(allowanceId);
      clearWebOfflineIssueKey(issueKey);
      setSelectedLocalAllowanceId(allowanceId);
      setRecoveryFeedback({ kind: "success", message: "Five tokens are reserved for this device. While offline, an explicitly submitted eligible calculator operation records one provisional charge in the local journal. The allowance stays reserved until its recorded usage is reconciled with the wallet ledger." });
      setReloadKey((value) => value + 1);
    } catch (error) {
      setRecoveryFeedback({ kind: "error", message: error instanceof Error ? error.message : "An offline allowance could not be reserved. No new allowance was activated." });
    } finally {
      setOfflineActionBusy(false);
    }
  }

  async function activateLocalAllowance(allowanceId: string | null) {
    if (offlineActionBusy) return;
    setOfflineActionBusy(true);
    setRecoveryFeedback(null);
    try {
      await selectWebOfflineAllowanceForMetering(allowanceId);
      setSelectedLocalAllowanceId(allowanceId);
      setRecoveryFeedback({ kind: "success", message: allowanceId
        ? "This reserved calculator budget is selected for this device. Eligible submissions are recorded locally first and synchronized when a connection is available."
        : "Offline calculator token metering is paused on this device. Local tools remain available." });
    } catch (error) {
      setRecoveryFeedback({ kind: "error", message: error instanceof Error ? error.message : "The local metering selection could not be changed safely." });
    } finally {
      setOfflineActionBusy(false);
    }
  }

  async function syncOfflineAllowance(allowanceId: string) {
    if (offlineActionBusy) return;
    setOfflineActionBusy(true);
    setRecoveryFeedback(null);
    try {
      const result = await synchronizeWebOfflineAllowance(allowanceId, false) as { status?: string; acceptedSubunits?: number; retryable?: boolean; message?: string };
      if (result.status === "needs_recovery") {
        setRecoveryFeedback({ kind: "error", message: result.message ?? "The server placed this allowance into recovery review. Reserved tokens remain protected." });
      } else {
        setRecoveryFeedback({ kind: "success", message: result.retryable
          ? (result.message ?? "The server requested a safe retry. Local transaction records were preserved.")
          : `Synchronization accepted. The server has recorded ${tokenAmount(result.acceptedSubunits ?? 0)} tokens of usage. Funds remain reserved until verified finalization is available.` });
      }
      setReloadKey((value) => value + 1);
    } catch (error) {
      setRecoveryFeedback({ kind: "error", message: error instanceof Error ? error.message : "Synchronization failed. Local records were preserved for a safe retry." });
    } finally {
      setOfflineActionBusy(false);
    }
  }

  async function finalizeLocalTestAllowance(allowance: OfflineAllowance) {
    if (offlineState.code !== "LOCAL_TEST_ONLY" || !window.confirm(
      "Close this offline allowance? enV will send a final checkpoint, settle accepted usage, and return the unused reserved amount according to the wallet ledger. Continue?"
    )) return;
    if (offlineActionBusy) return;
    setOfflineActionBusy(true);
    setRecoveryFeedback(null);
    try {
      const result = await synchronizeWebOfflineAllowance(allowance.allowanceId, true) as {
        status?: string; acceptedSubunits?: number; releasedSubunits?: number; retryable?: boolean; message?: string;
      };
      if (result.status === "reconciled") {
        setRecoveryFeedback({ kind: "success", message: `Allowance finalized. Accepted usage: ${tokenAmount(result.acceptedSubunits ?? 0)} tokens; returned amount: ${tokenAmount(result.releasedSubunits ?? 0)} tokens.` });
      } else if (result.status === "needs_recovery") {
        setRecoveryFeedback({ kind: "error", message: result.message ?? "Finalization needs recovery review. The remaining reservation is protected." });
      } else {
        setRecoveryFeedback({ kind: "success", message: "The next synchronization batch was accepted. Review the remaining local records, then close the allowance after all records are reconciled." });
      }
      setReloadKey((value) => value + 1);
    } catch (error) {
      setRecoveryFeedback({ kind: "error", message: error instanceof Error ? error.message : "Finalization did not complete. Local records and reserved funds were preserved." });
    } finally {
      setOfflineActionBusy(false);
    }
  }

  async function createNativePairingCode(platform: "android" | "ios") {
    if (!offlineState.enabled || offlineActionBusy) return;
    setOfflineActionBusy(true);
    setRecoveryFeedback(null);
    try {
      const response = await fetch("/api/billing/offline/pairing", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ platform }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: { pairingCode?: string; expiresAt?: string }; message?: string } | null;
      if (!response.ok || !payload?.ok || !payload.data?.pairingCode || !payload.data.expiresAt) throw new Error(payload?.message ?? "A device pairing code could not be created.");
      setPairingCode({ platform, code: payload.data.pairingCode, expiresAt: payload.data.expiresAt });
      setRecoveryFeedback({ kind: "success", message: `One-time ${platform === "android" ? "Android" : "iOS"} pairing code created. It expires in ten minutes. Only enter it in the enV app you control.` });
    } catch (error) {
      setRecoveryFeedback({ kind: "error", message: error instanceof Error ? error.message : "The pairing code could not be created." });
    } finally { setOfflineActionBusy(false); }
  }

  async function revokeNativeDevice(session: NativeDeviceSession) {
    if (offlineActionBusy || session.revoked) return;
    if (!window.confirm("Revoke this paired device? It will no longer synchronize. Any outstanding offline allowance on it will be locked for recovery review; reserved tokens will not be automatically released.")) return;
    setOfflineActionBusy(true);
    setRecoveryFeedback(null);
    try {
      const response = await fetch("/api/billing/offline/pairing/revoke", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: { affectedAllowances?: number }; message?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? "Device revocation failed.");
      setRecoveryFeedback({ kind: "success", message: `Device revoked. ${payload.data?.affectedAllowances ?? 0} outstanding allowance(s) were locked for recovery review.` });
      setPairingCode(null);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setRecoveryFeedback({ kind: "error", message: error instanceof Error ? error.message : "Device revocation failed. Please retry." });
    } finally { setOfflineActionBusy(false); }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link to="/pricing" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg"><ArrowLeft size={16} aria-hidden="true" /> Back to pricing</Link>
        <header className="mt-5">
          <div className="grid size-12 place-items-center rounded-2xl border border-border bg-surface-2"><Wallet size={24} aria-hidden="true" /></div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">Your enV wallet</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">A clearer view of your tokens: deposits, remaining balance, usage, rewards, referrals and connected devices.</p>
        </header>

        {state.status === "ready" && state.wallet ? (
          <section className="mt-6 space-y-3" aria-label="Wallet overview">
            <div className="rounded-3xl border border-border bg-surface p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted">Available to use</p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">{state.wallet.availableTokens.toLocaleString(undefined, { maximumFractionDigits: 3 })} <span className="text-lg font-medium text-muted">tokens</span></p>
                  <p className="mt-2 text-sm text-muted">Reference value ${(state.wallet.availableTokens * 0.01).toFixed(2)} USD · not cash or withdrawable value</p>
                </div>
                <a href="#fund-wallet" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent no-underline hover:opacity-90"><CreditCard size={17} aria-hidden="true" /> Fund wallet</a>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard title="Total deposited" value={`${tokenAmount(state.wallet.lifetimePurchasedSubunits)} tokens`} description="Verified purchases" icon={<ArrowDownToLine size={17} aria-hidden="true" />} />
              <MetricCard title="Total remaining" value={`${state.wallet.availableTokens.toLocaleString(undefined, { maximumFractionDigits: 3 })} tokens`} description="Available now" icon={<Wallet size={17} aria-hidden="true" />} />
              <MetricCard title="Total used" value={`${tokenAmount(state.wallet.lifetimeConsumedSubunits)} tokens`} description="Recorded usage" icon={<TrendingUp size={17} aria-hidden="true" />} />
              <MetricCard title="Reserved" value={`${state.wallet.reservedTokens.toLocaleString(undefined, { maximumFractionDigits: 3 })} tokens`} description="Held for active work" icon={<ShieldCheck size={17} aria-hidden="true" />} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MetricCard title="Referral rewards" value={rewardsState.status === "ready" ? `${rewardsState.data?.referralTokens.toLocaleString(undefined, { maximumFractionDigits: 3 })} tokens` : "—"} description="Earned from qualified invites" icon={<Gift size={17} aria-hidden="true"} />} />
              <MetricCard title="Affiliate rewards" value={rewardsState.status === "ready" ? `${rewardsState.data?.affiliateTokens.toLocaleString(undefined, { maximumFractionDigits: 3 })} tokens` : "—"} description="Verified video conversions" icon={<Video size={17} aria-hidden="true"} />} />
            </div>
          </section>
        ) : null}

        {state.status === "loading" ? (
          <div className="mt-6 rounded-2xl border border-border p-5 text-sm text-muted" aria-live="polite">Checking wallet availability…</div>
        ) : state.status === "ready" && state.wallet ? (
          <section className="mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold text-fg">Account activity</h2><p className="mt-1 text-sm text-muted">Dated records of deposits, rewards, reservations, usage and releases.</p></div>
              <button type="button" onClick={() => setReloadKey(value => value + 1)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2"><RefreshCw size={15} aria-hidden="true" /> Refresh</button>
            </div>
            <div className="mt-6">
              <h3 className="font-medium text-fg">Recent transactions</h3>
              {state.activity?.length ? (
                <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                  {state.activity.map((entry) => (
                    <li key={entry.id} className="flex items-start justify-between gap-3 px-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-fg">{activitySummary(entry)}</p>
                        <p className="mt-1 truncate text-xs text-muted">{entry.description}</p>
                        <p className="mt-1 text-[11px] text-subtle">{new Date(entry.created_at).toLocaleString()}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">{entry.entry_type.replaceAll("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">No token activity has been recorded yet.</p>
              )}
            </div>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2"><RefreshCw size={15} aria-hidden="true" /> Refresh wallet</button>
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border border-border p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-muted"><CircleAlert size={22} aria-hidden="true" /></span>
              <div>
                <h2 className="font-semibold text-fg">Wallet information unavailable</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{state.message}</p>
                <p className="mt-2 text-sm leading-6 text-muted">Wallet data could not be retrieved. Refresh the page or sign in to view personal wallet information.</p>
                <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2"><RefreshCw size={15} aria-hidden="true" /> Try again</button>
              </div>
            </div>
          </section>
        )}

        <section className="mt-5 rounded-2xl border border-border p-5 sm:p-6" aria-labelledby="rewards-title">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><Gift size={20} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <h2 id="rewards-title" className="font-semibold text-fg">Referral and creator rewards</h2>
              <p className="mt-1 text-sm leading-6 text-muted">Invite a friend or feature enV in a video. Rewards are earned only when a referred account completes a qualifying verified purchase—not from self-reported views or clicks.</p>
              {rewardsState.status === "loading" ? <p className="mt-3 text-sm text-muted">Loading your rewards…</p> : null}
              {rewardsState.status === "unavailable" ? <p className="mt-3 text-sm text-muted">{rewardsState.message} Confirm that the wallet rewards migration is applied.</p> : null}
              {rewardsState.status === "ready" && rewardsState.data ? <>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MetricCard title="Invites" value={String(rewardsState.data.referralCount)} description="Signed-up friends" icon={<Users size={16} aria-hidden="true" />} />
                  <MetricCard title="Qualified" value={String(rewardsState.data.qualifiedReferrals)} description="Verified conversions" icon={<ShieldCheck size={16} aria-hidden="true" />} />
                  <MetricCard title="Video conversions" value={String(rewardsState.data.videoConversions)} description="Attributed purchases" icon={<Video size={16} aria-hidden="true" />} />
                  <MetricCard title="Total rewards" value={`${rewardsState.data.totalRewardTokens.toLocaleString(undefined, { maximumFractionDigits: 3 })} tokens`} description="Credited to wallet" icon={<Gift size={16} aria-hidden="true" />} />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-border p-4">
                    <h3 className="font-medium text-fg">Refer a friend</h3>
                    <p className="mt-1 text-sm leading-5 text-muted">Share your personal link. You and your friend become eligible for a reward after their first verified qualifying purchase.</p>
                    <code className="mt-3 block break-all rounded-lg bg-surface-2 p-3 text-xs text-fg">{appOrigin}/signup?ref={rewardsState.data.referralCode}</code>
                    <button type="button" onClick={() => void copyReferralLink(rewardsState.data!.referralCode, "referral")} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2"><Copy size={15} aria-hidden="true" /> Copy invite link</button>
                  </div>
                  <div className="rounded-2xl border border-border p-4">
                    <h3 className="font-medium text-fg">Video affiliate program</h3>
                    <p className="mt-1 text-sm leading-5 text-muted">Mention enV in relevant videos and add this unique link to your caption or profile. Affiliate tokens are calculated from verified purchase conversions, with server-side caps against abuse.</p>
                    <code className="mt-3 block break-all rounded-lg bg-surface-2 p-3 text-xs text-fg">{appOrigin}/signup?ref={rewardsState.data.referralCode}&amp;source=video</code>
                    <button type="button" onClick={() => void copyReferralLink(rewardsState.data!.referralCode, "video")} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2"><Copy size={15} aria-hidden="true" /> Copy video link</button>
                  </div>
                </div>
              </> : null}
            </div>
          </div>
        </section>

        <section id="fund-wallet" className="mt-5 scroll-mt-24 rounded-2xl border border-border p-5 sm:p-6" aria-labelledby="fund-wallet-title">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><CreditCard size={20} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <h2 id="fund-wallet-title" className="font-semibold text-fg">Fund your wallet</h2>
              <p className="mt-1 text-sm leading-6 text-muted">Choose a token pack and use secure checkout. enV credits tokens only after server-side transaction verification.</p>
              {fundingFeedback ? <p className={`mt-3 rounded-lg border p-3 text-sm leading-5 ${fundingFeedback.kind === "success" ? "border-emerald-500/30 bg-emerald-500/5 text-fg" : "border-rose-500/30 bg-rose-500/5 text-fg"}`} role="status" aria-live="polite">{fundingFeedback.message}</p> : null}
              {fundingState.status === "loading" ? <p className="mt-3 text-sm text-muted">Checking supported payment methods…</p> : null}
              {fundingState.status === "unavailable" ? <p className="mt-3 text-sm text-muted">{fundingState.message}</p> : null}
              {fundingState.status === "ready" && fundingState.data ? <>
                {fundingState.data.enabled ? <>
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {fundingState.data.packs.map(pack => <button key={pack.tokens} type="button" aria-pressed={selectedTokenPack === pack.tokens} onClick={() => setSelectedTokenPack(pack.tokens)} className={`rounded-xl border p-3 text-left transition ${selectedTokenPack === pack.tokens ? "border-accent bg-surface-2 ring-1 ring-accent" : "border-border hover:bg-surface-2"}`}>
                      <span className="block text-lg font-semibold text-fg">{pack.tokens.toLocaleString()}</span>
                      <span className="mt-1 block text-xs text-muted">tokens</span>
                      <span className="mt-2 block text-sm font-medium text-fg">{pack.amountMinor !== null ? `₦${(pack.amountMinor / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "Price unavailable"}</span>
                    </button>)}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted">The NGN price is server-controlled. Token reference value is not cash; packs and regional prices may change before checkout.</p>
                  <button type="button" disabled={fundingBusy || state.status !== "ready"} onClick={() => void startFundingCheckout()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50">{fundingBusy ? "Opening secure checkout…" : "Continue to secure checkout"} <ExternalLink size={16} aria-hidden="true" /></button>
                </> : <div className="mt-4 rounded-xl bg-surface-2 p-4">
                  <p className="font-medium text-fg">Payments are not enabled yet</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{fundingState.data.message} No payment will be taken until these checks pass.</p>
                </div>}
              </> : null}
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border p-5 sm:p-6" aria-labelledby="offline-wallet-title">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><WifiOff size={20} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <h2 id="offline-wallet-title" className="font-semibold text-fg">Offline token allowance</h2>
              {recoveryFeedback ? <p className={`mt-3 rounded-lg border p-3 text-sm leading-5 ${recoveryFeedback.kind === "success" ? "border-emerald-500/30 bg-emerald-500/5 text-fg" : "border-rose-500/30 bg-rose-500/5 text-fg"}`} role="status" aria-live="polite">{recoveryFeedback.message} <Link to="/help" className="font-medium underline underline-offset-2">Help Center</Link></p> : null}
              {offlineState.status === "loading" ? <p className="mt-2 text-sm text-muted" aria-live="polite">Checking offline-wallet availability…</p> : null}
              {offlineState.status === "unavailable" ? <p className="mt-2 text-sm leading-6 text-muted">{offlineState.message}</p> : null}
              {offlineState.status === "ready" ? <>
                <p className="mt-2 text-sm leading-6 text-muted">{offlineState.message}</p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted">
                  <span className={`size-2 rounded-full ${offlineState.enabled ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
                  {offlineState.enabled ? "Offline allowance" : "Offline allowance unavailable"}
                </div>
                {offlineState.enabled ? <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
                  <p className="text-sm font-medium text-fg">Enable offline calculator metering</p>
                  <p className="mt-1 text-xs leading-5 text-muted">This allowance reserves five tokens from the confirmed wallet balance for eligible local calculator operations. Submitted calculations are recorded on the device and synchronized when a connection is available.</p>
                  <button type="button" disabled={offlineActionBusy || state.status !== "ready" || !state.wallet || state.wallet.availableTokens < 5} onClick={() => void reserveOfflineAllowance()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent disabled:cursor-not-allowed disabled:opacity-50">{offlineActionBusy ? "Working…" : "Reserve and activate 5 tokens"}</button>
                  {state.status === "ready" && state.wallet && state.wallet.availableTokens < 5 ? <p className="mt-2 text-xs text-muted">At least five available tokens are required. </p> : null}
                  {selectedLocalAllowanceId ? <button type="button" disabled={offlineActionBusy} onClick={() => void activateLocalAllowance(null)} className="ml-2 mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg disabled:opacity-50">Pause local metering</button> : null}
                </div> : null}
                {state.status === "ready" ? <section className="mt-4 rounded-xl border border-border p-3" aria-labelledby="native-pairing-title">
                  <div className="flex items-center gap-2"><Smartphone size={17} aria-hidden="true" /><h3 id="native-pairing-title" className="text-sm font-semibold text-fg">Connect Android or iOS</h3></div>
                  <p className="mt-1 text-xs leading-5 text-muted">Generate a one-time code here, then enter it in your native enV app to securely view shared balances, rewards and activity. The app creates its own device-bound signing key; the private key never leaves the device. If offline allowances are enabled later, the same pairing can support that feature too. Pairing codes are single-use and expire quickly.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="sr-only" htmlFor="pairing-platform">Native platform</label>
                    <select id="pairing-platform" value={pairingPlatform} onChange={(event) => setPairingPlatform(event.target.value as "android" | "ios")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg">
                      <option value="android">Android</option><option value="ios">iOS</option>
                    </select>
                    <button type="button" disabled={offlineActionBusy} onClick={() => void createNativePairingCode(pairingPlatform)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg disabled:opacity-50">{offlineActionBusy ? "Working…" : "Generate one-time code"}</button>
                  </div>
                  {pairingCode ? <div className="mt-3 rounded-lg bg-surface-2 p-3">
                    <p className="text-xs text-muted">{pairingCode.platform.toUpperCase()} code · expires {new Date(pairingCode.expiresAt).toLocaleTimeString()}</p>
                    <code className="mt-2 block break-all text-xs text-fg">{pairingCode.code}</code>
                    <button type="button" onClick={() => { void navigator.clipboard.writeText(pairingCode.code).then(() => setRecoveryFeedback({ kind: "success", message: "Pairing code copied. Use it only in your own enV app before it expires." })).catch(() => setRecoveryFeedback({ kind: "error", message: "Clipboard access was denied. You can select and copy the code manually." })); }} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-fg"><Copy size={13} aria-hidden="true" /> Copy code</button>
                    <p className="mt-2 text-xs text-muted">Treat this code like a temporary password. It can pair one device once and should not be shared.</p>
                  </div> : null}
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-fg">Paired devices</h4>
                    {nativeSessionsMessage ? <p className="mt-1 text-xs text-muted">{nativeSessionsMessage}</p> : null}
                    {nativeSessions.length ? <ul className="mt-2 divide-y divide-border rounded-lg border border-border">{nativeSessions.map((session) => <li key={session.sessionId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div><p className="text-sm font-medium text-fg">{session.platform === "android" ? "Android device" : "iOS device"} {session.revoked ? "· Revoked" : "· Active"}</p><p className="mt-1 text-xs text-muted">Expires {new Date(session.expiresAt).toLocaleDateString()} {session.lastUsedAt ? `· Last active ${new Date(session.lastUsedAt).toLocaleString()}` : "· Not yet used"}</p></div>
                      {!session.revoked ? <button type="button" disabled={offlineActionBusy} onClick={() => void revokeNativeDevice(session)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-fg disabled:opacity-50"><ShieldBan size={13} aria-hidden="true" /> Revoke</button> : null}
                    </li>)}</ul> : (!nativeSessionsMessage ? <p className="mt-1 text-xs text-muted">No native devices are paired to this account.</p> : null)}
                  </div>
                </section> : null}
                {offlineState.allowancesAvailable === false ? <p className="mt-3 text-sm text-muted">{offlineState.allowancesMessage} The public availability status above does not reveal private wallet data.</p> : null}
                {offlineState.allowancesAvailable !== false && offlineState.allowances?.length ? <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
                  {offlineState.allowances.map((allowance) => <li key={allowance.allowanceId} className="px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">{tokenAmount(allowance.allowanceSubunits)} tokens reserved</span>
                      <span className="rounded-full border border-border px-2 py-1 text-xs text-muted">{allowance.status.replaceAll("_", " ")}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">Accepted usage: {tokenAmount(allowance.acceptedSubunits)} tokens</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><Clock3 size={13} aria-hidden="true" /> Allowance ends {new Date(allowance.expiresAt).toLocaleString()}</p>
                    {allowance.lastSyncAt ? <p className="mt-1 text-xs text-muted">Last sync: {new Date(allowance.lastSyncAt).toLocaleString()}</p> : null}
                    {(() => {
                      const local = localAllowances.find((row) => row.allowanceId === allowance.allowanceId);
                      if (!local && allowance.platform && allowance.platform !== "web") {
                        return <p className="mt-2 text-xs text-muted">This allowance belongs to the paired {allowance.platform === "android" ? "Android" : "iOS"} device. Synchronize or report lost records from that device where possible. Revoking its paired session locks the allowance for recovery; this browser cannot inspect its private journal.</p>;
                      }
                      return local ? <div className="mt-2 rounded-lg bg-surface-2 p-2 text-xs leading-5 text-muted">
                        <p>Local journal: {local.pendingRecords} pending record(s), {local.preparingRecords} unfinished record(s).</p>
                        <p>Device-reported usage: {tokenAmount(local.spentSubunits)} tokens; pending: {tokenAmount(local.pendingSubunits)} tokens.</p>
                        {local.status === "needs_recovery" ? <p className="mt-1 text-amber-700">Local journal requires recovery; do not start new offline metered operations.</p> : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(["issued", "syncing"].includes(allowance.status) && ["issued", "syncing"].includes(local.status)) ? <button type="button" disabled={offlineActionBusy || local.preparingRecords > 0} onClick={() => void activateLocalAllowance(allowance.allowanceId)} className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 font-medium text-fg disabled:opacity-50">{selectedLocalAllowanceId === allowance.allowanceId ? "Selected for this device" : "Use this calculator budget"}</button> : null}
                          {(["issued", "syncing"].includes(allowance.status) && local.pendingRecords > 0) ? <button type="button" disabled={offlineActionBusy || local.preparingRecords > 0} onClick={() => void syncOfflineAllowance(allowance.allowanceId)} className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 font-medium text-fg disabled:opacity-50">{offlineActionBusy ? "Syncing…" : "Synchronize local records"}</button> : null}
                        </div>
                      </div> : <p className="mt-2 text-xs text-muted">No local journal was found in this browser. If browser storage was cleared, report the missing records; enV will not assume the reserved tokens were unused.</p>;
                    })()}
                    {allowance.recoveryReason ? <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs leading-5 text-muted">Recovery review required ({allowance.recoveryReason.replaceAll("_", " ").toLowerCase()}). Do not assume unused tokens can be refunded until the usage records are reviewed.</p> : null}
                    {(allowance.platform === "web" || !allowance.platform) && (["issued", "syncing"].includes(allowance.status)) ? <button type="button" disabled={recoveringAllowanceId === allowance.allowanceId} onClick={() => void reportMissingOfflineRecords(allowance)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60">{recoveringAllowanceId === allowance.allowanceId ? "Submitting recovery…" : "Report missing offline records"}</button> : null}
                    {offlineState.code === "LOCAL_TEST_ONLY" && allowance.platform === "web" && (["issued", "syncing"].includes(allowance.status)) ? <button type="button" disabled={offlineActionBusy} onClick={() => void finalizeLocalTestAllowance(allowance)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-medium text-fg hover:bg-amber-500/5 disabled:cursor-not-allowed disabled:opacity-60"><ShieldCheck size={13} aria-hidden="true" /> {offlineActionBusy ? "Closing allowance…" : "Close allowance"}</button> : null}
                  </li>)}</ul> : <p className="mt-3 text-sm text-muted">No offline allowances have been issued to this account.</p>}
              </> : null}
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-surface-2 p-4">
          <div className="flex items-center gap-2"><ShieldCheck size={18} aria-hidden="true" /><h2 className="font-medium text-fg">Wallet safeguards</h2></div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
            <li className="flex gap-2"><Coins size={16} className="mt-1 shrink-0" aria-hidden="true" /> Token changes are designed to use an auditable ledger and idempotent transaction records.</li>
            <li className="flex gap-2"><ArrowDownToLine size={16} className="mt-1 shrink-0" aria-hidden="true" /> A workflow should reserve an approved budget, settle measured usage and release unused tokens.</li>
          </ul>
        </section>
      </main>
    </AppShell>
  );
}
