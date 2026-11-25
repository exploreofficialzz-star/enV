import matrix from "../../apps/shared/native-execution-matrix.json";
import { getSearchableTools } from "@/lib/registry";
import type { ExecutionPath, PlatformId } from "@/lib/discovery-filters";

type NativeExecutionClass = "offline-native" | "backend-native" | "web-only";
type NativeExecutionRow = {
  id: string;
  status: string;
  android: NativeExecutionClass;
  ios: NativeExecutionClass;
};
type NativeExecutionMatrix = { tools: NativeExecutionRow[] };

const executionByToolId = new Map(
  ((matrix as NativeExecutionMatrix).tools ?? []).map((row) => [row.id, row] as const),
);
const searchableById = new Map(getSearchableTools().map((tool) => [tool.id, tool] as const));

function mapNativeClass(value: NativeExecutionClass | undefined): ExecutionPath | null {
  switch (value) {
    case "offline-native": return "native-device";
    case "backend-native": return "native-with-enV-service";
    case "web-only": return "web-only-browser-handoff";
    default: return null;
  }
}

/**
 * Matrix availability is a platform execution classification, not proof of successful
 * execution or physical-device acceptance for an individual tool. Virtual Developer
 * Studios are included because both native catalogues explicitly project those 14 records.
 */
export function discoveryAvailability(toolId: string, platform: PlatformId): ExecutionPath | null {
  const tool = searchableById.get(toolId);
  if (!tool || (tool.status !== "active" && tool.status !== "beta")) return null;
  if (platform === "web") return "web";
  if (tool.tags.includes("developer-studio")) return "native-device";

  const row = executionByToolId.get(toolId);
  if (!row || (row.status !== "active" && row.status !== "beta")) return null;
  return mapNativeClass(row[platform]);
}
