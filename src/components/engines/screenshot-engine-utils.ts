export type ScreenshotWorkflow = "frame" | "mockup" | "beautifier" | "presentation" | "collage" | "annotation" | "redaction";

export type ScreenshotFamily = "iphone" | "android" | "ipad" | "tablet" | "macbook" | "laptop" | "desktop" | "apple-watch" | "chrome" | "safari" | "firefox" | "edge" | "google-search" | "app-store" | "google-play";

const families: ScreenshotFamily[] = ["iphone","android","ipad","tablet","macbook","laptop","desktop","apple-watch","chrome","safari","firefox","edge","google-search","app-store","google-play"];
const workflows: ScreenshotWorkflow[] = ["frame","mockup","beautifier","presentation","collage","annotation","redaction"];

export function parseScreenshotToolId(id: string): { family: ScreenshotFamily; workflow: ScreenshotWorkflow } {
  const family = families.find((f) => id.startsWith(`${f}-`));
  if (!family) throw new Error(`Unknown screenshot family: ${id}`);
  const suffix = id.slice(family.length + 1);
  const workflow = suffix === "screenshot-frame" || suffix === "frame" ? "frame" :
    suffix === "screenshot-mockup" || suffix === "mockup" ? "mockup" :
    suffix === "screenshot-beautifier" || suffix === "beautifier" ? "beautifier" :
    suffix === "device-presentation" || suffix === "presentation" ? "presentation" :
    suffix === "device-collage" || suffix === "collage" ? "collage" :
    suffix === "screenshot-annotation" || suffix === "annotation" ? "annotation" :
    suffix === "screenshot-redaction" || suffix === "redaction" ? "redaction" : null;
  if (!workflow || !workflows.includes(workflow)) throw new Error(`Unknown screenshot workflow: ${id}`);
  return { family, workflow };
}

export function frameSpec(family: ScreenshotFamily) {
  const browser = ["chrome","safari","firefox","edge","google-search","app-store","google-play"].includes(family);
  if (family === "apple-watch") return { width: 420, height: 520, radius: 92, bezel: 28, label: "Apple Watch" };
  if (family === "iphone" || family === "android") return { width: 430, height: 860, radius: 48, bezel: 22, label: family === "iphone" ? "iPhone" : "Android" };
  if (family === "ipad" || family === "tablet") return { width: 760, height: 1020, radius: 42, bezel: 24, label: family === "ipad" ? "iPad" : "Tablet" };
  if (family === "macbook" || family === "laptop") return { width: 1100, height: 760, radius: 28, bezel: 20, label: family === "macbook" ? "MacBook" : "Laptop" };
  if (family === "desktop") return { width: 1180, height: 760, radius: 18, bezel: 16, label: "Desktop" };
  return { width: 1200, height: 760, radius: 18, bezel: 12, label: family === "google-search" ? "Google Search" : family === "app-store" ? "App Store" : family === "google-play" ? "Google Play" : family[0].toUpperCase() + family.slice(1) };
}

export function validateImageFile(file: { type?: string; size?: number } | null, maxBytes = 20 * 1024 * 1024) {
  if (!file) throw new Error("Choose an image first.");
  if (!file.type?.startsWith("image/")) throw new Error("The selected file must be an image.");
  if ((file.size ?? 0) > maxBytes) throw new Error("Image is larger than the 20 MB limit.");
}
