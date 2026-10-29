#!/usr/bin/env python3
"""Safe diagnostic for the creator-supplied Audiomack test song.

Prints only status, metadata ID existence and response *field names*, never
signed playback URLs, response bodies, OAuth query strings or audio bytes.
"""
import json
import urllib.parse
import urllib.request
import urllib.error
from yt_dlp import YoutubeDL
from yt_dlp.extractor.audiomack import AudiomackIE
from yt_dlp.utils.traversal import traverse_obj

SONG = "https://audiomack.com/chas-d/song/hallelujah"
UA = "enV authorized creator media acceptance probe"

def summarize(value):
    if isinstance(value, dict):
        return {"kind": "object", "fields": sorted(str(k) for k in value)[:40],
                "nested": {k: sorted(value[k])[:15] for k in ["data", "result", "music", "song"] if isinstance(value.get(k), dict)},
                "audio_field_found": any(isinstance(value.get(k), str) and value[k].startswith("https://") for k in ["signedUrl", "url", "audio_url", "stream_url"])}
    return {"kind": type(value).__name__, "audio_field_found": isinstance(value, str) and value.startswith("https://")}

with YoutubeDL({"quiet": True, "no_warnings": True, "socket_timeout": 20}) as dl:
    extractor = AudiomackIE(dl)
    webpage = extractor._download_webpage(SONG, "hallelujah")
    info = extractor._get_next_data(webpage)
    song_id = traverse_obj(info, "id", "song_id")
    print("HYDRATION:", json.dumps({"field_names": sorted(info)[:40], "id_present": bool(song_id), "id_type": type(song_id).__name__, "title_present": bool(info.get("title"))}))
    if not song_id:
        raise SystemExit("No stable song ID was found. Do not request a /None playback endpoint.")

    base = "https://api.audiomack.com"
    tests = [
        ("site-current", "GET", f"/v1/music/play/{song_id}", {"environment": "desktop-web", "hq": "true", "section": "/chas-d/song/hallelujah"}),
        ("published-play", "POST", f"/v1/music/{song_id}/play", {"session": "enV-authorized-test", "hq": "true"}),
        ("published-preview", "GET", f"/v1/music/preview/{song_id}", {}),
    ]
    for label, method, endpoint, params in tests:
        url = base + endpoint
        try:
            # A request to the public API using the same signing convention as
            # the already-vendored extractor, not an access-control bypass.
            if label == "site-current":
                query = extractor.sign_params(params, url)
                req = urllib.request.Request(url + "?" + urllib.parse.urlencode(query), headers={"User-Agent": UA}, method="GET")
            elif method == "POST":
                req = urllib.request.Request(url, data=urllib.parse.urlencode(params).encode(), headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA}, method="POST")
            else:
                req = urllib.request.Request(url, headers={"User-Agent": UA}, method="GET")
            with urllib.request.urlopen(req, timeout=20) as response:
                status, mime = response.status, response.headers.get("content-type", "").split(";")[0]
                if label == "published-preview":
                    print(label, json.dumps({"status": status, "content_type": mime, "downloadable_export_test": False}))
                    continue
                raw = response.read(64 * 1024)
                try:
                    payload = json.loads(raw)
                    summary = summarize(payload)
                except (ValueError, UnicodeDecodeError):
                    summary = {"kind": "non-json"}
                print(label, json.dumps({"status": status, "content_type": mime, **summary}))
        except urllib.error.HTTPError as error:
            print(label, json.dumps({"http_status": error.code}))
        except Exception as error:
            print(label, json.dumps({"failure_type": type(error).__name__}))
