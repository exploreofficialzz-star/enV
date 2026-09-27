import { createMiddleware } from "@tanstack/react-start";

/** Use this middleware for server functions that access user-scoped data. */
export const authMiddleware = createMiddleware({ type: "function" })
  .client(({ next }) => next())
  .server(async ({ next }) => {
    const { assertSameSiteRequest } = await import("./isolation.server");
    const { requireUserId } = await import("./verify.server");
    assertSameSiteRequest();
    const userId = await requireUserId();
    return next({ context: { userId } });
  });
