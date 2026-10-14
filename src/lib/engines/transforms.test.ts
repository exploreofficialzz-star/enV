import test from "node:test";
import assert from "node:assert/strict";
import { transforms } from "./transforms.ts";

test("text JS formatter formats minified async/arrow code without empty output", () => {
  const input = 'const load=async(url)=>{const response=await fetch(url);return {ok:response.ok,data:await response.json()};};';
  const output = transforms["js-format"]!(input);
  assert.ok(output.trim().length > 0);
  assert.ok(output.split("\n").length >= 5, output);
  assert.ok(output.includes("async"));
  assert.ok(output.includes("await fetch"));
  assert.ok(output.includes("Note: conservative local formatter"));
  assert.throws(() => transforms["js-format"]!(""), /Paste JavaScript|TypeScript code/);
});

test("text SQL formatter uses useful clauses and leaves keyword phrases in literals intact", () => {
  const input = "SELECT u.id, u.name, 'group by or order by' AS note FROM users u LEFT JOIN teams t ON t.id=u.team_id WHERE u.active=1 GROUP BY u.id,u.name HAVING COUNT(*)>0 ORDER BY u.name;";
  const output = transforms["sql-format"]!(input);
  assert.ok(output.includes("\nFROM"), output);
  assert.ok(output.includes("\nGROUP BY"), output);
  assert.ok(output.includes("\nHAVING"), output);
  assert.ok(output.includes("'group by or order by'"), output);
  assert.ok(!output.includes("'\ngroup by"), output);
  assert.equal(transforms["sql-format"]!("   "), "");
});
