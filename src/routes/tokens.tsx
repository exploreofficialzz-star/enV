import { createFileRoute } from "@tanstack/react-router";
import { TokenDashboard } from "./token-dashboard";

export const Route = createFileRoute("/tokens")({ component: TokenDashboard });
