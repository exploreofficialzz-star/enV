import time
from fastapi.testclient import TestClient
from song_analyzer.remote import create_remote_app
from test_audio import make_wav

KEY = "test-backend-processor-key-123456789"


def test_backend_gateway_limits_access_and_labels_hosted_processing(tmp_path):
    audio = make_wav(tmp_path / "fixture.wav", silent=True).read_bytes()
    with TestClient(create_remote_app(tmp_path / "data", KEY), base_url="https://processor.example") as client:
        assert client.get("/health").status_code == 200
        assert client.get("/v1/health").status_code == 401
        headers = {"X-Song-Processor-Key": KEY, "Origin": "https://envtools.store"}
        assert client.get("/v1/health", headers=headers).json()["location"] == "remote_backend"
        assert client.post("/v1/train", headers=headers).status_code == 404
        assert client.post("/v1/feedback", headers=headers).status_code == 404
        response = client.post("/v1/jobs", headers=headers, files={"audio": ("fixture.wav", audio)}, data={"options": '{"tagging":false}'})
        assert response.status_code == 202, response.text
        job_id = response.json()["id"]
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            job = client.get(f"/v1/jobs/{job_id}", headers=headers).json()
            if job["state"] in {"completed", "partial", "failed"}:
                break
            time.sleep(0.1)
        assert job["state"] == "completed", job
        assert job["result"]["processing"]["location"] == "remote_backend"
        assert job["result"]["processing"]["hosted_inference"] is True
        assert client.get(f"/v1/jobs/{job_id}").status_code == 401
        assert client.delete(f"/v1/jobs/{job_id}", headers=headers).status_code == 200
