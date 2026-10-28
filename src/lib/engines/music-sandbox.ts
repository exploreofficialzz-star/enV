/** Editable master records. Musical labels are always supplied and reviewed by people. */
export const SANDBOX_MB = 1024 * 1024;
export const SANDBOX_LIMITS = {
  fileBytes: 40 * SANDBOX_MB,
  packageBytes: 80 * SANDBOX_MB,
  expandedBytes: 160 * SANDBOX_MB,
  batchSongs: 50,
  zipEntries: 600,
  exportBytes: 78 * SANDBOX_MB,
} as const;
export const SANDBOX_LICENSES = ["owned", "written permission", "CC-BY", "royalty-free"] as const;
export const SANDBOX_TAG_FIELDS = [
  "language",
  "mood",
  "theme",
  "setting",
  "vocals",
  "flow",
  "instruments",
  "standout",
] as const;
export type SandboxListField = (typeof SANDBOX_TAG_FIELDS)[number];
export interface SandboxTags {
  id: string;
  genre: string;
  sub_style: string;
  language: string[];
  tempo_bpm: number | null;
  tempo_band: string;
  time_signature: string;
  key: string;
  duration_seconds: number | null;
  energy: string;
  mood: string[];
  theme: string[];
  setting: string[];
  vocals: string[];
  flow: string[];
  instruments: string[];
  standout: string[];
  descriptions: string[];
  license: string;
  source: string;
}
export interface SandboxAudio {
  filename: string;
  extension: string;
  size: number;
  format: string;
  sampleRate: number | null;
  channels: number | null;
  bitDepth: number | null;
}
export interface SandboxTrack {
  key: string;
  folderId: string;
  title: string;
  tags: SandboxTags;
  lyrics: string;
  instrumental: boolean;
  licenseStatus: "pending" | "cleared" | "not cleared";
  reviewed: boolean;
  createdAt: string;
  updatedAt: string;
  audio: SandboxAudio | null;
  custom: Record<string, unknown>;
  provenance: Record<string, "measured" | "imported" | "edited">;
  notes: string;
}
export interface SandboxFolder {
  key: string;
  name: string;
  parentId: string | null;
  genre: string;
  subStyle: string;
  maxSongs: number;
  maxMB: number;
  notes: string;
  createdAt: string;
}
export interface SandboxSettings {
  key: "workspace";
  name: string;
  vocabulary: Record<string, string[]>;
}
export interface SandboxWorkspace {
  folders: SandboxFolder[];
  tracks: SandboxTrack[];
  settings: SandboxSettings;
}
export const SANDBOX_VOCABULARY: Record<string, string[]> = {
  genre: [
    "Afrobeats",
    "Afro-fusion",
    "Hip hop",
    "Jazz",
    "Electronic",
    "Folk",
    "Classical",
    "Gospel",
    "Highlife",
    "Reggae",
    "Pop",
    "Traditional",
  ],
  language: [
    "English",
    "Pidgin",
    "Yoruba",
    "Igbo",
    "Hausa",
    "Spanish",
    "French",
    "Arabic",
    "Hindi",
    "Japanese",
  ],
  mood: ["party", "romantic", "relaxed", "confident", "emotional", "dark", "aggressive", "joyful"],
  theme: ["love", "celebration", "success", "hustle", "heartbreak", "faith", "struggle"],
  setting: ["club", "dance floor", "wedding", "radio", "chill-out", "ceremony", "festival"],
  vocals: [
    "male lead",
    "female lead",
    "duet",
    "group chorus",
    "call-and-response",
    "smooth sing-song",
    "airy",
    "raspy",
    "soft",
  ],
  flow: ["fast chopped flow", "melodic sing-rap", "slow laid-back flow", "aggressive flow"],
  instruments: [
    "guitar",
    "piano",
    "shaker",
    "synth bass",
    "log drum",
    "808",
    "conga",
    "brass",
    "ogene",
    "igba",
    "ekwe",
    "udu",
    "talking drum",
  ],
  standout: ["call-and-response chorus", "sparse production", "talking drum break"],
};
export const sandboxSlug = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 100) || "untitled";
export const sandboxTags = (s: string): string[] => [
  ...new Set(
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];
export const sandboxStem = (s: string): string =>
  s.replace(
    /\.(tags\.json|lyrics\.txt|caption\.txt|mp3|wav|flac|m4a|ogg|aac|aiff|aif|opus|txt)$/i,
    "",
  );
export const sandboxBytes = (n: number): string =>
  n >= SANDBOX_MB ? `${(n / SANDBOX_MB).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
export const sandboxDuration = (n: number | null): string =>
  n == null ? "—" : `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
export function newSandboxFolder(name: string, parentId: string | null = null): SandboxFolder {
  return {
    key: crypto.randomUUID(),
    name,
    parentId,
    genre: "",
    subStyle: "",
    maxSongs: 100,
    maxMB: 250,
    notes: "",
    createdAt: new Date().toISOString(),
  };
}
export function newSandboxTrack(folder: SandboxFolder, id: string, title = id): SandboxTrack {
  return {
    key: crypto.randomUUID(),
    folderId: folder.key,
    title,
    tags: {
      id,
      genre: folder.genre,
      sub_style: folder.subStyle,
      language: [],
      tempo_bpm: null,
      tempo_band: "",
      time_signature: "",
      key: "",
      duration_seconds: null,
      energy: "",
      mood: [],
      theme: [],
      setting: [],
      vocals: [],
      flow: [],
      instruments: [],
      standout: [],
      descriptions: [],
      license: "",
      source: "",
    },
    lyrics: "",
    instrumental: false,
    licenseStatus: "pending",
    reviewed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    audio: null,
    custom: {},
    provenance: {},
    notes: "",
  };
}
export function sandboxFolderPath(
  folder: SandboxFolder | undefined,
  folders: SandboxFolder[],
): string {
  const parts: string[] = [],
    seen = new Set<string>();
  while (folder && !seen.has(folder.key)) {
    seen.add(folder.key);
    parts.unshift(folder.name);
    folder = folders.find((f) => f.key === folder!.parentId);
  }
  return parts.join("/");
}
export function sandboxDescendants(key: string, folders: SandboxFolder[]): Set<string> {
  const result = new Set([key]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders)
      if (f.parentId && result.has(f.parentId) && !result.has(f.key)) {
        result.add(f.key);
        changed = true;
      }
  }
  return result;
}
export function uniqueSandboxId(base: string, tracks: SandboxTrack[]): string {
  const used = new Set(tracks.map((t) => t.tags.id));
  let id = sandboxSlug(base),
    n = 2;
  while (used.has(id)) id = `${sandboxSlug(base).slice(0, 90)}_${String(n++).padStart(3, "0")}`;
  return id;
}
export function sandboxProblems(t: SandboxTrack): string[] {
  const p: string[] = [],
    g = t.tags;
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/.test(g.id))
    p.push(
      "Use a lowercase ID with letters, numbers, underscores or hyphens (up to 120 characters).",
    );
  if (!g.genre.trim()) p.push("Add a genre.");
  if (!g.language.length && !t.instrumental)
    p.push("Add the languages, or mark the song as instrumental.");
  if (t.licenseStatus !== "cleared" || !(SANDBOX_LICENSES as readonly string[]).includes(g.license))
    p.push("Confirm that the audio and lyrics are cleared, and choose a license.");
  if (!g.source.trim()) p.push("Record the permission and source.");
  if (!t.audio && !t.lyrics.trim()) p.push("Add audio or lyrics.");
  if (t.audio && !t.instrumental && !t.lyrics.trim())
    p.push("Add matching lyrics, or mark the song as instrumental.");
  if (t.audio && g.descriptions.filter((v) => v.trim()).length < 2)
    p.push("Write at least two descriptions of the sound.");
  if (
    g.tempo_bpm !== null &&
    (!Number.isFinite(g.tempo_bpm) || g.tempo_bpm < 1 || g.tempo_bpm > 400)
  )
    p.push("BPM must be between 1 and 400, or blank.");
  if (
    g.duration_seconds !== null &&
    (!Number.isFinite(g.duration_seconds) || g.duration_seconds <= 0)
  )
    p.push("Duration must be positive, or blank.");
  const limits: Partial<Record<SandboxListField, number>> = {
    mood: 3,
    theme: 3,
    setting: 3,
    vocals: 4,
    instruments: 5,
    standout: 3,
  };
  for (const [field, max] of Object.entries(limits))
    if (g[field as SandboxListField].length > max) p.push(`Keep ${field} to ${max} tags.`);
  if (g.descriptions.length > 3) p.push("Keep two or three descriptions.");
  return p;
}
export const sandboxReady = (t: SandboxTrack): boolean =>
  t.reviewed && sandboxProblems(t).length === 0;
export function sandboxCaption(t: SandboxTrack): string {
  const g = t.tags;
  // Identity, license, source, custom fields and technical controls never enter generated captions.
  return [
    g.genre,
    g.sub_style,
    g.tempo_band && `${g.tempo_band} tempo`,
    g.energy && `${g.energy} energy`,
    ...g.mood,
    ...g.theme,
    ...g.vocals,
    ...g.flow,
    ...g.instruments,
    ...g.standout,
    g.language.length && `sung in ${g.language.join(" and ")}`,
  ]
    .filter(Boolean)
    .join(", ");
}
export function sandboxTrainerLyrics(lyrics: string): string {
  return lyrics.replace(/\[([^\]]+)\]/g, (_, s: string) => {
    const base = s
      .split("|")[0]!
      .trim()
      .replace(/\s+\d+$/, "")
      .toLowerCase();
    const special: Record<string, string> = {
      "pre-chorus": "Pre-Chorus",
      "post-chorus": "Post-Chorus",
    };
    return `[${special[base] || base.charAt(0).toUpperCase() + base.slice(1)}]`;
  });
}
export function sandboxApplyTags(
  track: SandboxTrack,
  input: unknown,
  replaceCustom = false,
): SandboxTrack {
  if (!input || Array.isArray(input) || typeof input !== "object")
    throw new Error("Tags must be a JSON object.");
  const result = structuredClone(track);
  if (replaceCustom) result.custom = {};
  for (const [k, v] of Object.entries(input)) {
    if (["__proto__", "constructor", "prototype"].includes(k)) continue;
    if ((SANDBOX_TAG_FIELDS as readonly string[]).includes(k) || k === "descriptions") {
      if (!Array.isArray(v) || v.some((s) => typeof s !== "string"))
        throw new Error(`${k} must be a list of text values.`);
      Object.assign(result.tags, { [k]: v.map((s) => (s as string).trim()).filter(Boolean) });
    } else if (k === "tempo_bpm" || k === "duration_seconds") {
      if (v !== null && (typeof v !== "number" || !Number.isFinite(v)))
        throw new Error(`${k} must be a number or null.`);
      Object.assign(result.tags, { [k]: v });
    } else if (Object.hasOwn(result.tags, k)) {
      if (typeof v !== "string") throw new Error(`${k} must be text.`);
      Object.assign(result.tags, { [k]: v });
    } else result.custom[k] = v;
  }
  return result;
}
export function sandboxMasterTags(t: SandboxTrack): Record<string, unknown> {
  return { ...t.custom, ...t.tags };
}
export function sandboxManifest(tracks: SandboxTrack[], folders: SandboxFolder[]): string {
  // Escape spreadsheet formula prefixes without changing IDs or the master JSON.
  const cell = (v: unknown): string =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return [
    "id,genre,sub_style,audio,tags,lyrics,license_status,reviewed",
    ...tracks.map((t) => {
      const path = sandboxFolderPath(
        folders.find((f) => f.key === t.folderId),
        folders,
      )
        .split("/")
        .filter(Boolean)
        .map(sandboxSlug)
        .join("/");
      const base = (path ? path + "/" : "") + t.tags.id;
      return [
        t.tags.id,
        t.tags.genre,
        t.tags.sub_style,
        t.audio ? base + "." + t.audio.extension : "",
        base + ".tags.json",
        base + ".lyrics.txt",
        t.licenseStatus,
        sandboxReady(t) ? "yes" : "no",
      ]
        .map(cell)
        .join(",");
    }),
  ].join("\r\n");
}
/** Limits apply to direct members and every ancestor, so subfolders cannot evade a budget. */
export function assertSandboxCapacity(
  folderId: string,
  folders: SandboxFolder[],
  tracks: SandboxTrack[],
  addedSongs: number,
  addedBytes: number,
  excludeKey?: string,
): void {
  let f = folders.find((folder) => folder.key === folderId);
  const seen = new Set<string>();
  if (!f) throw new Error("Choose a destination folder.");
  while (f && !seen.has(f.key)) {
    seen.add(f.key);
    const ids = sandboxDescendants(f.key, folders);
    const members = tracks.filter((t) => ids.has(t.folderId) && t.key !== excludeKey);
    if (members.length + addedSongs > f.maxSongs)
      throw new Error(
        `${f.name} has a ${f.maxSongs}-song limit. Increase it in folder settings or choose another folder.`,
      );
    if (members.reduce((n, t) => n + (t.audio?.size || 0), 0) + addedBytes > f.maxMB * SANDBOX_MB)
      throw new Error(
        `${f.name} has a ${f.maxMB} MB limit. Increase it in folder settings or choose another folder.`,
      );
    f = folders.find((folder) => folder.key === f!.parentId);
  }
}
export function assertSandboxFolder(
  folder: SandboxFolder,
  folders: SandboxFolder[],
  tracks: SandboxTrack[],
): void {
  if (!folder.name.trim() || folder.name.length > 80 || /[/\\\u0000-\u001f]/.test(folder.name))
    throw new Error("Use a folder name of 1–80 characters without slashes.");
  if (!Number.isInteger(folder.maxSongs) || folder.maxSongs < 1 || folder.maxSongs > 500)
    throw new Error("Set a song limit between 1 and 500.");
  if (!Number.isFinite(folder.maxMB) || folder.maxMB < 10 || folder.maxMB > 2000)
    throw new Error("Set a storage limit between 10 and 2000 MB.");
  if (
    folders.some(
      (f) =>
        f.key !== folder.key &&
        f.parentId === folder.parentId &&
        sandboxSlug(f.name) === sandboxSlug(folder.name),
    )
  )
    throw new Error("Another folder at this level has the same export name.");
  if (
    folder.parentId &&
    (!folders.some((f) => f.key === folder.parentId) ||
      sandboxDescendants(folder.key, folders).has(folder.parentId))
  )
    throw new Error("A folder cannot be moved into itself or its subfolders.");
  const next = [...folders.filter((f) => f.key !== folder.key), folder];
  // Validate budgets after moving a whole subtree, including its ancestors.
  for (const candidate of next) assertSandboxCapacity(candidate.key, next, tracks, 0, 0);
}
