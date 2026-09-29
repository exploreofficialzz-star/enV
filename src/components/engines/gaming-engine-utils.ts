export type GamingWorkflow = "generator" | "calculator" | "randomizer" | "planner" | "tracker" | "bracket-generator";

const FAMILIES = [
  "rpg-character", "fantasy-character", "loot", "encounter", "quest", "npc", "guild", "clan", "team",
  "tournament", "score", "xp", "damage", "critical-hit", "dice", "deck", "card", "game-session", "streamer",
] as const;

const TRAITS = ["Brave", "Clever", "Patient", "Bold", "Curious", "Loyal", "Tactical", "Resourceful"];
const ROLES = ["Leader", "Scout", "Support", "Defender", "Striker", "Controller", "Crafter", "Strategist"];
const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
const ELEMENTS = ["Fire", "Water", "Earth", "Air", "Shadow", "Light", "Arcane"];

export interface GamingInput {
  name: string;
  base: number;
  modifier: number;
  quantity: number;
  sides: number;
  level: number;
  players: number;
  rounds: number;
  notes: string;
  entries: string[];
}

export function parseGamingToolId(toolId: string): { family: string; workflow: GamingWorkflow } {
  const match = toolId.match(/^(.+?)-(bracket-generator|generator|calculator|randomizer|planner|tracker)$/);
  if (!match || !FAMILIES.includes(match[1] as (typeof FAMILIES)[number])) {
    throw new Error(`Unsupported gaming tool: ${toolId}`);
  }
  return { family: match[1], workflow: match[2] as GamingWorkflow };
}

const title = (value: string) => value.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const clean = (value: string, fallback: string) => value.trim() || fallback;
const num = (value: number, fallback: number, min = 0) => Number.isFinite(value) ? Math.max(min, value) : fallback;
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]!;

function familyProfile(family: string, name: string, level: number) {
  const role = pick(ROLES);
  const trait = pick(TRAITS);
  const element = pick(ELEMENTS);
  const rarity = pick(RARITIES);
  if (family.includes("character") || family === "npc") {
    return `${name}\nRole: ${role}\nTrait: ${trait}\nElement: ${element}\nLevel: ${level}`;
  }
  if (family === "loot" || family === "card" || family === "deck") {
    return `${name}\nRarity: ${rarity}\nType: ${role}\nAffinity: ${element}`;
  }
  return `${name}\nRole: ${role}\nTrait: ${trait}\nTheme: ${element}`;
}

export function calculateGaming(family: string, input: GamingInput): string {
  const base = num(input.base, 10);
  const modifier = Number.isFinite(input.modifier) ? input.modifier : 0;
  const quantity = num(input.quantity, 1, 1);
  const sides = num(input.sides, 6, 2);
  const level = num(input.level, 1, 1);
  const players = num(input.players, 2, 1);
  const rounds = num(input.rounds, 1, 1);
  let value: number;
  let formula: string;
  switch (family) {
    case "damage": value = Math.max(0, base + modifier) * quantity; formula = `(base + modifier) × quantity`; break;
    case "critical-hit": value = Math.max(0, base + modifier) * Math.max(1, quantity); formula = `(base + modifier) × critical multiplier`; break;
    case "xp": value = Math.max(0, base * level + modifier) * quantity; formula = `(base × level + modifier) × quantity`; break;
    case "loot": value = Math.max(0, base + modifier) * quantity; formula = `(base + modifier) × quantity`; break;
    case "encounter": value = Math.max(0, base * players + modifier * level); formula = `base × players + modifier × level`; break;
    case "quest": value = Math.max(0, base * rounds + modifier); formula = `base × rounds + modifier`; break;
    case "tournament": value = players > 1 ? players * (players - 1) / 2 : 0; formula = `players × (players − 1) ÷ 2`;
      break;
    case "score": value = Math.max(0, base + modifier * quantity); formula = `base + modifier × quantity`; break;
    case "dice": value = quantity * ((sides + 1) / 2) + modifier; formula = `quantity × (sides + 1) ÷ 2 + modifier (expected total)`; break;
    case "deck": value = Math.max(0, base - quantity * rounds); formula = `starting cards − cards drawn × rounds`; break;
    case "card": value = Math.max(0, quantity * rounds + modifier); formula = `cards × rounds + modifier`; break;
    case "game-session": value = Math.max(0, base * players * rounds + modifier); formula = `minutes × players × rounds + modifier`;
      break;
    case "streamer": value = Math.max(0, base * rounds + modifier); formula = `viewers × rounds + modifier (session-view units)`; break;
    case "team": value = players > 0 ? (base + modifier) / players : 0; formula = `(base + modifier) ÷ players (per-player value)`; break;
    case "guild": case "clan": value = Math.max(0, base + modifier * players); formula = `base + modifier × members`; break;
    case "rpg-character": case "fantasy-character": case "npc": value = Math.max(0, base + modifier * level); formula = `base + modifier × level`; break;
    default: value = Math.max(0, base + modifier); formula = `base + modifier`;
  }
  return `${title(family)} Calculator\n\nResult: ${Number.isInteger(value) ? value : value.toFixed(2)}\nFormula: ${formula}\nInputs: base=${base}, modifier=${modifier}, quantity=${quantity}, sides=${sides}, level=${level}, players=${players}, rounds=${rounds}`;
}

function htmlEscape(value: string) { return value.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!)); }

function trackerHtml(family: string, name: string, entries: string[]) {
  const rows = (entries.length ? entries : ["Objective", "Checkpoint", "Reward"]).map((e, i) => `<label><input type="checkbox" data-i="${i}"> ${htmlEscape(e || `Item ${i + 1}`)}</label>`).join("<br>");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title(family))} Tracker</title><style>body{font-family:system-ui;max-width:680px;margin:40px auto;padding:0 18px}label{display:block;margin:12px 0}</style></head><body><h1>${htmlEscape(name)} — ${htmlEscape(title(family))} Tracker</h1><p>Progress is saved locally in this browser.</p><section>${rows}</section><script>const key='env-${family}-tracker';const boxes=[...document.querySelectorAll('input')];const saved=JSON.parse(localStorage.getItem(key)||'[]');boxes.forEach((b,i)=>b.checked=!!saved[i]);boxes.forEach((b,i)=>b.onchange=()=>{saved[i]=b.checked;localStorage.setItem(key,JSON.stringify(saved));});</script></body></html>`;
}

export function buildGamingOutput(family: string, workflow: GamingWorkflow, input: GamingInput): string {
  if (!FAMILIES.includes(family as (typeof FAMILIES)[number])) throw new Error("Unsupported gaming family.");
  const name = clean(input.name, `${title(family)} Project`);
  const level = num(input.level, 1, 1);
  const quantity = num(input.quantity, 1, 1);
  if (workflow === "calculator") return calculateGaming(family, input);
  if (workflow === "generator") return `${title(family)} Generator\n\n${familyProfile(family, name, level)}\n\nNotes: ${clean(input.notes, "Generated locally by enV.")}`;
  if (workflow === "randomizer") {
    return `${title(family)} Randomizer\n\nSelection: ${pick(TRAITS)} ${pick(ROLES)}\nRarity: ${pick(RARITIES)}\nElement: ${pick(ELEMENTS)}\nRoll: ${Math.floor(Math.random() * 100) + 1}`;
  }
  if (workflow === "planner") {
    const tasks = input.entries.filter(Boolean);
    return `${title(family)} Planner\n\nName: ${name}\nGoal: ${clean(input.notes, "Complete the session objective") }\n\n${(tasks.length ? tasks : ["Define objective", "Prepare participants/resources", "Run the session", "Record results", "Review next steps"]).map((x,i)=>`${i+1}. ${x}`).join("\n")}`;
  }
  if (workflow === "tracker") return trackerHtml(family, name, input.entries);
  const entries = input.entries.filter(Boolean);
  if (entries.length < 2) throw new Error("Enter at least two entries for the bracket.");
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  const pairs = [];
  for (let i = 0; i < shuffled.length; i += 2) pairs.push(`<li>${htmlEscape(shuffled[i]!)} vs ${htmlEscape(shuffled[i + 1] ?? "BYE")}</li>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(title(family))} Bracket</title></head><body><main><h1>${htmlEscape(title(family))} Bracket</h1><ol>${pairs.join("")}</ol><p>Pairings are generated locally; refresh/re-run to reshuffle.</p></main></body></html>`;
}

export const gamingFamilies = [...FAMILIES];
