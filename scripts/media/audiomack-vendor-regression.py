#!/usr/bin/env python3
"""Offline tests for the independently-vendored Audiomack yt-dlp extractor.

Requires yt-dlp 2026.10.21, with scripts/media/vendor/audiomack.py copied
into its extractor package. No provider calls, credentials or audio downloads.
"""
import unittest
from unittest.mock import patch

from yt_dlp.extractor.audiomack import AudiomackIE, AudiomackAlbumIE
from yt_dlp.utils import ExtractorError

CREATOR_SONG = "https://audiomack.com/chas-d/song/hallelujah?share-user-id=118614535"


class AudiomackVendorTests(unittest.TestCase):
    def test_missing_nextjs_hydration_falls_back_to_public_metadata_then_audio(self):
        ie = AudiomackIE()
        calls = []

        def get_json(url, video_id, **kwargs):
            calls.append(url)
            if url == "https://api.audiomack.com/v1/music/song/chas-d/hallelujah":
                return {"results": {"id": 4321, "title": "Hallelujah", "artist": "Chas D"}}
            if url == "https://api.audiomack.com/v1/music/play/4321":
                return {"signedUrl": "https://media.example.com/hallelujah.mp3"}
            self.fail("Unexpected public Audiomack endpoint")

        with patch.object(ie, "_download_webpage", return_value="<html><meta property='og:title' content='Hallelujah'></html>"), \
             patch.object(ie, "_get_next_data", return_value={}), \
             patch.object(ie, "_download_json", side_effect=get_json):
            result = ie._real_extract(CREATOR_SONG)
        self.assertEqual(result["id"], "4321")
        self.assertEqual(result["url"], "https://media.example.com/hallelujah.mp3")
        self.assertEqual(result["title"], "Hallelujah")
        self.assertEqual(calls, [
            "https://api.audiomack.com/v1/music/song/chas-d/hallelujah",
            "https://api.audiomack.com/v1/music/play/4321",
        ])

    def test_song_with_id_skips_unnecessary_public_lookup(self):
        ie = AudiomackIE()
        calls = []

        def get_json(url, video_id, **kwargs):
            calls.append(url)
            return {"signedUrl": "https://media.example.com/ok.m4a"}

        with patch.object(ie, "_download_webpage", return_value="html"), \
             patch.object(ie, "_get_next_data", return_value={"id": 5678, "title": "Hallelujah", "artist": "Chas D"}), \
             patch.object(ie, "_download_json", side_effect=get_json):
            result = ie._real_extract(CREATOR_SONG)
        self.assertEqual(result["id"], "5678")
        self.assertEqual(calls, ["https://api.audiomack.com/v1/music/play/5678"])

    def test_missing_metadata_id_never_calls_play_none(self):
        ie = AudiomackIE()
        calls = []

        def get_json(url, video_id, **kwargs):
            calls.append(url)
            return {"results": {"title": "No ID"}}

        with patch.object(ie, "_download_webpage", return_value="html"), \
             patch.object(ie, "_get_next_data", return_value={}), \
             patch.object(ie, "_download_json", side_effect=get_json):
            with self.assertRaisesRegex(ExtractorError, "did not include a song ID"):
                ie._real_extract(CREATOR_SONG)
        self.assertEqual(len(calls), 1)
        self.assertNotIn("/None", calls[0])

    def test_album_app_router_falls_back_to_documented_public_track_list(self):
        ie = AudiomackAlbumIE()
        url = "https://audiomack.com/evadolee/album/promise-land"
        expected_api = "https://api.audiomack.com/v1/music/album/evadolee/promise-land"
        requests = []

        def metadata(endpoint, video_id, **kwargs):
            requests.append(endpoint)
            self.assertEqual(endpoint, expected_api)
            return {"results": {"id": 123, "title": "Promise Land", "tracks": [
                {"id": 1, "title": "MARCH AM", "url_slug": "march-am", "uploader": {"url_slug": "evadolee"}},
                {"id": 2, "title": "AZAMAN", "url_slug": "azaman", "uploader": {"url_slug": "evadolee"}},
            ]}}

        with patch.object(ie, "_download_webpage", return_value="App Router HTML"), \
             patch.object(ie, "_get_next_data", return_value={}), \
             patch.object(ie, "_download_json", side_effect=metadata):
            playlist = ie._real_extract(url)
        tracks = list(playlist["entries"])
        self.assertEqual(len(tracks), 2)
        self.assertEqual([item["url"] for item in tracks], [
            "https://audiomack.com/evadolee/song/march-am",
            "https://audiomack.com/evadolee/song/azaman",
        ])
        self.assertEqual(requests, [expected_api])

    def test_playlist_app_router_uses_public_playlist_endpoint(self):
        ie = AudiomackAlbumIE()
        expected_api = "https://api.audiomack.com/v1/playlist/chas-d/my-music"

        def metadata(endpoint, video_id, **kwargs):
            self.assertEqual(endpoint, expected_api)
            return {"results": {"id": 8, "title": "My Music", "tracks": [
                {"id": 7, "title": "Hallelujah", "url_slug": "hallelujah", "uploader": {"url_slug": "chas-d"}},
            ]}}

        with patch.object(ie, "_download_webpage", return_value="App Router HTML"), \
             patch.object(ie, "_get_next_data", return_value={}), \
             patch.object(ie, "_download_json", side_effect=metadata):
            playlist = ie._real_extract("https://audiomack.com/chas-d/playlist/my-music")
        self.assertEqual(list(playlist["entries"])[0]["url"], "https://audiomack.com/chas-d/song/hallelujah")

    def test_collection_does_not_invent_song_slugs_when_metadata_is_empty(self):
        ie = AudiomackAlbumIE()
        with patch.object(ie, "_download_webpage", return_value="html"), \
             patch.object(ie, "_get_next_data", return_value={}), \
             patch.object(ie, "_download_json", return_value={"results": {"title": "Empty", "tracks": []}}):
            playlist = ie._real_extract("https://audiomack.com/evadolee/album/empty")
        self.assertEqual(list(playlist["entries"]), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
