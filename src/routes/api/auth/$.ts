import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

/** Better Auth HTTP API for sessions, sign-in, sign-up and OAuth callbacks. */
const handleAuthRequest = ({ request }: { request: Request }) => auth.handler(request);
export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { GET: handleAuthRequest, POST: handleAuthRequest } },
});
