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

export const authConfigured = authRequested;

if (authRequested && (!oauthIssuer || !oauthClientId || !oauthClientSecret)) {
  throw new Error(
    "Authentication is enabled but AUTH_OAUTH_ISSUER, AUTH_OAUTH_CLIENT_ID, and AUTH_OAUTH_CLIENT_SECRET are not all configured.",
  );
}
if (authRequested && isVercel && (!explicitBaseURL || !configuredSecret || !databaseUrl)) {
  throw new Error(
    "Vercel authentication requires BETTER_AUTH_URL, BETTER_AUTH_SECRET, and DATABASE_URL. Configure them in Vercel Project Settings.",
  );
}
if (authRequested && isVercel && !explicitBaseURL?.startsWith("https://")) {
  throw new Error("BETTER_AUTH_URL must be the canonical HTTPS origin when authentication is enabled on Vercel.");
}
if (authRequested && isVercel && !oauthIssuer?.startsWith("https://")) {
  throw new Error("AUTH_OAUTH_ISSUER must use HTTPS when authentication is enabled on Vercel.");
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
const trustedOrigins = explicitBaseURL ? [explicitBaseURL, ...localOrigins] : localOrigins;
const issuerDiscoveryUrl = oauthIssuer ? `${oauthIssuer}/.well-known/openid-configuration` : "";

const oauthPlugin = authRequested
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

export const SESSION_TOKEN_COOKIE = "__Host-env-auth.session_token";

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
  ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true } } : {}),
  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-env-auth.session_data" },
      account_data: { name: "__Host-env-auth.account_data" },
      dont_remember: { name: "__Host-env-auth.dont_remember" },
    },
  },
  plugins: [
    ...(oauthPlugin ? [oauthPlugin] : []),
    tanstackStartCookies(),
  ],
});
