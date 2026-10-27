"""Bounded local decoding and full-track DSP. External media URLs are never accepted."""
import json
import os
import signal
import subprocess
import threading
import time
from pathlib import Path

import numpy as np


MAX_SECONDS = 15 * 60
SAMPLE_RATE = 48_000


class Cancelled(Exception):
    pass


def check_cancel(cancel: threading.Event):
    if cancel.is_set():
        raise Cancelled("Analysis cancelled")


def run_process(args: list[str], cancel: threading.Event, timeout: int = 180, env: dict | None = None):
    check_cancel(cancel)
    # Files, not pipes, keep stdout/stderr bounded in memory. No shell interpolation.
    import tempfile
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=out, stderr=err, env=env, start_new_session=os.name == "posix")
        started = time.monotonic()
        try:
            while process.poll() is None:
                check_cancel(cancel)
                if time.monotonic() - started > timeout:
                    raise TimeoutError("Audio processing timed out")
                cancel.wait(0.1)
            if process.returncode:
                raise ValueError(f"{Path(args[0]).name} could not process this audio")
            if out.tell() > 4 * 1024 * 1024:
                raise ValueError("Media metadata exceeded the output limit")
            out.seek(0)
            return out.read()
        finally:
            if process.poll() is None:
                if os.name == "posix":
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                else:
                    process.kill()
            process.wait()


def probe(path: Path, cancel: threading.Event) -> dict:
    result = json.loads(run_process([
        "ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-max_alloc", "268435456",
        "-show_format", "-show_streams", "-show_chapters", "-of", "json", str(path),
    ], cancel, 30))
    audio = next((stream for stream in result.get("streams", []) if stream.get("codec_type") == "audio"), None)
    if not audio:
        raise ValueError("No audio stream found")
    duration = float(result.get("format", {}).get("duration") or audio.get("duration") or 0)
    if not np.isfinite(duration) or not 0 < duration <= MAX_SECONDS:
        raise ValueError("Audio must have a known duration between 0 and 15 minutes")
    return result


def decode(path: Path, work: Path, cancel: threading.Event, target_name: str = "analysis.f32") -> np.memmap:
    if Path(target_name).name != target_name or not target_name.endswith(".f32"):
        raise ValueError("Invalid decoded audio target")
    target = work / target_name
    run_process([
        "ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-max_alloc", "268435456",
        "-i", str(path), "-map", "0:a:0", "-vn", "-t", str(MAX_SECONDS + 1), "-ac", "1",
        "-ar", str(SAMPLE_RATE), "-f", "f32le", "-y", str(target),
    ], cancel)
    samples = np.memmap(target, dtype="<f4", mode="r")
    if not 0 < len(samples) <= SAMPLE_RATE * MAX_SECONDS or not np.isfinite(samples).all():
        raise ValueError("Decoded audio exceeds the duration limit or contains invalid samples")
    return samples


def signal_analysis(samples: np.ndarray, cancel: threading.Event) -> dict:
    import librosa
    # Resample the entire track for signal analysis, preserving original rates in ffprobe.
    from scipy.signal import resample_poly
    y = resample_poly(np.asarray(samples), 1, 3).astype(np.float32)
    sr = SAMPLE_RATE // 3
    check_cancel(cancel)
    hop = 1024
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    check_cancel(cancel)
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=hop)
    check_cancel(cancel)
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop)
    energy = chroma.mean(axis=1)
    profile = energy - energy.mean()
    major = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    scores = []
    for mode, template in [("major", major), ("minor", minor)]:
        for root in range(12):
            centered = np.roll(template, root) - template.mean()
            correlation = float(np.dot(profile, centered) / max(1e-9, np.linalg.norm(profile) * np.linalg.norm(centered)))
            scores.append((correlation, root, mode))
    scores.sort(reverse=True)
    notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    peak = float(np.max(np.abs(y)))
    silent = peak < 1e-5
    bpm = float(np.asarray(tempo).reshape(-1)[0]) if not silent else None
    # Sections are feature changes, never invented verse/chorus names.
    seconds = len(samples) / SAMPLE_RATE
    block = max(1, round(sr / hop * 2))
    features = []
    for start in range(0, chroma.shape[1], block):
        features.append(np.r_[chroma[:, start:start + block].mean(axis=1), rms[start:start + block].mean() * 4])
    changes = np.linalg.norm(np.diff(np.array(features), axis=0), axis=1) if len(features) > 1 else np.array([])
    boundaries = [0.0]
    if len(changes):
        threshold = float(np.quantile(changes, 0.85))
        for i, change in enumerate(changes):
            timestamp = (i + 1) * 2.0
            if change > max(threshold, 0.2) and timestamp - boundaries[-1] >= 10 and seconds - timestamp >= 5:
                boundaries.append(timestamp)
    boundaries.append(seconds)
    sections = [{"start_seconds": a, "end_seconds": b, "label": f"Section {i + 1}", "label_source": "signal_change", "tags": {}}
                for i, (a, b) in enumerate(zip(boundaries[:-1], boundaries[1:]))]
    chords = []
    for i in range(0, chroma.shape[1], block):
        vector = chroma[:, i:i + block].mean(axis=1)
        candidates = [(sum(vector[(root + step) % 12] for step in steps) / max(1e-9, vector.sum()), root, mode)
                      for mode, steps in [("major", [0, 4, 7]), ("minor", [0, 3, 7])] for root in range(12)]
        score, root, mode = max(candidates)
        chords.append({"start_seconds": round(i * hop / sr, 3), "end_seconds": round(min(seconds, (i + block) * hop / sr), 3),
                       "chord": f"{notes[root]} {mode}" if not silent and score >= 0.4 else None, "template_score": round(float(score), 4)})
    check_cancel(cancel)
    return {
        "duration_seconds": seconds, "analysis_sample_rate_hz": sr, "coverage": "full_track",
        "peak_dbfs": round(20 * np.log10(max(1e-10, peak)), 2),
        "rms_dbfs": round(float(20 * np.log10(max(1e-10, np.sqrt(np.mean(y ** 2))))), 2),
        "clipped_sample_percent": round(float(np.mean(np.abs(samples) >= 0.999) * 100), 4),
        "tempo_bpm": round(bpm, 2) if bpm and len(beats) > 2 else None,
        "tempo_alternatives_bpm": [round(bpm / 2, 2), round(bpm * 2, 2)] if bpm and len(beats) > 2 else [],
        "beat_times_seconds": librosa.frames_to_time(beats, sr=sr, hop_length=hop).round(3).tolist() if not silent else [],
        "key": f"{notes[scores[0][1]]} {scores[0][2]}" if not silent and scores[0][0] >= 0.35 else None,
        "key_candidates": [{"key": f"{notes[root]} {mode}", "template_score": round(score, 4)} for score, root, mode in scores[:3]] if not silent else [],
        "sections": sections, "chords": chords,
        "method": "librosa beat tracking; chroma key/chord templates; signal-change sections. Estimates require review.",
    }


def export_pieces(source: Path, work: Path, sections: list[dict], cancel: threading.Event) -> list[dict]:
    artifacts = []
    for i, section in enumerate(sections[:90]):
        name = f"section-{i + 1:02d}.wav"
        run_process(["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-i", str(source),
                     "-ss", str(section["start_seconds"]), "-t", str(section["end_seconds"] - section["start_seconds"]),
                     "-map", "0:a:0", "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", "-y", str(work / name)], cancel)
        artifacts.append({"name": name, "kind": "section", "bytes": (work / name).stat().st_size})
    return artifacts
