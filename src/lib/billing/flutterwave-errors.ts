export type FlutterwaveApiFailure = {
  code: "FLUTTERWAVE_AUTH_FAILED" | "FLUTTERWAVE_API_ERROR" |
    "FLUTTERWAVE_CARD_RESTRICTED" | "FLUTTERWAVE_BANKING_PARTNER_ERROR";
  status: number;
};

/**
 * Convert provider errors into stable internal classifications.
 * The 1138422 code identifies an upstream banking-partner failure; the
 * accompanying provider message is required before classifying it as a
 * restricted-card velocity event.
 */
export function classifyFlutterwaveApiFailure(input: {
  httpStatus: number;
  providerErrorCode: string;
  providerMessage: string;
  paymentType?: string;
}): FlutterwaveApiFailure {
  const message = input.providerMessage.toLowerCase();
  const isRestrictedCard =
    input.providerErrorCode === "1138422" &&
    input.paymentType === "card" &&
    (/restricted card/.test(message) || /failed attempt limit/.test(message));

  if (isRestrictedCard) {
    return { code: "FLUTTERWAVE_CARD_RESTRICTED", status: 422 };
  }

  if (input.providerErrorCode === "1138422") {
    return { code: "FLUTTERWAVE_BANKING_PARTNER_ERROR", status: 422 };
  }

  if (input.httpStatus === 401) {
    return { code: "FLUTTERWAVE_AUTH_FAILED", status: 503 };
  }

  return {
    code: "FLUTTERWAVE_API_ERROR",
    status: input.httpStatus >= 500 ? 503 : 502,
  };
}
