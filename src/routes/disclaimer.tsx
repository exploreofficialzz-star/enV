import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";
export const Route = createFileRoute("/disclaimer")({ component: () => <InfoPage title="Disclaimer"><p>Outputs are provided for general informational and utility purposes.</p></InfoPage> });
