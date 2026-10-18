/** Bounded JSON object reader: limits streamed bytes even when Content-Length is absent. */
export async function readBoundedJsonObject(
  request: Request,
  maxBytes = 4_096,
): Promise<Record<string, unknown> | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return null;
  const contentType = (request.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return null;

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    if (!/^\d+$/.test(contentLengthHeader)) return null;
    const declaredLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > maxBytes) return null;
  }

  const stream = request.body;
  if (!stream) return null;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
