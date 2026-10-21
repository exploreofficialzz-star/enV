import { createHeadInjector, injectSiteMetadata, isDocumentPath, snapshotOgIdentity } from "./site-meta-shared.mjs";
export const SITE_IDENTITY_ID = "virtual:site-identity";
function requestHost(req) {
  const forwarded = req.headers["x-forwarded-host"];
  const host = forwarded ?? req.headers.host ?? req.headers[":authority"];
  return Array.isArray(host) ? host[0] : host;
}
function wrapHtmlResponses(middlewares, root) {
  middlewares.use((req, res, next) => {
    const pathOnly = (req.url ?? "").split("?", 1)[0] ?? "";
    const shouldTransform = (req.method ?? "GET").toUpperCase() === "GET" &&
      String(req.headers.accept ?? "").includes("text/html") && isDocumentPath(pathOnly);
    if (!shouldTransform) return next();
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const injector = createHeadInjector({ host: requestHost(req), cwd: root });
    let mode = null;
    const decideMode = () => {
      if (mode) return mode;
      const html = String(res.getHeader("content-type") ?? "").includes("text/html");
      mode = html && !res.getHeader("content-encoding") ? "inject" : "passthrough";
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
export function siteMetaPlugin() {
  let root = process.cwd();
  return {
    name: "env:site-meta",
    configResolved(config) { root = config.root; },
    resolveId(id) { if (id === SITE_IDENTITY_ID) return \`\0\${SITE_IDENTITY_ID}\`; },
    load(id) {
      if (id === \`\0\${SITE_IDENTITY_ID}\`) return \`export const siteIdentity = \${JSON.stringify(snapshotOgIdentity(root))};\`;
    },
    transformIndexHtml(html) { return injectSiteMetadata(html, { host: process.env.VITE_PUBLIC_HOSTNAME ?? "", cwd: root }); },
    configureServer(server) { wrapHtmlResponses(server.middlewares, root); },
    configurePreviewServer(server) { return () => wrapHtmlResponses(server.middlewares, root); },
  };
}
