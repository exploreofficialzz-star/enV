import { readFileSync } from "node:fs";

const files = [
  "apps/android/app/src/main/java/com/chastech/env/NativeBackendEngine.kt",
  "apps/ios/enV/ToolViews.swift",
];
const apiOrigin = "https://env-q3mq.onrender.com";
const configurationFiles = [
  "apps/android/app/build.gradle.kts",
  "apps/android/.env.example",
  "apps/ios/enV.xcodeproj/project.pbxproj",
  "apps/ios/Config.xcconfig.example",
  "apps/android/README.md",
  "apps/ios/README.md",
];
const errors = [];
for (const file of configurationFiles) {
  const source = readFileSync(file, "utf8");
  if (!source.includes(apiOrigin)) errors.push(`${file}: missing canonical enV application API origin ${apiOrigin}`);
  if (source.includes("https://en-v.vercel.app")) errors.push(`${file}: still points ENV_API_BASE_URL at the Vercel website instead of the public Render API`);
}
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
const iosBackend = readFileSync("apps/ios/enV/ToolViews.swift", "utf8");
if (!iosBackend.includes("static func endpointURL(_ path: String) -> URL?")) errors.push("iOS: missing explicit API endpoint URL builder");
if (!iosBackend.includes("URLComponents(url: baseURL, resolvingAgainstBaseURL: false)")) errors.push("iOS: API endpoint builder must join route paths through URLComponents");
if (iosBackend.includes("baseURL.appendingPathComponent(path)")) errors.push("iOS: ambiguous leading-slash route path construction remains");
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("Native backend audit PASS: mobile builds target the enV API gateway, and image/audio/video handlers precede generic routing on Android and iOS.");
