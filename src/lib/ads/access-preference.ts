export type ToolAccessPreference = "ads" | "tokens";
export const TOOL_ACCESS_PREFERENCE_KEY = "env.ads.tool-access-preference.v1";

export function getToolAccessPreference(): ToolAccessPreference {
  if (typeof window === "undefined") return "ads";
  try {
    return window.localStorage.getItem(TOOL_ACCESS_PREFERENCE_KEY) === "tokens" ? "tokens" : "ads";
  } catch {
    return "ads";
  }
}

export function setToolAccessPreference(value: ToolAccessPreference): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(TOOL_ACCESS_PREFERENCE_KEY, value);
    return window.localStorage.getItem(TOOL_ACCESS_PREFERENCE_KEY) === value;
  } catch {
    return false;
  }
}
