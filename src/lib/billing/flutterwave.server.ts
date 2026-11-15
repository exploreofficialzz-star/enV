/**
 * Flutterwave provider entry point.
 * All live payment requests use the Flutterwave v4 OAuth + Orchestrator API.
 * Version 3 Standard/transaction endpoints are intentionally not used.
 */
export {
  getFlutterwaveFundingOption,
  getFlutterwaveCardEncryptionKey,
  initializeFlutterwaveCheckout,
  verifyAndCreditFlutterwaveReference,
  authorizeFlutterwaveCharge,
  handleFlutterwaveWebhook,
} from "./flutterwave-v4.server";
