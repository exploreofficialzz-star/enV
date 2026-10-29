#!/usr/bin/env python3
"""Offline tests for the independently-vendored Audiomack yt-dlp extractor.

Requires yt-dlp 2026.10.21, with scripts/media/vendor/audiomack.py copied
into its extractor package. No provider calls, credentials or audio downloads.
"""
import unittest
from unittest.mock import patch

from yt_dlp.extractor.audiomack import AudiomackIE
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
