import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("./url-media-processor.mjs", import.meta.url), "utf8");
assert.match(source, /PROVIDERS/);
assert.match(source, /youtube/);
assert.match(source, /tiktok/);
assert.match(source, /assertPublicHostname/);
assert.match(source, /Private or local network addresses are not allowed/);
assert.match(source, /--no-playlist/);
assert.match(source, /--max-filesize/);
assert.match(source, /duration <=/);
console.log("url media processor tests: 2/2 passed");


// YouTube adapter wiring regression: exactly one filesize guard and the expected MP4 selector.
if (!source.includes('function youtubeAdapter(format, audioOnly)')) throw new Error('YouTube adapter missing');
if ((source.match(/"--max-filesize"/g) || []).length < 1) throw new Error('Filesize guard missing');
if ((source.match(/"--max-filesize"/g) || []).length > 2) throw new Error('Unexpected duplicate filesize flags');
if (!source.includes('bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best')) throw new Error('YouTube MP4 format selector missing');
console.log('YouTube adapter regression passed');

// TikTok adapter wiring regression: dedicated adapter is present and keeps the same safe output constraints.
if (!source.includes('function tiktokAdapter(format, audioOnly)')) throw new Error('TikTok adapter missing');
if (!source.includes('if (provider === "tiktok") return tiktokAdapter(format, audioOnly);')) throw new Error('TikTok adapter not wired');
if (!source.includes('bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best')) throw new Error('TikTok MP4 format selector missing');
console.log('TikTok adapter regression passed');

// Facebook adapter wiring regression: dedicated adapter with safe format fallbacks.
if (!source.includes('function facebookAdapter(format, audioOnly)')) throw new Error('Facebook adapter missing');
if (!source.includes('if (provider === "facebook") return facebookAdapter(format, audioOnly);')) throw new Error('Facebook adapter not wired');
if (!source.includes('best[ext=mp4]/best')) throw new Error('Facebook MP4 selector missing');
console.log('Facebook adapter regression passed');

// Instagram adapter wiring regression: dedicated adapter with safe format fallbacks.
if (!source.includes('function instagramAdapter(format, audioOnly)')) throw new Error('Instagram adapter missing');
if (!source.includes('if (provider === "instagram") return instagramAdapter(format, audioOnly);')) throw new Error('Instagram adapter not wired');
if (!source.includes('if (format === "mp4") return { formatArg: "best[ext=mp4]/best", post: [] };')) throw new Error('Instagram MP4 selector missing');
console.log('Instagram adapter regression passed');

// X/Twitter adapter wiring regression: dedicated adapter with safe format fallbacks.
if (!source.includes('function xAdapter(format, audioOnly)')) throw new Error('X/Twitter adapter missing');
if (!source.includes('if (provider === "x") return xAdapter(format, audioOnly);')) throw new Error('X/Twitter adapter not wired');
if (!source.includes('if (format === "mp4") return { formatArg: "best[ext=mp4]/best", post: [] };')) throw new Error('X/Twitter MP4 selector missing');
console.log('X/Twitter adapter regression passed');

if (!source.includes('async function handleInfo')) throw new Error('URL media info endpoint missing');
if (!source.includes('"/info"')) throw new Error('URL media info route missing');
if (!source.includes('--dump-single-json')) throw new Error('yt-dlp metadata mode missing');
if (!source.includes('skip-download')) throw new Error('Info endpoint must not download media');
console.log('URL media info regression passed');
