import { randomBytes } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
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
const emailPasswordUiRequested = env("VITE_AUTH_EMAIL_ENABLED") === "true";
const googleUiRequested = env("VITE_AUTH_GOOGLE_ENABLED") === "true";
const appleUiRequested = env("VITE_AUTH_APPLE_ENABLED") === "true";
const isVercel = env("VERCEL") === "1";
const databaseUrl = env("DATABASE_URL");
const oauthIssuer = env("AUTH_OAUTH_ISSUER")?.replace(/\/+$/, "");
const oauthClientId = env("AUTH_OAUTH_CLIENT_ID");
const oauthClientSecret = env("AUTH_OAUTH_CLIENT_SECRET");
const explicitBaseURL = env("BETTER_AUTH_URL");
const configuredSecret = env("BETTER_AUTH_SECRET");
const resendApiKey = env("RESEND_API_KEY");
const authEmailFrom = env("AUTH_EMAIL_FROM");
const googleClientId = env("GOOGLE_CLIENT_ID");
const googleClientSecret = env("GOOGLE_CLIENT_SECRET");
const appleClientId = env("APPLE_CLIENT_ID");
const appleClientSecret = env("APPLE_CLIENT_SECRET");
const appleTeamId = env("APPLE_TEAM_ID");
const appleKeyId = env("APPLE_KEY_ID");
const applePrivateKey = env("APPLE_PRIVATE_KEY");
const secureCookies = env("NODE_ENV") === "production" || isVercel;
const emailPasswordAuthEnabled = authRequested && emailAndPasswordEnabled;
const oauthConfigured = Boolean(oauthIssuer && oauthClientId && oauthClientSecret);
const oauthPartiallyConfigured = Boolean(oauthIssuer || oauthClientId || oauthClientSecret) && !oauthConfigured;
const googleConfigured = Boolean(googleClientId && googleClientSecret);
const googlePartiallyConfigured = Boolean(googleClientId || googleClientSecret) && !googleConfigured;
const appleGeneratedSecretConfigured = Boolean(appleTeamId && appleKeyId && applePrivateKey);
const appleConfigured = Boolean(appleClientId && (appleClientSecret || appleGeneratedSecretConfigured));
const applePartiallyConfigured = Boolean(appleClientId || appleClientSecret || appleTeamId || appleKeyId || applePrivateKey) && !appleConfigured;
const socialProviderConfigured = googleConfigured || appleConfigured;

export const authConfigured = authRequested;

if (authRequested && oauthPartiallyConfigured) {
  throw new Error(
    "OAuth is partially configured. Set AUTH_OAUTH_ISSUER, AUTH_OAUTH_CLIENT_ID, and AUTH_OAUTH_CLIENT_SECRET together, or remove all three to use social providers or email/password authentication.",
  );
}
if (authRequested && googlePartiallyConfigured) {
  throw new Error("Google sign-in requires both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
}
if (authRequested && emailPasswordUiRequested && !emailPasswordAuthEnabled) {
  throw new Error("The email/password sign-in UI is enabled but AUTH_EMAIL_PASSWORD_ENABLED is not true on the server.");
}
if (authRequested && googleUiRequested && !googleConfigured) {
  throw new Error("The Google sign-in UI is enabled but GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured on the server.");
}
if (authRequested && appleUiRequested && !appleConfigured) {
  throw new Error("The Apple sign-in UI is enabled but complete Apple credentials are not configured on the server.");
}
if (authRequested && applePartiallyConfigured) {
  throw new Error("Apple sign-in requires both APPLE_CLIENT_ID and APPLE_CLIENT_SECRET.");
}
if (authRequested && !oauthConfigured && !socialProviderConfigured && !emailPasswordAuthEnabled) {
  throw new Error("Authentication is enabled but no provider is configured. Configure Google, Apple, a complete OIDC provider, or email/password with transactional email delivery.");
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
const trustedOrigins = [
  ...(explicitBaseURL ? [explicitBaseURL, ...(secureCookies ? [] : localOrigins)] : localOrigins),
  ...(appleConfigured ? ["https://appleid.apple.com"] : []),
];
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

/**
 * Apple client secrets are signed JWTs with a maximum six-month lifetime.
 * Prefer generating them from server-only signing material so deployments do
 * not depend on an operator remembering to rotate a pre-generated JWT.
 * APPLE_CLIENT_SECRET remains supported for deployments that manage rotation
 * externally; do not configure it when using the generated-secret variables.
 */
async function getAppleClientSecret(): Promise<string> {
  if (appleClientSecret) return appleClientSecret;
  if (!appleClientId || !appleTeamId || !appleKeyId || !applePrivateKey) {
    throw new Error("Apple sign-in is missing its client ID or signing credentials.");
  }

  const privateKey = await importPKCS8(applePrivateKey.replaceAll("\\n", "\n"), "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: appleKeyId })
    .setIssuer(appleTeamId)
    .setSubject(appleClientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(privateKey);
}

export const auth = betterAuth({
  baseURL: explicitBaseURL ?? "http://localhost:8080",
  secret,
  database,
  trustedOrigins,
  socialProviders: {
    ...(googleConfigured ? { google: { clientId: googleClientId!, clientSecret: googleClientSecret! } } : {}),
    ...(appleConfigured ? { apple: async () => ({ clientId: appleClientId!, clientSecret: await getAppleClientSecret() }) } : {}),
  },
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
