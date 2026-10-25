# Hosting MOSS-Music for enV on Modal

This deploys the **MOSS-Music-8B-Instruct** music-tagging model as a private, authenticated HTTPS service. Lyrics transcription and lyric interpretation remain a separate feature.

## Architecture

1. The user's browser/native client runs enV's existing audio.music.analyze AI task.
2. The existing enV AI router checks task consent, session/IP rate limits, allowed model cost class, provider availability, and output schema.
3. If enabled, the MOSS-Music adapter sends the prepared audio excerpts and structured tagging instructions to MOSS_MUSIC_ENDPOINT. The shared token is held only in server environment variables.
4. Modal authenticates the request, writes a temporary audio file, calls SGLang on loopback, returns model text/usage metadata, and deletes the temporary file.
5. enV validates the returned JSON against its task schema. Local DSP results remain separate and work when remote AI fails.

**Important:** the current app-side /api/ai/run handler is synchronous. A serverless platform's request-duration ceiling applies regardless of the enV task timeout. Test a cold Modal start through the deployed app before enabling this for users. If cold starts exceed the app host's limit, the durable fix is an asynchronous job/status flow or moving the AI router to a host with a suitable request duration—not just increasing client timeouts.

## Requirements

- A Modal account and access to its billing dashboard.
- Python 3.12 on the deployment computer, plus the Modal CLI.
- Approximately 18.1 GB of model weights; initial image build/download can take time and use compute/network resources.
- A server-side environment for the enV AI runtime that serves /api/ai/run. Never set credentials as public VITE_* variables.

## 1. Set up Modal

~~~bash
python -m pip install --upgrade modal
modal setup
~~~

Complete the browser sign-in prompt. Check the active workspace and billing/credits in the Modal dashboard before deploying.

## 2. Create the shared endpoint token

Generate a long random secret (at least 32 random bytes). In Modal Dashboard → **Secrets**, create a Secret named **env-moss-music-api** with one key:

- Key: MOSS_MUSIC_TOKEN
- Value: your random secret

Use the exact same value in the enV backend environment in Step 4. Do not paste it into GitHub, source code, an issue, or a chat. Creating the Secret in the dashboard avoids putting the raw value in shell history.

## 3. Download weights and deploy

From a checkout of the enV repository at the branch/commit that includes infra/modal-moss-music/app.py, run:

~~~bash
modal run infra/modal-moss-music/app.py::download_weights
modal deploy infra/modal-moss-music/app.py
~~~

The first command downloads the pinned OpenMOSS model revision into a persistent Modal Volume named **env-moss-music-models**. This is a one-time download unless the pinned revision or volume is changed. The second builds/deploys the authenticated FastAPI wrapper and SGLang GPU runtime.

The function requests an A100 40 GB GPU, runs a single container at a time, and scales down after 60 seconds without traffic. This reduces idle-GPU exposure, but subsequent calls may cold-start. Do not increase the scaledown window or minimum number of containers without checking the extra cost.

After deployment, copy the HTTPS URL printed for the **serve_api** web function. The health endpoint is **/healthz** and the tagging endpoint is **/analyze**. Use Modal's actual generated URL; do not guess the workspace-specific hostname.

## 4. Configure the enV AI backend

On the host that runs the app-side /api/ai/run handler, add these server-only environment variables:

| Variable | Value |
| --- | --- |
| MOSS_MUSIC_ENDPOINT | Full HTTPS URL copied from Modal, including /analyze |
| MOSS_MUSIC_TOKEN | The same random secret configured in the Modal Secret |
| AI_PROVIDER_ORDER | moss_music,groq,openrouter,gemini |
| AI_MAX_COST_CLASS | STANDARD |
| AI_ENABLED | true |

MOSS-Music is registered as **STANDARD** cost because GPU time is metered. The existing default AI_MAX_COST_CLASS=LOW excludes it; configuring only the endpoint and token will not enable routing. Leave existing provider credentials alone unless you intend to change fallback behaviour. Gemini remains subject to its separate privacy/tier rules.

Use the host's secure environment-variable UI. Redeploy/restart the app after changing variables. The endpoint and token are never browser configuration; never name either one VITE_*.

## 5. Test before enabling users

1. Open the Modal function URL plus /healthz. Expect HTTP 200 and a small JSON response. This verifies the deployed model service started; it does not prove tagging quality.
2. Run the enV Song Metadata Analyzer with a short, non-sensitive sample after explicitly opting in to remote analysis.
3. Confirm genre/sub-style, mood, energy, vocals, instruments, descriptions, and warnings are returned as tags.
4. Confirm lyric_evidence is always empty and no transcript/quotation appears in descriptions or tags. Lyrics belong to a separate feature.
5. Test both a warm call and a call after the service scales down. Check latency against the actual app-host request-duration limit.
6. Test invalid token (401), unsupported MIME type (415), invalid Base64 (400), oversize audio (413), provider timeout/error, malformed JSON, user cancellation, denied consent, and AI unavailable. Local Quick Scan and local DSP must still succeed when remote AI fails.
7. Review Modal container logs, function metrics, billing, and usage. The wrapper does not intentionally log audio/prompts; confirm deployment logs do not contain them. Audio excerpts are temporary; the persistent Volume is for model weights.

Benchmark on representative music you are permitted to process, using a manually labelled validation set spanning genres, instrumental songs, dense mixes, and vocal styles. Model-card results are self-reported; enV needs its own evaluation.

## Cost and operational caveats

- Modal Starter currently advertises **$30/month of compute credits**, not unlimited free hosting. The listed A100 40 GB rate is about **$2.0988 per GPU hour**, before CPU, memory, network, and any use beyond eligible credits. Check the current pricing and billing rules in your account before deploying.
- max_containers=1 and a 60-second scaledown window limit concurrency and warm retention, but calls can queue and cold-start.
- AI_DAILY_BUDGET_USD is an enV-side per-warm-instance estimate/backstop, not a hard cap on Modal account charges. Watch Modal billing and use available alerts/limits.
- Startup, weight-loading, and inference latency are not guaranteed. Do not present this as reliably available until cold and warm requests succeed from the deployed app.
- If Vercel/serverless request-duration limits interrupt cold calls, move the AI router to a runtime with suitable request limits or implement a background job + status polling design before production rollout.

## Upstream references

- [MOSS-Music repository, capabilities and license](https://github.com/OpenMOSS/MOSS-Music)
- [Official SGLang serving guide](https://github.com/OpenMOSS/MOSS-Music/blob/main/moss_music_usage_guide.md)
- [Modal pricing](https://modal.com/pricing)
- [Modal web functions](https://modal.com/docs/guide/webhooks)
- [Modal Volumes](https://modal.com/docs/guide/volumes)
- [Modal Secrets](https://modal.com/docs/guide/secrets)
