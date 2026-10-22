export class RequestBodyError extends Error {
  /**
   * @param {string} code
   * @param {number} status
   * @param {string} message
   */
  constructor(code, status, message) {
    super(message);
    this.name = "RequestBodyError";
    this.code = code;
    this.status = status;
  }
}

const INVALID_JSON_MESSAGE = "The request body must be valid JSON.";
const OBJECT_REQUIRED_MESSAGE = "Send a JSON object containing the tool request.";
const TOO_LARGE_MESSAGE = "This request is too large. Keep the input under the allowed size and try again.";

/**
 * Parse a size-bounded JSON object from a Fetch API request.
 * @param {Request} request
 * @param {number} [maxBytes]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readJsonObject(request, maxBytes = 128 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("maxBytes must be a positive safe integer");
  }

  const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json" && !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(contentType)) {
    throw new RequestBodyError(
      "UNSUPPORTED_MEDIA_TYPE",
      415,
      "Send this request as application/json."
    );
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isSafeInteger(length) && length >= 0 && length > maxBytes) {
      throw new RequestBodyError("REQUEST_TOO_LARGE", 413, TOO_LARGE_MESSAGE);
    }
  }

  if (!request.body) {
    throw new RequestBodyError("INVALID_JSON", 400, OBJECT_REQUIRED_MESSAGE);
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw new RequestBodyError("REQUEST_TOO_LARGE", 413, TOO_LARGE_MESSAGE);
      }
      chunks.push(Buffer.from(chunk.value));
    }
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(
      "REQUEST_BODY_READ_FAILED",
      400,
      "The request body could not be read. Please send it again."
    );
  } finally {
    reader.releaseLock();
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestBodyError("INVALID_JSON", 400, INVALID_JSON_MESSAGE);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RequestBodyError("JSON_OBJECT_REQUIRED", 400, OBJECT_REQUIRED_MESSAGE);
  }
  return parsed;
}
