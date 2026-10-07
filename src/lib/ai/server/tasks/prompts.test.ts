import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { sha256Hex } from "../core/ids.ts";
import { ALL_TASKS } from "./index.ts";

const BOUNDARY = "bSNAPSHOTBOUNDARY";
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120, 7)]).toString("base64");
const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(200, 1)]).toString("base64");

/** One fixed, representative input per task. Changing these changes the snapshot, so keep them stable. */
const CANONICAL: Record<string, unknown> = {
  "creator.caption.generate": { topic: "grand opening of our neighbourhood bakery", platform: "instagram", tone: "friendly", language: "en", variants: 3, includeHashtags: true, audience: "local families" },
  "creator.title.generate": { topic: "how to learn guitar in thirty days", platform: "youtube", tone: "bold", language: "en", variants: 5, maxCharacters: 70 },
  "developer.regex.explain": { pattern: "^(?<user>[\\w.+-]+)@(?<host>[\\w-]+\\.[\\w.]+)$", flags: "i", sampleText: "ada@example.com" },
  "developer.sql.explain": { sql: "SELECT u.id, COUNT(o.id) FROM users u LEFT JOIN orders o ON o.user_id = u.id GROUP BY u.id", dialect: "postgresql" },
  "developer.json.explain": { json: '{"items":[{"id":1,"name":"a"}],"total":1}', goal: "find-issues" },
  "image.alt.generate": { imageBase64: png, mimeType: "image/png", context: "hero image on a bakery homepage", style: "concise" },
  "video.transcript.generate": { audioBase64: mp3, mimeType: "audio/mpeg", language: "en" },
  "assistant.chat": { messages: [{ role: "user", content: "Help me organize my week." }, { role: "assistant", content: "What are your main priorities?" }, { role: "user", content: "Work, exercise, and meal planning." }] },
};

const SNAPSHOT = new URL("./prompt-snapshots.json", import.meta.url);
const REFRESH = "UPDATE_AI_PROMPT_SNAPSHOTS=1 node --experimental-strip-types --test src/lib/ai/server/tasks/prompts.test.ts";

function current(): Record<string, { version: string; hash: string }> {
  const out: Record<string, { version: string; hash: string }> = {};
  for (const task of ALL_TASKS) {
    const plan = task.plan(CANONICAL[task.id], { boundary: BOUNDARY });
    assert.ok(plan.ok, `${task.id}: canonical input is invalid (${plan.ok ? "" : plan.message})`);
    if (!plan.ok) continue;
    const user = plan.prepared.user.map((part) => (part.type === "text" ? part.text : { type: part.type, mimeType: part.mimeType }));
    out[task.id] = { version: task.version, hash: sha256Hex(JSON.stringify({ system: plan.prepared.system, user, schema: task.jsonSchema ?? null, language: plan.prepared.language ?? null })).slice(0, 16) };
  }
  return out;
}

test("prompts are versioned: any change to a task's prompt or output schema requires a new version", () => {
  const now = current();
  if (process.env.UPDATE_AI_PROMPT_SNAPSHOTS === "1") {
    writeFileSync(SNAPSHOT, JSON.stringify(now, null, 2) + "\n");
    return;
  }
  const saved = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as typeof now;
  assert.deepEqual(Object.keys(saved).sort(), Object.keys(now).sort(), `snapshot task list is out of date. Refresh with: ${REFRESH}`);
  for (const [id, entry] of Object.entries(now)) {
    const was = saved[id]!;
    if (was.hash === entry.hash && was.version === entry.version) continue;
    if (was.hash !== entry.hash && was.version === entry.version) {
      assert.fail(`${id}: its prompt or output schema changed but the version is still ${entry.version}. Bump the task's version, then refresh the snapshot with: ${REFRESH}`);
    }
    assert.fail(`${id}: version or content moved (${was.version} -> ${entry.version}) but the snapshot was not refreshed. Run: ${REFRESH}`);
  }
});

test("every prompt tells the model to treat user text as data and to answer only in the requested format", () => {
  for (const task of ALL_TASKS.filter((t) => t.structured)) {
    const plan = task.plan(CANONICAL[task.id], { boundary: BOUNDARY });
    assert.ok(plan.ok);
    if (!plan.ok) continue;
    assert.ok(plan.prepared.system.includes("untrusted user data"), `${task.id} lacks the untrusted-data guard`);
    assert.ok(plan.prepared.system.includes("only a JSON object"), `${task.id} does not demand JSON-only output`);
    assert.ok(!plan.prepared.system.includes(BOUNDARY), `${task.id} leaks the delimiter id into the system prompt`);
  }
});
