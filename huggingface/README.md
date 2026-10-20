---
title: ErikrafT AI
sdk: gradio
app_file: app.py
pinned: false
---

# ErikrafT AI — Hugging Face Space

This Space runs the image-generation backend for the ErikrafT AI website using `aoxo/flux.1dev-abliterated`.

The Gradio API endpoint is `/generate_image`. Inputs, in order: prompt, width, height, and inference steps.

GPU availability, quotas, model compatibility, and queue times depend on Hugging Face hardware and service limits. This Space is not a guarantee of free or unlimited generation.

## Additional model request and compatibility

The requested checkpoint [`fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated`](https://huggingface.co/fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated) is a 9B-parameter `qwen3_5` Transformers checkpoint (roughly 18.8 GB of weights on the Hub). Its model card is empty and does not provide a verified Diffusers image-generation pipeline or inference example. The current `/generate_image` endpoint therefore continues to use `aoxo/flux.1dev-abliterated`; Qwythos is not exposed as an interchangeable image model. A separate prompt/text endpoint would need its own implementation and hardware validation before being enabled.
