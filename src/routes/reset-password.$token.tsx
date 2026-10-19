import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/components/auth/reset-password-page";
export const Route = createFileRoute("/reset-password/$token")({
  component: () => {
    const { token } = Route.useParams();
    return <ResetPasswordPage token={token} />;
  },
});
