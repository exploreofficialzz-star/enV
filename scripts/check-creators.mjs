import fs from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";
const s=fs.readFileSync("src/data/catalog.ts","utf8");
const tools=parseGeneratedCatalog(s); const xs=tools.filter(t=>t.category==="creators");
const bad=xs.filter(t=>t.status!=="active" || !["calculator","generator","image","custom","creator"].includes(t.engine.type));
console.log(`Creators audit: ${xs.length} tools, ${xs.filter(t=>t.status!=="planned").length} active`);
if(bad.length){console.error(bad.map(x=>x.id).join("\n"));process.exit(1)}
console.log("Creators audit passed.");
