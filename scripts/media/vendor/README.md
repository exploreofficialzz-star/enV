# Pinned Audiomack extractor adapter

This file is a vendored, isolated Audiomack extractor revision from [0xvd/yt-dlp-exp at f1ba0a4de633b545ce688338d9527ad7ef1c7659](https://github.com/0xvd/yt-dlp-exp/blob/f1ba0a4de633b545ce688338d9527ad7ef1c7659/yt_dlp/extractor/audiomack.py), upstream yt-dlp PR [#17258](https://github.com/yt-dlp/yt-dlp/pull/17258).

It replaces ONLY yt-dlp's built-in Audiomack extractor in the shared Render processor image. All other providers continue through the pinned, tested official yt-dlp base. The upstream author has stated in the PR that their contribution is available under Unlicense/public-domain terms. The patch is vendored, not pulled from an unreviewed branch at runtime. Re-review upstream updates before changing this file.

This change is tested against the creator-provided public example `https://audiomack.com/chas-d/song/hallelujah?share-user-id=118614535`: the isolated upstream extractor downloaded an audio sample and FFprobe reported 175.2 seconds. Production must pass a separate Render-backed end-to-end media acceptance test before being marked download-ready. This does not authorize extracting protected, private or third-party copyrighted material.
