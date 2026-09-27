import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/layout/info-page";
export const Route = createFileRoute("/responsible-use")({ component: () => <InfoPage title="Responsible use"><p>Do not use generated content to deceive, impersonate, or present estimates as professional advice.</p></InfoPage> });
