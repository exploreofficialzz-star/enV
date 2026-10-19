import { createFileRoute } from "@tanstack/react-router";
import { TokenDashboard } from "@/components/billing/token-dashboard";

export const Route = createFileRoute("/tokens")({ component: TokenDashboard });
