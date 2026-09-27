import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JavaScript plugin alongside the TypeScript Vite config
import { pwaPlugin } from "./scripts/pwa-plugin.mjs";
// @ts-expect-error JavaScript plugin alongside the TypeScript Vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
import { isMigrationFile } from "./scripts/migration-plan.mjs";

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
    pwaPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [nitro({ preset: "vercel", serverDir: "./server" })]
      : []),
    viteReact(),
  ],
}));
