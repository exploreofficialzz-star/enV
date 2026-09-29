import type { DeviceTemplate } from "./schema.ts";
import type { PlatformAdapter } from "./platforms/types.ts";

export function compatibleDevice(adapter: PlatformAdapter, device: DeviceTemplate) {
  if (adapter.id.endsWith("-post") && device.family === "watch") return false;
  if (adapter.id === "email" || adapter.id === "gmail" || adapter.id === "outlook") return ["desktop", "browser", "tablet"].includes(device.family);
  return true;
}

export function compatibleScene(adapter: PlatformAdapter, scene: string) {
  return adapter.supports.scenes.includes(scene);
}
