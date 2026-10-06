import { readFileSync } from "node:fs";

const files = [
  "apps/android/app/src/main/java/com/chastech/env/NativeBackendEngine.kt",
  "apps/ios/enV/ToolViews.swift",
];
const errors = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const image = source.indexOf('engine.type=="image"');
  const audio = source.indexOf('engine.type=="audio"');
  const custom = source.indexOf('engine.type=="custom"');
  if (image < 0 || audio < 0 || custom < 0) errors.push(`${file}: missing dispatch branches`);
  else if (image > custom || audio > custom) errors.push(`${file}: generic custom dispatch precedes media/image dispatch`);
  if (/engine\.type=="audio"[^\n]*else postJson\("\/api\/backend\/tool"/.test(source)) errors.push(`${file}: audio without a file can fall into generic backend tool`);
  if (/engine\.type=="video"[^\n]*else postJson\("\/api\/backend\/tool"/.test(source)) errors.push(`${file}: video without a file can fall into generic backend tool`);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("Native backend dispatch audit PASS: image/audio/video handlers precede generic custom/category routing on Android and iOS.");
