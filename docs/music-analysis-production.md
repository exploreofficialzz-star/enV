# Music Analyzer model-service contract

The Music Analyzer always computes its local signal measurements in the browser. Semantic labels are a separate model operation and are never invented when a model is absent.

## Deployment configuration

Configure these server-side environment variables on the enV web deployment:

- `MUSIC_ANALYSIS_ENDPOINT` — required HTTPS URL for a trusted audio-classification or music-understanding endpoint.
- `MUSIC_ANALYSIS_TOKEN` — optional bearer token, stored only on the server and never sent to the browser.

The configured endpoint receives a `POST` request whose body is the selected audio file as raw bytes. The `Content-Type` is the file's detected MIME type, falling back to `application/octet-stream`. The service must return JSON. enV limits model uploads to 25 MB and gives the endpoint up to 90 seconds to respond.

The endpoint can return a structured object such as:

```json
{
  "genre": "Afrobeats",
  "sub_style": "Afro-pop",
  "language": ["Pidgin", "Yoruba"],
  "mood": ["upbeat"],
  "instruments": ["drums", "bass"],
  "vocal_style": "melodic",
  "genre_candidates": [
    { "label": "Afrobeats", "score": 0.87 },
    { "label": "Pop", "score": 0.42 }
  ]
}
```

These values are an example of the response contract, not a claim that enV predicts them without a working model. An audio-classification endpoint that returns `[{"label":"Rock","score":0.8}]` is also accepted; enV will expose its ranked labels as genre candidates. Fields the model does not return remain unknown.

## Privacy and interpretation

Local analysis does not upload the audio. The user must explicitly enable model upload in the interface before the model endpoint is called. Model uploads go only to the configured endpoint; operators are responsible for the endpoint's access controls, retention policy, model license and processing location.

Tempo and key are best-effort DSP estimates. The loudness field is an RMS-based proxy, not a standards-compliant integrated LUFS measurement. The signal features do not independently identify a genre, sub-style, language, mood or instrument. Language detection on singing or mixed vocals should be treated as uncertain unless the configured model was evaluated for that use case and the target languages, including Pidgin and Yoruba.
