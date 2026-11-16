import assert from "node:assert/strict";
import test from "node:test";
import { classifyFlutterwaveApiFailure } from "./flutterwave-errors.ts";

test("classifies the observed V4 restricted-card velocity response without blaming amount or checkout fields", () => {
  assert.deepEqual(classifyFlutterwaveApiFailure({
    httpStatus: 422,
    providerErrorCode: "1138422",
    providerMessage: "Declined: Restricted card. You've exceeded the failed attempt limit on this card. Please retry with a different card or contact your bank.",
    paymentType: "card",
  }), {
    code: "FLUTTERWAVE_CARD_RESTRICTED",
    status: 422,
  });
});

test("keeps other 1138422 failures classified as banking-partner failures", () => {
  assert.deepEqual(classifyFlutterwaveApiFailure({
    httpStatus: 422,
    providerErrorCode: "1138422",
    providerMessage: "Unprocessable F4B response",
    paymentType: "card",
  }), {
    code: "FLUTTERWAVE_BANKING_PARTNER_ERROR",
    status: 422,
  });
});

test("does not misclassify a restricted-card text for mobile money as card velocity", () => {
  assert.deepEqual(classifyFlutterwaveApiFailure({
    httpStatus: 422,
    providerErrorCode: "1138422",
    providerMessage: "Restricted card. Failed attempt limit reached.",
    paymentType: "mobile_money",
  }), {
    code: "FLUTTERWAVE_BANKING_PARTNER_ERROR",
    status: 422,
  });
});

test("keeps ordinary API and authentication failures distinct", () => {
  assert.equal(classifyFlutterwaveApiFailure({
    httpStatus: 401,
    providerErrorCode: "10401",
    providerMessage: "Invalid credentials",
  }).code, "FLUTTERWAVE_AUTH_FAILED");
  assert.equal(classifyFlutterwaveApiFailure({
    httpStatus: 422,
    providerErrorCode: "1135422",
    providerMessage: "Card expiry year out of range",
    paymentType: "card",
  }).code, "FLUTTERWAVE_API_ERROR");
  assert.equal(classifyFlutterwaveApiFailure({
    httpStatus: 500,
    providerErrorCode: "10500",
    providerMessage: "Internal provider error",
  }).status, 503);
});
