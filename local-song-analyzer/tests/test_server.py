import io
import time
import zipfile

import pytest
from fastapi.testclient import TestClient

from song_analyzer.server import create_app
from test_audio import make_wav

TOKEN = "test-token-12345678901234567890"
HEADERS = {"Authorization": "Bearer " + TOKEN, "Origin": "http://localhost:8080"}


def test_loopback_auth_and_cors_boundaries(tmp_path):
    with TestClient(create_app(tmp_path, TOKEN), base_url="http://127.0.0.1") as client:
        assert client.get("/v1/health").status_code == 401
        assert client.get("/v1/health", headers=HEADERS).status_code == 200
        assert client.get("/v1/health", headers={**HEADERS, "Origin": "https://untrusted.test"}).status_code == 403
        assert client.get("/v1/health", headers={**HEADERS, "Host": "rebind.invalid"}).status_code == 403
        response = client.options("/v1/jobs", headers={"Origin": "http://localhost:8080", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization"})
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "http://localhost:8080"
        response = client.options("/v1/jobs", headers={"Origin": "http://localhost:8080", "Access-Control-Request-Method": "POST", "Access-Control-Request-Private-Network": "true"})
        assert response.headers["access-control-allow-private-network"] == "true"
        assert client.post("/v1/jobs", headers=HEADERS, files={"audio": ("empty.wav", b"")}).status_code == 422


def test_real_job_export_and_delete(tmp_path):
    audio = make_wav(tmp_path / "fixture.wav", silent=True).read_bytes()
    with TestClient(create_app(tmp_path / "data", TOKEN), base_url="http://127.0.0.1") as client:
        response = client.post("/v1/jobs", headers=HEADERS, files={"audio": ("../fixture.wav", audio)},
                               data={"options": '{"tagging":false,"pieces":true}'})
        assert response.status_code == 202, response.text
        job_id = response.json()["id"]
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            job = client.get(f"/v1/jobs/{job_id}", headers=HEADERS).json()
            if job["state"] in {"completed", "partial", "failed"}:
                break
            time.sleep(0.1)
        assert job["state"] == "completed", job
        assert job["result"]["filename"] == "fixture.wav"
        assert job["result"]["processing"]["hosted_inference"] is False
        response = client.get(f"/v1/jobs/{job_id}/artifacts/analysis.zip", headers=HEADERS)
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            assert set(archive.namelist()) == {"analysis.json", "section-01.wav"}
        assert not list((tmp_path / "data").rglob("analysis.f32"))
        response = client.post(f"/v1/jobs/{job_id}/tagged-copy", headers=HEADERS, json={"annotations": {"genre": ["Rock"], "mood": ["calm"]}, "reviewed": True})
        assert response.status_code == 200, response.text
        assert b"env_reviewed_tags" in response.content
        assert b"Rock" in response.content
        assert client.get("/v1/health", headers=HEADERS).json()["learning"]["reviewed_tracks"] == 0
        assert (tmp_path / "fixture.wav").read_bytes() == audio
        assert client.post("/v1/feedback", headers=HEADERS, json={"job_id": job_id, "annotations": {"genre": ["Rock"]}, "reviewer": "QA", "reviewed": True, "training_consent": False}).status_code == 422
        assert client.delete(f"/v1/jobs/{job_id}", headers=HEADERS).status_code == 200
        assert client.get(f"/v1/jobs/{job_id}", headers=HEADERS).status_code == 404


def test_actual_body_limit_cannot_be_bypassed_by_lying_about_length(tmp_path, monkeypatch):
    import song_analyzer.server as server
    monkeypatch.setattr(server, "MAX_UPLOAD", 128)
    with TestClient(create_app(tmp_path, TOKEN), base_url="http://127.0.0.1") as client:
        response = client.post("/v1/jobs", headers={**HEADERS, "Content-Length": "1"}, files={"audio": ("large.wav", b"x" * 100_000)})
        assert response.status_code == 413, response.text


@pytest.mark.parametrize("stem_mode,expected_source", [("valid", "vocal_stem"), ("absent", "full_mix"), ("invalid", "full_mix")])
def test_stem_recognition_and_transcription_use_the_correct_audio(tmp_path, monkeypatch, stem_mode, expected_source):
    import hashlib
    import shutil
    import numpy as np
    import song_analyzer.server as server

    work = tmp_path / "job"
    work.mkdir()
    source = make_wav(work / "track.wav")
    heard = {}

    def fake_separate(path, directory, cancel):
        folder = directory / "stems"
        folder.mkdir()
        artifacts = []
        for name in ("bass", "drums", "other", "vocals"):
            target = folder / f"{name}.wav"
            if name == "vocals" and stem_mode == "invalid":
                target.write_bytes(b"not audio")
            elif name == "vocals":
                make_wav(target, silent=True)
            else:
                shutil.copy(path, target)
            artifacts.append({"name": str(target.relative_to(directory)), "kind": "stem", "bytes": target.stat().st_size})
        return artifacts

    def fake_transcribe(samples, model_path, cancel, source):
        heard["source"] = source
        heard["energy"] = float(np.mean(np.abs(samples)))
        return {"status": "candidate_transcript", "language": None, "language_score": None,
                "segments": [], "source": source, "coverage_seconds": len(samples) / server.SAMPLE_RATE, "truncated": False}

    class FakeTagger:
        def analyze(self, samples, cancel, progress):
            progress(1)
            return [0.5], {"instruments": [{"label": "guitar", "score": 0.5, "source": "clap_similarity"}]}, []

    monkeypatch.setattr(server, "separate", fake_separate)
    monkeypatch.setattr(server, "transcribe", fake_transcribe)
    runtime = server.Runtime(tmp_path / "data")
    runtime.tagger = FakeTagger()
    monkeypatch.setattr(runtime.store, "predict", lambda *args: {})
    options = {"stems": stem_mode != "absent", "tagging": True, "transcription": True, "llm": False, "pieces": False}
    job = server.Job("f" * 32, source, source.name, hashlib.sha256(source.read_bytes()).hexdigest(), options)
    try:
        runtime.process(job)
    finally:
        runtime.executor.shutdown(wait=True)
    assert job.state in {"completed", "partial"}, job.error
    assert heard["source"] == expected_source == job.result["lyrics"]["source"]
    assert (heard["energy"] < 1e-5) is (expected_source == "vocal_stem")
    assert len(job.result["stem_analysis"]) == (0 if stem_mode == "absent" else 3)
    assert all(item["coverage_seconds"] == pytest.approx(2) for item in job.result["stem_analysis"])
    assert not list(work.glob("*.f32"))
    if stem_mode == "invalid":
        assert any("full mix" in warning for warning in job.result["warnings"])
