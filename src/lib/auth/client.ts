import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { OAUTH_PROVIDERS } from "./providers";

export const authClient = createAuthClient({ plugins: [genericOAuthClient()] });

/** Authentication remains off unless it is explicitly enabled at build time. */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED === "true";
export { OAUTH_PROVIDERS };

export async function signIn(
  providerId: string,
  options: { callbackURL?: string; errorCallbackURL?: string } = {},
): Promise<void> {
  const { data, error } = await authClient.signIn.oauth2({
    providerId,
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
