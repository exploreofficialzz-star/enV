/**
 * Asset library manifest and license gate.
 *
 * Nothing enters the library unless its license is on the allow-list, its source is recorded, and (once bundled)
 * its file exists with a matching SHA-256. `scripts/check-scene-studio-assets.mjs` runs this and fails the build.
 * "planned" assets are listed so scenes and prompts can name them, but they are not shipped and cannot load.
 */
export type AssetKind = "model" | "hdri" | "texture" | "audio" | "font";
export type AssetStatus = "planned" | "bundled";

export interface LibraryAsset {
  /** Name scenes use, e.g. "library/tree_oak". */
  id: string;
  kind: AssetKind;
  /** Path relative to the library root. Required when status is "bundled". */
  file?: string;
  sha256?: string;
  bytes?: number;
  tags: string[];
  /** Animation clips inside a model, so the prompt can name them. */
  clips?: string[];
}

export interface AssetPack {
  id: string;
  name: string;
  author: string;
  source: string;
  license: string;
  /** Text to show in credits when the license requires attribution. */
  attribution?: string;
  status: AssetStatus;
  /** Required for bundled packs: where the license text can be re-checked and the date someone did. */
  licenseProof?: string;
  verifiedOn?: string;
  assets: LibraryAsset[];
}

export interface AssetManifest {
  version: 1;
  licenseAllowlist: string[];
  /** Allowed licenses that require attribution in credits. */
  attributionRequired: string[];
  packs: AssetPack[];
}

export interface ManifestProblem {
  pack?: string;
  asset?: string;
  message: string;
}

const SHA256 = /^[0-9a-f]{64}$/;
const ASSET_ID = /^library\/[a-z0-9][a-z0-9_]*$/;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export interface ManifestEnv {
  /** Returns the SHA-256 and byte size of a library file, or null when it does not exist. Injected so this stays pure. */
  inspectFile?(relativePath: string): { sha256: string; bytes: number } | null;
}

/** Returns every problem found; an empty list means the manifest passes the gate. */
export function checkManifest(manifest: AssetManifest, env: ManifestEnv = {}): ManifestProblem[] {
  const problems: ManifestProblem[] = [];
  const add = (message: string, pack?: string, asset?: string) => problems.push({ message, pack, asset });
  if (manifest.version !== 1) add(`Unsupported manifest version ${String(manifest.version)}.`);
  const allowed = new Set(manifest.licenseAllowlist);
  for (const l of manifest.attributionRequired) if (!allowed.has(l)) add(`attributionRequired lists "${l}", which is not on the allow-list.`);
  const packIds = new Set<string>();
  const assetIds = new Set<string>();
  for (const pack of manifest.packs) {
    if (packIds.has(pack.id)) add(`Duplicate pack id "${pack.id}".`, pack.id);
    packIds.add(pack.id);
    if (!allowed.has(pack.license)) add(`License "${pack.license}" is not on the allow-list (${manifest.licenseAllowlist.join(", ")}).`, pack.id);
    if (!/^https:\/\//.test(pack.source)) add(`Source must be an https link to where the pack was obtained.`, pack.id);
    if (!pack.author.trim()) add(`Author is missing.`, pack.id);
    if (manifest.attributionRequired.includes(pack.license) && !pack.attribution?.trim()) add(`License ${pack.license} requires attribution text.`, pack.id);
    if (pack.status === "bundled") {
      if (!pack.licenseProof || !/^https:\/\//.test(pack.licenseProof)) add(`Bundled packs need a licenseProof link someone can re-check.`, pack.id);
      if (!pack.verifiedOn || !/^\d{4}-\d{2}-\d{2}$/.test(pack.verifiedOn)) add(`Bundled packs need verifiedOn (YYYY-MM-DD).`, pack.id);
    }
    for (const a of pack.assets) {
      if (!ASSET_ID.test(a.id)) add(`Asset id "${a.id}" must look like library/name_with_underscores.`, pack.id, a.id);
      if (assetIds.has(a.id)) add(`Duplicate asset id "${a.id}".`, pack.id, a.id);
      assetIds.add(a.id);
      if (pack.status !== "bundled") continue;
      if (!a.file || !SAFE_FILE.test(a.file) || a.file.includes("..")) {
        add(`Bundled asset needs a safe relative file path.`, pack.id, a.id);
        continue;
      }
      if (!a.sha256 || !SHA256.test(a.sha256)) add(`Bundled asset needs a sha256.`, pack.id, a.id);
      if (env.inspectFile) {
        const info = env.inspectFile(a.file);
        if (!info) add(`File "${a.file}" is missing.`, pack.id, a.id);
        else {
          if (a.sha256 && info.sha256 !== a.sha256) add(`File "${a.file}" does not match its sha256.`, pack.id, a.id);
          if (a.bytes !== undefined && info.bytes !== a.bytes) add(`File "${a.file}" is ${info.bytes} bytes, manifest says ${a.bytes}.`, pack.id, a.id);
        }
      }
    }
  }
  return problems;
}

/** Credits text for every bundled pack whose license asks for attribution. */
export function creditsFor(manifest: AssetManifest, usedAssetIds: readonly string[]): string[] {
  const used = new Set(usedAssetIds);
  const lines: string[] = [];
  for (const p of manifest.packs) {
    if (p.status !== "bundled" || !manifest.attributionRequired.includes(p.license) || !p.attribution) continue;
    if (p.assets.some((a) => used.has(a.id))) lines.push(p.attribution);
  }
  return lines;
}

export function libraryLookup(manifest: AssetManifest) {
  const status = new Map<string, "bundled" | "planned">();
  for (const p of manifest.packs) for (const a of p.assets) status.set(a.id, p.status);
  return { statusOf: (name: string): "bundled" | "planned" | "unknown" => status.get(name) ?? "unknown" };
}

/** Bundled assets of a kind, for the "what can I use" list in the AI instructions. */
export function bundledAssets(manifest: AssetManifest, kind?: AssetKind): LibraryAsset[] {
  return manifest.packs.filter((p) => p.status === "bundled").flatMap((p) => p.assets).filter((a) => !kind || a.kind === kind);
}
