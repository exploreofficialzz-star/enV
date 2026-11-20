export type ToolAccessPreference = "ads" | "tokens";
export const TOOL_ACCESS_PREFERENCE_KEY = "env.ads.tool-access-preference.v1";
const TOOL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;

function storageKey(toolId: string): string | null {
  return TOOL_ID_PATTERN.test(toolId) ? `${TOOL_ACCESS_PREFERENCE_KEY}:${toolId}` : null;
}

export function getToolAccessPreference(toolId: string): ToolAccessPreference {
  if (typeof window === "undefined") return "ads";
  const key = storageKey(toolId);
  if (!key) return "ads";
  try {
    return window.localStorage.getItem(key) === "tokens" ? "tokens" : "ads";
  } catch {
    return "ads";
  }
}

export function setToolAccessPreference(toolId: string, value: ToolAccessPreference): boolean {
  if (typeof window === "undefined") return false;
  const key = storageKey(toolId);
  if (!key || (value !== "ads" && value !== "tokens")) return false;
  try {
    window.localStorage.setItem(key, value);
    return window.localStorage.getItem(key) === value;
  } catch {
    return false;
  }
}
