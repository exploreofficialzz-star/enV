import installPageTemplate from "../../scripts/install-page.html?raw";
import { siteIdentity } from "virtual:site-identity";
import {
  acceptsHtml,
  createHeadInjector,
  isDocumentPath,
  isInstallQuery,
  renderInstallPageHtml,
  renderWebManifest,
} from "../../scripts/pwa-shared.mjs";

interface PwaEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function requestHost(event: PwaEvent): string {
  return event.req.headers.get("x-forwarded-host") ?? event.req.headers.get("host") ?? event.url.host;
}

function injectHeadStreaming(response: Response, host: string): Response {
  if (!response.body) return response;
  const injector = createHeadInjector({ host, site: siteIdentity.site });
  const transformed = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        for (const output of injector.push(chunk)) controller.enqueue(output);
      },
      flush(controller) {
        for (const output of injector.flush()) controller.enqueue(output);
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(transformed, { status: response.status, statusText: response.statusText, headers });
}

export default async function pwaMiddleware(
  event: PwaEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  if ((event.req.method ?? "GET").toUpperCase() !== "GET") return next();

  const path = event.url.pathname;
  const urlWithQuery = path + event.url.search;
  if (path === "/pwa/manifest.webmanifest" || path === "/pwa/manifest.json") {
    return new Response(renderWebManifest(requestHost(event), siteIdentity.site), {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      },
    });
  }

  if (isInstallQuery(urlWithQuery) && isDocumentPath(path) && acceptsHtml(event.req.headers.get("accept"))) {
    const html = renderInstallPageHtml(installPageTemplate, {
      appName: String(siteIdentity.site.shortName ?? "enV"),
      url: urlWithQuery,
    });
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (!isDocumentPath(path)) return next();
  const result = await next();
  if (
    result instanceof Response &&
    result.body &&
    String(result.headers.get("content-type") ?? "").includes("text/html") &&
    !result.headers.get("content-encoding")
  ) {
    return injectHeadStreaming(result, requestHost(event));
  }
  return result;
}
