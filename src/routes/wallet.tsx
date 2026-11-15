import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine, Coins, RefreshCw, Wallet, Clock3, Copy, Gift, Users, Video, CreditCard, TrendingUp, Share2, ArrowUpRight, Link2, Eye, EyeOff, X } from "lucide-react";
import { parseUsdAmountToCents, type CustomerPaymentMethod } from "@/lib/billing/payment-methods";
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
  recoveryDebtTokens: number;
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
type WalletFundingChoice = CustomerPaymentMethod | "flutterwave";
type FlutterwaveMethod = "card" | "mobile_money" | "bank_transfer";
type FlutterwaveBankTransferDetails = {
  accountNumber: string;
  bankName: string;
  currency: string;
  amount: number;
  reference: string;
  expiresAt: string;
  note: string;
};
type FundingMethods = Record<WalletFundingChoice, boolean>;
type FundingOptionsState = {
  status: "loading" | "ready" | "unavailable";
  methods: FundingMethods;
  countryCode?: string | null;
  currency?: string | null;
  flutterwave?: {
    enabled: boolean;
    currency?: string | null;
    paymentMethods: FlutterwaveMethod[];
    mobileNetworks: Array<{ network: string; name: string }>;
  };
  message?: string;
};
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

async function encryptFlutterwaveField(value: string, encodedKey: string, nonce: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(encodedKey), (character) => character.charCodeAt(0));
  if (keyBytes.byteLength !== 32) throw new Error("The Flutterwave encryption key is not a valid AES-256 key.");
  const key = await window.crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new TextEncoder().encode(nonce) },
    key,
    new TextEncoder().encode(value),
  );
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

function flutterwaveNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function tokenAmount(subunits: number): string {
  return (subunits / 1_000).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function tokenValueAmount(tokens: number): string {
  return "$" + (tokens * 0.01).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function tokenReferenceValue(tokens: number): string {
  const amount = new Intl.NumberFormat(undefined, {
    style: "currency", currency: "USD", minimumFractionDigits: 3, maximumFractionDigits: 3,
  }).format(tokens * 0.01);
  return "Estimated USD reference value " + amount;
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
  const [customAmountUsd, setCustomAmountUsd] = useState("");
  const [fundingBusy, setFundingBusy] = useState(false);
  const [showFundingOptions, setShowFundingOptions] = useState(false);
  const [fundingOptionsReloadKey, setFundingOptionsReloadKey] = useState(0);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<WalletFundingChoice>("card");
  const [flutterwaveMethod, setFlutterwaveMethod] = useState<FlutterwaveMethod>("card");
  const [flutterwaveCustomerName, setFlutterwaveCustomerName] = useState("");
  const [flutterwavePhoneNumber, setFlutterwavePhoneNumber] = useState("");
  const [flutterwaveNetwork, setFlutterwaveNetwork] = useState("");
  const [flutterwaveAddressLine1, setFlutterwaveAddressLine1] = useState("");
  const [flutterwaveAddressLine2, setFlutterwaveAddressLine2] = useState("");
  const [flutterwaveCity, setFlutterwaveCity] = useState("");
  const [flutterwaveState, setFlutterwaveState] = useState("");
  const [flutterwavePostalCode, setFlutterwavePostalCode] = useState("");
  const [flutterwaveCardNumber, setFlutterwaveCardNumber] = useState("");
  const [flutterwaveExpiryMonth, setFlutterwaveExpiryMonth] = useState("");
  const [flutterwaveExpiryYear, setFlutterwaveExpiryYear] = useState("");
  const [flutterwaveCvv, setFlutterwaveCvv] = useState("");
  const [flutterwaveChallenge, setFlutterwaveChallenge] = useState<{ reference: string; type: "otp" | "pin" | "avs" } | null>(null);
  const [flutterwaveAuthorizationValue, setFlutterwaveAuthorizationValue] = useState("");
  const [flutterwaveBankTransfer, setFlutterwaveBankTransfer] = useState<FlutterwaveBankTransferDetails | null>(null);
  const [fundingOptionsState, setFundingOptionsState] = useState<FundingOptionsState>({
    status: "loading", methods: { card: false, local: false, more: false, flutterwave: false },
  });
  const [fundingFeedback, setFundingFeedback] = useState<{ kind: "success" | "error" | "info"; message: string } | null>(null);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [showVideoDetails, setShowVideoDetails] = useState(false);


  useEffect(() => {
    if (!showFundingOptions) return;
    const controller = new AbortController();
    setFundingOptionsState({ status: "loading", methods: { card: false, local: false, more: false, flutterwave: false } });
    void fetch("/api/billing/funding-options", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as {
          ok?: boolean;
          data?: {
            methods?: Partial<FundingMethods>;
            countryCode?: string | null;
            currency?: string | null;
            message?: string;
            flutterwave?: {
              enabled?: boolean;
              currency?: string | null;
              paymentMethods?: string[];
              mobileNetworks?: Array<{ network?: string; name?: string }>;
            };
          };
          message?: string;
        } | null;
        const methods = payload?.data?.methods;
        if (!response.ok || !payload?.ok || !methods ||
            typeof methods.card !== "boolean" || typeof methods.local !== "boolean" ||
            typeof methods.more !== "boolean") {
          throw new Error(payload?.message ?? "Payment options could not be loaded.");
        }
        const flutterwaveMethods = Array.isArray(payload.data?.flutterwave?.paymentMethods)
          ? payload.data.flutterwave.paymentMethods.filter((item): item is FlutterwaveMethod =>
              item === "card" || item === "mobile_money" || item === "bank_transfer")
          : [];
        const mobileNetworks = Array.isArray(payload.data?.flutterwave?.mobileNetworks)
          ? payload.data.flutterwave.mobileNetworks.filter((entry): entry is { network: string; name: string } =>
              typeof entry.network === "string" && typeof entry.name === "string")
          : [];
        const availableMethods: FundingMethods = {
          card: methods.card, local: methods.local, more: methods.more,
          flutterwave: methods.flutterwave === true && flutterwaveMethods.length > 0,
        };
        setFundingOptionsState({
          status: "ready",
          methods: availableMethods,
          countryCode: payload.data?.countryCode ?? null,
          currency: payload.data?.currency ?? null,
          flutterwave: {
            enabled: payload.data?.flutterwave?.enabled === true,
            currency: payload.data?.flutterwave?.currency ?? null,
            paymentMethods: flutterwaveMethods,
            mobileNetworks,
          },
          message: payload.data?.message ?? payload.message,
        });
        setSelectedPaymentMethod((current) => availableMethods[current]
          ? current
          : availableMethods.card ? "card" : availableMethods.local ? "local" : availableMethods.more ? "more" : "flutterwave");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFundingOptionsState({
          status: "unavailable",
          methods: { card: false, local: false, more: false, flutterwave: false },
          message: "Payment options could not be loaded. Check your connection and try again.",
        });
      });
    return () => controller.abort();
  }, [showFundingOptions, fundingOptionsReloadKey]);

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
      setFundingFeedback({ kind: "info", message: "The payment is still processing. No tokens have been added yet; your wallet will update after the provider confirms the payment." });
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

  async function startFundingCheckout(method: WalletFundingChoice) {
    if (fundingBusy) return;
    const amountUsdCents = parseUsdAmountToCents(customAmountUsd);
    if (amountUsdCents === null) {
      setFundingFeedback({ kind: "error", message: "Enter at least $1.00." });
      return;
    }
    if (fundingOptionsState.status !== "ready" || !fundingOptionsState.methods[method]) {
      setFundingFeedback({ kind: "error", message: "Choose an available payment method." });
      return;
    }

    setFundingBusy(true);
    setFundingFeedback(null);
    try {
      let flutterwaveDetails: Record<string, unknown> | undefined;
      if (method === "flutterwave") {
        const rawPhoneNumber = flutterwavePhoneNumber.replace(/\D/g, "");
        const phoneNumber = rawPhoneNumber.startsWith("0") ? rawPhoneNumber.slice(1) : rawPhoneNumber;
        if (!/^\d{7,10}$/.test(phoneNumber)) {
          throw new Error("Enter a valid phone number to continue with Flutterwave.");
        }
        if (!flutterwaveCustomerName.trim()) {
          throw new Error("Enter your first and last name to continue with Flutterwave.");
        }
        if (flutterwaveMethod === "card") {
          const cardNumber = flutterwaveCardNumber.replace(/\D/g, "");
          const month = flutterwaveExpiryMonth.trim().padStart(2, "0");
          const year = flutterwaveExpiryYear.trim();
          const cvv = flutterwaveCvv.trim();
          if (cardNumber.length < 12 || cardNumber.length > 19 ||
              !/^(?:0[1-9]|1[0-2])$/.test(month) ||
              !/^(?:\d{2}|\d{4})$/.test(year) ||
              !/^\d{3,4}$/.test(cvv)) {
            throw new Error("Check the card number, expiry date and security code.");
          }
          const keyResponse = await fetch("/api/billing/flutterwave/encryption-key", {
            credentials: "same-origin",
            headers: { accept: "application/json" },
          });
          const keyPayload = await keyResponse.json().catch(() => null) as {
            ok?: boolean; data?: { encryptionKey?: string };
          } | null;
          if (!keyResponse.ok || !keyPayload?.ok || !keyPayload.data?.encryptionKey) {
            throw new Error("Flutterwave card encryption is not configured. No card details were sent.");
          }
          const nonce = flutterwaveNonce();
          // Flutterwave v4 requires each card field to be AES-256-GCM encrypted
          // before it leaves the browser. No raw PAN or CVV is posted to enV.
          const [encryptedCardNumber, encryptedExpiryMonth, encryptedExpiryYear, encryptedCvv] = await Promise.all([
            encryptFlutterwaveField(cardNumber, keyPayload.data.encryptionKey, nonce),
            encryptFlutterwaveField(month, keyPayload.data.encryptionKey, nonce),
            encryptFlutterwaveField(year, keyPayload.data.encryptionKey, nonce),
            encryptFlutterwaveField(cvv, keyPayload.data.encryptionKey, nonce),
          ]);
          flutterwaveDetails = {
            type: "card",
            phoneNumber,
            card: {
              encrypted_card_number: encryptedCardNumber,
              encrypted_expiry_month: encryptedExpiryMonth,
              encrypted_expiry_year: encryptedExpiryYear,
              encrypted_cvv: encryptedCvv,
              nonce,
            },
          };
        } else if (flutterwaveMethod === "mobile_money") {
          if (!flutterwaveNetwork) throw new Error("Choose your mobile-money network.");
          flutterwaveDetails = {
            type: "mobile_money",
            phoneNumber,
            mobile_money: { network: flutterwaveNetwork, phone_number: phoneNumber },
          };
        } else if (flutterwaveMethod === "bank_transfer") {
          flutterwaveDetails = { type: "bank_transfer", phoneNumber };
        } else {
          throw new Error("Choose a Flutterwave payment method supported in your country.");
        }
      }

      const response = await fetch("/api/billing/purchases", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(method === "flutterwave" ? {
          provider: "flutterwave",
          flutterwaveDetails,
          customerName: flutterwaveCustomerName.trim(),
          customerPhone: flutterwavePhoneNumber.trim(),
          customerAddress: {
            line1: flutterwaveAddressLine1.trim(),
            line2: flutterwaveAddressLine2.trim(),
            city: flutterwaveCity.trim(),
            state: flutterwaveState.trim(),
            postalCode: flutterwavePostalCode.trim(),
          },
          amountUsdCents,
          idempotencyKey: "flutterwave-wallet-" + crypto.randomUUID(),
        } : {
          paymentMethod: method,
          amountUsdCents,
          idempotencyKey: method + "-wallet-topup-" + crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        data?: {
          authorizationUrl?: string | null;
          paymentMethod?: string;
          provider?: string;
          reference?: string;
          chargeId?: string;
          status?: string;
          nextAction?: string | null;
          paymentInstruction?: string | null;
          bankTransfer?: FlutterwaveBankTransferDetails;
        };
        error?: string;
        message?: string;
      } | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.message ?? "CHECKOUT_START_FAILED");
      }

      if (method === "flutterwave") {
        if (payload.data.bankTransfer) {
          setFlutterwaveBankTransfer(payload.data.bankTransfer);
          setFlutterwaveChallenge(null);
          setFundingFeedback({
            kind: "info",
            message: "Transfer the exact amount shown to this temporary Flutterwave account before it expires. enV will credit your wallet only after the bank transfer is verified.",
          });
          return;
        }
        const checkoutUrl = payload.data.authorizationUrl;
        if (checkoutUrl) {
          let checkout: URL | null = null;
          try { checkout = new URL(checkoutUrl); } catch { checkout = null; }
          const host = checkout?.hostname.toLowerCase() ?? "";
          const providerHost = host === "flutterwave.com" || host.endsWith(".flutterwave.com") ||
            host === "flutterwave.cloud" || host.endsWith(".flutterwave.cloud");
          if (!checkout || checkout.protocol !== "https:" || !providerHost) {
            throw new Error("Flutterwave returned an invalid secure authorization link.");
          }
          window.location.assign(checkout.href);
          return;
        }
        if (payload.data.nextAction === "requires_pin" ||
            payload.data.nextAction === "requires_otp" ||
            payload.data.nextAction === "requires_additional_fields") {
          if (!payload.data.reference) throw new Error("Flutterwave did not return the payment reference for bank authorization.");
          const challengeType = payload.data.nextAction === "requires_pin" ? "pin"
            : payload.data.nextAction === "requires_otp" ? "otp" : "avs";
          setFlutterwaveChallenge({ reference: payload.data.reference, type: challengeType });
          setFlutterwaveAuthorizationValue("");
          setFundingFeedback({
            kind: "info",
            message: challengeType === "pin"
              ? "Your bank requires your card PIN to continue. It will be encrypted in your browser."
              : challengeType === "otp"
                ? "Your bank requires a one-time code. Enter the code sent by your bank."
                : "Your bank needs to confirm your billing address. Check the address below, then continue.",
          });
          return;
        }
        if (payload.data.paymentInstruction) {
          setFundingFeedback({ kind: "info", message: payload.data.paymentInstruction });
          setShowFundingOptions(false);
          setReloadKey(value => value + 1);
          return;
        }
        if (payload.data.status === "succeeded") {
          setFundingFeedback({ kind: "success", message: "Flutterwave confirmed the payment. Your wallet has been refreshed." });
          setShowFundingOptions(false);
          setReloadKey(value => value + 1);
          return;
        }
        setFundingFeedback({ kind: "info", message: "Flutterwave is processing this payment. Your wallet will be credited only after the charge is verified." });
        setShowFundingOptions(false);
        setReloadKey(value => value + 1);
        return;
      }

      let checkout: URL | null = null;
      try { if (payload.data.authorizationUrl) checkout = new URL(payload.data.authorizationUrl); } catch { checkout = null; }
      const allowedCheckoutHost = checkout?.protocol === "https:" && (
        method === "more"
          ? checkout.hostname === "pay.cryptomus.com"
          : checkout.hostname === "checkout.paystack.com"
      );
      if (payload.data.paymentMethod !== method || !checkout || !allowedCheckoutHost) {
        throw new Error("CHECKOUT_START_FAILED");
      }
      window.location.assign(checkout.href);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setFundingFeedback({
        kind: "error",
        message: code === "SIGN_IN_REQUIRED" ? "Sign in to continue."
          : code === "INVALID_AMOUNT" ? "Enter a valid amount."
          : code === "CHECKOUT_START_FAILED" ? "Couldn't start payment. Try again."
          : code || "Couldn't start payment. Try again.",
      });
    } finally {
      setFundingBusy(false);
    }
  }

  async function copyFlutterwaveBankAccount() {
    if (!flutterwaveBankTransfer) return;
    try {
      await navigator.clipboard.writeText(flutterwaveBankTransfer.accountNumber);
      setFundingFeedback({ kind: "success", message: "Flutterwave transfer account number copied." });
    } catch {
      setFundingFeedback({ kind: "error", message: "Could not copy the account number. Select the number and copy it manually." });
    }
  }

  async function verifyFlutterwaveBankTransfer() {
    if (!flutterwaveBankTransfer || fundingBusy) return;
    setFundingBusy(true);
    setFundingFeedback(null);
    try {
      const response = await fetch("/api/billing/flutterwave/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ reference: flutterwaveBankTransfer.reference }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean; data?: { status?: string }; message?: string;
      } | null;
      if (!response.ok || !payload?.ok || !payload.data?.status) {
        throw new Error(payload?.message ?? "Flutterwave could not verify the transfer yet.");
      }
      if (payload.data.status === "succeeded") {
        setFundingFeedback({ kind: "success", message: "Bank transfer verified by Flutterwave. Your wallet has been refreshed." });
        setFlutterwaveBankTransfer(null);
        setShowFundingOptions(false);
        setReloadKey(value => value + 1);
      } else {
        setFundingFeedback({ kind: "info", message: "Flutterwave has not confirmed this transfer yet. Keep the exact amount and account reference, then check again." });
      }
    } catch (error) {
      setFundingFeedback({ kind: "info", message: error instanceof Error ? error.message : "Flutterwave could not verify the transfer yet." });
    } finally {
      setFundingBusy(false);
    }
  }

  async function submitFlutterwaveAuthorization() {
    if (!flutterwaveChallenge || fundingBusy) return;
    const value = flutterwaveAuthorizationValue.trim();
    if (flutterwaveChallenge.type !== "avs" && !value) {
      setFundingFeedback({ kind: "error", message: "Enter the requested authorization value." });
      return;
    }
    setFundingBusy(true);
    setFundingFeedback(null);
    try {
      const body: Record<string, unknown> = {
        reference: flutterwaveChallenge.reference,
        authorizationType: flutterwaveChallenge.type,
      };
      if (flutterwaveChallenge.type === "otp") {
        body.otp = value;
      } else if (flutterwaveChallenge.type === "pin") {
        if (!/^\d{4,6}$/.test(value)) throw new Error("Enter the card PIN requested by your bank.");
        const keyResponse = await fetch("/api/billing/flutterwave/encryption-key", {
          credentials: "same-origin", headers: { accept: "application/json" },
        });
        const keyPayload = await keyResponse.json().catch(() => null) as {
          ok?: boolean; data?: { encryptionKey?: string };
        } | null;
        if (!keyResponse.ok || !keyPayload?.ok || !keyPayload.data?.encryptionKey) {
          throw new Error("Flutterwave card encryption is not configured.");
        }
        const nonce = flutterwaveNonce();
        body.encryptedPin = await encryptFlutterwaveField(value, keyPayload.data.encryptionKey, nonce);
        body.nonce = nonce;
      } else {
        body.customerAddress = {
          line1: flutterwaveAddressLine1.trim(),
          line2: flutterwaveAddressLine2.trim(),
          city: flutterwaveCity.trim(),
          state: flutterwaveState.trim(),
          postalCode: flutterwavePostalCode.trim(),
        };
      }
      const response = await fetch("/api/billing/flutterwave/authorize", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        data?: { status?: string; authorizationUrl?: string | null; nextAction?: string | null; paymentInstruction?: string | null };
        message?: string;
      } | null;
      if (!response.ok || !payload?.ok || !payload.data) throw new Error(payload?.message ?? "The bank authorization could not be completed.");
      if (payload.data.authorizationUrl) {
        let target: URL | null = null;
        try { target = new URL(payload.data.authorizationUrl); } catch { target = null; }
        const host = target?.hostname.toLowerCase() ?? "";
        if (!target || target.protocol !== "https:" ||
            !(host === "flutterwave.com" || host.endsWith(".flutterwave.com") || host === "flutterwave.cloud" || host.endsWith(".flutterwave.cloud"))) {
          throw new Error("Flutterwave returned an invalid secure authorization link.");
        }
        window.location.assign(target.href);
        return;
      }
      const nextAction = payload.data.nextAction;
      if (nextAction === "requires_pin" || nextAction === "requires_otp" || nextAction === "requires_additional_fields") {
        setFlutterwaveChallenge({
          reference: flutterwaveChallenge.reference,
          type: nextAction === "requires_pin" ? "pin" : nextAction === "requires_otp" ? "otp" : "avs",
        });
        setFlutterwaveAuthorizationValue("");
        setFundingFeedback({
          kind: "info",
          message: nextAction === "requires_pin"
            ? "Your bank now requires your card PIN."
            : nextAction === "requires_otp"
              ? "Your bank now requires a one-time code."
              : "Your bank needs you to confirm your billing address.",
        });
        return;
      }
      if (payload.data.status?.toLowerCase() === "succeeded") {
        setFundingFeedback({ kind: "success", message: "Flutterwave verified the payment. Your wallet has been refreshed." });
        setFlutterwaveChallenge(null);
        setFlutterwaveAuthorizationValue("");
        setShowFundingOptions(false);
        setReloadKey(value => value + 1);
      } else {
        setFundingFeedback({
          kind: "info",
          message: payload.data.paymentInstruction ?? "The authorization was received. Flutterwave is still processing the charge; your wallet will update after verification.",
        });
      }
    } catch (error) {
      setFundingFeedback({ kind: "error", message: error instanceof Error ? error.message : "The bank authorization could not be completed." });
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
  const customAmountCents = parseUsdAmountToCents(customAmountUsd);
  const customTokenAmount = customAmountCents ?? 0;
  const methodAvailable = (method: WalletFundingChoice) =>
    fundingOptionsState.status === "ready" && fundingOptionsState.methods[method];
  const fundingMethodOptions: Array<{
    id: WalletFundingChoice;
    title: string;
    icon: React.ReactNode;
  }> = [
    { id: "card", title: "Card", icon: <CreditCard size={19} aria-hidden="true" /> },
    { id: "local", title: "Local payment", icon: <Wallet size={19} aria-hidden="true" /> },
    { id: "flutterwave", title: "Flutterwave", icon: <CreditCard size={19} aria-hidden="true" /> },
    { id: "more", title: "Other", icon: <Coins size={19} aria-hidden="true" /> },
  ];
  const availableFundingMethodOptions = fundingMethodOptions.filter((option) => methodAvailable(option.id));

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
                <button type="button" aria-label="Fund wallet" title="Fund wallet" onClick={() => { setFundingFeedback(null); setShowFundingOptions(true); }} disabled={fundingBusy} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#3df1c2] px-3 py-2 text-sm font-semibold text-[#052a2a] no-underline transition hover:bg-[#74f9d7] disabled:cursor-wait disabled:opacity-60 sm:px-4">
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

        {visibleWallet && visibleWallet.recoveryDebtTokens > 0 ? (
          <section className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3" role="status">
            <p className="text-sm font-semibold text-fg">Wallet recovery balance</p>
            <p className="mt-1 text-sm leading-5 text-muted">
              {tokenAmount(visibleWallet.recoveryDebtTokens * 1_000)} enV is being recovered after a verified refund or lost payment dispute. New token usage stays paused until this balance is cleared by future credits.
            </p>
          </section>
        ) : null}

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
              className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-surface p-4 text-fg shadow-2xl sm:rounded-3xl sm:p-5"
            >
              <div className="flex items-center gap-3">
                <h2 id="funding-dialog-title" className="min-w-0 flex-1 text-lg font-semibold">Add funds</h2>
                <button
                  type="button"
                  aria-label="Close payment options"
                  onClick={() => { if (!fundingBusy) setShowFundingOptions(false); }}
                  disabled={fundingBusy}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 disabled:opacity-50"
                >
                  <X size={18} aria-hidden="true"/>
                </button>
              </div>

              <div className="mt-4 space-y-2">
                <label htmlFor="wallet-custom-amount" className="block text-sm font-semibold">Amount (USD reference)</label>
                <div className="flex min-h-12 items-center rounded-xl border border-border bg-surface px-3 focus-within:border-accent">
                  <span className="mr-2 text-base font-semibold text-muted">$</span>
                  <input
                    id="wallet-custom-amount"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="0.01"
                    max="90000000"
                    value={customAmountUsd}
                    onChange={(event) => setCustomAmountUsd(event.target.value)}
                    aria-describedby="wallet-custom-amount-help"
                    className="min-w-0 flex-1 bg-transparent py-3 text-base font-semibold text-fg outline-none"
                    placeholder="Enter amount"
                  />
                </div>
                <div className="space-y-2">
                  <p id="wallet-custom-amount-help" className="text-xs text-muted">
                    Enter any amount from $1, or choose a suggestion below.
                  </p>
                  <div className="flex flex-wrap gap-2" aria-label="Suggested amounts">
                    {[10, 50, 100].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      aria-pressed={customAmountUsd === String(amount)}
                      onClick={() => setCustomAmountUsd(String(amount))}
                      className={"min-h-9 rounded-full border px-4 text-sm font-semibold transition " +
                        (customAmountUsd === String(amount)
                          ? "border-accent bg-accent/10 text-fg"
                          : "border-border bg-surface text-muted hover:bg-surface-2")}
                    >
                      ${amount}
                    </button>
                    ))}
                  </div>
                </div>
                {fundingOptionsState.status === "ready" &&
                  (fundingOptionsState.methods.card || fundingOptionsState.methods.local || fundingOptionsState.methods.more) &&
                  fundingOptionsState.currency ? (
                  <p className="text-xs leading-5 text-muted" aria-live="polite">
                    Checkout currency: <strong className="font-semibold text-fg">{fundingOptionsState.currency}</strong>
                    {fundingOptionsState.countryCode ? " for detected country " + fundingOptionsState.countryCode : ""}.
                    Your USD reference amount is converted using the current exchange-rate quote.
                  </p>
                ) : null}
                <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-3">
                  <span className="text-sm text-muted">You’ll receive</span>
                  <span className="text-base font-semibold tabular-nums text-fg">
                    {customAmountCents === null ? "—" : customTokenAmount.toLocaleString() + " enV"}
                  </span>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <h3 className="text-sm font-semibold">Payment method</h3>
                {fundingOptionsState.status === "loading" ? (
                  <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-3 text-sm text-muted" role="status">
                    <RefreshCw size={15} className="animate-spin" aria-hidden="true"/>
                    Loading…
                  </div>
                ) : fundingOptionsState.status === "unavailable" ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-3">
                    <span className="text-sm text-muted">Payment methods unavailable</span>
                    <button
                      type="button"
                      onClick={() => setFundingOptionsReloadKey(value => value + 1)}
                      className="text-sm font-semibold text-accent"
                    >
                      Try again
                    </button>
                  </div>
                ) : availableFundingMethodOptions.length > 0 ? (
                  <div className="grid gap-2">
                    {availableFundingMethodOptions.map((option) => {
                      const selected = selectedPaymentMethod === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSelectedPaymentMethod(option.id)}
                          className={"flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition " +
                            (selected ? "border-accent bg-accent/5" : "border-border bg-surface hover:bg-surface-2")}
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg">{option.icon}</span>
                          <span className="min-w-0 flex-1 text-sm font-medium">{option.title}</span>
                          <span className={"grid size-5 shrink-0 place-items-center rounded-full border " +
                            (selected ? "border-accent" : "border-border")}>
                            {selected ? <span className="size-2.5 rounded-full bg-accent"/> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl border border-border px-3 py-3 text-sm text-muted" role="status">
                    {fundingOptionsState.message ?? "No approved payment methods are available for your detected country and currency."}
                  </p>
                )}
              </div>

              {selectedPaymentMethod === "flutterwave" ? (
                <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface-2 p-3">
                  <div>
                    <label htmlFor="flutterwave-method" className="mb-1 block text-xs font-semibold">Flutterwave payment method</label>
                    <select
                      id="flutterwave-method"
                      value={flutterwaveMethod}
                      onChange={(event) => setFlutterwaveMethod(event.target.value as FlutterwaveMethod)}
                      className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg"
                    >
                      {(fundingOptionsState.flutterwave?.paymentMethods ?? ["card"]).map((method) => (
                        <option key={method} value={method}>
                          {method === "card" ? "Card" : method === "mobile_money" ? "Mobile Money" : "Bank Transfer"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label htmlFor="flutterwave-customer-name" className="mb-1 block text-xs font-semibold">Full name</label>
                      <input id="flutterwave-customer-name" autoComplete="name" value={flutterwaveCustomerName}
                        onChange={(event) => setFlutterwaveCustomerName(event.target.value)}
                        placeholder="First and last name"
                        className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" />
                    </div>
                    <div>
                      <label htmlFor="flutterwave-phone" className="mb-1 block text-xs font-semibold">Phone number</label>
                      <input id="flutterwave-phone" type="tel" inputMode="numeric" autoComplete="tel-national"
                        value={flutterwavePhoneNumber} onChange={(event) => setFlutterwavePhoneNumber(event.target.value)}
                        placeholder="7–10 digits, including no country code"
                        className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold">Billing address</p>
                    <input value={flutterwaveAddressLine1} onChange={(event) => setFlutterwaveAddressLine1(event.target.value)}
                      autoComplete="address-line1" placeholder="Street address"
                      className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" />
                    <input value={flutterwaveAddressLine2} onChange={(event) => setFlutterwaveAddressLine2(event.target.value)}
                      autoComplete="address-line2" placeholder="Apartment, suite, unit (optional)"
                      className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={flutterwaveCity} onChange={(event) => setFlutterwaveCity(event.target.value)}
                        autoComplete="address-level2" placeholder="City"
                        className="min-h-11 min-w-0 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" />
                      <input value={flutterwaveState} onChange={(event) => setFlutterwaveState(event.target.value)}
                        autoComplete="address-level1" placeholder="State / region"
                        className="min-h-11 min-w-0 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" />
                    </div>
                    <input value={flutterwavePostalCode} onChange={(event) => setFlutterwavePostalCode(event.target.value)}
                      autoComplete="postal-code" placeholder="Postal code"
                      className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" />
                    <p className="text-[11px] leading-4 text-muted">
                      Country is matched to your detected checkout country.
                    </p>
                  </div>

                  {flutterwaveMethod === "card" ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold">Card details</p>
                      <input id="flutterwave-card-number" type="text" inputMode="numeric" autoComplete="cc-number"
                        value={flutterwaveCardNumber} onChange={(event) => setFlutterwaveCardNumber(event.target.value)}
                        placeholder="Card number"
                        className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" />
                      <div className="grid grid-cols-3 gap-2">
                        <input aria-label="Card expiry month" inputMode="numeric" autoComplete="cc-exp-month"
                          value={flutterwaveExpiryMonth} onChange={(event) => setFlutterwaveExpiryMonth(event.target.value)}
                          placeholder="MM" maxLength={2}
                          className="min-h-11 min-w-0 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" />
                        <input aria-label="Card expiry year" inputMode="numeric" autoComplete="cc-exp-year"
                          value={flutterwaveExpiryYear} onChange={(event) => setFlutterwaveExpiryYear(event.target.value)}
                          placeholder="YY / YYYY" maxLength={4}
                          className="min-h-11 min-w-0 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" />
                        <input aria-label="Card security code" type="password" inputMode="numeric" autoComplete="cc-csc"
                          value={flutterwaveCvv} onChange={(event) => setFlutterwaveCvv(event.target.value)}
                          placeholder="CVV" maxLength={4}
                          className="min-h-11 min-w-0 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" />
                      </div>
                      <p className="text-[11px] leading-4 text-muted">
                        Card fields are encrypted in your browser before the charge request is sent to enV.
                      </p>
                    </div>
                  ) : null}

                  {flutterwaveMethod === "mobile_money" ? (
                    <div>
                      <label htmlFor="flutterwave-network" className="mb-1 block text-xs font-semibold">Mobile-money network</label>
                      <select id="flutterwave-network" value={flutterwaveNetwork}
                        onChange={(event) => setFlutterwaveNetwork(event.target.value)}
                        className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg">
                        <option value="">Choose a network</option>
                        {(fundingOptionsState.flutterwave?.mobileNetworks ?? []).map((entry) => (
                          <option key={entry.network} value={entry.network}>{entry.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                </div>
              ) : null}

              {flutterwaveBankTransfer ? (
                <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface-2 p-3" aria-live="polite">
                  <div>
                    <h3 className="text-sm font-semibold">Flutterwave bank transfer</h3>
                    <p className="mt-1 text-xs leading-5 text-muted">Send the exact amount below to this temporary account before the expiry time.</p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <p className="text-xs text-muted">Transfer amount</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums">
                      {new Intl.NumberFormat(undefined, {
                        style: "currency", currency: flutterwaveBankTransfer.currency,
                        minimumFractionDigits: 2, maximumFractionDigits: 2,
                      }).format(flutterwaveBankTransfer.amount)}
                    </p>
                    <p className="mt-3 text-xs text-muted">Bank</p>
                    <p className="mt-0.5 text-sm font-semibold">{flutterwaveBankTransfer.bankName}</p>
                    <p className="mt-3 text-xs text-muted">Account number</p>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="text-lg font-semibold tracking-wider tabular-nums">{flutterwaveBankTransfer.accountNumber}</p>
                      <button type="button" onClick={() => void copyFlutterwaveBankAccount()}
                        className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-surface-2">
                        <Copy size={13} aria-hidden="true"/> Copy
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-muted">Payment reference</p>
                    <p className="mt-0.5 break-all text-xs font-medium">{flutterwaveBankTransfer.reference}</p>
                    <p className="mt-3 text-xs text-muted">Account expires</p>
                    <p className="mt-0.5 text-sm font-medium">{new Date(flutterwaveBankTransfer.expiresAt).toLocaleString()}</p>
                    {flutterwaveBankTransfer.note ? <p className="mt-3 text-xs leading-5 text-muted">{flutterwaveBankTransfer.note}</p> : null}
                  </div>
                  <button type="button" onClick={() => void verifyFlutterwaveBankTransfer()} disabled={fundingBusy}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#3df1c2] px-4 text-sm font-semibold text-[#052a2a] disabled:opacity-50">
                    {fundingBusy ? "Checking…" : "I've made the transfer"}
                  </button>
                  <p className="text-[11px] leading-4 text-muted">
                    enV adds tokens only after Flutterwave confirms the matching transfer. Do not send a different amount.
                  </p>
                </div>
              ) : null}

              {flutterwaveChallenge ? (
                <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface-2 p-3" aria-live="polite">
                  <div>
                    <h3 className="text-sm font-semibold">Bank authorization</h3>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {flutterwaveChallenge.type === "pin"
                        ? "Enter the card PIN requested by your bank. It is encrypted in your browser before submission."
                        : flutterwaveChallenge.type === "otp"
                          ? "Enter the one-time code sent by your bank."
                          : "Confirm the billing address you entered so your bank can complete address verification."}
                    </p>
                  </div>
                  {flutterwaveChallenge.type !== "avs" ? (
                    <div>
                      <label htmlFor="flutterwave-authorization-value" className="mb-1 block text-xs font-semibold">
                        {flutterwaveChallenge.type === "pin" ? "Card PIN" : "One-time code"}
                      </label>
                      <input
                        id="flutterwave-authorization-value"
                        type="password"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={flutterwaveAuthorizationValue}
                        onChange={(event) => setFlutterwaveAuthorizationValue(event.target.value)}
                        maxLength={flutterwaveChallenge.type === "pin" ? 6 : 8}
                        placeholder={flutterwaveChallenge.type === "pin" ? "Enter PIN" : "Enter code"}
                        className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg"
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void submitFlutterwaveAuthorization()}
                    disabled={fundingBusy || (flutterwaveChallenge.type !== "avs" && !flutterwaveAuthorizationValue.trim())}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#3df1c2] px-4 text-sm font-semibold text-[#052a2a] disabled:opacity-50"
                  >
                    {fundingBusy ? "Verifying…" : flutterwaveChallenge.type === "avs" ? "Confirm billing address" : "Continue"}
                  </button>
                </div>
              ) : null}

              {fundingFeedback?.kind === "error" ? (
                <p className="mt-3 text-sm text-rose-600" role="status" aria-live="polite">{fundingFeedback.message}</p>
              ) : null}

              <button
                type="button"
                onClick={() => void startFundingCheckout(selectedPaymentMethod)}
                disabled={fundingBusy || fundingOptionsState.status !== "ready" ||
                  !methodAvailable(selectedPaymentMethod) || customAmountCents === null}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#3df1c2] px-4 py-3 text-sm font-semibold text-[#052a2a] transition hover:bg-[#74f9d7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {fundingBusy ? "Opening…" : "Continue"}
                {!fundingBusy ? <ArrowUpRight size={15} aria-hidden="true"/> : null}
              </button>
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

        {fundingFeedback && !(showFundingOptions && fundingFeedback.kind === "error") ? <p className={`rounded-xl border p-3 text-sm leading-5 ${fundingFeedback.kind === "success" ? "border-emerald-500/30 bg-emerald-500/5 text-fg" : fundingFeedback.kind === "error" ? "border-rose-500/30 bg-rose-500/5 text-fg" : "border-border bg-surface-2 text-muted"}`} role="status" aria-live="polite">{fundingFeedback.message}</p> : null}

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
