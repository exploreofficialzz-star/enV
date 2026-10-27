import { createAuthClient } from "better-auth/react";
import { OAUTH_PROVIDERS } from "./providers";

export const authClient = createAuthClient();

/** Authentication remains off unless it is explicitly enabled at build time. */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED === "true";
/** Public UI flag paired with the server-only AUTH_EMAIL_PASSWORD_ENABLED setting. */
export const emailPasswordEnabled = import.meta.env.VITE_AUTH_EMAIL_ENABLED === "true";
/** Public UI gates prevent links to providers that are not configured on the server. */
export const googleAuthEnabled = import.meta.env.VITE_AUTH_GOOGLE_ENABLED === "true";
export const appleAuthEnabled = import.meta.env.VITE_AUTH_APPLE_ENABLED === "true";
export { OAUTH_PROVIDERS };

export async function signIn(
  providerId: string,
  options: { callbackURL?: string; errorCallbackURL?: string } = {},
): Promise<void> {
  const { data, error } = await authClient.signIn.social({
    provider: providerId,
    callbackURL: options.callbackURL ?? "/",
    errorCallbackURL: options.errorCallbackURL ?? "/login",
  });
  if (error) throw new Error(error.message ?? "Sign-in failed");
  if (!data?.url) throw new Error("The identity provider did not return a sign-in URL.");
  window.location.assign(data.url);
}

export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed");
  window.location.assign(redirectTo);
}
