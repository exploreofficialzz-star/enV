import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth/auth-page";
export const Route = createFileRoute("/signup")({ component: () => <AuthPage mode="sign-up" /> });
