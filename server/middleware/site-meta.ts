import { siteIdentity } from "virtual:site-identity";
import { createHeadInjector, isDocumentPath } from "../../scripts/site-meta-shared.mjs";
interface SiteMetaEvent { url: URL; req: { method: string; headers: Headers }; }
function requestHost(event: SiteMetaEvent): string {
  return event.req.headers.get("x-forwarded-host") ?? event.req.headers.get("host") ?? event.url.host;
}
function injectHeadStreaming(response: Response, host: string): Response {
  if (!response.body) return response;
  const injector = createHeadInjector({ host, site: siteIdentity.site });
  const transformed = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) { for (const output of injector.push(chunk)) controller.enqueue(output); },
    flush(controller) { for (const output of injector.flush()) controller.enqueue(output); },
  }));
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(transformed, { status: response.status, statusText: response.statusText, headers });
}
export default async function siteMetaMiddleware(event: SiteMetaEvent, next: () => unknown | Promise<unknown>): Promise<unknown> {
  if ((event.req.method ?? "GET").toUpperCase() !== "GET" || !isDocumentPath(event.url.pathname)) return next();
  const result = await next();
  if (result instanceof Response && result.body &&
      String(result.headers.get("content-type") ?? "").includes("text/html") &&
      !result.headers.get("content-encoding")) return injectHeadStreaming(result, requestHost(event));
  return result;
}
