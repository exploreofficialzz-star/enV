export type OAuthProvider = {
  providerId: string;
  label: string;
};

/** One standards-based OIDC provider configured through Vercel environment variables. */
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = [
  { providerId: "oauth", label: "your identity provider" },
];
