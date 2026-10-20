# Model compatibility and selector behavior

## FLUX: image synthesis

- Model: [`aoxo/flux.1dev-abliterated`](https://huggingface.co/aoxo/flux.1dev-abliterated)
- Task: text-to-image
- Pipeline: Diffusers `DiffusionPipeline`
- Endpoint: `/generate_image`
- Maximum requested GPU duration: 120 seconds

FLUX is responsible for rendering the final pixels, both for ordinary prompts and for prompts interpreted by Qwythos.

## Qwythos: reference image + instructions

- Model: [`fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated`](https://huggingface.co/fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated)
- Architecture: `qwen3_5`, approximately 9.4B parameters and 18.8 GB of BF16 weights on the Hub
- Endpoint: `/generate_image_from_image`
- Inputs: reference image, user instructions, and output language
- Output: a detailed image-generation prompt, which is sent to the separate FLUX endpoint
- Maximum requested GPU duration: 300 seconds

The standalone text-only Qwythos prompt assistant has been removed. Qwythos is now used only to understand a supplied image together with the user's instructions. It does not itself render the final image; FLUX does.

## GPU duration and memory

The previous image + text operation requested 450 seconds in a single GPU reservation, which the Space rejected because it exceeds the allowed maximum. The implementation now runs Qwythos interpretation and FLUX synthesis as two sequential GPU requests, with declared durations of 300 seconds and 120 seconds respectively. No function should request 450 seconds or combine both stages into one 450-second reservation.

Splitting the requests resolves the invalid duration declaration. It does not guarantee that cold model loads or inference finish before each deadline. Qwythos's BF16 weights alone are approximately 18.8 GB, before activations and runtime overhead; the currently available hardware may still be insufficient. Validate the actual Space logs and end-to-end inference after deployment. Do not remove the reference-image workflow merely because a live model or hardware issue still needs diagnosis.
