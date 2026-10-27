import hashlib

import numpy as np
import pytest

from song_analyzer.learning import LearningStore, holdout


def test_reviews_are_deduplicated_and_encoder_checked(tmp_path):
    store = LearningStore(tmp_path / "data.sqlite3")
    key = "a" * 64
    store.save(key, "encoder", [1, 0], {"genre": ["Rock"]}, "QA")
    store.save(key, "encoder", [1, 0], {"genre": ["Pop"]}, "QA")
    assert store.status()["reviewed_tracks"] == 1
    assert store.predict([1, 0], "other-encoder") == {}
    with pytest.raises(ValueError, match="10 distinct"):
        store.train()
    with pytest.raises(ValueError):
        store.save(key, "encoder", [float("nan")], {"genre": ["Rock"]}, "QA")
    with pytest.raises(ValueError):
        store.save(key, "encoder", [1], {"made_up": ["Rock"]}, "QA")


def test_training_has_a_fixed_unseen_holdout_and_learns(tmp_path):
    store = LearningStore(tmp_path / "data.sqlite3")
    for i in range(60):
        key = hashlib.sha256(str(i).encode()).hexdigest()
        # Test-only separable artificial embeddings; not a claim about music accuracy.
        vector = [1, 0, 0.1] if i % 2 else [0, 1, 0.1]
        store.save(key, "encoder", vector, {"genre": ["Rock"] if i % 2 else ["Pop"], "mood": []}, "QA")
    result = store.train()
    evaluation = result["evaluation"]
    assert evaluation["test_tracks"] == sum(holdout(hashlib.sha256(str(i).encode()).hexdigest()) for i in range(60))
    assert evaluation["training_tracks"] + evaluation["test_tracks"] == 60
    assert evaluation["fields"]["genre"]["macro_f1"] == 1
    assert store.predict([1, 0, 0.1], "encoder")["genre"][0]["label"] == "Rock"
    assert store.predict([1, 0, 0.1], "changed-encoder") == {}
    version = result["model_version"]
    assert store.train()["model_version"] == version


def test_unreviewed_missing_field_is_not_a_negative(tmp_path):
    store = LearningStore(tmp_path / "data.sqlite3")
    for i in range(60):
        key = hashlib.sha256(str(i).encode()).hexdigest()
        store.save(key, "encoder", [1, i / 60], {"genre": ["Rock"]} if i % 2 else {"mood": []}, "QA")
    with pytest.raises(ValueError, match="2 positive and 2 negative"):
        store.train()
