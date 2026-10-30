export type AnalyticsPlatform = "web" | "android" | "ios";
export type AnalyticsOutcome = "success" | "failure" | "cancelled" | "abandoned" | "unknown";
export type AnalyticsEventName = "app_opened" | "tool_viewed" | "tool_started" | "tool_completed" | "tool_failed" | "tool_cancelled" | "tool_abandoned" | "comment_created" | "reaction_created" | "feedback_submitted" | "update_viewed" | "offline_sync_succeeded" | "offline_sync_failed";
export interface AnalyticsEventInput {
  eventId: string; name: AnalyticsEventName; toolId?: string | null; occurredAt?: string; durationMs?: number;
  outcome?: AnalyticsOutcome; errorCode?: string; isOffline?: boolean;
  networkType?: "wifi" | "cellular" | "ethernet" | "unknown";
  networkEffectiveType?: "slow-2g" | "2g" | "3g" | "4g" | "unknown";
  deviceClass?: "phone" | "tablet" | "desktop" | "unknown"; appVersion?: string;
  properties?: Record<string, string | number | boolean>;
}
export declare const ANALYTICS_POLICY_VERSION: string;
export declare function validateConsentPayload(value: unknown): { subjectId: string; platform: AnalyticsPlatform; granted: boolean; policyVersion: string };
export declare function validateEventsPayload(value: unknown): { subjectId: string; platform: AnalyticsPlatform; policyVersion: string; events: Array<AnalyticsEventInput & { occurredAt: string | null; durationMs: number | null; outcome: AnalyticsOutcome; errorCode: string | null; isOffline: boolean; networkType: string; networkEffectiveType: string; deviceClass: string; appVersion: string | null; properties: Record<string, string | number | boolean> }> };
export declare function classifyUserAgent(value: unknown): { browserFamily: string; osFamily: string };
export declare function classifyReferrer(value: unknown, applicationDomain?: string): string;
