import { createFileRoute } from "@tanstack/react-router";
import { PlatformLanding } from "@/components/platform/platform-landing";
import { seoPageHead, pageSchema } from "@/lib/seo-metadata";

export const Route = createFileRoute("/platform/ios")({
  head: () => seoPageHead({
    title: "enV for iOS | Native App and Web Tool Handoff",
    description: "Learn how enV separates native iOS tools from Web-only tools. Native-ready features continue inside the iOS app, while Web-only tools open in your iOS system browser.",
    path: "/platform/ios",
    structuredData: pageSchema("enV for iOS", "Learn how native iOS tools and Web-only tool handoff work in enV.", "/platform/ios", "WebPage")
  }),
  component: IosPlatformLanding
});

function IosPlatformLanding() {
  return <PlatformLanding platform="ios" />;
}
