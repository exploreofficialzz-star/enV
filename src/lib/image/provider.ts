export interface BackgroundRemovalProviderInfo {
  id: string;
  mode: "local" | "cloud" | "manual" | "unavailable";
  model?: string;
  version?: string;
  license?: string;
  supportedFormats: string[];
  maxDimensions?: { width: number; height: number };
  privacy: string;
  estimatedRuntime: string;
}

export interface SuperResolutionProviderInfo {
  id: string;
  mode: "local" | "cloud" | "unavailable";
  model?: string;
  version?: string;
  license?: string;
  maxDimensions?: { width: number; height: number };
  privacy: string;
  estimatedRuntime: string;
}

export function getBackgroundRemovalProvider(): BackgroundRemovalProviderInfo {
  return {
    id: "manual-mask",
    mode: "manual",
    model: "User-authored alpha mask",
    supportedFormats: ["decoded browser image formats"],
    privacy: "Local on-device processing; no image upload.",
    estimatedRuntime: "Interactive",
  };
}

export function getSuperResolutionProvider(): SuperResolutionProviderInfo {
  return {
    id: "none-configured",
    mode: "unavailable",
    privacy: "No AI model is configured in this build, so the app will not label normal resizing as AI upscaling.",
    estimatedRuntime: "Unavailable",
  };
}
