import { createFileRoute } from "@tanstack/react-router";
import { auth, authConfigurationError } from "@/lib/auth/server";

/** Better Auth HTTP API for sessions, sign-in, sign-up and OAuth callbacks. */
const handleAuthRequest = ({ request }: { request: Request }) => {
  if (authConfigurationError) {
    return Response.json(
      {
        error: "AUTH_CONFIGURATION_UNAVAILABLE",
        message: "Account sign-in is temporarily unavailable. Please try again later.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return auth.handler(request);
};
export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { GET: handleAuthRequest, POST: handleAuthRequest } },
});
