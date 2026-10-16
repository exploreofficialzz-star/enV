# enV Media Processing Scale Plan

**Status:** Architecture plan; queue/GPU workers described below are not yet deployed.

## Work placement

### Stay on device

- Camera/microphone capture, live monitor and live vocal effects (latency-sensitive, privacy-sensitive).
- Preview, cue selection, gain balance, short edits, metadata inspection and export composition when the device has resources.
- Short local analysis and local audio session handoff.

### Backend CPU processor (current)

- Bounded FFmpeg transformations such as format conversion, trim, resize, mute, basic audio conversions and merge.
- Current protection: `MEDIA_MAX_CONCURRENT_JOBS` creates a per-process admission limit, default 1 and clamped to 1–16. Requests that exceed active capacity receive a retryable `429` with `Retry-After`; `/health` reports the per-process active/max count.
- This protects one processor instance from unbounded parallel FFmpeg work. It does **not** share capacity across replicas and is not a persistent queue. Deploy with a conservative cap based on memory tests rather than increasing concurrency blindly.

### Future backend GPU job service (not implemented)

Model-based stem separation is a heavy inference job, not a simple FFmpeg transformation. The present `music-separator` path uses a browser Demucs ONNX model. Do not route it to an endpoint that only runs FFmpeg; that would not perform equivalent source separation.

Before remote model processing is enabled, build the following contract:

1. `POST /v1/media-jobs` accepts an authenticated, validated job descriptor and a short-lived upload object reference (never a public URL to arbitrary hosts).
2. The API checks account quota, file size/duration, supported MIME, entitlement, rate limits, idempotency key, requested model version and permitted stem count before enqueueing.
3. A shared durable queue (for example Redis/BullMQ, SQS, or a managed task queue) tracks `queued`, `running`, `succeeded`, `failed`, `cancelled`, progress, retryability, and a bounded error code. The API request should return a job ID rather than wait for GPU inference.
4. Autoscaled worker pools are separated by workload/model and hardware profile. A worker obtains a lease, checks cancellation, executes the model, writes outputs to private object storage, persists the result manifest, and acknowledges only after durable output/status commit.
5. The worker has hard CPU/GPU RAM limits, execution timeout, retry cap, output-size cap, dead-letter handling and duplicate-delivery protection. GPU model cache is versioned and warmed without pinning unbounded customer state in memory.
6. Input, intermediate and output objects have expiry TTLs; users can explicitly delete results. Per-tenant quotas, global back-pressure, signed short-lived downloads, audit logs and abuse controls are required.
7. Observability includes queue depth/age, enqueue-to-start, inference time, failures by model/device, GPU memory, output size, cost per minute of audio, retries, cancellation latency, and storage TTL cleanup success.
8. The client shows queue/progress/cancel/retry states, keeps local fallback available when hardware permits, and never silently uploads source audio. Users must explicitly select remote processing and see its storage/privacy terms.

## Cost and fairness controls

- Enforce max duration/bytes per model, per-account daily minute credits, tenant concurrency, shared global concurrency and device/worker pools.
- Reserve GPU workers for paid/service tiers only if product policy requires this; retain transparent user-visible quotas and never hide output access behind opaque download lockouts.
- Use retry-after or a real queue rather than allowing API request floods to fill process memory.
- Batch/stream model work only when the model supports it and benchmarks prove quality/latency; do not assume batching is free or safe.
- Keep non-AI FFmpeg work on CPU workers and model inference on dedicated GPU workers to avoid CPU video exports starving model jobs.
- Measure service cost per audio minute and video minute, then define autoscale/circuit-breaker thresholds from load tests. “Millions of tools” in a catalog is not the same as millions of simultaneous compute jobs; provision around actual job concurrency, duration and memory profile.

## Release gates before scaling

- Load tests across several replicas prove global queue and tenant limits, no duplicate billing, no leaked files, retry/cancel correctness and graceful overload.
- Quality fixture set covers male/female/child voice where consented, diverse timbres, dense mixes, mono/stereo and representative genres; publish metrics and supported model limits.
- Security review covers file parser isolation, decompression bombs, malicious media, signed object access, tenant isolation, retention, abuse and request SSRF.
- Compare GPU cost and result quality against device-local ONNX for supported handset/desktop classes. If the local path is already economical and reliable, do not offload automatically just to centralize compute.
