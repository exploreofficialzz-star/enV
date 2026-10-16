import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const webStore = read('src/lib/engines/audio-session-storage.ts');
const dashboard = read('src/components/engines/audio-music-studio.tsx');
const audioTool = read('src/components/engines/audio-engine.tsx');
const extraAudioTool = read('src/components/engines/audio-extra-tools.tsx');
const android = read('apps/android/app/src/main/java/com/chastech/env/MainActivity.kt');
const ios = read('apps/ios/enV/ToolViews.swift');
const iosTests = read('apps/ios/enVTests/NativeAudioEngineTests.swift');
const pkg = JSON.parse(read('package.json'));

const requireText = (source, needle, message) => {
  if (!source.includes(needle)) throw new Error(message);
};
for (const [needle, message] of [
  ['indexedDB.open(DATABASE_NAME', 'Web local handoff must use same-origin IndexedDB.'],
  ['AUDIO_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000', 'Web local sessions need a bounded expiry.'],
  ['AUDIO_SESSION_MAX_BYTES = 250 * 1024 * 1024', 'Web local sessions need a documented size bound.'],
  ['new File([record.blob]', 'Restored web sessions must return a File to existing tool processors.'],
  ['void pruneExpiredAudioSessions(now)', 'The browser handoff must clean up expired records.'],
]) requireText(webStore, needle, message);
for (const [source, needle, message] of [
  [dashboard, 'audioSessionId=', 'Studio actions must pass a stable local session identifier to focused tools.'],
  [dashboard, 'saveAudioSessionFile(next)', 'A selected source must be saved locally before handoff.'],
  [dashboard, 'updateAudioSessionQuery(saved.id)', 'Dashboard refreshes should preserve the local source handoff without cloud upload.'],
  [dashboard, 'The source ID only works in this browser', 'The local-only scope of handoff IDs must be disclosed.'],
  [dashboard, 'Browser storage can still be cleared or evicted', 'The dashboard must disclose non-permanent browser storage.'],
  [dashboard, 'const onPickFileRef = useRef(onPickFile)', 'Dashboard restore must use a live callback ref to avoid effect dependency races.'],
  [dashboard, 'AUDIO_FILE_HANDOFF_SLUGS.has(slug)', 'Selected files should only travel to file-capable tool routes.'],
  [dashboard, 'await deleteAudioSession(previousSessionId)', 'Changing or clearing a dashboard source must attempt to remove the old handoff.'],
  [dashboard, 'deleteAudioSession(handoffId)', 'Clearing the Music Studio session must remove its saved source handoff.'],
  [dashboard, 'saveAudioSessionFile(selected)', 'Directly imported Music Studio files should support local cross-mode handoff.'],
  [dashboard, 'updateAudioSessionQuery(saved.id)', 'Music Studio should persist the current local handoff ID for refresh and mode changes.'],
  [audioTool, 'loadAudioSessionFile(sessionId)', 'Focused browser tools must restore handoff sessions.'],
  [audioTool, 'Nothing has been uploaded.', 'Browser restore must not imply an automatic upload.'],
  [audioTool, 'Forget saved local handoff', 'File-focused routes need an explicit way to remove the stored source.'],
  [audioTool, 'deleteAudioSession(sourceSessionId)', 'The destination route must remove saved handoffs on request.'],
  [extraAudioTool, 'loadAudioSessionFile(sessionId)', 'The local joiner must restore a handed-off source.'],
  [extraAudioTool, 'Add at least one more file', 'The joiner must explain a restored source is only the first input.'],
  [extraAudioTool, 'Forget saved local handoff', 'The joiner must allow local handoffs to be removed.'],
  [android, 'private object NativeAudioSessionStore', 'Android must have a native Kotlin private session store.'],
  [android, 'context.filesDir', 'Android sessions must remain in app-private storage.'],
  [android, 'TTL_MILLIS = 7L * 24 * 60 * 60 * 1000', 'Android sessions must expire within seven days.'],
  [android, 'Restore previous local source', 'Android users must have an explicit restore action.'],
  [ios, 'enum NativeAudioSessionStore', 'iOS must have an independent native Swift session store.'],
  [ios, 'applicationSupportDirectory', 'iOS sessions must remain in app-private storage.'],
  [ios, 'private static let ttl: TimeInterval = 7 * 24 * 60 * 60', 'iOS sessions must expire within seven days.'],
  [ios, 'Restore previous local source', 'iOS users must have an explicit restore action.'],
  [iosTests, 'testNativeAudioSessionStoreRoundTripsPrivateSource', 'The iOS session store needs a round-trip regression test.'],
]) requireText(source, needle, message);
const handoffAllowlist = dashboard.match(/const AUDIO_FILE_HANDOFF_SLUGS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? '';
if (!handoffAllowlist) throw new Error('The file handoff must have an explicit tool allowlist.');
for (const nonFileSlug of ['audio-bitrate-calculator', 'audio-file-size-calculator', 'audio-duration-tool', 'audio-recorder', 'audio-tone-generator', 'audio-metronome']) {
  if (handoffAllowlist.includes(`"${nonFileSlug}"`)) throw new Error(`Non-file tool ${nonFileSlug} must not receive an unnecessary audio file session.`);
}
if (dashboard.includes('restoredRouteSessionRef') || read('src/components/engines/audio-music-studio.tsx').includes('restoreAudioSessionRef')) throw new Error('A one-shot restore ref can suppress local handoff under React StrictMode.');
if (!pkg.scripts['check:audio-session-handoff'] || !pkg.scripts.verify.includes('check:audio-session-handoff')) {
  throw new Error('Session handoff checker must be wired into npm run verify.');
}
console.log('Audio session handoff guard passed: bounded local browser sessions, web route restoration, explicit native restore, expiry, privacy copy and iOS regression coverage.');
