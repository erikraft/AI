# ErikrafT AI

ErikrafT AI is an open-source AI model hub with a responsive dark interface and Portuguese (Brazil)/English UI. This repository uses **Vercel static hosting + Node.js Functions**. **`aoxo/flux.1dev-abliterated`** generates images from text. In the experimental **image-editing** workflow, Qwythos (`fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated`) interprets a reference image and instructions; `FluxImg2ImgPipeline` then edits the actual source image using the same `aoxo/flux.1dev-abliterated` checkpoint. Qwythos shares the chatbot's base system prompt but receives image-edit-specific instructions, and the img2img strength defaults to `0.65` (configurable with `QWYTHOS_IMG2IMG_STRENGTH`, bounded to `0.45–0.85`) so requested edits are less likely to be suppressed by generic preservation rules. Exact identity or pixel-level matching is not guaranteed. Cosmos (`DuoNeural/Cosmos3-Nano-Abliterated`) generates video, Qwen (`0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF`) generates text, and Qwen Image 2.1 Turbo (`AtomicChat/Qwen-Image-2.1-Turbo-Uncensored-GGUF`) provides an additional experimental text-to-image route through a CUDA-enabled `stable-diffusion.cpp` engine and its paired denoiser/VAE. XTTS-v2 clones a voice from a reference audio sample: the API detects the requested speech text's language when possible and uses the reference-audio language only as a fallback for very short text. The Vercel API validates Firebase identity and per-account Firestore quotas before calling Hugging Face. Provider capacity, quotas, cold starts, and successful inference are not guaranteed.

- **Frontend:** static HTML/CSS/JavaScript hosted on Vercel, including image-to-JSON visual blueprints from uploaded images (OCR, layout, colors, typography, and a recreation prompt).
- **Authentication:** Firebase Authentication with Google, GitHub, Yahoo, and email/password; email/password accounts must verify their address before generating images.
- **Generation:** Hugging Face Gradio Spaces route image, video, text, and voice-cloning requests. Voice cloning transcribes the reference audio with Whisper, detects the spoken language, and sends the prompt, reference audio, and explicit language to the multilingual `Nymbo/Voice-Clone-Multilingual` XTTS-v2 Space.
- **Abuse prevention:** Firebase ID-token verification, verified-email enforcement for password accounts, and Firestore-backed per-model limits: up to 15 Qwythos edits per account per hour by default (configurable with `QWYTHOS_MAX_PER_HOUR`, 1–30), and up to 10 requests per hour for each other model by default (`GENERATION_MAX_PER_HOUR`, 1–20).
- **Cost goal:** use free tiers where possible. Provider quotas, availability, model compatibility, and GPU access are not guaranteed.

## Architecture

The root HTML/CSS/JavaScript files are served as static assets on Vercel, while `api/generate.js`, `api/models.js`, and `api/health.js` run as Node.js Functions. The API verifies Firebase ID tokens, enforces the account quota in Firestore, and calls the Hugging Face Gradio Space.

```text
Vercel deployment
Browser → static frontend → /api/generate + Firebase ID token
                              ├── /api/models (runtime availability)
                              ├── /api/health (configuration diagnostics)
                              └── api/generate.js → Firebase Auth + Firestore → Hugging Face Space

```

In Qwythos mode, the browser decodes the selected image and converts it to JPEG (maximum 3 MiB) before sending it as `referenceImage` to `/api/generate`. The Vercel API uploads the file to Gradio so Qwythos receives the actual image and instructions, returns an interpreted prompt, and then calls FLUX separately for the final image.

The Qwythos picker supports touch-friendly camera capture, the device photo gallery, and a general file chooser on mobile and desktop. The same image can also be dragged onto the drop zone on browsers that support file drag-and-drop (including supported iPad/iPhone file-drag workflows). A preview, removal control, MIME/decode validation, and size limits are provided in Portuguese and English. Camera capture depends on the browser/device and may not be exposed by every platform; the gallery/file picker remains the fallback. The picker is intentionally handled in the website frontend, so these UI changes do not require a separate Hugging Face Space deployment.

## Repository layout

- `index.html` — responsive bilingual AI model hub and sign-in modal.
- `assets/css/styles.css` — dark, blue-accented styling.
- `assets/js/app.js` — Firebase sign-in, prompt form, API request, result preview, and download.
- `assets/js/firebase-config.js` — Firebase Web app configuration used by the browser.
- `assets/js/firebase-config.js.example` — template for reference.
- `api/generate.js` — Vercel Node.js Function for authentication, quota enforcement, Gradio calls, and protected image-to-JSON analysis.
- `api/history.js` — authenticated MongoDB Atlas history for JSON blueprints and other generated outputs.
- `api/models.js` and `api/health.js` — Vercel model-availability and configuration-diagnostic endpoints.
- `huggingface/app.py`, `huggingface/requirements.txt`, and `huggingface/README.md` — Gradio Space entry point, dependencies, and Space metadata. The GitHub Actions workflow syncs this directory to the Hugging Face Space when changes reach `main`.

## Vercel deployment

The repository is laid out for Vercel's zero-configuration static hosting and Node.js Functions: no framework build step is required. `vercel.json` restores clean URLs/security headers, enables Fluid Compute, and sets `api/generate.js` to the Hobby maximum of **300 seconds**. `.vercelignore` keeps Hugging Face source and repository-only files out of public deployment assets; the GitHub repository and Hugging Face sync workflow retain them.

### Mobile OAuth and Firefox compatibility

The browser client uses `https://ai.erikraft.com` as its Firebase `authDomain`, and Vercel transparently proxies `/__/auth/*` to `https://erikraft-account.firebaseapp.com/__/auth/*`. This first-party helper path avoids the cross-origin storage restriction that can interrupt OAuth redirect flows in Firefox and other browsers with strict tracking protection. Mobile browsers use Firebase's full-page redirect flow; desktop browsers use popups with redirect fallback when popups are blocked. The app consumes `getRedirectResult()` on return and displays provider errors in Portuguese or English.

**Required console setup — do this before deploying or testing the first-party auth domain:** the code change and Vercel rewrite alone cannot register an OAuth callback with Google. In Firebase Console, open **Authentication → Settings → Authorized domains** and add `ai.erikraft.com`. Then open **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs**, edit the exact Web client used by the Google provider in Firebase Authentication, and add this value under **Authorized redirect URIs** (not just Authorized JavaScript origins):

```text
https://ai.erikraft.com/__/auth/handler
```

Save the OAuth client, allow a short time for the setting to propagate, then retry Google sign-in. The error `redirect_uri_mismatch` means Google rejected the callback before the app can handle the response; changing JavaScript alone cannot fix that rejection. If the Google client is managed by Firebase or you do not have permission to edit it, use the OAuth client configured for the Firebase Google provider or ask its administrator to add the URI.

Also update the callback for every other enabled provider:
- GitHub: update the callback URL in the GitHub OAuth App used by Firebase to `https://ai.erikraft.com/__/auth/handler`.
- Yahoo: update the redirect URI in the Yahoo developer app used by Firebase to `https://ai.erikraft.com/__/auth/handler`.

**Do not switch the app to the first-party auth domain until the matching provider callbacks are saved.**

The old callback `https://erikraft-account.firebaseapp.com/__/auth/handler` will no longer match once the provider configuration switches to the first-party auth domain. Coordinate the provider-console changes with the production deployment: OAuth sign-in will be temporarily unavailable during the cutover if the app and provider callback settings are out of sync. GitHub OAuth Apps normally expose one callback URL, so GitHub sign-in cannot use both callback domains simultaneously in the same app. Email/password sign-in does not use an OAuth redirect URI. For Vercel preview domains or local development, configure an appropriate authorized domain and auth helper proxy, or use a separate development Firebase configuration.

## Vercel environment variables

Configure these in **Vercel → Project → Settings → Environment Variables** for Production and Preview as appropriate:

| Name | Type | Purpose |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Sensitive/Secret | Full Firebase service-account JSON for `erikraft-account`; used only by the Node.js API |
| `HF_SPACE_ID` | Plain | `ErikrafT/erikraft-ai` |
| `HF_TOKEN` | Sensitive/Secret, optional | Only if the Hugging Face Space requires authenticated access |
| `HF_SPACE_API_SECRET` | Sensitive/Secret | Same random secret (at least 32 characters) as in Hugging Face Space Settings; required for Cosmos and the Qwen text/image models |
| `ENABLE_COSMOS_VIDEO` | Plain, optional | Defaults to enabled; set explicitly to `false` only to disable video |
| `ENABLE_QWEN_TEXT` | Plain, optional | Defaults to enabled; set explicitly to `false` only to disable text inference |
| `ENABLE_QWEN_IMAGE` | Plain, optional | Defaults to enabled; set explicitly to `false` only to disable experimental Qwen Image generation |

Never commit actual values from the first, third, or fourth variables. `.env.example` contains placeholders only. The public Firebase **Web** configuration in `assets/js/firebase-config.js` is separate from the server-side Firebase service account.

After assigning the Vercel deployment domain, add that exact domain under **Firebase Console → Authentication → Settings → Authorized domains** so Google/GitHub/Yahoo/email authentication can work from Vercel. Do the same for any specific Preview hostname on which you plan to test login. The Firebase Admin service account also needs the Firestore permissions used by the `generation_limits` collection.

### Routes and diagnostics

- `GET /api/health` — returns configuration booleans only; it does not test credentials against Google or execute a model.
- `GET /api/models` — returns six selectable model identifiers and marks Cosmos/Qwen models configured only when `HF_SPACE_ID` and the protected API secret are present.
- `POST /api/generate` — validates the Firebase ID token, applies the configurable per-account hourly quota, then calls the selected Hugging Face task.

Vercel Functions have a **4.5 MB request/response body limit**. The current Qwythos browser flow compresses its image to at most 3 MiB so the base64 JSON request fits below this ceiling. The Hobby plan's Fluid Compute maximum is **300 seconds**; Cosmos and especially the sequential Qwythos→FLUX path may still hit that deadline if provider queueing or cold model loads take too long. Qwen runs in the Hugging Face Space, not inside Vercel, but its CPU inference can also be slow. These are provider/runtime constraints—not reasons to change or remove any model. Test real calls and check both Vercel Function logs and Space logs before calling a deployment production-ready.

## 1. Firebase configuration

The frontend is configured for the Firebase Web app in project `erikraft-account`. The public Web configuration is in `assets/js/firebase-config.js` and is loaded by `index.html` before `app.js`.

Firebase Web config values (including `apiKey`, `authDomain`, `projectId`, and `appId`) identify the client application; they are **not** service-account credentials. Keep the following secrets out of the repository and browser code:
- GitHub OAuth Client Secret
- Firebase Admin service-account JSON/private key
- Hugging Face access tokens and other server secrets

In Firebase Console:

1. In **Authentication → Sign-in method**, enable **Google**, **GitHub**, and **Email/Password**.
2. Configure the GitHub OAuth Client ID and Client Secret in Firebase. Use the exact callback URL Firebase shows for the provider.
3. Add the production and preview domains in **Authentication → Settings → Authorized domains**.
4. Create a Firestore database.
5. Configure appropriate Firebase API-key restrictions and Firestore security rules.

The current static frontend imports the modular Firebase SDK from Google's official browser CDN modules. **You do not need `npm install firebase` for the current frontend.** Running `npm install` installs the server dependencies declared in `package.json`, including `@gradio/client` and `firebase-admin`.

## 2. Hugging Face Space

The Gradio Space source lives in `huggingface/`; `.github/workflows/sync-to-huggingface.yml` syncs only this directory to `ErikrafT/erikraft-ai`, for deployment to the Hugging Face Space. FLUX generates pixels from either a typed prompt or the prompt returned by Qwythos after multimodal reference-image interpretation. The Qwythos and Cosmos GPU declarations are capped at 120 seconds because live ZeroGPU logs showed a 180-second declaration surfaced as a rejected 270-second reservation; FLUX rendering remains a separate 120-second GPU request. Actual inference can still fail if model loading, processing, memory, runtime, or provider quota exceeds available limits. Free and unlimited inference is not guaranteed.

The Space endpoint used by `@gradio/client` is `/generate_image`, with inputs in this order: prompt (string), width (integer), height (integer), steps (integer). Configure `HF_SPACE_ID=ErikrafT/erikraft-ai` in the Vercel project environment variables.

## 3. Limits and abuse prevention

- Requests without a valid Firebase ID token are rejected.
- Default quota: **10 generation requests per authenticated account per rolling hour**. Operators can set `GENERATION_MAX_PER_HOUR` to an integer from `1` to `20`; missing or invalid values use the safe default of `10`.
- The Vercel API reserves Firestore quota slots transactionally; concurrency/conflict handling needs live testing.
- Provider failures currently consume a reserved quota slot until the rolling window resets; a transaction-safe refund remains a follow-up.
- Account-based limits cannot fully prevent users from creating multiple accounts. Consider Firebase App Check and monitoring before public launch.
- Generated image URLs may be temporary. Avoid sending personal or confidential information in prompts.

## 4. Model compatibility and readiness

Review the model card and upstream FLUX.1-dev terms before commercial use; do not assume the model metadata alone settles licensing.

**End-to-end generation must be verified in production.** Confirm successful live tests against the current Space before claiming production readiness. The Space previously reported `Build error — Job timeout`; check the latest build/runtime logs and confirm a successful generation before claiming production readiness.


Email/password registration sends a Firebase verification email and signs the newly created account out until the address is verified. The generation API independently rejects password-provider tokens whose `email_verified` claim is not `true`. Firebase Authentication handles verification; no separate application database is required for that step.


## Model selector

The model selector exposes five task forms: **FLUX text → image**, **Qwythos image-to-image editing**, **Cosmos3 Nano text → video**, **Qwen3.8 text → text**, and **XTTS-v2 voice cloning → audio**. Cosmos and Qwen require the shared secret, feature-gate configuration, and sufficient Space runtime resources; selectable does not guarantee inference. The Vercel `/api/models` endpoint reports backend configuration. Qwythos requires a reference image; it interprets the image and instructions into a prompt, and FLUX makes a separate image-to-image request using the original reference as its source. The standalone Qwythos text-only assistant is not exposed as a separate task. Cosmos and Qwen remain guarded by backend/Space flags and runtime resource checks. Qwythos reference images are normalized in the browser and included in the `/api/generate` request; the Node.js reference handler uploads the image file to Gradio for Qwythos inference. Successful live end-to-end verification is still required. The Qwythos BF16 weights require substantial memory, so see [model compatibility](huggingface/MODEL_COMPATIBILITY.md).


### Experimental Qwythos image-editing mode

The UI accepts image files the browser can decode (original file up to 12 MB), converts the selected image to JPEG (up to 3 MiB), and uploads it with user instructions. The two model stages run as separate GPU requests: Qwythos multimodal interpretation (120-second declared duration) followed by FLUX image-to-image editing (120 seconds). The FLUX img2img stage defaults to strength `0.65` (set `QWYTHOS_IMG2IMG_STRENGTH` to a value from `0.45` to `0.85` to adjust it) and preserves the source aspect ratio. It passes the original reference image to the abliterated FLUX checkpoint rather than generating from text alone. Qwythos must prioritize requested changes and must not add blanket rules to keep clothing, pose, or background unchanged. The Qwythos duration was reduced to 120 seconds after live ZeroGPU logs showed a 180-second declaration rejected as a 270-second reservation. The image + instructions mode is still experimental; model architecture, processor compatibility, available RAM/VRAM, runtime, provider quotas, and Gradio payload handling may still cause failures. FLUX text-to-image remains available independently.

## Voice cloning (XTTS-v2)

The voice-cloning option accepts a browser-decodable reference audio file or browser recording (up to 12 MiB and 10–60 seconds) and text to synthesize. The browser converts the selected audio to mono 16 kHz PCM WAV, capped at 3 MiB, before sending it to the voice provider. Requests pass through `/api/generate`, retaining Firebase authentication and the per-account hourly quota. Whisper transcribes the reference sample and `franc-min` identifies its language; the backend then calls `Nymbo/Voice-Clone-Multilingual`, passing the detected language explicitly to multilingual XTTS-v2. The language comes from the reference audio, not the website locale, so Portuguese reference speech is synthesized as Portuguese even when the site's UI is English. Clear samples with at least 10 seconds of speech are recommended. Reference audio is sent to both Hugging Face Spaces for inference. Review the [Coqui XTTS-v2 license](https://huggingface.co/coqui/XTTS-v2/blob/main/LICENSE.txt) and the provider's terms before use. Outputs are temporary provider files and may expire.

## Experimental video and text models

The model selector supports five model workflows: **FLUX text→image**; **Qwythos + FLUX reference image + instructions→image**; **Cosmos3 Nano text→video**; **Qwen3.8 27B text assistant**; and **XTTS-v2 voice cloning→audio**. Cosmos and Qwen are exposed by the site only when the Vercel API reports the experimental API as configured. This does not prove the Space-side feature flags or available hardware are sufficient; runtime checks can still reject a request.

- **Cosmos3 Nano** (`DuoNeural/Cosmos3-Nano-Abliterated`) is a 15.2B-parameter video model. The integration limits requests to 16 frames at 256×256 and 12 steps, declares 120 seconds of GPU time, and refuses to load unless the runtime reports at least 48 GiB total / 40 GiB free VRAM and at least 36 GiB free disk on a cold download. The upstream model reports roughly 48 GB VRAM needs, so these are guardrails, not a guarantee; do not enable on unknown or undersized free GPU hardware.
- **Qwen3.8 27B GGUF** (`0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF`) uses the roughly 9.1 GB `RVN-IQ2_XS.gguf` quantization through `llama-cpp-python==0.3.36` with `n_gpu_layers=0` (CPU only). The Space installs the prebuilt Linux CPU wheel instead of compiling `llama.cpp` at build time. It checks for about 12 GiB free RAM and 11 GiB free disk on a cold download. It should avoid using CUDA VRAM but can be slow and output quality is lower than larger quantizations.
- Both are third-party checkpoints/fine-tunes. ErikrafT did not create or train the weights. Labels like “uncensored”/“abliterated” indicate model publishers' positioning, not a guarantee that output is completely unfiltered.
- No successful live Space build, GPU inference, or CPU inference test is confirmed by this change. The public Space page currently reports **Running on Zero**. That status confirms the app process is running, not that every model can complete inference. Test each mode on the live runtime and inspect its logs before claiming production readiness.

The GitHub Actions workflow syncs the `huggingface/` directory to the Space when changes reach `main`. Opening this PR does not deploy the changes to the running Space; merging it and a successful sync workflow are required.


### Protecting experimental Space endpoints

The public Gradio Space exposes the model API schema, so Cosmos and Qwen additionally require the server-side `HF_SPACE_API_SECRET`. Set the same random secret (at least 32 characters) in the Hugging Face Space secrets and as a Vercel server-side environment variable. The server-side caller must pass it only as a hidden Gradio input; the Space validates it using constant-time comparison and fails closed when the secret is missing or invalid. Do not put it in any `NEXT_PUBLIC_*`, `VITE_*`, HTML, JavaScript bundle, or public repository file. The Space source defaults both feature flags to enabled, but each route fails closed unless the same secret is configured in the Space and Vercel. Set the corresponding flag explicitly to `false` if you need to disable a route.


## Agent skills for development agents

The project can install Pedro Nauck's 88-skill collection for the **development agent working on the codebase**. Run `bash scripts/install-agent-skills.sh` to use the upstream `skills` CLI. This installs the original skill packages and their supporting references from `https://github.com/pedronauck/skills`; the source is not copied into this repository.

These are not model prompts. The FLUX, Qwythos, Cosmos, and Qwen inference paths do not load or receive development-agent skills.


## User history (MongoDB Atlas)

The authenticated `/api/history` endpoint stores per-user generated image/video metadata and text conversations in `ErikrafTAI.user_history`. Records are scoped to the verified Firebase UID. Entries may include prompts, model/type, timestamp, text responses/messages and a provider-returned media URL. **Media bytes are not copied into MongoDB**: URLs may expire; deleting an item deletes the MongoDB record only, not provider-side files or logs.

Configure these server-side Vercel environment variables (never expose them in frontend code):

- `MONGODB_URI` — Secret; MongoDB Atlas connection string for a least-privilege database user.
- `MONGODB_DATABASE` — Configuration, optional; defaults to `ErikrafTAI`.
- Keep `FIREBASE_SERVICE_ACCOUNT_JSON` as a server-side secret to verify Firebase ID tokens.

MongoDB creates the database and collection when the configured history API first creates its index (for example, on the first successful history request). Restrict Atlas network access and grant the database user read/write access only to this database. MongoDB Atlas MCP access must be enabled for the Atlas organization before resources can be provisioned or inspected directly through the connector.

### MongoDB Atlas setup from scratch

1. In Atlas, open the project containing your cluster (or create a project and a Free cluster if eligible).
2. Under **Database Access**, create a dedicated database user. Grant **readWrite** only on the `ErikrafTAI` database; do not use your Atlas account password as the database password.
3. Under **Network Access**, allow only the required outbound IP addresses for your deployment when practical. Vercel Functions may use changing egress IPs unless you have a product/configuration that provides fixed egress. Avoid leaving `0.0.0.0/0` open permanently; if temporarily used for setup, remove it and implement an appropriate restricted network path before production.
4. Click **Connect → Drivers → Node.js**, copy the SRV connection string, and replace the username/password placeholders. URL-encode special characters in the database password.
5. In Vercel → Project → Settings → Environment Variables, add `MONGODB_URI` as a **Secret** for Production and Preview as needed. Add `MONGODB_DATABASE=ErikrafTAI` as a Config variable if you want to set the database name explicitly.
6. Redeploy after saving the variables. The first authenticated request to `/api/history` creates the `user_history` collection and its index automatically.
7. Sign in at `https://ai.erikraft.com/`, generate an image/text/video result, refresh the history, and delete a test entry. Verify the record appears and disappears in Atlas.

**Storage boundary:** this implementation stores prompts, messages, metadata, and provider-returned media URLs. It does not upload arbitrary files to MongoDB or copy the binary bytes of images/videos into the database. URLs may expire, and the delete button removes the history document only; it cannot erase copies or logs retained by Hugging Face or other providers. For durable uploads of arbitrary files, add an object-storage service (for example, a properly configured private bucket) and store only its object key/metadata in MongoDB.



### Free-tier generation quota configuration

- `GENERATION_MAX_PER_HOUR` is an optional server-side Vercel environment variable. Set it to an integer from `1` to `20`; if missing, invalid, or outside that range, the API uses the safe default of `10` requests per account per rolling hour.
- The quota is keyed by Firebase UID, not by email string. Gmail aliases or creating additional email accounts are not a supported way to multiply quota; separate accounts may still be created, so use Firebase App Check and abuse monitoring for stronger controls.
- This is **not unlimited generation**. Vercel Hobby execution limits, Hugging Face ZeroGPU/provider quotas, queue availability, model memory, and inference time remain independent hard constraints. Raising the website quota does not increase those platform limits or guarantee every request succeeds.
- Failed inference reservations are refunded where the existing transaction-safe refund path can confirm the same quota window; provider-side GPU work may continue after a client/server timeout, so avoid rapid retries.


## Multilingual model inputs

All model routes accept the prompt as entered, including non-English text; FLUX and Cosmos receive the original prompt without silent translation, although quality varies by model and language. Qwythos image-edit instructions and Qwen chatbot responses are asked to follow the language of the user's prompt rather than the website UI locale. Voice cloning selects the language of the requested speech text when detectable, falling back to the reference-audio language for very short text. The voice model has a finite supported-language list, so this does not imply support for every language in speech synthesis.


## Custom MCP servers for Qwen / Servidores MCP personalizados para o Qwen

### Português (Brasil)

O chatbot experimental Qwen pode usar ferramentas de servidores MCP personalizados configurados pelo usuário. No seletor de modelos, escolha **Qwen3.8 27B — Chatbot (experimental)** e abra **Servidores MCP personalizados**.

- A configuração é vinculada ao UID da conta autenticada e armazenada na coleção MongoDB Atlas `qwen_mcp_servers`; cada conta pode salvar até 10 servidores.
- O transporte suportado é **MCP Streamable HTTP** em URL HTTPS pública. O usuário precisa criar e manter o túnel ativo e fornecer sua URL HTTPS pública; o site não cria nem gerencia túneis. Servidores `stdio`, hosts locais e endpoints HTTP simples não são aceitos.
- Os modos de autenticação são **OAuth (token de acesso)**, **sem autenticação** e **OAuth ou sem autenticação**. Nesta versão, o token OAuth é fornecido manualmente; a descoberta de metadados OAuth e o fluxo automático de autorização/redirecionamento ainda não estão implementados.
- Tokens são criptografados com AES-256-GCM antes de serem gravados no MongoDB. Configure `MCP_ENCRYPTION_KEY` como **Secret** no Vercel: um segredo aleatório de 32 bytes, em hexadecimal (64 caracteres) ou Base64. Exemplo para gerar uma chave hexadecimal: `openssl rand -hex 32`. Mantenha-a estável; a rotação da chave torna tokens existentes ilegíveis até serem configurados novamente.
- Por padrão, só são disponibilizadas ferramentas que o servidor MCP marca explicitamente com `annotations.readOnlyHint: true`. Marque **Permitir ferramentas que criam, editam ou excluem dados externos** somente se aceitar o risco de ações externas.
- URLs são verificadas para HTTPS, nomes reservados, endereços IP privados e DNS antes de salvar e novamente durante as chamadas; redirecionamentos são bloqueados. Essas medidas reduzem SSRF, mas não substituem a confiança no servidor.
- O Qwen recebe até seis definições de ferramentas por solicitação para preservar o contexto, pode solicitar chamadas e recebe resultados limitados para gerar a resposta final. Há limites por solicitação para etapas e quantidade de chamadas; a inferência continua limitada pela RAM, CPU, timeout e disponibilidade do Hugging Face.
- Não conecte servidores que não controla ou em que não confia. Saídas das ferramentas são tratadas como dados não confiáveis, mas o modelo pode ainda interpretar resultados de forma incorreta.

### English

The experimental Qwen chatbot can use custom MCP server tools configured by the signed-in user. Select **Qwen3.8 27B — Chatbot (experimental)** and open **Custom MCP servers**.

- Configurations are scoped to the authenticated account UID and stored in the MongoDB Atlas `qwen_mcp_servers` collection; each account can save up to 10 servers.
- Supported transport is **MCP Streamable HTTP** at a public HTTPS URL. The user must create and maintain the tunnel and provide its public HTTPS URL; this site does not create or manage tunnels. `stdio`, local hosts, and plain HTTP endpoints are not supported.
- Authentication modes are **OAuth (access token)**, **no authentication**, and **OAuth or no authentication**. In this version, OAuth tokens are pasted manually; OAuth metadata discovery and the automatic authorization/redirect flow are not implemented yet.
- Tokens are encrypted with AES-256-GCM before being stored in MongoDB. Configure `MCP_ENCRYPTION_KEY` as a Vercel **Secret**: a random 32-byte key encoded as hexadecimal (64 characters) or Base64. Generate a hex key with `openssl rand -hex 32`. Keep it stable; rotating the key makes existing tokens unreadable until they are configured again.
- By default, only tools explicitly marked by the MCP server with `annotations.readOnlyHint: true` are exposed. Enable **Allow tools that create, edit, or delete external data** only if you accept the risk of external actions.
- URLs are checked for HTTPS, reserved names, private IP addresses, and DNS before saving and again during calls; redirects are blocked. These controls reduce SSRF risk but do not replace trusting the server.
- Qwen receives up to six tool definitions per request to preserve context, can request tool calls, and receives bounded results to produce a final answer. Per-request tool-call and step limits apply; inference remains subject to RAM, CPU, timeout, and Hugging Face availability.
- Do not connect servers you do not control or trust. Tool output is treated as untrusted data, but the model may still misinterpret results.
