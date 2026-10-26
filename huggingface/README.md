---
title: ErikrafT AI
sdk: gradio
app_file: app.py
pinned: false
---

# ErikrafT AI — Hugging Face Space

This Space provides the existing FLUX text-to-image and Qwythos reference-edit workflows plus the additional experimental Qwen Image 2.1 Turbo text-to-image workflow:

- **Text-to-image:** `aoxo/flux.1dev-abliterated` via Diffusers at `/generate_image`. Inputs: prompt, width, height, and inference steps. Requested GPU duration: 120 seconds.
- **Experimental Qwen Image 2.1 Turbo text-to-image:** the hidden `/generate_qwen_image` endpoint uses the uncensored Qwen3-VL GGUF encoder from `AtomicChat/Qwen-Image-2.1-Turbo-Uncensored-GGUF`, the paired Turbo denoiser from `AtomicChat/Qwen-Image-2.1-Turbo-GGUF`, and `vae/qwen_image_2.1_vae_bf16.safetensors` from `Comfy-Org/Qwen-Image-2.1`. It runs the pinned CUDA-enabled `stable-diffusion.cpp` binary built and published by `.github/workflows/build-qwen-image-engine.yml`; the Turbo schedule is fixed to 8 steps, Euler, CFG 1.0. Model downloads and the verified engine bundle are prepared before the ZeroGPU allocation; the handler refuses to run without the shared secret, CUDA, free disk, and sufficient VRAM.
- **Any browser-decodable input image + instructions → image edit:** the website normalizes the selected image to JPEG (up to 3 MiB) and uploads it through the server-side API to `/generate_image_from_image`. `fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated` receives the same base system prompt as the chatbot plus image-edit-specific instructions, interprets the actual source image and user request, and returns a target-state visual prompt. It must follow requested changes instead of forcing clothes, pose, background, or every detail to remain unchanged. The server then calls `/generate_image_from_image_render`, which uses `FluxImg2ImgPipeline` from the exact `aoxo/flux.1dev-abliterated` checkpoint and passes the actual uploaded image as the source. Img2img strength defaults to `0.65` and can be tuned with the `QWYTHOS_IMG2IMG_STRENGTH` Space variable (clamped to `0.45–0.85`). This is designed to let edits take effect while still using the reference image, but does not guarantee pixel-perfect identity. Qwythos declared GPU duration: 120 seconds; FLUX editing has a separate 120-second GPU request.

The old standalone Qwythos text-only prompt-assistant endpoint (`/generate_prompt`) has been removed. Qwythos is used only when the user supplies a reference image and instructions. It interprets the input; FLUX performs the actual image edit using the reference image as its img2img source. Qwythos itself is a multimodal text/vision model, not an image-pixel generator.

## Why GPU calls are split

The previous Qwythos configuration declared 300 seconds, but ZeroGPU surfaced it as a 450-second reservation and rejected it. The error was caused by the duration declaration, not by a missing or different model:

```text
The requested GPU duration (450s) is larger than the maximum allowed
```

The updated flow keeps two sequential requests with independent durations: Qwythos at 120 seconds and FLUX at 120 seconds (unchanged). Live ZeroGPU logs showed a 180-second declaration becoming a rejected 270-second reservation, so the shorter value keeps the effective reservation near 180 seconds. This does not guarantee that model loading or inference will finish within the available GPU time.

Both checkpoints are large and are loaded on demand to reduce memory pressure. Qwythos has approximately 18.8 GB of BF16 weights before runtime overhead. The Space still requires compatible Transformers/PyTorch versions and adequate RAM/VRAM. Free hardware, quotas, queue times, and successful live inference are not guaranteed.

The repository workflow `.github/workflows/sync-to-huggingface.yml` syncs this directory to `ErikrafT/erikraft-ai` when changes reach `main`.


## Protected experimental endpoints

Qwen text, Qwen Image generation, and Cosmos video are intentionally hidden from the public Space UI because they require the server-side `HF_SPACE_API_SECRET`. Use the authenticated ErikrafT AI website to invoke them; the website backend supplies the secret without exposing it to browser users. Direct calls without the configured secret are rejected by design. Do not populate a browser field with a server secret.

Voice cloning remains available in the Space UI and through the authenticated website backend. Reference audio is restricted to files under Gradio's managed upload cache and limited to 3 MiB. The flow first transcribes the reference sample with Whisper to identify its spoken language, then selects the matching XTTS v2 language on the multilingual voice-cloning Space; it does not use the website locale. Supported languages include English, Portuguese, Spanish, French, German, Italian, Polish, Turkish, Russian, Dutch, Czech, Arabic, Chinese, Japanese, Korean, and Hungarian. Samples with too little or unclear speech fail with an actionable message rather than silently forcing English. Reference audio is sent to the Whisper and multilingual XTTS Hugging Face Spaces for inference.

## Experimental models (guarded at request time)

This Space also defines two separate tasks:

- **Video:** `DuoNeural/Cosmos3-Nano-Abliterated` via `Cosmos3OmniPipeline`, endpoint `/generate_video`. Initial generation is limited to 16 frames at 256×256 and 12 inference steps. The function refuses to load unless `ENABLE_COSMOS_VIDEO=true`; before loading it requires at least 48 GiB total and 40 GiB free VRAM, plus 36 GiB free cache disk for a cold download. This is only a guard, not a guarantee of success. Upstream reports roughly 48 GB VRAM needs; a typical free/shared GPU may not satisfy it.
- **Text:** `0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF` via CPU-only `llama-cpp-python`, endpoint `/generate_text`. The selected `RVN-IQ2_XS.gguf` quantization is about 9.1 GB. It uses `n_gpu_layers=0` to avoid GPU OOM, requires about 12 GiB available system RAM and 11 GiB free disk on a cold download, and will be slower/lower-quality than larger quantizations. The handler caps responses at 384 tokens and uses a smaller batch to limit CPU/RAM pressure; this is a latency safeguard, not a guarantee that the 27B model will run reliably on 2 vCPUs. The Space now requests the project's prebuilt Linux CPU wheel (`llama-cpp-python==0.3.36`) instead of the older 0.3.16 version that failed resolution. `ENABLE_QWEN_TEXT` defaults to enabled unless an explicit Space environment override sets it to false. The actual wheel import, model download, available RAM/disk, and a real response still must be verified in the rebuilt Space. Without MCP tools, the Vercel backend allows up to 235 seconds for a Qwen inference call (the Qwen3.8 text route); Qwen Image requests have a separate 225-second image-generation API budget. When MCP tools are available, each tool-calling round has a 65-second budget and the backend allows at most two rounds. The browser request timeout is 285 seconds, so a stalled request should return an actionable error instead of leaving the chat stuck on “Thinking…” indefinitely.
- Cosmos, Qwen text, and Qwen Image now default to enabled in the Space source unless explicit Space environment overrides disable them. All experimental model handlers still fail closed unless the server-side caller supplies the matching `HF_SPACE_API_SECRET`, and each model performs runtime hardware, memory, and disk checks. A visible selector is not proof of successful inference: check the latest Space build/runtime logs and call each endpoint on the rebuilt Space. The Vercel API must have `HF_SPACE_ID=ErikrafT/erikraft-ai` configured in its server-side environment variables. Free-tier hardware/availability is not guaranteed.

The new model weights and fine-tunes are third-party artifacts; ErikrafT did not create or train them.


## Direct API protection and output cleanup

The Cosmos, Qwen text, and Qwen Image endpoints require `HF_SPACE_API_SECRET` (at least 32 characters) as a Space secret and as a **server-side** secret in the Vercel project environment (never a browser variable). The secret is passed only as a hidden Gradio input. The handlers fail closed if it is missing or wrong. The Space remains public for existing image workflows; this shared secret specifically protects the experimental endpoints.

For Cosmos, the callable passed as `spaces.GPU(duration=...)` validates the secret and prompt before ZeroGPU schedules a GPU worker. `generate_video` remains the decorated function registered with Gradio; this avoids the ZeroGPU startup failure that can occur when only an inner helper is decorated. The handler repeats authorization as defense in depth.

**Deployment order matters:** merge the GitHub PR to `main`; the repository workflow syncs `huggingface/` to this Space. Wait for the Space build to complete before real endpoint tests. Then ensure the backend sends the same `HF_SPACE_API_SECRET` configured in Space settings. The `ENABLE_COSMOS_VIDEO`, `ENABLE_QWEN_TEXT`, and `ENABLE_QWEN_IMAGE` flags default to enabled in code, but runtime resource checks and the shared-secret gate still apply; explicitly set a flag to `false` only when you intend to disable that route.

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

For image editing, Qwythos receives the shared chatbot base system prompt plus task-specific visual-edit instructions, detects the language of the user's instructions, and returns its image prompt in that language. It should apply explicit requested changes and preserve only unmentioned details that do not conflict with the request. The Qwen text assistant uses the same base system prompt and is likewise instructed to answer in the language used in the prompt, rather than forcing the website's English or Brazilian Portuguese locale.

Voice cloning chooses the requested spoken-output language from the text to be spoken when it can be detected reliably. Short text falls back to the reference-audio language. The multilingual voice model has a finite supported-language list; it cannot promise arbitrary-language speech.


## Custom MCP tools for Qwen / Ferramentas MCP personalizadas para o Qwen

### English

The hidden experimental Qwen endpoint accepts optional tool definitions and conversation messages from the authenticated Vercel backend. The Vercel backend owns MCP server URLs and encrypted access tokens, discovers tools, executes allowed tool calls, and sends tool results back to Qwen for the final response. MCP credentials are not sent to this Space. Tool schemas, conversation prompts, and tool results may be sent here for inference, so do not include secrets or sensitive data in tool results.

Only tools marked with MCP `annotations.readOnlyHint: true` are exposed by default. The website can explicitly enable write-capable tools per configured server. The backend exposes up to six compact tool schemas per request and bounds tool-result size to preserve the model context. Tool calling remains subject to CPU RAM, inference timeout, and provider availability. This feature uses the model's native `llama-cpp-python` tool-calling interface; compatibility depends on the selected GGUF chat template and is not guaranteed until live inference is validated.

### Português (Brasil)

O endpoint experimental oculto do Qwen aceita definições opcionais de ferramentas e mensagens de conversa enviadas pelo backend autenticado da Vercel. O backend da Vercel mantém as URLs dos servidores MCP e os tokens de acesso criptografados, descobre ferramentas, executa chamadas permitidas e devolve os resultados ao Qwen para gerar a resposta final. As credenciais MCP não são enviadas para este Space. Esquemas de ferramentas, prompts da conversa e resultados das ferramentas podem ser enviados para inferência; não inclua segredos ou dados sensíveis nesses resultados.

Por padrão, só são disponibilizadas ferramentas marcadas com `annotations.readOnlyHint: true` do MCP. O site pode habilitar explicitamente ferramentas capazes de escrever dados em cada servidor configurado. O backend expõe até seis esquemas compactos de ferramentas por solicitação e limita o tamanho dos resultados para preservar o contexto do modelo. As chamadas continuam sujeitas à RAM da CPU, ao tempo limite de inferência e à disponibilidade do provedor. O recurso usa a interface nativa de chamadas de ferramentas do `llama-cpp-python`; a compatibilidade depende do template de conversa do GGUF selecionado e não é garantida até que a inferência real seja validada.

## Qwen Image 2.1 Turbo — deployment notes

The encoder repository supplied in the model selector contains a GGUF text encoder, not the complete image-generation stack. The deployment therefore also downloads the matching Turbo denoiser and the Qwen Image 2.1 VAE. Do not replace these with the earlier Qwen Image or Wan VAE assets; their weights are not interchangeable.

The CUDA engine is built from the revision pinned in `qwen-image-engine.lock`. The GitHub Actions workflow `.github/workflows/build-qwen-image-engine.yml` builds a Linux CUDA CLI and publishes `sd-cli-linux-cuda.tar.gz` plus its SHA-256 checksum to the repository's `qwen-image-engine` release. The Space downloads this archive from the public release and verifies its checksum before extraction. The workflow runs after its changes reach `main`; a PR branch alone does not publish the release asset.

Set `ENABLE_QWEN_IMAGE=false` in Space or Vercel only when intentionally disabling the route. The endpoint uses the same server-side `HF_SPACE_API_SECRET` as the other experimental models, and the Vercel API sends it only as a hidden Gradio input. The preflight downloads files before ZeroGPU reserves its GPU time, then the generation handler checks CUDA, VRAM, and disk. It limits outputs to 768×768, 1024×768, or 768×1024 and uses the upstream Turbo 8-step sigma schedule. These checks reduce avoidable failures but cannot guarantee a cold-start or live inference succeeds on free/shared hardware.
