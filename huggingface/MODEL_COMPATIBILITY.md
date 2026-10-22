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
- Declared GPU duration: 180 seconds (reduced because a 300-second declaration surfaced as a rejected 450-second reservation)

The standalone text-only Qwythos prompt assistant has been removed. Qwythos is now used only to understand a supplied image together with the user's instructions. It does not itself render the final image; FLUX does.

## GPU duration and memory

The observed error was caused by the Qwythos decorator declaring 300 seconds, which ZeroGPU surfaced as a 450-second reservation and rejected. The implementation now declares 180 seconds for Qwythos and keeps FLUX at 120 seconds, in separate sequential GPU requests. Do not increase Qwythos back to 300 seconds without verifying the account's effective ZeroGPU cap.

The lower Qwythos duration is intended to prevent the invalid 450-second reservation. It does not guarantee that cold model loads or inference finish before each deadline. The Vercel API also places a 235-second wall-clock budget on Cosmos and Qwen requests so the UI receives a bounded error before the 300-second Hobby Function limit. Qwythos's BF16 weights alone are approximately 18.8 GB, before activations and runtime overhead; the currently available hardware may still be insufficient. Validate the actual Space logs and end-to-end inference after deployment. Do not remove the reference-image workflow merely because a live model or hardware issue still needs diagnosis.


## Cosmos3 Nano — experimental text-to-video

- Checkpoint: [DuoNeural/Cosmos3-Nano-Abliterated](https://huggingface.co/DuoNeural/Cosmos3-Nano-Abliterated)
- Task/API: `/generate_video`; `Cosmos3OmniPipeline`; 16 frames, 256×256, 12 steps, declared GPU duration 180 seconds.
- The implementation refuses to load on runtimes reporting less than 42 GiB total or 36 GiB free VRAM. This accounts for ZeroGPU's advertised 48 GB being reported by PyTorch as roughly 44.7 GiB. It asks for 30 GiB free disk for a cold cache. These thresholds reduce foreseeable OOM/disk failures but cannot guarantee a successful request. The upstream model is around 15.2B parameters and calls for roughly 48 GB VRAM; do not expect it to run reliably on arbitrary free/shared hardware.
- `ENABLE_COSMOS_VIDEO` defaults to enabled in the Space source unless the Space has an explicit environment override. The handler still refuses inference when CUDA/VRAM/disk checks fail.

## Qwen3.8 27B — experimental text generation

- Checkpoint: [0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF](https://huggingface.co/0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF)
- Task/API: `/generate_text`; `llama-cpp-python`, `RVN-IQ2_XS.gguf` (~9.1 GB) and CPU-only inference (`n_gpu_layers=0`).
- Requires approximately 12 GiB free RAM and 11 GiB free disk space for a cold load. This low-bit quantization prioritizes memory over quality and CPU generation may be slow. It does not consume the CUDA model budget, but host RAM/disk remain bottlenecks.
- `huggingface/requirements.txt` installs `torchvision==0.28.0` (the matching torchvision line for PyTorch 2.13) for the Qwen3VLVideoProcessor required by Qwythos. It also requests the project's prebuilt Linux CPU wheel `llama-cpp-python==0.3.36` so Qwen does not depend on a local C++ compilation. `ENABLE_QWEN_TEXT` now defaults to enabled when no explicit Space environment override exists. A successful Space rebuild plus a real inference call is still required to confirm the selected wheel, memory and runtime work together.
