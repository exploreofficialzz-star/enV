import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth/auth-page";
export const Route = createFileRoute("/login")({ component: () => <AuthPage mode="sign-in" /> });
