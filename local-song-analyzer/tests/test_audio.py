import json
import shutil
import threading
import wave

import numpy as np
import pytest

from song_analyzer.audio import Cancelled, decode, export_pieces, probe, run_process, signal_analysis


def make_wav(path, seconds=2, silent=False):
    sr = 16000
    y = np.zeros(int(sr * seconds)) if silent else np.sin(np.arange(int(sr * seconds)) * 2 * np.pi * 440 / sr) * 0.3
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sr)
        audio.writeframes((y * 32767).astype("<i2").tobytes())
    return path


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg required")
def test_real_decode_metadata_sections_and_silence(tmp_path):
    cancel = threading.Event()
    source = make_wav(tmp_path / "track.wav", silent=True)
    metadata = probe(source, cancel)
    assert metadata["streams"][0]["sample_rate"] == "16000"
    samples = decode(source, tmp_path, cancel)
    assert len(samples) == 96000
    signal = signal_analysis(samples, cancel)
    assert signal["tempo_bpm"] is None
    assert signal["key"] is None
    assert signal["sections"][0]["start_seconds"] == 0
    assert signal["sections"][-1]["end_seconds"] == pytest.approx(2)
    artifacts = export_pieces(source, tmp_path, signal["sections"], cancel)
    with wave.open(str(tmp_path / artifacts[0]["name"]), "rb") as exported:
        assert exported.getnchannels() == 2
        assert exported.getnframes() / exported.getframerate() == pytest.approx(2)


def test_process_cancellation_is_bounded():
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(Cancelled):
        run_process(["python", "-c", "import time; time.sleep(20)"], cancel)


def test_corrupt_audio_fails(tmp_path):
    source = tmp_path / "broken.wav"
    source.write_text("not audio")
    with pytest.raises(ValueError):
        probe(source, threading.Event())
