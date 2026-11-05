import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rewriteSubdomainInput, rewriteSubdomainOutput, SUBDOMAIN_REWRITES } from "../src/lib/subdomain-routing.ts";

const expected = [
  ["android.envtools.store", "/", "/platform/android"],
  ["ios.envtools.store", "/", "/platform/ios"],
  ["feedback.envtools.store", "/", "/feedback"],
  ["updates.envtools.store", "/", "/updates"],
  ["userbehavior.envtools.store", "/", "/userbehavior"],
];

for (const [host, publicPath, internalPath] of expected) {
  const publicUrl = new URL("https://" + host + publicPath + "?source=app#top");
  const internal = rewriteSubdomainInput({ url: publicUrl });
  assert.ok(internal, host + " root must resolve to its dedicated route");
  assert.equal(internal.hostname, host);
  assert.equal(internal.pathname, internalPath);
  assert.equal(internal.search, "?source=app");
  assert.equal(internal.hash, "#top");

  const external = rewriteSubdomainOutput({ url: internal });
  assert.ok(external, host + " internal route must have a public URL");
  assert.equal(external.pathname, publicPath);
  assert.equal(external.search, "?source=app");
  assert.equal(external.hash, "#top");
}

for (const host of ["feedback.envtools.store", "updates.envtools.store"]) {
  const internalAdmin = rewriteSubdomainInput({ url: new URL("https://" + host + "/admin?tab=queue") });
  assert.ok(internalAdmin, host + "/admin must resolve to the protected workspace");
  assert.equal(internalAdmin.pathname, "/developer");
  const externalAdmin = rewriteSubdomainOutput({ url: internalAdmin });
  assert.ok(externalAdmin);
  assert.equal(externalAdmin.pathname, "/admin");
  assert.equal(externalAdmin.search, "?tab=queue");
}

for (const host of Object.keys(SUBDOMAIN_REWRITES)) {
  const toolUrl = new URL("https://" + host + "/tools/calculators/example-tool?mode=offline");
  assert.equal(rewriteSubdomainInput({ url: toolUrl }), undefined, "Tool routes must remain unchanged on " + host);
  assert.equal(rewriteSubdomainOutput({ url: toolUrl }), undefined, "Tool links must remain unchanged on " + host);
}

assert.equal(rewriteSubdomainInput({ url: new URL("https://envtools.store/") }), undefined);
assert.equal(rewriteSubdomainOutput({ url: new URL("https://envtools.store/platform/android") }), undefined);

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const rewrites = vercel.rewrites ?? [];
for (const [host, mapping] of Object.entries(SUBDOMAIN_REWRITES)) {
  for (const [source, destination] of Object.entries(mapping.input)) {
    const rule = rewrites.find(item =>
      item.source === source && item.destination === destination &&
      (item.has ?? []).some(condition => condition.type === "host" && condition.value === host)
    );
    assert.ok(rule, "Vercel rewrite missing or mismatched: " + host + " " + source + " -> " + destination);
  }
}

const router = readFileSync(new URL("../src/router.tsx", import.meta.url), "utf8");
assert.match(router, /rewriteSubdomainInput/);
assert.match(router, /rewriteSubdomainOutput/);
assert.match(router, /rewrite:\s*\{/);

console.log("Subdomain routing checks passed: five product hosts, both developer aliases, tool-route preservation, and Vercel/router parity.");
