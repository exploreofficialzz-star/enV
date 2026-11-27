export const REQUIRED_CALCULATOR_BROWSER_TOOL_IDS = Object.freeze([
  "science-gas-law-calculator",
  "science-molar-mass-calculator",
  "finance-irr-calculator",
]);

function validatePositiveIntegerOrInfinity(value, label) {
  if (value === Infinity) return;
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(label + " must be a positive integer or Infinity.");
  }
}

/**
 * Selects the exact stable IDs that a calculator browser run must exercise.
 * The same function is used by the browser runner and the central evidence
 * ledger so sample selection cannot drift between execution and ingestion.
 */
export function selectCalculatorBrowserAuditToolIds(activeToolIds, {
  sampleSize = Infinity,
  limit = Infinity,
  onlyIds = null,
  mandatoryToolIds = REQUIRED_CALCULATOR_BROWSER_TOOL_IDS,
} = {}) {
  if (!Array.isArray(activeToolIds) || activeToolIds.length === 0) {
    throw new TypeError("activeToolIds must be a non-empty array.");
  }
  if (activeToolIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new TypeError("Every active calculator tool ID must be a non-empty string.");
  }
  if (new Set(activeToolIds).size !== activeToolIds.length) {
    throw new Error("Active calculator tool IDs must be unique.");
  }
  validatePositiveIntegerOrInfinity(sampleSize, "sampleSize");
  validatePositiveIntegerOrInfinity(limit, "limit");

  let selected;
  if (onlyIds !== null && onlyIds !== undefined) {
    if (!Array.isArray(onlyIds) || onlyIds.length === 0) {
      throw new TypeError("onlyIds must be a non-empty array when supplied.");
    }
    if (onlyIds.some((id) => typeof id !== "string" || !id.trim())) {
      throw new TypeError("Every explicit calculator tool ID must be a non-empty string.");
    }
    if (new Set(onlyIds).size !== onlyIds.length) {
      throw new Error("Explicit calculator tool IDs must not contain duplicates.");
    }
    const available = new Set(activeToolIds);
    const missing = onlyIds.filter((id) => !available.has(id));
    if (missing.length) {
      throw new Error("Unknown active calculator tool IDs: " + missing.join(", "));
    }
    const requested = new Set(onlyIds);
    selected = activeToolIds.filter((id) => requested.has(id));
  } else {
    const selectedIds = new Set();
    if (Number.isFinite(sampleSize) && sampleSize < activeToolIds.length) {
      for (let index = 0; index < sampleSize; index += 1) {
        selectedIds.add(activeToolIds[Math.floor((index * activeToolIds.length) / sampleSize)]);
      }
    } else {
      for (const id of activeToolIds) selectedIds.add(id);
    }

    const available = new Set(activeToolIds);
    const missingMandatory = mandatoryToolIds.filter((id) => !available.has(id));
    if (missingMandatory.length) {
      throw new Error("Required calculator browser tool IDs are missing from the active registry: " + missingMandatory.join(", "));
    }
    for (const id of mandatoryToolIds) selectedIds.add(id);
    selected = activeToolIds.filter((id) => selectedIds.has(id));
  }

  return selected.slice(0, Number.isFinite(limit) ? limit : undefined);
}
