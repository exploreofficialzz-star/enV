from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


TAXONOMY = {
    "genre": ["Afrobeats", "Afro-pop", "Amapiano", "Highlife", "Gospel", "Hip-hop", "R&B", "Pop", "Rock", "Jazz", "Classical", "Reggae", "Dancehall", "House", "Techno", "Country", "Folk", "Ambient", "Latin"],
    "mood": ["joyful", "melancholic", "calm", "energetic", "romantic", "tense", "triumphant", "dreamy"],
    "instruments": ["acoustic guitar", "electric guitar", "piano", "synthesizer", "bass guitar", "synth bass", "drum kit", "electronic drums", "shakers", "hand percussion", "strings", "brass", "flute", "organ", "log drum"],
    "vocals": ["singing", "rapping", "spoken word", "choir", "backing vocals", "instrumental"],
}
ANNOTATION_FIELDS = set(TAXONOMY) | {
    "sub_style", "style_influences", "language", "energy", "source_role", "vocal_delivery",
    "vocal_register", "vocal_harmony", "performance_technique", "themes", "listening_scene",
    "production_traits", "arrangement",
}
LEARNABLE_FIELDS = set(TAXONOMY)  # language/themes need linguistic evidence, not an audio embedding


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Candidate(StrictModel):
    label: str = Field(min_length=1, max_length=100)
    score: float = Field(ge=-1, le=1)
    source: Literal["clap_similarity", "reviewed_linear_head"]


class Clip(StrictModel):
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(gt=0)
    label: str = Field(max_length=100)
    label_source: Literal["signal_change", "fixed_window"]
    tags: dict[str, list[Candidate]] = Field(default_factory=dict)


class TranscriptSegment(StrictModel):
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(ge=0)
    text: str = Field(max_length=4000)


class Feedback(StrictModel):
    job_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    annotations: dict[str, list[str]]
    reviewer: str = Field(min_length=1, max_length=100)
    reviewed: Literal[True]
    training_consent: Literal[True]


class TagExport(StrictModel):
    annotations: dict[str, list[str]]
    reviewed: Literal[True]


def clean_annotations(value: dict) -> dict[str, list[str]]:
    if not value or set(value) - ANNOTATION_FIELDS:
        raise ValueError("Unknown or empty annotation fields")
    result = {}
    for field, labels in value.items():
        if not isinstance(labels, list) or len(labels) > 30:
            raise ValueError("Each annotation field needs at most 30 labels")
        if any(not isinstance(label, str) or not 0 < len(label.strip()) <= 100 for label in labels):
            raise ValueError("Labels must be non-empty text, at most 100 characters")
        result[field] = list(dict.fromkeys(label.strip() for label in labels))
    return result
