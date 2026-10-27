import argparse
import os


def main():
    parser = argparse.ArgumentParser(description="enV local song analyzer")
    parser.add_argument("command", choices=["serve", "prepare", "prepare-stems", "train"])
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.command == "prepare":
        from huggingface_hub import snapshot_download
        from .models import CLAP_MODEL, CLAP_REVISION
        snapshot_download(CLAP_MODEL, revision=CLAP_REVISION, ignore_patterns=["*.h5", "*.msgpack"])
        print(f"Prepared {CLAP_MODEL}@{CLAP_REVISION}")
    elif args.command == "prepare-stems":
        import hashlib
        import urllib.request
        from pathlib import Path
        from .models import DEMUCS_SHA256
        target = os.getenv("SONG_DEMUCS_REPO")
        if not target:
            parser.error("Set SONG_DEMUCS_REPO to an empty local model directory first")
        repo = Path(target)
        repo.mkdir(parents=True, exist_ok=True)
        path = repo / "955717e8-8726e21a.th"
        with urllib.request.urlopen("https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th", timeout=120) as response, path.with_suffix(".part").open("wb") as output:
            import shutil
            shutil.copyfileobj(response, output)
        with path.with_suffix(".part").open("rb") as checkpoint:
            if hashlib.file_digest(checkpoint, "sha256").hexdigest() != DEMUCS_SHA256:
                path.with_suffix(".part").unlink()
                raise ValueError("Downloaded Demucs checkpoint failed its checksum")
        path.with_suffix(".part").replace(path)
        (repo / "htdemucs.yaml").write_text("models: ['955717e8']\n")
        print("Prepared pinned htdemucs checkpoint. Analysis will only use this local repository.")
    elif args.command == "train":
        import json
        from pathlib import Path
        from .learning import LearningStore
        root = Path(os.getenv("SONG_DATA_DIR", str(Path.home() / ".local/share/env-song-analyzer")))
        print(json.dumps(LearningStore(root / "reviews.sqlite3").train(), indent=2))
    else:
        import uvicorn
        from .server import create_app
        uvicorn.run(create_app(), host="127.0.0.1", port=args.port, workers=1, log_level="warning")


if __name__ == "__main__":
    main()
