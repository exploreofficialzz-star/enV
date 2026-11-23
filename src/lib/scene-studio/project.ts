/**
 * Saving and reopening a Scene Studio project.
 *
 * A project is one .zip: `scene.json`, every uploaded file at its own name, and `project.json` listing each file's
 * size and SHA-256 so a damaged or edited project is noticed when it is reopened. The zip layout is the same one
 * `readBundle` accepts, so a project is also a valid "scene + files" zip.
 */
import { readBundle, writeZip } from "./bundle.ts";
import type { BundleIssue, BundleLimits, Deflate, Inflate } from "./bundle.ts";
import { sha256Hex } from "./sha256.ts";
import type { Scene, SceneIssue } from "./types.ts";

export const PROJECT_FORMAT = "scene-studio-project";
export const PROJECT_VERSION = 1;

export interface ProjectInput {
  name: string;
  sceneText: string;
  /** Uploaded files by the name the scene uses for them. */
  assets: ReadonlyMap<string, Uint8Array>;
}

interface ProjectManifest {
  format: typeof PROJECT_FORMAT;
  version: number;
  name: string;
  files: Record<string, { size: number; sha256: string }>;
}

const encoder = new TextEncoder();

export function buildManifest(input: ProjectInput): ProjectManifest {
  const sceneBytes = encoder.encode(input.sceneText);
  const files: ProjectManifest["files"] = { "scene.json": { size: sceneBytes.length, sha256: sha256Hex(sceneBytes) } };
  for (const name of [...input.assets.keys()].sort()) {
    const data = input.assets.get(name)!;
    files[name] = { size: data.length, sha256: sha256Hex(data) };
  }
  return { format: PROJECT_FORMAT, version: PROJECT_VERSION, name: input.name, files };
}

/** The project as zip bytes. Same input always gives the same bytes when `deflate` is not used. */
export async function saveProject(input: ProjectInput, deflate?: Deflate): Promise<Uint8Array> {
  if (input.assets.has("scene.json") || input.assets.has("project.json")) throw new Error('A file cannot be called "scene.json" or "project.json"; those names are used by the project itself.');
  const manifest = buildManifest(input);
  const entries = [
    { name: "scene.json", data: encoder.encode(input.sceneText) },
    { name: "project.json", data: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`) },
    ...[...input.assets].map(([name, data]) => ({ name, data })),
  ];
  return writeZip(entries, deflate);
}

export interface OpenedProject {
  ok: boolean;
  name: string;
  sceneText?: string;
  assets: Map<string, Uint8Array>;
  issues: BundleIssue[];
  /** True when project.json was present and every file matched it. A plain scene zip is `false` with no errors. */
  verified: boolean;
}

/**
 * Open a project zip (or any scene zip). Missing files, changed files and unlisted files come back as issues;
 * a zip without project.json is accepted as a plain scene zip.
 */
export async function openProject(bytes: Uint8Array, inflate: Inflate, limits?: BundleLimits): Promise<OpenedProject> {
  const bundle = await readBundle(bytes, inflate, limits);
  const issues = [...bundle.issues];
  const result: OpenedProject = { ok: bundle.ok, name: "Untitled scene", sceneText: bundle.sceneText, assets: bundle.assets, issues, verified: false };
  if (!bundle.ok) return result;

  const manifestBytes = bundle.projectInfo;
  if (!manifestBytes) return result;
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  } catch {
    issues.push({ severity: "warning", code: "project-info-unreadable", path: "project.json", message: "The project information file could not be read, so the files were not checked.", fix: "The scene and files were still opened. Save the project again to repair it." });
    return result;
  }
  const m = manifest as Partial<ProjectManifest> | null;
  if (!m || typeof m !== "object" || m.format !== PROJECT_FORMAT || typeof m.files !== "object" || m.files === null) {
    issues.push({ severity: "warning", code: "project-info-unreadable", path: "project.json", message: "project.json is not a Scene Studio project file, so the files were not checked.", fix: "The scene and files were still opened." });
    return result;
  }
  if (typeof m.name === "string" && m.name.trim() !== "") result.name = m.name.slice(0, 120);
  if (typeof m.version === "number" && m.version > PROJECT_VERSION) {
    issues.push({ severity: "warning", code: "project-newer", path: "project.json", message: "This project was saved by a newer version of Scene Studio. It was opened anyway, but some things may be missing.", fix: "Update Scene Studio to be sure everything is read." });
  }

  const actual = new Map<string, Uint8Array>(bundle.assets);
  actual.set(bundle.scenePath ?? "scene.json", encoder.encode(bundle.sceneText ?? ""));
  let allMatch = true;
  for (const [name, info] of Object.entries(m.files as Record<string, { size?: number; sha256?: string }>)) {
    const data = actual.get(name);
    if (!data) {
      allMatch = false;
      issues.push({ severity: "error", code: "project-file-missing", path: name, message: `"${name}" is part of this project but is not in the zip.`, fix: "Use the original project file, or upload that file again." });
    } else if (info?.sha256 !== sha256Hex(data) || info?.size !== data.length) {
      allMatch = false;
      issues.push({ severity: "error", code: "project-file-changed", path: name, message: `"${name}" is not the same as when the project was saved (it was edited or damaged).`, fix: "Use the original project file. To keep your edit, save the project again after opening it as a plain scene zip." });
    }
  }
  for (const name of actual.keys()) {
    if (!(name in (m.files as object))) {
      allMatch = false;
      issues.push({ severity: "warning", code: "project-file-extra", path: name, message: `"${name}" was added to the zip after the project was saved.`, fix: "It is used like any other file. Save the project again to include it." });
    }
  }
  result.verified = allMatch;
  result.ok = !issues.some((i) => i.severity === "error");
  return result;
}

/**
 * Warnings for uploaded files: a scene that names a file the zip does not contain, and files the scene never uses.
 * Library names ("library/…") are checked elsewhere, by checkAgainstRegistry.
 */
export function checkUploads(scene: Scene, available: ReadonlySet<string>): SceneIssue[] {
  const issues: SceneIssue[] = [];
  const used = new Set<string>();
  const need = (name: string | undefined, path: string) => {
    if (!name || name.startsWith("library/")) return;
    used.add(name);
    if (!available.has(name)) {
      issues.push({ severity: "warning", code: "missing-upload", path, message: `"${name}" is used by the scene but was not uploaded, so a placeholder is shown.`, fix: `Add "${name}" to the zip (or upload it), or change the scene to use a library asset.` });
    }
  };
  scene.objects.forEach((o, i) => {
    need(o.asset, `$.objects[${i}].asset`);
    need(o.material?.texture, `$.objects[${i}].material.texture`);
  });
  scene.audio.forEach((a, i) => need(a.asset, `$.audio[${i}].asset`));
  need(scene.environment.hdri, "$.environment.hdri");
  scene.layers.forEach((l, i) => need(l.asset, `$.layers[${i}].asset`));
  for (const name of [...available].sort()) {
    if (!used.has(name) && !/\.(txt|md)$/i.test(name)) {
      issues.push({ severity: "warning", code: "unused-upload", path: name, message: `"${name}" was uploaded but the scene does not use it.`, fix: "Remove it from the zip, or add an object, layer or audio track that uses it." });
    }
  }
  return issues;
}
