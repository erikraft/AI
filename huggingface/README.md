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

Both checkpoints are loaded on demand, and the other model is unloaded to reduce memory pressure. Qwythos has approximately 18.8 GB of BF16 weights before runtime overhead. The Space therefore needs enough RAM/VRAM and a compatible Transformers/PyTorch runtime; free-tier hardware may fail to load or run it, and no free availability is guaranteed.

The website's model selector shows the full repository IDs and the actual task for each choice. Provider quotas, hardware availability, queue times, and cold starts depend on Hugging Face.
