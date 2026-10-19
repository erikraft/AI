# ErikrafT AI

A prompt-based AI image generation website with a responsive dark interface inspired by the visual language of [ErikrafT Wi-Fi™](https://github.com/erikraft/WiFi). The selected model is **`aoxo/flux.1dev-abliterated`**.

- **Frontend:** static HTML/CSS/JavaScript, deployable on Vercel.
- **Authentication:** Firebase Authentication with Google and GitHub providers.
- **Generation:** Hugging Face Gradio Space running the exact selected model.
- **Abuse prevention:** Firebase ID-token verification and a Firestore-backed limit of five generation requests per account per hour.
- **Cost goal:** use free tiers only. Provider quotas, availability, model compatibility, and GPU access are not guaranteed.

## Architecture

```text
Browser
  ├── Firebase Authentication (Google / GitHub)
  └── POST /api/generate + Firebase ID token
          ├── Verify token with Firebase Admin
          ├── Reserve a per-user quota slot in Firestore
          └── @gradio/client → Hugging Face Space
                                  └── aoxo/flux.1dev-abliterated
```

Vercel serves the frontend and the small API proxy. It does **not** load PyTorch or FLUX weights; the model needs compatible GPU infrastructure.

## Repository layout

- `index.html` — responsive image studio and sign-in modal.
- `assets/css/styles.css` — dark, blue-accented styling based on the ErikrafT Wi-Fi design language.
- `assets/js/app.js` — Firebase sign-in, prompt form, API request, result preview, and download.
- `assets/js/firebase-config.js.example` — public Firebase Web configuration template.
- `api/generate.js` — authenticated generation endpoint and Firestore quota enforcement.
- `app.py` and `requirements.txt` — Gradio Space entry point and Python dependencies for testing ZeroGPU.
- `vercel.json` — static-site response headers.

## 1. Configure Firebase Authentication

1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. In **Authentication → Sign-in method**, enable **Google**.
3. Enable **GitHub** and configure its OAuth Client ID and Client Secret in Firebase. Set the GitHub OAuth callback URL to the callback Firebase shows for your project.
4. Add your Vercel production and preview domains in **Authentication → Settings → Authorized domains**.
5. Create a Firestore database.
6. Copy `assets/js/firebase-config.js.example` to `assets/js/firebase-config.js` and fill in the Firebase Web App configuration.
7. The local config file is ignored by Git. The Firebase Web config is visible to browsers by design; never put a service-account JSON or OAuth client secret in it.

## 2. Configure the Hugging Face Space

The root `app.py` is the Gradio Space entry point and targets exactly `aoxo/flux.1dev-abliterated`. Create a Space configured for Gradio and select an eligible ZeroGPU/free hardware option if available. Confirm the repository root is used as the Space source.

The Space exposes `generate_image` with the following input order:

1. `prompt` (string)
2. `width` (integer)
3. `height` (integer)
4. `steps` (integer)

The API endpoint is named `/generate_image` for `@gradio/client`. Test a real generation in the Space before configuring the website. FLUX is a large model and may fail to load or run within free hardware limits. ZeroGPU eligibility, queue time, quotas, memory availability, and compatibility are controlled by Hugging Face; free and unlimited inference is not promised.

If the Space uses a separate repository, set `HF_SPACE_ID` to that Space's `owner/space-name` and copy the root `app.py` and `requirements.txt` there. Make sure its endpoint and input schema match the API proxy.

## 3. Deploy the website to Vercel

Import this repository into Vercel. The root is a static site and `api/generate.js` is a Node.js serverless function. Add these environment variables under **Project → Settings → Environment Variables**:

| Variable | Required | Description |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | Full Firebase Admin service-account JSON, stored only as a server secret |
| `HF_SPACE_ID` | Yes | Hugging Face Space ID, in `owner/space-name` format |
| `HF_TOKEN` | Only for private/gated Space access | Hugging Face access token; keep server-side |

Use a Firebase service account with the minimum permissions needed to verify ID tokens and access the Firestore quota collection. Redeploy after setting environment variables. Do not use a `NEXT_PUBLIC_` prefix for server secrets.

For local dependency installation, run:

```bash
npm install
```

There is no build step required for the static HTML frontend. Vercel deploys `api/generate.js` as the API route.

## 4. Limits and abuse prevention

- The API rejects requests without a valid Firebase ID token.
- Default quota: **5 generation requests per authenticated account per rolling hour**.
- Firestore transactions reserve quota slots across concurrent serverless invocations.
- A quota slot is reserved before contacting the model provider. Failed provider calls may consume a slot; this prevents repeated failed requests from bypassing limits.
- Account-based limits cannot fully prevent people from creating multiple accounts. Consider Firebase App Check, monitoring, stricter concurrency controls, and abuse reporting before a public launch.
- Do not send personal or confidential information in prompts. Image URLs returned by Gradio may be temporary.

## 5. Model and licensing

This project specifically targets `aoxo/flux.1dev-abliterated`. Review the model card and upstream FLUX.1-dev terms before commercial use; do not assume model metadata alone settles all applicable licensing terms.

## Status

The site UI, Firebase client integration, server-side authentication/quota flow, and Gradio client call are implemented in the repository. **A live service is not ready until Firebase, Firestore, a compatible Hugging Face Space, and Vercel environment variables are configured and an end-to-end generation is tested.** No successful production deployment or real image generation is claimed yet.
