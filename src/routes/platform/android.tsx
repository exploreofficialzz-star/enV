import { createFileRoute } from "@tanstack/react-router";
import { PlatformLanding } from "@/components/platform/platform-landing";

export const Route = createFileRoute("/platform/android")({ component: AndroidPlatformLanding });

function AndroidPlatformLanding() {
  return <PlatformLanding platform="android" />;
}
