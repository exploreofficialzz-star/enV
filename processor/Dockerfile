FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    npm_config_update_notifier=false \
    npm_config_fund=false \
    npm_config_audit=false \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
  && python3 -m pip install --break-system-packages --no-cache-dir yt-dlp \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY processor/server.mjs ./processor/server.mjs
COPY scripts/media-processor.mjs ./scripts/media-processor.mjs
COPY scripts/url-media-processor.mjs ./scripts/url-media-processor.mjs
COPY scripts/transcription-processor.mjs ./scripts/transcription-processor.mjs
COPY scripts/faster-whisper-runner.py ./scripts/faster-whisper-runner.py

RUN node --check processor/server.mjs \
  && node --check scripts/media-processor.mjs \
  && node --check scripts/url-media-processor.mjs \
  && ffmpeg -version >/dev/null \
  && yt-dlp --version

EXPOSE 10000
CMD ["node", "processor/server.mjs"]
