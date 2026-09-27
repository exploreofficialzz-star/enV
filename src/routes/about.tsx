import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";
export const Route = createFileRoute("/about")({ component: () => <InfoPage title="About enV"><p>enV is a focused collection of practical browser-first tools.</p></InfoPage> });
