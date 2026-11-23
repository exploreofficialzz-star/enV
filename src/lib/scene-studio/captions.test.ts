import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activeGroup, captionAt, captionGroups, estimateSpokenLines, estimateTextWidth, groupWords, popScale, retimeFromDurations, splitWords, toSrt, wrapWords } from "./captions.ts";
import type { CaptionGroup } from "./captions.ts";
import { parseScene } from "./index.ts";
import type { CaptionSettings, DialogueLine } from "./types.ts";

const settings = (over: Partial<CaptionSettings> = {}): CaptionSettings => ({
  enabled: true,
  style: "pop",
  placement: "bottomCenter",
  highlightColor: "#ffd400",
  wordsPerGroup: 3,
  anchorY: 0.78,
  fontScale: 1,
  speakerColors: {},
  ...over,
});
const line = (speaker: string, text: string, start: number): DialogueLine => ({ speaker, text, start });
const frame = { width: 1080, height: 1920 };

test("splitWords ignores extra spaces and line breaks", () => {
  assert.deepEqual(splitWords("  Hello   big\nworld \t"), ["Hello", "big", "world"]);
  assert.deepEqual(splitWords("   "), []);
});

test("estimated timing: starts where written, words in order, speed and punctuation matter", () => {
  const [a] = estimateSpokenLines([line("ana", "Hello there my friend", 2)]);
  assert.equal(a.start, 2);
  assert.equal(a.words[0].start, 2);
  for (let i = 1; i < a.words.length; i++) assert.ok(a.words[i].start >= a.words[i - 1].end);
  assert.equal(a.end, a.words[3].end);
  assert.ok(a.end - a.start > 1 && a.end - a.start < 2.5, `duration ${a.end - a.start}`);

  const [fast] = estimateSpokenLines([line("ana", "Hello there my friend", 2)], { ana: { voice: "default", speed: 2 } });
  assert.ok(Math.abs(fast.end - 2 - (a.end - 2) / 2) < 1e-9);

  const [plain] = estimateSpokenLines([line("a", "one two", 0)]);
  const [pausing] = estimateSpokenLines([line("a", "one. two", 0)]);
  assert.ok(pausing.words[1].start - plain.words[1].start > 0.29);
  assert.ok(Math.abs(pausing.words[0].end - plain.words[0].end) < 1e-12); // the pause is a gap, not a longer word
});

test("estimateSpokenLines drops empty lines and sorts by start, keeping written order for ties", () => {
  const lines = estimateSpokenLines([line("b", "second", 5), line("a", "   ", 0), line("a", "tie one", 1), line("c", "tie two", 1), line("d", "first", 0.5)]);
  assert.deepEqual(
    lines.map((l) => l.text),
    ["first", "tie one", "tie two", "second"],
  );
});

test("retimeFromDurations scales a line to its real length and ignores bad durations", () => {
  const lines = estimateSpokenLines([line("a", "one two three four", 3), line("b", "next", 10)]);
  const real = retimeFromDurations(lines, [4, undefined]);
  assert.equal(real[0].start, 3);
  assert.ok(Math.abs(real[0].end - 7) < 1e-9);
  assert.ok(Math.abs(real[0].words[3].end - 7) < 1e-9);
  const ratioBefore = (lines[0].words[2].start - 3) / (lines[0].end - 3);
  const ratioAfter = (real[0].words[2].start - 3) / (real[0].end - 3);
  assert.ok(Math.abs(ratioBefore - ratioAfter) < 1e-9);
  assert.deepEqual(real[1], lines[1]);
  for (const bad of [0, -1, NaN, Infinity]) assert.deepEqual(retimeFromDurations(lines, [bad])[0], lines[0]);
  // the input is never changed
  assert.ok(lines[0].end < 6);
});

test("groupWords makes balanced groups", () => {
  const sizes = (n: number, per: number) => groupWords(Array.from({ length: n }, (_, i) => i), per).map((g) => g.length);
  assert.deepEqual(sizes(7, 3), [3, 2, 2]);
  assert.deepEqual(sizes(4, 3), [2, 2]);
  assert.deepEqual(sizes(3, 3), [3]);
  assert.deepEqual(sizes(1, 3), [1]);
  assert.deepEqual(sizes(5, 1), [1, 1, 1, 1, 1]);
  assert.deepEqual(sizes(0, 3), []);
  assert.deepEqual(sizes(10, 6), [5, 5]);
  assert.deepEqual(groupWords([1, 2, 3, 4], 0).map((g) => g.length), [1, 1, 1, 1]); // never loops forever on bad input
  assert.deepEqual(groupWords([1, 2, 3], 2.9).map((g) => g.length), [2, 1]);
});

test("captionGroups: each group starts with its first word and holds briefly after a line, but not over the next line", () => {
  const lines = estimateSpokenLines([line("a", "one two three four five", 1), line("b", "later words here", 100)]);
  const groups = captionGroups(lines, 3);
  assert.equal(groups.length, 3); // 5 words -> 3 + 2, then 3 more words -> 1 group
  assert.equal(groups[0].start, lines[0].words[0].start);
  assert.equal(groups[0].end, groups[1].start); // groups of one line follow each other with no gap
  assert.ok(Math.abs(groups[1].end - (lines[0].end + 0.25)) < 1e-12);
  assert.equal(groups[2].lineIndex, 1);

  const crowded = estimateSpokenLines([line("a", "one two three", 0), line("b", "interrupting", 0.9)]);
  const g = captionGroups(crowded, 3);
  assert.equal(g[0].end, crowded[0].end); // the interrupted line still finishes its own words...
  assert.equal(activeGroup(g, 0.95)!.speaker, "b"); // ...but the newer line is the one on screen
  assert.ok(g.every((x) => x.end >= x.start));
});

test("activeGroup: nothing before, nothing after, newest wins on overlap", () => {
  const w = (start: number) => ({ text: "x", start, end: start + 0.2 });
  const groups: CaptionGroup[] = [
    { lineIndex: 0, speaker: "a", words: [w(1)], start: 1, end: 4 },
    { lineIndex: 1, speaker: "b", words: [w(2)], start: 2, end: 3 },
  ];
  assert.equal(activeGroup(groups, 0.99), null);
  assert.equal(activeGroup(groups, 1)!.speaker, "a");
  assert.equal(activeGroup(groups, 2.5)!.speaker, "b");
  assert.equal(activeGroup(groups, 3)!.speaker, "a");
  assert.equal(activeGroup(groups, 4), null); // end is exclusive
});

test("popScale goes 0.82 → 1.12 → 1.0 in 0.14 seconds and stays at 1.0", () => {
  assert.equal(popScale(-1), 0.82);
  assert.equal(popScale(0), 0.82);
  assert.ok(Math.abs(popScale(0.07) - 1.12) < 1e-12);
  assert.ok(Math.abs(popScale(0.14) - 1) < 1e-12);
  assert.equal(popScale(5), 1);
});

test("wrapWords fills rows greedily and keeps an over-wide word on its own row", () => {
  assert.deepEqual(wrapWords([40, 40, 40, 40], 10, 100), [[0, 1], [2, 3]]);
  assert.deepEqual(wrapWords([30, 30, 10], 10, 100), [[0, 1, 2]]);
  assert.deepEqual(wrapWords([30, 500, 30], 10, 100), [[0], [1], [2]]);
  assert.deepEqual(wrapWords([], 10, 100), []);
});

function groupsFor(text: string, wordsPerGroup = 3, speaker = "ana", start = 1) {
  return captionGroups(estimateSpokenLines([line(speaker, text, start)]), wordsPerGroup);
}

test("captionAt (pop): the spoken word is highlighted and pops, the others stay white and still", () => {
  const groups = groupsFor("Catch the ball now");
  const g = groups[0];
  const t = g.words[1].start + 0.07;
  const draw = captionAt(groups, t, settings(), frame)!;
  const words = draw.rows.flatMap((r) => r.words);
  assert.deepEqual(
    words.map((w) => w.text),
    g.words.map((w) => w.text),
  );
  assert.deepEqual(
    words.map((w) => w.color),
    ["#ffffff", "#ffd400", "#ffffff"].slice(0, words.length),
  );
  assert.ok(Math.abs(words[1].scale - 1.12) < 1e-9);
  assert.equal(words[0].scale, 1);
  assert.equal(draw.fontWeight, 800);
  assert.equal(draw.strokeColor, "#000000");
  assert.ok(draw.strokeWidth >= 2);

  // before the first word of the group there is no group at all
  assert.equal(captionAt(groups, g.start - 0.001, settings(), frame), null);
  // a moment after the group's start the first word is the active one
  const first = captionAt(groups, g.start, settings(), frame)!.rows[0].words[0];
  assert.equal(first.color, "#ffd400");
  assert.equal(first.scale, 0.82);
});

test("captionAt (classic): one colour, no pop; speaker colour tints the text", () => {
  const groups = groupsFor("Catch the ball");
  const t = groups[0].start + 0.05;
  const plain = captionAt(groups, t, settings({ style: "classic" }), frame)!;
  assert.ok(plain.rows.flatMap((r) => r.words).every((w) => w.color === "#ffffff" && w.scale === 1));
  const tinted = captionAt(groups, t, settings({ style: "classic", speakerColors: { ana: "#ff8a8a" } }), frame)!;
  assert.ok(tinted.rows.flatMap((r) => r.words).every((w) => w.color === "#ff8a8a"));
});

test("captionAt: a speaker colour replaces the highlight colour for that speaker only", () => {
  const groups = [...groupsFor("Hello there", 3, "ana", 0), ...groupsFor("General Kenobi", 3, "ben", 5)];
  const s = settings({ speakerColors: { ana: "#ff8a8a" } });
  const ana = captionAt(groups, 0.01, s, frame)!;
  assert.equal(ana.rows[0].words[0].color, "#ff8a8a");
  const ben = captionAt(groups, 5.01, s, frame)!;
  assert.equal(ben.rows[0].words[0].color, "#ffd400");
});

test("captionAt returns nothing when captions are off", () => {
  const groups = groupsFor("Catch the ball");
  assert.equal(captionAt(groups, groups[0].start + 0.1, settings({ enabled: false }), frame), null);
});

test("captionAt places the block at anchorY and keeps it inside the frame", () => {
  const groups = groupsFor("Catch the ball");
  const t = groups[0].start + 0.05;
  const draw = captionAt(groups, t, settings({ anchorY: 0.78 }), frame)!;
  const centre = draw.box.y + draw.box.height / 2;
  assert.ok(Math.abs(centre - 0.78 * frame.height) < 1, `centre ${centre}`);
  assert.ok(Math.abs(draw.box.x + draw.box.width / 2 - frame.width / 2) < 1e-9);

  // anchorY at the very edge is pulled back inside the 5% safe zone
  const low = captionAt(groups, t, settings({ anchorY: 0.95 }), frame)!;
  assert.ok(low.box.y + low.box.height <= frame.height * 0.95 + 1e-9);
  const high = captionAt(groups, t, settings({ anchorY: 0.1 }), frame)!;
  assert.ok(high.box.y >= frame.height * 0.05 - 1e-9);
});

test("captionAt (belowSpeaker): sits under the speaker, falls back to bottom centre without an anchor, stays in the frame", () => {
  const groups = groupsFor("Catch the ball", 3, "ana");
  const t = groups[0].start + 0.05;
  const s = settings({ placement: "belowSpeaker" });
  const under = captionAt(groups, t, s, frame, { speakerAnchors: { ana: { x: 300, y: 1000 } } })!;
  assert.ok(under.box.y >= 1000, `box.y ${under.box.y}`);
  assert.ok(Math.abs(under.box.x + under.box.width / 2 - 300) < 1e-9 || under.box.x >= frame.width * 0.06 - 1e-9);
  const noAnchor = captionAt(groups, t, s, frame)!;
  const bottom = captionAt(groups, t, settings(), frame)!;
  assert.deepEqual(noAnchor.box, bottom.box);
  // a speaker near the right edge is pulled inside the safe margin
  const edge = captionAt(groups, t, s, frame, { speakerAnchors: { ana: { x: 1075, y: 1900 } } })!;
  assert.ok(edge.box.x + edge.box.width <= frame.width * 0.94 + 1e-9);
  assert.ok(edge.box.y + edge.box.height <= frame.height * 0.95 + 1e-9);
});

test("captionAt wraps long groups and shrinks for an over-wide word", () => {
  const narrow = { width: 400, height: 400 };
  const groups = groupsFor("extraordinarily considerable accomplishments", 3);
  const draw = captionAt(groups, groups[0].start + 0.01, settings(), narrow)!;
  assert.ok(draw.rows.length >= 2);
  for (const row of draw.rows) for (const w of row.words) assert.ok(w.x >= narrow.width * 0.06 - 1e-9 && w.x + w.width <= narrow.width * 0.94 + 1e-9, `${w.text} ${w.x}+${w.width}`);

  const huge = groupsFor("Supercalifragilisticexpialidocious", 1);
  const big = captionAt(huge, huge[0].start + 0.01, settings({ fontScale: 2 }), narrow)!;
  const w = big.rows[0].words[0];
  assert.ok(w.x >= narrow.width * 0.06 - 1e-9 && w.x + w.width <= narrow.width * 0.94 + 1e-9);
  assert.ok(big.fontSize < Math.round(400 * 0.07 * 2));
});

test("captionAt uses the renderer's own text measurement when given", () => {
  const groups = groupsFor("Catch the ball");
  const t = groups[0].start + 0.05;
  const wide = captionAt(groups, t, settings(), frame, { measure: (text, size) => text.length * size })!;
  const normal = captionAt(groups, t, settings(), frame)!;
  assert.ok(wide.rows.flatMap((r) => r.words).length === normal.rows.flatMap((r) => r.words).length);
  assert.ok(wide.box.width > normal.box.width);
  assert.ok(Math.abs(estimateTextWidth("abcd", 10) - 22.4) < 1e-9);
});

test("captionAt stays inside the frame for many sizes, scales and texts", () => {
  const texts = ["Hi", "What a beautiful evening, my friend.", "A man jumped into a drainpipe in a flood.", "Pneumonoultramicroscopicsilicovolcanoconiosis is long"];
  const frames = [
    { width: 1080, height: 1920 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
    { width: 64, height: 64 },
    { width: 4096, height: 4096 },
  ];
  for (const f of frames)
    for (const text of texts)
      for (const fontScale of [0.5, 1, 2])
        for (const per of [1, 3, 6])
          for (const anchorY of [0.1, 0.5, 0.95]) {
            const groups = groupsFor(text, per);
            for (const g of groups) {
              const d = captionAt(groups, g.start + 0.01, settings({ fontScale, anchorY, wordsPerGroup: per }), f)!;
              assert.ok(d, "a caption exists while a group is active");
              for (const row of d.rows)
                for (const w of row.words) {
                  assert.ok(Number.isFinite(w.x) && Number.isFinite(w.width) && Number.isFinite(row.y));
                  // 64px frames are too small for 8px minimum text at 6% margins; only check proportional frames
                  if (f.width >= 320) assert.ok(w.x >= f.width * 0.06 - 1e-6 && w.x + w.width <= f.width * 0.94 + 1e-6, `${f.width}x${f.height} "${w.text}"`);
                }
            }
          }
});

test("captions are the same every time they are asked for (no clock, no randomness)", () => {
  const groups = groupsFor("Catch the ball now please");
  const t = groups[0].start + 0.09;
  const a = JSON.stringify(captionAt(groups, t, settings(), frame));
  const b = JSON.stringify(captionAt(groups, t, settings(), frame));
  assert.equal(a, b);
});

test("toSrt writes numbered cues with comma milliseconds", () => {
  const groups = groupsFor("Catch the ball now please", 3, "ana", 3725.5 > 3600 ? 0 : 0);
  const srt = toSrt(groups);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:0\d,\d{3}\nCatch the ball\n\n2\n/);
  const w = { text: "x", start: 3725.25, end: 3726 };
  assert.match(toSrt([{ lineIndex: 0, speaker: "a", words: [w], start: 3725.25, end: 3726.0005 }]), /^1\n01:02:05,250 --> 01:02:06,001\nx\n$/);
  assert.equal(toSrt([]), "");
});

test("fixtures: the shipped scenes get sensible captions", () => {
  const dir = new URL("../../../apps/shared/scene-studio/scenes/valid/", import.meta.url);
  const load = (name: string) => {
    const r = parseScene(readFileSync(new URL(name, dir), "utf8"));
    assert.ok(r.ok && r.scene, `${name} should validate`);
    return r.scene!;
  };

  const duo = load("03-two-speakers-camera.json");
  const duoGroups = captionGroups(estimateSpokenLines(duo.dialogue, duo.voices), duo.captions.wordsPerGroup);
  const ana = captionAt(duoGroups, 0.5 + 0.01, duo.captions, { width: duo.settings.width, height: duo.settings.height })!;
  assert.equal(ana.speaker, "ana");
  assert.equal(ana.rows[0].words[0].color, "#ff8a8a");
  const ben = captionAt(duoGroups, 5.5 + 0.01, duo.captions, { width: duo.settings.width, height: duo.settings.height })!;
  assert.equal(ben.rows[0].words[0].color, "#8ab4ff");
  assert.equal(captionAt(duoGroups, 3, duo.captions, { width: duo.settings.width, height: duo.settings.height }), null);

  const flood = load("04-night-flood-cinematic.json");
  const floodGroups = captionGroups(estimateSpokenLines(flood.dialogue, flood.voices), flood.captions.wordsPerGroup);
  assert.ok(floodGroups.length >= 9);
  const f = { width: flood.settings.width, height: flood.settings.height };
  const shown = captionAt(floodGroups, floodGroups[0].start + 0.05, flood.captions, f)!;
  const centre = shown.box.y + shown.box.height / 2;
  assert.ok(Math.abs(centre - 0.78 * f.height) < 1);
  // every group ends before the scene does
  assert.ok(floodGroups[floodGroups.length - 1].end <= flood.settings.duration);
});
