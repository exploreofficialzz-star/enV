import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const music = read('src/components/engines/audio-music-studio.tsx');
const liveWeb = read('src/components/engines/music-live-video-studio.tsx');
const android = read('apps/android/app/src/main/java/com/chastech/env/NativeMusicLiveVideoStudio.kt');
const ios = read('apps/ios/enV/ToolViews.swift');

const checks = [
  ['Music Studio provides goal-first quick start', () => {
    for (const token of ['Choose your task', 'Split stems', 'Practice', 'Mix stems', 'Record vocals', 'Karaoke']) assert.ok(music.includes(token), `Missing quick-start task: ${token}`);
    assert.ok(music.includes('chooseWorkspace(key)') || music.includes('chooseWorkspace(nextMode)'), 'Task selection does not route to the selected workspace.');
  }],
  ['Import zone supports browse and drag/drop', () => {
    for (const token of ['music-studio-import', 'onDragOver=', 'onDrop=', 'Release to import your audio file.', 'aria-describedby="music-import-formats"']) assert.ok(music.includes(token), `Missing import affordance: ${token}`);
  }],
  ['Workspace and task progress have visible and semantic status', () => {
    for (const token of ['Choose a workspace', 'aria-label="Workflow progress"', 'aria-selected={activeMode === key}', 'CheckCircle2', 'Add audio', 'Export']) assert.ok(music.includes(token), `Missing orientation/status feature: ${token}`);
  }],
  ['Touch navigation and primary controls meet the 48px web target', () => {
    assert.ok(music.includes('grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5') && music.includes('min-h-12 min-w-0'), 'Music workspace navigation should be a full-width responsive grid with at least 48px target height.');
    assert.ok(liveWeb.includes('className="grid grid-cols-3 gap-2"') && liveWeb.includes('min-h-12'), 'Live video navigation should use a compact responsive grid with touch-sized controls.');
    assert.ok(liveWeb.includes('min-h-12 w-full justify-center'), 'Live video primary actions should be large on mobile.');
  }],
  ['Live web capture explains the next action before permissions', () => {
    for (const token of ['Recommended order', 'Add backing track', 'Choose vocal sound', 'Record & download', 'Start with', 'Ready to record.']) assert.ok(liveWeb.includes(token), `Missing guided capture copy: ${token}`);
  }],
  ['Android native screen includes quick-start and full-width camera controls', () => {
    for (const token of ['Quick start', 'Add a backing track', 'Choose a vocal sound', 'Enable camera & mic', 'modifier = Modifier.fillMaxWidth()', 'height(48.dp)']) assert.ok(android.includes(token), `Missing Android usability feature: ${token}`);
  }],
  ['iOS native screen includes quick-start and full-width camera controls', () => {
    for (const token of ['GroupBox("Quick start")', 'Add a backing track', 'Choose a vocal sound', 'Enable camera & mic', '.frame(maxWidth: .infinity)']) assert.ok(ios.includes(token), `Missing iOS usability feature: ${token}`);
  }],
  ['Visual round uses compact instrument-console headers and optional help', () => {
    for (const token of ['bg-gradient-to-br from-slate-950', 'text-cyan-200', 'Safety & processing', 'rounded-2xl', 'studioWave']) assert.ok(music.includes(token), `Missing Music Studio visual treatment: ${token}`);
    for (const token of ['bg-gradient-to-br from-slate-950', 'Rights & privacy: local capture', 'grid grid-cols-3 gap-2']) assert.ok(liveWeb.includes(token), `Missing live studio visual treatment: ${token}`);
    for (const token of ['ToolIcon', 'Tool notes & format', 'max-w-5xl']) assert.ok(read('src/components/engines/audio-extra-tools.tsx').includes(token), `Missing utility studio visual treatment: ${token}`);
    for (const token of ['enV · PERFORMANCE', 'showRightsPrivacy', 'Live Video Studio']) assert.ok(android.includes(token), `Missing Android performance-console treatment: ${token}`);
    for (const token of ['enV · PERFORMANCE', 'showRightsPrivacy', 'Record · Monitor · Export WAV']) assert.ok(ios.includes(token), `Missing iOS performance-console treatment: ${token}`);
  }],
  ['Advanced controls remain available instead of being removed', () => {
    for (const token of ['Ten-band graphic EQ', 'Dynamics & output controls', 'My saved sound setups', 'A/B quick compare', 'Open advanced EQ & dynamics', 'Advanced EQ & dynamics']) {
      assert.ok(music.includes(token) || liveWeb.includes(token) || android.includes(token) || ios.includes(token), `Advanced feature no longer discoverable: ${token}`);
    }
  }],
];

for (const [name, run] of checks) {
  run();
  console.log(`PASS ${name}`);
}
console.log(`Audio studio usability checks passed (${checks.length}/${checks.length}).`);
