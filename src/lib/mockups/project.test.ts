import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultProject, validateProject } from "./project.ts";

test("default mockup project is structured and versioned", () => {
  const project = createDefaultProject("whatsapp");
  assert.equal(project.schemaVersion, 1);
  assert.equal(project.platform, "whatsapp");
  assert.equal(project.scene, "chat");
  assert.ok(project.messages.length >= 3);
  assert.ok(project.profiles.length >= 2);
  assert.ok(validateProject(project));
});

test("project validation rejects unstructured values", () => {
  assert.equal(validateProject(null), false);
  assert.equal(validateProject({ platform: "whatsapp" }), false);
});
