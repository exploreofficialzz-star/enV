import { createFileRoute } from "@tanstack/react-router";
import { FeedbackRequestPage } from "@/components/feedback/feedback-request-page";

export const Route = createFileRoute("/suggest-tool")({ component: SuggestTool });

function SuggestTool() {
  return <FeedbackRequestPage kind="suggestion" />;
}
