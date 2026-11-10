import { defineHandler } from "nitro/h3";
import { getSql } from "../../../../src/lib/db";
import { createProfileMediaEtag, matchesProfileMediaEtag } from "../../../utils/profile-media-etag";

const COMMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function emptyResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}

export default defineHandler(async event => {
  const request = event.req;
  if (request.method !== "GET") return emptyResponse(405);
  if (process.env.COMMUNITY_ENABLED !== "true") return emptyResponse(404);

  const url = new URL(request.url);
  const commentId = url.searchParams.get("commentId") ?? "";
  if (!COMMENT_ID.test(commentId)) return emptyResponse(404);

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    (origin && origin !== url.origin) ||
    (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
  ) {
    return emptyResponse(403);
  }

  try {
    const sql = await getSql();
    const rows = await sql.query<{
      user_id: string;
      avatar_bytes: Uint8Array | null;
      avatar_mime: string | null;
    }>(
      `select c.author_user_id as user_id, media.avatar_bytes, media.avatar_mime
         from tool_community_comments c
         inner join public.account_profile_media media on media.user_id = c.author_user_id
        where c.id = $1
          and c.identity_mode = 'public'
          and c.moderation_status = 'visible'
          and media.avatar_bytes is not null
        limit 1`,
      [commentId],
    );
    const media = rows[0];
    const mime = (media?.avatar_mime ?? "").toLowerCase();
    if (!media || !media.avatar_bytes || !ALLOWED_MIME.has(mime)) return emptyResponse(404);

    const bytes = Uint8Array.from(media.avatar_bytes);
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_AVATAR_BYTES) return emptyResponse(404);

    const etag = createProfileMediaEtag(media.user_id, "avatar", bytes);
    const headers = new Headers({
      etag,
      "content-type": mime,
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      "content-disposition": "inline",
    });
    if (matchesProfileMediaEtag(request.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers });
    }

    headers.set("content-length", String(bytes.byteLength));
    return new Response(bytes, { status: 200, headers });
  } catch {
    return emptyResponse(503);
  }
});
