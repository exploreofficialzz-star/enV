import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { OAUTH_PROVIDERS } from "./providers";
import { pgliteDialect } from "./pglite-dialect";

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value || undefined;
};

const authRequested = env("VITE_AUTH_ENABLED") === "true";
const isVercel = env("VERCEL") === "1";
const databaseUrl = env("DATABASE_URL");
const oauthIssuer = env("AUTH_OAUTH_ISSUER")?.replace(/\/+$/, "");
const oauthClientId = env("AUTH_OAUTH_CLIENT_ID");
const oauthClientSecret = env("AUTH_OAUTH_CLIENT_SECRET");
const explicitBaseURL = env("BETTER_AUTH_URL");
const configuredSecret = env("BETTER_AUTH_SECRET");
const resendApiKey = env("RESEND_API_KEY");
const authEmailFrom = env("AUTH_EMAIL_FROM");
const secureCookies = env("NODE_ENV") === "production" || isVercel;
const emailPasswordAuthEnabled = authRequested && emailAndPasswordEnabled;
const oauthConfigured = Boolean(oauthIssuer && oauthClientId && oauthClientSecret);
const oauthPartiallyConfigured = Boolean(oauthIssuer || oauthClientId || oauthClientSecret) && !oauthConfigured;

export const authConfigured = authRequested;

if (authRequested && oauthPartiallyConfigured) {
  throw new Error(
    "OAuth is partially configured. Set AUTH_OAUTH_ISSUER, AUTH_OAUTH_CLIENT_ID, and AUTH_OAUTH_CLIENT_SECRET together, or remove all three to use email/password authentication.",
  );
}
if (authRequested && !oauthConfigured && !emailPasswordAuthEnabled) {
  throw new Error("Authentication is enabled but no provider is configured. Configure a complete OAuth provider or enable email/password with transactional email delivery.");
}
if (authRequested && emailPasswordAuthEnabled && (!resendApiKey || !authEmailFrom)) {
  throw new Error("Email/password authentication requires RESEND_API_KEY and AUTH_EMAIL_FROM so verification and password-reset emails can be delivered.");
}
if (authRequested && (isVercel || env("NODE_ENV") === "production") && (!explicitBaseURL || !configuredSecret || !databaseUrl)) {
  throw new Error(
    "Production authentication requires BETTER_AUTH_URL, BETTER_AUTH_SECRET, and DATABASE_URL. Configure them in the deployment environment.",
  );
}
if (authRequested && (isVercel || env("NODE_ENV") === "production") && !explicitBaseURL?.startsWith("https://")) {
  throw new Error("BETTER_AUTH_URL must be the canonical HTTPS origin when authentication is enabled in production.");
}
if (authRequested && oauthConfigured && (isVercel || env("NODE_ENV") === "production") && !oauthIssuer?.startsWith("https://")) {
  throw new Error("AUTH_OAUTH_ISSUER must use HTTPS when OAuth is enabled in production.");
}

const secret = configuredSecret ?? randomBytes(32).toString("hex");
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl, max: 5 })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

// Auth is opt-in. Avoid starting an embedded database on every Vercel function
// cold start when the app's browser utilities do not require a server account.
if (authRequested && !databaseUrl) void ensureDbReady();

const localOrigins = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];
const trustedOrigins = explicitBaseURL ? [explicitBaseURL, ...(secureCookies ? [] : localOrigins)] : localOrigins;
const issuerDiscoveryUrl = oauthIssuer ? `${oauthIssuer}/.well-known/openid-configuration` : "";

const oauthPlugin = authRequested && oauthConfigured
  ? genericOAuth({
      config: OAUTH_PROVIDERS.map(({ providerId }) => ({
        providerId,
        discoveryUrl: issuerDiscoveryUrl,
        clientId: oauthClientId!,
        clientSecret: oauthClientSecret!,
        scopes: ["openid", "profile", "email"],
      })),
    })
  : null;

const authCookiePrefix = secureCookies ? "__Host-env-auth." : "env-auth.";
export const SESSION_TOKEN_COOKIE = `${authCookiePrefix}session_token`;

async function sendTransactionalEmail(input: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: authEmailFrom, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
  });
  if (!response.ok) throw new Error(`Transactional email delivery failed with status ${response.status}.`);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export const auth = betterAuth({
  baseURL: explicitBaseURL ?? "http://localhost:8080",
  secret,
  database,
  trustedOrigins,
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: OAUTH_PROVIDERS.map((provider) => provider.providerId),
      requireLocalEmailVerified: false,
    },
  },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  ...(emailPasswordAuthEnabled ? {
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
        const safeUrl = escapeHtml(url);
        await sendTransactionalEmail({
          to: user.email,
          subject: "Reset your enV password",
          text: `Hello ${user.name},\n\nUse this link to reset your enV password: ${url}\n\nIf you did not request this, you can ignore this email.`,
          html: `<p>Hello ${escapeHtml(user.name)},</p><p>Use this link to reset your enV password:</p><p><a href="${safeUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
        });
      },
    },
  } : {}),
  ...(emailPasswordAuthEnabled ? {
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
        const safeUrl = escapeHtml(url);
        await sendTransactionalEmail({
          to: user.email,
          subject: "Verify your enV email address",
          text: `Hello ${user.name},\n\nVerify your enV email address by opening this link: ${url}\n\nThe link expires. If you did not create this account, you can ignore this email.`,
          html: `<p>Hello ${escapeHtml(user.name)},</p><p>Verify your enV email address by opening this link:</p><p><a href="${safeUrl}">Verify email address</a></p><p>The link expires. If you did not create this account, you can ignore this email.</p>`,
        });
      },
    },
  } : {}),
  advanced: {
    useSecureCookies: secureCookies,
    defaultCookieAttributes: { secure: secureCookies, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: `${authCookiePrefix}session_data` },
      account_data: { name: `${authCookiePrefix}account_data` },
      dont_remember: { name: `${authCookiePrefix}dont_remember` },
    },
  },
  plugins: [
    ...(oauthPlugin ? [oauthPlugin] : []),
    tanstackStartCookies(),
  ],
});
