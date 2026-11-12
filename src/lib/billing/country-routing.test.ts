import assert from "node:assert/strict";
import test from "node:test";
import {
  getCountryPaymentProfile,
  getCustomerCountry,
  getCurrencyMinorUnitExponent,
  normalizeCountryCode,
  parseMajorUnitsToMinor,
  toFlutterwaveMajorAmount,
} from "./country-routing.ts";

test("country detection uses the Vercel edge header and never defaults to Nigeria", () => {
  assert.equal(getCustomerCountry(new Request("https://envtools.store", {
    headers: { "x-vercel-ip-country": "GH" },
  })), "GH");
  assert.equal(getCustomerCountry(new Request("https://envtools.store", {
    headers: { "cf-ipcountry": "KE" },
  })), null);
  assert.equal(getCustomerCountry(new Request("https://envtools.store")), null);
  assert.equal(normalizeCountryCode("xx"), null);
});

test("Cloudflare country headers are ignored unless the deployment trusts a locked-down Cloudflare proxy", () => {
  const oldProvider = process.env.COUNTRY_GEO_PROVIDER;
  const oldLockdown = process.env.CLOUDFLARE_ORIGIN_LOCKDOWN_APPROVED;
  try {
    process.env.COUNTRY_GEO_PROVIDER = "cloudflare";
    delete process.env.CLOUDFLARE_ORIGIN_LOCKDOWN_APPROVED;
    const request = new Request("https://envtools.store", { headers: { "cf-ipcountry": "KE" } });
    assert.equal(getCustomerCountry(request), null);
    process.env.CLOUDFLARE_ORIGIN_LOCKDOWN_APPROVED = "true";
    assert.equal(getCustomerCountry(request), "KE");
  } finally {
    if (oldProvider === undefined) delete process.env.COUNTRY_GEO_PROVIDER;
    else process.env.COUNTRY_GEO_PROVIDER = oldProvider;
    if (oldLockdown === undefined) delete process.env.CLOUDFLARE_ORIGIN_LOCKDOWN_APPROVED;
    else process.env.CLOUDFLARE_ORIGIN_LOCKDOWN_APPROVED = oldLockdown;
  }
});

test("country profiles expose the documented Flutterwave local currencies and method identifiers", () => {
  assert.deepEqual(getCountryPaymentProfile("NG"), {
    countryCode: "NG", currency: "NGN",
    paymentOptions: ["card", "ussd", "banktransfer", "account", "internetbanking", "nqr", "enaira", "opay"],
  });
  assert.equal(getCountryPaymentProfile("GH")?.paymentOptions.includes("mobilemoneyghana"), true);
  assert.equal(getCountryPaymentProfile("KE")?.paymentOptions.includes("mpesa"), true);
  assert.equal(getCountryPaymentProfile("ZA")?.currency, "ZAR");
  assert.equal(getCountryPaymentProfile("GH")?.currency, "GHS");
  assert.equal(getCountryPaymentProfile("GH")?.paymentOptions.includes("mobilemoneyghana"), true);
  for (const country of ["BJ", "BF", "CI", "GW", "ML", "NE", "SN", "TG"]) {
    assert.equal(getCountryPaymentProfile(country)?.currency, "XOF", country + " must use the XOF profile");
    assert.equal(getCountryPaymentProfile(country)?.paymentOptions.includes("mobilemoneyxof"), true);
  }
  for (const country of ["CM", "TD", "CF", "CG", "GQ", "GA"]) {
    assert.equal(getCountryPaymentProfile(country)?.currency, "XAF", country + " must use the XAF profile");
    assert.equal(getCountryPaymentProfile(country)?.paymentOptions.includes("mobilemoneyxaf"), true);
  }
  assert.equal(getCountryPaymentProfile("ZM")?.paymentOptions.includes("mobilemoneyzambia"), true);
  assert.equal(getCountryPaymentProfile("DE")?.currency, "EUR");
  assert.equal(getCountryPaymentProfile("BG")?.currency, "EUR");
  assert.equal(getCountryPaymentProfile("HR")?.currency, "EUR");
  assert.equal(getCountryPaymentProfile("DK"), null);
  assert.equal(getCountryPaymentProfile("NO"), null);
  assert.equal(getCountryPaymentProfile("PL"), null);
  assert.equal(getCountryPaymentProfile("JP"), null);
});

test("Flutterwave Standard accepts only exact whole major-unit amounts within int32", () => {
  assert.equal(toFlutterwaveMajorAmount(10_000, "NGN"), 100);
  assert.equal(toFlutterwaveMajorAmount(12_300, "NGN"), 123);
  assert.equal(toFlutterwaveMajorAmount(12_350, "NGN"), null);
  assert.equal(toFlutterwaveMajorAmount(12_345, "NGN"), null);
  assert.equal(toFlutterwaveMajorAmount(123, "XOF"), 123);
  assert.equal(toFlutterwaveMajorAmount(214_748_364_800, "NGN"), null);
  assert.equal(toFlutterwaveMajorAmount(0, "NGN"), null);
  assert.equal(toFlutterwaveMajorAmount(123, "UNKNOWN"), null);
});

test("provider verification amounts convert to integer minor units without rounding", () => {
  assert.equal(parseMajorUnitsToMinor("123.45", "NGN"), 12_345);
  assert.equal(parseMajorUnitsToMinor(123, "UGX"), 123);
  assert.equal(parseMajorUnitsToMinor("1.239", "NGN"), null);
  assert.equal(parseMajorUnitsToMinor("1.2", "XOF"), null);
  assert.equal(getCurrencyMinorUnitExponent("XAF"), 0);
  assert.equal(getCurrencyMinorUnitExponent("ZMW"), 2);
});
