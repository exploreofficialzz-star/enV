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
                "nested": {k: sorted(value[k])[:20] for k in ["data", "result", "results", "music", "song"] if isinstance(value.get(k), dict)},
                "result_kind": type(value.get("results")).__name__,
                "result_count": len(value["results"]) if isinstance(value.get("results"), list) else None,
                "audio_field_found": any(isinstance(value.get(k), str) and value[k].startswith("https://") for k in ["signedUrl", "url", "audio_url", "stream_url"])}
    return {"kind": type(value).__name__, "audio_field_found": isinstance(value, str) and value.startswith("https://")}

with YoutubeDL({"quiet": True, "no_warnings": True, "socket_timeout": 20}) as dl:
    extractor = AudiomackIE(dl)
    webpage = extractor._download_webpage(SONG, "hallelujah")
    info = extractor._get_next_data(webpage)
    song_id = traverse_obj(info, "id", "song_id")
    print("HYDRATION:", json.dumps({"field_names": sorted(info)[:40], "id_present": bool(song_id), "id_type": type(song_id).__name__, "title_present": bool(info.get("title")),
         "page_length": len(webpage), "has_next_data": "__NEXT_DATA__" in webpage,
         "has_og_title": 'og:title' in webpage}))
    # The public API explicitly documents GET /v1/music/song/<artist>/<song>.
    # Use the same signed public-web request rather than inventing a song ID.
    meta_url = "https://api.audiomack.com/v1/music/song/chas-d/hallelujah"
    try:
        signature = extractor.sign_params({}, meta_url)
        req = urllib.request.Request(meta_url + "?" + urllib.parse.urlencode(signature), headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as resp:
            parsed = json.loads(resp.read(65536))
            print("PUBLIC SONG METADATA:", json.dumps({"status": resp.status, **summarize(parsed)}))
            song_id = song_id or traverse_obj(parsed, "id", "song_id", ("results", "id"), ("results", "song_id"), ("results", 0, "id"), ("data", "id"), ("result", "id"), ("music", "id"))
    except urllib.error.HTTPError as err:
        print("PUBLIC SONG METADATA:", json.dumps({"status": err.code}))
    except Exception as err:
        print("PUBLIC SONG METADATA:", json.dumps({"failure_type": type(err).__name__}))
    if not song_id:
        print("No song ID available from either public metadata route.")
        raise SystemExit(1)

    album_api = "https://api.audiomack.com/v1/music/album/evadolee/promise-land"
    try:
        signature = extractor.sign_params({}, album_api)
        request = urllib.request.Request(album_api + "?" + urllib.parse.urlencode(signature), headers={"User-Agent": UA})
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read(128 * 1024))
            collection = payload.get("results") if isinstance(payload, dict) else None
            tracks = collection.get("tracks") if isinstance(collection, dict) else None
            print("PUBLIC ALBUM METADATA:", json.dumps({"status": response.status, **summarize(payload),
                "tracks_type": type(tracks).__name__, "track_count": len(tracks) if isinstance(tracks, list) else None,
                "first_track_fields": sorted(tracks[0])[:25] if isinstance(tracks, list) and tracks and isinstance(tracks[0], dict) else []}))
    except urllib.error.HTTPError as error:
        print("PUBLIC ALBUM METADATA:", json.dumps({"status": error.code}))
    except Exception as error:
        print("PUBLIC ALBUM METADATA:", json.dumps({"failure_type": type(error).__name__}))

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
