import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";
export const Route = createFileRoute("/contact")({ component: () => <InfoPage title="Contact"><p>For feedback about this toolkit, use the project repository’s issue tracker.</p></InfoPage> });
