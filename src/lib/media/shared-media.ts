export type MediaProvider = "generic" | "youtube" | "tiktok" | "instagram" | "facebook" | "x";

export type MediaJobState =
  | "queued" | "inspecting" | "downloading" | "processing" | "verifying"
  | "complete" | "failed" | "cancelled";

export type MediaErrorCode =
  | "INVALID_URL" | "UNSUPPORTED_SOURCE" | "SOURCE_UNAVAILABLE"
  | "PRIVATE_CONTENT" | "AUTH_REQUIRED" | "DOWNLOAD_NOT_PERMITTED"
  | "NO_DOWNLOADABLE_FORMAT" | "FORMAT_UNAVAILABLE" | "MANIFEST_PARSE_FAILED"
  | "SEGMENT_FAILED" | "RANGE_UNSUPPORTED" | "RESUME_INVALID"
  | "NETWORK_TIMEOUT" | "RATE_LIMITED" | "PROVIDER_ERROR"
  | "FFMPEG_UNAVAILABLE" | "FFMPEG_FAILED" | "DISK_FULL"
  | "FILE_TOO_LARGE" | "DURATION_TOO_LONG" | "JOB_TIMEOUT"
  | "SERVER_CAPACITY" | "OUTPUT_VERIFICATION_FAILED";

export interface MediaErrorShape {
  code: MediaErrorCode;
  message: string;
  retryable: boolean;
  recovery?: string;
}

export interface MediaFormat {
  id: string;
  url?: string;
  extractorRef?: string;
  container: string;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  filesize?: number;
  protocol?: string;
  hasVideo: boolean;
  hasAudio: boolean;
  qualityLabel?: string;
  dynamicRange?: string;
}

export interface MediaManifest {
  sourceUrl: string;
  canonicalUrl?: string;
  provider: MediaProvider;
  title: string;
  description?: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  webpageUrl?: string;
  isPrivate: boolean;
  requiresAuthentication: boolean;
  formats: MediaFormat[];
  subtitles: Array<{ id: string; language?: string; format?: string }>;
  chapters: Array<{ start: number; end?: number; title?: string }>;
  warnings: string[];
  permissions: { downloadable: boolean; reason?: string };
}

export interface DownloadJob {
  id: string;
  source: string;
  selectedFormat?: string;
  outputFormat?: string;
  state: MediaJobState;
  bytesDownloaded: number;
  totalBytes?: number;
  speed?: number;
  eta?: number;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  error?: MediaErrorShape;
  resumable: boolean;
  outputPath?: string;
}

export interface ProviderAdapter {
  provider: MediaProvider;
  canHandle(url: URL): boolean;
  inspect(url: URL, signal?: AbortSignal): Promise<MediaManifest>;
  supportsFeature(feature: string): boolean;
  normalizeError(error: unknown): MediaErrorShape;
}

export function isMediaProvider(value: unknown): value is MediaProvider {
  return value === "generic" || value === "youtube" || value === "tiktok" ||
    value === "instagram" || value === "facebook" || value === "x";
}

export function normalizeMediaError(error: unknown): MediaErrorShape {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const candidate = error as Partial<MediaErrorShape>;
    if (typeof candidate.code === "string" && typeof candidate.message === "string") {
      return {
        code: candidate.code as MediaErrorCode,
        message: candidate.message,
        retryable: Boolean(candidate.retryable),
        recovery: typeof candidate.recovery === "string" ? candidate.recovery : undefined,
      };
    }
  }
  return {
    code: "PROVIDER_ERROR",
    message: error instanceof Error ? error.message : "The media operation failed.",
    retryable: false,
  };
}
