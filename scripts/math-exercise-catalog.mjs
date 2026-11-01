// Script-side reader for the user-facing labels already defined by the math exercise engine.
// Keep generated catalogue copy aligned with the actual input/result labels; never expose
// implementation keys such as a, b, c, rho or deltaT as public tool names.

/**
 * @param {string} source
 * @returns {Map<string, { name: string, targetLabels: Record<string, string> }>}
 */
export function parseMathExerciseCatalog(source) {
  const specs = new Map();
  const pattern = /\{\s*key:"([^"]+)",\s*name:"([^"]+)",\s*fields:\[([\s\S]*?)\],\s*formula:/g;
  for (const match of source.matchAll(pattern)) {
    const [, key, name, fieldsSource] = match;
    const targetLabels = {};
    for (const field of fieldsSource.matchAll(/(?:f|sel)\("([^"]+)","([^"]+)"/g)) {
      targetLabels[field[1]] = field[2];
    }

    // The result label can intentionally differ from the input label (for example,
    // a percentage score's result is Percentage while its input field is Percent).
    const labelsStart = source.indexOf("labels:{", match.index);
    const solveStart = source.indexOf("solve:{", match.index);
    if (labelsStart >= 0 && solveStart > labelsStart) {
      const labelsEnd = source.indexOf("}, solve:{", labelsStart);
      if (labelsEnd >= 0 && labelsEnd < solveStart + 8) {
        const labelsSource = source.slice(labelsStart + "labels:{".length, labelsEnd);
        for (const label of labelsSource.matchAll(/([A-Za-z_$][\w$]*):"([^"]+)"/g)) {
          targetLabels[label[1]] = label[2];
        }
      }
    }

    if (specs.has(key)) throw new Error(\`Duplicate math exercise spec: \${key}\`);
    specs.set(key, { name, targetLabels });
  }
  return specs;
}

/** @param {Map<string, { name: string, targetLabels: Record<string, string> }>} specs @param {string} key @param {string} target */
export function mathExercisePresentation(specs, key, target) {
  const spec = specs.get(key);
  if (!spec) throw new Error(\`Missing math exercise presentation metadata for \${key}.\`);
  const targetLabel = spec.targetLabels[target];
  if (!targetLabel) throw new Error(\`Missing human-readable label for math exercise target \${key}.\${target}.\`);
  return { name: spec.name, targetLabel };
}
