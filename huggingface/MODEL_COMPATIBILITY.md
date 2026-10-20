# Model compatibility and selector behavior

## Image generation: FLUX

- Model: [`aoxo/flux.1dev-abliterated`](https://huggingface.co/aoxo/flux.1dev-abliterated)
- Task: text-to-image
- Pipeline: Diffusers `DiffusionPipeline`
- Endpoint: `/generate_image`

This remains the active image-generation model and is not replaced by Qwythos.

## Prompt improvement: Qwythos

- Model: [`fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated`](https://huggingface.co/fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated)
- Architecture: `qwen3_5`, approximately 9.4B parameters and 18.8 GB of BF16 weights on the Hub
- Endpoint: `/generate_prompt`
- Task in this implementation: text-only prompt improvement with Transformers

Although the Hub currently tags the checkpoint as `image-text-to-image`, the model page has no verified image-decoder pipeline or working image-generation example. Official Qwen3.5 Transformers documentation demonstrates text generation and multimodal input/understanding, not image synthesis. The site therefore does not falsely advertise Qwythos as a second image generator. Users can select its full model ID to improve a prompt, then switch to FLUX to render an image.

## Runtime constraints

The Space loads one checkpoint on demand and unloads the other to reduce memory use. This does not guarantee that Qwythos will fit the current Space hardware: its BF16 weights alone are about 18.8 GB, before activations, KV cache, Python, and other runtime overhead. Free hardware may not have enough RAM/VRAM or execution time. Validate actual Space logs and inference after deploying; if it fails from memory/runtime limits, upgrade hardware or use a suitable quantized checkpoint rather than silently breaking FLUX.


## Reference-image upload status

Reference-image processing is disabled until the model architecture, processor, Gradio payload schema, and hardware requirements are validated by a successful live inference. Do not enable the upload UI or call an image-to-image endpoint until those tests pass.