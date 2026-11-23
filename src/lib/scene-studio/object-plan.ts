/**
 * Decides, for every object in a scene, what the renderer should actually build: which builder, which settings,
 * and whether a model file is available. Everything that can go wrong here (a type that does not exist, a model
 * that was not uploaded, a library asset that is not bundled yet) turns into a plain-words note and a safe
 * stand-in, never an error, so the preview always shows something and says why.
 */
import { FALLBACK_TYPE, getBuilder, resolveParams } from "./registry.ts";
import type { LibraryLookup } from "./registry.ts";
import type { ParamValue, Scene } from "./types.ts";

export type AssetSource =
  | { kind: "none" }
  /** A model/picture/sound file that can be loaded now. */
  | { kind: "library" | "upload"; name: string; available: true }
  /** Named, but its file is not here: the stand-in is drawn instead. */
  | { kind: "library" | "upload"; name: string; available: false };

export interface ObjectPlan {
  id: string;
  /** What the scene asked for. */
  requestedType: string;
  /** What will be built (the fallback box when the type is unknown). */
  type: string;
  params: Record<string, ParamValue>;
  asset: AssetSource;
  /** True when a stand-in is drawn because something is missing. */
  standIn: boolean;
  /** Plain-words explanations for the person ("hero.glb was not uploaded, so a stand-in is shown"). */
  notes: string[];
}

export interface PlanEnvironment {
  library?: LibraryLookup;
  /** Names of uploaded files. */
  uploads: ReadonlySet<string>;
}

export function assetSource(name: string | undefined, env: PlanEnvironment): AssetSource {
  if (!name) return { kind: "none" };
  if (name.startsWith("library/")) return { kind: "library", name, available: env.library?.statusOf(name) === "bundled" };
  return { kind: "upload", name, available: env.uploads.has(name) };
}

export function planObjects(scene: Pick<Scene, "objects">, env: PlanEnvironment): ObjectPlan[] {
  return scene.objects.map((o) => {
    const notes: string[] = [];
    const spec = getBuilder(o.type);
    const type = spec ? o.type : FALLBACK_TYPE;
    if (!spec) notes.push(`"${o.type}" is not a type Scene Studio can build, so a plain box stands in for "${o.id}".`);
    let standIn = !spec;

    const asset = assetSource(o.asset, env);
    if (asset.kind !== "none" && !asset.available) {
      const why = asset.kind === "library" ? "is planned but not installed yet" : "was not uploaded";
      const instead = type === "asset" ? "a stand-in box is shown" : `the built-in ${type} is shown instead`;
      notes.push(`"${asset.name}" ${why}, so ${instead}.`);
      if (type === "asset") standIn = true;
    }
    if (type === "asset" && asset.kind === "none") {
      notes.push(`"${o.id}" has no model name, so a stand-in box is shown.`);
      standIn = true;
    }
    return { id: o.id, requestedType: o.type, type, params: resolveParams(type, o.params), asset, standIn, notes };
  });
}

/** All the notes of a plan in one list, for the "things to know" panel. */
export const planNotes = (plans: readonly ObjectPlan[]): string[] => plans.flatMap((p) => p.notes);
