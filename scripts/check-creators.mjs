import fs from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";
const s=fs.readFileSync("src/data/catalog.ts","utf8");
const tools=parseGeneratedCatalog(s); const xs=tools.filter(t=>t.category==="creators");
const bad=xs.filter(t=>t.status!=="active" || !["calculator","generator","image","custom","creator"].includes(t.engine.type));
console.log(`Creators audit: ${xs.length} tools, ${xs.filter(t=>t.status!=="planned").length} active`);
if(bad.length){console.error(bad.map(x=>x.id).join("\n"));process.exit(1)}
console.log("Creators audit passed.");

const read = (path) => fs.readFileSync(path, "utf8");
const shell = read("src/components/tools/tool-shell.tsx");
const categoryRoute = read("src/routes/tools/$category/index.tsx");
const toolRoute = read("src/routes/tools/$category/$slug.tsx");
const engine = read("src/components/engines/creator-engine.tsx");
const launcher = read("src/components/tools/creator-category-launcher.tsx");
const styles = read("src/components/engines/creator-engine.css");
const checks = [
  [shell.includes("env-device-tool-page"), "creator tool page uses full-height device shell"],
  [shell.includes("tool.category !== \"creators\""), "creator shell omits editorial sections"],
  [shell.includes("creator-engine.css"), "device styles load on direct tool entry"],
  [categoryRoute.includes("CreatorCategoryLauncher"), "creator category opens compact launcher"],
  [categoryRoute.includes("showChrome={false}"), "creator launcher hides site chrome"],
  [toolRoute.includes("showChrome={tool.category !== \"creators\"}"), "creator tools open without site chrome"],
  [engine.includes("env-creator-workspace__result") && engine.includes("navigator.clipboard"), "creator output supports copy"],
  [!engine.includes("<CodeResult"), "creator tools avoid legacy long result panel"],
  [launcher.includes("Search tools") && launcher.includes("FILTERS"), "launcher supports search and platform filters"],
  [styles.includes("100dvh") && styles.includes("safe-area-inset") && styles.includes("max-width: 639px"), "device UI adapts to mobile viewports"],
];
const creatorLogic = read("src/lib/engines/creator.ts");
const formulas = read("src/lib/engines/formulas.ts");
const generators = read("src/lib/engines/generators.ts");
const ioEngines = read("src/components/engines/io-engines.tsx");
const platformPresets = read("src/lib/image/platform-presets.ts");
const platformStudio = read("src/components/engines/image/platform-studio.tsx");
checks.push(
  [creatorLogic.includes("audienceWindows") && creatorLogic.includes("function postingTime") && creatorLogic.includes("function contentPlan"), "platform creator workflows are connected"],
  [creatorLogic.includes("spotify") && creatorLogic.includes("apple-music") && creatorLogic.includes("podcast"), "music and podcast workflows are differentiated"],
  [formulas.includes('historicalRoyaltyCalculator("spotify"') && formulas.includes('historicalRoyaltyCalculator("apple-music"'), "music royalty tools use historical statements"],
  [!formulas.includes('earn("spotify", [f("streams", "Streams"), f("perStream"') && formulas.includes("Net creator amount per 1,000 ad impressions"), "fixed streaming assumptions are removed and Twitch uses creator net"],
  [formulas.includes("Ad fill rate") && creatorLogic.includes("Engaged listeners"), "podcast revenue and audience measures are separated"],
  [generators.includes("Tag set generated from your keywords and selected platform context"), "hashtag output is platform aware and transparent"],
  [ioEngines.includes("Specific niche / audience") && ioEngines.includes("Maximum tags"), "hashtag controls collect a niche and platform"],
  [platformPresets.includes("spotify: { ...info(") && platformPresets.includes('"apple-music": { ...info(') && platformPresets.includes("podcast: { ...info("), "cover art presets include Spotify, Apple Music and podcasts"],
  [platformStudio.includes("allowAlpha") && platformStudio.includes("pl.alphaAllowed === false") && platformStudio.includes("info.verified"), "artwork export enforces opacity and platform-specific check dates"],
);
const failed = checks.filter(([ok]) => !ok);
for (const [ok, label] of checks) console.log((ok ? "✓ " : "✗ ") + label);
if (failed.length) process.exit(1);
console.log("Creator device UI audit passed.");
