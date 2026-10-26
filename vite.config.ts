import { readdirSync } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JavaScript plugin alongside the TypeScript Vite config
import { siteMetaPlugin } from "./scripts/site-meta-plugin.mjs";
// @ts-expect-error JavaScript plugin alongside the TypeScript Vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
import { isMigrationFile } from "./scripts/migration-plan.mjs";
// @ts-expect-error JavaScript build hook alongside the TypeScript Vite config
import { copyPgliteRuntimeAssets } from "./scripts/pglite-runtime-assets.mjs";

function hasMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "env:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasMigrations(server.config.root)) return;
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as { ensureDbReady?: () => Promise<void> };
        if (typeof mod.ensureDbReady === "function") await mod.ensureDbReady();
      } catch (error) {
        console.error("[enV] database bootstrap failed:", error);
        throw error;
      }
    },
  };
}

export default defineConfig(({ command, isPreview }) => ({
  server: { host: "0.0.0.0", port: 8080, strictPort: true },
  preview: { host: "127.0.0.1", port: 8081, strictPort: true },
  resolve: { tsconfigPaths: true },
  plugins: [
    pgliteBootstrapPlugin(),
    appEnvPlugin(),
    siteMetaPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [nitro({ preset: "vercel", serverDir: "./server", modules: [{
          name: "env:pglite-runtime-assets",
          setup(nitro) {
            // Register alongside the preset; a config-level compiled hook replaces it.
            nitro.hooks.hook("compiled", async () => {
              await access(join(nitro.options.output.dir, "config.json"));
              await access(join(nitro.options.output.serverDir, ".vc-config.json"));
              await copyPgliteRuntimeAssets(nitro.options.output.serverDir);
            });
          },
        }] })]
      : []),
    viteReact(),
  ],
}));
