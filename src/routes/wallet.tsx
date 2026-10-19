import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine, Coins, RefreshCw, Wallet, Clock3, Copy, Gift, Users, Video, CreditCard, TrendingUp, Share2, ArrowUpRight, Link2, Eye, EyeOff } from "lucide-react";
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
  referralCode: string; videoSignature: string; referralCount: number; pendingReferrals: number; qualifiedReferrals: number;
  videoSignups: number; videoConversions: number; referralTokens: number; affiliateTokens: number;
  bonusTokens: number; pendingRewardTokens: number; totalRewardTokens: number;
};
type RewardsState = { status: "loading" | "ready" | "unavailable"; data?: RewardsData; message?: string };
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

function MetricCard({ title, value, description, icon, className = "" }: { title: string; value: string; description: string; icon: React.ReactNode; className?: string }) {
  return <div className={`flex min-w-0 items-center gap-2 rounded-2xl border border-border bg-surface px-2 py-2.5 sm:gap-3 sm:px-3 sm:py-3 ${className}`}>
    <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg sm:size-8">{icon}</span>
    <div className="min-w-0 flex-1">
      <p className="break-words text-[9px] font-medium leading-3 text-muted sm:text-xs">{title}</p>
      <p className="mt-0.5 break-words text-[11px] font-semibold leading-4 tracking-tight text-fg sm:text-sm">{value}</p>
      <p className="mt-0.5 text-[9px] leading-3 text-muted sm:text-[10px]">{description}</p>
    </div>
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
  const [rewardsReloadKey, setRewardsReloadKey] = useState(0);
  const [selectedTokenPack, setSelectedTokenPack] = useState(100);
  const [fundingBusy, setFundingBusy] = useState(false);
  const [fundingFeedback, setFundingFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [showVideoDetails, setShowVideoDetails] = useState(false);


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
    const referralCode = params.get("ref") ?? window.localStorage.getItem("env.pendingReferralCode");
    const source = params.get("source") === "video" || window.localStorage.getItem("env.pendingReferralSource") === "video" ? "video" : "referral";
    const signature = params.get("sig") ?? window.localStorage.getItem("env.pendingReferralSignature");
    if (!referralCode) {
      window.history.replaceState({}, "", "/wallet");
      return;
    }
    const controller = new AbortController();
    void fetch("/api/billing/rewards/claim-referral", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ referralCode, source, signature }), signal: controller.signal,
    }).then(async response => {
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: { alreadyClaimed?: boolean }; message?: string } | null;
      if (response.ok && payload?.ok) {
        window.localStorage.removeItem("env.pendingReferralCode");
        window.localStorage.removeItem("env.pendingReferralSource");
        window.localStorage.removeItem("env.pendingReferralSignature");
        setFundingFeedback({ kind: "success", message: payload.data?.alreadyClaimed ? "Your referral is already connected to this account." : "Your referral is connected. Rewards unlock after a verified qualifying purchase." });
        setRewardsReloadKey(value => value + 1);
      } else if (response.status !== 401 && response.status !== 503) {
        window.localStorage.removeItem("env.pendingReferralCode");
        window.localStorage.removeItem("env.pendingReferralSource");
        window.localStorage.removeItem("env.pendingReferralSignature");
        setFundingFeedback({ kind: "error", message: payload?.message ?? "This referral could not be applied to the account." });
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setFundingFeedback({ kind: "error", message: "Referral claim could not be completed. Keep this page open and retry after signing in; no reward was credited." });
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

  async function copyReferralLink(code: string, source: "referral" | "video", signature?: string) {
    if (source === "video" && !signature) {
      setFundingFeedback({ kind: "error", message: "The signed video affiliate link is unavailable. Refresh the wallet and try again." });
      return;
    }
    const link = `${window.location.origin}/signup?ref=${encodeURIComponent(code)}${source === "video" ? `&source=video&sig=${encodeURIComponent(signature!)}` : ""}`;
    try {
      await navigator.clipboard.writeText(link);
      setFundingFeedback({ kind: "success", message: source === "video" ? "Video affiliate link copied. Add it to your video caption or profile." : "Referral link copied. Your conversion and reward status will appear here." });
    } catch {
      setFundingFeedback({ kind: "error", message: "Clipboard access was denied. Select and copy the link shown in the referral card." });
    }
  }

  async function shareReferralLink(code: string, source: "referral" | "video", signature?: string) {
    if (source === "video" && !signature) {
      setFundingFeedback({ kind: "error", message: "The signed video affiliate link is unavailable. Refresh the wallet and try again." });
      return;
    }
    const link = `${window.location.origin}/signup?ref=${encodeURIComponent(code)}${source === "video" ? `&source=video&sig=${encodeURIComponent(signature!)}` : ""}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: source === "video" ? "Tag enV in your video" : "Join me on enV", text: source === "video" ? "Discover enV from my video:" : "Join me on enV. We can both earn tokens:", url: link });
        setFundingFeedback({ kind: "success", message: source === "video" ? "Your video link is ready to share." : "Your invitation is ready to share." });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    await copyReferralLink(code, source, signature);
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
      const detail = error instanceof Error ? error.message : "";
      const requiresSetup = /PAYMENTS_NOT_CONFIGURED|BILLING_AUTH_NOT_CONFIGURED|AUTH_REQUIRED|wallet funding is not live yet|provider credentials|approved NGN token price|persistent database|billing launch checks|sign in is required/i.test(detail);
      setFundingFeedback({
        kind: "error",
        message: requiresSetup
          ? "Secure checkout is unavailable at the moment. Your wallet has not been charged."
          : detail || "Secure checkout could not be opened. No payment was taken.",
      });
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

  const visibleWallet = state.status === "ready" ? state.wallet : undefined;
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
        <p className="mb-4 text-sm leading-6 text-muted">Manage your balance, tokens, rewards and more.</p>

        <section className="space-y-3" aria-label="Wallet overview">
          <div className="relative isolate overflow-hidden rounded-[24px] border border-emerald-300/25 bg-gradient-to-br from-[#1747af] via-[#07394e] to-[#00a97b] p-4 text-white shadow-sm sm:p-6">
            <svg viewBox="0 0 240 130" className="pointer-events-none absolute right-20 top-1 h-20 w-24 opacity-80 sm:right-28 sm:top-0 sm:h-32 sm:w-56" fill="none" aria-hidden="true">
              <path d="M4 112 C20 108 30 95 44 98 S63 73 78 82 S98 104 116 70 S140 56 155 66 S177 26 194 38 S218 23 235 8" stroke="#52ffd0" strokeWidth="3.5" strokeLinecap="round"/><path d="M222 10 L235 8 L232 21" stroke="#52ffd0" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 112 C20 108 30 95 44 98 S63 73 78 82 S98 104 116 70 S140 56 155 66 S177 26 194 38 S218 23 235 8 L235 130 L4 130 Z" fill="url(#wallet-balance-fill)" opacity=".18"/>
              <defs><linearGradient id="wallet-balance-fill" x1="120" y1="8" x2="120" y2="130" gradientUnits="userSpaceOnUse"><stop stopColor="#52ffd0"/><stop offset="1" stopColor="#52ffd0" stopOpacity="0"/></linearGradient></defs>
            </svg>
            <div className="relative flex flex-wrap items-center gap-3">
              <span className="grid size-14 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white shadow-inner"><Wallet size={28} aria-hidden="true"/></span>
              <div className="min-w-0 flex-1 pr-16 sm:pr-28">
                <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                  <span>Total balance</span>
                  <button type="button" onClick={() => setShowBalance(value => !value)} aria-label={showBalance ? "Hide balance" : "Show balance"} title={showBalance ? "Hide balance" : "Show balance"} className="inline-flex size-7 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                    {showBalance ? <Eye size={17} aria-hidden="true"/> : <EyeOff size={17} aria-hidden="true"/>}
                  </button>
                </div>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{showBalance ? visibleWallet ? "$" + (visibleWallet.availableTokens * 0.01).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—" : "••••••"}</p>
                <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-50/90"><Coins size={16} aria-hidden="true"/><span>≈ {showBalance ? visibleWallet ? visibleWallet.availableTokens.toLocaleString(undefined, { maximumFractionDigits: 3 }) + " enV" : "— enV" : "•••• enV"}</span></p>
                <p className="mt-1 text-xs text-white/70">Estimated reference value · not cash</p>
              </div>
              <div className="relative z-10 flex w-full justify-end sm:absolute sm:bottom-0 sm:right-0 sm:w-auto">
                <button type="button" aria-label="Fund wallet" title="Fund wallet" onClick={() => { if (state.status !== "ready") { window.location.assign("/account"); return; } void startFundingCheckout(); }} disabled={fundingBusy} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-[#3df1c2] px-4 py-2 text-sm font-semibold text-[#052a2a] no-underline transition hover:bg-[#74f9d7] disabled:cursor-wait disabled:opacity-60">
                  <CreditCard size={17} aria-hidden="true"/>{fundingBusy ? "Opening…" : "Add funds"}<ArrowUpRight size={15} aria-hidden="true"/>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MetricCard title="Total deposited" value={visibleWallet ? `${tokenAmount(visibleWallet.lifetimePurchasedSubunits)} enV` : "—"} description="Deposited" icon={<ArrowDownToLine size={15} aria-hidden="true"/>} />
            <MetricCard title="Total remaining" value={visibleWallet ? `${visibleWallet.availableTokens.toLocaleString(undefined, { maximumFractionDigits: 3 })} enV` : "—"} description="Available" icon={<RefreshCw size={15} aria-hidden="true"/>} />
            <MetricCard title="Total used" value={visibleWallet ? `${tokenAmount(visibleWallet.lifetimeConsumedSubunits)} enV` : "—"} description="Used" icon={<TrendingUp size={15} aria-hidden="true"/>} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MetricCard title="Bonuses" value={rewardsState.status === "ready" && rewardsState.data ? `${rewardsState.data.bonusTokens.toLocaleString(undefined, { maximumFractionDigits: 3 })} enV` : "—"} description="Bonus rewards" icon={<Gift size={15} aria-hidden="true"/>} className="border-amber-400/30" />
            <MetricCard title="Referral tokens" value={rewardsState.status === "ready" && rewardsState.data ? `${rewardsState.data.referralTokens.toLocaleString(undefined, { maximumFractionDigits: 3 })} enV` : "—"} description="Invite rewards" icon={<Users size={15} aria-hidden="true"/>} className="border-blue-400/30" />
            <MetricCard title="Affiliate" value={rewardsState.status === "ready" && rewardsState.data ? `${rewardsState.data.affiliateTokens.toLocaleString(undefined, { maximumFractionDigits: 3 })} enV` : "—"} description="Creator rewards" icon={<Link2 size={15} aria-hidden="true"/>} className="border-violet-400/30" />
          </div>
        </section>

        <section className="mt-3 grid gap-3 lg:grid-cols-2" aria-labelledby="rewards-title">
          <h2 id="rewards-title" className="sr-only">Referral and creator rewards</h2>
          <article className="relative overflow-hidden rounded-[20px] border border-emerald-300/25 bg-gradient-to-br from-[#063e37] via-[#06304a] to-[#0b1e36] p-3 text-white sm:p-4">
            <svg viewBox="0 0 160 90" className="pointer-events-none absolute right-4 top-3 h-16 w-24 opacity-80 sm:h-20 sm:w-28" fill="none" aria-hidden="true">
              <path d="M3 76 C18 70 23 49 37 57 S57 72 69 47 S89 36 101 43 S120 14 132 24 L151 6" stroke="#52ffd0" strokeWidth="3" strokeLinecap="round"/>
              <path d="M137 8 L151 6 L149 20" stroke="#52ffd0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="flex items-start gap-3 pr-24">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-white"><Video size={24} aria-hidden="true"/></span>
              <div className="min-w-0 flex-1"><h2 className="font-semibold">Tag enV on your videos</h2><p className="mt-1 text-sm leading-5 text-white/75">Earn tokens based on conversion.</p></div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/15 bg-black/15 p-2">
              <Link2 size={16} className="shrink-0 text-emerald-100" aria-hidden="true"/>
              <span className="min-w-0 flex-1 truncate text-xs text-white/80">{rewardsState.status === "ready" && rewardsState.data ? <>{appOrigin}/signup?ref={rewardsState.data.referralCode}&amp;source=video&amp;sig={rewardsState.data.videoSignature}</> : "Your signed tag link"}</span>
              <button type="button" disabled={rewardsState.status !== "ready" || !rewardsState.data} onClick={() => { if (rewardsState.data) void copyReferralLink(rewardsState.data.referralCode, "video", rewardsState.data.videoSignature); }} aria-label="Copy video tag link" title="Copy video tag link" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-40"><Copy size={16} aria-hidden="true"/></button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={rewardsState.status !== "ready" || !rewardsState.data} onClick={() => { if (rewardsState.data) void copyReferralLink(rewardsState.data.referralCode, "video", rewardsState.data.videoSignature); }} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#3df1c2] px-3 py-2 text-xs font-semibold text-[#052a2a] disabled:opacity-40"><Link2 size={14} aria-hidden="true"/> Copy link</button>
                <button type="button" disabled={rewardsState.status !== "ready" || !rewardsState.data} onClick={() => { if (rewardsState.data) void shareReferralLink(rewardsState.data.referralCode, "video", rewardsState.data.videoSignature); }} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/5 disabled:opacity-40"><Share2 size={14} aria-hidden="true"/> Share link</button>
              </div>
              <button type="button" onClick={() => setShowVideoDetails(value => !value)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#3df1c2] px-3 py-2 text-xs font-semibold text-[#052a2a]">{showVideoDetails ? "Hide details" : "View details"} <ArrowUpRight size={14} aria-hidden="true"/></button>
            </div>
            {showVideoDetails ? <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/15 p-3"><div><p className="text-[11px] text-white/65">Video sign-ups</p><p className="mt-1 text-sm font-semibold">{rewardsState.status === "ready" ? rewardsState.data?.videoSignups.toLocaleString() : "—"}</p></div><div><p className="text-[11px] text-white/65">Verified conversions</p><p className="mt-1 text-sm font-semibold">{rewardsState.status === "ready" ? rewardsState.data?.videoConversions.toLocaleString() : "—"}</p></div></div> : null}
          </article>

          <article className="relative overflow-hidden rounded-[20px] border border-violet-300/30 bg-gradient-to-br from-[#171854] via-[#24206b] to-[#48206c] p-3 text-white sm:p-4">
            <div className="flex items-start gap-3 pr-20">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-white"><Users size={24} aria-hidden="true"/></span>
              <div className="min-w-0 flex-1"><h2 className="font-semibold">Refer a friend</h2><p className="mt-1 text-sm leading-5 text-violet-100/80">Share your referral link and you both get rewarded with enV tokens!</p></div>
            </div>
            <div className="absolute right-4 top-4 flex flex-col items-center gap-1.5" aria-label="Both get rewarded">
              <span className="grid size-9 place-items-center rounded-xl bg-white/10 text-white"><Gift size={22} aria-hidden="true"/></span>
              <span className="max-w-20 text-center text-[10px] font-semibold leading-3 text-violet-100">Both get rewarded!</span>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/15 bg-black/15 p-2.5">
              <Link2 size={16} className="shrink-0 text-violet-100" aria-hidden="true"/>
              <span className="min-w-0 flex-1 truncate text-xs text-white/85">{rewardsState.status === "ready" && rewardsState.data ? `${appOrigin}/signup?ref=${rewardsState.data.referralCode}` : "Your personal referral link"}</span>
              <button type="button" disabled={rewardsState.status !== "ready" || !rewardsState.data} onClick={() => { if (rewardsState.data) void copyReferralLink(rewardsState.data.referralCode, "referral"); }} aria-label="Copy referral link" title="Copy referral link" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-40"><Copy size={16} aria-hidden="true"/></button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-violet-100/70">{rewardsState.status === "ready" && rewardsState.data ? `${rewardsState.data.referralCount} invites · ${rewardsState.data.qualifiedReferrals} qualified` : "Share your personal link with friends."}</p>
              <button type="button" disabled={rewardsState.status !== "ready" || !rewardsState.data} onClick={() => { if (rewardsState.data) void shareReferralLink(rewardsState.data.referralCode, "referral"); }} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#3df1c2] px-4 py-2 text-sm font-semibold text-[#052a2a] disabled:opacity-40"><Share2 size={15} aria-hidden="true"/> Share now</button>
            </div>
          </article>
        </section>

        {fundingFeedback ? <p className={`rounded-xl border p-3 text-sm leading-5 ${fundingFeedback.kind === "success" ? "border-emerald-500/30 bg-emerald-500/5 text-fg" : "border-rose-500/30 bg-rose-500/5 text-fg"}`} role="status" aria-live="polite">{fundingFeedback.message}</p> : null}

        <section className="mt-3 rounded-[24px] border border-border bg-surface p-4 shadow-sm sm:p-5" aria-labelledby="recent-transactions-title">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Clock3 size={18} className="text-accent" aria-hidden="true"/><h2 id="recent-transactions-title" className="font-semibold text-fg">Recent transactions</h2></div>
            <button type="button" onClick={() => setReloadKey(value => value + 1)} aria-label="Refresh transactions" className="inline-flex size-9 items-center justify-center rounded-full border border-border text-muted hover:bg-surface-2"><RefreshCw size={15} aria-hidden="true"/></button>
          </div>
          {state.status === "ready" && state.activity?.length ? <ul className="mt-3 divide-y divide-border">
            {state.activity.slice(0, showAllTransactions ? state.activity.length : 4).map(entry => <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
              <div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${entry.delta_available_subunits >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-violet-500/10 text-violet-600"}`}>{entry.delta_available_subunits >= 0 ? <ArrowDownToLine size={17} aria-hidden="true"/> : <TrendingUp size={17} aria-hidden="true"/>}</span><div className="min-w-0"><p className="text-sm font-medium text-fg">{activitySummary(entry)}</p><p className="mt-0.5 truncate text-xs text-muted">{entry.description}</p><p className="mt-1 text-[11px] text-subtle">{new Date(entry.created_at).toLocaleString()}</p></div></div>
              <span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent">{entry.entry_type.replaceAll("_", " ")}</span>
            </li>)}
          </ul> : <div className="flex items-center gap-3 py-5"><span className="grid size-10 place-items-center rounded-full bg-surface-2 text-muted"><Clock3 size={19} aria-hidden="true"/></span><div><p className="text-sm font-medium text-fg">No transactions yet</p><p className="mt-0.5 text-xs text-muted">Your deposits, token usage and rewards will appear here.</p></div></div>}
          {state.status === "ready" && (state.activity?.length ?? 0) > 4 ? <button type="button" onClick={() => setShowAllTransactions(value => !value)} className="mt-2 text-sm font-semibold text-accent">{showAllTransactions ? "Show less" : "View all transactions"}</button> : null}
        </section>


      </div>
    </AppShell>
  );
}
