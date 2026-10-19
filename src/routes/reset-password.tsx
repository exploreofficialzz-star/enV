import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/components/auth/reset-password-page";

type ResetPasswordSearch = { token: string; error: string };

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === "string" ? search.token : "",
    error: typeof search.error === "string" ? search.error : "",
  }),
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const { token, error } = Route.useSearch();
  return <ResetPasswordPage token={token} invalidReason={error} />;
}
