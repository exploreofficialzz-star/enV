export type ImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/avif"
  | "image/gif"
  | "image/bmp"
  | "image/x-icon"
  | "image/tiff"
  | "image/heic"
  | "image/heif";

export interface ImageAssetMetadata {
  name: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  pixels: number;
  aspectRatio: string;
  hasAlpha: boolean | null;
  orientation: number | null;
  animated: boolean | null;
  colorSpace: string | null;
  bitDepth: number | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface ImageAsset {
  id: string;
  file: File;
  bitmap: ImageBitmap | HTMLImageElement;
  metadata: ImageAssetMetadata;
  objectUrl?: string;
}

export interface ResizeOptions {
  width: number;
  height: number;
  fit: "contain" | "cover" | "stretch";
  background: string;
  allowEnlarge: boolean;
  allowReduce: boolean;
  quality: ImageSmoothingQuality;
}

export interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface TransformOptions {
  resize?: ResizeOptions;
  crop?: CropOptions;
  rotate?: number;
  flipX?: boolean;
  flipY?: boolean;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  grayscale?: number;
  invert?: number;
  blur?: number;
  sharpen?: number;
  pixelate?: number;
}

export interface RenderResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface EncodedImage {
  blob: Blob;
  mime: string;
  extension: string;
  width: number;
  height: number;
}

export interface ImageAnalysis {
  width: number;
  height: number;
  pixels: number;
  aspectRatio: string;
  hasAlpha: boolean;
  transparentPercent: number;
  dominantColor: string;
  palette: string[];
  histogram: { bins: number[]; max: number };
  ppi: number | null;
}

export interface PlatformPlacementSpec {
  platform: string;
  contentType: string;
  version: string;
  sourceUrl: string;
  lastVerified: string;
  dimensions?: { width: number; height: number };
  aspectRatio?: string;
  minDimensions?: { width: number; height: number };
  maxFileSizeBytes?: number;
  allowedFormats: string[];
  alphaAllowed: boolean;
  safeAreas?: { x: number; y: number; width: number; height: number; unit: "px" | "percent" }[];
  cropBehavior?: "contain" | "cover" | "reposition" | "unknown";
  notes?: string[];
}

export interface ImageOperationDescriptor {
  mode: "quick" | "editor" | "analysis" | "batch";
  family:
    | "edit"
    | "analysis"
    | "format"
    | "optimization"
    | "composition"
    | "platform"
    | "ai";
  operation: string;
  outputMime?: string;
  outputExtension?: string;
}
