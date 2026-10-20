# Qwythos model compatibility

## Model identity

Requested checkpoint: [fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated](https://huggingface.co/fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated).

The Hugging Face model page identifies this checkpoint as a 9B-parameter `qwen3_5` model and does not provide a verified Diffusers image-generation pipeline or working image-generation example. It must not be passed to the existing `DiffusionPipeline.from_pretrained` image endpoint as if it were a compatible replacement for `aoxo/flux.1dev-abliterated`.

## Safe integration boundary

- Keep `aoxo/flux.1dev-abliterated` as the active image-generation model.
- Do not silently replace the current image model or claim Qwythos generates images until its actual task and supported inference path are confirmed.
- Qwythos may be integrated as a separate text/prompt assistant in the same Space, but that requires its own Transformers loading path, endpoint, memory budget, and testing. Its 9B weights are roughly 18.8 GB on the Hub before runtime overhead; free ZeroGPU compatibility is not guaranteed.
- The two models must be selected by task, not exposed as interchangeable image-generation choices.

This note records the compatibility constraint so future changes do not break the existing FLUX endpoint.
