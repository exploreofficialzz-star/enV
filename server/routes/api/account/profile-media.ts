import { Buffer } from "node:buffer";
import { defineHandler } from "nitro/h3";
import { auth, authConfigurationError, authConfigured } from "../../../../src/lib/auth/server";
import { getSql } from "../../../../src/lib/db";

const AVATAR_LIMIT = 1.5 * 1024 * 1024;
const COVER_LIMIT = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function matchesImageSignature(bytes: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

async function readBoundedImage(request: Request, maxBytes: number): Promise<{ bytes: Buffer; mime: string }> {
  const mime = (request.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_MIME.has(mime)) throw new Error("Choose a JPG, PNG or WebP image.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("No image data was received.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error("This image is larger than the allowed limit.");
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks, length);
  if (!matchesImageSignature(bytes, mime)) throw new Error("The selected file is not a valid supported image.");
  return { bytes, mime };
}

async function authorize(request: Request): Promise<{ userId: string | null; status: number; error: string | null }> {
  if (!authConfigured || authConfigurationError || !process.env.DATABASE_URL?.trim()) {
    return { userId: null, status: 503, error: "Profile photo storage is not configured." };
  }

  const configuredOrigin = process.env.BETTER_AUTH_URL?.trim();
  let expectedOrigin = "";
  try {
    expectedOrigin = new URL(configuredOrigin || request.url).origin;
  } catch {
    return { userId: null, status: 503, error: "Account origin is not configured." };
  }
  if (!configuredOrigin && process.env.NODE_ENV === "production") {
    return { userId: null, status: 503, error: "Account origin is not configured." };
  }

  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (
    (origin && origin !== expectedOrigin) ||
    (request.method !== "GET" && origin !== expectedOrigin) ||
    (site && site !== "same-origin" && site !== "none")
  ) {
    return { userId: null, status: 403, error: "Cross-origin profile requests are blocked." };
  }

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return { userId: null, status: 401, error: "Sign in to manage profile photos." };
    return { userId: session.user.id, status: 200, error: null };
  } catch {
    return { userId: null, status: 503, error: "Your account session could not be verified." };
  }
}

function dataUrl(bytes: unknown, mime: string | null): string | null {
  if (!bytes || !mime) return null;
  return `data:${mime};base64,${Buffer.from(bytes as Uint8Array).toString("base64")}`;
}

export default defineHandler(async event => {
  const request = event.req;
  const authorization = await authorize(request);
  if (!authorization.userId) return respond({ ok: false, error: authorization.error }, authorization.status);

  try {
    const sql = await getSql();
    if (request.method === "GET") {
      const rows = await sql.query<{
        avatar_bytes: Uint8Array | null;
        avatar_mime: string | null;
        cover_bytes: Uint8Array | null;
        cover_mime: string | null;
      }>(
        `select avatar_bytes, avatar_mime, cover_bytes, cover_mime
           from public.account_profile_media
          where user_id = $1
          limit 1`,
        [authorization.userId],
      );
      const media = rows[0];
      return respond({
        ok: true,
        avatar: dataUrl(media?.avatar_bytes, media?.avatar_mime ?? null),
        cover: dataUrl(media?.cover_bytes, media?.cover_mime ?? null),
      });
    }

    if (request.method !== "POST") return respond({ ok: false, error: "Method not allowed." }, 405);
    const kind = new URL(request.url).searchParams.get("kind");
    if (kind !== "avatar" && kind !== "cover") return respond({ ok: false, error: "Choose a profile photo or cover photo." }, 400);
    const { bytes, mime } = await readBoundedImage(request, kind === "avatar" ? AVATAR_LIMIT : COVER_LIMIT);

    if (kind === "avatar") {
      await sql.query(
        `insert into public.account_profile_media (user_id, avatar_bytes, avatar_mime, updated_at)
         values ($1, $2, $3, now())
         on conflict (user_id) do update
           set avatar_bytes = excluded.avatar_bytes,
               avatar_mime = excluded.avatar_mime,
               updated_at = now()`,
        [authorization.userId, bytes, mime],
      );
    } else {
      await sql.query(
        `insert into public.account_profile_media (user_id, cover_bytes, cover_mime, updated_at)
         values ($1, $2, $3, now())
         on conflict (user_id) do update
           set cover_bytes = excluded.cover_bytes,
               cover_mime = excluded.cover_mime,
               updated_at = now()`,
        [authorization.userId, bytes, mime],
      );
    }

    return respond({ ok: true, kind, imageUrl: dataUrl(bytes, mime) });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Could not process this profile photo.";
    const status = /larger than|supported image|Choose a JPG|No image data/i.test(message) ? 400 : 503;
    return respond({ ok: false, error: message.slice(0, 200) }, status);
  }
});
