export type Action = "checker" | "generator" | "simulator" | "helper" | "preview";

export type Kind = "contrast" | "color-blindness" | "font-size" | "line-height" | "text-readability" | "alt-text" | "aria" | "form" | "keyboard-navigation" | "focus-state" | "accessible-color" | "motion";

const ACTIONS: Action[] = ["checker", "generator", "simulator", "helper", "preview"];
const COLORS = ["#000000", "#ffffff", "#1d4ed8", "#047857", "#b91c1c", "#7c3aed", "#92400e"];

export function parseToolId(toolId: string): { kind: Kind; action: Action } {
  const action = ACTIONS.find((x) => toolId.endsWith(`-${x}`)) ?? "checker";
  const prefix = toolId.slice(0, -(action.length + 1));
  const kind = prefix as Kind;
  return { kind, action };
}
