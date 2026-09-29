const trim = (value: unknown) => (typeof value === "string" ? value.trim().replace(/\/$/, "") : "");

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = trim(process.env[name]);
    if (value) return value;
  }
  return "";
}

export function backendConfig() {
  return {
    media: firstEnv("MEDIA_PROCESSOR_URL", "VITE_MEDIA_PROCESSOR_URL"),
    urlMedia: firstEnv("URL_MEDIA_PROCESSOR_URL", "VITE_URL_MEDIA_PROCESSOR_URL"),
    transcription: firstEnv("TRANSCRIBE_URL", "VITE_TRANSCRIBE_URL"),
    allowedOrigin: trim(process.env.BACKEND_ALLOWED_ORIGIN) || "*",
  };
}

export function joinUrl(base: string, suffix: string) {
  return `${base.replace(/\/$/, "")}/${suffix.replace(/^\//, "")}`;
}
