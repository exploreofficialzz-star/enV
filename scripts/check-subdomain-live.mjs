import assert from "node:assert/strict";

const publicChecks = [
  { host: "android.envtools.store", marker: "Open enV tools in your Android browser" },
  { host: "ios.envtools.store", marker: "Open enV tools in your iOS browser" },
  { host: "feedback.envtools.store", marker: "Send feedback" },
  { host: "updates.envtools.store", marker: "Updates and release notes" },
];

const failures = [];
for (const check of publicChecks) {
  try {
    const response = await fetch("https://" + check.host + "/", {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    const contentType = response.headers.get("content-type") ?? "";
    const html = await response.text();
    const hasMarker = html.includes(check.marker);
    if (response.status !== 200) failures.push(check.host + ": expected HTTP 200, received " + response.status);
    if (!contentType.includes("text/html")) failures.push(check.host + ": expected HTML, received " + (contentType || "no content type"));
    if (!hasMarker) failures.push(check.host + ": expected landing-page content was not rendered");
    console.log(check.host + ": HTTP " + response.status + "; expected content=" + hasMarker);
  } catch (error) {
    failures.push(check.host + ": " + (error instanceof Error ? error.message : String(error)));
  }
}

try {
  const dashboard = await fetch("https://userbehavior.envtools.store/", {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  if (dashboard.status === 200) {
    const html = await dashboard.text();
    if (!html.includes("Developer analytics")) {
      failures.push("userbehavior.envtools.store: enabled developer sign-in page was not rendered");
    }
    if (html.includes("analytics dashboard is not enabled") || html.includes("not enabled on this deployment")) {
      failures.push("userbehavior.envtools.store: dashboard UI is disabled in the production Web build");
    }
    const summary = await fetch("https://userbehavior.envtools.store/api/analytics/summary", {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    if (![401, 403].includes(summary.status)) {
      failures.push("userbehavior.envtools.store: enabled dashboard must reject unauthenticated summary access with 401/403; received HTTP " + summary.status);
    }
    console.log("userbehavior.envtools.store: dashboard HTTP " + dashboard.status + "; unauthenticated summary HTTP " + summary.status);
  } else if ([301, 302, 303, 307, 308, 401, 403].includes(dashboard.status)) {
    console.log("userbehavior.envtools.store: external private-host gate responded with HTTP " + dashboard.status);
  } else {
    failures.push("userbehavior.envtools.store: dashboard must be enabled behind its login or external host protection; received HTTP " + dashboard.status);
  }
} catch (error) {
  failures.push("userbehavior.envtools.store: " + (error instanceof Error ? error.message : String(error)));
}

if (failures.length) {
  for (const failure of failures) console.error("FAIL: " + failure);
  process.exit(1);
}
console.log("Live subdomain smoke checks passed.");
