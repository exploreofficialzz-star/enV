import { createFileRoute } from "@tanstack/react-router";
import { PlatformLanding } from "@/components/platform/platform-landing";

export const Route = createFileRoute("/platform/ios")({ component: IosPlatformLanding });

function IosPlatformLanding() {
  return <PlatformLanding platform="ios" />;
}
