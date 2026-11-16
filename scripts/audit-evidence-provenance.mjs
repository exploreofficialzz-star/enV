const SHA_PATTERN = /^[a-f0-9]{40}$/i;

/**
 * Classify whether audit evidence belongs to the source revision being audited.
 * Legacy checked-in evidence may use fallbackCommit, but it is never treated as
 * current unless its full SHA matches currentCommit exactly.
 */
export function classifyAuditEvidenceCommit({
  testedCommit,
  fallbackCommit = null,
  currentCommit = null,
} = {}) {
  const evidenceCommit = typeof testedCommit === "string" && testedCommit.trim()
    ? testedCommit.trim()
    : typeof fallbackCommit === "string" && fallbackCommit.trim()
      ? fallbackCommit.trim()
      : null;
  const activeCommit = typeof currentCommit === "string" && currentCommit.trim()
    ? currentCommit.trim()
    : null;

  if (!evidenceCommit) {
    return { classification: "unverified", testedCommit: null, currentCommit: activeCommit, reason: "tested-commit-missing" };
  }
  if (!SHA_PATTERN.test(evidenceCommit)) {
    return { classification: "invalid", testedCommit: evidenceCommit, currentCommit: activeCommit, reason: "tested-commit-is-not-a-full-git-sha" };
  }
  if (!activeCommit) {
    return { classification: "unverified", testedCommit: evidenceCommit, currentCommit: null, reason: "current-commit-unavailable" };
  }
  if (!SHA_PATTERN.test(activeCommit)) {
    return { classification: "invalid", testedCommit: evidenceCommit, currentCommit: activeCommit, reason: "current-commit-is-not-a-full-git-sha" };
  }
  if (evidenceCommit.toLowerCase() !== activeCommit.toLowerCase()) {
    return { classification: "historical", testedCommit: evidenceCommit, currentCommit: activeCommit, reason: "tested-commit-does-not-match-current-commit" };
  }
  return { classification: "current", testedCommit: evidenceCommit, currentCommit: activeCommit, reason: null };
}
