export const DEPLOYMENT_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
export const DEPLOYMENT_POLL_INTERVAL_MS = 5_000;
export const DEPLOYMENT_REQUEST_TIMEOUT_MS = 10_000;

function readHomepageMetadata(html) {
  const head = html.match(/<head\\b[^>]*>([\\s\\S]*?)<\\/head>/i)?.[1] ?? "";
  const title = head.match(/<title\\b[^>]*>([\\s\\S]*?)<\\/title>/i)?.[1]
    ?.replace(/<[^>]+>/g, "").trim() ?? "";
  const buildShaTag = [...head.matchAll(/<meta\\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => /\\bname\\s*=\\s*(?:"env-build-sha"|'env-build-sha')/i.test(tag));
  const content = buildShaTag?.match(/\\bcontent\\s*=\\s*(?:"([^"]*)"|'([^']*)')/i);
  return { title, buildSha: content?.[1] ?? content?.[2] ?? "" };
}

export async function waitForHomepageDeployment({
  origin,
  expectedTitle,
  expectedSha = "",
  fetchImpl = fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  timeoutMs = DEPLOYMENT_WAIT_TIMEOUT_MS,
  pollIntervalMs = DEPLOYMENT_POLL_INTERVAL_MS,
  requestTimeoutMs = DEPLOYMENT_REQUEST_TIMEOUT_MS,
  requestHeaders = {},
}) {
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let last = { status: 0, title: "", buildSha: "", url: origin + "/" };

  while (now() < deadline) {
    const remainingMs = deadline - now();
    attempts += 1;
    try {
      const response = await fetchImpl(origin + "/", {
        redirect: "follow",
        headers: requestHeaders,
        signal: AbortSignal.timeout(Math.max(1, Math.min(requestTimeoutMs, remainingMs))),
      });
      const html = await response.text();
      const metadata = readHomepageMetadata(html);
      last = { status: response.status, ...metadata, url: response.url || origin + "/" };
      const matchingBuild = expectedSha ? metadata.buildSha === expectedSha : metadata.title === expectedTitle;
      if (response.status === 200 && metadata.title === expectedTitle && matchingBuild) {
        return { matched: true, last, attempts, elapsedMs: now() - startedAt };
      }
    } catch (error) {
      last = { status: 0, title: "", buildSha: "", url: origin + "/", error: String(error) };
    }

    const waitMs = Math.min(pollIntervalMs, Math.max(0, deadline - now()));
    if (waitMs > 0) await sleepImpl(waitMs);
  }

  return { matched: false, last, attempts, elapsedMs: now() - startedAt };
}
