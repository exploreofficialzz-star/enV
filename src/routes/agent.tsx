import { createFileRoute } from "@tanstack/react-router";
import { AssistantPage } from "@/routes/assistant";

/** Canonical AI Agent route; /assistant is retained for compatibility. */
export const Route = createFileRoute("/agent")({ component: AssistantPage });
