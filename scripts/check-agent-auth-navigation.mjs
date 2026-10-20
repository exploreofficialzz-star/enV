#!/usr/bin/env node
/** Dependency-free regression audit for the requested Account/Wallet and screenshot-scoped overflow menu. */
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
if (["Token guide", "Help center", "Blog & guides", "Product", "Resources"].some(item => footer.includes(item))) errors.push("Product and Resources groups must be moved out of the web footer.");
const header = requireText("src/components/layout/header.tsx", ["/account", "/wallet", "/about", "/tools", "/pricing", "/tokens", "/help", "/blog", "/contact", 'title: "Product"', 'title: "Resources"'], "Web overflow menu");
const webMenu = header.split('<details className="group relative">')[1]?.split("</details>")[0] ?? "";
for (const removed of ["Explore enV", "Product, help, and account links", 'to="/agent"', "AI Agent", "Search tools", "Sign in", "Create account", "/privacy", "/terms", "/disclaimer", "/responsible-use"]) {
  if (webMenu.includes(removed)) errors.push(`Web overflow menu still contains removed item: ${removed}`);
}
if (!webMenu.includes('to="/account"') || !webMenu.includes('to="/wallet"')) errors.push("Account must appear before Wallet at the top of the overflow menu.");
for (const path of ["src/routes/account.tsx", "src/routes/wallet.tsx", "src/routes/login.tsx", "src/routes/signup.tsx", "src/routes/forgot-password.tsx", "src/routes/reset-password.tsx", "src/routes/api/auth/$.ts", "src/routes/agent.tsx", "src/routes/token-dashboard.tsx", "src/routes/tokens.guide.tsx", "src/components/billing/token-dashboard.tsx", "server/routes/api/billing/token-usage.get.ts", "src/lib/billing/token-usage.server.ts"]) if (!existsSync(resolve(path))) errors.push(`Missing route: ${path}`);
const account = requireText("src/routes/account.tsx", ['createFileRoute("/account")', 'AuthPage mode="sign-in"'], "Account page");
if (account.includes("Wallet") || account.includes("Manage your enV identity")) errors.push("The Account route must open sign-in directly without an overview or wallet panel.");
const wallet = requireText("src/routes/wallet.tsx", ['createFileRoute("/wallet")', "Total balance", "Tag enV on your videos", "Refer a friend"], "Wallet page");
for (const item of ['const isWalletPage = pathname === "/wallet"', '<h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">Wallet</h1>', 'aria-label="Notifications"', 'aria-label="Profile and account"']) {
  if (!header.includes(item)) errors.push(`Wallet shared header is missing ${item}`);
}
const authPage = requireText("src/components/auth/auth-page.tsx", ['type="email"', 'autoComplete={isSignUp ? "new-password" : "current-password"}', "Confirm password", "EyeOff", "Sign in with Google", "Sign in with Apple", "Forgot password?", '"/signup"'], "Sign-in/sign-up page");
if (authPage.includes("Authentication is disabled until production")) errors.push("Sign-in/sign-up UI still displays the configuration warning.");
const tokenPage = requireText("src/routes/tokens.guide.tsx", ["Token guide", "Tool-by-tool token explanations", "Balance & history"], "Token guide");
for (const removed of ["Preview only", "Prices are not charged in this preview", "All generated rates are provisional", "Purchases and automatic token deductions are disabled"]) if (tokenPage.includes(removed)) errors.push(`Token guide still contains placeholder wording: ${removed}`);
const home = requireText("src/routes/index.tsx", ['to="/tokens" aria-label="Open token dashboard"', "AI Agent"], "Home token dashboard link");
const auth = requireText("src/lib/auth/server.ts", ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "sendVerificationEmail", "sendResetPassword", "socialProviders", "googleConfigured", "appleConfigured"], "Server auth wiring");
requireText("src/lib/auth/client.ts", ["VITE_AUTH_ENABLED", "VITE_AUTH_EMAIL_ENABLED"], "Auth client gates");

const nativeAndroid = requireText("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt", ['Text("Account")', 'Text("Wallet")', 'Text("PRODUCT"', 'Text("RESOURCES"', 'Text("Token guide")', 'informationPage = "tokens"', "FooterLegalLinks"], "Android menu/footer");
const androidMenu = nativeAndroid.split("DropdownMenu(expanded = overflowExpanded, onDismissRequest = { overflowExpanded = false })")[1]?.split("colors = TopAppBarDefaults.topAppBarColors")[0] ?? "";
for (const removed of ['Text("AI Agent")', 'Text("Sign in")', 'Text("Create account")', 'Text("Search tools")', 'Text("LEGAL")']) if (androidMenu.includes(removed)) errors.push(`Android overflow menu still contains ${removed}`);
requireText("apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt", ['"help" -> "Help center"', '"tokens" -> "Token guide"', 'Text("Continue to sign in")', 'https://envtools.store/account'], "Android Account/token pages");
if (!androidMenu.includes('Uri.parse("https://envtools.store/account")')) errors.push("Android Account must open the unified enV sign-in page directly.");

const ios = requireText("apps/ios/enV/enVApp.swift", ['Button("Account")', 'Button("Wallet")', 'Section("PRODUCT")', 'Section("RESOURCES")'], "iOS overflow menu");
const iosMenuStart = ios.indexOf("Menu {", ios.indexOf("ToolbarItemGroup(placement: .topBarTrailing)"));
const iosMenuEnd = ios.indexOf("} label: {", iosMenuStart);
const iosMenu = iosMenuStart >= 0 && iosMenuEnd > iosMenuStart ? ios.slice(iosMenuStart, iosMenuEnd) : "";
for (const removed of ['Button("AI Agent")', 'Button("Sign in")', 'Button("Create account")', 'Button("Search tools")', 'Section("LEGAL")']) if (iosMenu.includes(removed)) errors.push(`iOS overflow menu still contains ${removed}`);
const iosViews = requireText("apps/ios/enV/ContentViews.swift", ['HomePreviewBar(title: "Total token = 100", action:', "private struct WebHomeFooter: View", 'linkGroup("Legal"', "Understanding tokens"]);
if (/linkGroup\("Product"|linkGroup\("Resources"/.test(iosViews)) errors.push("iOS footer still renders the moved Product/Resources groups.");
if (!iosMenu.includes('https://envtools.store/account')) errors.push("iOS Account must open the unified enV sign-in page directly.");
if (!iosViews.includes('Button("Continue to sign in")') || !iosViews.includes('https://envtools.store/account')) errors.push("iOS Account entry must use the shared enV sign-in page.");

const blogPage = requireText("src/routes/blog.tsx", [
  "Blogs &amp; Guides",
  'placeholder="Search blogs, guides, and tools…"',
  "lg:flex-row lg:items-start lg:justify-between",
  "Search blogs, guides, and tools",
], "Web Blogs & Guides");
if (blogPage.includes("enV knowledge centre")) errors.push("Web Blogs & Guides must not show the removed knowledge-centre badge.");
if (blogPage.includes('placeholder="Search tools and guides…')) errors.push("Web Blogs & Guides must not show a duplicate search field below the header.");

const androidGradle = requireText("apps/android/app/build.gradle.kts", ['androidx.browser:browser:1.8.0'], "Android in-app browser dependency");
const androidBlogBrowser = requireText("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt", [
  "CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(\"https://envtools.store/blog\"))",
], "Android shared Blogs & Guides route");
if (androidBlogBrowser.includes("https://en-v.vercel.app/blog")) errors.push("Android Blogs & Guides must use the canonical envtools.store URL.");

const iosBlogBrowser = requireText("apps/ios/enV/enVApp.swift", [
  "import SafariServices",
  "@State private var isShowingBlogGuides = false",
  'Button("Blog & guides") { isShowingBlogGuides = true }',
  'fullScreenCover(isPresented: $isShowingBlogGuides)',
  'EnVSafariBrowser(url: url)',
  "https://envtools.store/blog",
], "iOS shared Blogs & Guides route");
if (iosBlogBrowser.includes("https://en-v.vercel.app/blog")) errors.push("iOS Blogs & Guides must use the canonical envtools.store URL.");
if (errors.length) { console.error(`Account/Wallet navigation audit failed with ${errors.length} error(s):`); for (const error of errors) console.error(`- ${error}`); process.exit(1); }
console.log("Account/Wallet navigation audit passed: Product/Resources groups, separate Wallet page, direct shared Account sign-in, password controls, Google/Apple actions, token guide, and Legal footer are present.");
