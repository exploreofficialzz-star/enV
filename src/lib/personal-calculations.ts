export type PersonalFamily =
  | "budget" | "habit" | "goal" | "decision" | "routine" | "checklist"
  | "countdown" | "reminder" | "packing" | "shopping" | "meal" | "study"
  | "sleep" | "time" | "life-event";

export type PersonalResultItem = { label: string; value: string; primary?: boolean };

export function calculatePersonalResult(family: PersonalFamily, values: [number, number, number, number]): { items: PersonalResultItem[] } {
  const [x, y, z, e] = values;
  if (family === "budget") {
    const remaining = x - y;
    return { items: [
      { label: "Income", value: x.toFixed(2) }, { label: "Expenses", value: y.toFixed(2) },
      { label: "Remaining", value: remaining.toFixed(2), primary: true },
      { label: "Savings rate", value: `${x ? ((remaining / x) * 100).toFixed(1) : "0.0"}%` },
    ] };
  }
  if (family === "habit") return { items: [{ label: "Completed", value: String(x) }, { label: "Possible", value: String(y) }, { label: "Consistency", value: `${y ? ((x / y) * 100).toFixed(1) : "0.0"}%`, primary: true }] };
  if (family === "goal") {
    const months = Math.max(1, z);
    return { items: [{ label: "Current", value: x.toFixed(2) }, { label: "Target", value: y.toFixed(2) }, { label: "Gap", value: Math.max(0, y - x).toFixed(2) }, { label: "Required per month", value: `${(Math.max(0, y - x) / months).toFixed(2)}`, primary: true }] };
  }
  if (family === "decision") {
    const score = x * (y / 100) + z * (e / 100);
    return { items: [{ label: "Option A score", value: x.toFixed(2) }, { label: "Criterion A weight", value: `${y}%` }, { label: "Option B score", value: z.toFixed(2) }, { label: "Criterion B weight", value: `${e}%` }, { label: "Weighted result", value: score.toFixed(2), primary: true }] };
  }
  if (family === "routine" || family === "time") return { items: [{ label: "Block 1", value: `${x} min` }, { label: "Block 2", value: `${y} min` }, { label: "Block 3", value: `${z} min` }, { label: "Total", value: `${x + y + z} min`, primary: true }] };
  if (family === "checklist") return { items: [{ label: "Completed", value: String(x) }, { label: "Total", value: String(y) }, { label: "Completion", value: `${y ? ((x / y) * 100).toFixed(1) : "0.0"}%`, primary: true }] };
  if (family === "packing" || family === "shopping" || family === "meal") return { items: [{ label: "Items", value: String(x) }, { label: "Cost per item", value: y.toFixed(2) }, { label: "Budget", value: z.toFixed(2) }, { label: "Estimated total", value: (x * y).toFixed(2), primary: true }, { label: "Budget remaining", value: (z - x * y).toFixed(2) }] };
  if (family === "study") return { items: [{ label: "Study sessions", value: String(x) }, { label: "Minutes/session", value: String(y) }, { label: "Break minutes", value: String(z) }, { label: "Study time", value: `${x * y} min`, primary: true }] };
  if (family === "sleep") return { items: [{ label: "Sleep hours", value: x.toFixed(1) }, { label: "Wake time target", value: `${String(Math.floor(y)).padStart(2, "0")}:${String(Math.round((y % 1) * 60)).padStart(2, "0")}` }, { label: "Sleep debt vs 8h", value: `${Math.max(0, 8 - x).toFixed(1)} h` }] };
  if (family === "life-event") return { items: [{ label: "People", value: String(x) }, { label: "Cost per person", value: y.toFixed(2) }, { label: "Fixed cost", value: z.toFixed(2) }, { label: "Estimated total", value: (x * y + z).toFixed(2), primary: true }] };
  return { items: [{ label: "Value", value: x.toFixed(2), primary: true }] };
}
