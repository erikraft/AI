---
title: ErikrafT AI
sdk: gradio
app_file: app.py
pinned: false
---

# ErikrafT AI — Hugging Face Space

This Space provides two image-generation workflows using two model checkpoints:

- **Text-to-image:** `aoxo/flux.1dev-abliterated` via Diffusers at `/generate_image`. Inputs: prompt, width, height, and inference steps. Requested GPU duration: 120 seconds.
- **Reference image + instructions → image:** `fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated` interprets the uploaded image and instructions at `/generate_image_from_image`, returning a detailed image prompt. The caller then invokes `/generate_image` as a separate FLUX GPU request to render the image. Qwythos requested GPU duration: 300 seconds maximum.

The old standalone Qwythos text-only prompt-assistant endpoint (`/generate_prompt`) has been removed. Qwythos is used only when the user supplies a reference image and instructions. It interprets the input but does not generate the final image pixels; FLUX performs that separate stage.

## Why GPU calls are split

The previous combined flow requested a 450-second GPU window, which is above the maximum permitted by the Space and caused:

```text
The requested GPU duration (450s) is larger than the maximum allowed
```

The updated flow uses two sequential requests with independent durations, Qwythos at 300 seconds and FLUX at 120 seconds. This fixes the invalid duration request; it does not guarantee that the models will finish loading or inference within those windows.

Both checkpoints are large and are loaded on demand to reduce memory pressure. Qwythos has approximately 18.8 GB of BF16 weights before runtime overhead. The Space still requires compatible Transformers/PyTorch versions and adequate RAM/VRAM. Free hardware, quotas, queue times, and successful live inference are not guaranteed.

The repository workflow `.github/workflows/sync-to-huggingface.yml` syncs this directory to `ErikrafT/erikraft-ai` when changes reach `main`.
