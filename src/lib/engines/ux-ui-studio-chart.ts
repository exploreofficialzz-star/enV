export type UxUiStudioChartPoint = { label: string; value: number };
export type UxUiStudioChartSpec = { title: string; points: UxUiStudioChartPoint[]; invalidRows: number };

/** Saved, cross-platform format: title on row 1; each remaining row is Label: value. */
export function parseUxUiStudioChartData(source: string): UxUiStudioChartSpec {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title = lines[0] || "Untitled chart";
  const points: UxUiStudioChartPoint[] = [];
  let invalidRows = 0;
  const rowPattern = /^(.+?)\s*[:,=]\s*(\+?(?:\d+(?:\.\d*)?|\.\d+))$/;
  for (const line of lines.slice(1)) {
    const match = rowPattern.exec(line);
    const label = match?.[1]?.trim() ?? "";
    const value = match ? Number(match[2]) : Number.NaN;
    if (!label || !Number.isFinite(value) || value < 0 || points.length >= 8) {
      invalidRows += 1;
      continue;
    }
    points.push({ label, value });
  }
  return { title, points, invalidRows };
}
