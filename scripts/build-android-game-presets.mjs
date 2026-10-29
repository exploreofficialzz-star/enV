import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { starterProject, validateProject } from "../src/lib/game-studio/project.ts";

const destination = resolve(import.meta.dirname, "../apps/android/app/src/main/assets/game-presets");
await mkdir(destination, { recursive: true });
for (const name of ["starter", "courtyard", "gallery"]) {
  const project = starterProject(name);
  project.id = `preset-${name}`;
  project.objects.forEach((object, index) => { object.id = `preset-${name}-${index}`; });
  await writeFile(join(destination, `${name}.json`), `${JSON.stringify(validateProject(project), null, 2)}\n`);
}
console.log("Android preview presets generated from the web studio templates.");
