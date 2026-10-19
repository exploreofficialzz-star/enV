#!/usr/bin/env node
/** Dependency-free regression audit for the screenshot-scoped menu, Agent naming, and auth launch gates. */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const errors = [];
const read = path => { try { return readFileSync(resolve(path), "utf8"); } catch { errors.push(`Missing file: ${path}`); return ""; } };
const requireText = (path, fragments, label = path) => {
  const source = read(path);
  for (const item of fragments) if (!source.includes(item)) errors.push(`${label} is missing ${item}`);
  return source;
};
const footer = requireText("src/components/layout/footer.tsx", ["<footer", "chAs Technologies LLC", "<Logo />", "Privacy", "Terms", "Disclaimer", "Responsible use"], "Web footer");
if (["About", "Help center", "Token guide", "Blog & guides"].some(link => footer.includes(link))) errors.push("Web footer must not duplicate the screenshoted Product/Resources link groups.");
const header = requireText("src/components/layout/header.tsx", ["/about", "/tools", "/pricing", "/tokens", "/help", "/blog", "/contact", "/login", "/signup", "AI Agent"], "Web overflow menu");
if (/\/privacy|\/terms|\/disclaimer|\/responsible-use/.test(header)) errors.push("Legal links must remain in the footer, not the Product/Resources overflow menu.");
for (const path of ["src/routes/login.tsx", "src/routes/signup.tsx", "src/routes/forgot-password.tsx", "src/routes/reset-password.tsx", "src/routes/api/auth/$.ts", "src/routes/agent.tsx"]) if (!existsSync(resolve(path))) errors.push(`Missing route: ${path}`);
requireText("src/lib/auth/server.ts", ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "RESEND_API_KEY", "sendVerificationEmail", "sendResetPassword"], "Server auth wiring");
requireText("src/lib/auth/client.ts", ["VITE_AUTH_ENABLED", "VITE_AUTH_EMAIL_ENABLED"], "Auth client gates");
const agent = requireText("src/lib/ai/server/tasks/assistant.ts", ["You are the enV AI Agent", "user must open each tool"], "Agent capability instructions");
if (!agent.includes("Never claim to open, run, operate, monitor, or finish")) errors.push("Agent prompt does not protect against claiming tool execution.");
const android = requireText("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt", ["AI Agent", "Sign in", "Create account", "PRODUCT", "RESOURCES", "FooterLegalLinks", "private fun WebHomeFooter(catalog: Catalog, onInformation: (String) -> Unit, screenWidth: Int)"], "Android menu/footer");
if (android.includes('Text("LEGAL"')) errors.push("Android Legal section was moved into the overflow menu.");
requireText("apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt", ['"help" -> "Help center"', '"tokens" -> "Token guide"'], "Android information pages");
const ios = requireText("apps/ios/enV/enVApp.swift", ['Label("AI Agent"', 'Button("Sign in")', 'Button("Create account")', 'Section("PRODUCT")', 'Section("RESOURCES")'], "iOS overflow menu");
if (ios.includes('Label("AI assistant"')) errors.push("iOS tab still labels the product AI assistant.");
if (ios.includes('Section("LEGAL")')) errors.push("Legal links should not be in the screenshoted Product/Resources menu.");
const iosViews = requireText("apps/ios/enV/ContentViews.swift", ['HomePreviewBar(title: "AI Agent"', "private struct WebHomeFooter: View", 'linkGroup("Legal"', "Understanding tokens"]);
if (/linkGroup\("Product"|linkGroup\("Resources"/.test(iosViews)) errors.push("iOS footer still renders the moved Product/Resources link groups.");
requireText("apps/ios/enV/AssistantChat.swift", ['enVCharacterSpacedText("AI Agent")'], "iOS Agent title");
if (errors.length) { console.error(`Agent/auth/navigation audit failed with ${errors.length} error(s):`); for (const error of errors) console.error(`- ${error}`); process.exit(1); }
console.log("Agent/auth/navigation audit passed: screenshot-scoped Product/Resources overflow groups, retained Legal footer, auth wiring and Agent capability boundaries are present across Web, Android and iOS.");
