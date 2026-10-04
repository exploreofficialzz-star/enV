/**
 * SERVER ONLY. Signed-in user lookup for optional AI sign-in.
 *
 * Deliberately does NOT import the app's auth or database modules: those depend on Vite-only
 * features and would be pulled into the server-route bundle. Instead it asks the app's own Better
 * Auth endpoint (/api/auth/get-session) who the caller is, forwarding only the Cookie header.
 * Any failure means "not signed in".
 */
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface SessionLookupOptions {
  /** Origin of the auth API for this request, or null when it cannot be determined safely. */
  baseUrl: (request: Request) => string | null;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export function createSessionLookup(options: SessionLookupOptions): (request: Request) => Promise<string | null> {
  const doFetch: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  return async (request) => {
    const cookie = request.headers.get("cookie");
    const base = options.baseUrl(request);
    if (!cookie || !base) return null;
    try {
      const response = await doFetch(`${base}/api/auth/get-session`, {
        method: "GET",
        headers: { cookie, accept: "application/json" },
        signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
      });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      const user = typeof body === "object" && body !== null ? (body as { user?: unknown }).user : null;
      const id = typeof user === "object" && user !== null ? (user as { id?: unknown }).id : null;
      return typeof id === "string" && id.length > 0 && id.length <= 200 ? id : null;
    } catch {
      return null;
    }
  };
}
