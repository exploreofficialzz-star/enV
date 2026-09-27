import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptsHtml,
  createHeadInjector,
  injectPwaHead,
  isDocumentPath,
  isInstallQuery,
  readOgSite,
  renderInstallPageHtml,
  renderWebManifest,
  snapshotOgIdentity,
} from "./pwa-shared.mjs";

export const SITE_IDENTITY_ID = "virtual:site-identity";
const INSTALL_PAGE_PATH = join(dirname(fileURLToPath(import.meta.url)), "install-page.html");

function requestHost(req) {
  const forwarded = req.headers["x-forwarded-host"];
  const host = forwarded ?? req.headers.host ?? req.headers[":authority"];
  return Array.isArray(host) ? host[0] : host;
}

function readSiteName(root) {
  const site = readOgSite(root);
  return String(site.shortName ?? "enV").trim() || "enV";
}

export function renderInstallPage(_hostHeader, url = "/", root = process.cwd()) {
  return renderInstallPageHtml(readFileSync(INSTALL_PAGE_PATH, "utf8"), {
    appName: readSiteName(root),
    url,
  });
}

function servePwa(middlewares, root) {
  middlewares.use((req, res, next) => {
    const rawUrl = req.url ?? "";
    const pathOnly = rawUrl.split("?", 1)[0] ?? "";
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET") return next();

    if (pathOnly === "/pwa/manifest.webmanifest" || pathOnly === "/pwa/manifest.json") {
      const body = Buffer.from(renderWebManifest(requestHost(req), readOgSite(root)), "utf8");
      res.statusCode = 200;
      res.setHeader("content-type", "application/manifest+json; charset=utf-8");
      res.setHeader("cache-control", "public, max-age=300, stale-while-revalidate=3600");
      res.setHeader("content-length", String(body.byteLength));
      res.end(body);
      return;
    }

    if (isInstallQuery(rawUrl) && isDocumentPath(pathOnly) && acceptsHtml(req.headers.accept)) {
      try {
        const body = Buffer.from(renderInstallPage(requestHost(req), rawUrl, root), "utf8");
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.setHeader("content-length", String(body.byteLength));
        res.end(body);
      } catch (error) {
        console.error("[enV] install page failed:", error);
        res.statusCode = 500;
        res.end("Install instructions are temporarily unavailable.");
      }
      return;
    }
    next();
  });
}

/** Inject metadata only into uncompressed HTML, preserving streaming responses. */
function wrapHtmlResponses(middlewares, root) {
  middlewares.use((req, res, next) => {
    const rawUrl = req.url ?? "";
    const pathOnly = rawUrl.split("?", 1)[0] ?? "";
    const looksLikeDocument =
      (req.method ?? "GET").toUpperCase() === "GET" &&
      String(req.headers.accept ?? "").includes("text/html") &&
      !isInstallQuery(rawUrl) &&
      isDocumentPath(pathOnly);
    if (!looksLikeDocument) return next();

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const injector = createHeadInjector({ host: requestHost(req), cwd: root });
    let mode = null;
    const decideMode = () => {
      if (mode) return mode;
      const isHtml = String(res.getHeader("content-type") ?? "").includes("text/html");
      mode = isHtml && !res.getHeader("content-encoding") ? "inject" : "passthrough";
      if (mode === "inject" && !res.headersSent) res.removeHeader("content-length");
      return mode;
    };
    const toBuffer = (chunk, encoding) => {
      if (Buffer.isBuffer(chunk)) return chunk;
      if (typeof chunk === "string") return Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8");
      return Buffer.from(chunk);
    };

    res.write = (chunk, encoding, callback) => {
      if (decideMode() === "passthrough") return originalWrite(chunk, encoding, callback);
      const done = typeof encoding === "function" ? encoding : callback;
      if (chunk) for (const output of injector.push(toBuffer(chunk, encoding))) originalWrite(output);
      if (typeof done === "function") done();
      return true;
    };
    res.end = (chunk, encoding, callback) => {
      const done = typeof encoding === "function" ? encoding : callback;
      if (decideMode() === "passthrough") return originalEnd(chunk, encoding, callback);
      if (chunk) for (const output of injector.push(toBuffer(chunk, encoding))) originalWrite(output);
      for (const output of injector.flush()) originalWrite(output);
      return originalEnd(undefined, undefined, done);
    };
    next();
  });
}

export function pwaPlugin() {
  let root = process.cwd();
  return {
    name: "env:pwa",
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      if (id === SITE_IDENTITY_ID) return `\0${SITE_IDENTITY_ID}`;
    },
    load(id) {
      if (id === `\0${SITE_IDENTITY_ID}`) {
        return `export const siteIdentity = ${JSON.stringify(snapshotOgIdentity(root))};`;
      }
    },
    transformIndexHtml(html) {
      return injectPwaHead(html, { host: process.env.VITE_PUBLIC_HOSTNAME ?? "", cwd: root });
    },
    configureServer(server) {
      servePwa(server.middlewares, root);
      wrapHtmlResponses(server.middlewares, root);
    },
    configurePreviewServer(server) {
      servePwa(server.middlewares, root);
      return () => wrapHtmlResponses(server.middlewares, root);
    },
  };
}
