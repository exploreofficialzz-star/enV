export const DEFAULT_APP_NAME: string;
export const OG_SITE_REL_PATH: string;
export function acceptsHtml(accept: string | null | undefined): boolean;
export function createHeadInjector(ctx?: Record<string, unknown>): {
  push(chunk: Uint8Array | string): Uint8Array[];
  flush(): Uint8Array[];
};
export function injectPwaHead(html: string, ctx?: Record<string, unknown>): string;
export function isDocumentPath(pathname: string | null | undefined): boolean;
export function isInstallQuery(url: string | null | undefined): boolean;
export function readOgSite(cwd?: string): Record<string, unknown>;
export function renderInstallPageHtml(template: string, context?: { appName?: string; url?: string }): string;
export function renderWebManifest(hostHeader?: string, site?: Record<string, unknown>): string;
export function snapshotOgIdentity(cwd?: string): { site: Record<string, unknown> };
