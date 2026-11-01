import type { EngineRef } from "../../types/tool.ts";

export type DesignExplorerGroupId = "color" | "effects" | "components" | "shapes" | "accessibility";

const CSS_FAMILY_GROUP: Record<string, DesignExplorerGroupId> = {
  gradient: "effects",
  shadow: "effects",
  border: "effects",
  glass: "effects",
  neomorph: "effects",
  noise: "effects",
  button: "components",
  card: "components",
  badge: "components",
  input: "components",
  avatar: "components",
  pattern: "shapes",
  blob: "shapes",
  wave: "shapes",
};

/** Map generated catalog entries into the same groups as the curated Design tools. */
export function getGeneratedDesignGroup(engine: EngineRef): DesignExplorerGroupId | null {
  if (engine.type === "color") return "color";
  if (engine.type !== "cssgen") return null;
  const family = engine.op.split(":")[0];
  return CSS_FAMILY_GROUP[family] ?? null;
}
