import availabilityIndex from "@/data/discovery-availability.json";
import { getSearchableTools } from "@/lib/registry";
import type { ExecutionPath, PlatformId } from "@/lib/discovery-filters";

type NativeClassCode = "d" | "s" | "w";
type CompactAvailabilityRow = [id: string, android: NativeClassCode, ios: NativeClassCode];
type CompactAvailabilityIndex = {
  schemaVersion: number;
  rows: CompactAvailabilityRow[];
};

const executionByToolId = new Map(
  ((availabilityIndex as unknown as CompactAvailabilityIndex).rows ?? []).map(
    ([id, android, ios]) => [id, { android, ios }] as const,
  ),
);
const searchableById = new Map(getSearchableTools().map((tool) => [tool.id, tool] as const));

function mapNativeClass(value: NativeClassCode | undefined): ExecutionPath | null {
  switch (value) {
    case "d": return "native-device";
    case "s": return "native-with-enV-service";
    case "w": return "web-only-browser-handoff";
    default: return null;
  }
}

/**
 * Availability is sourced from the native execution matrix through a compact generated
 * index. It is a platform classification, not proof of successful execution or physical-
 * device acceptance for an individual tool. Virtual Developer Studios are included because
 * both native catalogues explicitly project those Studio records.
 */
export function discoveryAvailability(toolId: string, platform: PlatformId): ExecutionPath | null {
  const tool = searchableById.get(toolId);
  if (!tool || (tool.status !== "active" && tool.status !== "beta")) return null;
  if (platform === "web") return "web";
  if (tool.tags.includes("developer-studio")) return "native-device";

  const row = executionByToolId.get(toolId);
  if (!row) return null;
  return mapNativeClass(row[platform]);
}
