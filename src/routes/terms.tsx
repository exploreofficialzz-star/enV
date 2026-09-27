import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";
export const Route = createFileRoute("/terms")({ component: () => <InfoPage title="Terms"><p>Use the toolkit responsibly and verify outputs before relying on them.</p></InfoPage> });
