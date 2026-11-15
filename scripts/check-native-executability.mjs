import fs from "node:fs";
import { getAllTools } from "../src/lib/registry.ts";

const m = JSON.parse(fs.readFileSync(new URL("../apps/shared/native-execution-matrix.json", import.meta.url), "utf8"));
const runtimeTools = getAllTools();
const runtimeIds = new Set(runtimeTools.map((tool) => tool.id));
const matrixIds = m.tools.map((tool) => tool.id);
const matrixIdSet = new Set(matrixIds);
const duplicateRows = matrixIds.filter((id, index) => matrixIds.indexOf(id) !== index);
const missingRuntimeIds = [...runtimeIds].filter((id) => !matrixIdSet.has(id));
const unexpectedMatrixIds = [...matrixIdSet].filter((id) => !runtimeIds.has(id));
const activeRuntimeCount = runtimeTools.filter((tool) => tool.status === "active" || tool.status === "beta").length;

if (duplicateRows.length || missingRuntimeIds.length || unexpectedMatrixIds.length) {
  throw new Error(
    "Native execution inventory mismatch: duplicateRows=" + duplicateRows.length +
    " missingRuntimeIds=" + missingRuntimeIds.length +
    " unexpectedMatrixIds=" + unexpectedMatrixIds.length +
    "; missing=" + missingRuntimeIds.slice(0, 30).join(", ") +
    "; unexpected=" + unexpectedMatrixIds.slice(0, 30).join(", ")
  );
}
if (m.stats.total !== runtimeIds.size || m.stats.active !== activeRuntimeCount) {
  throw new Error(
    "Native execution matrix counts differ from the runtime registry: matrixTotal=" +
    m.stats.total + " runtimeTotal=" + runtimeIds.size +
    " matrixActive=" + m.stats.active + " runtimeActive=" + activeRuntimeCount
  );
}
const active = m.tools.filter((tool) => tool.status === "active" || tool.status === "beta");
const divergent = active.filter((tool) => tool.android !== tool.ios);
const invalid = active.filter((tool) => !["offline-native", "backend-native", "web-only"].includes(tool.android) ||
  !["offline-native", "backend-native", "web-only"].includes(tool.ios));
const requiredWebOnly = ["smartphone-prototype-lab"];
const invalidWebOnly = requiredWebOnly.filter((id) => {
  const row = m.tools.find((tool) => tool.id === id);
  return !row || row.android !== "web-only" || row.ios !== "web-only" || !row.dispositionReason;
});
const fileWorkspaceIds = [
  "file-to-txt", "file-organizer", "batch-file-renamer", "duplicate-file-finder",
  "folder-size-analyzer", "file-search", "file-compare",
];
const invalidFileWorkspace = fileWorkspaceIds.filter((id) => {
  const row = m.tools.find((tool) => tool.id === id);
  return !row || row.android !== "offline-native" || row.ios !== "offline-native";
});
const musicDownloader = m.tools.find((tool) => tool.id === "music-downloader");
const invalidMusicDownloader = !musicDownloader ||
  musicDownloader.android !== "backend-native" ||
  musicDownloader.ios !== "backend-native";
if (invalid.length || divergent.length || invalidWebOnly.length || invalidFileWorkspace.length || invalidMusicDownloader) {
  throw new Error(
    "Native execution audit failed: invalid=" + invalid.length +
    " divergent=" + divergent.length +
    " webOnlyReasonMissing=" + invalidWebOnly.join(",") +
    " fileWorkspaceCoverageMissing=" + invalidFileWorkspace.join(",") +
    " musicDownloaderBackendNativeMismatch=" + invalidMusicDownloader
  );
}
console.log(
  "Native execution audit PASS: " + m.stats.fullyExecutable + "/" + m.stats.active +
  " active runtime records have matching native/backend paths; " + m.stats.webOnly +
  " active records are explicitly Web-only on both native products. " +
  m.stats.total + " unique runtime IDs are represented exactly once."
);
