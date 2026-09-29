import type { MockupProject } from "./schema.ts";

export const PROJECT_STORAGE_KEY = "env:mockups:projects:v1";

export function createDefaultProject(platform: MockupProject["platform"] = "whatsapp"): MockupProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1, id: crypto.randomUUID(), name: "Untitled Mockup", platform, scene: "chat", deviceTemplate: "iphone-modern-light", theme: "light",
    profiles: [{ id: "me", name: "You", status: "online" }, { id: "them", name: "Alex", status: "online" }],
    messages: [
      { id: "m1", profileId: "them", text: "Are you free Thursday?", timestamp: "3:02 PM", state: "read" },
      { id: "m2", profileId: "me", text: "Yes — 3pm works.", timestamp: "3:03 PM", state: "read" },
      { id: "m3", profileId: "them", text: "Perfect, see you then.", timestamp: "3:03 PM", state: "read" },
    ], media: [], timeline: [], exportSettings: { format: "png", scale: 2, transparent: false, durationMs: 2000, fps: 12 }, createdAt: now, updatedAt: now,
  };
}

export function saveProject(project: MockupProject) {
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    const projects = raw ? JSON.parse(raw) as MockupProject[] : [];
    const next = [...projects.filter((p) => p.id !== project.id), { ...project, updatedAt: new Date().toISOString() }].slice(-20);
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(next));
  } catch { /* local persistence is optional */ }
}

export function loadProjects(): MockupProject[] {
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    return raw ? JSON.parse(raw) as MockupProject[] : [];
  } catch { return []; }
}

export function validateProject(value: unknown): value is MockupProject {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<MockupProject>;
  return p.schemaVersion === 1 && typeof p.id === "string" && typeof p.platform === "string" && Array.isArray(p.profiles) && Array.isArray(p.messages) && Array.isArray(p.media) && Array.isArray(p.timeline);
}
