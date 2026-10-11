const URL_MEDIA_API_ROUTES = new Map([
  ["/api/backend/url-media/info", "/info"],
  ["/api/backend/url-media/download", "/download"],
]);

/**
 * Map public application API URL-media actions to this Render service's local
 * worker. Other API routes continue through the application proxy.
 */
export function urlMediaProcessorPath(method, pathname) {
  if (String(method).toUpperCase() !== "POST") return null;
  return URL_MEDIA_API_ROUTES.get(String(pathname)) ?? null;
}
