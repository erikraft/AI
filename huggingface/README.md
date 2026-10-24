---
title: ErikrafT AI
sdk: gradio
app_file: app.py
pinned: false
---

# ErikrafT AI — Hugging Face Space

This Space provides two image-generation workflows using two model checkpoints:

- **Text-to-image:** `aoxo/flux.1dev-abliterated` via Diffusers at `/generate_image`. Inputs: prompt, width, height, and inference steps. Requested GPU duration: 120 seconds.
- **Any browser-decodable input image + instructions → image edit:** the website normalizes the selected image to JPEG (up to 3 MiB) and uploads it through the server-side API to `/generate_image_from_image`. `fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated` interprets the actual image and instructions and returns a prompt explicitly prioritizing identity preservation. The server then calls `/generate_image_from_reference`, which uses `FluxImg2ImgPipeline` with the actual uploaded image as the source and a low denoising strength of `0.30`, rather than generating from text alone. This improves continuity of faces, people, clothing, pose, and composition, but cannot guarantee pixel-perfect identity. Qwythos declared GPU duration: 180 seconds; FLUX editing has a separate 120-second GPU request.

The old standalone Qwythos text-only prompt-assistant endpoint (`/generate_prompt`) has been removed. Qwythos is used only when the user supplies a reference image and instructions. It interprets the input; FLUX performs the actual image edit using the reference image as its img2img source. Qwythos itself is a multimodal text/vision model, not an image-pixel generator.

## Why GPU calls are split

The previous Qwythos configuration declared 300 seconds, but ZeroGPU surfaced it as a 450-second reservation and rejected it. The error was caused by the duration declaration, not by a missing or different model:

```text
The requested GPU duration (450s) is larger than the maximum allowed
```

The updated flow keeps two sequential requests with independent durations: Qwythos at 180 seconds and FLUX at 120 seconds (unchanged). This leaves headroom below the observed ZeroGPU ceiling; it does not guarantee that model loading or inference will finish within those windows.

Both checkpoints are large and are loaded on demand to reduce memory pressure. Qwythos has approximately 18.8 GB of BF16 weights before runtime overhead. The Space still requires compatible Transformers/PyTorch versions and adequate RAM/VRAM. Free hardware, quotas, queue times, and successful live inference are not guaranteed.

The repository workflow `.github/workflows/sync-to-huggingface.yml` syncs this directory to `ErikrafT/erikraft-ai` when changes reach `main`.


## Protected experimental endpoints

Qwen text and Cosmos video are intentionally hidden from the public Space UI because they require the server-side `HF_SPACE_API_SECRET`. Use the authenticated ErikrafT AI website to invoke them; the website backend supplies the secret without exposing it to browser users. Direct calls without the configured secret are rejected by design. Do not populate a browser field with a server secret.

Voice cloning remains available in the Space UI and through the authenticated website backend. Reference audio is restricted to files under Gradio's managed upload cache and limited to 3 MiB. The flow first transcribes the reference sample with Whisper to identify its spoken language, then selects the matching XTTS v2 language on the multilingual voice-cloning Space; it does not use the website locale. Supported languages include English, Portuguese, Spanish, French, German, Italian, Polish, Turkish, Russian, Dutch, Czech, Arabic, Chinese, Japanese, Korean, and Hungarian. Samples with too little or unclear speech fail with an actionable message rather than silently forcing English. Reference audio is sent to the Whisper and multilingual XTTS Hugging Face Spaces for inference.

## Experimental models (guarded at request time)

This Space also defines two separate tasks:

- **Video:** `DuoNeural/Cosmos3-Nano-Abliterated` via `Cosmos3OmniPipeline`, endpoint `/generate_video`. Initial generation is limited to 16 frames at 256×256 and 12 inference steps. The function refuses to load unless `ENABLE_COSMOS_VIDEO=true`; before loading it requires at least 48 GiB total and 40 GiB free VRAM, plus 36 GiB free cache disk for a cold download. This is only a guard, not a guarantee of success. Upstream reports roughly 48 GB VRAM needs; a typical free/shared GPU may not satisfy it.
- **Text:** `0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF` via CPU-only `llama-cpp-python`, endpoint `/generate_text`. The selected `RVN-IQ2_XS.gguf` quantization is about 9.1 GB. It uses `n_gpu_layers=0` to avoid GPU OOM, requires about 12 GiB available system RAM and 11 GiB free disk on a cold download, and will be slower/lower-quality than larger quantizations. The handler caps responses at 128 tokens and uses a smaller batch to limit CPU/RAM pressure; this is a latency safeguard, not a guarantee that the 27B model will run reliably on 2 vCPUs. The Space now requests the project's prebuilt Linux CPU wheel (`llama-cpp-python==0.3.36`) instead of the older 0.3.16 version that failed resolution. `ENABLE_QWEN_TEXT` defaults to enabled unless an explicit Space environment override sets it to false. The actual wheel import, model download, available RAM/disk, and a real response still must be verified in the rebuilt Space. The Vercel backend gives Qwen a 135-second inference budget; the browser has a 3-minute fallback so a stalled request cannot leave the chat stuck on “Thinking…” forever.
- Cosmos and Qwen now default to enabled in the Space source unless explicit Space environment overrides disable them. Both experimental handlers still fail closed unless the server-side caller supplies the matching `HF_SPACE_API_SECRET`, and each model performs runtime hardware, memory, and disk checks. A visible selector is not proof of successful inference: check the latest Space build/runtime logs and call each endpoint on the rebuilt Space. The Vercel API must have `HF_SPACE_ID=ErikrafT/erikraft-ai` configured in its server-side environment variables. Free-tier hardware/availability is not guaranteed.

The new model weights and fine-tunes are third-party artifacts; ErikrafT did not create or train them.


## Direct API protection and output cleanup

The Cosmos and Qwen endpoints require `HF_SPACE_API_SECRET` (at least 32 characters) as a Space secret and as a **server-side** secret in the Vercel project environment (never a browser variable). The secret is passed only as a hidden Gradio input. The handlers fail closed if it is missing or wrong. The Space remains public for existing image workflows; this shared secret specifically protects the experimental endpoints.

For Cosmos, the callable passed as `spaces.GPU(duration=...)` validates the secret and prompt before ZeroGPU schedules a GPU worker. `generate_video` remains the decorated function registered with Gradio; this avoids the ZeroGPU startup failure that can occur when only an inner helper is decorated. The handler repeats authorization as defense in depth.

**Deployment order matters:** merge the GitHub PR to `main`; the repository workflow syncs `huggingface/` to this Space. Wait for the Space build to complete before real endpoint tests. Then ensure the backend sends the same `HF_SPACE_API_SECRET` configured in Space settings. The model flags default to enabled in code after this change, but runtime resource checks and the shared-secret gate still apply; explicitly set a flag to `false` only when you intend to disable that route.

Cosmos checks cold-download disk capacity before evicting other models, then releases the other model cache before measuring free VRAM. Qwen checks cold-download disk capacity before eviction, then releases other model caches before measuring free system RAM. This avoids both unnecessary eviction on an obvious disk failure and false memory failures caused by another resident model. Generated videos remain in Gradio's managed cache and old cache files are pruned hourly after 24 hours; partial files are removed immediately on failure.

### Model runtime dependencies

- `torchvision==0.28.0` is added to match PyTorch 2.13 and satisfy `Qwen3VLVideoProcessor`, which Qwythos' multimodal `AutoProcessor` requires.
- Qwen uses `llama-cpp-python==0.3.36` from the project's prebuilt Linux CPU wheel index, with binary-only installation to avoid falling back to a slow/timeout-prone local C++ build.
- `app.py` logs the actual Torch/Torchvision versions and CUDA availability on startup. If Torchvision import fails, the diagnostic is logged while the remaining model UI can still start.
- Qwen and Cosmos remain available for real validation by default in the Space source. Neither this dependency configuration nor a successful build proves inference succeeded; validate the live endpoints and review logs.


## Development-agent skills

This Space includes a metadata catalog for Pedro Nauck's 88 upstream agent skills in `agent_skills/catalog.json`. The catalog is for development-agent tooling only. It is not injected into model prompts, is not a Gradio input, and does not change FLUX, Qwythos, Cosmos, or Qwen inference. Full upstream skill packages can be installed directly with `npx skills add https://github.com/pedronauck/skills`; see [agent_skills/README.md](agent_skills/README.md).


## Multilingual prompts

The website applies separate authenticated per-model quotas: up to 15 Qwythos image edits per hour and up to 10 requests per hour for each other model by default. Set `QWYTHOS_MAX_PER_HOUR` (1–30) in Vercel to override the Qwythos allowance. Provider quotas remain independent.

The website API accepts prompts in their original language for FLUX image generation and Cosmos video generation; it does not silently rewrite the user's text. The model's actual quality varies by language and prompt style, so accepting a language is not a guarantee of equal results in every language.

For image editing, the Qwythos stage is instructed to detect the language of the user's instructions and return its image prompt in that same language. The Qwen text assistant is likewise instructed to answer in the language used in the prompt, rather than forcing the website's English or Brazilian Portuguese locale.

Voice cloning chooses the requested spoken-output language from the text to be spoken when it can be detected reliably. Short text falls back to the reference-audio language. The multilingual voice model has a finite supported-language list; it cannot promise arbitrary-language speech.
