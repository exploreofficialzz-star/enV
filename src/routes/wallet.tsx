import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine, Coins, RefreshCw, Wallet, Clock3, Copy, Gift, Users, Video, CreditCard, TrendingUp, Share2, ArrowUpRight, Link2, Eye, EyeOff, X } from "lucide-react";
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
type FundingProviderId = "paystack" | "cryptomus";
type FundingProviderOption = {
  id: FundingProviderId; label: string; enabled: boolean; currency: string; pricePerTokenMinor: number | null;
  packs: Array<{ tokens: number; amountMinor: number | null; currency: string }>; message: string;
};
type FundingOptionsState = { status: "loading" | "ready" | "unavailable"; providers: FundingProviderOption[]; message?: string };
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
  return (subunits / 1_000).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function tokenValueAmount(tokens: number): string {
  return "$" + (tokens * 0.01).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function tokenReferenceValue(tokens: number): string {
  return "Estimated token value " + (tokens * 0.01).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function tokenUnitDisplay(label: string): React.ReactNode {
  const unitIndex = label.lastIndexOf(" enV");
  if (unitIndex < 0) return label;
  const trailingText = label.slice(unitIndex + 4).trim();
  return (
    <>
      {label.slice(0, unitIndex)}
      <span className="ml-1 align-baseline text-[0.62em] font-semibold tracking-normal opacity-80">enV</span>
      {trailingText ? <span className="ml-1">{trailingText}</span> : null}
    </>
  );
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

function activityTypeLabel(entry: WalletActivity): string {
  const type = entry.entry_type.toLowerCase();
  if (type.includes("referral")) return "Referral reward";
  if (type.includes("affiliate") || type.includes("video")) return "Affiliate reward";
  if (type.includes("bonus") || type.includes("reward") || type.includes("grant")) return "Bonus reward";
  if (type === "reservation") return "Tokens reserved";
  if (type === "release") return "Reservation released";
  if (entry.consumed_subunits > 0 || type.includes("consum")) return "Tool usage";
  if (["purchase", "deposit", "top_up", "funding", "wallet_fund"].some(kind => type.includes(kind))) return "Wallet funded";
  if (type.includes("refund")) return "Refund";
  return type.replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
}

function activityIcon(entry: WalletActivity): React.ReactNode {
  const type = entry.entry_type.toLowerCase();
  if (type.includes("referral") || type.includes("affiliate") || type.includes("bonus") || type.includes("reward") || type.includes("grant")) return <Gift size={16} aria-hidden="true" />;
  if (type === "reservation") return <Clock3 size={16} aria-hidden="true" />;
  if (type === "release" || type.includes("refund")) return <RefreshCw size={16} aria-hidden="true" />;
  if (["purchase", "deposit", "top_up", "funding", "wallet_fund"].some(kind => type.includes(kind))) return <CreditCard size={16} aria-hidden="true" />;
  if (entry.consumed_subunits > 0 || type.includes("consum")) return <TrendingUp size={16} aria-hidden="true" />;
  return entry.delta_available_subunits >= 0
    ? <ArrowDownToLine size={16} aria-hidden="true" />
    : <TrendingUp size={16} aria-hidden="true" />;
}

function MetricCard({ title, value, description, icon, className = "" }: { title: string; value: string; description: string; icon: React.ReactNode; className?: string }) {
  return <div className={`flex min-w-0 items-center gap-2 rounded-xl border border-border bg-surface px-2 py-2 sm:px-2.5 sm:py-2.5 ${className}`}>
    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg sm:size-8">{icon}</span>
    <div className="min-w-0 flex-1">
      <p className="break-words text-[10px] font-medium leading-3 text-muted sm:text-xs">{title}</p>
      <p className="mt-0.5 break-words text-xs font-semibold leading-4 tracking-tight text-fg sm:text-sm">{tokenUnitDisplay(value)}</p>
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
  const [showFundingOptions, setShowFundingOptions] = useState(false);
  const [selectedFundingProvider, setSelectedFundingProvider] = useState<FundingProviderId | null>(null);
  const [fundingOptionsState, setFundingOptionsState] = useState<FundingOptionsState>({ status: "loading", providers: [] });
  const [fundingFeedback, setFundingFeedback] = useState<{ kind: "success" | "error" | "info"; message: string } | null>(null);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [showVideoDetails, setShowVideoDetails] = useState(false);


  useEffect(() => {
    if (!showFundingOptions) return;
    const controller = new AbortController();
    setFundingOptionsState({ status: "loading", providers: [] });
    void fetch("/api/billing/funding-options", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as {
          ok?: boolean;
          data?: { providers?: FundingProviderOption[] };
          message?: string;
        } | null;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.data?.providers)) {
          throw new Error(payload?.message ?? "Payment options could not be loaded.");
        }
        const providers = payload.data.providers.filter((item) =>
          item && (item.id === "paystack" || item.id === "cryptomus")
        );
        if (!providers.length) throw new Error("Payment options are not available.");
        setFundingOptionsState({ status: "ready", providers });
        setSelectedFundingProvider((current) =>
          current && providers.some((item) => item.id === current)
            ? current
            : providers.find((item) => item.enabled)?.id ?? null
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFundingOptionsState({
          status: "unavailable",
          providers: [
            { id: "paystack", label: "Pay with cards", enabled: false, currency: "NGN", pricePerTokenMinor: null, packs: [], message: "Secure card checkout could not be loaded. Refresh and try again." },
            { id: "cryptomus", label: "Pay with crypto", enabled: false, currency: "USD", pricePerTokenMinor: null, packs: [], message: "Secure crypto checkout could not be loaded. Refresh and try again." },
          ],
          message: error instanceof Error ? error.message : "Secure payment options could not be loaded.",
        });
        setSelectedFundingProvider(null);
      });
    return () => controller.abort();
  }, [showFundingOptions]);

  useEffect(() => {
    if (!showFundingOptions) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !fundingBusy) setShowFundingOptions(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showFundingOptions, fundingBusy]);

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
    if (paymentState === "crypto-pending") {
      const reference = params.get("reference") ?? "";
      setFundingFeedback({ kind: "info", message: "Checking the crypto invoice with the payment provider. enV will add tokens only after the payment is confirmed." });
      setReloadKey(value => value + 1);
      window.history.replaceState({}, "", "/wallet");
      if (/^[a-f0-9-]{36}$/i.test(reference)) {
        void fetch("/api/billing/cryptomus/verify", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ reference }),
        }).then(async (response) => {
          const payload = await response.json().catch(() => null) as {
            ok?: boolean;
            data?: { status?: string; credited?: boolean };
            message?: string;
          } | null;
          if (!response.ok || !payload?.ok || !payload.data?.status) {
            throw new Error(payload?.message ?? "The crypto payment could not be checked yet.");
          }
          const status = payload.data.status;
          if (payload.data.credited || status === "credited" || status === "already-processed") {
            setFundingFeedback({ kind: "success", message: "Crypto payment verified by enV. Your wallet has been refreshed." });
          } else if (status === "pending") {
            setFundingFeedback({ kind: "info", message: "The crypto payment is still processing. No tokens have been added yet; your wallet will update after provider verification." });
          } else if (status === "requires-review") {
            setFundingFeedback({ kind: "error", message: "The crypto provider flagged this invoice for review. No additional tokens were credited. Contact enV support before making another payment." });
          } else if (status === "cancelled" || status === "failed") {
            setFundingFeedback({ kind: "error", message: "The crypto payment was not completed, so no tokens were added." });
          } else {
            setFundingFeedback({ kind: "info", message: "The crypto invoice has not reached a final paid state. No tokens were added yet." });
          }
          setReloadKey(value => value + 1);
        }).catch(() => {
          setFundingFeedback({ kind: "info", message: "The crypto invoice could not be checked just now. No tokens were added by the return page; the verified provider callback can still update your wallet." });
          setReloadKey(value => value + 1);
        });
      } else {
        setFundingFeedback({ kind: "info", message: "The crypto payment reference was not provided. Your wallet will change only after the payment provider confirms a matching invoice." });
      }
    } else if (paymentState === "success") {
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

  async function startFundingCheckout(provider: FundingProviderId) {
    if (fundingBusy) return;
    const providerOption = fundingOptionsState.providers.find((item) => item.id === provider);
    if (!providerOption?.enabled || fundingOptionsState.status !== "ready") {
      setFundingFeedback({
        kind: "error",
        message: providerOption?.message ?? "This payment method is not available right now. No payment was taken.",
      });
      return;
    }
    setFundingBusy(true);
    setFundingFeedback(null);
    try {
      const response = await fetch("/api/billing/purchases", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          provider,
          tokenPack: selectedTokenPack,
          idempotencyKey: provider + "-wallet-topup-" + crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        data?: { authorizationUrl?: string; provider?: string };
        message?: string;
      } | null;
      const target = payload?.data?.authorizationUrl;
      const expectedHost = provider === "paystack" ? "checkout.paystack.com" : "pay.cryptomus.com";
      let checkout: URL | null = null;
      try { if (target) checkout = new URL(target); } catch { checkout = null; }
      if (!response.ok || !payload?.ok || payload.data?.provider !== provider ||
          !checkout || checkout.protocol !== "https:" || checkout.hostname !== expectedHost) {
        throw new Error(payload?.message ?? "Secure checkout could not be opened. No tokens were added.");
      }
      window.location.assign(checkout.href);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      const requiresSetup = /PAYMENTS_NOT_CONFIGURED|CRYPTOMUS_NOT_CONFIGURED|BILLING_AUTH_NOT_CONFIGURED|AUTH_REQUIRED|provider approval|checkout is not configured|approved NGN token price|persistent database|billing launch checks|sign in is required/i.test(detail);
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

        <section className="space-y-2.5" aria-label="Wallet overview">
          <div className="relative overflow-hidden rounded-[24px] border border-emerald-300/25 bg-gradient-to-br from-[#1747af] via-[#07394e] to-[#00a97b] p-6 text-white shadow-sm sm:p-7">
            <div className="relative flex items-center gap-2.5 sm:gap-3">
              <span className="grid size-13 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white shadow-inner sm:size-16"><Wallet size={28} aria-hidden="true"/></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-white/90 sm:text-sm">
                  <span>Total balance</span>
                  <button type="button" onClick={() => setShowBalance(value => !value)} aria-label={showBalance ? "Hide balance" : "Show balance"} title={showBalance ? "Hide balance" : "Show balance"} className="inline-flex size-8 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                    {showBalance ? <Eye size={16} aria-hidden="true"/> : <EyeOff size={16} aria-hidden="true"/>}
                  </button>
                </div>
                <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{showBalance ? tokenValueAmount(visibleWallet?.availableTokens ?? 0) : "••••••"}</p>
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-50/90 sm:text-sm"><Coins size={14} aria-hidden="true"/><span>{tokenUnitDisplay(showBalance ? "≈ " + (visibleWallet?.availableTokens ?? 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " enV" : "•••• enV")}</span></p>
                <p className="mt-0.5 text-[10px] text-white/75 sm:text-xs">{showBalance ? "Estimated token value " + ((visibleWallet?.availableTokens ?? 0) * 0.01).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : "Estimated token value ••••••"}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <svg viewBox="0 0 120 64" className="h-10 w-20 sm:h-12 sm:w-28" fill="none" aria-label="Upward token trend">
                  <path d="M4 54 C15 51 19 37 29 41 S43 49 52 31 S68 23 77 27 S91 17 103 15 L113 5 M103 14 L113 5 L112 16" stroke="#52ffd0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <button type="button" aria-label="Fund wallet" title="Fund wallet" onClick={() => { if (state.status !== "ready") { window.location.assign("/account"); return; } setFundingFeedback(null); setShowFundingOptions(true); }} disabled={fundingBusy} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#3df1c2] px-3 py-2 text-sm font-semibold text-[#052a2a] no-underline transition hover:bg-[#74f9d7] disabled:cursor-wait disabled:opacity-60 sm:px-4">
                  <CreditCard size={15} aria-hidden="true"/>{fundingBusy ? "Opening…" : "Add funds"}<ArrowUpRight size={13} aria-hidden="true"/>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <MetricCard title="Total deposited" value={visibleWallet ? `${tokenAmount(visibleWallet.lifetimePurchasedSubunits)} enV` : "0.000 enV"} description={tokenReferenceValue((visibleWallet?.lifetimePurchasedSubunits ?? 0) / 1_000)} icon={<ArrowDownToLine size={15} aria-hidden="true"/>} />
            <MetricCard title="Total remaining" value={`${(visibleWallet?.availableTokens ?? 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} enV`} description={tokenReferenceValue(visibleWallet?.availableTokens ?? 0)} icon={<RefreshCw size={15} aria-hidden="true"/>} />
            <MetricCard title="Total used" value={visibleWallet ? `${tokenAmount(visibleWallet.lifetimeConsumedSubunits)} enV` : "0.000 enV"} description={tokenReferenceValue((visibleWallet?.lifetimeConsumedSubunits ?? 0) / 1_000)} icon={<TrendingUp size={15} aria-hidden="true"/>} />
          </div>
        </section>

        {showFundingOptions ? (
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            role="presentation"
            onMouseDown={(event) => { if (event.target === event.currentTarget && !fundingBusy) setShowFundingOptions(false); }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="funding-dialog-title"
              className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-border bg-surface p-4 text-fg shadow-2xl sm:rounded-3xl sm:p-6"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id="funding-dialog-title" className="text-lg font-semibold sm:text-xl">Add funds</h2>
                  <p className="mt-1 text-sm leading-5 text-muted">Choose how you want to pay, then select the enV token amount.</p>
                </div>
                <button
                  type="button"
                  aria-label="Close payment options"
                  onClick={() => { if (!fundingBusy) setShowFundingOptions(false); }}
                  disabled={fundingBusy}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-muted hover:bg-surface-2 disabled:opacity-50"
                >
                  <X size={18} aria-hidden="true"/>
                </button>
              </div>

              {fundingOptionsState.status === "loading" ? (
                <p className="mt-5 rounded-xl border border-border bg-surface-2 p-3 text-sm text-muted" role="status">Checking available payment methods…</p>
              ) : null}
              {fundingOptionsState.status === "unavailable" ? (
                <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm leading-5 text-fg" role="status">{fundingOptionsState.message}</p>
              ) : null}

              <div className="mt-4 space-y-2">
                <h3 className="text-sm font-semibold">Payment method</h3>
                {fundingOptionsState.providers.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selectedFundingProvider === option.id}
                    onClick={() => setSelectedFundingProvider(option.id)}
                    className={"flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition " +
                      (selectedFundingProvider === option.id
                        ? "border-accent bg-accent/5"
                        : "border-border bg-surface hover:bg-surface-2") +
                      (!option.enabled ? " opacity-80" : "")}
                  >
                    <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg">
                      {option.id === "paystack" ? <CreditCard size={19} aria-hidden="true"/> : <Coins size={19} aria-hidden="true"/>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{option.label}</span>
                        <span className={"rounded-full px-2 py-1 text-[10px] font-semibold " +
                          (option.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-surface-2 text-muted")}>
                          {option.enabled ? "Available" : "Not available"}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted">
                        {option.id === "paystack"
                          ? "Pay by card and any local channels enabled on enV’s approved Paystack account."
                          : "Pay through a hosted crypto invoice. The available coins and networks are shown by the provider."}
                      </span>
                      {selectedFundingProvider === option.id && !option.enabled ? (
                        <span className="mt-2 block text-xs leading-5 text-muted">{option.message}</span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-5 space-y-2">
                <h3 className="text-sm font-semibold">Choose your token pack</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[100, 250, 500, 1000].map((tokens) => {
                    const pack = fundingOptionsState.providers.find((item) => item.id === selectedFundingProvider)?.packs.find((item) => item.tokens === tokens);
                    const amount = pack?.amountMinor;
                    const currency = pack?.currency ?? fundingOptionsState.providers.find((item) => item.id === selectedFundingProvider)?.currency ?? "NGN";
                    const formattedAmount = amount !== null && amount !== undefined
                      ? new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
                          style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
                        }).format(amount / 100)
                      : "Price at checkout";
                    return (
                      <button
                        key={tokens}
                        type="button"
                        aria-pressed={selectedTokenPack === tokens}
                        onClick={() => setSelectedTokenPack(tokens)}
                        className={"flex min-h-[78px] flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition " +
                          (selectedTokenPack === tokens ? "border-accent bg-accent/5" : "border-border bg-surface hover:bg-surface-2")}
                      >
                        <span className="text-sm font-semibold">{tokens.toLocaleString()} enV</span>
                        <span className="mt-1 text-xs text-muted">{formattedAmount}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedFundingProvider ? (
                <p className="mt-4 text-xs leading-5 text-muted">
                  {fundingOptionsState.providers.find((item) => item.id === selectedFundingProvider)?.message}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => selectedFundingProvider && void startFundingCheckout(selectedFundingProvider)}
                disabled={fundingBusy || fundingOptionsState.status !== "ready" ||
                  !selectedFundingProvider ||
                  !fundingOptionsState.providers.some((item) => item.id === selectedFundingProvider && item.enabled)}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#3df1c2] px-4 py-3 text-sm font-semibold text-[#052a2a] transition hover:bg-[#74f9d7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CreditCard size={17} aria-hidden="true"/>
                {fundingBusy ? "Opening secure checkout…" : "Continue to secure checkout"}
                {!fundingBusy ? <ArrowUpRight size={15} aria-hidden="true"/> : null}
              </button>
              <p className="mt-3 text-center text-[11px] leading-4 text-muted">enV adds tokens only after the server verifies the provider’s payment confirmation. Do not close a payment until the provider shows its final status.</p>
            </section>
          </div>
        ) : null}

        <section className="mt-2 space-y-2" aria-labelledby="rewards-title">
          <h2 id="rewards-title" className="sr-only">Referral and creator rewards</h2>
          <article className="relative overflow-hidden rounded-[14px] border border-emerald-300/25 bg-gradient-to-br from-[#063e37] via-[#06304a] to-[#0b1e36] p-2 text-white shadow-sm sm:p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/10 text-white"><Video size={15} aria-hidden="true"/></span>
              <div className="min-w-0 flex-1"><h2 className="text-[13px] font-semibold text-white sm:text-sm">Tag enV on your videos</h2><p className="mt-0.5 text-[11px] leading-4 text-white/75">Earn tokens based on conversion.</p></div>
              <svg viewBox="0 0 120 64" className="h-6 w-10 shrink-0 sm:h-7 sm:w-12" fill="none" aria-label="Video conversions trend">
                <path d="M4 54 C15 51 19 37 29 41 S43 49 52 31 S68 23 77 27 S91 17 103 15 L113 5 M103 14 L113 5 L112 16" stroke="#52ffd0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/15 px-1.5 py-0.5">
              <Link2 size={11} className="shrink-0 text-white/90" aria-hidden="true"/>
              <span className="min-w-0 flex-1 truncate text-[10px] text-white/85">{rewardsState.status === "ready" && rewardsState.data ? `${appOrigin}/signup?ref=${rewardsState.data.referralCode}&source=video&sig=${rewardsState.data.videoSignature}` : "Your signed tag link"}</span>
              <button type="button" disabled={rewardsState.status !== "ready" || !rewardsState.data} onClick={() => { if (rewardsState.data) void copyReferralLink(rewardsState.data.referralCode, "video", rewardsState.data.videoSignature); }} aria-label="Copy video tag link" title="Copy video tag link" className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40"><Copy size={12} aria-hidden="true"/></button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex gap-1.5">
                <button type="button" disabled={rewardsState.status !== "ready" || !rewardsState.data} onClick={() => { if (rewardsState.data) void copyReferralLink(rewardsState.data.referralCode, "video", rewardsState.data.videoSignature); }} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-[#3df1c2] px-2 py-0.5 text-[10px] font-semibold text-[#052a2a] disabled:opacity-40"><Link2 size={12} aria-hidden="true"/> Copy link</button>
                <button type="button" disabled={rewardsState.status !== "ready" || !rewardsState.data} onClick={() => { if (rewardsState.data) void shareReferralLink(rewardsState.data.referralCode, "video", rewardsState.data.videoSignature); }} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-white/25 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/10 disabled:opacity-40"><Share2 size={11} aria-hidden="true"/> Share link</button>
              </div>
              <button type="button" onClick={() => setShowVideoDetails(value => !value)} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/10">{showVideoDetails ? "Hide details" : "View details"} <ArrowUpRight size={11} aria-hidden="true"/></button>
            </div>
            {showVideoDetails ? <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-lg border border-white/15 bg-black/15 p-1.5"><div><p className="text-[10px] text-white/70">Video sign-ups</p><p className="mt-1 text-sm font-semibold text-white">{rewardsState.status === "ready" && rewardsState.data ? rewardsState.data.videoSignups.toLocaleString() : "0"}</p></div><div><p className="text-[10px] text-white/70">Verified conversions</p><p className="mt-1 text-sm font-semibold text-white">{rewardsState.status === "ready" && rewardsState.data ? rewardsState.data.videoConversions.toLocaleString() : "0"}</p></div></div> : null}
          </article>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2" aria-label="Reward token balances">
            <MetricCard title="Bonuses" value={rewardsState.status === "ready" && rewardsState.data ? `${rewardsState.data.bonusTokens.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} enV` : "0.000 enV"} description={tokenReferenceValue(rewardsState.status === "ready" && rewardsState.data ? rewardsState.data.bonusTokens : 0)} icon={<Gift size={15} aria-hidden="true"/>} />
            <MetricCard title="Referral tokens" value={rewardsState.status === "ready" && rewardsState.data ? `${rewardsState.data.referralTokens.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} enV` : "0.000 enV"} description={tokenReferenceValue(rewardsState.status === "ready" && rewardsState.data ? rewardsState.data.referralTokens : 0)} icon={<Users size={15} aria-hidden="true"/>} />
            <MetricCard title="Affiliate program" value={rewardsState.status === "ready" && rewardsState.data ? `${rewardsState.data.affiliateTokens.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} enV` : "0.000 enV"} description={tokenReferenceValue(rewardsState.status === "ready" && rewardsState.data ? rewardsState.data.affiliateTokens : 0)} icon={<Link2 size={15} aria-hidden="true"/>} />
          </div>

          <article className="relative overflow-hidden rounded-[14px] border border-violet-300/30 bg-gradient-to-br from-[#171854] via-[#24206b] to-[#48206c] p-2 text-white shadow-sm sm:p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/10 text-white"><Users size={15} aria-hidden="true"/></span>
              <div className="min-w-0 flex-1"><h2 className="text-[13px] font-semibold text-white sm:text-sm">Refer a friend</h2><p className="mt-0.5 text-[11px] leading-4 text-white/80">Share your referral link and you both get rewarded with enV tokens!</p></div>
              <span className="flex shrink-0 flex-col items-center text-white"><Gift size={16} aria-hidden="true"/><span className="mt-0.5 text-[9px] font-semibold leading-3 text-white/75">Both rewarded</span></span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/15 px-1.5 py-0.5">
              <Link2 size={12} className="shrink-0 text-white/90" aria-hidden="true"/>
              <span className="min-w-0 flex-1 truncate text-[10px] text-white/85">{rewardsState.status === "ready" && rewardsState.data ? `${appOrigin}/signup?ref=${rewardsState.data.referralCode}` : "Your personal referral link"}</span>
              <button type="button" disabled={rewardsState.status !== "ready" || !rewardsState.data} onClick={() => { if (rewardsState.data) void copyReferralLink(rewardsState.data.referralCode, "referral"); }} aria-label="Copy referral link" title="Copy referral link" className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40"><Copy size={12} aria-hidden="true"/></button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
              <p className="text-[9px] text-white/75">{rewardsState.status === "ready" && rewardsState.data ? `${rewardsState.data.referralCount} invites · ${rewardsState.data.qualifiedReferrals} qualified` : "Share your personal link with friends."}</p>
              <button type="button" disabled={rewardsState.status !== "ready" || !rewardsState.data} onClick={() => { if (rewardsState.data) void shareReferralLink(rewardsState.data.referralCode, "referral"); }} className="inline-flex min-h-7 items-center gap-1 rounded-full bg-[#3df1c2] px-2 py-0.5 text-[10px] font-semibold text-[#052a2a] disabled:opacity-40"><Share2 size={11} aria-hidden="true"/> Share now</button>
            </div>
          </article>
        </section>

        {fundingFeedback ? <p className={`rounded-xl border p-3 text-sm leading-5 ${fundingFeedback.kind === "success" ? "border-emerald-500/30 bg-emerald-500/5 text-fg" : fundingFeedback.kind === "error" ? "border-rose-500/30 bg-rose-500/5 text-fg" : "border-border bg-surface-2 text-muted"}`} role="status" aria-live="polite">{fundingFeedback.message}</p> : null}

        <section className="mt-3 rounded-[20px] border border-border bg-surface p-3 shadow-sm sm:p-4" aria-labelledby="recent-transactions-title">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Clock3 size={18} className="text-accent" aria-hidden="true"/><h2 id="recent-transactions-title" className="font-semibold text-fg">Recent transactions</h2></div>
            <button type="button" onClick={() => setReloadKey(value => value + 1)} aria-label="Refresh transactions" className="inline-flex size-9 items-center justify-center rounded-full border border-border text-muted hover:bg-surface-2"><RefreshCw size={15} aria-hidden="true"/></button>
          </div>
          {state.status === "ready" && state.activity?.length ? <ul className="mt-3 divide-y divide-border">
            {state.activity.slice(0, showAllTransactions ? state.activity.length : 4).map(entry => <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
              <div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-fg">{activityIcon(entry)}</span><div className="min-w-0"><p className="text-sm font-medium text-fg">{activitySummary(entry)}</p><p className="mt-0.5 truncate text-xs text-muted">{entry.description}</p><p className="mt-1 text-[11px] text-subtle">{new Date(entry.created_at).toLocaleString()}</p></div></div>
              <span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent">{activityTypeLabel(entry)}</span>
            </li>)}
          </ul> : <div className="flex items-center gap-3 py-5"><span className="grid size-10 place-items-center rounded-full bg-surface-2 text-muted"><Clock3 size={19} aria-hidden="true"/></span><div><p className="text-sm font-medium text-fg">No transactions yet</p><p className="mt-0.5 text-xs text-muted">Your deposits, token usage and rewards will appear here.</p></div></div>}
          {state.status === "ready" && (state.activity?.length ?? 0) > 4 ? <button type="button" onClick={() => setShowAllTransactions(value => !value)} className="mt-2 text-sm font-semibold text-accent">{showAllTransactions ? "Show less" : "View all transactions"}</button> : null}
        </section>


      </div>
    </AppShell>
  );
}
