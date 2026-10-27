"""Separate bounded overlapping windows and write continuous WAVs without holding a whole song in RAM."""
import os
import subprocess
import sys
from contextlib import ExitStack
from pathlib import Path

import numpy as np
import soundfile as sf

RATE = 44_100
MAX_FRAMES = 900 * RATE


def windows(frames: int, rate: int = RATE, seconds: int = 20, padding: int = 2):
    block, pad = rate * seconds, rate * padding
    for start in range(0, frames, block):
        end = min(frames, start + block)
        yield start, end, max(0, start - pad), min(frames, end + pad)


def main():
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    if len(sys.argv) != 4:
        raise ValueError("Expected source, output directory and model repository")
    source, output, repo = map(Path, sys.argv[1:])
    output.mkdir(parents=True, exist_ok=True)
    raw = output / "source.f32"
    try:
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-max_alloc", "268435456", "-i", str(source), "-map", "0:a:0", "-vn", "-t", "901", "-ac", "2", "-ar", str(RATE), "-f", "f32le", "-y", str(raw)], check=True, stdin=subprocess.DEVNULL)
        size = raw.stat().st_size
        if size <= 0 or size % 8 or size // 8 > MAX_FRAMES:
            raise ValueError("Decoded audio exceeds the 15 minute limit")
        frames = size // 8
        pcm = np.memmap(raw, dtype="<f4", mode="r", shape=(frames, 2))
        torch.set_num_threads(max(1, min(4, int(os.getenv("SONG_TORCH_THREADS", "2")))))
        model = get_model("htdemucs", repo=repo).cpu().eval()
        if model.samplerate != RATE or model.audio_channels != 2 or set(model.sources) != {"vocals", "drums", "bass", "other"}:
            raise ValueError("The separation model has an unexpected format")
        with ExitStack() as stack:
            writers = {name: stack.enter_context(sf.SoundFile(str(output / f"{name}.wav"), mode="w", samplerate=RATE, channels=2, subtype="PCM_16")) for name in model.sources}
            for start, end, padded_start, padded_end in windows(frames):
                chunk = np.asarray(pcm[padded_start:padded_end]).copy()
                if not np.isfinite(chunk).all():
                    raise ValueError("Audio contains invalid samples")
                mix = torch.from_numpy(chunk.T.copy())
                ref = mix.mean(0)
                mean, scale = ref.mean(), ref.std()
                if float(scale) < 1e-8:
                    scale = mix.square().mean().sqrt()
                if float(scale) < 1e-8:
                    for writer in writers.values():
                        writer.write(np.zeros((end - start, 2), dtype=np.float32))
                    continue
                mix = (mix - mean) / scale
                with torch.inference_mode():
                    stems = apply_model(model, mix[None], device="cpu", shifts=0, split=True, overlap=0.25, segment=7, progress=False, num_workers=0)[0]
                    stems = stems * scale + mean
                left, right = start - padded_start, end - padded_start
                for index, name in enumerate(model.sources):
                    values = stems[index, :, left:right].T.numpy()
                    writers[name].write(np.clip(values, -1, 1))
        del pcm
    finally:
        raw.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
