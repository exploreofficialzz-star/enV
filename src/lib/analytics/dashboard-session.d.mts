export type DashboardSession = {
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
};
export function issueDashboardSession(
  secret: string,
  nowSeconds: number,
  lifetimeSeconds?: number,
): DashboardSession & { token: string };
export function readDashboardSession(
  token: string,
  secret: string,
  nowSeconds?: number,
): DashboardSession | null;
export function dashboardSessionDigest(sessionId: string, secret: string): string;
