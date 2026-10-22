import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const roots = [
  path.join(projectRoot, "apps/android/app/src/main"),
  path.join(projectRoot, "apps/ios/enV"),
];
const forbidden = [/\bWebView\b/i, /\bWKWebView\b/i, /react-native-webview/i, /NativeWebFallback/i];
const extensions = new Set([".kt", ".swift", ".xml", ".plist", ".kts"]);
const hits = [];

function isAPCAWebBridgeLine(file, lines, index) {
  const line = lines[index].trim();
  if (file.endsWith(path.join("com/chastech/env", "NativeAccessibilityToolForm.kt"))) {
    const start = lines.findIndex((sourceLine) => sourceLine.trim() === "private fun ApcaWebDialog(onDismiss: () -> Unit) {");
    const end = lines.findIndex((sourceLine, lineIndex) => lineIndex > start && sourceLine.startsWith("private fun previewColor("));
    const importLine = /^import android\.webkit\.(?:WebSettings|WebView|WebViewClient)$/.test(line);
    return importLine || (start >= 0 && end > start && index >= start && index < end);
  }
  if (file.endsWith(path.join("apps/ios/enV", "ToolViews.swift"))) {
    const start = lines.findIndex((sourceLine) => sourceLine.trim() === "private struct APCAWebViewSheet: View {");
    const end = lines.findIndex((sourceLine, lineIndex) => lineIndex > start && sourceLine.startsWith("struct NativeBackendFile "));
    const iconStart = lines.findIndex((sourceLine) => sourceLine.trim() === "private struct UxUiNativeSVGIcon: UIViewRepresentable {");
    const iconEnd = lines.findIndex((sourceLine, lineIndex) => lineIndex > iconStart && sourceLine.startsWith("private struct UxUiNativeProject: Codable "));
    const apcaBridge = start >= 0 && end > start && index >= start && index < end;
    const isolatedIconRenderer = iconStart >= 0 && iconEnd > iconStart && index >= iconStart && index < iconEnd;
    return line === "import WebKit" || apcaBridge || isolatedIconRenderer;
  }
  return false;
}

function scanFile(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (forbidden.some((pattern) => pattern.test(line)) && !isAPCAWebBridgeLine(file, lines, index)) {
      hits.push(`${file}:${index + 1}:${line.trim()}`);
    }
  });
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (extensions.has(path.extname(file).toLowerCase())) scanFile(file);
  }
}

roots.forEach(walk);
if (hits.length) throw new Error(`Native source still contains unauthorized frontend runtime references:\n${hits.join("\n")}`);
console.log("Native no-web-runtime guard: PASS (WebView is limited to APCA in Color Contrast Studio)");
