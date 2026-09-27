import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";
export const Route = createFileRoute("/favorites")({ component: () => <InfoPage title="Saved tools"><p>Your saved tools will appear here.</p></InfoPage> });
