import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateBreakEven, calculateCashFlow, calculateCommission, calculateCustomerAcquisition, calculateDiscount, calculateDocumentTotals, calculateExpenses, calculateInventory, calculateLifetimeValue, calculatePricing, calculateProfitMargin, calculateRecurringRevenue, calculateRoi, calculateSalary, classifyLtvCac, generateBusinessNames, generateSlogans, generateSkus } from "./business-studios.ts";

test("descriptive names create a broad, deduplicated local list", () => {
  const names = generateBusinessNames({ seed: "solar energy", style: "descriptive" });
  assert.ok(names.length >= 24, `expected at least 24 names, got ${names.length}`);
  assert.ok(new Set(names.map((name) => name.toLowerCase())).size === names.length);
  assert.ok(names.some((name) => /solar/i.test(name)));
  assert.ok(names.some((name) => /energy/i.test(name)));
  assert.ok(!names.every((name) => /\b(Labs|Works|Studio)\b/i.test(name)));
});

test("naming modes differ, respect filters and More offset", () => {
  const descriptive = generateBusinessNames({ seed: "solar energy", style: "descriptive" });
  const compound = generateBusinessNames({ seed: "solar energy", style: "compound" });
  const short = generateBusinessNames({ seed: "solar energy", style: "short-brandable", maxLength: 12 });
  const more = generateBusinessNames({ seed: "solar energy", style: "descriptive", offset: 7 });
  assert.notDeepEqual(descriptive, compound);
  assert.notDeepEqual(descriptive, more);
  assert.ok(short.every((name) => name.length <= 12));
  assert.ok(generateBusinessNames({ seed: "solar energy", blacklist: "solar, energy" }).every((name) => !/solar|energy/i.test(name)));
});

test("slogans and SKUs have meaningful varied batches", () => {
  assert.equal(generateSlogans("solar", "homeowners").length, 24);
  assert.equal(generateSkus("TEC").length, 24);
  assert.equal(generateSkus("TEC")[0], "TEC-001");
  assert.equal(generateSkus("TEC", 24)[0], "TEC-025");
});

test("simple and SaaS lifetime value models use explicitly documented formulas", () => {
  const simple = calculateLifetimeValue({ model: "simple", averageOrderValue: 50, purchasesPerPeriod: 12, lifespanPeriods: 24 });
  assert.equal(simple.ltv, 14400);
  const saas = calculateLifetimeValue({ model: "saas", arpu: 50, grossMarginPct: 80, monthlyChurnPct: 5 });
  assert.equal(saas.ltv, 800);
  assert.equal(saas.monthlyContribution, 40);
  assert.ok(saas.method.includes("gross margin"));
  const noChurn = calculateLifetimeValue({ model: "saas", arpu: 50, grossMarginPct: 80, monthlyChurnPct: 0 });
  assert.equal(noChurn.ltv, 0);
  assert.ok(noChurn.warning.includes("greater than 0%"));
});


test("LTV:CAC bands preserve exact 1×, 3×, and 5× boundaries", () => {
  assert.equal(classifyLtvCac(0.99), "below-1");
  assert.equal(classifyLtvCac(1), "1-to-3");
  assert.equal(classifyLtvCac(2.99), "1-to-3");
  assert.equal(classifyLtvCac(3), "3-to-5");
  assert.equal(classifyLtvCac(5), "3-to-5");
  assert.equal(classifyLtvCac(5.01), "above-5");
  assert.equal(classifyLtvCac(Number.NaN), "below-1");
});

test("slogan More produces a separate 24-idea page", () => {
  const first = generateSlogans("solar energy", "homeowners", 0, 24);
  const more = generateSlogans("solar energy", "homeowners", 1, 24);
  assert.equal(first.length, 24);
  assert.equal(more.length, 24);
  assert.notDeepEqual(first, more);
  assert.equal(new Set(first.concat(more)).size, 48);
});


test("finance golden calculations use bounded inputs and correct labels", () => {
  const commission = calculateCommission(50000, 8);
  assert.equal(commission.commission, 4000);
  assert.equal(commission.afterCommission, 46000);
  assert.equal(calculateCommission(100, 150).commission, 100);
  const breakEven = calculateBreakEven({ fixedCosts: 10000, pricePerUnit: 50, variableCostPerUnit: 30 });
  assert.equal(breakEven.breakEvenUnits, 500);
  assert.equal(breakEven.breakEvenRevenue, 25000);
  assert.equal(calculateBreakEven({ fixedCosts: 10000, pricePerUnit: 10, variableCostPerUnit: 15 }).possible, false);
  assert.equal(calculateBreakEven({ fixedCosts: 10000, pricePerUnit: 50, variableCostPerUnit: 30, targetProfit: 5000 }).targetUnits, 750);
  assert.deepEqual(calculateCashFlow(1000, 800, 900), { openingCash: 1000, inflows: 800, outflows: 900, netCashFlow: -100, endingCash: 900 });
  assert.deepEqual(calculateDiscount(100, 150), { original: 100, ratePct: 100, discount: 100, finalPrice: 0 });
  assert.deepEqual(calculatePricing(100, 25), { cost: 100, markupPct: 25, profit: 25, sellingPrice: 125 });
  assert.equal(calculateRoi(150, 100).roiPct, 50);
  assert.equal(calculateRoi(150, 0).roiPct, null);
  assert.equal(calculateSalary(52000).weekly, 1000);
  assert.equal(calculateInventory(12, 25, 5).inventoryValue, 300);
  assert.deepEqual(calculateExpenses([10, 20, -5]).total, 30);
  assert.deepEqual(calculateRecurringRevenue(-100, 15), { monthly: 0, annual: 0, annualGrowthPct: 15 });
  assert.equal(calculateProfitMargin(100, 70).marginPct, 30);
  const cac = calculateCustomerAcquisition({ spend: 5000, newCustomers: 100, lifetimeValue: 250, monthlyContribution: 10 });
  assert.equal(cac.cac, 50);
  assert.equal(cac.ratio, 5);
  assert.equal(cac.band, "3-to-5");
  assert.equal(cac.paybackMonths, 5);
});


test("document totals bound discounts and reject non-finite line values", () => {
  const result = calculateDocumentTotals([{ quantity: 2, unitPrice: 250 }, { quantity: 1, unitPrice: 250 }], 7.5, 0);
  assert.equal(result.subtotal, 750);
  assert.equal(result.tax, 56.25);
  assert.equal(result.total, 806.25);
  const discounted = calculateDocumentTotals([{ quantity: 1, unitPrice: 100 }], 10, 150);
  assert.equal(discounted.discountRatePct, 100);
  assert.equal(discounted.total, 0);
  const malformed = calculateDocumentTotals([{ quantity: Number.NaN, unitPrice: 100 }, { quantity: 1, unitPrice: Number.POSITIVE_INFINITY }], -5, -1);
  assert.equal(malformed.subtotal, 0);
  assert.equal(malformed.total, 0);
});

test("SKU pages use sequential unique codes with no duplicate page", () => {
  const first = generateSkus("TEC", 0, 24);
  const next = generateSkus("TEC", 24, 24);
  assert.equal(first[0], "TEC-001");
  assert.equal(first.at(-1), "TEC-024");
  assert.equal(next[0], "TEC-025");
  assert.equal(new Set([...first, ...next]).size, 48);
});
