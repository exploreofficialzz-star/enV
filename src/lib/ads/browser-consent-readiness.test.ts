import assert from "node:assert/strict";
import test from "node:test";
import { reopenGooglePrivacySettings, whenGoogleAdsConsentReady } from "./browser.ts";

type CallbackItem = Record<string, () => void> | (() => void);

function withGoogleFc<T>(run: (queue: CallbackItem[], windowStub: Record<string, unknown>) => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const queue: CallbackItem[] = [];
  const windowStub: Record<string, unknown> = {
    googlefc: { callbackQueue: queue },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: windowStub,
  });
  try {
    return run(queue, windowStub);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("Google rewarded consent decisions are cached after all privacy checks finish", () => {
  withGoogleFc((queue, windowStub) => {
    const api = windowStub.googlefc as Record<string, unknown>;
    const statuses = {
      CONSENT_MODE_PURPOSE_STATUS_GRANTED: 1,
      CONSENT_MODE_PURPOSE_STATUS_NOT_APPLICABLE: 2,
      CONSENT_MODE_PURPOSE_STATUS_NOT_CONFIGURED: 3,
      CONSENT_MODE_PURPOSE_STATUS_DENIED: 4,
    };
    Object.assign(api, {
      ConsentModePurposeStatusEnum: statuses,
      getGoogleConsentModeValues: () => ({
        adStoragePurposeConsentStatus: 1,
        adUserDataPurposeConsentStatus: 1,
        adPersonalizationPurposeConsentStatus: 2,
        analyticsStoragePurposeConsentStatus: 1,
      }),
      usstatesoptout: {
        getInitialUsStatesOptOutStatus: () => 2,
        InitialUsStatesOptOutStatusEnum: {
          DOES_NOT_APPLY: 1,
          NOT_OPTED_OUT: 2,
          OPTED_OUT: 3,
        },
      },
      getAdBlockerStatus: () => 1,
      AdBlockerStatusEnum: {
        NO_AD_BLOCKER: 1,
        UNKNOWN: 2,
      },
    });

    const decisions: boolean[] = [];
    whenGoogleAdsConsentReady((allowed) => decisions.push(allowed));
    assert.equal(queue.length, 1);
    const consentMode = queue.shift() as Record<string, () => void>;
    consentMode.CONSENT_MODE_DATA_READY();

    assert.equal(queue.length, 1);
    const stateOptOut = queue.shift() as Record<string, () => void>;
    stateOptOut.INITIAL_US_STATES_OPT_OUT_DATA_READY();

    assert.equal(queue.length, 1);
    const blocker = queue.shift() as Record<string, () => void>;
    blocker.AD_BLOCK_DATA_READY();

    assert.deepEqual(decisions, [true]);
    assert.equal((windowStub as { __envGoogleAdsConsentDecisionReady?: boolean }).__envGoogleAdsConsentDecisionReady, true);
    assert.equal((windowStub as { __envGoogleAdsAllowed?: boolean }).__envGoogleAdsAllowed, true);

    whenGoogleAdsConsentReady((allowed) => decisions.push(allowed));
    assert.deepEqual(decisions, [true, true]);
    assert.equal(queue.length, 0);
  });
});

test("denied consent is cached as blocked and never becomes an allowed reward", () => {
  withGoogleFc((queue, windowStub) => {
    const api = windowStub.googlefc as Record<string, unknown>;
    Object.assign(api, {
      ConsentModePurposeStatusEnum: {
        CONSENT_MODE_PURPOSE_STATUS_GRANTED: 1,
        CONSENT_MODE_PURPOSE_STATUS_NOT_APPLICABLE: 2,
        CONSENT_MODE_PURPOSE_STATUS_NOT_CONFIGURED: 3,
      },
      getGoogleConsentModeValues: () => ({
        adStoragePurposeConsentStatus: 1,
        adUserDataPurposeConsentStatus: 1,
        adPersonalizationPurposeConsentStatus: 9,
        analyticsStoragePurposeConsentStatus: 1,
      }),
    });

    const decisions: boolean[] = [];
    whenGoogleAdsConsentReady((allowed) => decisions.push(allowed));
    const consentMode = queue.shift() as Record<string, () => void>;
    consentMode.CONSENT_MODE_DATA_READY();

    assert.deepEqual(decisions, [false]);
    whenGoogleAdsConsentReady((allowed) => decisions.push(allowed));
    assert.deepEqual(decisions, [false, false]);
    assert.equal(queue.length, 0);
  });
});

test("reopening Google privacy choices invalidates the cached ad decision", () => {
  withGoogleFc((queue, windowStub) => {
    (windowStub as { __envGoogleAdsConsentDecisionReady?: boolean }).__envGoogleAdsConsentDecisionReady = true;
    (windowStub as { __envGoogleAdsAllowed?: boolean }).__envGoogleAdsAllowed = true;

    reopenGooglePrivacySettings();

    assert.equal((windowStub as { __envGoogleAdsConsentDecisionReady?: boolean }).__envGoogleAdsConsentDecisionReady, false);
    assert.equal((windowStub as { __envGoogleAdsAllowed?: boolean }).__envGoogleAdsAllowed, false);
    assert.equal(queue.length, 1);

    const revocation = queue.shift();
    assert.equal(typeof revocation, "function");
    whenGoogleAdsConsentReady(() => undefined);
    assert.equal(queue.length, 1);
    assert.ok(typeof queue[0] === "object" && queue[0] !== null && "CONSENT_MODE_DATA_READY" in queue[0]);
  });
});
