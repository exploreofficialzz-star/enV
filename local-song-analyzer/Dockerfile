FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/song-models/huggingface \
    SONG_DEMUCS_REPO=/opt/song-models/demucs \
    SONG_WHISPER_MODEL=/opt/song-models/whisper-tiny \
    SONG_DATA_DIR=/tmp/env-song-analyzer \
    SONG_TORCH_THREADS=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY local-song-analyzer/ ./local-song-analyzer/
RUN pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install -e './local-song-analyzer[tagger,transcription,stems]' \
    && env-song-analyzer prepare \
    && env-song-analyzer prepare-stems \
    && python -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-tiny', revision='d90ca5fe260221311c53c58e660288d3deb8d356', local_dir='/opt/song-models/whisper-tiny')"

EXPOSE 10000
CMD ["python", "-m", "song_analyzer.remote"]
