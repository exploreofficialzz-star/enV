/** Local-only helpers shared by the web Business Studio and its golden tests. */
export type BusinessNameStyle = "descriptive" | "compound" | "prefix-suffix" | "short-brandable";

const ADJECTIVES = ["Bright", "Atlas", "Clear", "True", "Ember", "Swift", "Green", "Blue", "Noble", "Open", "Bold", "Keen", "Lumen", "Kind", "Prime", "Ever", "Urban", "Golden", "Silver", "Calm", "Rapid", "Mosaic", "Able", "Fresh"];
const NOUNS = ["Works", "Forge", "Harbor", "Grove", "Arc", "Peak", "Grid", "Foundry", "Craft", "Field", "Beacon", "Nest", "Rise", "Trail", "Root", "Pulse", "Bridge", "Labs", "Link", "Stack", "Orbit", "Bloom", "Horizon", "Canvas", "Engine", "Collective", "Market", "Studio", "Path", "Current"];
const PREFIXES = ["get", "try", "use", "neo", "ever", "open", "hyper", "meta", "omni", "terra", "luma", "nexa", "aero", "kin", "nova", "heli", "unify", "bright", "true", "blue", "clear", "prime", "urban", "north"];
const ENDINGS = ["ly", "io", "ora", "ify", "wise", "works", "flow", "base", "hive", "verse", "nest", "path", "grid", "beam", "loop", "forge", "craft", "spark", "pulse", "pilot", "shift", "scope", "well", "field"];
const SLOGAN_FRAMES = [
  "Make {seed} work for {audience}.", "A clearer way to {seed}.", "Built around real {seed} needs.", "Less friction. More {seed}.", "Helping {audience} move {seed} forward.",
  "Your next step in {seed}.", "Thoughtful tools for {seed}.", "From idea to {seed}.", "A better rhythm for {seed}.", "Turn {seed} into progress.",
  "Designed for the people behind {seed}.", "Make room for better {seed}.", "Simple by design. Ready for {seed}.", "Where {seed} meets momentum.", "Small steps. Stronger {seed}.",
  "Practical progress for {audience}.", "Move beyond ordinary {seed}.", "Build confidence into {seed}.", "More signal, less noise in {seed}.", "Bring your best to {seed}.",
  "Good work starts with {seed}.", "Your goals, closer through {seed}.", "An easier path to {seed}.", "Make every {seed} step count.",
  "A more thoughtful way to handle {seed}.", "Keep {seed} moving in the right direction.", "Built to make {seed} feel simpler.", "Bring clarity to {seed}.",
  "Small improvements. Meaningful {seed}.", "Put better {seed} within reach.", "For people who care about {seed}.", "A strong foundation for {seed}.",
  "Make your next {seed} decision clearer.", "Practical ideas for everyday {seed}.", "Move from busywork to {seed}.", "Give good {seed} room to grow.",
  "Designed to support your {seed} goals.", "Make useful progress on {seed}.", "More confidence in every {seed} step.", "A simpler path for {audience}.",
  "Make the hard parts of {seed} easier.", "Your work, moving forward.", "Create space for better {seed}.", "Better tools for real-world {seed}.",
  "Clear thinking. Useful {seed}.", "Let better {seed} begin here.", "The practical side of progress.", "Helping good work go further.",
];

const cleanSeed = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const title = (value: string) => value.split(/\s+/).filter(Boolean).map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" ");
const blend = (left: string, right: string) => {
  const a = left.toLowerCase().replace(/[^a-z]/g, "");
  const b = right.toLowerCase().replace(/[^a-z]/g, "");
  if (!a) return b;
  if (!b) return a;
  const maxOverlap = Math.min(3, a.length - 2, b.length - 2);
  for (let n = maxOverlap; n >= 1; n -= 1) if (a.slice(-n) === b.slice(0, n)) return a + b.slice(n);
  return a.slice(0, Math.max(2, Math.ceil(a.length * 0.62))) + b.slice(Math.max(1, Math.floor(b.length * 0.38)));
};

export function generateBusinessNames(options: {
  seed: string; style?: BusinessNameStyle; maxLength?: number; blacklist?: string; offset?: number; count?: number;
}): string[] {
  const seedText = cleanSeed(options.seed) || "business";
  const tokens = seedText.split(" ").filter(Boolean).slice(0, 5);
  const seedTitle = title(seedText);
  const style = options.style ?? "descriptive";
  const maxLength = Math.min(60, Math.max(8, Math.floor(options.maxLength ?? 32)));
  const count = Math.min(48, Math.max(24, Math.floor(options.count ?? 32)));
  const blacklist = (options.blacklist ?? "").toLowerCase().split(/[\s,;|]+/).map((word) => word.trim()).filter(Boolean);
  const candidates: string[] = [];
  const add = (value: string) => { const trimmed = value.replace(/\s+/g, " ").trim(); if (trimmed) candidates.push(trimmed); };
  if (style === "descriptive") {
    // Lead with the full seed so multi-word topics survive the first page of results.
    for (let index = 0; index < Math.max(NOUNS.length, ADJECTIVES.length); index += 1) {
      if (NOUNS[index]) add(`${seedTitle} ${NOUNS[index]}`);
      if (ADJECTIVES[index]) add(`${ADJECTIVES[index]} ${seedTitle}`);
    }
    for (const token of tokens) {
      for (const noun of NOUNS) add(`${title(token)} ${noun}`);
      for (const adjective of ADJECTIVES) add(`${adjective} ${title(token)}`);
    }
    for (const adjective of ADJECTIVES) for (const noun of NOUNS) add(`${adjective} ${noun}`);
  } else if (style === "compound") {
    for (const token of tokens) {
      for (const noun of NOUNS) add(`${title(token)}${title(noun)}`);
      for (const adjective of ADJECTIVES) add(`${title(adjective)}${title(token)}`);
    }
    for (let i = 0; i < tokens.length - 1; i += 1) add(title(blend(tokens[i], tokens[i + 1])));
    for (const adjective of ADJECTIVES) for (const noun of NOUNS) add(title(blend(adjective, noun)));
  } else if (style === "prefix-suffix") {
    for (const token of tokens) {
      for (const prefix of PREFIXES) add(`${title(prefix)} ${title(token)}`);
      for (const ending of ENDINGS) add(`${title(token)} ${title(ending)}`);
      for (const ending of ENDINGS) add(`${token}${ending}`);
    }
    for (const prefix of PREFIXES) for (const ending of ENDINGS) add(`${title(prefix)}${title(ending)}`);
  } else {
    for (const token of tokens) {
      for (const ending of ENDINGS) add(`${token}${ending}`);
      for (const prefix of PREFIXES) add(`${prefix}${token}`);
      for (const noun of NOUNS) add(blend(token, noun));
    }
    for (const left of ADJECTIVES) for (const right of NOUNS) add(blend(left, right));
  }
  const normalizedBlacklist = blacklist.map((word) => cleanSeed(word)).filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.toLocaleLowerCase();
    if (seen.has(key) || candidate.length > maxLength || candidate.length < 2) continue;
    if (normalizedBlacklist.some((word) => key.includes(word))) continue;
    seen.add(key);
    unique.push(candidate);
  }
  if (!unique.length) return [];
  const offset = (Math.abs(Math.floor(options.offset ?? 0)) * count) % unique.length;
  const rotated = unique.slice(offset).concat(unique.slice(0, offset));
  return rotated.slice(0, count);
}

export function generateSlogans(seed: string, audience: string, offset = 0, count = 24): string[] {
  const safeSeed = cleanSeed(seed) || "your work";
  const safeAudience = cleanSeed(audience) || "customers";
  const candidates = SLOGAN_FRAMES.map((frame) => frame.replaceAll("{seed}", safeSeed).replaceAll("{audience}", safeAudience));
  const pageSize = Math.min(candidates.length, Math.max(1, Math.floor(count)));
  const start = (Math.abs(Math.floor(offset)) * pageSize) % candidates.length;
  return candidates.slice(start).concat(candidates.slice(0, start)).slice(0, pageSize);
}

export function generateSkus(seed: string, offset = 0, count = 24): string[] {
  const prefix = (cleanSeed(seed).replace(/[^a-z0-9]/g, "").slice(0, 6) || "sku").toUpperCase().padEnd(3, "X");
  const start = Math.max(0, Math.floor(offset));
  return Array.from({ length: Math.min(48, Math.max(1, Math.floor(count))) }, (_, index) => `${prefix}-${String(start + index + 1).padStart(3, "0")}`);
}


/** LTV:CAC benchmark bands used by the UI. These are directional heuristics, not universal guarantees. */
export type LtvCacBand = "below-1" | "1-to-3" | "3-to-5" | "above-5";
export function classifyLtvCac(ratio: number): LtvCacBand {
  if (!Number.isFinite(ratio) || ratio < 1) return "below-1";
  if (ratio < 3) return "1-to-3";
  if (ratio <= 5) return "3-to-5";
  return "above-5";
}

export type LtvModelResult = { ltv: number; monthlyContribution: number; method: string; warning: string };
export function calculateLifetimeValue(input: {
  model?: "simple" | "saas"; averageOrderValue?: number; purchasesPerPeriod?: number; lifespanPeriods?: number;
  arpu?: number; grossMarginPct?: number; monthlyChurnPct?: number; monthlyContribution?: number;
}): LtvModelResult {
  const finite = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, value as number) : 0;
  const model = input.model ?? "simple";
  if (model === "saas") {
    const arpu = finite(input.arpu);
    const margin = Math.min(100, finite(input.grossMarginPct)) / 100;
    const churn = Math.min(100, finite(input.monthlyChurnPct)) / 100;
    const grossProfitContribution = arpu * margin;
    const paybackContribution = input.monthlyContribution != null && finite(input.monthlyContribution) > 0 ? finite(input.monthlyContribution) : grossProfitContribution;
    if (churn <= 0) return { ltv: 0, monthlyContribution: paybackContribution, method: "Gross-profit LTV = monthly ARPU × gross margin ÷ monthly logo churn rate", warning: "Monthly churn must be greater than 0% to estimate finite SaaS lifetime value." };
    return { ltv: grossProfitContribution / churn, monthlyContribution: paybackContribution, method: "Gross-profit SaaS LTV = monthly ARPU × gross margin % ÷ monthly customer churn % (expressed as decimals)", warning: "Simplified steady-state estimate; churn, margin and ARPU are assumed constant. Excludes discounting, expansion, contraction and cohort effects." };
  }
  const aov = finite(input.averageOrderValue);
  const frequency = finite(input.purchasesPerPeriod);
  const lifespan = finite(input.lifespanPeriods);
  return { ltv: aov * frequency * lifespan, monthlyContribution: finite(input.monthlyContribution), method: "Revenue-based LTV = average order value × purchases per period × lifespan", warning: "Revenue-based, not gross-profit-adjusted; align period units and do not treat this estimate as forecast certainty." };
}

/** Calculation helpers used directly by the Business Studio UI and golden fixtures. */
const finiteNonNegative = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const clampPercent = (value: number) => Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

export type DocumentLineInput = { quantity: number; unitPrice: number };
export function calculateDocumentTotals(lineItems: DocumentLineInput[], taxRateInput: number, discountRateInput: number) {
  const safeNumber = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
  const normalizedItems = lineItems.map((item) => ({ quantity: safeNumber(item.quantity), unitPrice: safeNumber(item.unitPrice) }));
  const subtotal = normalizedItems.reduce((sum, item) => {
    const line = item.quantity * item.unitPrice;
    const next = sum + (Number.isFinite(line) ? line : 0);
    return Number.isFinite(next) ? next : Number.MAX_SAFE_INTEGER;
  }, 0);
  const discountRatePct = clampPercent(discountRateInput);
  const taxRatePct = safeNumber(taxRateInput);
  const discount = subtotal * discountRatePct / 100;
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * taxRatePct / 100;
  const total = taxable + tax;
  return { items: normalizedItems, subtotal, discountRatePct, discount, taxable, taxRatePct, tax, total: Number.isFinite(total) ? total : Number.MAX_SAFE_INTEGER };
}

export function calculateCommission(salesInput: number, rateInput: number) {
  const sales = finiteNonNegative(salesInput);
  const ratePct = clampPercent(rateInput);
  const commission = sales * ratePct / 100;
  return { sales, ratePct, commission, afterCommission: sales - commission };
}

export function calculateBreakEven(input: { fixedCosts: number; pricePerUnit: number; variableCostPerUnit: number; targetProfit?: number }) {
  const fixedCosts = finiteNonNegative(input.fixedCosts);
  const pricePerUnit = finiteNonNegative(input.pricePerUnit);
  const variableCostPerUnit = finiteNonNegative(input.variableCostPerUnit);
  const targetProfit = finiteNonNegative(input.targetProfit ?? 0);
  const possible = pricePerUnit > variableCostPerUnit && pricePerUnit > 0;
  const contribution = possible ? pricePerUnit - variableCostPerUnit : 0;
  const breakEvenUnits = possible ? Math.ceil(fixedCosts / contribution) : null;
  const targetUnits = possible ? Math.ceil((fixedCosts + targetProfit) / contribution) : null;
  return { possible, fixedCosts, pricePerUnit, variableCostPerUnit, targetProfit, contribution, breakEvenUnits, breakEvenRevenue: breakEvenUnits == null ? null : breakEvenUnits * pricePerUnit, contributionMarginPct: possible ? contribution / pricePerUnit * 100 : null, targetUnits };
}

export function calculateCashFlow(openingCashInput: number, inflowsInput: number, outflowsInput: number) {
  const openingCash = Number.isFinite(openingCashInput) ? openingCashInput : 0;
  const inflows = finiteNonNegative(inflowsInput);
  const outflows = finiteNonNegative(outflowsInput);
  const netCashFlow = inflows - outflows;
  return { openingCash, inflows, outflows, netCashFlow, endingCash: openingCash + netCashFlow };
}

export function calculateDiscount(originalInput: number, rateInput: number) {
  const original = finiteNonNegative(originalInput);
  const ratePct = clampPercent(rateInput);
  const discount = original * ratePct / 100;
  return { original, ratePct, discount, finalPrice: original - discount };
}

export function calculatePricing(costInput: number, markupInput: number) {
  const cost = finiteNonNegative(costInput);
  const markupPct = Number.isFinite(markupInput) ? Math.max(0, markupInput) : 0;
  const profit = cost * markupPct / 100;
  return { cost, markupPct, profit, sellingPrice: cost + profit };
}

export function calculateRoi(valueReceivedInput: number, investmentInput: number) {
  const valueReceived = finiteNonNegative(valueReceivedInput);
  const investment = finiteNonNegative(investmentInput);
  const valid = investment > 0;
  return { valueReceived, investment, valid, netReturn: valueReceived - investment, roiPct: valid ? (valueReceived - investment) / investment * 100 : null };
}

export function calculateSalary(annualInput: number) {
  const annual = finiteNonNegative(annualInput);
  return { annual, monthly: annual / 12, weekly: annual / 52, hourlyAt40Hours: annual / 2080 };
}

export function calculateInventory(unitsInput: number, unitCostInput: number, reorderInput: number) {
  const units = finiteNonNegative(unitsInput);
  const unitCost = finiteNonNegative(unitCostInput);
  const reorderQuantity = finiteNonNegative(reorderInput);
  return { units, unitCost, inventoryValue: units * unitCost, reorderQuantity };
}

export function calculateExpenses(expenses: number[]) {
  const normalized = expenses.map(finiteNonNegative);
  const total = normalized.reduce((sum, value) => sum + value, 0);
  return { lines: normalized, total, average: normalized.length ? total / normalized.length : 0 };
}

export function calculateRecurringRevenue(mrrInput: number, annualGrowthPctInput: number) {
  const monthly = finiteNonNegative(mrrInput);
  const annualGrowthPct = Number.isFinite(annualGrowthPctInput) ? annualGrowthPctInput : 0;
  return { monthly, annual: monthly * 12, annualGrowthPct };
}

export function calculateProfitMargin(revenueInput: number, costsInput: number) {
  const revenue = finiteNonNegative(revenueInput);
  const costs = finiteNonNegative(costsInput);
  const profit = revenue - costs;
  return { revenue, costs, profit, marginPct: revenue > 0 ? profit / revenue * 100 : null };
}

export function calculateCustomerAcquisition(input: { spend: number; newCustomers: number; lifetimeValue?: number; monthlyContribution?: number }) {
  const spend = finiteNonNegative(input.spend);
  const newCustomers = finiteNonNegative(input.newCustomers);
  const cac = newCustomers > 0 ? spend / newCustomers : null;
  const ltv = finiteNonNegative(input.lifetimeValue ?? 0);
  const ratio = cac != null && cac > 0 && ltv > 0 ? ltv / cac : null;
  const contribution = finiteNonNegative(input.monthlyContribution ?? 0);
  return { spend, newCustomers, cac, ltv, ratio, band: ratio == null ? null : classifyLtvCac(ratio), monthlyContribution: contribution, paybackMonths: cac != null && cac > 0 && contribution > 0 ? cac / contribution : null };
}
