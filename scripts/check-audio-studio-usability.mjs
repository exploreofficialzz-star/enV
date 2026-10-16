import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const music = read('src/components/engines/audio-music-studio.tsx');
const liveWeb = read('src/components/engines/music-live-video-studio.tsx');
const android = read('apps/android/app/src/main/java/com/chastech/env/NativeMusicLiveVideoStudio.kt');
const ios = read('apps/ios/enV/ToolViews.swift');

const checks = [
  ['Music Studio provides goal-first quick start', () => {
    for (const token of ['What would you like to do?', 'Remove vocals or split stems', 'Practice a song', 'Mix and export stems', 'Record a vocal take', 'Make a karaoke version']) assert.ok(music.includes(token), `Missing quick-start task: ${token}`);
    assert.ok(music.includes('chooseWorkspace(key)') || music.includes('chooseWorkspace(nextMode)'), 'Task selection does not route to the selected workspace.');
  }],
  ['Import zone supports browse and drag/drop', () => {
    for (const token of ['music-studio-import', 'onDragOver=', 'onDrop=', 'Release to import your audio file.', 'aria-describedby="music-import-formats"']) assert.ok(music.includes(token), `Missing import affordance: ${token}`);
  }],
  ['Workspace and task progress have visible and semantic status', () => {
    for (const token of ['Choose a workspace', 'aria-label="Workflow progress"', 'aria-selected={activeMode === key}', 'CheckCircle2', 'Review / export']) assert.ok(music.includes(token), `Missing orientation/status feature: ${token}`);
  }],
  ['Touch navigation and primary controls meet the 48px web target', () => {
    assert.ok(music.includes('min-h-12 shrink-0 snap-start'), 'Music workspace tabs should use 48px minimum height.');
    assert.ok(liveWeb.includes('min-h-12 shrink-0 snap-start'), 'Live video navigation should use 48px minimum height.');
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
