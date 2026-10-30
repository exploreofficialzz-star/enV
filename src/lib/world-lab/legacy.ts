import { validateProject } from "@/lib/game-studio/project";
import { createLabObject, createWorldLabProject, type WorldLabProject } from "./model";

/** Explicit, read-only compatibility import. Never mutates or deletes legacy IndexedDB records. */
export function convertLegacyScene(raw: unknown): { project: WorldLabProject; warnings: string[] } {
  const old = validateProject(raw);
  const unsupported = old.objects.filter(object =>
    !["box", "sphere", "cylinder", "ground"].includes(object.kind)
    || (object.kind !== "ground" && (!object.visible || object.rotation.x !== 0 || object.rotation.y !== 0 || object.rotation.z !== 0)),
  );
  if (unsupported.length > 0 || old.assets.length > 0) {
    throw new Error("This old project contains imported assets, rotated or hidden geometry, or other details the new physical model cannot safely preserve. Export a backup in the original studio first. No old data was changed.");
  }
  const project = createWorldLabProject();
  project.name = old.name;
  const warnings: string[] = [
    "Imported geometry uses hypothetical default material density; it is not a validated material.",
    "Old gameplay, collisions, and player settings do not represent physical mechanics and were not imported.",
    "Old ground becomes a new representative test surface. The original project remains in its own storage.",
  ];
  project.objects = old.objects.filter(o => o.kind !== "ground").map(object => {
    const kind = object.kind as "box" | "sphere" | "cylinder";
    const dimensionsM = { ...object.scale };
    if (kind === "sphere" && (dimensionsM.x !== dimensionsM.y || dimensionsM.y !== dimensionsM.z))
      throw new Error("The old scene includes a non-spherical scaled sphere. Export it in the legacy studio instead; no data was changed.");
    const item = createLabObject(kind, object.position);
    item.id = object.id;
    item.name = object.name;
    item.dimensionsM = dimensionsM;
    item.color = object.color;
    item.behavior = "static";
    return item;
  });
  return { project, warnings };
}
