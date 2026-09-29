import type { DeviceTemplate } from "./schema.ts";

export const DEVICE_TEMPLATES: DeviceTemplate[] = [
  { id: "iphone-modern-light", name: "iPhone — Modern Light", family: "iphone", width: 390, height: 844, orientation: "portrait", bezelPx: 10, radiusPx: 42, safeTopPx: 47, safeBottomPx: 34, statusBar: true, navigationBar: "gesture", cutout: "dynamic-island" },
  { id: "iphone-modern-dark", name: "iPhone — Modern Dark", family: "iphone", width: 390, height: 844, orientation: "portrait", bezelPx: 10, radiusPx: 42, safeTopPx: 47, safeBottomPx: 34, statusBar: true, navigationBar: "gesture", cutout: "dynamic-island", darkFrame: true },
  { id: "iphone-notch-light", name: "iPhone — Notch Light", family: "iphone", width: 390, height: 844, orientation: "portrait", bezelPx: 10, radiusPx: 42, safeTopPx: 47, safeBottomPx: 34, statusBar: true, navigationBar: "gesture", cutout: "notch" },
  { id: "iphone-home-button-light", name: "iPhone — Home Button", family: "iphone", width: 375, height: 667, orientation: "portrait", bezelPx: 12, radiusPx: 28, safeTopPx: 20, safeBottomPx: 20, statusBar: true, navigationBar: "none", cutout: "none" },
  { id: "android-modern-light", name: "Android — Modern Light", family: "android", width: 412, height: 915, orientation: "portrait", bezelPx: 9, radiusPx: 30, safeTopPx: 30, safeBottomPx: 24, statusBar: true, navigationBar: "gesture", cutout: "punch-hole" },
  { id: "android-modern-dark", name: "Android — Modern Dark", family: "android", width: 412, height: 915, orientation: "portrait", bezelPx: 9, radiusPx: 30, safeTopPx: 30, safeBottomPx: 24, statusBar: true, navigationBar: "gesture", cutout: "punch-hole", darkFrame: true },
  { id: "android-three-button", name: "Android — 3 Button", family: "android", width: 412, height: 915, orientation: "portrait", bezelPx: 9, radiusPx: 30, safeTopPx: 30, safeBottomPx: 48, statusBar: true, navigationBar: "three-button", cutout: "none" },
  { id: "ipad-portrait", name: "iPad — Portrait", family: "tablet", width: 820, height: 1180, orientation: "portrait", bezelPx: 14, radiusPx: 32, safeTopPx: 24, safeBottomPx: 24, statusBar: true, navigationBar: "gesture", cutout: "none" },
  { id: "ipad-landscape", name: "iPad — Landscape", family: "tablet", width: 1180, height: 820, orientation: "landscape", bezelPx: 14, radiusPx: 32, safeTopPx: 24, safeBottomPx: 24, statusBar: true, navigationBar: "gesture", cutout: "none" },
  { id: "macos-browser", name: "macOS Browser", family: "browser", width: 1440, height: 900, orientation: "landscape", bezelPx: 0, radiusPx: 10, safeTopPx: 0, safeBottomPx: 0, statusBar: false, navigationBar: "none", cutout: "none" },
  { id: "windows-browser", name: "Windows Browser", family: "browser", width: 1440, height: 900, orientation: "landscape", bezelPx: 0, radiusPx: 8, safeTopPx: 0, safeBottomPx: 0, statusBar: false, navigationBar: "none", cutout: "none" },
  { id: "custom-390x844", name: "Custom 390 × 844", family: "custom", width: 390, height: 844, orientation: "portrait", bezelPx: 0, radiusPx: 0, safeTopPx: 0, safeBottomPx: 0, statusBar: false, navigationBar: "none", cutout: "none" },
];


// Additional extensible templates. These are original enV frames/geometry, not proprietary artwork.
DEVICE_TEMPLATES.push(
  { id: "iphone-pro-light", name: "iPhone — Pro Light", family: "iphone", width: 393, height: 852, orientation: "portrait", bezelPx: 10, radiusPx: 43, safeTopPx: 47, safeBottomPx: 34, statusBar: true, navigationBar: "gesture", cutout: "dynamic-island" },
  { id: "iphone-pro-dark", name: "iPhone — Pro Dark", family: "iphone", width: 393, height: 852, orientation: "portrait", bezelPx: 10, radiusPx: 43, safeTopPx: 47, safeBottomPx: 34, statusBar: true, navigationBar: "gesture", cutout: "dynamic-island", darkFrame: true },
  { id: "android-punch-hole-dark", name: "Android — Punch Hole Dark", family: "android", width: 412, height: 915, orientation: "portrait", bezelPx: 9, radiusPx: 30, safeTopPx: 30, safeBottomPx: 24, statusBar: true, navigationBar: "gesture", cutout: "punch-hole", darkFrame: true },
  { id: "android-fold-inner", name: "Android Foldable — Inner", family: "android", width: 1768, height: 2208, orientation: "portrait", bezelPx: 16, radiusPx: 34, safeTopPx: 32, safeBottomPx: 28, statusBar: true, navigationBar: "gesture", cutout: "none" },
  { id: "android-fold-cover", name: "Android Foldable — Cover", family: "android", width: 832, height: 2268, orientation: "portrait", bezelPx: 12, radiusPx: 30, safeTopPx: 30, safeBottomPx: 24, statusBar: true, navigationBar: "gesture", cutout: "punch-hole" },
  { id: "macos-desktop", name: "macOS Desktop", family: "desktop", width: 1728, height: 1117, orientation: "landscape", bezelPx: 0, radiusPx: 10, safeTopPx: 0, safeBottomPx: 0, statusBar: false, navigationBar: "none", cutout: "none" },
  { id: "windows-desktop", name: "Windows Desktop", family: "desktop", width: 1920, height: 1080, orientation: "landscape", bezelPx: 0, radiusPx: 8, safeTopPx: 0, safeBottomPx: 0, statusBar: false, navigationBar: "none", cutout: "none" },
  { id: "linux-desktop", name: "Linux Desktop", family: "desktop", width: 1920, height: 1080, orientation: "landscape", bezelPx: 0, radiusPx: 8, safeTopPx: 0, safeBottomPx: 0, statusBar: false, navigationBar: "none", cutout: "none" },
);

export const DEVICE_TEMPLATE_MAP = new Map(DEVICE_TEMPLATES.map((template) => [template.id, template]));
