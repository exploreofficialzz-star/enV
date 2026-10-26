/** Retry only transport/transient resolver failures, never permission or rate-limit denials. */
export function shouldRetryMusicDownload(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "") : "";
  if (["RATE_LIMITED", "AUTH_REQUIRED", "DOWNLOAD_NOT_PERMITTED", "SOURCE_CHALLENGE", "NO_DOWNLOADABLE_FORMAT", "UNSUPPORTED_SOURCE"].includes(code)) return false;
  if (["NETWORK_TIMEOUT", "SERVER_CAPACITY", "SEGMENT_FAILED"].includes(code)) return true;
  const temporary = /took too long to respond|timed? ?out|did not respond reliably|returned an empty or invalid json|returned an invalid metadata response|track resolver returned a server error or empty response|media api could not be reached|\bHTTP (?:502|503|504)\b/i;
  return (code === "" || code === "SOURCE_UNAVAILABLE" || code === "PROVIDER_ERROR") && temporary.test(message);
}

/** One bounded recovery attempt; callers never repeat authentication or source challenges. */
export async function downloadMusicWithSingleRetry<T>(
  action: () => Promise<T>,
  signal: AbortSignal,
  onRetry: () => void,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (signal.aborted || !shouldRetryMusicDownload(error)) throw error;
    onRetry();
    await wait(700);
    if (signal.aborted) throw new DOMException("Download cancelled.", "AbortError");
    return action();
  }
}
