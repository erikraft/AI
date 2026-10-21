# ErikrafT AI

An AI image studio with a responsive dark interface and Portuguese/English UI. **`aoxo/flux.1dev-abliterated`** generates images from text. The experimental **image → text → image** workflow uses **`fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated`** to interpret an uploaded reference image and instructions and return a text prompt; FLUX then renders the final pixels in a separate request. Qwythos does not directly render the final image pixels. The studio also supports an optional local logo overlay: the selected PNG/JPG/WebP remains in the browser and is never sent to the model; when possible, it is composited into the downloaded PNG.

- **Frontend:** static HTML/CSS/JavaScript, deployable on Vercel.
- **Authentication:** Firebase Authentication with Google, GitHub, and email/password; email/password accounts must verify their address before generating images.
- **Generation:** Hugging Face Gradio Space running the selected model.
- **Abuse prevention:** Firebase ID-token verification and a Firestore-backed limit of five generation requests per account per hour.
- **Cost goal:** use free tiers where possible. Provider quotas, availability, model compatibility, and GPU access are not guaranteed.

## Architecture

```text
Browser
  ├── Firebase Authentication (Google / GitHub / verified email-password)
  └── POST /api/generate + Firebase ID token
          ├── Verify token with Firebase Admin
          ├── Reserve a per-user quota slot in Firestore
          └── @gradio/client → Hugging Face Space
                 ├── FLUX-only: text prompt → generated image
                 └── Qwythos mode: reference image + instructions → text prompt
                         └── separate FLUX request → final image
  Optional logo overlay is applied in-browser and is never uploaded to inference.
```

Vercel serves the frontend and API proxy. It does **not** load PyTorch or FLUX weights; the model needs compatible GPU infrastructure.

## Repository layout

- `index.html` — responsive image studio and sign-in modal.
- `assets/css/styles.css` — dark, blue-accented styling.
- `assets/js/app.js` — Firebase sign-in, prompt form, API request, result preview, and download.
- `assets/js/firebase-config.js` — Firebase Web app configuration used by the browser.
- `assets/js/firebase-config.js.example` — template for reference.
- `api/generate.js` — authenticated generation endpoint and Firestore quota enforcement.
- `huggingface/app.py`, `huggingface/requirements.txt`, and `huggingface/README.md` — Gradio Space entry point, dependencies, and Space metadata. The GitHub Actions workflow syncs only this directory to Hugging Face, keeping Python entrypoint files out of Vercel's project root.
- `vercel.json` — static-site response headers.

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

The Gradio Space source lives in `huggingface/`; `.github/workflows/sync-to-huggingface.yml` syncs only this directory to `ErikrafT/erikraft-ai`, keeping the Python entrypoint out of Vercel's project root. FLUX generates pixels from either a typed prompt or the prompt returned by Qwythos after multimodal reference-image interpretation. The Qwythos decorator is capped at 180 seconds because the previously configured 300 seconds was surfaced by ZeroGPU as a rejected 450-second reservation; FLUX rendering remains a separate 120-second GPU request. Actual inference can still fail if model loading, processing, memory, runtime, or provider quota exceeds available limits. Free and unlimited inference is not guaranteed.

The Space endpoint used by `@gradio/client` is `/generate_image`, with inputs in this order: prompt (string), width (integer), height (integer), steps (integer). If the Space is hosted in another repository, set `HF_SPACE_ID` to its `owner/space-name` and ensure the app exposes the same endpoint and inputs.

## 3. Deploy to Vercel

Import the repository into Vercel. The root is a static site and `api/generate.js` is a Node.js serverless function. Under **Project → Settings → Environment Variables**, configure:

| Variable | Required | Description |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | Full Firebase Admin service-account JSON; store only as a server secret |
| `HF_SPACE_ID` | Yes | Hugging Face Space ID in `owner/space-name` format |
| `HF_TOKEN` | If private/gated access is needed | Hugging Face access token; keep server-side |
| `HF_SPACE_API_SECRET` | Required before enabling Cosmos or Qwen | Generate a random secret of at least 32 characters and set the exact same value as a Space secret and a Vercel server-side environment variable; never expose it to frontend code |
| `ENABLE_COSMOS_VIDEO` | Optional, **default off** | Set to `true` in both Vercel and the Space only after verifying GPU VRAM and disk capacity |
| `ENABLE_QWEN_TEXT` | Optional, **default off** | Set to `true` in both Vercel and the Space only after verifying CPU RAM, disk, and llama.cpp installation |

Use a service account with only the permissions needed for the API. Redeploy after changing environment variables. Never expose service-account JSON or tokens through frontend variables.

Install the server dependencies with:

```bash
npm install
```

No frontend build step is required for the static HTML app.

## 4. Limits and abuse prevention

- Requests without a valid Firebase ID token are rejected.
- Default quota: **5 generation requests per authenticated account per rolling hour**.
- Firestore transactions reserve quota slots across concurrent serverless invocations.
- A slot is reserved before contacting the model provider, so failed provider calls may consume a slot.
- Account-based limits cannot fully prevent users from creating multiple accounts. Consider Firebase App Check and monitoring before public launch.
- Generated image URLs may be temporary. Avoid sending personal or confidential information in prompts.

## 5. Model compatibility and readiness

Review the model card and upstream FLUX.1-dev terms before commercial use; do not assume the model metadata alone settles licensing.

**The code is not a verified production deployment.** The site is not ready for end-to-end use until Firebase Authentication and Firestore, a compatible Hugging Face Space, and Vercel environment variables are configured and an actual image generation has been tested.


Email/password registration sends a Firebase verification email and signs the newly created account out until the address is verified. The generation API independently rejects password-provider tokens whose `email_verified` claim is not `true`. Firebase Authentication handles verification; no separate application database is required for that step.


## Model selector

The model selector switches the task-specific form copy and options for **FLUX text → image**, **Qwythos image → text → image** (experimental; reference image + instructions → interpreted text prompt → separate FLUX render), **Cosmos3 Nano text → video**, and **Qwen3.8 text → text** when each experimental option is enabled by `/api/models`. Qwythos requires a reference image; it interprets the image and instructions into a prompt, and FLUX makes a separate request to render the result. The standalone Qwythos text-only assistant is not exposed as a separate task. Cosmos and Qwen remain guarded by backend/Space flags and runtime resource checks. An optional logo watermark is read and composed locally in the browser and is never added to the inference payload. The Qwythos BF16 weights require substantial memory, so see [model compatibility](huggingface/MODEL_COMPATIBILITY.md).


### Experimental image + text mode

The UI supports uploading a PNG/JPEG/WebP reference image (up to 3 MB) with user instructions. The two model stages run as separate GPU requests: Qwythos multimodal interpretation (180-second declared duration) followed by FLUX rendering (120 seconds, unchanged). The Qwythos duration is deliberately lower because the former 300-second declaration was rejected as a 450-second reservation by ZeroGPU. The image + instructions mode is still experimental; model architecture, processor compatibility, available RAM/VRAM, runtime, provider quotas, and Gradio payload handling may still cause failures. FLUX text-to-image remains available independently.

## Experimental video and text models

The model selector supports four task types: **FLUX text→image**; **Qwythos + FLUX reference image + instructions→image**; **Cosmos3 Nano text→video**; and **Qwen3.8 27B text assistant**. The latter two are deliberately **disabled by default** and appear selectable only when `/api/models` sees the relevant Vercel environment flag. The Space independently checks its own flag.

- **Cosmos3 Nano** (`DuoNeural/Cosmos3-Nano-Abliterated`) is a 15.2B-parameter video model. The integration limits requests to 16 frames at 256×256 and 12 steps, declares 180 seconds of GPU time, and refuses to load unless the runtime reports at least 48 GiB total / 40 GiB free VRAM and at least 36 GiB free disk on a cold download. The upstream model reports roughly 48 GB VRAM needs, so these are guardrails, not a guarantee; do not enable on unknown or undersized free GPU hardware.
- **Qwen3.8 27B GGUF** (`0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF`) uses the roughly 9.1 GB `RVN-IQ2_XS.gguf` quantization through `llama-cpp-python` with `n_gpu_layers=0` (CPU only). It checks for about 12 GiB free RAM and 11 GiB free disk on a cold download. It should avoid using CUDA VRAM but can be slow and output quality is lower than larger quantizations.
- Both are third-party checkpoints/fine-tunes. ErikrafT did not create or train the weights. Labels like “uncensored”/“abliterated” indicate model publishers' positioning, not a guarantee that output is completely unfiltered.
- No live Space build, GPU inference, or CPU inference test has been completed as part of this change. Review build logs and test each mode on the actual runtime before enabling its Vercel and Space flags.

The GitHub Actions workflow syncs the `huggingface/` directory to the Space when changes reach `main`. Opening this PR does not deploy the changes to the running Space; merging it and a successful sync workflow are required.


### Protecting experimental Space endpoints

The public Gradio Space exposes the model API schema, so Cosmos and Qwen additionally require the server-side `HF_SPACE_API_SECRET`. Set the same random secret (at least 32 characters) in the Hugging Face Space secrets and in Vercel's server-side environment variables. Vercel passes it only as a hidden Gradio input; the Space validates it using constant-time comparison and fails closed when the secret is missing or invalid. Do not put it in any `NEXT_PUBLIC_*`, `VITE_*`, HTML, JavaScript bundle, or public repository file. Keep `ENABLE_COSMOS_VIDEO` and `ENABLE_QWEN_TEXT` disabled until the secret is configured in both places.
