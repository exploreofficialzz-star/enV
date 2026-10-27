"""Restricted gateway for the hosted audio worker; the shared key stays on servers."""
import json
import os
import re
import secrets
from pathlib import Path

from .server import create_app

_ALLOWED = re.compile(r"^/v1/jobs/[a-f0-9]{32}(?:/cancel|/tagged-copy|/artifacts/[a-zA-Z0-9_./-]+)?$")


def create_remote_app(root: Path | None = None, key: str | None = None):
    key = key or os.getenv("SONG_PROCESSOR_KEY", "")
    if len(key) < 24:
        raise ValueError("Set SONG_PROCESSOR_KEY to a random shared secret of at least 24 characters")
    internal_token = secrets.token_urlsafe(32)
    inner = create_app(root=root, token=internal_token, origins=["http://localhost:8080"], location="remote_backend")

    async def reject(send, status, detail):
        body = json.dumps({"detail": detail}).encode()
        await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json"), (b"cache-control", b"no-store"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})

    async def app(scope, receive, send):
        if scope["type"] != "http":
            await inner(scope, receive, send)
            return
        method, path = scope["method"], scope["path"]
        if path == "/health" and method == "GET":
            await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json"), (b"cache-control", b"no-store")]})
            await send({"type": "http.response.body", "body": b'{"ok":true}'})
            return
        incoming = dict(scope["headers"])
        provided = incoming.get(b"x-song-processor-key", b"").decode("utf-8", errors="ignore")
        if not secrets.compare_digest(provided, key):
            await reject(send, 401, "Processor authentication required")
            return
        allowed = path in {"/v1/health", "/v1/jobs"} or bool(_ALLOWED.fullmatch(path))
        if not allowed or method not in {"GET", "POST", "DELETE"} or ".." in path:
            await reject(send, 404, "Not found")
            return
        headers = [(name, value) for name, value in scope["headers"] if name.lower() not in {b"host", b"origin", b"authorization", b"x-song-processor-key"}]
        headers.extend([(b"host", b"127.0.0.1"), (b"origin", b"http://localhost:8080"), (b"authorization", f"Bearer {internal_token}".encode())])
        local_scope = {**scope, "headers": headers, "server": ("127.0.0.1", 80), "scheme": "http"}
        await inner(local_scope, receive, send)

    return app


def main():
    import uvicorn
    uvicorn.run(create_remote_app(), host="0.0.0.0", port=int(os.getenv("PORT", "10000")), workers=1, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
