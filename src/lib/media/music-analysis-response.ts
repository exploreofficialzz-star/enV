export type MusicGenreCandidate = { label: string; score: number | null };

export type MusicModelClassification = {
  genre: string | null;
  sub_style: string | null;
  language: string[];
  mood: string[];
  instruments: string[];
  vocal_style: string | null;
  genre_candidates: MusicGenreCandidate[];
  status: "model_completed";
  note: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : null;
}

function stringList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return items
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim().slice(0, 100))
    .slice(0, 30);
}

/**
 * Normalizes a trusted deployment's model output without inventing absent labels.
 * Raw classification arrays (common from audio classifiers) become ranked candidates;
 * structured semantic models can provide explicit genre, language, mood and instruments.
 */
export function normalizeMusicModelClassification(value: unknown): MusicModelClassification {
  const root = isRecord(value) ? value : {};
  const nested = isRecord(root.classification)
    ? root.classification
    : isRecord(root.result) ? root.result
      : isRecord(root.prediction) ? root.prediction
        : root;
  const list = Array.isArray(value) ? value
    : Array.isArray(root.predictions) ? root.predictions
      : Array.isArray(root.labels) ? root.labels
        : Array.isArray(root.results) ? root.results
          : Array.isArray(root.genre_candidates) ? root.genre_candidates
            : Array.isArray(nested.genre_candidates) ? nested.genre_candidates
              : [];
  const candidates: MusicGenreCandidate[] = list.slice(0, 12).flatMap((item) => {
    if (!isRecord(item)) return [];
    const label = textValue(item.label ?? item.genre ?? item.class ?? item.name);
    if (!label) return [];
    const scoreValue = item.score ?? item.confidence ?? item.probability;
    const score = typeof scoreValue === "number" && Number.isFinite(scoreValue)
      ? Math.min(1, Math.max(0, scoreValue))
      : null;
    return [{ label, score }];
  });
  return {
    genre: textValue(nested.genre) ?? candidates[0]?.label ?? null,
    sub_style: textValue(nested.sub_style ?? nested.subStyle),
    language: stringList(nested.language ?? nested.languages),
    mood: stringList(nested.mood ?? nested.moods),
    instruments: stringList(nested.instruments ?? nested.instrumentation),
    vocal_style: textValue(nested.vocal_style ?? nested.vocalStyle),
    genre_candidates: candidates,
    status: "model_completed",
    note: "Model predictions are estimates. Fields omitted by the configured model remain unknown; verify uncertain labels before relying on them.",
  };
}
