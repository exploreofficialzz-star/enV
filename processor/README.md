# enV Render media processor

This service is the heavy-processing companion for the Vercel enV deployment. Vercel remains responsible for the website, gateway routes, Blob upload authorization, and result storage. Render runs FFmpeg and yt-dlp inside this Docker image.

## Deploy on Render Free

1. Open Render and choose **New → Blueprint**.
2. Select the enV GitHub repository and the `render.yaml` file.
3. Keep the service on the **Free** plan.
4. Render builds `processor/Dockerfile` and gives the service an HTTPS URL such as `https://env-media-processor.onrender.com`.
5. Copy the generated `PROCESSOR_SHARED_SECRET` from the Render service environment settings. Do not commit it or send it in chat.

The service intentionally uses Vercel Blob for durable inputs and outputs. Its local filesystem is temporary and is only used while FFmpeg or yt-dlp runs.

## Connect Vercel

Set these Production and Preview variables in the existing Vercel project:

```text
MEDIA_PROCESSOR_URL=https://env-media-processor.onrender.com/media
URL_MEDIA_PROCESSOR_URL=https://env-media-processor.onrender.com
PROCESSOR_SHARED_SECRET=<the same secret as Render>
```

The Vercel gateway sends `X-Processor-Key` to Render. The current gateway route also needs to pass that secret server-side; it must never be a `VITE_` variable.

`TRANSCRIBE_URL` is intentionally not set in the first deployment. Whisper models are large and Render Free has only 512MB RAM. Transcription can be enabled later with a separately sized service and model configuration.

## Routes

- `GET /health`
- `POST /media`
- `POST /info`
- `POST /download`

Media input is limited to 100MB combined. Render Free can sleep after inactivity, so the first request after sleeping may take about a minute. Results are returned through the Vercel Blob-backed gateway.
