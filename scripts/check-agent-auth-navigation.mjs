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
const webMenu = header.match(/<details\b[^>]*className="group relative"[^>]*>[\s\S]*?<\/details>/)?.[0] ?? "";
for (const removed of ["Explore enV", "Product, help, and account links", 'to="/agent"', "AI Agent", "Search tools", "Sign in", "Create account", "/privacy", "/terms", "/disclaimer", "/responsible-use"]) {
  if (webMenu.includes(removed)) errors.push(`Web overflow menu still contains removed item: ${removed}`);
}
if (!webMenu.includes('to="/account"') || !webMenu.includes('to="/wallet"')) errors.push("Account must appear before Wallet at the top of the overflow menu.");
const mobileViewPosition = webMenu.indexOf("Mobile view");
const tabletViewPosition = webMenu.indexOf("Tablet view");
const desktopViewPosition = webMenu.indexOf("Desktop view");
if (!(mobileViewPosition >= 0 && mobileViewPosition < tabletViewPosition && tabletViewPosition < desktopViewPosition)) errors.push("View modes must be ordered Mobile, Tablet, then Desktop.");
if (webMenu.includes("Select an active mode again") || webMenu.includes("overflow-y-auto") || webMenu.includes("max-h-")) errors.push("Overflow card must not include its removed reset hint or internal vertical scrolling.");
if (!header.includes('document.addEventListener("pointerdown", closeFromOutside)')) errors.push("Overflow menu must close after an outside click.");
if (!webMenu.includes("fixed right-3") || !webMenu.includes("w-[15.5rem]") || !webMenu.includes("max-w-[calc(100vw_-_5rem)]")) errors.push("Overflow card must remain right-aligned and compact on mobile instead of spanning nearly the whole screen.");
const viewModeBlock = webMenu.slice(webMenu.indexOf('aria-label="View mode"'), webMenu.indexOf("</section>", webMenu.indexOf('aria-label="View mode"')));
if (!viewModeBlock.includes("<Smartphone size={16}") || !viewModeBlock.includes("<Tablet size={16}") || !viewModeBlock.includes("<Monitor size={16}")) errors.push("Mobile, tablet, and desktop views must have distinct device icons.");
if ((viewModeBlock.match(/className=\{MENU_VIEW_ITEM_CLASS\}/g) ?? []).length !== 3 || !header.includes("gap-0") || (viewModeBlock.match(/style=\{\{ marginRight: "-4px" \}\}/g) ?? []).length !== 1 || (viewModeBlock.match(/style=\{\{ marginRight: "-2px" \}\}/g) ?? []).length !== 1 || (viewModeBlock.match(/style=\{\{ marginRight: "-1px" \}\}/g) ?? []).length !== 1) errors.push("Mobile, tablet, and desktop labels must be visually tight to their respective device glyphs, with inline-enforced icon spacing.");
if (!webMenu.includes("text-accent") || !header.includes("MENU_ITEM_CLASS")) errors.push("Overflow section headings and all menu rows must use the shared visual styles.");

for (const item of ["Mobile view", "Tablet view", "Desktop view", "Install and create shortcut", "Settings", "Help & feedback"]) {
  if (!webMenu.includes(item)) errors.push("Web overflow menu is missing requested item: " + item);
}
for (const path of ["src/routes/settings.tsx", "src/routes/install.tsx", "src/routes/help-feedback.tsx", "src/lib/pwa-install.ts"]) {
  if (!existsSync(resolve(path))) errors.push("Missing requested settings/install/support feature: " + path);
}
const settingsPage = requireText("src/routes/settings.tsx", ['createFileRoute("/settings")', "themePreference", "setThemePreference", "setViewMode", "Reset appearance and display mode"], "Settings page");
const installPage = requireText("src/routes/install.tsx", ['createFileRoute("/install")', "Install enV", "Add to Home Screen", "Create shortcut", "promptEnVInstallation"], "Install and shortcut page");
const feedbackPage = requireText("src/routes/help-feedback.tsx", ['createFileRoute("/help-feedback")', "mailto:envtoolkit@gmail.com", "Nothing is sent until you review", "required", "maxLength={3000}"], "Help and feedback page");
const installCapture = requireText("src/lib/pwa-install.ts", ["beforeinstallprompt", "appinstalled", "userChoice", "promptEnVInstallation"], "PWA install capture");
if (!installCapture.includes("event.preventDefault()")) errors.push("PWA install prompt must preserve the browser-controlled installation flow.");
const preferences = requireText("src/lib/storage.ts", ["env:view-mode", "themePreference", "setThemePreference", "setViewMode", "applyViewMode", 'ViewMode = "mobile" | "tablet" | "desktop"', 'viewMode: "mobile"'], "Persistent display preferences");
requireText("src/routes/__root.tsx", ["PwaInstallCapture", "startPwaInstallCapture"], "Root PWA installation capture");
if (!settingsPage.includes('value: "system"')) errors.push("Settings must support following the operating-system theme.");
if (!installPage.includes("browser\'s permission")) errors.push("Installation must remain under browser control.");
if (!feedbackPage.includes("email app opens")) errors.push("Help & feedback must disclose that feedback is prepared in the user\'s email app.");
if (!preferences.includes("viewport.content = DEFAULT_VIEWPORT")) errors.push("Mobile view must restore the responsive viewport.");

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

const blogLayout = requireText("src/routes/blog.tsx", [
  'createFileRoute("/blog")',
  "<Outlet />",
], "Blogs & Guides route outlet");
const blogPage = requireText("src/routes/blog.index.tsx", [
  "Blogs &amp; Guides",
  'placeholder="Search blogs, guides, and tools…"',
  "md:flex-row md:items-center md:justify-between",
  "Search blogs, guides, and tools",
  "toolDocumentationPath(tool)",
  "compareToolNames",
  "Browse product articles",
  "Back to tool guides",
], "Web Blogs & Guides");
if (blogLayout.includes("Outlet") && !blogLayout.includes("<Outlet />")) errors.push("Blogs & Guides parent route must render the selected index or guide child.");
if (blogPage.includes("enV knowledge centre")) errors.push("Web Blogs & Guides must not show the removed knowledge-centre badge.");
if (blogPage.includes('aria-label="Knowledge centre sections"')
  || blogPage.includes("Find documentation for a tool")
  || blogPage.includes("Search by tool name, category, keyword, or purpose.")) {
  errors.push("Web Blogs & Guides must not show the removed tab row or tool-introduction block.");
}
if (!blogPage.includes("Browse product articles") || !blogPage.includes("Back to tool guides")) errors.push("Blogs & Guides must preserve a simple path between tool documentation and product articles.");
if (blogPage.includes('aria-label="Knowledge centre contents"')
  || blogPage.includes("Practical instructions")
  || blogPage.includes("documented entries")
  || blogPage.includes("tools.length.toLocaleString()")
  || blogPage.includes("BLOG_ARTICLES.length.toLocaleString()")) {
  errors.push("Web Blogs & Guides must not show the removed catalogue summary cards or count badges.");
}
if (!blogPage.includes('href={toolDocumentationPath(tool)}')) errors.push("Tool catalogue entries must use direct navigable guide URLs.");
if (!blogPage.includes('sensitivity: "base", numeric: true')) errors.push("Tool guides on the Blogs & Guides page must be sorted alphabetically.");
if (blogPage.includes('placeholder="Search tools and guides…')) errors.push("Web Blogs & Guides must not show a duplicate search field below the header.");
if (!blogPage.includes('md:flex-row md:items-center md:justify-between') || !blogPage.includes('md:w-[24rem] md:shrink-0')) errors.push("Blogs & Guides heading and search must share one aligned header row at desktop widths.");

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

const toolTypes = requireText("src/types/tool.ts", ["export const CATEGORY_IDS = ["], "Tool category definitions");
const categoryDeclaration = toolTypes.match(/export const CATEGORY_IDS = \[([\s\S]*?)\] as const;/);
const declaredCategories = categoryDeclaration
  ? [...categoryDeclaration[1].matchAll(/"([a-z]+)"/g)].map(match => match[1])
  : [];
const toolDocumentation = requireText("src/lib/tool-documentation.ts", [
  "function toolSpecificGuidance(tool: ToolMeta)",
  "const CATEGORY_TASK_GUIDANCE:",
  'id: "when-to-use"',
  'heading: "When to use this tool"',
  "specific.validation",
  "steps: usageSteps(tool)",
  'id: "troubleshooting"',
], "Full tool documentation generator");
const categoryTaskBlock = toolDocumentation.match(/const CATEGORY_TASK_GUIDANCE:[\s\S]*?= \{([\s\S]*?)\n\};/);
const documentedCategories = categoryTaskBlock
  ? [...categoryTaskBlock[1].matchAll(/^ {2}([a-z]+): \{/gm)].map(match => match[1])
  : [];
const missingCategoryGuidance = declaredCategories.filter(category => !documentedCategories.includes(category));
if (missingCategoryGuidance.length) errors.push("Full tool guides are missing tailored task guidance for categories: " + missingCategoryGuidance.join(", "));

const guideRenderer = requireText("src/routes/blog.$slug.tsx", [
  "section.steps ?",
  '<ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted">',
  "Read the full guide",
  "href={toolDocumentationPath(item)}",
  "getSearchableTools().find((candidate) => candidate.id === toolId)",
], "Full tool guide renderer");
if (!existsSync(resolve("scripts/check-blog-guide-navigation.mjs"))) errors.push("Missing browser regression test for Read the full guide navigation.");
if (!guideRenderer.includes("section.bullets ?")) errors.push("Tool guides must render their troubleshooting and validation lists.");
const toolShell = requireText("src/components/tools/tool-shell.tsx", [
  "href={toolDocumentationPath(tool)}",
  "Read the full guide",
], "Tool-to-guide links");

if (errors.length) { console.error(`Account/Wallet navigation audit failed with ${errors.length} error(s):`); for (const error of errors) console.error(`- ${error}`); process.exit(1); }
console.log("Account/Wallet navigation audit passed: Product/Resources groups, separate Wallet page, direct shared Account sign-in, password controls, Google/Apple actions, token guide, and Legal footer are present.");
