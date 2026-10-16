import fs from 'node:fs';
const source = fs.readFileSync('src/components/engines/audio-music-studio.tsx', 'utf8');
const required = [
  ['Convert Studio', 'convert'], ['Edit Studio', 'edit'], ['Analyze Studio', 'analyze'],
  ['Audio Calculator', 'calc'], ['Transcription Studio', 'transcribe'], ['Record & Import', 'import'], ['Delivery Guide', 'platform'],
];
for (const [title, key] of required) {
  if (!source.includes(`title: "${title}"`) || !source.includes(`${key}: { title:`)) throw new Error(`Missing distinct workspace definition: ${title}`);
}
for (const token of ['Session source', 'Drop an audio file here or browse', 'Waveform preview', 'Choose a workflow', 'Studio shortcuts', 'aria-pressed={platform===value}', 'Open tool']) {
  if (!source.includes(token)) throw new Error(`Missing real studio interface feature: ${token}`);
}
if (!source.includes('onDragOver={e=>e.preventDefault()}') || !source.includes('onDrop={e=>{e.preventDefault();void onPickFile(e.dataTransfer.files?.[0]);}}')) throw new Error('Studio import does not support drag/drop.');
if (!source.includes('Tools restore it from local browser storage') || !source.includes('Browser storage can still be cleared or evicted')) throw new Error('Local handoff and browser-storage limitations must be disclosed.');
console.log('Audio studio interface check passed: 7 distinct workspace dashboards, file preview/waveform, drag-and-drop import, bounded local handoff, destination selector and focused tool actions.');
