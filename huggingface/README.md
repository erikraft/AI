---
title: ErikrafT AI
sdk: gradio
app_file: app.py
pinned: false
---

# ErikrafT AI — Hugging Face Space

This Space provides two image-generation workflows using two model checkpoints:

- **Text-to-image:** `aoxo/flux.1dev-abliterated` via Diffusers at `/generate_image`. Inputs: prompt, width, height, and inference steps. Requested GPU duration: 120 seconds.
- **Reference image + instructions → image:** `fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated` interprets the uploaded image and instructions at `/generate_image_from_image`, returning a detailed image prompt. The caller then invokes `/generate_image` as a separate FLUX GPU request to render the image. Qwythos declared GPU duration: 180 seconds, lowered after ZeroGPU rejected the previous 300-second setting as a 450-second reservation.

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
- Both flags are **off by default**. The Vercel API additionally requires its corresponding environment variable before accepting requests. Do not enable either switch until build logs and a real inference test show the Space has adequate hardware/storage. Free-tier availability is not guaranteed.

The new model weights and fine-tunes are third-party artifacts; ErikrafT did not create or train them.
