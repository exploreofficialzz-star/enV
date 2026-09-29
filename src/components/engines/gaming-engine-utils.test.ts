import test from "node:test";
import assert from "node:assert/strict";
import { buildGamingOutput, parseGamingToolId } from "./gaming-engine-utils.ts";

const input = { name:"Arena", base:10, modifier:2, quantity:3, sides:6, level:4, players:4, rounds:2, notes:"goal", entries:["Alpha","Beta","Gamma","Delta"] };

test("parses every gaming workflow shape", () => {
  for (const id of ["rpg-character-generator","dice-calculator","loot-randomizer","quest-planner","game-session-tracker","tournament-bracket-generator"]) {
    const parsed = parseGamingToolId(id); assert.ok(parsed.family); assert.ok(parsed.workflow);
  }
});

test("calculator outputs transparent numeric result", () => {
  assert.match(buildGamingOutput("dice", "calculator", input), /Result: 12\.50/);
  assert.match(buildGamingOutput("tournament", "calculator", input), /Result: 6/);
});

test("planner and tracker produce usable outputs", () => {
  assert.match(buildGamingOutput("quest", "planner", input), /Define objective|Alpha/);
  assert.match(buildGamingOutput("quest", "tracker", input), /localStorage/);
});

test("bracket rejects insufficient entries", () => {
  assert.throws(() => buildGamingOutput("tournament", "bracket-generator", {...input, entries:["Only one"]}), /at least two/i);
});
