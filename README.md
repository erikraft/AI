# ErikrafT AI

An open-source AI model hub with a responsive dark interface and Portuguese (Brazil)/English UI. **`aoxo/flux.1dev-abliterated`** generates images from text. In the experimental **image → text → image** workflow, the user uploads an image and instructions; the browser normalizes the image to JPEG, and the Worker uploads the actual file to **`fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated`** for interpretation. FLUX then renders the resulting prompt in a separate request. Qwythos does not directly render the final image pixels. The Cloudflare Worker in this branch routes FLUX text-to-image, Qwythos image + instructions → text interpretation → FLUX image, Cosmos text-to-video, and Qwen text generation through the Hugging Face Space after Firebase verification and Firestore quota checks. Cosmos and Qwen also depend on Space-side feature flags and runtime resources.

- **Frontend:** static HTML/CSS/JavaScript hosted with Cloudflare Workers + Static Assets.
- **Authentication:** Firebase Authentication with Google, GitHub, and email/password; email/password accounts must verify their address before generating images.
- **Generation:** Hugging Face Gradio Space routing the selected image, video, or text model.
- **Abuse prevention target:** Firebase ID-token verification and a Firestore-backed limit of five generation requests per account per hour; the Cloudflare API must implement these checks before generation is enabled.
- **Cost goal:** use free tiers where possible. Provider quotas, availability, model compatibility, and GPU access are not guaranteed.

## Architecture

Cloudflare Workers + Static Assets serves the website. The Hugging Face Space hosts the AI weights and inference. The Worker verifies Firebase ID tokens, reserves per-account quota through Firestore, and routes selected model calls to Gradio. The Node-oriented handler under `api/generate.js` remains a reference implementation and is not automatically routed by Cloudflare Workers.

```text
Browser
  ├── Cloudflare Worker + Static Assets (website)
  └── POST /api/generate + Firebase ID token
          └── cloudflare/worker.js → Gradio endpoints for image, video, and text

Current generation flow through the Cloudflare Worker:
  Firebase ID-token validation
    → transactional Firestore usage limit
    → Hugging Face Gradio Space
         ├── FLUX: prompt → generated image
         └── Qwythos: uploaded image + instructions → interpreted prompt
                    → separate FLUX request → final image
```

In Qwythos mode, the browser decodes the selected image and converts it to JPEG (maximum 3 MiB) before sending it as `referenceImage` to `/api/generate`. The Worker uploads the file to Gradio so Qwythos receives the actual image and instructions, returns an interpreted prompt, and then calls FLUX separately for the final image. This integration still requires a successful live end-to-end test.

The Qwythos picker supports touch-friendly camera capture, the device photo gallery, and a general file chooser on mobile and desktop. The same image can also be dragged onto the drop zone on browsers that support file drag-and-drop (including supported iPad/iPhone file-drag workflows). A preview, removal control, MIME/decode validation, and size limits are provided in Portuguese and English. Camera capture depends on the browser/device and may not be exposed by every platform; the gallery/file picker remains the fallback. The picker is intentionally handled in the website frontend, so these UI changes do not require a separate Hugging Face Space deployment.

## Repository layout

- `index.html` — responsive bilingual AI model hub and sign-in modal.
- `assets/css/styles.css` — dark, blue-accented styling.
- `assets/js/app.js` — Firebase sign-in, prompt form, API request, result preview, and download.
- `assets/js/firebase-config.js` — Firebase Web app configuration used by the browser.
- `assets/js/firebase-config.js.example` — template for reference.
- `api/generate.js` — Node.js reference handler for authentication, quota enforcement, and Gradio calls; the Cloudflare Worker does not invoke this file automatically.
- `huggingface/app.py`, `huggingface/requirements.txt`, and `huggingface/README.md` — Gradio Space entry point, dependencies, and Space metadata. The GitHub Actions workflow syncs this directory to the Hugging Face Space when changes reach `main`.

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

The Gradio Space source lives in `huggingface/`; `.github/workflows/sync-to-huggingface.yml` syncs only this directory to `ErikrafT/erikraft-ai`, for deployment to the Hugging Face Space. FLUX generates pixels from either a typed prompt or the prompt returned by Qwythos after multimodal reference-image interpretation. The Qwythos decorator is capped at 180 seconds because the previously configured 300 seconds was surfaced by ZeroGPU as a rejected 450-second reservation; FLUX rendering remains a separate 120-second GPU request. Actual inference can still fail if model loading, processing, memory, runtime, or provider quota exceeds available limits. Free and unlimited inference is not guaranteed.

The Space endpoint used by `@gradio/client` is `/generate_image`, with inputs in this order: prompt (string), width (integer), height (integer), steps (integer). If the Space is hosted in another repository, set `HF_SPACE_ID` to its `owner/space-name` and ensure the app exposes the same endpoint and inputs.

## 3. Cloudflare deployment and API readiness

The static frontend is configured for Cloudflare Workers + Static Assets in the root-level `wrangler.jsonc`, with `cloudflare/worker.js` as its entry point.

**End-to-end verification still required:** the Worker now contains a Worker-compatible API for Firebase identity verification, Firestore quota reservation, Gradio image upload, and the FLUX, Qwythos, Cosmos, and Qwen endpoints. It has not yet been validated with successful live requests from the production site. Test authentication, quota concurrency, video/text output formats, static asset routing, and Space runtime flags before production cutover.

For a temporary preview, use Cloudflare Workers Builds or run Wrangler from the repository root:

```bash
npm install
npx wrangler preview
```

Do not switch production traffic until preview tests pass. Validate Firebase ID tokens, Firestore quota concurrency, Gradio upload/event-stream formats for all enabled models, provider timeouts, and authenticated-response caching. Provider failures still consume the reserved quota slot in this version; a transaction-safe refund is a remaining task.

The Worker uses `FIREBASE_SERVICE_ACCOUNT_JSON` for Firebase/Firestore, `HF_SPACE_ID=ErikrafT/erikraft-ai` to select the Space, optional `HF_TOKEN` if authenticated Space access is required, and `HF_SPACE_API_SECRET` as a server-side secret for Cosmos/Qwen.

The Worker requires a Cloudflare **Secret** named `FIREBASE_SERVICE_ACCOUNT_JSON` containing the full JSON contents of a Firebase service-account key for project `erikraft-account`. Set it in **Workers & Pages → erikraft-ai → Settings → Variables and Secrets** for every environment that serves the site (Production and Preview, if used), then deploy a new version. Grant that service account the minimum Firestore role needed to read/write the `generation_limits` collection; never commit the JSON or paste it into frontend configuration. After deploying, open `/api/health`: it returns configuration booleans only, never the secret. Check `firebaseServiceAccountConfigured`, `firebaseServiceAccountJsonValid`, and `firebaseProjectMatches` before retrying generation. The Space exposes guarded experimental routes controlled by `ENABLE_COSMOS_VIDEO` and `ENABLE_QWEN_TEXT`. Both default to enabled in the Space source, but their handlers fail closed without `HF_SPACE_API_SECRET` and check runtime resources before loading. Set either variable to `false` in Space settings to disable that route. Do not expose secrets in HTML, browser JavaScript, `VITE_*` values, or the repository.

The GitHub Actions workflow syncs `huggingface/` to the live Space only after changes reach `main` and the sync succeeds. An open PR does not update the running Space.

## 4. Limits and abuse prevention

- Requests without a valid Firebase ID token are rejected.
- Default quota: **5 generation requests per authenticated account per rolling hour**.
- The Worker reserves Firestore quota slots transactionally; concurrency/conflict handling needs live testing.
- Provider failures currently consume a reserved quota slot until the rolling window resets; a transaction-safe refund remains a follow-up.
- Account-based limits cannot fully prevent users from creating multiple accounts. Consider Firebase App Check and monitoring before public launch.
- Generated image URLs may be temporary. Avoid sending personal or confidential information in prompts.

## 5. Model compatibility and readiness

Review the model card and upstream FLUX.1-dev terms before commercial use; do not assume the model metadata alone settles licensing.

**End-to-end generation is not yet verified in production.** The Worker code in PR #34 implements the model routes, but it still needs successful live tests against the current Space. The Space previously reported `Build error — Job timeout`; check the latest build/runtime logs and confirm a successful generation before claiming production readiness.


Email/password registration sends a Firebase verification email and signs the newly created account out until the address is verified. The generation API independently rejects password-provider tokens whose `email_verified` claim is not `true`. Firebase Authentication handles verification; no separate application database is required for that step.


## Model selector

The model selector always lets users inspect all four task forms: **FLUX text → image**, **Qwythos image → text → image**, **Cosmos3 Nano text → video**, and **Qwen3.8 text → text**. Cosmos and Qwen remain guarded by Worker secret checks, Space-side feature flags, and runtime resource checks; selectable does not mean the backend is ready. `/api/models` reports whether the Worker has enough configuration to attempt those experimental routes. Qwythos requires a reference image; it interprets the image and instructions into a prompt, and FLUX makes a separate request to render the result. The standalone Qwythos text-only assistant is not exposed as a separate task. Cosmos and Qwen remain guarded by backend/Space flags and runtime resource checks. Qwythos reference images are normalized in the browser and included in the `/api/generate` request; the Node.js reference handler uploads the image file to Gradio for Qwythos inference. The Cloudflare Worker now implements this path; successful live end-to-end verification is still required. The Qwythos BF16 weights require substantial memory, so see [model compatibility](huggingface/MODEL_COMPATIBILITY.md).


### Experimental image → text → image mode

The UI accepts image files the browser can decode (original file up to 12 MB), converts the selected image to JPEG (up to 3 MiB), and uploads it with user instructions. The two model stages run as separate GPU requests: Qwythos multimodal interpretation (180-second declared duration) followed by FLUX rendering (120 seconds, unchanged). The Qwythos duration is deliberately lower because the former 300-second declaration was rejected as a 450-second reservation by ZeroGPU. The image + instructions mode is still experimental; model architecture, processor compatibility, available RAM/VRAM, runtime, provider quotas, and Gradio payload handling may still cause failures. FLUX text-to-image remains available independently.

## Experimental video and text models

The model selector supports four task types: **FLUX text→image**; **Qwythos + FLUX reference image + instructions→image**; **Cosmos3 Nano text→video**; and **Qwen3.8 27B text assistant**. Cosmos and Qwen are exposed by the site only when the Worker reports the experimental API as configured. This does not prove the Space-side feature flags or available hardware are sufficient; runtime checks can still reject a request. The Worker implements `/api/models`, but it cannot independently confirm private Space flags.

- **Cosmos3 Nano** (`DuoNeural/Cosmos3-Nano-Abliterated`) is a 15.2B-parameter video model. The integration limits requests to 16 frames at 256×256 and 12 steps, declares 180 seconds of GPU time, and refuses to load unless the runtime reports at least 48 GiB total / 40 GiB free VRAM and at least 36 GiB free disk on a cold download. The upstream model reports roughly 48 GB VRAM needs, so these are guardrails, not a guarantee; do not enable on unknown or undersized free GPU hardware.
- **Qwen3.8 27B GGUF** (`0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF`) uses the roughly 9.1 GB `RVN-IQ2_XS.gguf` quantization through `llama-cpp-python` with `n_gpu_layers=0` (CPU only). It checks for about 12 GiB free RAM and 11 GiB free disk on a cold download. It should avoid using CUDA VRAM but can be slow and output quality is lower than larger quantizations.
- Both are third-party checkpoints/fine-tunes. ErikrafT did not create or train the weights. Labels like “uncensored”/“abliterated” indicate model publishers' positioning, not a guarantee that output is completely unfiltered.
- No successful live Space build, GPU inference, or CPU inference test is confirmed by this change. The public Space page currently reports **Running on Zero**. That status confirms the app process is running, not that every model can complete inference. Test each mode on the live runtime and inspect its logs before claiming production readiness.

The GitHub Actions workflow syncs the `huggingface/` directory to the Space when changes reach `main`. Opening this PR does not deploy the changes to the running Space; merging it and a successful sync workflow are required.


### Protecting experimental Space endpoints

The public Gradio Space exposes the model API schema, so Cosmos and Qwen additionally require the server-side `HF_SPACE_API_SECRET`. Set the same random secret (at least 32 characters) in the Hugging Face Space secrets and in the Cloudflare server-side environment. The server-side caller must pass it only as a hidden Gradio input; the Space validates it using constant-time comparison and fails closed when the secret is missing or invalid. Do not put it in any `NEXT_PUBLIC_*`, `VITE_*`, HTML, JavaScript bundle, or public repository file. The Space source defaults both feature flags to enabled, but each route fails closed unless the same secret is configured in the Space and Cloudflare Worker. Set the corresponding flag explicitly to `false` if you need to disable a route.
