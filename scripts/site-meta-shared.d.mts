export const DEFAULT_SITE_NAME: string;
export const OG_SITE_REL_PATH: string;
export function createHeadInjector(ctx?: Record<string, unknown>): {
  push(chunk: Uint8Array | string): Uint8Array[];
  flush(): Uint8Array[];
};
export function injectSiteMetadata(html: string, ctx?: Record<string, unknown>): string;
export function isDocumentPath(pathname: string | null | undefined): boolean;
export function readOgSite(cwd?: string): Record<string, unknown>;
export function snapshotOgIdentity(cwd?: string): { site: Record<string, unknown> };
