/**
 * Canonical website host policy shared by the live smoke test and source audits.
 * enV publishes SEO pages only on the .store apex; alternate hosts must redirect.
 */
export const SEO_CANONICAL_ORIGIN = "https://envtools.store";

export const SEO_REDIRECT_HOSTS = Object.freeze([
  "www.envtools.store",
  "envtool.vercel.app",
]);
