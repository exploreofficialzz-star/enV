import { createFileRoute } from "@tanstack/react-router";
import { FeedbackRequestPage } from "@/components/feedback/feedback-request-page";

export const Route = createFileRoute("/report-bugs")({ component: ReportBugs });

function ReportBugs() {
  return <FeedbackRequestPage kind="bug" />;
}
