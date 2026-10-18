/**
 * Shared, client-safe enV metering catalog.
 *
 * The user-facing unit is an enV Token; integer milli-tokens are stored internally (1,000 = 1 displayed token).
 * One displayed token has a proposed reference value of USD $0.01. Therefore, one
 * milli-token represents $0.00001 at the USD reference rate. Rates in this initial
 * catalog are hypotheses, not live prices; production charging stays gated until the
 * tool-by-tool cost audit, provider products and billing enforcement are configured.
 */
export const TOKEN_SUBUNITS_PER_TOKEN = 1_000;
export const USD_MICROS_PER_TOKEN = 10_000;
export const USD_MICROS_PER_SUBUNIT = USD_MICROS_PER_TOKEN / TOKEN_SUBUNITS_PER_TOKEN;
export const DEFAULT_GROSS_MARGIN_BPS = 6_000;
export const PRICING_VERSION = "env-metering-preview-2026-10-18-v1";

export type BillingClass = "local" | "cloud" | "ai" | "agent";
export type QuoteStatus = "quoted" | "requires-cost-measurement" | "premium-required";

export interface MeteredOperationRule {
  id: string;
  name: string;
  class: BillingClass;
  pricingMode: "per-unit-hypothesis" | "measured-provider-cost";
  unitLabel: string;
  subunitsPerUnit?: number;
  baseSubunits?: number;
  premiumRequired?: boolean;
  notes: string;
}

export const METERED_OPERATION_RULES: readonly MeteredOperationRule[] = [
  {
    id: "local.calculator",
    name: "Basic calculator",
    class: "local",
    pricingMode: "per-unit-hypothesis",
    unitLabel: "calculation",
    subunitsPerUnit: 100,
    notes: "Draft target: 10 simple calculations per token; zero server-cost does not mean zero business value.",
  },
  {
    id: "local.text",
    name: "Basic text utility",
    class: "local",
    pricingMode: "per-unit-hypothesis",
    unitLabel: "operation",
    subunitsPerUnit: 100,
    notes: "Initial hypothesis for small local text transformations.",
  },
  {
    id: "local.converter",
    name: "Basic unit or format conversion",
    class: "local",
    pricingMode: "per-unit-hypothesis",
    unitLabel: "conversion",
    subunitsPerUnit: 100,
    notes: "Initial hypothesis for lightweight local conversions.",
  },
  {
    id: "local.image_basic",
    name: "Basic local image operation",
    class: "local",
    pricingMode: "per-unit-hypothesis",
    unitLabel: "operation",
    subunitsPerUnit: 250,
    notes: "Initial hypothesis; actual memory, pixel count and batch size must be audited by tool.",
  },
  {
    id: "local.general",
    name: "General local utility",
    class: "local",
    pricingMode: "per-unit-hypothesis",
    unitLabel: "operation",
    subunitsPerUnit: 200,
    notes: "Conservative fallback hypothesis for local tools without a more specific profile; review manually before launch.",
  },
  {
    id: "local.audio_processing",
    name: "Local audio processing",
    class: "local",
    pricingMode: "per-unit-hypothesis",
    unitLabel: "operation",
    subunitsPerUnit: 500,
    notes: "Initial intensity class, not a device-compute measurement; price by duration/channels/sample rate when known.",
  },
  {
    id: "local.video_processing",
    name: "Local video processing",
    class: "local",
    pricingMode: "per-unit-hypothesis",
    unitLabel: "operation",
    subunitsPerUnit: 1_000,
    notes: "Initial intensity class; price by duration/resolution/frame count when known.",
  },
  {
    id: "local.image_intensive",
    name: "Local intensive image processing",
    class: "local",
    pricingMode: "per-unit-hypothesis",
    unitLabel: "operation",
    subunitsPerUnit: 500,
    notes: "Initial intensity class; price by pixel count, batch size and algorithm when known.",
  },
  {
    id: "local.media_processing",
    name: "Local media processing",
    class: "local",
    pricingMode: "per-unit-hypothesis",
    unitLabel: "operation",
    subunitsPerUnit: 500,
    notes: "Provisional intensity-based hypothesis for locally executed media operations; measure actual device workload and user value before launch.",
  },
  {
    id: "cloud.generic_processing",
    name: "Other cloud processing",
    class: "cloud",
    pricingMode: "measured-provider-cost",
    unitLabel: "operation",
    notes: "Use provider/infrastructure cost and a versioned margin rule; do not use a static generic fee.",
  },
  {
    id: "cloud.audio_processing",
    name: "Cloud audio processing",
    class: "cloud",
    pricingMode: "measured-provider-cost",
    unitLabel: "audio processing job",
    notes: "Use measured duration, codec, bitrate, channels and processor cost.",
  },
  {
    id: "cloud.image_processing",
    name: "Cloud image processing",
    class: "cloud",
    pricingMode: "measured-provider-cost",
    unitLabel: "image processing job",
    notes: "Use image dimensions, batch size, model/provider charges and compute time.",
  },
  {
    id: "cloud.document_processing",
    name: "Cloud document processing",
    class: "cloud",
    pricingMode: "measured-provider-cost",
    unitLabel: "operation",
    notes: "Quote from the actual processor, file/page measurements and target margin before enabling charges.",
  },
  {
    id: "cloud.transcription",
    name: "Audio transcription",
    class: "cloud",
    pricingMode: "measured-provider-cost",
    unitLabel: "audio minute",
    notes: "Use provider cost and measured audio duration; do not apply a generic rate to every provider.",
  },
  {
    id: "cloud.video_processing",
    name: "Cloud video processing",
    class: "cloud",
    pricingMode: "measured-provider-cost",
    unitLabel: "processing job",
    notes: "Use actual processing time, resolution, codec and provider charges.",
  },
  {
    id: "ai.standard",
    name: "Standard AI operation",
    class: "ai",
    pricingMode: "measured-provider-cost",
    unitLabel: "request",
    notes: "Meter provider-reported or defensibly estimated input/output usage and include retries/fallbacks.",
  },
  {
    id: "ai.frontier",
    name: "Frontier-model operation",
    class: "ai",
    pricingMode: "measured-provider-cost",
    unitLabel: "request",
    premiumRequired: true,
    notes: "Requires a premium entitlement and a provider-cost estimate; the resulting work still consumes tokens.",
  },
  {
    id: "agent.workflow",
    name: "AI-agent workflow",
    class: "agent",
    pricingMode: "measured-provider-cost",
    unitLabel: "workflow",
    notes: "Estimate and reserve a budget, then meter every underlying model call and tool invocation.",
  },
  {
    id: "agent.frontier_workflow",
    name: "Large frontier-model workflow",
    class: "agent",
    pricingMode: "measured-provider-cost",
    unitLabel: "workflow",
    premiumRequired: true,
    notes: "Premium capability plus a user-approved spending cap; tokens cover measured execution cost.",
  },
] as const;

export interface OperationQuote {
  operationId: string;
  operationName: string;
  status: QuoteStatus;
  units: number;
  unitLabel: string;
  estimatedSubunits: number | null;
  estimatedTokens: number | null;
  estimatedUsdMicros: number | null;
  premiumRequired: boolean;
  pricingVersion: string;
  note: string;
}

const ruleMap = new Map(METERED_OPERATION_RULES.map((rule) => [rule.id, rule]));

export function getOperationRule(operationId: string): MeteredOperationRule | undefined {
  return ruleMap.get(operationId);
}

export function formatTokens(subunits: number): string {
  if (!Number.isSafeInteger(subunits) || subunits < 0) throw new RangeError("Token subunits must be a non-negative safe integer.");
  const tokens = subunits / TOKEN_SUBUNITS_PER_TOKEN;
  return tokens.toLocaleString("en-US", { maximumFractionDigits: 3, minimumFractionDigits: 0 });
}

export function referenceUsdMicrosForSubunits(subunits: number): number {
  if (!Number.isSafeInteger(subunits) || subunits < 0) throw new RangeError("Token subunits must be a non-negative safe integer.");
  const result = subunits * USD_MICROS_PER_SUBUNIT;
  if (!Number.isSafeInteger(result)) throw new RangeError("Token amount is too large.");
  return result;
}

/** Convert measured/estimated provider cost into tokens using the target gross margin. */
export function providerCostToSubunits(costUsdMicros: number, grossMarginBps = DEFAULT_GROSS_MARGIN_BPS): number {
  if (!Number.isSafeInteger(costUsdMicros) || costUsdMicros < 0) throw new RangeError("Provider cost must be a non-negative integer number of USD micros.");
  if (!Number.isInteger(grossMarginBps) || grossMarginBps < 0 || grossMarginBps >= 10_000) {
    throw new RangeError("Gross margin must be an integer from 0 to 9,999 basis points.");
  }
  const denominator = BigInt(10_000 - grossMarginBps);
  const numerator = BigInt(costUsdMicros) * 10_000n;
  const netRevenueUsdMicros = (numerator + denominator - 1n) / denominator;
  const subunits = (netRevenueUsdMicros + BigInt(USD_MICROS_PER_SUBUNIT) - 1n) / BigInt(USD_MICROS_PER_SUBUNIT);
  if (subunits > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Calculated token charge is too large.");
  return Number(subunits);
}

export function quoteOperation(
  operationId: string,
  units = 1,
  options: { hasPremium?: boolean; measuredProviderCostUsdMicros?: number; grossMarginBps?: number } = {},
): OperationQuote {
  const rule = getOperationRule(operationId);
  if (!rule) throw new RangeError("Unknown billing operation.");
  if (!Number.isFinite(units) || !Number.isInteger(units) || units < 1 || units > 1_000_000) {
    throw new RangeError("Units must be an integer between 1 and 1,000,000.");
  }

  if (rule.premiumRequired && options.hasPremium !== true) {
    return {
      operationId, operationName: rule.name, status: "premium-required", units, unitLabel: rule.unitLabel,
      estimatedSubunits: null, estimatedTokens: null, estimatedUsdMicros: null,
      premiumRequired: true, pricingVersion: PRICING_VERSION,
      note: "Premium access is required for this capability. Billable execution remains usage-metered.",
    };
  }

  if (rule.pricingMode === "per-unit-hypothesis") {
    const estimatedSubunits = (rule.baseSubunits ?? 0) + (rule.subunitsPerUnit ?? 0) * units;
    return {
      operationId, operationName: rule.name, status: "quoted", units, unitLabel: rule.unitLabel,
      estimatedSubunits, estimatedTokens: estimatedSubunits / TOKEN_SUBUNITS_PER_TOKEN,
      estimatedUsdMicros: referenceUsdMicrosForSubunits(estimatedSubunits), premiumRequired: false,
      pricingVersion: PRICING_VERSION, note: "Illustrative initial rate only; not an active charge until tool costs and production pricing are approved.",
    };
  }

  if (options.measuredProviderCostUsdMicros === undefined) {
    return {
      operationId, operationName: rule.name, status: "requires-cost-measurement", units, unitLabel: rule.unitLabel,
      estimatedSubunits: null, estimatedTokens: null, estimatedUsdMicros: null,
      premiumRequired: Boolean(rule.premiumRequired), pricingVersion: PRICING_VERSION,
      note: "A credible provider-cost estimate is required before quoting or reserving a charge.",
    };
  }

  const estimatedSubunits = providerCostToSubunits(options.measuredProviderCostUsdMicros, options.grossMarginBps ?? DEFAULT_GROSS_MARGIN_BPS);
  return {
    operationId, operationName: rule.name, status: "quoted", units, unitLabel: rule.unitLabel,
    estimatedSubunits, estimatedTokens: estimatedSubunits / TOKEN_SUBUNITS_PER_TOKEN,
    estimatedUsdMicros: referenceUsdMicrosForSubunits(estimatedSubunits), premiumRequired: Boolean(rule.premiumRequired),
    pricingVersion: PRICING_VERSION, note: "Estimated from provider cost and target gross margin; actual settlement must use measured execution data.",
  };
}

export function publicBillingCatalog() {
  return {
    pricingVersion: PRICING_VERSION,
    token: {
      label: "enV Token",
      subunitsPerToken: TOKEN_SUBUNITS_PER_TOKEN,
      referenceValueUsdCents: 1,
      referenceValue: "100 tokens ≈ USD $1.00",
      purchasedTokensExpire: false,
      notModelTokens: true,
    },
    monetization: {
      advertising: false,
      usageBasedTokens: true,
      premiumEntitlements: true,
      realPaymentsEnabled: false,
      rateStatus: "preview",
    },
    operations: METERED_OPERATION_RULES.map((rule) => ({ ...rule })),
    purchaseAvailability: {
      status: "not-configured",
      note: "No payment will be taken until the relevant web or native store provider is connected and verified.",
      supportedRails: [],
    },
  } as const;
}
