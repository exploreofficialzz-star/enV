import { createFileRoute } from "@tanstack/react-router";
import { PlatformLanding } from "@/components/platform/platform-landing";
import { seoPageHead, pageSchema } from "@/lib/seo-metadata";

export const Route = createFileRoute("/platform/android")({
  head: () => seoPageHead({
    title: "enV for Android | Native App and Web Tool Handoff",
    description: "Learn how enV separates native Android tools from Web-only tools. Native-ready features continue inside the Android app, while Web-only tools open in your Android system browser.",
    path: "/platform/android",
    structuredData: pageSchema("enV for Android", "Learn how native Android tools and Web-only tool handoff work in enV.", "/platform/android", "WebPage")
  }),
  component: AndroidPlatformLanding
});

function AndroidPlatformLanding() {
  return <PlatformLanding platform="android" />;
}
