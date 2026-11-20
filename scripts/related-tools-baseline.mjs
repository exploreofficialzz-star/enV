/**
 * Compare related-tool integrity counts with a reviewed baseline while allowing
 * explicit, reasoned exceptions for intentionally isolated active tools.
 */
export function evaluateRelatedToolsBaseline(observedCounts, baselineDocument, toolsById) {
  const exceptions = Array.isArray(baselineDocument?.noRelatedExceptions)
    ? baselineDocument.noRelatedExceptions
    : [];
  const errors = [];
  const validExceptionIds = new Set();

  for (const [index, exception] of exceptions.entries()) {
    const id = typeof exception?.id === "string" ? exception.id.trim() : "";
    const reason = typeof exception?.reason === "string" ? exception.reason.trim() : "";
    if (!id || !reason) {
      errors.push(`noRelatedExceptions[${index}] must include a non-empty id and reason`);
      continue;
    }
    if (validExceptionIds.has(id)) {
      errors.push(`duplicate noRelated exception: ${id}`);
      continue;
    }
    const tool = toolsById.get(id);
    if (!tool || tool.status === "planned") {
      errors.push(`noRelated exception ${id} does not identify an active registry tool`);
      continue;
    }
    if ((tool.related ?? []).length !== 0) {
      errors.push(`noRelated exception ${id} is stale because the tool now has related links`);
      continue;
    }
    validExceptionIds.add(id);
  }

  const adjustedCounts = {
    ...observedCounts,
    noRelated: Math.max(0, observedCounts.noRelated - validExceptionIds.size),
  };
  const baselineCounts = baselineDocument?.counts ?? null;
  const violations = baselineCounts
    ? Object.entries(adjustedCounts).filter(([key, value]) => value > baselineCounts[key])
    : [
        ["dangling", observedCounts.dangling],
        ["self", observedCounts.self],
        ["toPlanned", observedCounts.toPlanned],
      ].filter(([, value]) => value > 0);

  return {
    adjustedCounts,
    exceptionIds: [...validExceptionIds],
    errors,
    violations,
    passed: errors.length === 0 && violations.length === 0,
  };
}
