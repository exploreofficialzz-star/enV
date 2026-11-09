/** Browser API calls stay on the current enV origin so same-origin security checks remain valid. */
const configured = typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_API_BASE_URL === "string"
  ? String(import.meta.env.VITE_API_BASE_URL).trim()
  : "";

// Empty is intentional: Web uses the Vercel app's own /api routes. Native
// Android/iOS clients configure their independent API origin in native builds.
export const API_BASE_URL = configured.replace(/\/+$/, "");

export function apiUrl(path: string): string {
  const route = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${route}`;
}
