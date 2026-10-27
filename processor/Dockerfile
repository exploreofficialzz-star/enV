FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    npm_config_update_notifier=false \
    npm_config_fund=false \
    npm_config_audit=false \
    PYTHONDONTWRITEBYTECODE=1 \
    AUDIOMACK_YTDLP_BIN=/opt/env-audiomack/bin/yt-dlp

# Pin the tested upstream core; vendor the independently verified Audiomack
# extractor fix rather than relying on an obsolete built-in API resolver.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg aria2 python3 python3-pip python3-venv ca-certificates \
  && python3 -m pip install --break-system-packages --no-cache-dir "yt-dlp[default,curl-cffi]==2026.10.21" \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Keep Audiomack's public-song extractor in an independent, pinned Python
# environment so provider-specific changes cannot downgrade other sites.
COPY scripts/media/vendor/audiomack.py /opt/env-audiomack-extractor.py
RUN python3 -m venv /opt/env-audiomack \
  && /opt/env-audiomack/bin/python -m pip install --no-cache-dir "yt-dlp==2026.10.21" \
  && /opt/env-audiomack/bin/python -c 'import shutil, yt_dlp.extractor.audiomack as extractor; shutil.copyfile("/opt/env-audiomack-extractor.py", extractor.__file__)' \
  && /opt/env-audiomack/bin/python -m py_compile /opt/env-audiomack/lib/python3.11/site-packages/yt_dlp/extractor/audiomack.py \
  && /opt/env-audiomack/bin/yt-dlp --version

WORKDIR /app
COPY scripts/media/vendor/audiomack.py ./scripts/media/vendor/audiomack.py
RUN python3 -c 'import shutil; import yt_dlp.extractor.audiomack as module; shutil.copyfile("scripts/media/vendor/audiomack.py", module.__file__)' \
  && python3 -c 'import yt_dlp.extractor.audiomack as module; assert hasattr(module, "AudiomackIE") and hasattr(module, "AudiomackAlbumIE")' \
  && python3 -m py_compile scripts/media/vendor/audiomack.py
COPY backend/request-body.mjs ./backend/request-body.mjs
COPY processor/server.mjs ./processor/server.mjs
COPY processor/url-media-route.mjs ./processor/url-media-route.mjs
COPY scripts/media-processor.mjs ./scripts/media-processor.mjs
COPY scripts/url-media-processor.mjs ./scripts/url-media-processor.mjs
COPY scripts/media/processor-admission.mjs ./scripts/media/processor-admission.mjs
COPY scripts/media/provider-registry.mjs ./scripts/media/provider-registry.mjs
COPY scripts/media/audiomack-page-parser.mjs ./scripts/media/audiomack-page-parser.mjs
COPY scripts/media/audiomack-song-page.mjs ./scripts/media/audiomack-song-page.mjs
COPY scripts/media/provider-errors.mjs ./scripts/media/provider-errors.mjs
COPY scripts/media/extraction-strategy.mjs ./scripts/media/extraction-strategy.mjs
COPY scripts/media/public-download-links.mjs ./scripts/media/public-download-links.mjs
COPY scripts/media/archive-org.mjs ./scripts/media/archive-org.mjs
COPY scripts/media/transfer-alternatives.mjs ./scripts/media/transfer-alternatives.mjs
COPY scripts/media/url-security.mjs ./scripts/media/url-security.mjs
COPY scripts/media/yt-dlp-output.mjs ./scripts/media/yt-dlp-output.mjs
COPY scripts/transcription-processor.mjs ./scripts/transcription-processor.mjs
COPY scripts/faster-whisper-runner.py ./scripts/faster-whisper-runner.py

RUN node --check processor/server.mjs \
  && node --check processor/url-media-route.mjs \
  && node --check scripts/media-processor.mjs \
  && node --check scripts/url-media-processor.mjs \
  && node --check scripts/media/audiomack-page-parser.mjs \
  && node --check scripts/media/audiomack-song-page.mjs \
  && node --check scripts/media/provider-errors.mjs \
  && node --check scripts/media/extraction-strategy.mjs \
  && node --check scripts/media/public-download-links.mjs \
  && node --check scripts/media/archive-org.mjs \
  && node --check scripts/media/transfer-alternatives.mjs \
  && node --version \
  && ffmpeg -version >/dev/null \
  && yt-dlp --version \
  && aria2c --version >/dev/null

EXPOSE 10000
CMD ["node", "processor/server.mjs"]
