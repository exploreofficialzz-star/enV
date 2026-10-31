export type DailyAnalyticsReport = {
  schemaVersion: "env.analytics.daily-report.v1";
  reportDay: string;
  generatedAt: string;
  headline: string;
  totals: {
    events: number; installations: number; sessions: number; toolsUsed: number;
    views: number; starts: number; completed: number; failed: number;
    cancelled: number; abandoned: number; offlineEvents: number;
  };
  tools: Array<{toolId:string;views:number;starts:number;completed:number;failed:number;abandoned:number}>;
  platforms: Array<{platform:string;events:number}>;
  topFailures: Array<{toolId:string;code:string;count:number}>;
  interpretation: string;
};
export function buildDailyAnalyticsReport(input: {
  day: string; overview?: Record<string, unknown>;
  tools?: Array<Record<string, unknown>>;
  platforms?: Array<Record<string, unknown>>;
  failures?: Array<Record<string, unknown>>;
  generatedAt?: string;
}): DailyAnalyticsReport;
