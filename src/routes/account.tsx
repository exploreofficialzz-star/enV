import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";
export const Route = createFileRoute("/account")({ component: () => <InfoPage title="Account"><p>No account is required for the browser toolkit.</p></InfoPage> });
