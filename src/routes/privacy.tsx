import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";
export const Route = createFileRoute("/privacy")({ component: () => <InfoPage title="Privacy"><p>Client-side tools process your inputs in the browser whenever possible.</p></InfoPage> });
