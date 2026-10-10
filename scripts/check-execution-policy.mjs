import fs from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const root = new URL("../", import.meta.url);
const policy = JSON.parse(fs.readFileSync(new URL("../apps/shared/execution-policy.json", import.meta.url), "utf8"));
const catalog = parseGeneratedCatalog(fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8"));
const byFamily = new Map();
for (const tool of catalog) {
  const family = tool.engine?.type === "document-backend" ? "document-backend"
    : tool.engine?.type === "url-media" || tool.engine?.type === "url-media-info" ? "remote-url"
      : tool.category === "qr" ? "qr"
        : tool.category === "barcode" ? "barcode"
          : tool.category === "screenshots" ? "screenshots"
            : tool.category === "mockups" ? "mockups"
              : ["image", "audio", "video"].includes(tool.engine?.type) ? tool.engine.type === "image" ? "image" : "media"
                : null;
  if (family) byFamily.set(family, (byFamily.get(family) ?? 0) + 1);
}
const errors = [];
if (policy.schemaVersion !== 1) errors.push(`Unsupported execution policy schemaVersion=${policy.schemaVersion}`);
for (const [family, count] of byFamily) {
  const entry = policy.families[family];
  if (!entry) errors.push(`Catalog family ${family} has ${count} records but no execution policy.`);
  for (const platform of policy.platforms) {
    const route = entry?.[platform];
    if (!route || !policy.modes.includes(route.mode)) errors.push(`${family}.${platform} must declare one of ${policy.modes.join(", ")}.`);
    if (route?.mode === "local" && !route.implementation) errors.push(`${family}.${platform} declares local without an implementation.`);
    if (route?.mode === "remote-required" && entry?.consent !== "required") errors.push(`${family}.${platform} is remote-required without consent=required.`);
  }
  if (entry?.remoteFallback && entry?.consent !== "required") errors.push(`${family} enables remoteFallback without consent=required.`);
}
const active = catalog.filter((tool) => tool.status === "active" || tool.status === "beta");
const nativeClaims = Object.entries(policy.families).flatMap(([family, entry]) => policy.platforms.filter((p) => entry[p]?.mode === "local").map((p) => `${family}.${p}`));
console.log(`Execution policy audit: schema ${policy.schemaVersion}, ${Object.keys(policy.families).length} families, ${active.length} active catalog tools, ${nativeClaims.length} local platform family claims.`);
for (const [family, count] of [...byFamily.entries()].sort()) console.log(`  ${family}: ${count} catalog records`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Execution policy audit passed.");
}
