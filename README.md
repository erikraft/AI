# ErikrafT AI

A prompt-based AI image generation website with a responsive dark interface. The image-generation model is **`aoxo/flux.1dev-abliterated`**. The same Hugging Face Space also exposes **`fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated`** as a text-only prompt-improvement assistant; it is not advertised as a second image generator.

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
                                  └── aoxo/flux.1dev-abliterated
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

The Gradio Space source lives in `huggingface/` and targets `aoxo/flux.1dev-abliterated`. The requested `fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated` checkpoint is a 9B `qwen3_5` Transformers model, not a verified drop-in Diffusers image-generation pipeline; see `huggingface/MODEL_COMPATIBILITY.md`. It must not be advertised as a second image generator unless a compatible image-generation path is implemented and tested. The workflow `.github/workflows/sync-to-huggingface.yml` syncs only this directory to `ErikrafT/erikraft-ai`, keeping the Python entrypoint out of Vercel's project root. Create a Space configured for Gradio and select eligible ZeroGPU/free hardware if available. Test an actual generation in the Space before connecting the website. FLUX is a large model and may exceed free hardware limits; GPU access, queue times, quotas, memory, and model compatibility are controlled by Hugging Face. Free and unlimited inference is not guaranteed.

The Space endpoint used by `@gradio/client` is `/generate_image`, with inputs in this order: prompt (string), width (integer), height (integer), steps (integer). If the Space is hosted in another repository, set `HF_SPACE_ID` to its `owner/space-name` and ensure the app exposes the same endpoint and inputs.

## 3. Deploy to Vercel

Import the repository into Vercel. The root is a static site and `api/generate.js` is a Node.js serverless function. Under **Project → Settings → Environment Variables**, configure:

| Variable | Required | Description |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | Full Firebase Admin service-account JSON; store only as a server secret |
| `HF_SPACE_ID` | Yes | Hugging Face Space ID in `owner/space-name` format |
| `HF_TOKEN` | If private/gated access is needed | Hugging Face access token; keep server-side |

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

The UI lists both full Hugging Face model IDs. Select `aoxo/flux.1dev-abliterated` to generate an image. Select `fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated` to rewrite/improve the prompt as text, then switch back to FLUX to render it. Qwythos has about 18.8 GB of BF16 weights before runtime overhead; the Space may require more capable hardware than the free tier provides. See [model compatibility](huggingface/MODEL_COMPATIBILITY.md).


### Experimental image + text mode

The UI supports uploading a PNG/JPEG/WebP reference image (up to 3 MB) with user instructions. The Space attempts a two-stage workflow: Qwythos multimodal image/text interpretation creates a detailed prompt, then FLUX renders the output image. This remains experimental and has not been verified end-to-end on the live Space; model architecture, processor compatibility, free-tier RAM/VRAM, GPU time, and Gradio payload handling may cause failures. The upload mode is intentionally retained in the interface and API; do not remove it merely because live inference still needs validation. FLUX text-to-image remains available independently.