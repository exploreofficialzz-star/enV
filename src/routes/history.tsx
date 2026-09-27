import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";
export const Route = createFileRoute("/history")({ component: () => <InfoPage title="History"><p>Recently used tools will appear here.</p></InfoPage> });
