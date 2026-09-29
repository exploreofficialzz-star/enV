import type { MockupProject, TimelineEvent } from "./schema.ts";

export interface TimelineState {
  visibleMessageIds: Set<string>;
  typing: boolean;
  playedMediaIds: Set<string>;
  readMessageIds: Set<string>;
  callState: string | null;
}

export function initialTimelineState(project: MockupProject): TimelineState {
  return {
    visibleMessageIds: new Set(project.messages.map((m) => m.id)),
    typing: false,
    playedMediaIds: new Set(),
    readMessageIds: new Set(project.messages.filter((m) => m.state === "read").map((m) => m.id)),
    callState: null,
  };
}

export function evaluateTimeline(project: MockupProject, atMs: number): TimelineState {
  const state = initialTimelineState(project);
  for (const event of [...project.timeline].sort((a, b) => a.atMs - b.atMs)) {
    if (event.atMs > atMs) break;
    applyTimelineEvent(state, event);
  }
  return state;
}

export function applyTimelineEvent(state: TimelineState, event: TimelineEvent) {
  switch (event.type) {
    case "typing": state.typing = Boolean(event.value); break;
    case "message": if (event.targetId) state.visibleMessageIds.add(event.targetId); break;
    case "state": if (event.targetId && event.value === "read") state.readMessageIds.add(event.targetId); break;
    case "playback": if (event.targetId) state.playedMediaIds.add(event.targetId); break;
    case "call": state.callState = String(event.value ?? ""); break;
    default: break;
  }
}

export function addTimelineEvent(project: MockupProject, event: Omit<TimelineEvent, "id">): MockupProject {
  return { ...project, timeline: [...project.timeline, { ...event, id: crypto.randomUUID() }].sort((a, b) => a.atMs - b.atMs), updatedAt: new Date().toISOString() };
}
