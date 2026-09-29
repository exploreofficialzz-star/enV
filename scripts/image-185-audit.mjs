import fs from "node:fs";

const source = fs.readFileSync("src/data/catalog.ts", "utf8");
const fragments = [...source.matchAll(/^"(.*)"[, ]*$/gm)].map((match) => JSON.parse(match[0].replace(/,$/, "")));
const catalog = JSON.parse(fragments.join(""));
const images = catalog.filter((item) => item.category === "image");
if (images.length !== 185) throw new Error(`Expected 185 image tools, found ${images.length}`);
for (const item of images) if (!item.engine?.op) throw new Error(`Missing image operation for ${item.id}`);
console.log(`Image catalog audit: ${images.length} tools present with engine operations.`);
