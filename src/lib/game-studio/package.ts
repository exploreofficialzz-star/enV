import { strToU8, zipSync } from "fflate";
import { validateProject, type GameProject } from "./project";
import engineUrl from "babylonjs/babylon.js?url";
import loadersUrl from "babylonjs-loaders/babylonjs.loaders.min.js?url";
import babylonLicense from "babylonjs/license.md?raw";
import babylonNotice from "babylonjs/NOTICE.md?raw";
import runtime from "./runtime.js?raw";
import godotProject from "./godot/project.godot?raw";
import godotScene from "./godot/main.tscn?raw";
import godotRuntime from "./godot/game.gd?raw";

const style = `html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#17202b;color:white;font-family:system-ui,sans-serif}canvas{display:block;width:100%;height:100%;touch-action:none}#status{position:absolute;top:14px;left:14px;max-width:70%;background:#111c2bdb;border-radius:8px;padding:9px 12px;font-size:13px}.touch{position:absolute;bottom:20px;left:20px;display:grid;grid-template-columns:repeat(3,48px);gap:4px}.touch button{height:48px;color:white;background:#172335c9;border:1px solid #ffffff55;border-radius:8px;font-size:18px;touch-action:none}.touch .up{grid-column:2}.touch .left{grid-column:1}@media(hover:hover) and (pointer:fine){.touch{display:none}}`;
export function gameHtml(
  project: GameProject,
  engine: string,
  loaders: string,
  runtimePath: string,
): string {
  const data = JSON.stringify(project)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>enV game</title><style>${style}</style></head><body><canvas id="game" aria-label="Game viewport" tabindex="0"></canvas><div id="status" role="status">Loading game…</div><div class="touch" aria-label="Movement controls"><button class="up" data-key="w" aria-label="Move forward">↑</button><button class="left" data-key="a" aria-label="Move left">←</button><button data-key="s" aria-label="Move backward">↓</button><button data-key="d" aria-label="Move right">→</button></div><script id="project-data" type="application/json">${data}</script><script src="${engine}"></script><script src="${loaders}"></script><script src="${runtimePath}"></script></body></html>`;
}
export function previewHtml(project: GameProject): string {
  const html = gameHtml(
    project,
    new URL(engineUrl, location.href).href,
    new URL(loadersUrl, location.href).href,
    "./runtime.js",
  );
  return html.replace(
    '<script src="./runtime.js"></script>',
    `<script>${runtime.replace(/<\/script/gi, "<\\/script")}</script>`,
  );
}
export async function buildGame(project: GameProject): Promise<Uint8Array> {
  const valid = validateProject(project);
  const [engine, loaders] = await Promise.all([fetch(engineUrl), fetch(loadersUrl)]);
  if (!engine.ok || !loaders.ok)
    throw new Error(
      "The game engine files could not be loaded. Check your connection and try again.",
    );
  const [engineBytes, loaderBytes] = await Promise.all([
    engine.arrayBuffer(),
    loaders.arrayBuffer(),
  ]);
  return zipSync(
    {
      "index.html": strToU8(gameHtml(valid, "./engine.js", "./loaders.js", "./runtime.js")),
      "engine.js": new Uint8Array(engineBytes),
      "loaders.js": new Uint8Array(loaderBytes),
      "runtime.js": strToU8(runtime),
      "project.json": strToU8(JSON.stringify(valid, null, 2)),
      "licenses/BabylonJS-LICENSE.txt": strToU8(babylonLicense),
      "licenses/BabylonJS-NOTICE.txt": strToU8(babylonNotice),
      "README.txt": strToU8(
        "enV 3D Studio browser build\n\nOpen index.html in a WebGL-capable browser. Use WASD or the arrow keys to move the player.\nAll project assets are embedded in this package.\n",
      ),
    },
    { level: 6 },
  );
}

/** Export source for Godot 4.6, not a compiled Android or iOS application. */
export function buildGodotProject(project: GameProject): Uint8Array {
  const valid = validateProject(project);
  return zipSync(
    {
      "project.godot": strToU8(godotProject),
      "main.tscn": strToU8(godotScene),
      "game.gd": strToU8(godotRuntime),
      "project.json": strToU8(JSON.stringify(valid, null, 2)),
      "README.txt": strToU8(
        "enV 3D Studio Godot source project\n\nOpen project.godot in Godot 4.6 and run the main scene. The scene and its embedded assets are read from project.json at runtime. This is source, not a compiled mobile app. When configuring a Godot export, include *.json as a non-resource file and install the platform export templates, SDKs and signing credentials. Test all target devices before release.\n",
      ),
    },
    { level: 6 },
  );
}
