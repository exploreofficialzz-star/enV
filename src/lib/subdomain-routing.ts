/**
 * Bidirectional browser-URL mapping for enV's product subdomains.
 *
 * Vercel performs the server-side host rewrites. TanStack Router mirrors them
 * on input (hydration/navigation) and output (links/history), so a subdomain
 * root cannot fall back to the main site's home route after hydration.
 */
type RewriteArguments = { url: URL };

type HostRewrite = {
  input: Readonly<Record<string, string>>;
  output: Readonly<Record<string, string>>;
};

export const SUBDOMAIN_REWRITES: Readonly<Record<string, HostRewrite>> = {
  "android.envtools.store": {
    input: { "/": "/platform/android" },
    output: { "/platform/android": "/" },
  },
  "ios.envtools.store": {
    input: { "/": "/platform/ios" },
    output: { "/platform/ios": "/" },
  },
  "feedback.envtools.store": {
    input: { "/": "/feedback", "/admin": "/developer" },
    output: { "/feedback": "/", "/developer": "/admin" },
  },
  "updates.envtools.store": {
    input: { "/": "/updates", "/admin": "/developer" },
    output: { "/updates": "/", "/developer": "/admin" },
  },
  "userbehavior.envtools.store": {
    input: { "/": "/userbehavior" },
    output: { "/userbehavior": "/" },
  },
};

/** Browser URL to route-tree URL. Undefined means this host/path is not owned here. */
export function rewriteSubdomainInput({ url }: RewriteArguments): URL | undefined {
  const pathname = SUBDOMAIN_REWRITES[url.hostname.toLowerCase()]?.input[url.pathname];
  if (!pathname) return undefined;
  const rewritten = new URL(url.href);
  rewritten.pathname = pathname;
  return rewritten;
}

/** Route-tree URL to browser URL. Query strings and fragments are preserved. */
export function rewriteSubdomainOutput({ url }: RewriteArguments): URL | undefined {
  const pathname = SUBDOMAIN_REWRITES[url.hostname.toLowerCase()]?.output[url.pathname];
  if (!pathname) return undefined;
  const rewritten = new URL(url.href);
  rewritten.pathname = pathname;
  return rewritten;
}
