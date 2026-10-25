"""Private Modal host for OpenMOSS MOSS-Music-8B-Instruct.

The public surface is a small authenticated FastAPI adapter. SGLang remains bound to
127.0.0.1 inside the Modal container; clients cannot reach its raw chat-completions API.
Audio and model responses are never logged by this wrapper.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import hmac
import json
import os
import pathlib
import subprocess
import tempfile
import time
from contextlib import asynccontextmanager
from typing import Any

import httpx
import modal
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

APP_NAME = "env-moss-music"
MODEL_REPO = "OpenMOSS-Team/MOSS-Music-8B-Instruct"
# Resolve the upstream ref to an immutable commit SHA on the first download. The resolved
# SHA is written to the persistent volume manifest, avoiding an invented or stale pin.
MODEL_REVISION = "main"
MODEL_MANIFEST = "/models/MOSS-Music-8B-Instruct/.env-model-manifest.json"
# Official OpenMOSS SGLang commit selected for reproducible MOSS-Audio/MOSS-Music serving.
SGLANG_REVISION = "6c3a99cf413f623541aae7ee14744f5a3c062a47"
MODEL_DIR = "/models/MOSS-Music-8B-Instruct"
SGLANG_URL = "http://127.0.0.1:30000"
MAX_AUDIO_BYTES = 2_800_000
MAX_JSON_BYTES = 4_000_000
GENERATION_TIMEOUT_SECONDS = 55
MODEL_STARTUP_TIMEOUT_SECONDS = 720

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name("env-moss-music-models", create_if_missing=True)

# MOSS-Music's official production-serving guide requires the OpenMOSS SGLang fork
# (moss-audio branch) and recommends CuDNN 9.16 for the Torch 2.9.1 + CUDA 12.8 stack.
sglang_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-cudnn-devel-ubuntu22.04",
        add_python="3.12",
    )
    .apt_install("git", "ffmpeg", "curl")
    .run_commands(
        "git init /opt/sglang",
        "git -C /opt/sglang remote add origin https://github.com/OpenMOSS/sglang.git",
        f"git -C /opt/sglang fetch --depth 1 origin {SGLANG_REVISION}",
        "git -C /opt/sglang checkout --detach FETCH_HEAD",
        "python -m pip install --upgrade pip",
        "python -m pip install --no-cache-dir -e '/opt/sglang/python[all]'",
    )
    .pip_install(
        "nvidia-cudnn-cu12==9.16.0.29",
        "huggingface_hub",
        "fastapi",
        "httpx",
        "pydantic",
    )
)

download_image = modal.Image.debian_slim(python_version="3.12").pip_install("huggingface_hub")


@app.function(
    image=download_image,
    volumes={"/models": model_volume},
    timeout=60 * 60,
    cpu=2,
    memory=8192,
)
def download_model() -> dict[str, Any]:
    """Download model weights once and persist the exact upstream revision."""
    from huggingface_hub import HfApi, snapshot_download

    target = pathlib.Path(MODEL_DIR)
    manifest_path = pathlib.Path(MODEL_MANIFEST)
    if (target / "config.json").exists() and (target / "model.safetensors.index.json").exists() and manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            manifest = {}
        if manifest.get("repo") == MODEL_REPO and manifest.get("requested_ref") == MODEL_REVISION and isinstance(manifest.get("resolved_revision"), str):
            return {"ok": True, "downloaded": False, "model": MODEL_REPO, "revision": manifest["resolved_revision"]}

    # Resolve the mutable ref once to an immutable SHA, and then download exactly that SHA.
    info = HfApi().model_info(repo_id=MODEL_REPO, revision=MODEL_REVISION)
    resolved_revision = info.sha
    if not isinstance(resolved_revision, str) or len(resolved_revision) != 40:
        raise RuntimeError("Hugging Face did not return a full immutable commit SHA for the model revision.")

    if target.exists():
        import shutil
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)
    snapshot_download(repo_id=MODEL_REPO, revision=resolved_revision, local_dir=str(target))
    if not (target / "config.json").exists() or not (target / "model.safetensors.index.json").exists():
        raise RuntimeError("Model download completed without the required configuration and weight index.")
    manifest_path.write_text(
        json.dumps({"repo": MODEL_REPO, "requested_ref": MODEL_REVISION, "resolved_revision": resolved_revision}, indent=2) + "\n",
        encoding="utf-8",
    )
    model_volume.commit()
    return {"ok": True, "downloaded": True, "model": MODEL_REPO, "revision": resolved_revision}

@app.local_entrypoint()
def download_weights() -> None:
    """Run once before deploying the HTTP service: modal run app.py::download_weights."""
    result = download_model.remote()
    print(json.dumps(result))


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    audio_base64: str = Field(min_length=16, max_length=3_800_000)
    mime_type: str = Field(min_length=3, max_length=100)
    filename: str | None = Field(default=None, max_length=180)
    system: str = Field(min_length=1, max_length=24_000)
    prompt: str = Field(min_length=1, max_length=12_000)
    json_schema: dict[str, Any] | None = None
    max_tokens: int = Field(default=1200, ge=100, le=1800)
    temperature: float = Field(default=0.1, ge=0, le=0.5)


def _audio_suffix(mime_type: str) -> str:
    normalized = mime_type.lower().split(";", 1)[0].strip()
    suffixes = {
        "audio/wav": ".wav",
        "audio/wave": ".wav",
        "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/mp4": ".m4a",
        "audio/x-m4a": ".m4a",
        "audio/aac": ".aac",
        "audio/flac": ".flac",
        "audio/ogg": ".ogg",
        "audio/webm": ".webm",
    }
    suffix = suffixes.get(normalized)
    if suffix is None:
        raise HTTPException(status_code=415, detail="Unsupported audio MIME type.")
    return suffix


def _model_text(response_json: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    choices = response_json.get("choices")
    if not isinstance(choices, list) or not choices:
        raise HTTPException(status_code=502, detail="Music model returned no completion.")
    first = choices[0] if isinstance(choices[0], dict) else {}
    message = first.get("message") if isinstance(first.get("message"), dict) else {}
    content = message.get("content")
    if isinstance(content, list):
        content = "".join(
            part.get("text", "") for part in content
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        )
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=502, detail="Music model returned an empty completion.")
    usage = response_json.get("usage")
    return content.strip(), usage if isinstance(usage, dict) else {}


@asynccontextmanager
async def lifespan(web_app: FastAPI):
    if len(os.environ.get("MOSS_MUSIC_TOKEN", "")) < 32:
        raise RuntimeError("MOSS_MUSIC_TOKEN must be configured with at least 32 characters before serving requests.")
    model_path = pathlib.Path(MODEL_DIR)
    if not (model_path / "config.json").exists() or not (model_path / "model.safetensors.index.json").exists():
        raise RuntimeError("MOSS-Music weights are missing. Run the download_weights entry point first.")

    log_path = "/tmp/sglang-startup.log"
    log_file = open(log_path, "w", encoding="utf-8")
    process = subprocess.Popen(
        [
            "sglang", "serve",
            "--model-path", MODEL_DIR,
            "--trust-remote-code",
            "--host", "127.0.0.1",
            "--port", "30000",
            "--disable-log-requests",
        ],
        stdout=log_file,
        stderr=subprocess.STDOUT,
        env={**os.environ, "HF_HUB_DISABLE_TELEMETRY": "1"},
    )
    try:
        deadline = time.monotonic() + MODEL_STARTUP_TIMEOUT_SECONDS
        async with httpx.AsyncClient(timeout=4.0) as client:
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    log_file.flush()
                    try:
                        tail = pathlib.Path(log_path).read_text(encoding="utf-8")[-5000:]
                    except OSError:
                        tail = ""
                    raise RuntimeError(f"SGLang exited during model startup (exit={process.returncode}). Last startup output: {tail}")
                try:
                    response = await client.get(f"{SGLANG_URL}/health")
                    if response.status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                await asyncio.sleep(2)
            else:
                raise RuntimeError("MOSS-Music did not become ready before the startup deadline.")
        yield
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        log_file.close()


web_app = FastAPI(title="enV MOSS-Music Inference", docs_url=None, redoc_url=None, lifespan=lifespan)


@web_app.middleware("http")
async def enforce_private_response_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def _check_bearer(request: Request) -> None:
    configured = os.environ.get("MOSS_MUSIC_TOKEN", "")
    authorization = request.headers.get("authorization", "")
    provided = authorization[7:] if authorization.startswith("Bearer ") else ""
    if not configured or not provided or not hmac.compare_digest(provided, configured):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized.",
            headers={"WWW-Authenticate": "Bearer"},
        )


@web_app.get("/healthz")
async def healthz() -> dict[str, Any]:
    """No sensitive details; the readiness check exposes neither inputs nor credentials."""
    return {"ok": True, "service": "moss-music", "model": MODEL_REPO, "ready": True}


@web_app.post("/analyze")
async def analyze(request: Request) -> dict[str, Any]:
    _check_bearer(request)
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_JSON_BYTES:
        raise HTTPException(status_code=413, detail="Request body is too large.")
    received = bytearray()
    async for chunk in request.stream():
        if len(received) + len(chunk) > MAX_JSON_BYTES:
            raise HTTPException(status_code=413, detail="Request body is too large.")
        received.extend(chunk)
    raw = bytes(received)
    try:
        body = AnalyzeRequest.model_validate_json(raw)
    except ValidationError:
        raise HTTPException(status_code=400, detail="Invalid music analysis request.") from None

    suffix = _audio_suffix(body.mime_type)
    try:
        audio_bytes = base64.b64decode(body.audio_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Audio must be valid Base64.") from None
    if not audio_bytes or len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio payload is outside the accepted size limit.")

    properties = body.json_schema.get("properties", {}) if isinstance(body.json_schema, dict) else {}
    has_lyric_evidence = isinstance(properties, dict) and "lyric_evidence" in properties
    task_guard = (
        "This task is musical metadata tagging, not lyric processing. Never transcribe, quote, "
        "paraphrase, or guess lyrics or spoken words. Derive tags from the sound, arrangement, "
        "rhythm, timbre, vocal delivery, and production only. "
        + ("Return an empty string for lyric_evidence. " if has_lyric_evidence else "")
        + "Return valid JSON only and conform to the supplied JSON Schema."
    )
    schema_text = json.dumps(body.json_schema, ensure_ascii=False, separators=(",", ":")) if body.json_schema else ""
    system_text = "\n\n".join(part for part in [body.system, task_guard, f"JSON Schema: {schema_text}" if schema_text else ""] if part)
    started = time.perf_counter()
    with tempfile.NamedTemporaryFile(prefix="env-music-", suffix=suffix, delete=False) as audio_file:
        audio_file.write(audio_bytes)
        audio_path = audio_file.name
    try:
        payload = {
            "model": "default",
            "messages": [
                {"role": "system", "content": system_text},
                {
                    "role": "user",
                    "content": [
                        {"type": "audio_url", "audio_url": {"url": audio_path}},
                        {"type": "text", "text": body.prompt},
                    ],
                },
            ],
            "max_tokens": body.max_tokens,
            "temperature": body.temperature,
            "stream": False,
            "response_format": {"type": "json_object"} if body.json_schema else None,
        }
        if payload["response_format"] is None:
            del payload["response_format"]
        async with httpx.AsyncClient(timeout=GENERATION_TIMEOUT_SECONDS) as client:
            response = await client.post(f"{SGLANG_URL}/v1/chat/completions", json=payload)
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail="Music model could not process this request.")
        completion = response.json()
        text, usage = _model_text(completion)
        elapsed = max(0.0, time.perf_counter() - started)
        prompt_tokens = usage.get("prompt_tokens")
        completion_tokens = usage.get("completion_tokens")
        total_tokens = usage.get("total_tokens")
        choices = completion.get("choices")
        finish_reason = choices[0].get("finish_reason") if isinstance(choices, list) and choices and isinstance(choices[0], dict) else None
        return {
            "text": text,
            "compute_seconds": round(elapsed, 3),
            "usage": {
                "input_tokens": prompt_tokens if isinstance(prompt_tokens, int) and prompt_tokens >= 0 else None,
                "output_tokens": completion_tokens if isinstance(completion_tokens, int) and completion_tokens >= 0 else None,
                "total_tokens": total_tokens if isinstance(total_tokens, int) and total_tokens >= 0 else None,
            },
            "finish_reason": "length" if finish_reason == "length" else "stop",
            "model": MODEL_REPO,
        }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Music model inference timed out.") from None
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Music model is temporarily unavailable.") from None
    finally:
        try:
            os.unlink(audio_path)
        except OSError:
            pass


@app.function(
    image=sglang_image,
    gpu="A100-40GB",
    cpu=8,
    memory=49152,
    timeout=15 * 60,
    scaledown_window=60,
    max_containers=1,
    volumes={"/models": model_volume},
    secrets=[modal.Secret.from_name("env-moss-music-api", required_keys=["MOSS_MUSIC_TOKEN"])],
)
@modal.asgi_app()
def serve_api() -> FastAPI:
    return web_app
