"""Reviewed audio embeddings train a small head; the base LLM is never self-trained.

Stable source-hash splits keep the evaluation tracks out of fitting, including
after re-review. JSON/SQLite storage avoids executable pickle model files.
"""
import hashlib
import json
import sqlite3
import time
from pathlib import Path

import numpy as np

from .contracts import LEARNABLE_FIELDS, clean_annotations


def holdout(source_hash: str) -> bool:
    return int(source_hash[:8], 16) % 5 == 0


class LearningStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS reviews (source_hash TEXT PRIMARY KEY, encoder TEXT NOT NULL, embedding TEXT NOT NULL, annotations TEXT NOT NULL, reviewer TEXT NOT NULL, updated REAL NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS model (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def save(self, source_hash: str, encoder: str, embedding: list[float], annotations: dict, reviewer: str):
        labels = clean_annotations(annotations)
        vector = np.asarray(embedding, dtype=float)
        if vector.ndim != 1 or not 1 <= len(vector) <= 4096 or not np.isfinite(vector).all() or np.linalg.norm(vector) < 1e-8:
            raise ValueError("A valid audio embedding is required to learn")
        if len(source_hash) != 64 or any(c not in "0123456789abcdef" for c in source_hash):
            raise ValueError("Invalid audio source hash")
        if not reviewer.strip():
            raise ValueError("A reviewer is required")
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO reviews VALUES (?, ?, ?, ?, ?, ?)",
                       (source_hash, encoder, json.dumps(embedding), json.dumps(labels), reviewer.strip(), time.time()))

    def status(self):
        with self.connect() as db:
            count = db.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
            row = db.execute("SELECT payload FROM model WHERE id=1").fetchone()
        model = json.loads(row[0]) if row else None
        return {"reviewed_tracks": count, "model_version": model["version"] if model else None,
                "evaluation": model["evaluation"] if model else None}

    def train(self):
        with self.connect() as db:
            rows = db.execute("SELECT source_hash, encoder, embedding, annotations FROM reviews ORDER BY source_hash").fetchall()
        if len(rows) < 10:
            raise ValueError("At least 10 distinct reviewed tracks are required")
        encoders = {row[1] for row in rows}
        if len(encoders) != 1:
            raise ValueError("Reviews use different encoder revisions; keep one encoder per dataset")
        x = np.array([json.loads(row[2]) for row in rows], dtype=float)
        x /= np.maximum(np.linalg.norm(x, axis=1, keepdims=True), 1e-9)
        x = np.c_[x, np.ones(len(x))]
        annotations = [json.loads(row[3]) for row in rows]
        test = np.array([holdout(row[0]) for row in rows])
        train = ~test
        if test.sum() < 2 or train.sum() < 6:
            raise ValueError("More reviewed tracks are needed for the fixed 20% holdout split (2 test / 6 training minimum)")
        models, evaluation = {}, {}
        # Missing fields are unlabelled, not negative. Explicit [] means reviewed absent.
        for field in sorted(LEARNABLE_FIELDS):
            known = np.array([field in annotation for annotation in annotations])
            fit = train & known
            assess = test & known
            labels = sorted({label for i, annotation in enumerate(annotations) if fit[i] for label in annotation[field]})
            labels = [label for label in labels if sum(label in annotations[i][field] for i in np.flatnonzero(fit)) >= 2
                      and sum(label not in annotations[i][field] for i in np.flatnonzero(fit)) >= 2]
            if not labels or assess.sum() < 2:
                continue
            y = np.array([[int(label in annotation.get(field, [])) for label in labels] for annotation in annotations])
            # Dual ridge regression is fast even when embeddings have many dimensions.
            weights = x[fit].T @ np.linalg.solve(x[fit] @ x[fit].T + np.eye(int(fit.sum())) * 0.2, y[fit])
            predictions = (x[assess] @ weights) >= 0.5
            truth = y[assess].astype(bool)
            per_label = {}
            for j, label in enumerate(labels):
                tp = int(np.sum(predictions[:, j] & truth[:, j]))
                fp = int(np.sum(predictions[:, j] & ~truth[:, j]))
                fn = int(np.sum(~predictions[:, j] & truth[:, j]))
                per_label[label] = {"precision": tp / max(1, tp + fp), "recall": tp / max(1, tp + fn),
                                    "f1": 2 * tp / max(1, 2 * tp + fp + fn), "support": int(truth[:, j].sum())}
            evaluation[field] = {"test_tracks": int(assess.sum()), "training_tracks": int(fit.sum()), "labels": per_label,
                                 "macro_f1": float(np.mean([metric["f1"] for metric in per_label.values()]))}
            models[field] = {"labels": labels, "weights": weights.tolist()}
        if not models:
            raise ValueError("Need at least one field with 2 positive and 2 negative training examples per label and 2 reviewed holdout tracks")
        version = hashlib.sha256(json.dumps(models, sort_keys=True).encode()).hexdigest()[:16]
        payload = {"version": version, "encoder": rows[0][1], "models": models, "trained_at": time.time(),
                   "evaluation": {"split": "source_sha256_mod_5; fixed holdout; never fitted on test audio", "threshold": 0.5,
                                  "training_tracks": int(train.sum()), "test_tracks": int(test.sum()), "fields": evaluation,
                                  "score_meaning": "uncalibrated ridge score; accuracy is corpus-specific"}}
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO model VALUES (1, ?)", (json.dumps(payload),))
        return self.status()

    def predict(self, embedding: list[float], encoder: str) -> dict:
        with self.connect() as db:
            row = db.execute("SELECT payload FROM model WHERE id=1").fetchone()
        if not row:
            return {}
        model = json.loads(row[0])
        if model["encoder"] != encoder:
            return {}
        vector = np.array(embedding)
        vector = np.r_[vector / max(np.linalg.norm(vector), 1e-9), 1]
        predictions = {}
        for field, head in model["models"].items():
            weights = np.array(head["weights"])
            if weights.shape[0] != len(vector):
                continue
            scores = np.clip(vector @ weights, -1, 1)
            predictions[field] = [{"label": label, "score": round(float(score), 5), "source": "reviewed_linear_head"}
                                  for label, score in zip(head["labels"], scores) if score >= 0.5]
        return predictions
