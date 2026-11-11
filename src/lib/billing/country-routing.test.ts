import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMinorUnits,
  getCountryPaymentProfile,
  getCustomerCountry,
  getCurrencyMinorUnitExponent,
  normalizeCountryCode,
  parseMajorUnitsToMinor,
} from "./country-routing.ts";

test("customer country comes from trusted edge headers and never defaults to Nigeria", () => {
  assert.equal(getCustomerCountry(new Request("https://envtools.store", {
    headers: { "x-vercel-ip-country": "GH" },
  })), "GH");
  assert.equal(getCustomerCountry(new Request("https://envtools.store", {
    headers: { "cf-ipcountry": "KE" },
  })), "KE");
  assert.equal(getCustomerCountry(new Request("https://envtools.store")), null);
  assert.equal(normalizeCountryCode("xx"), null);
});

test("country profiles expose country-specific Flutterwave currencies and methods", () => {
  assert.deepEqual(getCountryPaymentProfile("NG"), {
    countryCode: "NG", currency: "NGN",
    paymentOptions: ["card", "ussd", "banktransfer", "account", "internetbanking", "nqr", "enaira", "opay"],
  });
  assert.equal(getCountryPaymentProfile("GH")?.currency, "GHS");
  assert.equal(getCountryPaymentProfile("KE")?.paymentOptions.includes("mpesa"), true);
  assert.equal(getCountryPaymentProfile("ZA")?.currency, "ZAR");
  assert.equal(getCountryPaymentProfile("CI")?.currency, "XOF");
  assert.equal(getCountryPaymentProfile("CM")?.currency, "XAF");
  assert.equal(getCountryPaymentProfile("DE")?.currency, "EUR");
  assert.equal(getCountryPaymentProfile("DK")?.currency, "EUR");
  assert.equal(getCountryPaymentProfile("NO")?.currency, "EUR");
  assert.equal(getCountryPaymentProfile("PL")?.currency, "EUR");
  assert.equal(getCountryPaymentProfile("JP"), null);
});

test("currency conversion preserves minor units without floating point rounding", () => {
  assert.equal(formatMinorUnits(12345, "NGN"), "123.45");
  assert.equal(formatMinorUnits(12345, "XOF"), "12345");
  assert.equal(parseMajorUnitsToMinor("123.45", "NGN"), 12345);
  assert.equal(parseMajorUnitsToMinor(123, "UGX"), 123);
  assert.equal(parseMajorUnitsToMinor("1.239", "NGN"), null);
  assert.equal(getCurrencyMinorUnitExponent("XAF"), 0);
});
