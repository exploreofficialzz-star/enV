/** Public API origin used by the Web client for every backend request. */
const configured = typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_API_BASE_URL === "string"
  ? String(import.meta.env.VITE_API_BASE_URL).trim()
  : "";

export const API_BASE_URL = (configured || "https://env-q3mq.onrender.com").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  const route = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${route}`;
}
