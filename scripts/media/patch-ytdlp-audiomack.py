#!/usr/bin/env python3
"""Apply a narrow compatibility patch to yt-dlp's obsolete Audiomack API host.

The upstream extractor currently calls www.audiomack.com/api/music/url/... .
Audiomack's API host migration moved that resolver to api.audiomack.com. This
patch changes only the base URL used by the existing extractor; it does not add
authentication, unwrap DRM, or bypass private/permission-gated content.
"""
from pathlib import Path

LEGACY_ENDPOINT = "http://www.audiomack.com/api/music/url/"
CURRENT_ENDPOINT = "https://api.audiomack.com/music/url/"


def patch_extractor_source(source: str) -> tuple[str, bool]:
    legacy_count = source.count(LEGACY_ENDPOINT)
    current_count = source.count(CURRENT_ENDPOINT)
    if legacy_count == 0 and current_count >= 2:
        return source, False
    if legacy_count != 2:
        raise RuntimeError(
            "Unexpected yt-dlp Audiomack extractor layout; refusing to patch "
            f"automatically (legacy endpoint count={legacy_count}, "
            f"current endpoint count={current_count}). Inspect the upstream "
            "extractor before changing this patch."
        )
    patched = source.replace(LEGACY_ENDPOINT, CURRENT_ENDPOINT)
    if patched.count(CURRENT_ENDPOINT) < 2 or LEGACY_ENDPOINT in patched:
        raise RuntimeError("Audiomack API host patch verification failed.")
    return patched, True


def main() -> None:
    import yt_dlp

    extractor = Path(yt_dlp.__file__).resolve().parent / "extractor" / "audiomack.py"
    if not extractor.is_file():
        raise SystemExit(f"yt-dlp Audiomack extractor not found: {extractor}")
    original = extractor.read_text(encoding="utf-8")
    patched, changed = patch_extractor_source(original)
    if changed:
        extractor.write_text(patched, encoding="utf-8")
        print("Applied Audiomack API-host compatibility patch to yt-dlp.")
    else:
        print("yt-dlp Audiomack extractor already uses the current API host.")


if __name__ == "__main__":
    main()
