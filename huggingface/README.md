---
title: ErikrafT AI
sdk: gradio
app_file: app.py
pinned: false
---

# ErikrafT AI — Hugging Face Space

This Space provides two image-generation workflows using two model checkpoints:

- **Text-to-image:** `aoxo/flux.1dev-abliterated` via Diffusers at `/generate_image`. Inputs: prompt, width, height, and inference steps. Requested GPU duration: 120 seconds.
- **Any browser-decodable input image + instructions → image:** the website normalizes the selected image to JPEG (up to 3 MiB) and uploads it through the server-side API to `/generate_image_from_image`. `fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated` interprets the actual image and instructions and returns a detailed image prompt; the server invokes `/generate_image` as a separate FLUX GPU request to render the final image. Qwythos declared GPU duration: 180 seconds, lowered after ZeroGPU rejected the previous 300-second setting as a 450-second reservation.

The old standalone Qwythos text-only prompt-assistant endpoint (`/generate_prompt`) has been removed. Qwythos is used only when the user supplies a reference image and instructions. It interprets the input but does not generate the final image pixels; FLUX performs that separate stage.

## Why GPU calls are split

The previous Qwythos configuration declared 300 seconds, but ZeroGPU surfaced it as a 450-second reservation and rejected it. The error was caused by the duration declaration, not by a missing or different model:

```text
The requested GPU duration (450s) is larger than the maximum allowed
```

The updated flow keeps two sequential requests with independent durations: Qwythos at 180 seconds and FLUX at 120 seconds (unchanged). This leaves headroom below the observed ZeroGPU ceiling; it does not guarantee that model loading or inference will finish within those windows.

Both checkpoints are large and are loaded on demand to reduce memory pressure. Qwythos has approximately 18.8 GB of BF16 weights before runtime overhead. The Space still requires compatible Transformers/PyTorch versions and adequate RAM/VRAM. Free hardware, quotas, queue times, and successful live inference are not guaranteed.

The repository workflow `.github/workflows/sync-to-huggingface.yml` syncs this directory to `ErikrafT/erikraft-ai` when changes reach `main`.


## Experimental models (disabled by default)

This Space also defines two separate tasks:

- **Video:** `DuoNeural/Cosmos3-Nano-Abliterated` via `Cosmos3OmniPipeline`, endpoint `/generate_video`. Initial generation is limited to 16 frames at 256×256 and 12 inference steps. The function refuses to load unless `ENABLE_COSMOS_VIDEO=true`; before loading it requires at least 48 GiB total and 40 GiB free VRAM, plus 36 GiB free cache disk for a cold download. This is only a guard, not a guarantee of success. Upstream reports roughly 48 GB VRAM needs; a typical free/shared GPU may not satisfy it.
- **Text:** `0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF` via CPU-only `llama-cpp-python`, endpoint `/generate_text`. The selected `RVN-IQ2_XS.gguf` quantization is about 9.1 GB. It uses `n_gpu_layers=0` to avoid GPU OOM, requires about 12 GiB available system RAM and 11 GiB free disk on a cold download, and will be slower/lower-quality than larger quantizations. Requires `ENABLE_QWEN_TEXT=true`.
- Both flags are **off by default**. The server-side API must independently enforce the corresponding feature flag and `HF_SPACE_API_SECRET`. In this repository, `cloudflare/worker.js` still returns HTTP 503 for `/api/generate`; do not treat the checked-in Cloudflare stack as end-to-end ready until that route is implemented and tested. Do not enable either model until build logs and a real inference test show adequate hardware/storage. Free-tier availability is not guaranteed.

The new model weights and fine-tunes are third-party artifacts; ErikrafT did not create or train them.


## Direct API protection and output cleanup

The Cosmos and Qwen endpoints require `HF_SPACE_API_SECRET` (at least 32 characters) as a Space secret and as a **server-side** secret on whichever backend calls this Space (Cloudflare Worker when it acts as the proxy; never a browser variable). The secret is passed only as a hidden Gradio input. The handlers fail closed if it is missing or wrong. The Space remains public for existing image workflows; this shared secret specifically protects the experimental endpoints.

For Cosmos, the callable passed as `spaces.GPU(duration=...)` validates the secret and prompt before ZeroGPU schedules a GPU worker. `generate_video` remains the decorated function registered with Gradio; this avoids the ZeroGPU startup failure that can occur when only an inner helper is decorated. The handler repeats authorization as defense in depth.

**Deployment order matters:** deploy the Space change first and wait until the Hugging Face build completes successfully, then deploy/update the server-side caller to pass the secret. Gradio may tolerate extra arguments, so deploying the caller first can result in an older, ungated handler silently ignoring the appended secret. Keep both model flags disabled until the matching secret is configured and the new Space build is verified.

Cosmos checks cold-download disk capacity before evicting other models, then releases the other model cache before measuring free VRAM. Qwen checks cold-download disk capacity before eviction, then releases other model caches before measuring free system RAM. This avoids both unnecessary eviction on an obvious disk failure and false memory failures caused by another resident model. Generated videos remain in Gradio's managed cache and old cache files are pruned hourly after 24 hours; partial files are removed immediately on failure.

### Default build dependencies

The default Space build intentionally omits the optional `llama-cpp-python` CPU backend because Qwen text generation is disabled by default. Do not set `ENABLE_QWEN_TEXT=true` unless that backend is explicitly installed and validated. The supported FLUX and Qwythos image workflows do not use Qwen.
