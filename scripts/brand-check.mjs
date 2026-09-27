#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OG_SITE_REL_PATH, readOgSite, siteHasCustomCard } from "./pwa-shared.mjs";

export const MAX_CARD_BYTES = 600 * 1024;
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function siteDeclaresOgTypeGame(site) {
  return String(site?.type ?? "").toLowerCase() === "x:game";
}

export function computeBrandWarnings({ hasCanvas = false, workspaceRoot = PROJECT_ROOT } = {}) {
  const sitePath = join(workspaceRoot, OG_SITE_REL_PATH);
  const site = readOgSite(workspaceRoot);
  const cardPath = [join(workspaceRoot, "public/og.jpg"), join(workspaceRoot, "public/og.png")].find(existsSync);
  const warnings = [];

  if (cardPath) {
    if (statSync(cardPath).size > MAX_CARD_BYTES) {
      warnings.push(`BRAND WARNING: ${cardPath} exceeds the 600 KB share-card budget.`);
    }
    if (!siteHasCustomCard(site)) {
      warnings.push(`BRAND WARNING: ${cardPath} exists but ${sitePath} does not declare "card": "custom".`);
    }
  } else if (hasCanvas) {
    warnings.push(`BRAND WARNING: a canvas-heavy experience needs a custom 1200×630 share image at ${workspaceRoot}/public/og.jpg.`);
  } else {
    warnings.push("BRAND NOTE: no custom Open Graph share image is configured.");
  }

  if (hasCanvas && !siteDeclaresOgTypeGame(site)) {
    warnings.push(`BRAND WARNING: ${sitePath} should declare "type": "x:game" for a canvas game.`);
  }
  if (hasCanvas && cardPath && !existsSync(join(workspaceRoot, "public/x-banner.jpg"))) {
    warnings.push(`BRAND WARNING: canvas games should provide a 1200×264 social banner at ${workspaceRoot}/public/x-banner.jpg.`);
  }
  return warnings;
}

export function parseBrandCheckArgs(argv) {
  const usage = "usage: node scripts/brand-check.mjs [--game] [--root <directory>]";
  let game = false;
  let root = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--game") game = true;
    else if (argv[i] === "--root") {
      root = argv[++i];
      if (!root) return { error: `--root needs a directory — ${usage}` };
    } else return { error: `unexpected argument: ${argv[i]} — ${usage}` };
  }
  return { game, root };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseBrandCheckArgs(process.argv.slice(2));
  if (args.error) {
    console.error(JSON.stringify({ ok: false, error: args.error }, null, 2));
    process.exit(1);
  }
  const workspaceRoot = args.root ?? PROJECT_ROOT;
  const messages = computeBrandWarnings({ hasCanvas: args.game, workspaceRoot });
  const warnings = messages.filter((message) => message.startsWith("BRAND WARNING:"));
  console.log(JSON.stringify({ ok: warnings.length === 0, workspaceRoot, warnings: warnings.length, messages }, null, 2));
  process.exitCode = warnings.length ? 1 : 0;
}
