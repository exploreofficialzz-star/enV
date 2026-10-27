# Pinned Audiomack extractor

This `audiomack.py` comes from the **Unlicense**-licensed `yt-dlp` fork `0xvd/yt-dlp-exp` at commit `f1ba0a4de633b545ce688338d9527ad7ef1c7659`, proposed upstream as https://github.com/yt-dlp/yt-dlp/pull/17258.

The unmerged extractor is isolated in its own Python virtual environment, using `yt-dlp==2026.10.21` (validated against the user-owned track `https://audiomack.com/chas-d/song/hallelujah`). The rest of the media providers retain the separately installed primary `yt-dlp` build.

It is **not an official Audiomack API or a guaranteed permanent contract**. The extractor uses Audiomack's current public web-player retrieval mechanism and may break if the public site changes. This requires ongoing real-file acceptance testing and should not be used to circumvent authentication, DRM, or user permission requirements. Source attribution and original licensing are retained. Do not log signed media URLs or include user cookies in tests.
