import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const apiBase = readFileSync(new URL("../../src/lib/api/base.ts", import.meta.url), "utf8");
const authPage = readFileSync(new URL("../../src/components/auth/auth-page.tsx", import.meta.url), "utf8");
const backendDocs = readFileSync(new URL("../../backend/README.md", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");

test("Web API calls default to relative same-origin routes", () => {
  assert.match(apiBase, /export const API_BASE_URL = configured\.replace/);
  assert.match(apiBase, /return `\$\{API_BASE_URL\}\$\{route\}`/);
  assert.doesNotMatch(apiBase, /https:\/\/env-q3mq\.onrender\.com/);
  assert.match(envExample, /VITE_API_BASE_URL=/);
  assert.doesNotMatch(envExample, /VITE_API_BASE_URL=https:\/\/env-q3mq\.onrender\.com/);
});

test("successful email and social sign-in return to the enV home page, not the optional AI Agent", () => {
  assert.match(authPage, /callbackURL: "\/"/);
  assert.match(authPage, /window\.location\.assign\("\/"\)/);
  assert.doesNotMatch(authPage, /callbackURL: "\/agent"|window\.location\.assign\("\/agent"\)/);
  assert.match(authPage, /: "\/",/);
});

test("native API gateway remains separate from the Web same-origin API", () => {
  assert.match(backendDocs, /Web client calls the same-origin Vercel routes/);
  assert.match(backendDocs, /Android and iOS remain independent native clients/);
  assert.match(backendDocs, /https:\/\/env-q3mq\.onrender\.com/);
});
