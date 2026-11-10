import { createHash } from "node:crypto";

export type ProfileMediaKind = "avatar" | "cover";

/** Account-scoped strong validator for the exact private media bytes. */
export function createProfileMediaEtag(
  userId: string,
  kind: ProfileMediaKind,
  imageBytes: Uint8Array,
): string {
  const separator = new Uint8Array([0]);
  const digest = createHash("sha256")
    .update(userId)
    .update(separator)
    .update(kind)
    .update(separator)
    .update(imageBytes)
    .digest("base64url");
  return '"' + digest + '"';
}

/** Implements If-None-Match's wildcard and weak-comparison semantics. */
export function matchesProfileMediaEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some(value => {
    const candidate = value.trim();
    return candidate === "*" || (candidate.startsWith("W/") ? candidate.slice(2) : candidate) === etag;
  });
}
