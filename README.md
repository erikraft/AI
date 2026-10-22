# ErikrafT AI

ErikrafT AI is an open-source AI model hub with a responsive dark interface and Portuguese (Brazil)/English UI. This repository supports **Vercel static hosting + Node.js Functions** as well as a separate Cloudflare Workers deployment. **`aoxo/flux.1dev-abliterated`** generates images from text. In the experimental **image → text → image** workflow, Qwythos (`fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated`) interprets a reference image and instructions; FLUX then renders the result in a separate request. Cosmos (`DuoNeural/Cosmos3-Nano-Abliterated`) generates video and Qwen (`0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF`) generates text. All four model identifiers are preserved. Both backend implementations validate Firebase identity and per-account Firestore quotas before their Hugging Face calls. Provider capacity, quotas, cold starts, and successful inference are not guaranteed.

- **Frontend:** static HTML/CSS/JavaScript on Vercel or Cloudflare Workers + Static Assets.
- **Authentication:** Firebase Authentication with Google, GitHub, and email/password; email/password accounts must verify their address before generating images.
- **Generation:** Hugging Face Gradio Space routing the selected image, video, or text model.
- **Abuse prevention:** Firebase ID-token verification, verified-email enforcement for password accounts, and a Firestore-backed limit of five generations per account per hour in both API implementations.
- **Cost goal:** use free tiers where possible. Provider quotas, availability, model compatibility, and GPU access are not guaranteed.

## Architecture

For Vercel, the root HTML/CSS/JavaScript files are served as static assets and `api/generate.js`, `api/models.js`, and `api/health.js` are Node.js Functions. The Vercel API verifies Firebase ID tokens, enforces the account quota in Firestore, and calls the Hugging Face Gradio Space. The separate Cloudflare deployment uses `cloudflare/worker.js` for its API; Cloudflare does not automatically run the files in `api/`. Keep the two deployment paths conceptually separate, and configure environment variables independently in each provider.

```text
Vercel deployment
Browser → static frontend → /api/generate + Firebase ID token
                              ├── /api/models (runtime availability)
                              ├── /api/health (configuration diagnostics)
                              └── api/generate.js → Firebase Auth + Firestore → Hugging Face Space

Cloudflare deployment (alternative)
Browser → Cloudflare Worker + Static Assets → Firebase Auth + Firestore → Hugging Face Space
```

In Qwythos mode, the browser decodes the selected image and converts it to JPEG (maximum 3 MiB) before sending it as `referenceImage` to `/api/generate`. The Worker uploads the file to Gradio so Qwythos receives the actual image and instructions, returns an interpreted prompt, and then calls FLUX separately for the final image. This integration still requires a successful live end-to-end test.

The Qwythos picker supports touch-friendly camera capture, the device photo gallery, and a general file chooser on mobile and desktop. The same image can also be dragged onto the drop zone on browsers that support file drag-and-drop (including supported iPad/iPhone file-drag workflows). A preview, removal control, MIME/decode validation, and size limits are provided in Portuguese and English. Camera capture depends on the browser/device and may not be exposed by every platform; the gallery/file picker remains the fallback. The picker is intentionally handled in the website frontend, so these UI changes do not require a separate Hugging Face Space deployment.

## Repository layout

- `index.html` — responsive bilingual AI model hub and sign-in modal.
- `assets/css/styles.css` — dark, blue-accented styling.
- `assets/js/app.js` — Firebase sign-in, prompt form, API request, result preview, and download.
- `assets/js/firebase-config.js` — Firebase Web app configuration used by the browser.
- `assets/js/firebase-config.js.example` — template for reference.
- `api/generate.js` — Vercel Node.js Function for authentication, quota enforcement, and Gradio calls; the separate Cloudflare Worker does not invoke this file automatically.
- `api/models.js` and `api/health.js` — Vercel model-availability and configuration-diagnostic endpoints.
- `huggingface/app.py`, `huggingface/requirements.txt`, and `huggingface/README.md` — Gradio Space entry point, dependencies, and Space metadata. The GitHub Actions workflow syncs this directory to the Hugging Face Space when changes reach `main`.

## Vercel deployment

The repository is laid out for Vercel's zero-configuration static hosting and Node.js Functions: no framework build step is required. `vercel.json` restores clean URLs/security headers, enables Fluid Compute, and sets `api/generate.js` to the Hobby maximum of **300 seconds**. `.vercelignore` keeps the Cloudflare/Hugging Face source folders and repository-only files out of public deployment assets; the GitHub repository and Hugging Face sync workflow still retain them.

### Vercel environment variables

Configure these in **Vercel → Project → Settings → Environment Variables** for Production and Preview as appropriate:

| Name | Type | Purpose |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Sensitive/Secret | Full Firebase service-account JSON for `erikraft-account`; used only by the Node.js API |
| `HF_SPACE_ID` | Plain | `ErikrafT/erikraft-ai` |
| `HF_TOKEN` | Sensitive/Secret, optional | Only if the Hugging Face Space requires authenticated access |
| `HF_SPACE_API_SECRET` | Sensitive/Secret | Same random secret (at least 32 characters) as in Hugging Face Space Settings; required for Cosmos/Qwen |
| `ENABLE_COSMOS_VIDEO` | Plain, optional | Defaults to enabled; set explicitly to `false` only to disable video |
| `ENABLE_QWEN_TEXT` | Plain, optional | Defaults to enabled; set explicitly to `false` only to disable text inference |

Never commit actual values from the first, third, or fourth variables. `.env.example` contains placeholders only. The public Firebase **Web** configuration in `assets/js/firebase-config.js` is separate from the server-side Firebase service account.

After assigning the Vercel deployment domain, add that exact domain under **Firebase Console → Authentication → Settings → Authorized domains** so Google/GitHub/email authentication can work from Vercel. Do the same for any specific Preview hostname on which you plan to test login. The Firebase Admin service account also needs the Firestore permissions used by the `generation_limits` collection.

### Routes and diagnostics

- `GET /api/health` — returns configuration booleans only; it does not test credentials against Google or execute a model.
- `GET /api/models` — returns the four current model identifiers and marks Cosmos/Qwen configured only when `HF_SPACE_ID` and the protected API secret are present.
- `POST /api/generate` — validates the Firebase ID token, applies the five-request/hour quota, then calls the selected Hugging Face task.

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

The Gradio Space source lives in `huggingface/`; `.github/workflows/sync-to-huggingface.yml` syncs only this directory to `ErikrafT/erikraft-ai`, for deployment to the Hugging Face Space. FLUX generates pixels from either a typed prompt or the prompt returned by Qwythos after multimodal reference-image interpretation. The Qwythos decorator is capped at 180 seconds because the previously configured 300 seconds was surfaced by ZeroGPU as a rejected 450-second reservation; FLUX rendering remains a separate 120-second GPU request. Actual inference can still fail if model loading, processing, memory, runtime, or provider quota exceeds available limits. Free and unlimited inference is not guaranteed.

The Space endpoint used by `@gradio/client` is `/generate_image`, with inputs in this order: prompt (string), width (integer), height (integer), steps (integer). The canonical `wrangler.jsonc` declares `HF_SPACE_ID=ErikrafT/erikraft-ai` so the value is available at Worker runtime. If the Space is hosted in another repository, update the `vars.HF_SPACE_ID` value and ensure the app exposes the expected endpoint and inputs.

## 3. Cloudflare deployment and API readiness

The static frontend is configured for Cloudflare Workers + Static Assets in the root-level `wrangler.jsonc`, with `cloudflare/worker.js` as its entry point. That canonical Wrangler file declares the runtime variable `HF_SPACE_ID=ErikrafT/erikraft-ai` under `vars`; this repository intentionally uses `wrangler.jsonc` and does not maintain a parallel `wrangler.toml`.

**End-to-end verification still required:** the Worker now contains a Worker-compatible API for Firebase identity verification, Firestore quota reservation, Gradio image upload, and the FLUX, Qwythos, Cosmos, and Qwen endpoints. It has not yet been validated with successful live requests from the production site. Test authentication, quota concurrency, video/text output formats, static asset routing, and Space runtime flags before production cutover.

For a temporary preview, use Cloudflare Workers Builds or run Wrangler from the repository root:

```bash
npm install
npx wrangler preview
```

Do not switch production traffic until preview tests pass. Validate Firebase ID tokens, Firestore quota concurrency, Gradio upload/event-stream formats for all enabled models, provider timeouts, and authenticated-response caching. Provider failures still consume the reserved quota slot in this version; a transaction-safe refund is a remaining task.

The Worker uses `FIREBASE_SERVICE_ACCOUNT_JSON` for Firebase/Firestore, **required runtime variable** `HF_SPACE_ID=ErikrafT/erikraft-ai` to select the Space, optional `HF_TOKEN` if authenticated Space access is required, and `HF_SPACE_API_SECRET` as a server-side secret for Cosmos/Qwen. The Worker intentionally has no fallback for `HF_SPACE_ID`: a missing or invalid runtime binding must fail visibly instead of silently selecting a default Space.



**Cloudflare runtime vs. build variables:** configure `HF_SPACE_ID` under **Settings → Variables and Secrets → Runtime → Production** (and Preview only if you use that environment). Entries under **Builds → Variables and Secrets** are for the build/deploy process and do not automatically become Worker runtime bindings. Duplicating a secret in the build scope does not repair a missing runtime binding. With the current build command `npx wrangler deploy`, keep secrets in the build scope only if the build/deploy process itself actually needs them; do not remove or rotate runtime secrets just because similarly named entries exist in both scopes.

The Worker requires a Cloudflare **Secret** named `FIREBASE_SERVICE_ACCOUNT_JSON` containing the full JSON contents of a Firebase service-account key for project `erikraft-account`. Set it in **Workers & Pages → erikraft-ai → Settings → Variables and Secrets** for every environment that serves the site (Production and Preview, if used), then deploy a new version. Grant that service account the minimum Firestore role needed to read/write the `generation_limits` collection; never commit the JSON or paste it into frontend configuration. After deploying, open `/api/health`: it returns configuration booleans only, never the secret. Check `firebaseServiceAccountConfigured`, `firebaseServiceAccountJsonValid`, `firebaseProjectMatches`, `hfSpaceConfigured`, and `hfSpaceIdValid`. The top-level `ok` is false if the Firebase service account is invalid/mismatched or the required runtime `HF_SPACE_ID` is missing/invalid. A green health response confirms configuration shape only; it does not test live Hugging Face inference, model loading, GPU capacity, or Gradio event-stream success. The Space exposes guarded experimental routes controlled by `ENABLE_COSMOS_VIDEO` and `ENABLE_QWEN_TEXT`. Both default to enabled in the Space source after the dependency update, unless an explicit Space environment override disables a route. Their handlers fail closed without `HF_SPACE_API_SECRET` and check runtime resources before loading. Set either variable to `false` in Space settings to disable that route. Do not expose secrets in HTML, browser JavaScript, `VITE_*` values, or the repository.

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

The model selector always exposes all four task forms: **FLUX text → image**, **Qwythos image → text → image**, **Cosmos3 Nano text → video**, and **Qwen3.8 text → text**. Cosmos and Qwen require the shared secret, feature-gate configuration, and sufficient Space runtime resources; selectable does not guarantee inference. On Vercel, `/api/models` reports backend configuration; on Cloudflare, the Worker implements the same route contract. Qwythos requires a reference image; it interprets the image and instructions into a prompt, and FLUX makes a separate request to render the result. The standalone Qwythos text-only assistant is not exposed as a separate task. Cosmos and Qwen remain guarded by backend/Space flags and runtime resource checks. Qwythos reference images are normalized in the browser and included in the `/api/generate` request; the Node.js reference handler uploads the image file to Gradio for Qwythos inference. The Cloudflare Worker now implements this path; successful live end-to-end verification is still required. The Qwythos BF16 weights require substantial memory, so see [model compatibility](huggingface/MODEL_COMPATIBILITY.md).


### Experimental image → text → image mode

The UI accepts image files the browser can decode (original file up to 12 MB), converts the selected image to JPEG (up to 3 MiB), and uploads it with user instructions. The two model stages run as separate GPU requests: Qwythos multimodal interpretation (180-second declared duration) followed by FLUX rendering (120 seconds, unchanged). The Qwythos duration is deliberately lower because the former 300-second declaration was rejected as a 450-second reservation by ZeroGPU. The image + instructions mode is still experimental; model architecture, processor compatibility, available RAM/VRAM, runtime, provider quotas, and Gradio payload handling may still cause failures. FLUX text-to-image remains available independently.

## Experimental video and text models

The model selector supports four task types: **FLUX text→image**; **Qwythos + FLUX reference image + instructions→image**; **Cosmos3 Nano text→video**; and **Qwen3.8 27B text assistant**. Cosmos and Qwen are exposed by the site only when the Worker reports the experimental API as configured. This does not prove the Space-side feature flags or available hardware are sufficient; runtime checks can still reject a request. The Worker implements `/api/models`, but it cannot independently confirm private Space flags.

- **Cosmos3 Nano** (`DuoNeural/Cosmos3-Nano-Abliterated`) is a 15.2B-parameter video model. The integration limits requests to 16 frames at 256×256 and 12 steps, declares 180 seconds of GPU time, and refuses to load unless the runtime reports at least 48 GiB total / 40 GiB free VRAM and at least 36 GiB free disk on a cold download. The upstream model reports roughly 48 GB VRAM needs, so these are guardrails, not a guarantee; do not enable on unknown or undersized free GPU hardware.
- **Qwen3.8 27B GGUF** (`0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF`) uses the roughly 9.1 GB `RVN-IQ2_XS.gguf` quantization through `llama-cpp-python==0.3.36` with `n_gpu_layers=0` (CPU only). The Space installs the prebuilt Linux CPU wheel instead of compiling `llama.cpp` at build time. It checks for about 12 GiB free RAM and 11 GiB free disk on a cold download. It should avoid using CUDA VRAM but can be slow and output quality is lower than larger quantizations.
- Both are third-party checkpoints/fine-tunes. ErikrafT did not create or train the weights. Labels like “uncensored”/“abliterated” indicate model publishers' positioning, not a guarantee that output is completely unfiltered.
- No successful live Space build, GPU inference, or CPU inference test is confirmed by this change. The public Space page currently reports **Running on Zero**. That status confirms the app process is running, not that every model can complete inference. Test each mode on the live runtime and inspect its logs before claiming production readiness.

The GitHub Actions workflow syncs the `huggingface/` directory to the Space when changes reach `main`. Opening this PR does not deploy the changes to the running Space; merging it and a successful sync workflow are required.


### Protecting experimental Space endpoints

The public Gradio Space exposes the model API schema, so Cosmos and Qwen additionally require the server-side `HF_SPACE_API_SECRET`. Set the same random secret (at least 32 characters) in the Hugging Face Space secrets and in the Cloudflare server-side environment. The server-side caller must pass it only as a hidden Gradio input; the Space validates it using constant-time comparison and fails closed when the secret is missing or invalid. Do not put it in any `NEXT_PUBLIC_*`, `VITE_*`, HTML, JavaScript bundle, or public repository file. The Space source defaults both feature flags to enabled, but each route fails closed unless the same secret is configured in the Space and Cloudflare Worker. Set the corresponding flag explicitly to `false` if you need to disable a route.
