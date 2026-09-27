import { getRequest } from "@tanstack/react-start/server";

/** Reject scripted cross-site requests before protected server functions run. */
export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden: cross-site request blocked");
    this.name = "CrossSiteRequestError";
  }
}

export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) return;
  const headers = request.headers;
  const site = headers.get("sec-fetch-site");
  if (!site || site === "same-origin" || site === "none") return;
  const isTopLevelGet =
    headers.get("sec-fetch-mode") === "navigate" &&
    request.method === "GET" &&
    !["object", "embed"].includes(headers.get("sec-fetch-dest") ?? "");
  if (isTopLevelGet) return;
  throw new CrossSiteRequestError();
}
