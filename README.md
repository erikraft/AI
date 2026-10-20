# ErikrafT AI

An AI image studio with a responsive dark interface. **`aoxo/flux.1dev-abliterated`** generates images from text. **`fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated`** is used only for the image + instructions workflow: it interprets a user-provided reference image and instructions, then a separate FLUX request renders the final image. Qwythos is not exposed as a standalone text-only prompt assistant or as a native pixel generator.

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

The Gradio Space source lives in `huggingface/`; `.github/workflows/sync-to-huggingface.yml` syncs only this directory to `ErikrafT/erikraft-ai`, keeping the Python entrypoint out of Vercel's project root. FLUX generates pixels from either a typed prompt or the prompt returned by Qwythos after multimodal reference-image interpretation. The Qwythos decorator is capped at 180 seconds because the previously configured 300 seconds was surfaced by ZeroGPU as a rejected 450-second reservation; FLUX rendering remains a separate 120-second GPU request. Actual inference can still fail if model loading, processing, memory, runtime, or provider quota exceeds available limits. Free and unlimited inference is not guaranteed.

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

The model selector offers two workflows: **FLUX text-to-image**, or **Qwythos image + instructions → FLUX image generation**. In Qwythos mode, uploading a reference image is required; Qwythos interprets the image and instructions, and the website then calls the independent FLUX endpoint to render the output image. The standalone Qwythos text-only assistant has been removed. The Qwythos BF16 weights require substantial memory, so see [model compatibility](huggingface/MODEL_COMPATIBILITY.md).


### Experimental image + text mode

The UI supports uploading a PNG/JPEG/WebP reference image (up to 3 MB) with user instructions. The two model stages run as separate GPU requests: Qwythos multimodal interpretation (180-second declared duration) followed by FLUX rendering (120 seconds, unchanged). The Qwythos duration is deliberately lower because the former 300-second declaration was rejected as a 450-second reservation by ZeroGPU. The image + instructions mode is still experimental; model architecture, processor compatibility, available RAM/VRAM, runtime, provider quotas, and Gradio payload handling may still cause failures. FLUX text-to-image remains available independently.