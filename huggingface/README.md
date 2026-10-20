---
title: ErikrafT AI
sdk: gradio
app_file: app.py
pinned: false
---

# ErikrafT AI — Hugging Face Space

This single Space exposes two task-specific model endpoints:

- **Image generation:** `aoxo/flux.1dev-abliterated` via Diffusers at `/generate_image`. Inputs: prompt, width, height, inference steps.
- **Prompt improvement (text only):** `fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated` via Transformers at `/generate_prompt`. Inputs: prompt and language (`pt-BR` or `en`). Qwythos does not return an image; it rewrites the prompt for use with FLUX.

Both checkpoints are loaded on demand, and the other model is unloaded to reduce memory pressure. Qwythos has approximately 18.8 GB of BF16 weights before runtime overhead. The Space therefore needs enough RAM/VRAM and a compatible Transformers/PyTorch runtime; free-tier hardware may fail to load or run it. GPU execution is limited to a maximum 300-second request window in this app; a longer load or inference can still fail.

The website's model selector shows the full repository IDs and the actual task for each choice. Provider quotas, hardware availability, queue times, and cold starts depend on Hugging Face.


### Experimental image + text endpoint

The Space exposes `/generate_image_from_image` for the website's reference-image workflow. It attempts Qwythos multimodal interpretation of the uploaded image and instructions, then asks FLUX to render the final image. This endpoint is experimental and may fail if the model architecture, processor, Gradio payload schema, or available RAM/VRAM/GPU time is incompatible. Keep this endpoint and upload feature in place while validating live inference; `/generate_prompt` and `/generate_image` remain independent options.