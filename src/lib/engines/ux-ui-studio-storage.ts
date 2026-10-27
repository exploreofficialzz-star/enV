/** Keep the first embedded asset inline and reference repeated copies in local drafts. */
const referencePrefix = "env-uxui-asset:";
const metadataKey = "studioAssetReferences";
const assetKeys = new Set(["fontDataUrl", "imageDataUrl", "imageOriginalDataUrl", "referenceDataUrl"]);
type Path = Array<string | number>;

export function packStudioProjectAssets<T extends object>(project: T): T {
  const seen = new Map<string, { id: string; path: Path }>();
  const paths: Record<string, Path> = {};
  function visit(value: unknown, path: Path, key = ""): unknown {
    if (path.length > 128) throw new Error("This project is nested too deeply to save.");
    if (assetKeys.has(key) && typeof value === "string" && value.startsWith("data:")) {
      const existing = seen.get(value);
      if (existing) { paths[existing.id] = existing.path; return referencePrefix + existing.id; }
      seen.set(value, { id: "asset-" + seen.size, path });
      return value;
    }
    if (Array.isArray(value)) return value.map((item, index) => visit(item, [...path, index]));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([name]) => name !== metadataKey).map(([name, item]) => [name, visit(item, [...path, name], name)]));
    return value;
  }
  const packed = visit(project, []) as T & Record<string, unknown>;
  if (Object.keys(paths).length) Object.assign(packed, { [metadataKey]: { version: 1, paths } });
  return packed;
}

/** Restore asset bytes before a draft reaches the editor, exporters or import normalizer. */
export function unpackStudioProjectAssets<T>(project: T): T {
  if (!project || typeof project !== "object" || !Object.hasOwn(project, metadataKey)) return project;
  const metadata = (project as Record<string, unknown>)[metadataKey] as { version?: number; paths?: Record<string, unknown> };
  if (metadata?.version !== 1 || !metadata.paths || typeof metadata.paths !== "object") throw new Error("The draft's asset references are invalid.");
  const assets = new Map<string, string>();
  for (const [id, path] of Object.entries(metadata.paths)) {
    if (!Array.isArray(path) || path.length > 128) throw new Error("The draft has an invalid asset path.");
    let value: unknown = project;
    for (const part of path) {
      if ((typeof part !== "string" && typeof part !== "number") || !value || typeof value !== "object" || !Object.hasOwn(value, part)) throw new Error("An embedded draft asset is missing.");
      value = (value as Record<string | number, unknown>)[part];
    }
    if (typeof value !== "string" || !value.startsWith("data:")) throw new Error("An embedded draft asset is unreadable.");
    assets.set(id, value);
  }
  function visit(value: unknown, depth = 0, key = ""): unknown {
    if (depth > 128) throw new Error("This project is nested too deeply to open.");
    if (assetKeys.has(key) && typeof value === "string" && value.startsWith(referencePrefix)) {
      const asset = assets.get(value.slice(referencePrefix.length));
      if (!asset) throw new Error("An embedded draft asset reference is missing.");
      return asset;
    }
    if (Array.isArray(value)) return value.map(item => visit(item, depth + 1));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([name]) => name !== metadataKey).map(([name, item]) => [name, visit(item, depth + 1, name)]));
    return value;
  }
  return visit(project) as T;
}
