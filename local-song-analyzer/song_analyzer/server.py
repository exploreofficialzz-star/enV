"""Loopback-only service with explicit origins, bearer auth, bounded jobs and expiry."""
import asyncio
import hashlib
import json
import os
import secrets
import shutil
import threading
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.formparsers import MultiPartException

from .audio import Cancelled, check_cancel, decode, export_pieces, probe, run_process, signal_analysis
from .contracts import Feedback, TagExport, clean_annotations
from .learning import LearningStore
from .models import AudioTagger, ENCODER, installed, local_interpretation, separate, transcribe

MAX_UPLOAD = 50 * 1024 * 1024
JOB_TTL = 3600
TERMINAL = {"completed", "partial", "failed", "cancelled"}


class LocalCORS(CORSMiddleware):
    def preflight_response(self, request_headers):
        response = super().preflight_response(request_headers)
        if response.status_code == 200 and request_headers.get("access-control-request-private-network") == "true":
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response


class BodyLimitMiddleware:
    """Count actual bytes, including chunked or incorrectly declared request bodies."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        limit = MAX_UPLOAD + 65536 if scope["path"] == "/v1/jobs" else 256 * 1024
        count = 0

        async def bounded_receive():
            nonlocal count
            message = await receive()
            count += len(message.get("body", b""))
            if count > limit:
                scope.setdefault("state", {})["song_body_too_large"] = True
                # The multipart parser closes its temporary files for this exception.
                raise MultiPartException("Request body is too large")
            return message

        await self.app(scope, bounded_receive, send)


@dataclass
class Job:
    id: str
    path: Path
    filename: str
    source_hash: str
    options: dict
    created: float = field(default_factory=time.time)
    updated: float = field(default_factory=time.time)
    state: str = "queued"
    stage: str = "Queued"
    progress: int = 0
    cancel: threading.Event = field(default_factory=threading.Event)
    result: dict | None = None
    embedding: list[float] = field(default_factory=list)
    error: str | None = None


class Runtime:
    def __init__(self, root: Path):
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.root = root
        self.jobs: dict[str, Job] = {}
        self.lock = threading.RLock()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="song-analysis")
        self.store = LearningStore(root / "reviews.sqlite3")
        self.tagger = AudioTagger()

    def update(self, job: Job, stage: str, progress: int):
        check_cancel(job.cancel)
        with self.lock:
            job.stage, job.progress, job.updated = stage, min(99, progress), time.time()

    def sweep(self):
        with self.lock:
            for key, job in list(self.jobs.items()):
                if job.state in TERMINAL and time.time() - job.updated > JOB_TTL:
                    shutil.rmtree(job.path.parent, ignore_errors=True)
                    del self.jobs[key]

    def process(self, job: Job):
        warnings, artifacts, tags, windows = [], [], {}, []
        work = job.path.parent
        try:
            job.state = "running"
            self.update(job, "Reading metadata", 5)
            metadata = probe(job.path, job.cancel)
            self.update(job, "Decoding audio", 10)
            samples = decode(job.path, work, job.cancel)
            self.update(job, "Measuring full track", 20)
            signal = signal_analysis(samples, job.cancel)
            if job.options["tagging"]:
                self.update(job, "Tagging audio windows", 35)
                try:
                    job.embedding, tags, windows = self.tagger.analyze(samples, job.cancel, lambda p: self.update(job, "Tagging audio windows", 35 + round(min(1, p) * 30)))
                    if not job.embedding:
                        warnings.append("No audible content was found for semantic tagging.")
                except Cancelled:
                    raise
                except Exception:
                    warnings.append("Audio tagger unavailable. Install the tagger extra and run the prepare command to download the pinned CLAP checkpoint.")
            learned = self.store.predict(job.embedding, ENCODER) if job.embedding else {}
            llm = None
            if job.options["llm"] and tags:
                self.update(job, "Reviewing candidates with local LLM", 68)
                try:
                    llm = local_interpretation({**tags, **{k: v for k, v in learned.items() if v}}, signal, self.store.status(), job.cancel)
                except Cancelled:
                    raise
                except Exception:
                    warnings.append("Local LLM unavailable or returned unsupported tags. Audio candidates are still available.")
            lyrics = {"status": "not_requested", "segments": [], "language": None, "language_score": None}
            if job.options["transcription"]:
                self.update(job, "Transcribing candidate lyrics", 75)
                try:
                    lyrics = transcribe(samples, os.getenv("SONG_WHISPER_MODEL", ""), job.cancel)
                except Cancelled:
                    raise
                except Exception:
                    warnings.append("Transcription unavailable. Install the transcription extra and configure a downloaded local Whisper model.")
                    lyrics["status"] = "unavailable"
            if job.options["pieces"]:
                self.update(job, "Exporting sections", 80)
                artifacts.extend(export_pieces(job.path, work, signal["sections"], job.cancel))
            if job.options["stems"]:
                self.update(job, "Separating stems", 85)
                try:
                    artifacts.extend(separate(job.path, work, job.cancel))
                except Cancelled:
                    raise
                except Exception:
                    warnings.append("Stem separation unavailable. Install the stems extra and prepare Demucs weights first.")
            self.update(job, "Packaging results", 95)
            # Values are bounded by our producers; FFprobe contains embedded, unverified tags.
            result = {"schema_version": "env.local-song.v1", "source_sha256": job.source_hash, "filename": job.filename,
                      "metadata": metadata, "signal": signal, "candidates": tags, "learned_tags": learned,
                      "windows": windows, "lyrics": lyrics, "llm": llm,
                      "model": {"encoder": ENCODER if job.embedding else None, "learning": self.store.status(),
                                "score_meaning": "Uncalibrated similarity/ridge score. Suggestions need human review."},
                      "processing": {"location": "local_companion", "hosted_inference": False, "audio_retention_seconds": JOB_TTL,
                                     "tagging_coverage": "full_track_10_second_windows" if windows else "not_run"},
                      "artifacts": artifacts, "warnings": warnings, "reviewed": False}
            (work / "analysis.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
            with zipfile.ZipFile(work / "analysis.zip", "w", compression=zipfile.ZIP_STORED) as archive:
                archive.write(work / "analysis.json", "analysis.json")
                for artifact in artifacts:
                    check_cancel(job.cancel)
                    archive.write(work / artifact["name"], artifact["name"])
            with self.lock:
                check_cancel(job.cancel)
                job.result, job.progress = result, 100
                job.state = "partial" if warnings else "completed"
                job.stage, job.updated = "Ready", time.time()
        except Cancelled:
            job.state, job.stage = "cancelled", "Cancelled"
        except Exception as error:
            job.state, job.stage = "failed", "Failed"
            job.error = str(error)[:200] if isinstance(error, (ValueError, TimeoutError)) else "Local analysis failed; verify the audio file and installed dependencies."
        finally:
            # Keep source for section/stem downloads only until TTL; remove analysis scratch immediately.
            (work / "analysis.f32").unlink(missing_ok=True)
            job.updated = time.time()
            if job.state in {"failed", "cancelled"}:
                shutil.rmtree(work, ignore_errors=True)


def create_app(root: Path | None = None, token: str | None = None, origins: list[str] | None = None):
    root = root or Path(os.getenv("SONG_DATA_DIR", str(Path.home() / ".local/share/env-song-analyzer")))
    token = token or os.getenv("SONG_API_TOKEN")
    if not token or len(token) < 24:
        raise ValueError("Set SONG_API_TOKEN to a random secret of at least 24 characters")
    origins = origins if origins is not None else os.getenv("SONG_ALLOWED_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080").split(",")
    if "*" in origins:
        raise ValueError("Set explicit SONG_ALLOWED_ORIGINS; wildcards are not supported")
    runtime = Runtime(root)

    @asynccontextmanager
    async def lifespan(_app):
        async def cleanup():
            while True:
                await asyncio.sleep(30)
                runtime.sweep()
        task = asyncio.create_task(cleanup())
        # Remove orphaned audio from earlier crashed processes; reviews persist separately.
        for path in root.glob("job-*"):
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
        yield
        task.cancel()
        for job in list(runtime.jobs.values()):
            job.cancel.set()
        runtime.executor.shutdown(wait=True, cancel_futures=True)
        for job in list(runtime.jobs.values()):
            shutil.rmtree(job.path.parent, ignore_errors=True)

    app = FastAPI(title="enV Local Song Analyzer", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.runtime = runtime

    @app.middleware("http")
    async def guard(request: Request, call_next):
        # Also reject DNS rebinding and non-loopback access, even if someone changes uvicorn's bind.
        if request.url.hostname not in {"localhost", "127.0.0.1", "::1"}:
            return JSONResponse({"detail": "Loopback host required"}, status_code=403)
        origin = request.headers.get("origin")
        if origin and origin not in origins:
            return JSONResponse({"detail": "Origin is not allowed"}, status_code=403)
        authorization = request.headers.get("authorization", "")
        if not secrets.compare_digest(authorization, "Bearer " + token):
            return JSONResponse({"detail": "Local API token required"}, status_code=401)
        # Stop oversized multipart requests before Starlette spools them to disk.
        if request.method == "POST" and request.url.path == "/v1/jobs":
            try:
                size = int(request.headers.get("content-length", "0"))
            except ValueError:
                size = 0
            if size <= 0 or size > MAX_UPLOAD + 65536:
                return JSONResponse({"detail": "Audio upload requires a bounded Content-Length (50 MB maximum)"}, status_code=413)
        response = await call_next(request)
        if getattr(request.state, "song_body_too_large", False):
            return JSONResponse({"detail": "Request body is too large"}, status_code=413)
        response.headers["Cache-Control"] = "no-store"
        return response

    app.add_middleware(BodyLimitMiddleware)
    app.add_middleware(LocalCORS, allow_origins=origins, allow_credentials=False,
                       allow_methods=["GET", "POST", "DELETE"], allow_headers=["Authorization", "Content-Type"], expose_headers=["Content-Disposition"])

    def get_job(job_id):
        runtime.sweep()
        with runtime.lock:
            job = runtime.jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Job expired or not found")
        return job

    @app.get("/v1/health")
    def health():
        return {"schema_version": "env.local-song.v1", "location": "local_companion", "ffmpeg": bool(shutil.which("ffmpeg") and shutil.which("ffprobe")),
                "tagger_installed": installed("transformers") and installed("torch"), "tagger_loaded": runtime.tagger.model is not None,
                "transcription_configured": installed("faster_whisper") and Path(os.getenv("SONG_WHISPER_MODEL", "/nonexistent")).is_dir(),
                "stems_configured": installed("demucs") and (Path(os.getenv("SONG_DEMUCS_REPO", "/nonexistent")) / "955717e8-8726e21a.th").is_file(),
                "learning": runtime.store.status()}

    @app.post("/v1/jobs", status_code=202)
    async def submit(audio: UploadFile = File(...), options: str = Form("{}")):
        try:
            requested = json.loads(options)
            allowed = {"tagging", "llm", "transcription", "pieces", "stems"}
            if not isinstance(requested, dict) or set(requested) - allowed or any(type(v) is not bool for v in requested.values()):
                raise ValueError()
        except (ValueError, TypeError):
            raise HTTPException(422, "Invalid analysis options")
        runtime.sweep()
        with runtime.lock:
            # Reservations happen before reading so concurrent uploads cannot overfill the queue.
            if sum(job.state not in TERMINAL for job in runtime.jobs.values()) >= 4 or len(runtime.jobs) >= 12:
                raise HTTPException(429, "Local queue is full; remove completed jobs or wait")
            job_id = secrets.token_hex(16)
            work = runtime.root / ("job-" + job_id)
            work.mkdir(mode=0o700)
            path = work / "source.audio"
            job = Job(job_id, path, Path(audio.filename or "audio").name[:255], "", {key: requested.get(key, key == "tagging") for key in allowed})
            runtime.jobs[job_id] = job
        try:
            size, digest = 0, hashlib.sha256()
            with path.open("wb") as output:
                while chunk := await audio.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_UPLOAD:
                        raise HTTPException(413, "Audio exceeds 50 MB")
                    digest.update(chunk)
                    output.write(chunk)
            if size == 0:
                raise HTTPException(422, "Audio file is empty")
            job.source_hash = digest.hexdigest()
            runtime.executor.submit(runtime.process, job)
        except BaseException:
            with runtime.lock:
                runtime.jobs.pop(job_id, None)
            shutil.rmtree(work, ignore_errors=True)
            raise
        finally:
            await audio.close()
        return {"id": job_id}

    @app.get("/v1/jobs/{job_id}")
    def status(job_id: str):
        job = get_job(job_id)
        with runtime.lock:
            return {"id": job.id, "state": job.state, "stage": job.stage, "progress": job.progress, "error": job.error, "result": job.result}

    @app.post("/v1/jobs/{job_id}/cancel")
    def cancel(job_id: str):
        job = get_job(job_id)
        if job.state not in TERMINAL:
            job.cancel.set()
        return {"cancel_requested": True}

    @app.delete("/v1/jobs/{job_id}")
    def delete(job_id: str):
        job = get_job(job_id)
        if job.state not in TERMINAL:
            raise HTTPException(409, "Cancel the running job before deleting it")
        shutil.rmtree(job.path.parent, ignore_errors=True)
        with runtime.lock:
            runtime.jobs.pop(job_id, None)
        return {"deleted": True}

    @app.get("/v1/jobs/{job_id}/artifacts/{name:path}")
    def artifact(job_id: str, name: str):
        job = get_job(job_id)
        if not job.result:
            raise HTTPException(409, "Results are not ready")
        allowed = {"analysis.zip", "analysis.json"} | {item["name"] for item in job.result["artifacts"]}
        if name not in allowed:
            raise HTTPException(404, "Artifact not found")
        return FileResponse(job.path.parent / name, filename=Path(name).name)

    @app.post("/v1/feedback")
    def feedback(value: Feedback):
        job = get_job(value.job_id)
        if not job.result or not job.embedding:
            raise HTTPException(409, "A completed audio embedding is required for learning")
        try:
            runtime.store.save(job.source_hash, ENCODER, job.embedding, value.annotations, value.reviewer)
        except ValueError as error:
            raise HTTPException(422, str(error))
        return runtime.store.status()

    @app.post("/v1/jobs/{job_id}/tagged-copy")
    def tagged_copy(job_id: str, value: TagExport):
        job = get_job(job_id)
        if not job.result:
            raise HTTPException(409, "Analysis must finish before exporting tags")
        try:
            annotations = clean_annotations(value.annotations)
            audio = next(stream for stream in job.result["metadata"]["streams"] if stream.get("codec_type") == "audio")
            codec = audio.get("codec_name", "")
            extension = {"mp3": "mp3", "flac": "flac", "aac": "m4a", "alac": "m4a", "vorbis": "ogg", "opus": "opus"}.get(codec, "wav" if codec.startswith("pcm_") else "mka")
            target = job.path.parent / ("reviewed-tags." + extension)
            labels = json.dumps({"env_reviewed_tags": annotations}, ensure_ascii=False, separators=(",", ":"))
            source_tags = job.result["metadata"].get("format", {}).get("tags", {})
            existing_comment = next((str(v) for k, v in source_tags.items() if k.lower() == "comment"), "")
            comment = existing_comment + "\n" + labels
            if len(comment.encode("utf-8")) > 120_000:
                raise ValueError("The existing comment and reviewed labels are too large to tag safely; use the JSON report")
            args = ["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-i", str(job.path),
                    "-map", "0:a:0", "-map_metadata", "0", "-c:a", "copy", "-metadata", "comment=" + comment]
            for field in ["genre", "language", "mood"]:
                if field in annotations:
                    args += ["-metadata", field + "=" + "; ".join(annotations[field])]
            # Only attached artwork, never unrelated video tracks.
            if extension in {"mp3", "m4a", "flac"}:
                for stream in job.result["metadata"]["streams"]:
                    if stream.get("disposition", {}).get("attached_pic"):
                        args += ["-map", f"0:{stream['index']}", "-c:v", "copy"]
                        break
            run_process(args + ["-y", str(target)], threading.Event())
            exported = probe(target, threading.Event())
            output_tags = exported.get("format", {}).get("tags", {})
            if not any(labels in str(tag) for tag in output_tags.values()):
                raise ValueError("This container did not preserve the reviewed tags; JSON export is available instead")
            # Source bytes remain untouched; tagging is independent of training consent.
            return FileResponse(target, filename=Path(job.filename).stem + "-reviewed." + extension)
        except (ValueError, TimeoutError) as error:
            raise HTTPException(422, str(error))

    @app.post("/v1/train")
    def train():
        try:
            return runtime.store.train()
        except ValueError as error:
            raise HTTPException(422, str(error))

    return app
