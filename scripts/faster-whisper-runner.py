#!/usr/bin/env python3
"""enV optional local Faster-Whisper runner.

Requires: pip install faster-whisper
The model is loaded from FASTER_WHISPER_MODEL (default: small). Output is
written as <output_base>.txt and <output_base>.srt to match the Node processor.
"""
import argparse
import os
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=os.getenv("FASTER_WHISPER_MODEL", "small"))
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--language", default="auto")
    parser.add_argument("--translate", action="store_true")
    args = parser.parse_args()
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper is not installed. Run: pip install faster-whisper", file=sys.stderr)
        return 78

    device = os.getenv("FASTER_WHISPER_DEVICE", "cpu")
    compute_type = os.getenv("FASTER_WHISPER_COMPUTE_TYPE", "int8")
    model = WhisperModel(args.model, device=device, compute_type=compute_type)
    language = None if args.language in ("", "auto") else args.language
    segments, info = model.transcribe(args.input, language=language, task="translate" if args.translate else "transcribe", vad_filter=True)
    segments = list(segments)

    def stamp(seconds):
        ms = max(0, int(round(seconds * 1000)))
        h, rem = divmod(ms, 3600000)
        m, rem = divmod(rem, 60000)
        s, ms = divmod(rem, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    text = "\n".join(s.text.strip() for s in segments if s.text.strip()).strip() + "\n"
    srt = "\n\n".join(f"{i}\n{stamp(s.start)} --> {stamp(s.end)}\n{s.text.strip()}" for i, s in enumerate(segments, 1) if s.text.strip()) + "\n"
    with open(args.output + ".txt", "w", encoding="utf-8") as f:
        f.write(text)
    with open(args.output + ".srt", "w", encoding="utf-8") as f:
        f.write(srt)
    print(f"language={getattr(info, 'language', 'unknown')} segments={len(segments)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
