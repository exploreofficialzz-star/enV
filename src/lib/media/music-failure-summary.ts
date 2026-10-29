/** Compact, source-aware display for failed track downloads.
 * The original per-track diagnostics remain available in failed-downloads.txt.
 */
export type MusicDownloadFailure = { title: string; message: string };
export type MusicFailureGroup = { reason: string; titles: string[]; count: number };
export type MusicFailureSummary = { heading: string; total: number; groups: MusicFailureGroup[] };

export function shortMusicFailureReason(message: string): string {
  const raw = String(message || "").replace(/[\r\n\t]+/g, " ").trim();
  if (/audiomack supplied song metadata but its current audio resolver|audiomack.*(?:unable to extract audio url|unable to extract song slug|did not return a usable file url)/i.test(raw)) {
    return "Audiomack did not provide a downloadable audio file.";
  }
  if (/\b(?:DOWNLOAD_NOT_PERMITTED|AUTH_REQUIRED|PRIVATE_CONTENT)\b|does not permit downloading|downloads are disabled/i.test(raw)) {
    return "The source did not allow this download.";
  }
  if (/\b(?:RATE_LIMITED|SOURCE_CHALLENGE)\b|too many requests|captcha|bot check/i.test(raw)) {
    return "The source is limiting or challenging requests.";
  }
  if (/\b(?:NO_DOWNLOADABLE_FORMAT|FORMAT_UNAVAILABLE)\b|no downloadable format|no usable file url|unable to extract audio url/i.test(raw)) {
    return "No downloadable audio file was available.";
  }
  if (/\b(?:NETWORK_TIMEOUT|JOB_TIMEOUT)\b|timed? ?out/i.test(raw)) {
    return "The source timed out.";
  }
  if (/\b(?:FILE_TOO_LARGE|DURATION_TOO_LONG)\b|exceeds (?:the )?(?:limit|maximum|supported)/i.test(raw)) {
    return "The track exceeds the download limits.";
  }
  if (/\b(?:SOURCE_UNAVAILABLE|SERVER_CAPACITY)\b|could not reach|temporarily unavailable/i.test(raw)) {
    return "The music source is temporarily unavailable.";
  }
  const safe = raw.replace(/^[A-Z_]+:\s*/, "").replace(/https?:\/\/\S+/gi, "[source link]")
    .replace(/\s+/g, " ").trim();
  return safe.length > 130 ? safe.slice(0, 127) + "…" : safe || "The track could not be downloaded.";
}

export function summarizeMusicDownloadFailures(failures: MusicDownloadFailure[]): MusicFailureSummary {
  const grouped = new Map<string, MusicFailureGroup>();
  for (const failure of failures) {
    const reason = shortMusicFailureReason(failure.message);
    const title = String(failure.title || "Unknown track").replace(/[\r\n\t]+/g, " ").trim().slice(0, 120) || "Unknown track";
    const existing = grouped.get(reason);
    if (existing) {
      existing.count += 1;
      existing.titles.push(title);
    } else {
      grouped.set(reason, { reason, count: 1, titles: [title] });
    }
  }
  const groups = [...grouped.values()].sort((a, b) => b.count - a.count);
  const total = failures.length;
  return {
    heading: `${total} ${total === 1 ? "track" : "tracks"} could not be downloaded.`,
    total,
    groups,
  };
}
